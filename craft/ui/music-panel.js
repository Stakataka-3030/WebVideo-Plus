/* Terre-style project music timeline, using Craft's guarded controller and native chooser. */
(function(root){
 'use strict';
 function mount(container,{bridge,controller,notify=()=>{}}){
  const el=(tag,text,attrs={})=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;for(const [key,value]of Object.entries(attrs))if(key in node)node[key]=value;else node.setAttribute(key,String(value));return node};
  const panel=el('section',null,{className:'wvc-music-timeline'});container.append(panel);
  const disposers=[],clipDisposers=[],selectedDisposers=[],controls=[];let disposed=false,visible=false,busy='',abort=null,ticket=0,selected=null,story=null,snapshot=null,sourceKey='',message='',started=0,progress=null,drag=null,ghost=null,refreshTimer=null;
  const listen=(node,event,fn,list=disposers)=>{node.addEventListener?.(event,fn);list.push(()=>node.removeEventListener?.(event,fn))};
  const clock=value=>{const n=Math.max(0,Number(value)||0);return Math.floor(n/60)+':'+(n%60).toFixed(1).padStart(4,'0')};
  const identity=s=>JSON.stringify([s?.projectId,s?.path,s?.revision,s?.source]);
  const enabledTracks=()=>controller.state().music.tracks.filter(t=>t.enabled!==false);
  const endOf=tracks=>Math.max(0,...tracks.filter(t=>t.enabled!==false).map(t=>t.startSeconds+t.durationSeconds));
  const say=text=>{message=String(text||'');status.textContent=message;notify(message)};
  function button(parent,text,fn,required=[],kind='edit'){const node=el('button',text,{type:'button'});controls.push({node,required});listen(node,'click',()=>void perform(fn,kind));parent.append(node);return node}
  function number(parent,label,key){const box=el('label',null,{className:'wvc-field'}),input=el('input',null,{type:'number',value:50,min:-100,max:100,step:1,'aria-label':label});box.append(el('span',label),input);parent.append(box);controls.push({node:input,required:['previewSettings']});listen(input,'blur',()=>{if(!visible||busy)return;const value=Number(input.value);if(input.value===''||!Number.isFinite(value)||value<-100||value>100){say('请输入 -100 到 100 之间的速度');return}if(story?.settings?.[key]===value)return;void perform(async signal=>{await controller.writeSpeeds({[key]:value});await calculate(true,signal);say('预览速度已更新，故事时间已重新计算')},'measure')});return input}
  const speedRow=el('div',null,{className:'wvc-music-speeds'});panel.append(speedRow);
  const textSpeed=number(speedRow,'文字速度','textSpeed'),autoSpeed=number(speedRow,'自动放映速度','autoSpeed');
  button(speedRow,'重新计算故事时间',signal=>calculate(true,signal),['timing','previewSettings'],'measure');
  const warning=el('p','',{className:'wvc-warning',role:'status'});panel.append(warning);
  const timeline=el('div',null,{className:'wvc-music-axis-wrap','aria-label':'项目故事与音乐时间轴'});panel.append(timeline);
  const actions=el('div',null,{className:'wvc-actions'});panel.append(actions);
  button(actions,'添加音乐',async()=>{const before=new Set(controller.state().music.tracks.map(t=>t.id));await controller.addTracks(undefined,{lane:0});selected=controller.state().music.tracks.find(t=>!before.has(t.id))?.id||selected;say('音乐已加入时间轴，保持原始时长；请保存配置')},['audioImport','music','projectFiles']);
  const addPlayer=button(actions,'增加播放器行',async()=>{await controller.addPlayer();say('已增加播放器行')},['projectFiles']);
  const musicEnd=el('span','',{className:'wvc-help'});actions.append(musicEnd);
  const selectedBox=el('div',null,{className:'wvc-music-selected'});panel.append(selectedBox);
  const match=el('div',null,{className:'wvc-music-match'});panel.append(match);
  const fitButton=button(match,'调整故事速度匹配音乐',async signal=>{const result=await controller.fitToMusic({textSpeed:matchText.checked,autoSpeed:matchAuto.checked,signal,onProgress:report});acceptTiming(result);say(result.matched?'故事与音乐时长已匹配，预览速度已更新':`已完成两次校准，采用最接近结果；误差约 ${Math.abs(result.errorSeconds).toFixed(1)} 秒`)},['timing','previewSettings'],'fit');
  function check(label){const box=el('label'),input=el('input',null,{type:'checkbox',checked:true,'aria-label':label});box.append(input,document.createTextNode(label));match.append(box);controls.push({node:input,required:[]});listen(input,'change',refresh);return input}
  const matchText=check('文字速度参与匹配'),matchAuto=check('自动放映速度参与匹配');
  const status=el('p','打开后自动读取预览速度、计算故事时间并加载音乐',{className:'wvc-music-status',role:'status','aria-live':'polite'});panel.append(status);
  const busyBox=el('div',null,{className:'wvc-music-progress',hidden:true}),busyTitle=el('strong'),bar=el('progress',null,{max:1}),busyDetail=el('span'),cancel=el('button','取消计算',{type:'button'});busyBox.append(busyTitle,bar,busyDetail,cancel);panel.append(busyBox);listen(cancel,'click',()=>{stop();say('计算已取消，尚未保存的音乐配置保留');refresh()});
  const footer=el('footer'),dirty=el('span','',{className:'wvc-help'});footer.append(dirty);panel.append(footer);
  const save=button(footer,'保存配置',async()=>{await controller.saveMusic({...controller.state().music,enabled:true});say('项目成片音乐时间线已保存')},['projectFiles','music']);save.className='wvc-primary';
  function report(value){if(disposed)return;progress=value;renderProgress()}
  function renderProgress(){busyBox.hidden=!['measure','fit'].includes(busy);busyTitle.textContent=busy==='fit'?'正在匹配故事与音乐':'正在计算故事时间';if(Number.isFinite(progress?.progress))bar.value=Math.max(0,Math.min(1,progress.progress));else bar.removeAttribute('value');busyDetail.textContent=`${progress?.message||'读取当前预览与工程…'} · 已用 ${Math.floor((Date.now()-started)/1000)} 秒`}
  function stop(){ticket++;abort?.abort();abort=null;busy='';progress=null;drag=null;ghost=null;renderProgress()}
  async function perform(fn,kind='edit'){
   if(disposed||busy)return;const serial=++ticket;abort=new AbortController();const signal=abort.signal;busy=fn===null?'measure':kind;started=Date.now();progress=null;refresh();
   try{await fn(signal);if(serial!==ticket||disposed)return;refresh()}
   catch(error){if(serial===ticket&&!disposed)say(error.message||String(error))}
   finally{if(serial===ticket){busy='';abort=null;progress=null;if(!disposed)refresh()}}
  }
  function acceptTiming(result){story=result;snapshot=result.snapshot;sourceKey=identity(snapshot);textSpeed.value=result.settings.textSpeed;autoSpeed.value=result.settings.autoSpeed}
  async function calculate(force,signal){const result=await controller.measure({force,signal,onProgress:report});if(signal?.aborted||disposed)throw Error('计算已取消');acceptTiming(result);return result}
  async function initialize(force=false){
   if(!visible||disposed)return;stop();await perform(async signal=>{const current=await bridge.snapshot();if(identity(current)!==sourceKey)story=null;sourceKey=identity(current);snapshot=current;const state=controller.state();await calculate(force,signal);await controller.loadMusic();if(signal.aborted)throw Error('计算已取消');const global=story?.timing?.storyTimeline?.global;say(global===false?'当前场景无法确定唯一故事起点，时间轴从本场景开始':'项目故事时间与导出音乐已就绪')},'measure')
  }
  function refresh(){
   if(disposed)return;const state=controller.state(),caps=bridge.capabilities?.()||{};
   for(const {node,required}of controls){const missing=required.find(key=>caps[key]!==true);node.disabled=!!busy||!!missing;node.title=missing?(caps[missing+'Reason']||caps.reason||'请先打开支持的工程和游戏预览'):''}
   const end=endOf(state.music.tracks);fitButton.disabled=fitButton.disabled||!story||!end||!matchText.checked&&!matchAuto.checked;addPlayer.disabled=addPlayer.disabled||state.music.players>=64;save.disabled=save.disabled||!state.loaded;
   dirty.textContent=state.dirty?'有未保存的音乐配置':'音乐保持原始时长；同一播放器行不重叠';musicEnd.textContent='音乐结束：'+clock(end);
   const basis=story?.settings||{textSpeed:Number(textSpeed.value),autoSpeed:Number(autoSpeed.value)},chosen=Number(matchText.checked)+Number(matchAuto.checked),ratio=story?.seconds>0?end/story.seconds:1,budget=Math.max(2,102-basis.textSpeed)+Math.max(16.667,116.667-basis.autoSpeed);warning.hidden=!(story?.seconds>0&&end>0&&chosen&&Math.abs(1-ratio)*budget/chosen>30);warning.textContent='时间差距较大，请优先考虑增减音乐';
   renderTimeline();renderSelected();renderProgress();
  }
  function renderTimeline(){
   for(const remove of clipDisposers.splice(0))remove();timeline.replaceChildren();const state=controller.state(),tracks=state.music.tracks,seconds=story?.timing?.storyTimeline?.durationSeconds??story?.seconds??0,span=Math.max(1,seconds,...tracks.map(track=>track.startSeconds+track.durationSeconds));
   const scale=el('div',null,{className:'wvc-music-scale'});for(let i=0;i<6;i++)scale.append(el('span',clock(span*i/5)));timeline.append(scale);
   const storyRow=el('div',null,{className:'wvc-music-track-row'}),label=el('span','项目故事',{className:'wvc-music-lane-label'}),axis=el('div',null,{className:'wvc-music-story-axis'}),storyBar=el('div',clock(seconds),{className:'wvc-music-story-bar'});storyBar.style.width=(seconds/span*100)+'%';axis.append(storyBar);for(const scene of (story?.timing?.storyTimeline?.scenes||[]).slice(1)){const marker=el('span',null,{className:'wvc-music-scene-marker',title:scene.scene+' · '+clock(scene.startSeconds)});marker.style.left=(scene.startSeconds/span*100)+'%';axis.append(marker)}storyRow.append(label,axis);timeline.append(storyRow);
   for(let lane=0;lane<state.music.players;lane++){
    const trackRow=el('div',null,{className:'wvc-music-track-row'}),head=el('div',null,{className:'wvc-music-lane-label'}),add=el('button','添加',{type:'button',disabled:!!busy||!state.loaded,'aria-label':`播放器 ${lane+1} 添加音乐`}),remove=el('button','删除',{type:'button',disabled:!!busy||state.music.players<=1,'aria-label':`删除播放器 ${lane+1}`});head.append(el('span','播放器 '+(lane+1)),add,remove);
    listen(add,'click',()=>void perform(async()=>{await controller.addTracks(undefined,{lane});say('音乐已加入播放器 '+(lane+1)+'，原始时长不变')}),clipDisposers);
    listen(remove,'click',()=>{const count=tracks.filter(t=>t.lane===lane).length;if(count&&!root.confirm(`删除播放器 ${lane+1} 及其中 ${count} 首音乐的配置？音频文件会保留。`))return;void perform(async()=>{await controller.removePlayer(lane);if(!controller.state().music.tracks.some(t=>t.id===selected))selected=null;say('已删除播放器配置，音频文件保留')})},clipDisposers);
    const laneNode=el('div',null,{className:'wvc-music-player-lane','data-wvc-player-lane':lane});trackRow.append(head,laneNode);timeline.append(trackRow);
    const items=tracks.filter(t=>(ghost?.id===t.id?ghost.lane:t.lane)===lane);
    if(!items.length)laneNode.append(el('span','点击添加音乐',{className:'wvc-music-empty'}));
    for(const track of items){const start=ghost?.id===track.id?ghost.startSeconds:track.startSeconds,clip=el('button',track.name||track.file,{type:'button',className:'wvc-music-clip'+(selected===track.id?' active':''),title:(track.name||track.file)+' · 原长 '+clock(track.durationSeconds),'aria-label':'音乐 '+(track.name||track.file), 'data-wvc-track-id':track.id,disabled:!!busy});clip.style.left=(start/span*100)+'%';clip.style.width=(track.durationSeconds/span*100)+'%';clip.style.opacity=track.enabled===false?'.45':'1';laneNode.append(clip);
     listen(clip,'click',()=>{selected=track.id;for(const item of timeline.querySelectorAll?.('[data-wvc-track-id]')||[])item.classList.toggle('active',item.getAttribute('data-wvc-track-id')===selected);renderSelected()},clipDisposers);
     listen(clip,'pointerdown',event=>{if(event.button!==0||busy)return;event.preventDefault?.();selected=track.id;const rect=laneNode.getBoundingClientRect();drag={id:track.id,lane:track.lane,start:track.startSeconds,x:event.clientX,width:rect.width,span,duration:track.durationSeconds};clip.setPointerCapture?.(event.pointerId);renderSelected()},clipDisposers);
     listen(clip,'keydown',event=>{if(busy||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault?.();void perform(()=>controller.moveTrack(track.id,track.lane,Math.max(0,track.startSeconds+(event.key==='ArrowLeft'?-.1:.1))))},clipDisposers);
    }
   }
  }
  function renderSelected(){for(const remove of selectedDisposers.splice(0))remove();selectedBox.replaceChildren();const track=controller.state().music.tracks.find(t=>t.id===selected);selectedBox.hidden=!track;if(!track)return;selectedBox.append(el('span',(track.name||track.file)+' · 原始时长 '+clock(track.durationSeconds)));
   const box=el('label'),volume=el('input',null,{type:'number',min:0,max:100,step:1,value:track.volume,'aria-label':'所选音乐音量',disabled:!!busy});box.append(document.createTextNode('音量'),volume);selectedBox.append(box);listen(volume,'change',()=>{const value=Number(volume.value);if(!Number.isFinite(value)||value<0||value>100){say('音量需要在 0 到 100 之间');return}void perform(()=>controller.updateTrack(track.id,{volume:value}))},selectedDisposers);
   const enabledLabel=el('label'),enabled=el('input',null,{type:'checkbox',checked:track.enabled!==false,'aria-label':'所选音乐参与导出',disabled:!!busy});enabledLabel.append(enabled,document.createTextNode('参与导出'));selectedBox.append(enabledLabel);listen(enabled,'change',()=>void perform(()=>controller.updateTrack(track.id,{enabled:enabled.checked})),selectedDisposers);
   const remove=el('button','移除音乐',{type:'button',disabled:!!busy});selectedBox.append(remove);listen(remove,'click',()=>void perform(async()=>{await controller.removeTrack(track.id);selected=null;say('已移除音乐配置，音频文件保留')}),selectedDisposers);
  }
  listen(root,'pointermove',event=>{if(!drag||busy)return;const node=document.elementFromPoint?.(event.clientX,event.clientY)?.closest?.('[data-wvc-player-lane]'),lane=node?Number(node.getAttribute('data-wvc-player-lane')):drag.lane,start=Math.max(0,drag.start+(event.clientX-drag.x)/Math.max(1,drag.width)*drag.span);ghost={id:drag.id,lane,startSeconds:root.WebVideoCraftMedia.availableStart(controller.state().music.tracks,lane,start,drag.duration,drag.id)};for(const clip of timeline.querySelectorAll?.('[data-wvc-track-id]')||[])if(clip.getAttribute('data-wvc-track-id')===drag.id){clip.style.left=(ghost.startSeconds/drag.span*100)+'%';const target=timeline.querySelector?.(`[data-wvc-player-lane="${lane}"]`);if(target&&clip.parentNode!==target)target.append(clip)}});
  const finish=()=>{if(!drag)return;const final=ghost;drag=null;ghost=null;if(final)void perform(()=>controller.moveTrack(final.id,final.lane,final.startSeconds));else refresh()};listen(root,'pointerup',finish);listen(root,'pointercancel',()=>{if(!drag)return;drag=null;ghost=null;refresh()});listen(root,'blur',()=>{if(!drag)return;drag=null;ghost=null;refresh()});
  const unsubscribe=controller.subscribe?.(()=>{if(!disposed&&!drag){const current=controller.state().timing;if(current&&snapshot&&identity(current.snapshot)===identity(snapshot))acceptTiming(current);else if(snapshot&&controller.peekTiming&&!controller.peekTiming(snapshot))story=null;refresh()}});
  const stopSource=bridge.subscribe?.(()=>{if(!visible||disposed)return;if(refreshTimer!==null)clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{refreshTimer=null;try{const current=await bridge.snapshot();if(visible&&identity(current)!==sourceKey)void initialize(true)}catch(error){say(error.message)}},180)});
  const tick=setInterval(()=>{if(visible&&busy)renderProgress()},500);
  listen(root,'beforeunload',event=>{if(controller.state().dirty){event.preventDefault?.();event.returnValue=''}});
  refresh();
  return {show(value){visible=!!value;panel.hidden=!visible;if(visible)void initialize();else stop()},canLeave(){if(controller.state().busy){say('正在处理音乐，请等待或取消计算后再关闭');return false}if(controller.state().dirty){if(!root.confirm('音乐配置尚未保存，是否放弃并关闭？'))return false;controller.discardMusic?.()}stop();return true},refresh,dispose(){disposed=true;stop();clearInterval(tick);if(refreshTimer!==null)clearTimeout(refreshTimer);unsubscribe?.();stopSource?.();for(const off of [...disposers,...clipDisposers,...selectedDisposers])off();panel.remove()}};
 }
 root.WebVideoCraftMusicUI={mount};
})(typeof window!=='undefined'?window:globalThis);

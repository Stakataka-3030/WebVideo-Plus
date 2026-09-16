// Data-only scheduling. Files, processes and browser lifecycle are owned by C#.
globalThis.__buildNativeWorkload=({script,parsed,media,animations,timing,root,project,sceneName,fps})=>{
 const events=[],audio=[],videoCues=[],muteWindows=[],counts={},visualSources=new Map(),extraAnimations=new Map(),sourceLines=script.split(/\r?\n/);let cursor=0;
 const clean=(kind,name)=>String(name||'').replace(new RegExp('^\\.?/?game/'+kind+'/'),'');
 const physical=name=>decodeURIComponent(String(name||'').split(/[?#]/)[0]);
 const local=(kind,name)=>root.replaceAll('\\','/')+'/game/'+kind+'/'+physical(clean(kind,name));
 const info=(kind,name)=>media['/game/'+kind+'/'+physical(clean(kind,name))]||{durationMs:0,hasAudio:false};
 const speakerTarget=params=>{if(params.figureId)return String(params.figureId);const position=['left','center','right','left13','right13','left14','right14'].find(key=>params[key]===true||params[key]==='true');return position?'fig-'+position:null;};
 const ensureAnimation=name=>{if(!name)return 0;const frames=animations[name];if(!Array.isArray(frames))throw Error('动画文件无效：'+name);extraAnimations.set(name,frames);return frames.reduce((sum,f)=>sum+Number(f.duration||0),0);};
 for(let i=0;i<parsed.sentenceList.length;i++){
  if(timing&&Number.isFinite(timing.lineTimes[i]))cursor=timing.lineTimes[i];const s=parsed.sentenceList[i];if(s.isLineBreakHolder)continue;const cmd=s.command===0?'say':s.commandRaw,params=Object.fromEntries(s.args.map(a=>[a.key,a.value])),raw=sourceLines[i]||'';counts[cmd]=(counts[cmd]||0)+1;
  if(cmd==='comment'||!raw.trim()||raw.trim().startsWith(';'))continue;if(['changeScene','callScene','choose','jumpLabel','chooseLabel','if','getUserInput'].includes(cmd))throw Error('无法导出第'+(i+1)+'行交互命令：'+cmd);if(cmd==='end')break;
  let snippet=raw,voiceMs=0;const kind={changeBg:'background',changeFigure:'figure',miniAvatar:'figure',bgm:'bgm',playEffect:'vocal',playVideo:'video'}[cmd],name=kind?clean(kind,s.content):s.content;
  if(cmd==='bgm'||cmd==='playEffect'){scheduleAudioCommand(audio,{command:cmd,name,file:name&&name!=='none'?local(kind,name):null,atMs:cursor,durationMs:info(kind,name).durationMs,params});continue;}
  if(cmd==='say'&&params.vocal){voiceMs=info('vocal',params.vocal).durationMs;audio.push({kind:'voice',path:local('vocal',params.vocal),atMs:cursor,endMs:cursor+voiceMs,volume:Number(params.volume??100)/100,loop:false,target:speakerTarget(params)});snippet=snippet.replace(/\s+-vocal=[^;]*?(?=\s+-|;|$)/,'');}
  const namedDuration=cmd==='setAnimation'?ensureAnimation(s.content):0;if(['setTransition','changeBg','changeFigure'].includes(cmd)){ensureAnimation(params.enter);ensureAnimation(params.exit);}if(cmd==='wait'){cursor+=Math.max(0,Number(s.content)||0);continue;}
  let videoDuration=0;if(cmd==='changeBg'||cmd==='changeFigure'){const position=['left','right','left13','right13','left14','right14'].find(k=>params[k])||'center',target=cmd==='changeBg'?'bg-main':params.id||'fig-'+position,key=cmd+':'+target,changed=visualSources.get(key)!==name;visualSources.set(key,name);if(changed&&(/\.(webm|mp4|mov|mkv)([?#].*)?$/i.test(name)||/[?&]type=video(?:&|$)/i.test(name)))videoCues.push({path:'/game/'+kind+'/'+physical(name),target,atMs:Math.round(cursor),durationMs:info(kind,name).durationMs});}
  if(cmd==='playVideo'){const m=info(kind,name);videoDuration=m.durationMs;videoCues.push({path:'/game/video/'+name,target:'fullscreen',atMs:Math.round(cursor),durationMs:videoDuration});muteWindows.push({start:cursor,end:cursor+videoDuration});if(m.hasAudio)audio.push({kind:'video',path:local(kind,name),atMs:cursor,endMs:cursor+videoDuration,volume:1,loop:false});}
  events.push({atMs:Math.round(cursor),line:i+1,command:cmd,script:snippet,voiceControlled:cmd==='say'&&!!params.vocal,mouthTarget:cmd==='say'?(speakerTarget(params)):null,loads:['changeBg','changeFigure','playVideo'].includes(cmd)});if(cmd==='playVideo')events.push({atMs:Math.round(cursor+videoDuration),line:i+1,command:'__finishVideo',script:'',loads:false});if(params.next)continue;
  if(cmd==='say'){const text=s.content.replace(/\{[^}]*\}/g,'').trim();cursor+=text?Math.max(1600,text.length*1000/22+(params.notend?0:900),voiceMs):350;}else if(cmd==='playVideo')cursor+=videoDuration;else if(cmd==='intro')cursor+=s.content.split('|').length*Number(params.delayTime??1500)+1000;else if(['setTransform','setTempAnimation','setAnimation','changeBg','changeFigure'].includes(cmd)){let ms=Number(params.duration??(cmd.startsWith('change')?350:500));if(cmd==='setTempAnimation')try{ms=JSON.parse(s.content).reduce((a,f)=>a+Number(f.duration||0),0);}catch{}if(cmd==='setAnimation')ms=namedDuration;if(!params.keep)cursor+=Math.max(0,ms);}
 }
 if(timing?.playlist?.length){audio.splice(0,audio.length,...audio.filter(a=>a.kind!=='bgm'));let atMs=timing.playlistOffsetMs||0;for(const music of timing.playlist){audio.push({kind:'bgm',origin:'playlist',path:music.file,atMs,endMs:atMs+music.durationMs,volume:1,loop:false});atMs+=music.durationMs;}}
 if(timing?.controlEvents)for(const c of timing.controlEvents)events.push({atMs:Math.round(c.atMs),line:0,command:c.kind==='text-settle'?'__settleText':'__nativeNext',script:'',loads:false});const controlOrder=e=>e.command==='__settleText'?-2:e.command==='__nativeNext'?-1:0;events.sort((a,b)=>a.atMs-b.atMs||controlOrder(a)-controlOrder(b));const fullDuration=timing?.durationSeconds??(Math.ceil(Math.max(cursor,...videoCues.filter(v=>v.target==='fullscreen').map(v=>v.atMs+v.durationMs))/1000)+1);
 return {project,sceneName,sourceLines:sourceLines.length,parsedStatements:parsed.sentenceList.length,counts,fullDuration,duration:fullDuration,fps,events,audio,videoCues,muteWindows,extraAnimations:[...extraAnimations]};
};
globalThis.__finishNativeTimeline=({result,pre,settings,playlist,range})=>{
 if(Number(result.options.textSpeed)!==Number(settings.textSpeed)||Number(result.options.autoSpeed)!==Number(settings.autoSpeed))throw Error('引擎播放速度与导出设置不一致');
 const lineTimes=Array(pre.parsedStatements).fill(null);for(const e of result.events)if(e.index>=0&&e.index<lineTimes.length)lineTimes[e.index]=Math.round(e.atMs);
 let durationMs=result.durationMs,rangeStartMs=0;
 if(range){const start=range.startLine-1,end=range.endLine;const value=lineTimes.slice(start,end).find(Number.isFinite);if(value===undefined)throw Error('选区中没有实际执行的语句');rangeStartMs=value;}
 let windows=result.elastic,actualElastic=result.elastic;
 if(settings.mode==='bgm'){
  if(!playlist.length)throw Error('请至少导入一首 BGM');
  const selectedTarget=playlist.reduce((n,p)=>n+p.durationMs,0),target=rangeStartMs+selectedTarget;
  windows=range?result.elastic.filter(w=>w.startMs>=rangeStartMs&&w.line>=range.startLine-1&&w.line<range.endLine):result.elastic;
  const stretch=windows.reduce((n,w)=>n+w.endMs-w.startMs,0),minimum=durationMs-rangeStartMs-stretch;
  if(selectedTarget+1<minimum)throw Error('音乐总长 '+(selectedTarget/1000).toFixed(1)+' 秒，保留选区文字、配音和必要演出至少需要 '+(minimum/1000).toFixed(1)+' 秒；请增加音乐或缩短内容。');
  const synthetic=stretch<=0&&target>durationMs+1;if(synthetic)windows=[{startMs:durationMs,endMs:durationMs+1,line:lineTimes.length-1}];
  const total=windows.reduce((n,w)=>n+w.endMs-w.startMs,0),delta=target-durationMs;
  const map=t=>total>0?t+windows.reduce((n,w)=>n+Math.max(0,Math.min(t,w.endMs)-w.startMs)/total*delta,0):t;
  for(const event of result.controlEvents)event.atMs=Math.round(map(event.atMs));
  for(let i=0;i<lineTimes.length;i++)if(Number.isFinite(lineTimes[i]))lineTimes[i]=Math.round(map(lineTimes[i]));
  actualElastic=result.elastic.map(w=>({...w,startMs:map(w.startMs),endMs:map(w.endMs)}));if(synthetic)actualElastic.push({startMs:durationMs,endMs:target,line:lineTimes.length-1});durationMs=target;
 }
 return {schemaVersion:1,mode:settings.mode,durationSeconds:Math.ceil(durationMs*settings.fps/1000)/settings.fps,lineTimes,textSpeed:settings.textSpeed,autoSpeed:settings.autoSpeed,holdSeconds:settings.holdSeconds,playlist,playlistOffsetMs:rangeStartMs,range,controlEvents:result.controlEvents,sourceEvents:result.events,elasticWindows:actualElastic};
};

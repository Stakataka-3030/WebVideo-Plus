// Animation v1 uses cumulative durations; v2 object keyframes use absolute times.
// Keep the raw payload intact: relative/inherited tracks are compiled by its exact engine.
globalThis.__exportAnimationDuration=raw=>{
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value),valid=value=>typeof value==='number'&&value>=0?value:0;
 const v1=Array.isArray(raw)||object(raw)&&raw.version===1,frames=Array.isArray(raw)?raw:raw?.keyframes;
 if(!Array.isArray(frames))throw Error('动画文件无效');
 const records=frames.filter(object);
 return v1?records.reduce((sum,frame)=>sum+valid(frame.duration),0):Math.max(0,...records.map(frame=>valid(frame.time)));
};
// Data-only scheduling. Files, processes and browser lifecycle are owned by C#.
globalThis.__buildNativeWorkload=({script,parsed,media,animations,timing,root,project,sceneName,fps,allowDecorativePixiCuts=false,strictSegmentCuts=false})=>{
 const events=[],audio=[],videoCues=[],muteWindows=[],singleLineHints=[],softCutWindows=[],live2dLifetimes=[],exitReplay=[],counts={},visualSources=new Map(),figureIdentities=new Map(),activeLiveLifetimes=new Map(),transitionStates=new Map(),extraAnimations=new Map(),sourceLines=script.split(/\r?\n/);let cursor=0;
 const clean=(kind,name)=>String(name||'').replace(new RegExp('^\\.?/?game/'+kind+'/'),'');
 // Match URL basic-parser preprocessing before decoding; never trim decoded %20 or Unicode spaces.
 const physical=name=>decodeURIComponent(String(name||'').replace(/[\u0000-\u0020]+$/,'').replace(/[\t\n\r]/g,'').split(/[?#]/)[0]).replaceAll('\\','/');
 const local=(kind,name)=>root.replaceAll('\\','/')+'/game/'+kind+'/'+physical(clean(kind,name));
 const info=(kind,name)=>media['/game/'+kind+'/'+physical(clean(kind,name))]||{durationMs:0,hasAudio:false};
 const speakerTarget=params=>{if(params.figureId)return String(params.figureId);const position=['left','center','right','left13','right13','left14','right14'].find(key=>params[key]===true||params[key]==='true');return position?'fig-'+position:null;};
 const ensureAnimation=name=>{if(!name)return 0;const raw=animations[name];let duration;try{duration=__exportAnimationDuration(raw);}catch{throw Error('动画文件无效：'+name);}extraAnimations.set(name,raw);return duration;};
 const statementRange=(s,index)=>{
  const start=Number.isInteger(s.startLine)?s.startLine:index,end=Number.isInteger(s.endLine)?s.endLine:start;
  return {start:Math.max(0,start),end:Math.max(Math.max(0,start),Math.min(sourceLines.length-1,end))};
 };
 const statementSource=(s,index)=>{const r=statementRange(s,index);return sourceLines.slice(r.start,r.end+1).join('\n');};
 const singleLineHintDuration=(cmd,params,content,raw='')=>{if(cmd!=='choose'||Number(params.defaultChoose)!==1||params.next===true)return 0;const options=String(content||'').split(/(?<!\\)\|/);if(options.length!==1)return 0;const nodes=options[0].split(/(?<!\\):/);if(nodes.length!==2||!/^__wvp_hint_[A-Za-z0-9_]+$/.test(nodes[1].trim()))return 0;const fromArgs=Number(params.wvpHint),match=String(raw||'').match(/(?:^|\s)-wvpHint=([0-9]+(?:\.[0-9]+)?)(?=\s|;|$)/),fromSource=match?Number(match[1]):NaN,ms=Number.isFinite(fromArgs)?fromArgs:fromSource;return Number.isFinite(ms)&&ms>=100&&ms<=60000?ms:1800;};
 const sourceEvents=Array.isArray(timing?.sourceEvents)?timing.sourceEvents:[],performWindows=Array.isArray(timing?.performWindows)?timing.performWindows:[],stageExitWindows=Array.isArray(timing?.stageExitWindows)?timing.stageExitWindows:[];
 const sourceEventByIndex=new Map();for(const e of sourceEvents)if(Number.isInteger(e.index)&&!sourceEventByIndex.has(e.index))sourceEventByIndex.set(e.index,e);
 const primaryPerform=(index,cmd)=>performWindows.find(w=>w.role!=='vocal'&&Number(w.line)===index&&w.command===cmd&&w.startMs!==null&&w.startMs!==undefined&&Number.isFinite(Number(w.startMs)));
 for(let i=0;i<parsed.sentenceList.length;i++){
  if(timing&&Number.isFinite(timing.lineTimes[i]))cursor=timing.lineTimes[i];
  const s=parsed.sentenceList[i];if(s.isLineBreakHolder)continue;
  const cmd=s.command===0?'say':s.commandRaw,params=Object.fromEntries(s.args.map(a=>[a.key,a.value])),range=statementRange(s,i),raw=statementSource(s,i),hintMs=singleLineHintDuration(cmd,params,s.content,raw),sourceEvent=sourceEventByIndex.get(i),plannedPerform=primaryPerform(i,cmd);
  counts[cmd]=(counts[cmd]||0)+1;
  if(cmd==='comment'||!raw.trim()||raw.trim().startsWith(';'))continue;
  if(['changeScene','callScene','choose','jumpLabel','chooseLabel','if','getUserInput'].includes(cmd)&&!(cmd==='choose'&&hintMs))throw Error('无法导出第'+(range.start+1)+'行交互命令：'+cmd);
  if(cmd==='end')break;
  let snippet=raw,voiceMs=0;
  const kind={changeBg:'background',changeFigure:'figure',changeFigureDiff:'figure',miniAvatar:'figure',bgm:'bgm',playEffect:'vocal',playVideo:'video'}[cmd],name=kind?clean(kind,s.content):s.content;
  if(cmd==='bgm'||cmd==='playEffect'){scheduleAudioCommand(audio,{command:cmd,name,file:name&&name!=='none'?local(kind,name):null,atMs:cursor,durationMs:info(kind,name).durationMs,params});continue;}
  if(cmd==='say'&&params.vocal){
   const voiceInfo=info('vocal',params.vocal);voiceMs=Number(voiceInfo.durationMs);
   if(!Number.isFinite(voiceMs)||voiceMs<=0||voiceInfo.hasAudio===false)throw Error('配音资源未取得有效音频时长（第'+(range.start+1)+'行）：'+params.vocal);
   audio.push({kind:'voice',path:local('vocal',params.vocal),atMs:cursor,endMs:cursor+voiceMs,volume:Number(params.volume??100)/100,loop:false,target:speakerTarget(params)});
   snippet=snippet.replace(/\s+-vocal=[^;]*?(?=\s+-|;|$)/,'');
  }
  const namedDuration=cmd==='setAnimation'?ensureAnimation(s.content):0;
  if(['setTransition','changeBg','changeFigure'].includes(cmd)){ensureAnimation(params.enter);ensureAnimation(params.exit);}
  if(cmd==='setTransition'){
   const target=String(params.target??'0'),state={...(transitionStates.get(target)||{})};
   if(params.exit!==undefined)state.exitName=String(params.exit||'');
   transitionStates.set(target,state);
  }
  if(cmd==='wait'){if(!params.next)cursor+=Math.max(0,Number(s.content)||0);continue;}
  let videoDuration=0,diffFallback=false;
  if(cmd==='changeBg'||cmd==='changeFigure'||cmd==='changeFigureDiff'){
   const isFigure=cmd!=='changeBg',isDiff=cmd==='changeFigureDiff',position=['left','right','left13','right13','left14','right14'].find(k=>params[k])||'center',target=isFigure?params.id||'fig-'+position:'bg-main',key=cmd+':'+target;
   const oldIdentity=isFigure?figureIdentities.get(target):null;
   const previous=isFigure?oldIdentity?.name:visualSources.get(key),previousPresent=previous!==undefined&&previous!==null&&previous!==''&&previous!=='none';
   // The first/empty image diff delegates to ordinary changeFigure, including
   // clear, bounds and entry/exit options. Existing-image replacement ignores them.
   diffFallback=isDiff&&(!previousPresent||!name||name==='none');
   const visualName=(cmd==='changeFigure'||diffFallback)&&params.clear===true?'':name;
   // Match the supported engines' numeric bounds normalization. Diff keeps its
   // existing identity and ignores overrides; ordinary changeFigure may reload.
   const rawBounds=isDiff&&!diffFallback?'':String(params.bounds??''),boundsValues=rawBounds.split(',').map(Number);
   const parsedBounds=boundsValues.length===4&&boundsValues.every(x=>!Number.isNaN(x))?boundsValues.join(','):null;
   const defaultBounds='0,0,0,0',oldBounds=oldIdentity?.bounds??defaultBounds;
   const boundsChanged=!!rawBounds&&oldBounds!==(parsedBounds??defaultBounds);
   const changed=isFigure
    ?(!oldIdentity||oldIdentity.name!==visualName||oldIdentity.position!==position||boundsChanged)
    :previous!==visualName;
   const nextBounds=isDiff&&!diffFallback?oldBounds:changed?(parsedBounds??defaultBounds):(parsedBounds??oldBounds);
   const gone=!visualName||visualName==='none';
   const image=value=>/\.(png|jpe?g|webp|gif|bmp|avif|svg)([?#].*)?$/i.test(String(value||''));
   const unsupportedDiff=value=>{try{const url=new URL(String(value||''),'http://localhost/'),extension=url.pathname.split('.').pop().toLowerCase();return extension==='json'||extension==='skel'||url.searchParams.get('type')==='spine';}catch{return false;}};
   const diffReplacing=isDiff&&previousPresent&&!gone&&!unsupportedDiff(previous)&&!unsupportedDiff(name)&&image(previous)&&image(visualName);
   // 4.6.5 rejects a model diff before its empty/none fallback. Keep model
   // lifetimes (including unknown model-backed formats) until a real removal.
   const modelDiffRemoval=isDiff&&gone&&previousPresent&&oldIdentity?.liveRuntime&&!image(previous);
   const diffNoop=isDiff&&(unsupportedDiff(previous)||unsupportedDiff(name)||modelDiffRemoval||previousPresent&&!gone&&!diffReplacing);
   if(diffFallback&&!diffNoop){ensureAnimation(params.enter);ensureAnimation(params.exit);}
   if(changed&&previousPresent&&!diffReplacing&&!diffNoop){
    const state=transitionStates.get(target)||{},fallback=cmd==='changeBg'?1500:450;
    const exitMs=state.exitName?ensureAnimation(state.exitName):Math.max(0,Number.isFinite(Number(state.exitDuration))?Number(state.exitDuration):fallback);
    if(exitMs>0)exitReplay.push({startMs:cursor,triggerMs:cursor,endMs:cursor+exitMs,target,command:cmd==='changeBg'?'changeBg-exit':'changeFigure-exit',line:range.start+1,hold:false,dormantRestorable:false,rootReplay:false,noCut:false});
   }
   visualSources.set(key,visualName);
   if(isFigure&&diffReplacing){
    // Diff ignores position/bounds arguments and no-ops when the image is unchanged.
    if(previous!==visualName){figureIdentities.set(target,{...oldIdentity,name:visualName});softCutWindows.push({startMs:Math.round(cursor),endMs:Math.round(cursor+Math.max(0,Number(plannedPerform?.durationMs??200))),reason:'figure-diff',target,line:range.start+1});}
   }else if(isFigure&&!diffNoop){
    const liveRuntime=!gone&&(/\.(json|jsonl|wmdl)([?#].*)?$/i.test(visualName)||/[?&]type=(?:live2d|wmdl|model)(?:&|$)/i.test(visualName)||!!params.motion||!!params.skin||!!params.expression||!!params.blink||!!params.focus||!!params.animationFlag||!!params.eyesOpen||!!params.eyesClose);
    const activeLifetime=activeLiveLifetimes.get(target);
    if(activeLifetime&&(gone||!liveRuntime||changed)){
     activeLifetime.endMs=Math.round(cursor);
     if(activeLifetime.endMs>activeLifetime.startMs)live2dLifetimes.push(activeLifetime);
     activeLiveLifetimes.delete(target);
    }
    if(liveRuntime&&!activeLiveLifetimes.has(target))activeLiveLifetimes.set(target,{startMs:Math.round(cursor),endMs:null,target,source:visualName,position,bounds:nextBounds,line:range.start+1,motionEvents:[],expressionEvents:[],blinkEvents:[],focusEvents:[]});
    const currentLifetime=activeLiveLifetimes.get(target);
    // Same-identity motion writes are guarded by the engine; a repeated group
    // keeps its existing epoch, while a fresh model starts its own lifetime.
    if(currentLifetime&&(changed||params.motion||params.skin||parsedBounds!==null)){
     const group=String(params.motion??''),previousGroup=currentLifetime.motionEvents.at(-1)?.group??'';
     if(group!==previousGroup)currentLifetime.motionEvents.push({atMs:Math.round(cursor),group,index:0,priority:3,line:range.start+1});
    }
    if(currentLifetime&&params.expression!==undefined)currentLifetime.expressionEvents.push({atMs:Math.round(cursor),name:String(params.expression??''),line:range.start+1});
    if(currentLifetime&&params.blink!==undefined)currentLifetime.blinkEvents.push({atMs:Math.round(cursor),line:range.start+1});
    if(currentLifetime&&params.focus!==undefined)currentLifetime.focusEvents.push({atMs:Math.round(cursor),line:range.start+1});
    if(gone)figureIdentities.delete(target);else figureIdentities.set(target,{name:visualName,position,bounds:nextBounds,liveRuntime});
    if(liveRuntime)softCutWindows.push({startMs:Math.round(cursor),endMs:Math.round(cursor+1000),reason:'live2d-state-change',target,line:range.start+1});
   }
   if(changed&&!diffReplacing&&!diffNoop&&(/\.(webm|mp4|mov|mkv)([?#].*)?$/i.test(visualName)||/[?&]type=video(?:&|$)/i.test(visualName)))videoCues.push({path:'/game/'+kind+'/'+physical(visualName),target,atMs:Math.round(cursor),durationMs:info(kind,visualName).durationMs});
   if(changed&&!diffReplacing&&!diffNoop)transitionStates.delete(target);
   if(!gone&&!diffReplacing&&!diffNoop){
    const state={...(transitionStates.get(target)||{})};
    if(params.exit!==undefined)state.exitName=String(params.exit||'');
    state.exitDuration=Math.max(0,Number(params.exitDuration??(cmd==='changeBg'?1500:450))||0);
    transitionStates.set(target,state);
   }

  }
  if(cmd==='playVideo'){
   const m=info(kind,name);videoDuration=m.durationMs;
   videoCues.push({path:'/game/video/'+name,target:'fullscreen',atMs:Math.round(cursor),durationMs:videoDuration});
   muteWindows.push({start:cursor,end:cursor+videoDuration});
   if(m.hasAudio)audio.push({kind:'video',path:local(kind,name),atMs:cursor,endMs:cursor+videoDuration,volume:1,loop:false});
  }
  events.push({
   atMs:Math.round(cursor),
   line:range.start+1,
   sourceIndex:i,
   command:cmd,
   script:snippet,
   forwardGroup:Number.isInteger(sourceEvent?.forwardGroup)?sourceEvent.forwardGroup:null,
   plannedDurationMs:Number.isFinite(Number(plannedPerform?.durationMs))?Number(plannedPerform.durationMs):null,
   voiceControlled:cmd==='say'&&!!params.vocal,
   mouthTarget:cmd==='say'?speakerTarget(params):null,
   loads:['changeBg','changeFigure','changeFigureDiff','playVideo'].includes(cmd)
  });
  if(cmd==='playVideo')events.push({atMs:Math.round(cursor+videoDuration),line:range.start+1,sourceIndex:i,command:'__finishVideo',script:'',loads:false});
  if(hintMs){
   const end=cursor+hintMs;
   singleLineHints.push({startMs:Math.round(cursor),endMs:Math.round(end),line:range.start+1});
   events.push({atMs:Math.round(end),line:range.start+1,sourceIndex:i,command:'__singleLineEnd',script:'',loads:false});
   cursor=end;continue;
  }
  if(params.next)continue;
  if(cmd==='say'){
   const text=s.content.replace(/\{[^}]*\}/g,'').trim();
   cursor+=text?Math.max(1600,text.length*1000/22+(params.notend?0:900),voiceMs):350;
  }else if(cmd==='playVideo')cursor+=videoDuration;
  else if(cmd==='intro')cursor+=s.content.split('|').length*Number(params.delayTime??1500)+1000;
  else if(['setTransform','setTempAnimation','setAnimation','setComplexAnimation','changeBg','changeFigure','changeFigureDiff'].includes(cmd)){
   let ms=cmd==='changeFigureDiff'?Number(plannedPerform?.durationMs??(diffFallback?params.duration??350:200)):Number(params.duration??(cmd.startsWith('change')?350:500));
   if(cmd==='setTempAnimation')try{ms=__exportAnimationDuration(JSON.parse(s.content));}catch{}
   if(cmd==='setAnimation')ms=namedDuration;
   if(!params.keep)cursor+=Math.max(0,ms);
  }
 }
 if(timing?.playlist?.length){
  audio.splice(0,audio.length,...audio.filter(a=>a.kind!=='bgm'));
  let atMs=timing.playlistOffsetMs||0;
  for(const music of timing.playlist){audio.push({kind:'bgm',origin:'playlist',path:music.file,atMs,endMs:atMs+music.durationMs,volume:1,loop:false});atMs+=music.durationMs;}
 }
 if(timing?.controlEvents)for(const c of timing.controlEvents){
  const command=c.kind==='settle-nonhold'?'__settleNonHold':c.kind==='next'?'__nativeNext':null;
  if(command)events.push({atMs:Math.round(c.atMs),line:0,command,script:'',loads:false});
 }
 const controlOrder=e=>e.command==='__singleLineEnd'?-4:e.command==='__settleNonHold'?-3:e.command==='__nativeNext'?-2:e.command==='__finishVideo'?-1:0;
 events.sort((a,b)=>a.atMs-b.atMs||controlOrder(a)-controlOrder(b));
 const fullDuration=timing?.durationSeconds??(Math.ceil(Math.max(cursor,...videoCues.filter(v=>v.target==='fullscreen').map(v=>v.atMs+v.durationMs))/1000)+1),fullDurationMs=fullDuration*1000;
 const replayWindows=[];
 for(const lifetime of activeLiveLifetimes.values()){
  lifetime.endMs=Math.round(fullDurationMs);
  if(lifetime.endMs>lifetime.startMs)live2dLifetimes.push(lifetime);
 }
 live2dLifetimes.sort((a,b)=>a.startMs-b.startMs||String(a.target).localeCompare(String(b.target)));
 const dynamicCommands=new Set(['say','setTransform','setTempAnimation','setAnimation','setComplexAnimation','changeBg','changeFigure','changeFigureDiff','playVideo','intro','pixiPerform']);
 const dormantHoldCommands=new Set(['setTransform','setTempAnimation','setAnimation']);
 const decorativePixiNames=new Set(['rain','snow','heavySnow','cherryBlossoms']),relaxedDecorativePixi=[];
 for(const w of performWindows){
  if(w.role==='vocal'||!dynamicCommands.has(w.command))continue;
  const hasStart=w.startMs!==null&&w.startMs!==undefined&&Number.isFinite(Number(w.startMs)),hasStop=w.stopMs!==null&&w.stopMs!==undefined&&Number.isFinite(Number(w.stopMs));
  const start=hasStart?Number(w.startMs):NaN,stop=hasStop?Number(w.stopMs):NaN,duration=Math.max(0,Number(w.durationMs)||0);
  if(!hasStart||start<0||start>=fullDurationMs)continue;
  if(w.command==='pixiPerform'){
   const sentence=parsed.sentenceList?.[Number(w.line)],name=String(sentence?.content||'').trim();
   if(allowDecorativePixiCuts&&decorativePixiNames.has(name)){relaxedDecorativePixi.push({name,startMs:start,endMs:hasStop?stop:fullDurationMs,line:Number(w.line)+1});continue;}
  }
  let end;
  if(w.command==='pixiPerform'&&w.hold)end=hasStop?stop:fullDurationMs;
  else if(w.hold&&dormantHoldCommands.has(w.command)){
   end=start+duration;
   if(hasStop)end=Math.min(end,stop);
  }else end=hasStop?stop:start+duration;
  end=Math.min(fullDurationMs,end);
  // Native transform timelines integrate shared RAF deltas. Rebuild that driver
  // history at a cut inside an animation instead of starting with a new phase.
  if(Number.isFinite(end)&&end>start+.01)replayWindows.push({startMs:start,endMs:end,command:w.command,line:Number(w.line)+1,hold:!!w.hold,dormantRestorable:!!(w.hold&&dormantHoldCommands.has(w.command)),rootReplay:dormantHoldCommands.has(w.command),noCut:w.command==='pixiPerform'||w.command==='say'});
 }
 const resolvedExitReplay=[],usedStageExits=new Set();
 for(const window of exitReplay){
  const match=stageExitWindows.find((actual,index)=>{
   if(usedStageExits.has(index)||actual.startMs===null||actual.startMs===undefined)return false;
   const target=String(actual.target||''),expected=String(window.target||'');
   return Math.abs(Number(actual.startMs)-Number(window.triggerMs??window.startMs))<=2&&(!expected||target.startsWith(expected));
  });
  if(match){
   const index=stageExitWindows.indexOf(match);usedStageExits.add(index);
   const end=match.stopMs!==null&&match.stopMs!==undefined&&Number.isFinite(Number(match.stopMs))?Number(match.stopMs):fullDurationMs;
   resolvedExitReplay.push({...window,endMs:end});
  }else resolvedExitReplay.push(window);
 }
 stageExitWindows.forEach((actual,index)=>{
  if(usedStageExits.has(index)||actual.startMs===null||actual.startMs===undefined||!Number.isFinite(Number(actual.startMs)))return;
  const end=actual.stopMs!==null&&actual.stopMs!==undefined&&Number.isFinite(Number(actual.stopMs))?Number(actual.stopMs):fullDurationMs;
  resolvedExitReplay.push({startMs:Number(actual.startMs),triggerMs:Number(actual.startMs),endMs:end,target:String(actual.target||''),command:'stage-exit',line:0,hold:false,dormantRestorable:false,rootReplay:false,noCut:false});
 });
 for(const window of resolvedExitReplay){
  const start=Math.max(0,Number(window.startMs)||0),end=Math.min(fullDurationMs,Number(window.endMs)||0);
  if(end>start+.01)replayWindows.push({...window,startMs:start,endMs:end});
 }
 // Motion changes can retain parameters from earlier motions and automatic idle.
 // Prefix fast-preview skips earlier model updates and cached motion state.
 // Replay the scene history to preserve native sampling and saved pose/physics.
 // This adds warmup only; manual cut positions and concurrency stay unchanged.
 for(const lifetime of live2dLifetimes){
  if(!lifetime.motionEvents.some(event=>Number(event.atMs)>Number(lifetime.startMs)+.01))continue;
  const exitEnd=resolvedExitReplay.filter(window=>Math.abs(Number(window.triggerMs??window.startMs)-Number(lifetime.endMs))<=2&&String(window.target||'').startsWith(String(lifetime.target||''))).reduce((end,window)=>Math.max(end,Number(window.endMs)||0),Number(lifetime.endMs));
  replayWindows.push({startMs:Number(lifetime.startMs),endMs:Math.min(fullDurationMs,exitEnd),target:lifetime.target,command:'live2d-motion-history',line:lifetime.line,hold:false,dormantRestorable:false,rootReplay:true,noCut:false});
 }
 return {project,sceneName,sourceLines:sourceLines.length,parsedStatements:parsed.sentenceList.length,counts,fullDuration,duration:fullDuration,fps,events,audio,videoCues,muteWindows,singleLineHints,softCutWindows,live2dLifetimes,replayWindows,relaxedDecorativePixi,strictSegmentCuts:!!strictSegmentCuts,extraAnimations:[...extraAnimations]};
};

globalThis.__finishNativeTimeline=({result,pre,settings,playlist,range})=>{
 if(Number(result.options.textSpeed)!==Number(settings.textSpeed)||Number(result.options.autoSpeed)!==Number(settings.autoSpeed))throw Error('引擎播放速度与导出设置不一致');
 const sourceEvents=(result.events||[]).map(e=>({...e})),performWindows=(result.performWindows||[]).map(w=>({...w,params:w.params?{...w.params}:w.params})),stageExitWindows=(result.stageExitWindows||[]).map(w=>({...w}));
 const lineTimes=Array(pre.parsedStatements).fill(null);for(const e of sourceEvents)if(e.index>=0&&e.index<lineTimes.length)lineTimes[e.index]=Math.round(e.atMs);
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
  for(const event of sourceEvents)event.atMs=Math.round(map(event.atMs));
  for(const window of performWindows){
   if(window.startMs===null||window.startMs===undefined||!Number.isFinite(Number(window.startMs)))continue;
   const start=Number(window.startMs),mappedStart=map(start),duration=Math.max(0,Number(window.durationMs)||0);
   if(window.stopMs!==null&&window.stopMs!==undefined&&Number.isFinite(Number(window.stopMs))){
    const stop=Number(window.stopMs);
    if(window.hold)window.stopMs=map(stop);
    else window.stopMs=stop<start+duration-1?map(stop):mappedStart+duration;
   }
   window.startMs=mappedStart;
  }
  for(const window of stageExitWindows){
   if(window.startMs===null||window.startMs===undefined||!Number.isFinite(Number(window.startMs)))continue;
   const start=Number(window.startMs),mappedStart=map(start);
   if(window.stopMs!==null&&window.stopMs!==undefined&&Number.isFinite(Number(window.stopMs)))window.stopMs=mappedStart+Math.max(0,Number(window.stopMs)-start);
   window.startMs=mappedStart;
  }
  for(let i=0;i<lineTimes.length;i++)if(Number.isFinite(lineTimes[i]))lineTimes[i]=Math.round(map(lineTimes[i]));
  actualElastic=result.elastic.map(w=>({...w,startMs:map(w.startMs),endMs:map(w.endMs)}));
  if(synthetic)actualElastic.push({startMs:durationMs,endMs:target,line:lineTimes.length-1});
  durationMs=target;
 }
 return {schemaVersion:1,mode:settings.mode,durationSeconds:Math.ceil(durationMs*settings.fps/1000)/settings.fps,lineTimes,textSpeed:settings.textSpeed,autoSpeed:settings.autoSpeed,holdSeconds:settings.holdSeconds,playlist,playlistOffsetMs:rangeStartMs,range,controlEvents:result.controlEvents,sourceEvents,performWindows,stageExitWindows,elasticWindows:actualElastic,blockedPrematureAutoNext:Number(result.blockedPrematureAutoNext)||0,visualNotendWaitFloors:result.visualNotendWaitFloors||[]};
};

// With GPU DOM compositing, draw the stage only at the final composite step.
// Re-rendering WMDL Live2D models without an intervening update can lose clipping masks.
globalThis.__exportTextSettleApplies=(ownerKey,currentKey,force=false)=>!!force||(ownerKey!==null&&ownerKey!==undefined&&String(ownerKey)===String(currentKey));
globalThis.__exportInstallTextSettleGuard=textSettleEvent=>{
  if(!textSettleEvent||textSettleEvent.__webvideoTextSettleGuarded)return;
  const nativeEmit=textSettleEvent.emit.bind(textSettleEvent);
  textSettleEvent.emit=(message,id)=>{
    if(!globalThis.__exportTextSettleApplies(globalThis.__exportTextSettleOwnerToken,globalThis.__exportActiveSayToken,globalThis.__exportForceTextSettle))return;
    return nativeEmit(message,id);
  };
  textSettleEvent.__webvideoTextSettleGuarded=true;
};
globalThis.__exportDialogueMutationSerial=0;
globalThis.__exportDialogueObserver=null;
globalThis.__exportDialogueWaitDiagnostics=[];
globalThis.__exportEnsureDialogueObserver=()=>{
  if(globalThis.__exportDialogueObserver)return;
  const observer=new MutationObserver(records=>{
    for(const record of records){
      const target=record.target instanceof Element?record.target:record.target?.parentElement;
      const nodes=[...(record.addedNodes||[]),...(record.removedNodes||[])];
      const touchesBox=!!target?.closest?.('#textBoxMain')||nodes.some(node=>node instanceof Element&&(node.id==='textBoxMain'||node.querySelector?.('#textBoxMain')));
      if(touchesBox){
        globalThis.__exportDialogueMutationSerial++;
        break;
      }
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  globalThis.__exportDialogueObserver=observer;
};
globalThis.__exportDialogueCharCount=text=>{
  try{return __wgProbe.compileText(String(text??''),3).reduce((sum,item)=>sum+(item?.length??0),0);}
  catch{return String(text??'').length;}
};
globalThis.__exportBeginDialogueTransition=()=>{
  globalThis.__exportEnsureDialogueObserver();
  globalThis.__exportDialoguePending={
    serial:globalThis.__exportDialogueMutationSerial,
    targetKey:null,
    targetText:'',
    targetCount:0
  };
};
globalThis.__exportSetDialogueTarget=()=>{
  const pending=globalThis.__exportDialoguePending;if(!pending)return;
  const stage=__wgProbe.stageManager.getCalculationStageState?.();
  pending.targetKey=String(stage?.currentDialogKey??'');
  pending.targetText=String(stage?.showText??'');
  pending.targetCount=globalThis.__exportDialogueCharCount(pending.targetText);
};
globalThis.__exportDialogueDomReady=(allowStable=false)=>{
  const pending=globalThis.__exportDialoguePending;
  if(!pending)return true;
  if(!pending.targetText)return true;
  const stage=__wgProbe.stageManager.getCalculationStageState?.();
  if(String(stage?.currentDialogKey??'')!==pending.targetKey||String(stage?.showText??'')!==pending.targetText)return false;
  const box=document.getElementById('textBoxMain');if(!box)return false;
  const count=box.querySelectorAll('span[id]').length;
  if(count<pending.targetCount)return false;
  return !!allowStable||globalThis.__exportDialogueMutationSerial>pending.serial;
};
globalThis.__exportDialogueDomSnapshot=()=>{
  const pending=globalThis.__exportDialoguePending,stage=__wgProbe.stageManager.getCalculationStageState?.(),box=document.getElementById('textBoxMain');
  const stageKey=String(stage?.currentDialogKey??''),stageText=String(stage?.showText??''),targetText=String(pending?.targetText??''),boxText=String(box?.textContent??''),spanCount=box?.querySelectorAll?.('span[id]')?.length||0,textElementCount=box?.querySelectorAll?.('.Textelement_start')?.length||0;
  const preview=text=>String(text??'').slice(0,240),codePoints=text=>[...String(text??'')].slice(0,120).map(ch=>'U+'+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'));
  return {
    pending:!!pending,
    targetKeyMatches:!pending||stageKey===String(pending.targetKey??''),
    targetTextMatches:!pending||stageText===targetText,
    targetCount:Number(pending?.targetCount)||0,
    targetTextLength:targetText.length,
    stageTextLength:stageText.length,
    boxPresent:!!box,
    spanCount,
    textElementCount,
    boxTextLength:boxText.length,
    mutationSerial:Number(globalThis.__exportDialogueMutationSerial)||0,
    pendingSerial:Number(pending?.serial)||0,
    readyStrict:globalThis.__exportDialogueDomReady(false),
    readyStable:globalThis.__exportDialogueDomReady(true),
    targetText:preview(targetText),
    stageText:preview(stageText),
    boxText:preview(boxText),
    targetCodePoints:codePoints(targetText),
    stageCodePoints:codePoints(stageText),
    boxCodePoints:codePoints(boxText)
  };
};
globalThis.__exportFinishDialogueTransition=()=>{
  if(globalThis.__gpuDomState){
    globalThis.__gpuDomState.dirty=true;
    globalThis.__gpuDomState.dirtyReason='dialogue';
  }
  globalThis.__exportDialoguePending=null;
  return true;
};
globalThis.__exportWaitDialogueDom=async(options={})=>{
  const allowStable=!!options?.allowStable,configured=Number(options?.timeoutMs),timeoutMs=Number.isFinite(configured)?Math.max(0,configured):2500;
  const pending=globalThis.__exportDialoguePending;if(!pending||globalThis.__exportDialogueDomReady(allowStable))return true;
  return await new Promise((resolve,reject)=>{
    let done=false,cancelTimeout=()=>{};
    const finish=(value,error=null)=>{if(done)return;done=true;observer.disconnect();try{cancelTimeout();}catch{}if(error)reject(error);else resolve(value);};
    const check=()=>{if(globalThis.__exportDialogueDomReady(allowStable))finish(true);};
    const observer=new MutationObserver(check);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    const onTimeout=()=>{
      if(globalThis.__exportDialogueDomReady(allowStable)){finish(true);return;}
      const snapshot=globalThis.__exportDialogueDomSnapshot(),mutationObserved=snapshot.mutationSerial>snapshot.pendingSerial,stageMatches=snapshot.targetKeyMatches&&snapshot.targetTextMatches,fallback=!allowStable&&mutationObserved&&stageMatches;
      const diagnostic={frame:Number(globalThis.__exportCurrentFrame??-1),timeoutMs,mutationObserved,stageMatches,outcome:fallback?'fallback':'error',...snapshot};
      globalThis.__exportDialogueWaitDiagnostics.push(diagnostic);
      if(fallback){finish(false);return;}
      finish(false,new Error('对白 DOM 同步超时：'+JSON.stringify(diagnostic)));
    };
    const realSetTimeout=globalThis.__pwClock?.controller?._embedder?.setTimeout;
    if(typeof realSetTimeout==='function')cancelTimeout=realSetTimeout(onTimeout,timeoutMs);
    else{const timer=setTimeout(onTimeout,timeoutMs);cancelTimeout=()=>clearTimeout(timer);}
    queueMicrotask(check);
  });
};
globalThis.__exportRestoredDialogueReady=()=>globalThis.__exportDialogueDomReady(true);
globalThis.__exportLive2DLifetimeAt=(lifetimes,target,timeMs)=>{
  const key=String(target??''),time=Number(timeMs);if(!Number.isFinite(time))return null;
  let best=null;
  for(const item of Array.isArray(lifetimes)?lifetimes:[]){
    if(String(item?.target??'')!==key)continue;
    const start=Number(item?.startMs),end=Number(item?.endMs);
    if(!Number.isFinite(start)||time<start-.01||(Number.isFinite(end)&&time>=end-.01))continue;
    if(!best||start>Number(best.startMs))best=item;
  }
  return best;
};
globalThis.__exportHash32=value=>{
  const text=String(value??'');let hash=2166136261>>>0;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}
  hash^=hash>>>16;hash=Math.imul(hash,2246822507)>>>0;hash^=hash>>>13;hash=Math.imul(hash,3266489909)>>>0;return (hash^(hash>>>16))>>>0;
};
globalThis.__exportResolveCubism2Idle=(entries,ageMs,key)=>{
  const valid=(Array.isArray(entries)?entries:[]).map(x=>({index:Number(x.index),durationMs:Number(x.durationMs),loop:!!x.loop})).filter(x=>Number.isInteger(x.index)&&Number.isFinite(x.durationMs)&&x.durationMs>0);
  if(!valid.length)return null;
  let remaining=Math.max(0,Number(ageMs)||0),previous=null;
  for(let step=0;step<100000;step++){
    const candidates=valid.length>1&&previous!==null?valid.filter(x=>x.index!==previous):valid;
    const hash=globalThis.__exportHash32(String(key??'')+'|idle|'+step),pick=candidates[Math.min(candidates.length-1,Math.floor((hash/4294967296)*candidates.length))];
    if(!pick)return null;
    if(pick.loop)return {index:pick.index,offsetMs:remaining%pick.durationMs,durationMs:pick.durationMs,loop:true,step};
    if(remaining<pick.durationMs)return {index:pick.index,offsetMs:remaining,durationMs:pick.durationMs,loop:false,step};
    remaining-=pick.durationMs;previous=pick.index;
  }
  return null;
};
globalThis.__exportCubism2MotionEpoch=(lifetime,timeMs)=>{
  const time=Number(timeMs);if(!lifetime||!Number.isFinite(time))return null;
  let best=null;
  for(const event of Array.isArray(lifetime.motionEvents)?lifetime.motionEvents:[]){
    const at=Number(event?.atMs);if(!Number.isFinite(at)||at>time+.01)continue;
    if(!best||at>=Number(best.atMs))best=event;
  }
  return best;
};
globalThis.__exportCubism2QueueTimingKeys=(motion,entry)=>{
  if(!motion||!entry||typeof motion.updateParam!=='function')return null;
  const source=Function.prototype.toString.call(motion.updateParam),ordered=[],seen=new Set();
  for(const match of source.matchAll(/\.([_$A-Za-z][_$A-Za-z0-9]*)/g)){
    const key=match[1];if(seen.has(key)||!Object.prototype.hasOwnProperty.call(entry,key))continue;
    seen.add(key);ordered.push(key);
  }
  const negative=ordered.filter(key=>typeof entry[key]==='number'&&entry[key]<0);
  return negative.length>=3?{start:negative[0],fade:negative[1],end:negative[2]}:null;
};
globalThis.__exportProbeCubism2QueueTimingKeys=(motion,entry,coreModel,coreNow)=>{
  if(!motion||!entry||!coreModel||typeof motion.updateParam!=='function'||!Number.isFinite(Number(coreNow)))return null;
  const before={};
  for(const key of Object.keys(entry))if(typeof entry[key]==='number'&&Number.isFinite(entry[key]))before[key]=entry[key];
  try{motion.updateParam(coreModel,entry);}catch{return null;}
  const starts=[],ends=[],now=Number(coreNow);
  for(const key of Object.keys(before)){
    const from=Number(before[key]),to=Number(entry[key]);
    if(!(from<0)||!Number.isFinite(to)||to<0)continue;
    if(Math.abs(to-now)<=1000)starts.push(key);
    else if(to>now+1)ends.push({key,value:to});
  }
  if(starts.length<2)return null;
  ends.sort((a,b)=>a.value-b.value);
  return {starts,end:ends[0]?.key??null};
};
globalThis.__exportRebaseCubism2QueueEntry=(motion,entry,coreNow,state,coreModel=null)=>{
  globalThis.__exportRebaseCubism2QueueEntry.lastMode='';
  if(!entry||!Number.isFinite(Number(coreNow))||!state)return false;
  const start=Number(coreNow)-Number(state.offsetMs||0),end=state.loop?-1:start+Number(state.durationMs||0);
  if(typeof entry.setStartTimeMSec==='function'){
    entry.setStartTimeMSec(start);entry.setFadeInStartTimeMSec?.(start);entry.setEndTimeMSec?.(end);
    globalThis.__exportRebaseCubism2QueueEntry.lastMode='public';return true;
  }
  const keys=globalThis.__exportCubism2QueueTimingKeys(motion,entry);
  if(keys){
    entry[keys.start]=start;entry[keys.fade]=start;entry[keys.end]=end;
    globalThis.__exportRebaseCubism2QueueEntry.lastMode='source';return true;
  }
  const probed=globalThis.__exportProbeCubism2QueueTimingKeys(motion,entry,coreModel,coreNow);
  if(!probed)return false;
  for(const key of probed.starts)entry[key]=start;
  if(probed.end)entry[probed.end]=end;
  if(typeof motion.updateParam==='function')try{motion.updateParam(coreModel,entry);}catch{}
  globalThis.__exportRebaseCubism2QueueEntry.lastMode='probe';return true;
};
globalThis.__installNativeRendering=({events,envelopes,fps,firstSimulationFrame=0,timingMode='auto',textSpeed=50,live2dLifetimes=[]})=>{
  const pc=__wgProbe.core.gameplay.performController,arrange=pc.arrangeNewPerform;
  const dormantHoldCommands=new Set(['setAnimation','setTempAnimation','setTransform']);
  globalThis.__exportCurrentEvent=null;
  globalThis.__exportBatchCollecting=false;
  globalThis.__exportInstallTextSettleGuard(__wgProbe.core.events.textSettle);
  globalThis.__exportLive2DLifetimes=Array.isArray(live2dLifetimes)?live2dLifetimes:[];
  globalThis.__exportCurrentSimulationMs=Math.max(0,Number(firstSimulationFrame)||0)*1000/Math.max(1,Number(fps)||1);
  const deterministicLive2D=new WeakSet();
  let live2dBindingPending=true;
  const cubism2Entries=async(manager,group)=>{
    if(!group)return [];
    const cache=manager.__webVideoMotionEntries||(manager.__webVideoMotionEntries=new Map());
    if(!cache.has(group))cache.set(group,(async()=>{
      const defs=manager.definitions?.[group];if(!Array.isArray(defs)||!defs.length)return [];
      return (await Promise.all(defs.map(async(_,index)=>{
        const motion=await manager.loadMotion(group,index);if(!motion)return null;
        const duration=Number(motion.getDurationMSec?.()),loopDuration=Number(motion.getLoopDurationMSec?.()),declaredLoop=typeof motion.isLoop==='function'?motion.isLoop():null,loop=declaredLoop===true||(!(duration>0)&&loopDuration>0),span=loop&&loopDuration>0?loopDuration:(duration>0?duration:loopDuration);
        return Number.isFinite(span)&&span>0?{index,durationMs:span,loop,motion}:null;
      }))).filter(Boolean);
    })());
    return await cache.get(group);
  };
  const resolveCubism2State=async(manager,target,lifetime,nowMs)=>{
    if(!lifetime||!Number.isFinite(Number(nowMs)))return null;
    const epoch=globalThis.__exportCubism2MotionEpoch(lifetime,nowMs);
    let idleStart=Number(lifetime.startMs)||0;
    if(epoch){
      const epochTime=Math.round(Math.ceil(Number(epoch.atMs)*fps/1000-.000001)*1000/fps);
      const group=String(epoch.group??'');
      if(group){
        const entries=await cubism2Entries(manager,group),index=Number.isInteger(Number(epoch.index))?Number(epoch.index):0,selected=entries.find(x=>x.index===index);
        if(!selected)return null;
        const elapsed=Math.max(0,Math.round(nowMs)-epochTime);
        if(selected.loop)return {kind:'explicit',group,index,priority:Number(epoch.priority)||3,offsetMs:elapsed%selected.durationMs,durationMs:selected.durationMs,loop:true,motion:selected.motion,originMs:Number(epoch.atMs)};
        if(elapsed<selected.durationMs)return {kind:'explicit',group,index,priority:Number(epoch.priority)||3,offsetMs:elapsed,durationMs:selected.durationMs,loop:false,motion:selected.motion,originMs:Number(epoch.atMs)};
        idleStart=epochTime+selected.durationMs;
      }else idleStart=epochTime;
    }
    const group=manager.groups?.idle,entries=await cubism2Entries(manager,group);
    const scheduleKey=target+'|'+Number(lifetime.startMs)+'|'+String(lifetime.source||'')+'|'+idleStart;
    const state=globalThis.__exportResolveCubism2Idle(entries,Math.max(0,Math.round(nowMs)-idleStart),scheduleKey);
    if(!state)return null;
    const selected=entries.find(x=>x.index===state.index);if(!selected)return null;
    return {...state,kind:'idle',group,priority:1,motion:selected.motion,originMs:idleStart};
  };
  // Rebuild only saved motion parameters for a completed non-looping motion.
  // Do not restart a static model or replay rendered frames from its birth.
  const restoreCompletedCubism2Motion=async(manager,core,target,lifetime,nowMs)=>{
    if(!lifetime||typeof MotionQueueManager==='undefined'||typeof UtSystem==='undefined')return false;
    const idleDefs=manager.definitions?.[manager.groups?.idle];if(Array.isArray(idleDefs)&&idleDefs.length)return false;
    const epochs=(lifetime.motionEvents||[]).filter(e=>Number(e.atMs)<=nowMs+.01).sort((a,b)=>Number(a.atMs)-Number(b.atMs));
    if(!epochs.length||!epochs[epochs.length-1].group)return false;
    const motions=[];
    for(const epoch of epochs){const entries=await cubism2Entries(manager,String(epoch.group||'')),selected=entries.find(e=>e.index===(Number(epoch.index)||0));if(epoch.group&&!selected)return false;motions.push({epoch,selected});}
    const last=motions[motions.length-1];if(!last.selected||last.selected.loop||nowMs<Number(last.epoch.atMs)+last.selected.durationMs)return false;
    const seen=new WeakSet();
    const findDefinitions=(obj,depth=0)=>{if(!obj||typeof obj!=='object'||seen.has(obj)||depth>4)return null;seen.add(obj);if(Array.isArray(obj)){if(obj.length&&obj.every(x=>x&&typeof x.getDefaultValue==='function'&&typeof x.getParamID==='function'))return obj;return null;}for(const value of Object.values(obj)){const found=findDefinitions(value,depth+1);if(found)return found;}return null;};
    const definitions=findDefinitions(core.getModelImpl?.());if(!definitions)return false;
    const context=core.getModelContext(),values=new Map(),touched=new Set();
    const indexOf=id=>typeof id==='number'?id:core.getParamIndex(String(id));
    const put=(index,value)=>{const v=Math.max(context.getParamMin(index),Math.min(context.getParamMax(index),Number(value)||0));values.set(index,Math.fround(v));touched.add(index);};
    for(const def of definitions)put(indexOf(def.getParamID()),def.getDefaultValue());
    for(const param of manager.settings?.initParams||[])put(indexOf(param.id),param.value);
    const proxyContext={getParamFloat:index=>values.get(index)||0,getParamMin:index=>context.getParamMin(index),getParamMax:index=>context.getParamMax(index)};
    const proxy={getParamIndex:indexOf,getParamFloat:id=>values.get(indexOf(id))||0,getModelContext:()=>proxyContext,setParamFloat:(id,value,weight=1)=>{const index=indexOf(id),old=values.get(index)||0;put(index,old*(1-weight)+Number(value)*weight);}};
    const queue=new MotionQueueManager(),originalTime=UtSystem.getUserTimeMSec;let replayNow=0,replayFrames=0;
    try{
      UtSystem.getUserTimeMSec=()=>replayNow;
      for(let i=0;i<motions.length;i++){
        const {epoch,selected}=motions[i];queue.stopAllMotions();if(!selected)continue;
        const motion=Object.assign(Object.create(Object.getPrototypeOf(selected.motion)),selected.motion);
        const first=Math.ceil(Number(epoch.atMs)*fps/1000-.000001),next=i+1<motions.length?Math.ceil(Number(motions[i+1].epoch.atMs)*fps/1000-.000001):Math.floor(nowMs*fps/1000)+1;
        queue.startMotion(motion);
        for(let frame=first;frame<next;frame++){
          replayNow=Math.round(frame*1000/fps);queue.updateParam(proxy);replayFrames++;
          if(queue.isFinished())break;
          if(replayFrames>200000)throw new Error('Cubism2 completed-motion replay exceeded bound');
        }
      }
    }finally{UtSystem.getUserTimeMSec=originalTime;queue.stopAllMotions();}
    manager.stopAllMotions?.();for(const index of touched)core.setParamFloat(index,values.get(index));core.saveParam();
    manager.__webVideoIdleSeekLast={target,startMs:Number(lifetime.startMs),group:String(last.epoch.group),index:last.selected.index,kind:'completed',originMs:Number(last.epoch.atMs),offsetMs:last.selected.durationMs,rebased:true,rebaseMode:'terminal-replay',replayFrames};
    return true;
  };

  const seekCubism2State=async(manager,queue,coreModel,target,lifetime,nowMs)=>{
    const state=await resolveCubism2State(manager,target,lifetime,nowMs);if(!state)return await restoreCompletedCubism2Motion(manager,coreModel,target,lifetime,nowMs);
    manager.stopAllMotions?.();
    const ok=await manager.startMotion(state.group,state.index,state.priority);if(!ok)return false;
    const after=Array.from(queue.motions||[]),entry=after[after.length-1];
    const coreNow=typeof UtSystem!=='undefined'&&typeof UtSystem.getUserTimeMSec==='function'?Number(UtSystem.getUserTimeMSec()):Number(Date.now());
    const rebased=globalThis.__exportRebaseCubism2QueueEntry(state.motion,entry,coreNow,state,coreModel);
    if(!rebased&&typeof state.motion?.setOffsetMSec==='function')state.motion.setOffsetMSec(Math.max(0,Math.round(state.offsetMs)));
    manager.__webVideoIdleSeekLast={target,startMs:Number(lifetime.startMs),group:state.group,index:state.index,offsetMs:state.offsetMs,kind:state.kind,originMs:state.originMs,rebased,rebaseMode:String(globalThis.__exportRebaseCubism2QueueEntry.lastMode||'')};
    return true;
  };
  globalThis.__exportSeekCubism2Current=seekCubism2State;
  const bindLive2DDeterminism=async()=>{
    const stage=__wgProbe.core.gameplay.pixiStage,objects=stage?.getAllStageObj?.()||stage?.figureObjects||[];
    for(const obj of objects){
      if(obj?.sourceType!=='live2d')continue;
      const target=String(obj.key??'');
      for(const model of obj.pixiContainer?.children||[]){
        const inner=model?.internalModel;if(!inner||deterministicLive2D.has(inner))continue;
        deterministicLive2D.add(inner);
        const breath=inner.breath;
        if(breath&&typeof breath.updateParameters==='function'&&typeof breath._currentTime==='number'){
          const original=breath.updateParameters.bind(breath);
          breath.updateParameters=(core,dt)=>{
            const nowMs=Number(globalThis.__exportCurrentSimulationMs),lifetime=globalThis.__exportLive2DLifetimeAt(globalThis.__exportLive2DLifetimes,target,nowMs),delta=Math.max(0,Number(dt)||0);
            if(lifetime&&Number.isFinite(nowMs)){
              const ageSeconds=Math.max(0,(nowMs-Number(lifetime.startMs))/1000);
              breath._currentTime=ageSeconds-delta;
            }
            return original(core,dt);
          };
          breath.__webVideoAbsoluteModelAge=true;
        }
        // Cubism2 has an implicit breath oscillator even without a motion/idle group.
        if(!breath&&typeof inner.updateNaturalMovements==='function'){
          inner.__webVideoAbsoluteNaturalAge=true;
          const originalNatural=inner.updateNaturalMovements.bind(inner);
          inner.updateNaturalMovements=(dt,time)=>{const nowMs=Number(globalThis.__exportCurrentSimulationMs),lifetime=globalThis.__exportLive2DLifetimeAt(globalThis.__exportLive2DLifetimes,target,nowMs);return originalNatural(dt,lifetime?Math.max(0,nowMs-Number(lifetime.startMs)):time);};
        }
        const manager=inner.motionManager,queue=manager?.queueManager;
        if(!breath&&manager&&queue&&typeof manager.startRandomMotion==='function'&&typeof manager.loadMotion==='function'){
          const originalRandom=manager.startRandomMotion.bind(manager);
          manager.startRandomMotion=async(group,priority)=>{
            const nowMs=Number(globalThis.__exportCurrentSimulationMs),lifetime=globalThis.__exportLive2DLifetimeAt(globalThis.__exportLive2DLifetimes,target,nowMs);
            if(group!==manager.groups?.idle||!lifetime)return originalRandom(group,priority);
            if(manager.__webVideoIdleSeekPending)return manager.__webVideoIdleSeekPending;
            const task=(async()=>{
              const state=await resolveCubism2State(manager,target,lifetime,nowMs);
              if(!state||state.kind!=='idle')return originalRandom(group,priority);
              return await seekCubism2State(manager,queue,inner.coreModel,target,lifetime,nowMs);
            })();
            manager.__webVideoIdleSeekPending=task;
            try{return await task;}finally{manager.__webVideoIdleSeekPending=null;}
          };
          manager.__webVideoDeterministicIdle=true;
          const nowMs=Number(globalThis.__exportCurrentSimulationMs),lifetime=globalThis.__exportLive2DLifetimeAt(globalThis.__exportLive2DLifetimes,target,nowMs);
          if(lifetime)await seekCubism2State(manager,queue,inner.coreModel,target,lifetime,nowMs);
        }
      }
    }
  };
  globalThis.__exportBindLive2DDeterminism=bindLive2DDeterminism;
  globalThis.__exportRequestLive2DBind=()=>{live2dBindingPending=true;};
  globalThis.__exportLive2DDiagnostics=()=>{
    const stage=__wgProbe.core.gameplay.pixiStage,objects=stage?.getAllStageObj?.()||stage?.figureObjects||[],rows=[];
    for(const obj of objects){
      if(obj?.sourceType!=='live2d')continue;
      const target=String(obj.key??''),children=obj.pixiContainer?.children||[];
      for(let index=0;index<children.length;index++){
        const inner=children[index]?.internalModel;if(!inner)continue;
        const manager=inner.motionManager,blink=inner.eyeBlink,physics=inner.physics;
        rows.push({target,index,runtime:inner.breath?'cubism4':'cubism2',motionSeek:manager?.__webVideoIdleSeekLast?{...manager.__webVideoIdleSeekLast}:null,naturalAgeAligned:!!inner.__webVideoAbsoluteNaturalAge,physicsHairs:Array.isArray(physics?.physicsHairs)?physics.physicsHairs.length:0,eyeBlink:blink?{state:Number(blink.eyeState),value:Number(blink.eyeParamValue),nextMs:Number(blink.nextBlinkTimeLeft)}:null});
      }
    }
    return rows;
  };

  pc.arrangeNewPerform=function(perform,script,...rest){
    const current=globalThis.__exportCurrentEvent,command=script.command===0?'say':script.commandRaw;
    if(globalThis.__exportControlledSpeech&&script.command===0)perform.startFunction=()=>{};
    if(script.command===0&&current?.command==='say'&&Number.isFinite(Number(current.plannedDurationMs)))perform.duration=Math.max(0,Number(current.plannedDurationMs));
    if(script.command===0){
      const ownerToken=(globalThis.__exportSayTokenCounter=(globalThis.__exportSayTokenCounter||0)+1),stop=perform.stopFunction;
      globalThis.__exportActiveSayToken=ownerToken;
      perform.stopFunction=()=>{
        const previous=globalThis.__exportTextSettleOwnerToken;
        globalThis.__exportTextSettleOwnerToken=ownerToken;
        try{return stop?.();}
        finally{globalThis.__exportTextSettleOwnerToken=previous;}
      };
    }
    // Prefix fast-preview restores the terminal stage state of completed -keep animations.
    // Keep the hold perform identity so later commands can unmount it, but do not restart
    // an already-finished animation at the replay anchor.
    if(globalThis.__exportPrefixRestore&&perform.isHoldOn&&dormantHoldCommands.has(command))perform.startFunction=()=>{};
    return arrange.call(this,perform,script,...rest);
  };

  const markTextSettled=()=>{
    const state=globalThis.__gpuDomState;
    if(!state)return;
    state.textSettled=true;
    state.settledMaskPrepared=false;
    const els=[...document.querySelectorAll('.Textelement_start')],values=els.map(x=>Math.max(0,Math.min(1,Number(getComputedStyle(x).opacity)||0)));
    state.stats.settleEvents=state.stats.settleEvents||[];
    state.stats.settleEvents.push({frame:globalThis.__exportCurrentFrame??-1,count:els.length,averageOpacity:values.length?values.reduce((a,b)=>a+b,0)/values.length:1,minOpacity:values.length?Math.min(...values):1,maxOpacity:values.length?Math.max(...values):1});
  };
  __wgProbe.core.events.textSettle.on(markTextSettled);

  const runScriptEvent=e=>{
    if(e.command==='say'){
      globalThis.__exportBeginDialogueTransition();
      if(globalThis.__gpuDomState){globalThis.__gpuDomState.textSettled=false;globalThis.__gpuDomState.settledMaskPrepared=false;}
      globalThis.__exportSetSpeechMode(e.mouthTarget,e.voiceControlled);
    }
    globalThis.__exportCurrentEvent=e;
    globalThis.__exportControlledSpeech=e.voiceControlled;
    try{__probeCommands['preview.command.run-snippet']({snippet:e.script});}
    finally{globalThis.__exportControlledSpeech=false;globalThis.__exportCurrentEvent=null;}
    if(e.command==='say')globalThis.__exportSetDialogueTarget();
    if(!globalThis.__exportBatchCollecting)__wgProbe.stageManager.commit({applyPixiEffects:false});
  };

  globalThis.__runExportEvent=e=>{
    // Legacy cached plans may still contain this event. New plans rely on the actual
    // owner perform's stopFunction instead, which prevents stale text-settle leakage.
    if(e.command==='__settleText')return;
    if(e.command==='__settleNonHold'){
      if(pc.hasUnsettledNonHoldPerform())pc.settleNonHoldPerforms(false);
      return;
    }
    if(e.command==='__nativeNext'){
      if(timingMode==='auto'&&pc.performList.some(p=>p.blockingAuto?.()))return;
      __wgProbe.core.events.userInteractNext.emit();
      if(!pc.hasBlockingNextPerform()&&pc.hasUnsettledNonHoldPerform())pc.settleNonHoldPerforms(false);
      return;
    }
    if(e.command==='__singleLineEnd'){pc.unmountPerform('choose');return;}
    if(e.command==='__finishVideo'){__exportMedia.finishFullscreen();return;}
    runScriptEvent(e);
  };

  globalThis.__runExportScriptGroup=group=>{
    if(group.length<=1){if(group.length)__runExportEvent(group[0]);return;}
    pc.beginCollectingPerforms();
    globalThis.__exportBatchCollecting=true;
    try{for(const event of group)__runExportEvent(event);}
    finally{globalThis.__exportBatchCollecting=false;pc.endCollectingPerforms();}
    __wgProbe.stageManager.commit({applyPixiEffects:false});
    pc.commitPendingPerforms();
    __wgProbe.stageManager.applyCommittedPixiEffects?.();
  };

  const controlled=new Set(),states=new Map(),levels=new Map(),bound=new WeakSet();
  globalThis.__exportApplyLip=l=>{if(globalThis.__mygoApplyLip){__mygoApplyLip(l);return;}if(!l.active&&!controlled.has(l.target))return;if(l.active){if(!controlled.has(l.target))states.delete(l.target);controlled.add(l.target);levels.set(l.target,l.value);}else{controlled.delete(l.target);levels.delete(l.target);if(l.target===globalThis.__exportCurrentSimulatedTarget)return;}const p=__wgProbe.core.gameplay.pixiStage,obj=p.getStageObjByKey(l.target);if(!obj)return;globalThis.__exportWritingVoice=true;try{p.setModelMouthY(l.target,l.active?50+50*l.value:0);}finally{globalThis.__exportWritingVoice=false;}if(obj.sourceType==='live2d'){for(const model of obj.pixiContainer?.children||[]){const inner=model.internalModel;if(inner&&!bound.has(inner)){bound.add(inner);inner.on('beforeModelUpdate',()=>{if(!levels.has(l.target))return;const value=levels.get(l.target),core=inner.coreModel;core.setParamFloat?.('PARAM_MOUTH_OPEN_Y',value);core.setParameterValueById?.('ParamMouthOpenY',value);});}}}if(obj.sourceType==='img'){const state=l.value>.6?'open':l.value>.2?'half_open':'closed',s=__wgProbe.stageManager.getCalculationStageState(),item=s.figureAssociatedAnimation.find(x=>x.targetId===l.target),key=state==='half_open'?'halfOpen':state==='closed'?'close':'open',url=item?.mouthAnimation?.[key],cacheKey=obj.uuid+':'+url;if(url&&states.get(l.target)!==cacheKey){states.set(l.target,cacheKey);p.performMouthSyncAnimation(l.target,item,state,'center');}}};
globalThis.__stepExportFrame=async({t,elapsed,batch,lips})=>{
  globalThis.__exportCurrentSimulationMs=Number(t)||0;
  // Queue timestamps and motion phase must describe the same (already advanced) frame.
  if(elapsed>0)await __pwClock.controller.runFor(elapsed);
  if(live2dBindingPending){await bindLive2DDeterminism();live2dBindingPending=false;}
  for(let i=0;i<batch.length;){
    const event=batch[i];
    if(!String(event.command||'').startsWith('__')&&Number.isInteger(event.forwardGroup)){
      const group=[event];let j=i+1;
      while(j<batch.length&&!String(batch[j].command||'').startsWith('__')&&batch[j].forwardGroup===event.forwardGroup){group.push(batch[j]);j++;}
      __runExportScriptGroup(group);i=j;
    }else{__runExportEvent(event);i++;}
  }
  if(batch.length)await __pwClock.controller.runFor(0);
  if(globalThis.__exportDialoguePending){
    await globalThis.__exportWaitDialogueDom();
    globalThis.__exportFinishDialogueTransition();
  }
  if(batch.some(e=>e.loads)){await __exportWaitForStageAssets();await bindLive2DDeterminism();live2dBindingPending=false;}
  for(const a of document.getAnimations()){if(!__exportAnimations.has(a)){__exportAnimations.set(a,t);a.pause();}a.currentTime=Math.max(0,t-__exportAnimations.get(a));}
  const p=__wgProbe.core.gameplay.pixiStage;
  for(const l of lips)__exportApplyLip(l);
  await __exportMedia.sync(t);
  __exportRefreshMouth();
  if(!globalThis.__gpuDomState)p.currentApp.render();
  globalThis.__exportRecordMouth(t);
  globalThis.__inspectFirstFrame?.(t);
};

globalThis.__gpuReadbackRendererScale=(width,height)=>{const p=__wgProbe.core.gameplay.pixiStage,app=p.currentApp,gl=app.renderer.gl,stage=app.stage;if(!globalThis.__gpuReadbackRendererOriginal)globalThis.__gpuReadbackRendererOriginal={width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,stageScaleX:stage.scale.x,stageScaleY:stage.scale.y};const logicalWidth=Number(p.stageWidth)||globalThis.__gpuReadbackRendererOriginal.width,logicalHeight=Number(p.stageHeight)||globalThis.__gpuReadbackRendererOriginal.height;app.renderer.resize(width,height);stage.scale.set(globalThis.__gpuReadbackRendererOriginal.stageScaleX*width/logicalWidth,globalThis.__gpuReadbackRendererOriginal.stageScaleY*height/logicalHeight);app.render();return {mode:'renderer-scale',logicalWidth,logicalHeight,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,stageScaleX:stage.scale.x,stageScaleY:stage.scale.y,originalWidth:globalThis.__gpuReadbackRendererOriginal.width,originalHeight:globalThis.__gpuReadbackRendererOriginal.height};};
globalThis.__gpuDomState=null;
globalThis.__gpuDomInstall=()=>{if(globalThis.__gpuDomState)return {installed:true};const state={dirty:true,dirtyReason:'initial',suppress:false,captures:0,animationTimes:new WeakMap(),videoTimes:new WeakMap(),container:null,baseSprite:null,textboxContainer:null,textboxSprite:null,textSprite:null,baseTexture:null,textboxTexture:null,textTexture:null,maskSprite:null,maskTexture:null,maskGraphics:null,textEntries:[],textboxRoot:null,textSettled:false,settledMaskPrepared:false,atlasPlan:null,atlasActive:false,atlasPageTextures:[],textAtlasContainer:null,introTextContainer:null,textAtlasSprites:[],textClipGraphics:null,atlasStyleRestores:[],atlasObserverPaused:false,stats:{mutation:0,animation:0,video:0,ignoredInfiniteAnimations:0,handledTextAnimationSamples:0,handledTextboxAnimationSamples:0,handledIntroOpacitySamples:0,introActiveFrames:0,introAtlasEntries:0,baseOnlyAnimationSamples:0,fullAnimationSamples:0,baseOnlyVideoSamples:0,fullVideoSamples:0,baseOnlyRefreshes:0,fullRefreshes:0,capturePlanSamples:0,lastAnimation:null,lastVideo:null,maskFrames:0,atlasRefreshes:0,atlasPages:0,atlasEntries:0,settleEvents:[],textTransitions:[]}};const excluded=element=>element?.id==='pixiCanvas'||!!element?.closest?.('#ebg,#ebgOverlay,.html-body__effect-background,.html-body__effect-background-overlay');state.excluded=excluded;state.getTextboxRoot=()=>document.getElementById('textBoxMain')?.parentElement||null;state.markTextElements=()=>{for(const element of document.querySelectorAll('.Textelement_start'))element.setAttribute('data-gpu-text-char','1');const intro=document.getElementById('introContainer'),introStyle=intro?getComputedStyle(intro):null,introActive=!!(intro&&introStyle&&introStyle.display!=='none'&&introStyle.visibility!=='hidden'&&Number(introStyle.opacity)!==0),desired=new Set(),viewportWidth=Math.max(1,window.innerWidth||document.documentElement.clientWidth||1),viewportHeight=Math.max(1,window.innerHeight||document.documentElement.clientHeight||1);if(introActive){const wrapper=intro.firstElementChild?.firstElementChild;for(const element of [...(wrapper?.children||[])]){if(!(element instanceof Element))continue;const rect=element.getBoundingClientRect(),animations=element.getAnimations?.()||[];if(rect.width<=.1||rect.height<=.1||rect.width>=viewportWidth-8||rect.height>=viewportHeight-8||animations.length===0)continue;let opacityOnly=true;for(const animation of animations){const props=__gpuDomAnimationProperties(animation);if(props.length===0||!props.every(p=>p==='opacity')){opacityOnly=false;break;}}if(opacityOnly)desired.add(element);}}let changed=false;for(const element of document.querySelectorAll('[data-gpu-intro-text="1"]')){if(desired.has(element))continue;element.removeAttribute('data-gpu-intro-text');if(!element.classList?.contains('Textelement_start'))element.removeAttribute('data-gpu-text-char');changed=true;}for(const element of desired){if(!element.hasAttribute('data-gpu-intro-text')){element.setAttribute('data-gpu-intro-text','1');element.setAttribute('data-gpu-text-char','1');changed=true;}}state.introActive=introActive;state.stats.introAtlasEntries=desired.size;if(changed&&!state.suppress){state.dirty=true;state.dirtyReason='intro-atlas';}};const observer=new MutationObserver(records=>{if(state.suppress)return;for(const record of records){const target=record.target instanceof Element?record.target:record.target?.parentElement;if(excluded(target))continue;state.dirty=true;state.dirtyReason='mutation';state.stats.mutation++;break;}});observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','src','value']});state.observer=observer;globalThis.__gpuDomState=state;return {installed:true};};
globalThis.__gpuDomAnimationProperties=animation=>{const props=new Set();for(const frame of animation.effect?.getKeyframes?.()||[])for(const key of Object.keys(frame))if(!['offset','computedOffset','easing','composite'].includes(key))props.add(key);return [...props];};
globalThis.__gpuDomCaptureScopeForTarget=(state,target,props=[])=>{const textbox=state.textboxRoot;if(textbox&&(target===textbox||textbox.contains(target)||target.contains?.(textbox)))return 'full';const style=getComputedStyle(target),position=style.position||'',paintOnly=new Set(['opacity','transform','translate','rotate','scale','filter','clipPath','webkitClipPath','backgroundColor','backgroundPosition','backgroundPositionX','backgroundPositionY','color','boxShadow','textShadow']);return (position==='absolute'||position==='fixed'||(props.length>0&&props.every(p=>paintOnly.has(p))))?'base':'full';};
globalThis.__gpuDomCapturePlan=()=>{const state=globalThis.__gpuDomState||(__gpuDomInstall(),globalThis.__gpuDomState);state.textboxRoot=state.getTextboxRoot();state.markTextElements();state.stats.capturePlanSamples++;if(state.dirty){const plan={needed:true,scope:'full',reason:state.dirtyReason||'mutation'};state.lastCapturePlan=plan;return plan;}let baseReason=null;for(const animation of document.getAnimations()){const target=animation.effect?.target;if(!(target instanceof Element)||state.excluded(target))continue;const props=__gpuDomAnimationProperties(animation);if((target.classList?.contains('Textelement_start')||target.hasAttribute?.('data-gpu-text-char'))&&(props.length===0||props.every(p=>p==='opacity'))){state.stats.handledTextAnimationSamples++;if(target.hasAttribute?.('data-gpu-intro-text'))state.stats.handledIntroOpacitySamples++;continue;}if(target===state.textboxRoot&&props.length>0&&props.every(p=>p==='opacity')){state.stats.handledTextboxAnimationSamples++;continue;}const rect=target.getBoundingClientRect(),style=getComputedStyle(target);if(rect.width<=0||rect.height<=0||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;const timing=animation.effect?.getComputedTiming?.();if(timing?.iterations===Infinity){state.stats.ignoredInfiniteAnimations++;continue;}const now=Number(animation.currentTime)||0,old=state.animationTimes.get(animation);state.animationTimes.set(animation,now);if(old===undefined||Math.abs(now-old)>.01){const scope=__gpuDomCaptureScopeForTarget(state,target,props),info={tag:String(target.tagName||''),id:String(target.id||''),className:String(target.className?.baseVal??target.className??''),properties:props,scope};state.stats.animation++;state.stats.lastAnimation=info;if(scope==='full'){state.stats.fullAnimationSamples++;state.dirtyReason='animation';const plan={needed:true,scope:'full',reason:'animation',detail:info};state.lastCapturePlan=plan;return plan;}state.stats.baseOnlyAnimationSamples++;baseReason=info;}}for(const video of document.querySelectorAll('video')){if(state.excluded(video))continue;const rect=video.getBoundingClientRect(),style=getComputedStyle(video);if(rect.width<=0||rect.height<=0||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;const now=Number(video.currentTime)||0,old=state.videoTimes.get(video);state.videoTimes.set(video,now);if(old===undefined||Math.abs(now-old)>.00001){const scope=__gpuDomCaptureScopeForTarget(state,video,['video-frame']),info={tag:'VIDEO',id:String(video.id||''),className:String(video.className||''),scope};state.stats.video++;state.stats.lastVideo=info;if(scope==='full'){state.stats.fullVideoSamples++;state.dirtyReason='video';const plan={needed:true,scope:'full',reason:'video',detail:info};state.lastCapturePlan=plan;return plan;}state.stats.baseOnlyVideoSamples++;if(!baseReason)baseReason=info;}}if(baseReason){state.dirtyReason=baseReason.tag==='VIDEO'?'video':'animation';const plan={needed:true,scope:'base',reason:state.dirtyReason,detail:baseReason};state.lastCapturePlan=plan;return plan;}const plan={needed:false,scope:'none',reason:''};state.lastCapturePlan=plan;return plan;};
globalThis.__gpuDomCaptureNeeded=()=>!!__gpuDomCapturePlan().needed;

globalThis.__gpuDomPrepareTextAtlas=()=>{
  const state=globalThis.__gpuDomState||(__gpuDomInstall(),globalThis.__gpuDomState);
  state.textboxRoot=state.getTextboxRoot();state.markTextElements();
  for(const element of document.querySelectorAll('[data-gpu-atlas-page]')){element.removeAttribute('data-gpu-atlas-page');element.removeAttribute('data-gpu-atlas-index');}
  for(const element of document.querySelectorAll('[data-gpu-atlas-unclip]'))element.removeAttribute('data-gpu-atlas-unclip');
  const all=[...document.querySelectorAll('[data-gpu-text-char="1"]')],elements=all.filter(element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return rect.width>.1&&rect.height>.1&&style.display!=='none'&&style.visibility!=='hidden';});
  const viewportWidth=Math.max(1,Math.round(window.innerWidth||document.documentElement.clientWidth||1)),viewportHeight=Math.max(1,Math.round(window.innerHeight||document.documentElement.clientHeight||1)),gap=4,entries=[];
  let page=0,x=gap,y=gap,rowHeight=0,supported=true;
  for(let index=0;index<elements.length;index++){
    const element=elements[index],rect=element.getBoundingClientRect(),style=getComputedStyle(element),unit=Math.max(12,Number.parseFloat(style.fontSize)||0,rect.height),desiredBleed=Math.ceil(Math.max(24,Math.min(160,unit*1.25))),maxBleed=Math.floor(Math.min((viewportWidth-gap*2-rect.width)/2,(viewportHeight-gap*2-rect.height)/2));
    if(maxBleed<4){supported=false;break;}
    const bleed=Math.max(4,Math.min(desiredBleed,maxBleed)),tileWidth=Math.ceil(rect.width+bleed*2),tileHeight=Math.ceil(rect.height+bleed*2);
    if(tileWidth>viewportWidth-gap*2||tileHeight>viewportHeight-gap*2){supported=false;break;}
    if(x+tileWidth>viewportWidth-gap){x=gap;y+=rowHeight+gap;rowHeight=0;}
    if(y+tileHeight>viewportHeight-gap){page++;x=gap;y=gap;rowHeight=0;}
    const entry={element,index,page,tileX:x,tileY:y,tileWidth,tileHeight,bleed,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}};
    element.setAttribute('data-gpu-atlas-page',String(page));element.setAttribute('data-gpu-atlas-index',String(index));entries.push(entry);x+=tileWidth+gap;rowHeight=Math.max(rowHeight,tileHeight);
  }
  let clipRect=null;
  if(supported&&elements.length){
    for(let ancestor=elements[0].parentElement;ancestor;ancestor=ancestor.parentElement){
      if(!elements.every(element=>ancestor.contains(element)))continue;
      const style=getComputedStyle(ancestor),clips=['hidden','clip','auto','scroll'].includes(style.overflowX)||['hidden','clip','auto','scroll'].includes(style.overflowY);
      if(clips){
        const clipPath=style.clipPath||style.webkitClipPath||'none',maskImage=style.maskImage||style.webkitMaskImage||'none';
        if((clipPath&&clipPath!=='none')||(maskImage&&maskImage!=='none')){supported=false;break;}
        ancestor.setAttribute('data-gpu-atlas-unclip','1');
        const r=ancestor.getBoundingClientRect(),next={left:r.left,top:r.top,right:r.right,bottom:r.bottom};
        if(!clipRect)clipRect=next;else clipRect={left:Math.max(clipRect.left,next.left),top:Math.max(clipRect.top,next.top),right:Math.min(clipRect.right,next.right),bottom:Math.min(clipRect.bottom,next.bottom)};
      }
      if(ancestor===state.textboxRoot)break;
    }
  }
  if(!supported){
    for(const element of elements){element.removeAttribute('data-gpu-atlas-page');element.removeAttribute('data-gpu-atlas-index');}
    for(const element of document.querySelectorAll('[data-gpu-atlas-unclip]'))element.removeAttribute('data-gpu-atlas-unclip');
  }
  if(clipRect&&(clipRect.right<=clipRect.left||clipRect.bottom<=clipRect.top))clipRect=null;
  state.atlasPlan={supported,viewportWidth,viewportHeight,pages:supported&&entries.length?page+1:0,entries:supported?entries:[],clipRect:supported?clipRect:null};
  state.stats.atlasPages=state.atlasPlan.pages;state.stats.atlasEntries=state.atlasPlan.entries.length;
  return {supported:state.atlasPlan.supported,pages:state.atlasPlan.pages,entries:state.atlasPlan.entries.length,viewportWidth,viewportHeight,clipRect:state.atlasPlan.clipRect};
};
globalThis.__gpuDomPositionAtlasPage=page=>{
  const state=globalThis.__gpuDomState,plan=state?.atlasPlan;if(!state||!plan?.supported)return false;
  state.atlasStyleRestores=[];
  const solve=(a,b,c,d,dx,dy)=>{const det=a*d-b*c;if(Math.abs(det)<1e-6)return [dx,dy];return [(dx*d-b*dy)/det,(a*dy-dx*c)/det];};
  for(const entry of plan.entries){
    if(entry.page!==page)continue;
    const element=entry.element;if(!element?.isConnected)continue;
    state.atlasStyleRestores.push({element,cssText:element.style.cssText});
    try{
      const computed=getComputedStyle(element),baseLeft=Number.isFinite(Number.parseFloat(computed.left))?Number.parseFloat(computed.left):0,baseTop=Number.isFinite(Number.parseFloat(computed.top))?Number.parseFloat(computed.top):0,targetLeft=entry.tileX+entry.bleed,targetTop=entry.tileY+entry.bleed;
      element.style.setProperty('position','relative','important');element.style.setProperty('left',baseLeft+'px','important');element.style.setProperty('top',baseTop+'px','important');
      const r0=element.getBoundingClientRect();
      element.style.setProperty('left',(baseLeft+1)+'px','important');const rx=element.getBoundingClientRect();
      element.style.setProperty('left',baseLeft+'px','important');element.style.setProperty('top',(baseTop+1)+'px','important');const ry=element.getBoundingClientRect();
      const a=rx.left-r0.left,b=ry.left-r0.left,c=rx.top-r0.top,d=ry.top-r0.top,[dx,dy]=solve(a,b,c,d,targetLeft-r0.left,targetTop-r0.top);
      let left=baseLeft+dx,top=baseTop+dy;element.style.setProperty('left',left+'px','important');element.style.setProperty('top',top+'px','important');
      const rf=element.getBoundingClientRect();const correction=solve(a,b,c,d,targetLeft-rf.left,targetTop-rf.top);left+=correction[0];top+=correction[1];element.style.setProperty('left',left+'px','important');element.style.setProperty('top',top+'px','important');
    }catch{}
  }
  document.documentElement.getBoundingClientRect();return true;
};

globalThis.__gpuDomStats=()=>{const state=globalThis.__gpuDomState;return state?{captures:state.captures,dirtyReason:state.dirtyReason,textEntries:state.textEntries?.length||0,textboxPresent:!!state.textboxRoot,atlasActive:!!state.atlasActive,atlasPages:state.atlasPlan?.pages||0,dialogueWaitDiagnostics:globalThis.__exportDialogueWaitDiagnostics||[],...state.stats}:null;};
globalThis.__gpuDomBeginCapture=mode=>{const state=globalThis.__gpuDomState||(__gpuDomInstall(),globalThis.__gpuDomState),atlasMatch=/^atlas:(\d+)$/.exec(String(mode||''));state.suppress=true;if(atlasMatch){try{state.observer?.disconnect();state.atlasObserverPaused=true;}catch{}}state.textboxRoot=state.getTextboxRoot();state.markTextElements();
// Snapshot before capture CSS changes inheritance. Keep hidden descendants hidden,
// including template stroke layers, without suppressing explicitly visible children.
state.captureVisibility=state.textboxRoot?[state.textboxRoot,...state.textboxRoot.querySelectorAll('*')].map(element=>({element,value:getComputedStyle(element).visibility,previous:element.getAttribute('data-gpu-capture-visibility')})):[];
for(const entry of state.captureVisibility)entry.element.setAttribute('data-gpu-capture-visibility',entry.value);
if(state.textboxRoot)state.textboxRoot.setAttribute('data-gpu-textbox-root','1');let style=document.getElementById('__gpu_dom_capture_style');if(!style){style=document.createElement('style');style.id='__gpu_dom_capture_style';document.head.appendChild(style);}const stageMode=mode==='stage',common=stageMode?'html,body,#root,.App{background:transparent!important;}#root *{visibility:hidden!important;}#root #pixiCanvas{visibility:visible!important;}#ebg,#ebgOverlay,.html-body__effect-background,.html-body__effect-background-overlay{visibility:hidden!important;}':'html,body,#root,.App{background:transparent!important;}#pixiCanvas,#ebg,#ebgOverlay,.html-body__effect-background,.html-body__effect-background-overlay{visibility:hidden!important;}';const base='[data-gpu-textbox-root="1"],[data-gpu-textbox-root="1"] *{visibility:hidden!important;}#root [data-gpu-intro-text="1"],#root [data-gpu-intro-text="1"] *{visibility:hidden!important;}';const textbox='#root *{visibility:hidden!important;}#root [data-gpu-textbox-root="1"],#root [data-gpu-textbox-root="1"] *{visibility:visible!important;}#root [data-gpu-textbox-root="1"]{opacity:1!important;}#root [data-gpu-textbox-root="1"] [data-gpu-text-char="1"],#root [data-gpu-textbox-root="1"] [data-gpu-text-char="1"] *{visibility:hidden!important;}';const finalText='#root *{visibility:hidden!important;}#root [data-gpu-textbox-root="1"]{opacity:1!important;}#root [data-gpu-text-char="1"],#root [data-gpu-text-char="1"] *{visibility:visible!important;}#root [data-gpu-text-char="1"]{opacity:1!important;}';const preserve='#root [data-gpu-capture-visibility="hidden"],#root [data-gpu-text-char="1"] [data-gpu-capture-visibility="hidden"]{visibility:hidden!important;}#root [data-gpu-capture-visibility="collapse"],#root [data-gpu-text-char="1"] [data-gpu-capture-visibility="collapse"]{visibility:collapse!important;}';let atlas='';if(atlasMatch){const page=Number(atlasMatch[1]);__gpuDomPositionAtlasPage(page);atlas='#root *{visibility:hidden!important;}#root [data-gpu-textbox-root="1"]{opacity:1!important;}#root [data-gpu-atlas-page="'+page+'"],#root [data-gpu-atlas-page="'+page+'"] *{visibility:visible!important;}#root [data-gpu-atlas-page="'+page+'"]{opacity:1!important;}#root [data-gpu-atlas-unclip="1"]{overflow:visible!important;overflow-x:visible!important;overflow-y:visible!important;}';}style.textContent=common+(stageMode?'':mode==='base'?base:mode==='textbox'?textbox:mode==='final'?finalText:atlasMatch?atlas:'')+preserve;document.documentElement.getBoundingClientRect();return true;};
globalThis.__gpuDomEndCapture=()=>{if(globalThis.__gpuDomState){const state=globalThis.__gpuDomState;for(const restore of state.atlasStyleRestores||[]){try{restore.element.style.cssText=restore.cssText;}catch{}}state.atlasStyleRestores=[];}document.getElementById('__gpu_dom_capture_style')?.remove();document.querySelector('[data-gpu-textbox-root="1"]')?.removeAttribute('data-gpu-textbox-root');document.documentElement.getBoundingClientRect();if(globalThis.__gpuDomState){const state=globalThis.__gpuDomState;for(const entry of state.captureVisibility||[]){if(entry.previous===null)entry.element.removeAttribute('data-gpu-capture-visibility');else entry.element.setAttribute('data-gpu-capture-visibility',entry.previous);}state.captureVisibility=[];if(state.atlasObserverPaused){try{state.observer?.takeRecords();state.observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','src','value']});}catch{}state.atlasObserverPaused=false;}state.suppress=false;}return true;};
globalThis.__gpuDomOverlayUpdate=async(baseData,textboxData,finalData,atlasData=[])=>{const state=globalThis.__gpuDomState||(__gpuDomInstall(),globalThis.__gpuDomState),p=__wgProbe.core.gameplay.pixiStage,app=p.currentApp,atlasList=Array.isArray(atlasData)?atlasData:[],images=await Promise.all([baseData,textboxData,finalData,...atlasList].map(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();return img;})),textures=images.map(img=>{const texture=PIXI.Texture.from(img);texture.baseTexture.update();return texture;}),[baseTexture,textboxTexture,textTexture,...atlasTextures]=textures,[baseImage,textboxImage,textImage,...atlasImages]=images;let container=state.container;if(!container){container=new PIXI.Container();app.stage.addChild(container);state.container=container;state.baseSprite=new PIXI.Sprite(baseTexture);state.textboxContainer=new PIXI.Container();state.textboxSprite=new PIXI.Sprite(textboxTexture);state.textSprite=new PIXI.Sprite(textTexture);state.textAtlasContainer=new PIXI.Container();state.introTextContainer=new PIXI.Container();state.textboxContainer.addChild(state.textboxSprite,state.textSprite,state.textAtlasContainer);container.addChild(state.baseSprite,state.textboxContainer,state.introTextContainer);}else{for(const [sprite,key,texture] of [[state.baseSprite,'baseTexture',baseTexture],[state.textboxSprite,'textboxTexture',textboxTexture],[state.textSprite,'textTexture',textTexture]]){const old=state[key];sprite.texture=texture;if(old&&old!==texture)try{old.destroy(true);}catch{}}}state.baseTexture=baseTexture;state.textboxTexture=textboxTexture;state.textTexture=textTexture;for(const sprite of state.textAtlasSprites||[]){try{sprite.parent?.removeChild(sprite);}catch{}try{sprite.texture?.destroy(false);}catch{}try{sprite.destroy({children:true});}catch{}}state.textAtlasSprites=[];for(const texture of state.atlasPageTextures||[])try{texture.destroy(true);}catch{}state.atlasPageTextures=atlasTextures;const sx=Number(app.stage.scale.x)||1,sy=Number(app.stage.scale.y)||1;container.scale.set(1/sx,1/sy);container.position.set(0,0);const width=baseImage.naturalWidth,height=baseImage.naturalHeight;if(!state.maskTexture||state.maskTexture.width!==width||state.maskTexture.height!==height){if(state.maskTexture)try{state.maskTexture.destroy(true);}catch{}state.maskTexture=PIXI.RenderTexture.create({width,height,resolution:1});state.settledMaskPrepared=false;state.maskGraphics=state.maskGraphics||new PIXI.Graphics();if(!state.maskSprite){state.maskSprite=new PIXI.Sprite(state.maskTexture);state.textboxContainer.addChild(state.maskSprite);}else state.maskSprite.texture=state.maskTexture;state.textSprite.mask=state.maskSprite;}state.textboxRoot=state.getTextboxRoot();state.markTextElements();const plan=state.atlasPlan;state.atlasActive=!!(plan?.supported&&plan.entries?.length&&atlasTextures.length===plan.pages);if(state.atlasActive){state.textEntries=plan.entries;for(const entry of state.textEntries){const pageTexture=atlasTextures[entry.page],pageImage=atlasImages[entry.page];if(!pageTexture||!pageImage){state.atlasActive=false;break;}const scaleX=pageImage.naturalWidth/plan.viewportWidth,scaleY=pageImage.naturalHeight/plan.viewportHeight,frameX=Math.max(0,Math.floor(entry.tileX*scaleX)),frameY=Math.max(0,Math.floor(entry.tileY*scaleY)),frameWidth=Math.max(1,Math.min(pageTexture.baseTexture.width-frameX,Math.ceil(entry.tileWidth*scaleX))),frameHeight=Math.max(1,Math.min(pageTexture.baseTexture.height-frameY,Math.ceil(entry.tileHeight*scaleY)));if(frameWidth<=0||frameHeight<=0){state.atlasActive=false;break;}const subTexture=new PIXI.Texture(pageTexture.baseTexture,new PIXI.Rectangle(frameX,frameY,frameWidth,frameHeight)),sprite=new PIXI.Sprite(subTexture);sprite.position.set(entry.rect.left-entry.bleed,entry.rect.top-entry.bleed);sprite.scale.set(1/scaleX,1/scaleY);entry.sprite=sprite;state.textAtlasSprites.push(sprite);(entry.element?.hasAttribute?.('data-gpu-intro-text')?state.introTextContainer:state.textAtlasContainer).addChild(sprite);}if(state.atlasActive){state.textAtlasContainer.visible=true;if(state.introTextContainer)state.introTextContainer.visible=!!state.introActive;state.textSprite.visible=false;if(plan.clipRect){state.textClipGraphics=state.textClipGraphics||new PIXI.Graphics();state.textClipGraphics.clear();state.textClipGraphics.beginFill(0xffffff,1);state.textClipGraphics.drawRect(plan.clipRect.left,plan.clipRect.top,plan.clipRect.right-plan.clipRect.left,plan.clipRect.bottom-plan.clipRect.top);state.textClipGraphics.endFill();if(!state.textClipGraphics.parent)state.textboxContainer.addChild(state.textClipGraphics);state.textClipGraphics.visible=true;state.textAtlasContainer.mask=state.textClipGraphics;}else{if(state.textClipGraphics)state.textClipGraphics.visible=false;state.textAtlasContainer.mask=null;}state.stats.atlasRefreshes++;}}if(!state.atlasActive){for(const sprite of state.textAtlasSprites||[]){try{sprite.parent?.removeChild(sprite);}catch{}try{sprite.texture?.destroy(false);}catch{}try{sprite.destroy({children:true});}catch{}}state.textAtlasSprites=[];state.textAtlasContainer.visible=false;if(state.introTextContainer)state.introTextContainer.visible=false;if(state.textClipGraphics)state.textClipGraphics.visible=false;state.textAtlasContainer.mask=null;state.textEntries=[...document.querySelectorAll('[data-gpu-text-char="1"]')].map(element=>{const rect=element.getBoundingClientRect();return {element,x:Math.max(0,rect.left),y:Math.max(0,rect.top),width:Math.max(0,Math.min(width,rect.right)-Math.max(0,rect.left)),height:Math.max(0,Math.min(height,rect.bottom)-Math.max(0,rect.top))};}).filter(e=>e.width>.1&&e.height>.1);state.textSprite.visible=state.textEntries.length>0;}state.dirty=false;state.captures++;state.stats.fullRefreshes++;const animation={deferredUntilFrameComposite:true};return {captures:state.captures,width,height,stageScaleX:sx,stageScaleY:sy,reason:state.dirtyReason,textEntries:state.textEntries.length,textboxPresent:!!state.textboxRoot,atlasActive:state.atlasActive,atlasPages:atlasTextures.length,animation};};
globalThis.__gpuDomOverlayUpdateBase=async baseData=>{const state=globalThis.__gpuDomState||(__gpuDomInstall(),globalThis.__gpuDomState),p=__wgProbe.core.gameplay.pixiStage,app=p.currentApp;if(!state.container||!state.baseSprite)return {fallbackFull:true};const img=new Image();img.src='data:image/png;base64,'+baseData;await img.decode();const texture=PIXI.Texture.from(img);texture.baseTexture.update();const old=state.baseTexture;state.baseTexture=texture;state.baseSprite.texture=texture;if(old&&old!==texture)try{old.destroy(true);}catch{}const sx=Number(app.stage.scale.x)||1,sy=Number(app.stage.scale.y)||1;state.container.scale.set(1/sx,1/sy);state.container.position.set(0,0);state.dirty=false;state.captures++;state.stats.baseOnlyRefreshes++;return {captures:state.captures,scope:'base',reason:state.dirtyReason,width:img.naturalWidth,height:img.naturalHeight,stageScaleX:sx,stageScaleY:sy};};
globalThis.__gpuDomRecordTextState=(visible,averageOpacity,textSettled=false)=>{
  const state=globalThis.__gpuDomState;if(!state)return;
  const list=state.stats.textTransitions||(state.stats.textTransitions=[]),entry={frame:globalThis.__exportCurrentFrame??-1,visible:Number(visible)||0,averageOpacity:Math.round((Number(averageOpacity)||0)*1000)/1000,textSettled:!!textSettled};
  const last=list[list.length-1];
  if(!last||last.visible!==entry.visible||last.textSettled!==entry.textSettled||Math.abs(last.averageOpacity-entry.averageOpacity)>=.02){
    list.push(entry);if(list.length>512)list.shift();
  }
};
globalThis.__gpuDomApplyAnimations=()=>{const state=globalThis.__gpuDomState,p=__wgProbe.core.gameplay.pixiStage,app=p.currentApp;if(!state?.container)return {active:false,textEntries:0};const sx=Number(app.stage.scale.x)||1,sy=Number(app.stage.scale.y)||1;state.container.scale.set(1/sx,1/sy);state.textboxRoot=state.getTextboxRoot();state.markTextElements();const intro=document.getElementById('introContainer'),introStyle=intro?getComputedStyle(intro):null,introActive=!!(intro&&introStyle&&introStyle.display!=='none'&&introStyle.visibility!=='hidden'&&Number(introStyle.opacity)!==0);state.introActive=introActive;if(introActive)state.stats.introActiveFrames++;if(state.introTextContainer)state.introTextContainer.visible=introActive&&state.atlasActive;if(state.baseSprite&&state.textboxContainer&&state.baseSprite.parent===state.container&&state.textboxContainer.parent===state.container){if(introActive){state.container.setChildIndex(state.textboxContainer,0);state.container.setChildIndex(state.baseSprite,Math.min(1,state.container.children.length-1));if(state.introTextContainer)state.container.setChildIndex(state.introTextContainer,state.container.children.length-1);}else{state.container.setChildIndex(state.baseSprite,0);state.container.setChildIndex(state.textboxContainer,Math.min(1,state.container.children.length-1));if(state.introTextContainer)state.container.setChildIndex(state.introTextContainer,state.container.children.length-1);}}const textboxOpacity=state.textboxRoot?Math.max(0,Math.min(1,Number(getComputedStyle(state.textboxRoot).opacity)||0)):0;state.textboxContainer.alpha=textboxOpacity;if(state.atlasActive){state.textSprite.visible=false;state.textAtlasContainer.visible=state.textEntries.length>0;let visible=0,sum=0;for(const entry of state.textEntries){if(!entry.element?.isConnected||!entry.sprite){if(entry.sprite)entry.sprite.alpha=0;continue;}const introEntry=entry.element.hasAttribute?.('data-gpu-intro-text'),opacity=introEntry?Math.max(0,Math.min(1,Number(getComputedStyle(entry.element).opacity)||0)):(state.textSettled?1:Math.max(0,Math.min(1,Number(getComputedStyle(entry.element).opacity)||0)));entry.sprite.alpha=opacity;sum+=opacity;if(opacity>.0001)visible++;}const averageOpacity=state.textEntries.length?sum/state.textEntries.length:0;__gpuDomRecordTextState(visible,averageOpacity,state.textSettled);app.render();return {active:true,atlas:true,atlasPages:state.atlasPlan?.pages||0,textEntries:state.textEntries.length,visible,averageOpacity,textboxOpacity,introActive,introEntries:state.stats.introAtlasEntries};}if(!state.textEntries.length){state.textSprite.visible=false;__gpuDomRecordTextState(0,0,state.textSettled);app.render();return {active:true,textEntries:0,textboxOpacity};}state.textSprite.visible=true;state.textSprite.mask=state.maskSprite;const graphics=state.maskGraphics;if(state.textSettled){if(!state.settledMaskPrepared){graphics.clear();graphics.beginFill(0xffffff,1);graphics.drawRect(0,0,state.maskTexture.width,state.maskTexture.height);graphics.endFill();app.renderer.render(graphics,{renderTexture:state.maskTexture,clear:true});state.stats.maskFrames++;state.settledMaskPrepared=true;}__gpuDomRecordTextState(state.textEntries.length,1,true);app.render();return {active:true,textEntries:state.textEntries.length,visible:state.textEntries.length,averageOpacity:1,textboxOpacity,textSettled:true};}state.settledMaskPrepared=false;graphics.clear();let visible=0,sum=0;for(const entry of state.textEntries){if(!entry.element?.isConnected)continue;const opacity=Math.max(0,Math.min(1,Number(getComputedStyle(entry.element).opacity)||0));sum+=opacity;if(opacity<=.0001)continue;visible++;graphics.beginFill(0xffffff,opacity);graphics.drawRect(entry.x,entry.y,entry.width,entry.height);graphics.endFill();}app.renderer.render(graphics,{renderTexture:state.maskTexture,clear:true});state.stats.maskFrames++;const averageOpacity=state.textEntries.length?sum/state.textEntries.length:0;__gpuDomRecordTextState(visible,averageOpacity,false);app.render();return {active:true,textEntries:state.textEntries.length,visible,averageOpacity,textboxOpacity};};
globalThis.__gpuDomRenderOnly=()=>{const state=globalThis.__gpuDomState,p=__wgProbe.core.gameplay.pixiStage,app=p.currentApp,r=app.renderer;try{if(r.background){r.background.alpha=0;if('color' in r.background)r.background.color=0;}}catch{}try{if('backgroundAlpha' in r)r.backgroundAlpha=0;}catch{}try{r.gl.clearColor(0,0,0,0);}catch{}const target=state?.container||(globalThis.__gpuDomEmpty||(globalThis.__gpuDomEmpty=new PIXI.Container())),parent=target.parent,index=parent?.getChildIndex?.(target)??-1,sx=target.scale?.x??1,sy=target.scale?.y??1,px=target.position?.x??0,py=target.position?.y??0;try{if(parent)parent.removeChild(target);target.scale?.set?.(1,1);target.position?.set?.(0,0);r.render(target,{clear:true});}finally{target.scale?.set?.(sx,sy);target.position?.set?.(px,py);if(parent){const at=Math.max(0,Math.min(index,parent.children.length));parent.addChildAt(target,at);}}return {active:!!state?.container,children:state?.container?.children?.length||0,alpha:!!r.gl.getContextAttributes()?.alpha,premultipliedAlpha:!!r.gl.getContextAttributes()?.premultipliedAlpha};};
globalThis.__gpuReadbackPrepare=(width,height)=>{const p=__wgProbe.core.gameplay.pixiStage,gl=p.currentApp.renderer.gl,srcWidth=gl.drawingBufferWidth,srcHeight=gl.drawingBufferHeight;if(globalThis.__gpuReadbackState?.gl===gl&&globalThis.__gpuReadbackState.srcWidth===srcWidth&&globalThis.__gpuReadbackState.srcHeight===srcHeight&&globalThis.__gpuReadbackState.width===width&&globalThis.__gpuReadbackState.height===height)return globalThis.__gpuReadbackState.info;const old=globalThis.__gpuReadbackState;if(old?.gl===gl){try{old.texture&&gl.deleteTexture(old.texture);old.framebuffer&&gl.deleteFramebuffer(old.framebuffer);}catch{}}if(width===srcWidth&&height===srcHeight){const info={mode:'direct',sourceWidth:srcWidth,sourceHeight:srcHeight,width,height,bytes:width*height*4,webgl2:typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext,antialias:!!gl.getContextAttributes()?.antialias};globalThis.__gpuReadbackState={gl,srcWidth,srcHeight,width,height,texture:null,framebuffer:null,info};return info;}const webgl2=typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext;if(!webgl2)throw new Error('Scaled GPU readback requires WebGL2');const oldFramebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING),oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gl.bindFramebuffer(gl.FRAMEBUFFER,oldFramebuffer);gl.bindTexture(gl.TEXTURE_2D,oldTexture);if(status!==gl.FRAMEBUFFER_COMPLETE){gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture);throw new Error('GPU downscale framebuffer incomplete: 0x'+status.toString(16));}const info={mode:'webgl2-blit',sourceWidth:srcWidth,sourceHeight:srcHeight,width,height,bytes:width*height*4,webgl2:true,antialias:!!gl.getContextAttributes()?.antialias};globalThis.__gpuReadbackState={gl,srcWidth,srcHeight,width,height,texture,framebuffer,info};return info;};
globalThis.__gpuReadbackShared=(width,height)=>{const p=__wgProbe.core.gameplay.pixiStage,gl=p.currentApp.renderer.gl,out=globalThis.__gpuSharedBytes;if(!out)throw new Error('GPU shared readback buffer is not ready');const info=globalThis.__gpuReadbackPrepare(width,height),bytes=info.bytes;if(out.byteLength<bytes)throw new Error('GPU shared readback buffer is too small');if(info.mode==='direct'){const fb=gl.getParameter(gl.FRAMEBUFFER_BINDING);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,out);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);return info;}const state=globalThis.__gpuReadbackState,oldRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),oldDraw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,state.framebuffer);gl.blitFramebuffer(0,0,info.sourceWidth,info.sourceHeight,0,0,width,height,gl.COLOR_BUFFER_BIT,gl.LINEAR);const error=gl.getError();if(error!==gl.NO_ERROR){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,oldRead);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,oldDraw);throw new Error('GPU downscale blit failed: 0x'+error.toString(16));}gl.bindFramebuffer(gl.READ_FRAMEBUFFER,state.framebuffer);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,out);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,oldRead);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,oldDraw);return info;};
let pos=0,last=firstSimulationFrame>0?(firstSimulationFrame-1)*1000/fps:0;globalThis.__webviewStep=async frame=>{globalThis.__exportCurrentFrame=frame;const t=frame*1000/fps,elapsed=Math.round(t)-Math.round(last);last=t;const batch=[];while(pos<events.length&&events[pos].atMs<=t+.01)batch.push(events[pos++]);const lips=[...new Set(envelopes.map(a=>a.target).filter(Boolean))].map(target=>({target,active:envelopes.some(a=>a.target===target&&t>=a.atMs&&t<a.endMs),value:Math.max(0,...envelopes.filter(a=>a.target===target&&t>=a.atMs&&t<a.endMs).map(a=>Math.min(1,(a.values[Math.floor((t-a.atMs)/20)]||0)/a.peak)))}));await __stepExportFrame({t,elapsed,batch,lips});return pos;};globalThis.__webviewWarmupStep=async frame=>{const value=await globalThis.__webviewStep(frame);__wgProbe.core.gameplay.pixiStage.currentApp.render();return value;};};

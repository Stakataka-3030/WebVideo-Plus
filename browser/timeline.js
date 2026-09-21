globalThis.__createNativeTimeline=async({script,policy})=>{
  await __reportNativePlan({phase:"initializing",checkpoint:"timeline-entry"});
  const w=__wgProbe,core=w.core,pc=core.gameplay.performController,clock=__pwClock.controller,embed=clock._embedder,nativeTimer=embed.setTimeout.bind(embed);
  embed.setTimeout=(fn,delay)=>delay===undefined?(queueMicrotask(fn),()=>{}):nativeTimer(fn,delay);
  for(const [key,value] of Object.entries({textSpeed:policy.textSpeed,autoSpeed:policy.autoSpeed}))w.store.dispatch({type:'userData/setOptionData',payload:{key,value}});
  await __reportNativePlan({phase:"initializing",checkpoint:"before-clock"});
  await clock.runFor(500);
  await __reportNativePlan({phase:"initializing",checkpoint:"after-clock"});
  await clock.pauseAt(Date.now());
  if(!policy.renderDuringPlan){const app=core.gameplay.pixiStage.currentApp;app.ticker.remove(app.render,app);app.render=()=>{};}

  const normalize=src=>decodeURIComponent(new URL(src,location.href).pathname),mediaTimers=new WeakMap(),pause=HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play=function(){
    pause.call(this);
    const d=policy.durations[normalize(this.currentSrc||this.src)];
    if(d&&!this.loop&&this.id!=='bgm'){
      clearTimeout(mediaTimers.get(this));
      mediaTimers.set(this,setTimeout(()=>this.dispatchEvent(new Event('ended')),d));
    }
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause=function(){clearTimeout(mediaTimers.get(this));return pause.call(this);};

  const yieldQueue=[],yieldChannel=new MessageChannel();
  yieldChannel.port1.onmessage=()=>yieldQueue.shift()?.();
  const yieldTask=()=>new Promise(resolve=>{yieldQueue.push(resolve);yieldChannel.port2.postMessage(0);});
  const planStepMs=100,domWorkload=[];
  const sampleDom=()=>{
    if(typeof globalThis.__gpuDomCaptureNeeded!=='function')return;
    const capture=globalThis.__gpuDomCaptureNeeded();
    if(!capture)return;
    const state=globalThis.__gpuDomState,reason=state?.dirtyReason||'mutation',units=reason==='animation'||reason==='video'?Math.max(1,Math.round(planStepMs*(Number(policy.fps)||60)/1000)):1;
    domWorkload.push({atMs:origin===null?0:performance.now()-origin,reason,units});
    if(state)state.dirty=false;
  };
  const singleLineHintDuration=(s,params)=>{
    if(s.commandRaw!=='choose'||Number(params.defaultChoose)!==1||params.next===true)return 0;
    const options=String(s.content||'').split(/(?<!\\)\|/);
    if(options.length!==1)return 0;
    const nodes=options[0].split(/(?<!\\):/);
    if(nodes.length!==2||!/^__wvp_hint_[A-Za-z0-9_]+$/.test(nodes[1].trim()))return 0;
    const ms=Number(params.wvpHint);
    return Number.isFinite(ms)&&ms>=100&&ms<=60000?ms:1800;
  };
  const singleChooseItem=()=>{
    const main=document.getElementById('chooseContainer')?.firstElementChild;
    if(!main||main.children.length!==1)return null;
    const outer=main.firstElementChild;
    return outer&&outer.children.length===1?outer.firstElementChild:null;
  };

  const events=[],elastic=[],controlEvents=[],performWindows=[];
  let origin=null,lastCommand='',lastParams={},lastLine=0,done=false,finishedAt=0,manualTimer=null,hintTimer=null,hintError='';
  let forwardGroupCounter=0,openForwardGroup=0;
  const nowMs=()=>origin===null?0:performance.now()-origin;
  const stageExitWindows=[],activeStageExits=new Map(),stage=core.gameplay.pixiStage,nativeRegisterAnimation=stage.registerAnimation.bind(stage),nativeRemoveAnimation=stage.removeAnimation.bind(stage);
  stage.registerAnimation=function(animation,key,target,...rest){
    const result=nativeRegisterAnimation(animation,key,target,...rest),id=String(key||'');
    if(id.endsWith('-softoff')){
      const item={key:id,target:String(target||''),startMs:nowMs(),stopMs:null};
      stageExitWindows.push(item);activeStageExits.set(id,item);
    }
    return result;
  };
  stage.removeAnimation=function(key,...rest){
    const id=String(key||''),item=activeStageExits.get(id);
    if(item&&item.stopMs===null){item.stopMs=nowMs();activeStageExits.delete(id);}
    return nativeRemoveAnimation(key,...rest);
  };
  const currentForwardGroup=()=>{
    if(!openForwardGroup){
      openForwardGroup=++forwardGroupCounter;
      queueMicrotask(()=>{openForwardGroup=0;});
    }
    return openForwardGroup;
  };

  // A timer queued during a non-blocking wait must not settle a later say.
  let autoGeneration=0;
  const cancelPendingAuto=()=>{
    autoGeneration++;
    if(core.gameplay.autoTimeout!=null){
      clearTimeout(core.gameplay.autoTimeout);
      core.gameplay.autoTimeout=null;
    }
  };
  globalThis.__nativeScheduleAuto=(fn,delay)=>{
    const generation=autoGeneration,startMs=nowMs(),line=lastLine,eligible=lastCommand==='say'&&!lastParams.notend;
    return setTimeout(()=>{
      if(generation!==autoGeneration)return;
      if(pc.performList.some(p=>p.blockingAuto())){
        core.gameplay.autoTimeout=null;
        return;
      }
      if(eligible)elastic.push({startMs,endMs:nowMs(),line});
      fn();
    },delay);
  };

  const finish=()=>{done=true;finishedAt=performance.now();w.nativeStopAuto();};
  globalThis.__nativeObserve=s=>{
    cancelPendingAuto();
    if(origin===null)origin=performance.now();
    lastCommand=s.command===0?'say':s.commandRaw;
    lastParams=Object.fromEntries(s.args.map(a=>[a.key,a.value]));
    lastLine=core.sceneManager.sceneData.currentSentenceId;
    events.push({index:lastLine,atMs:nowMs(),command:lastCommand,forwardGroup:currentForwardGroup()});
    if(manualTimer){clearTimeout(manualTimer);manualTimer=null;}
    if(hintTimer){clearTimeout(hintTimer);hintTimer=null;}
    const hintMs=singleLineHintDuration(s,lastParams);
    if(hintMs)hintTimer=setTimeout(()=>{
      hintTimer=null;
      const item=singleChooseItem();
      if(!item){hintError='单行提示未能显示唯一选项';return;}
      item.click();
    },hintMs);
    if(lastCommand==='end')finish();
  };

  const ended=()=>core.sceneManager.sceneData.currentSentenceId>=core.sceneManager.sceneData.currentScene.sentenceList.length;
  let blockedPrematureAutoNext=0;
  globalThis.__nativeBeforeNext=()=>{
    if(policy.mode==='auto'&&pc.performList.some(p=>p.blockingAuto?.())){
      blockedPrematureAutoNext++;
      return false;
    }
    if(ended()&&!pc.hasBlockingNextPerform()&&!pc.performList.some(p=>p.blockingAuto())){finish();return false;}
    if(origin!==null)controlEvents.push({atMs:nowMs(),kind:'next',line:lastLine});
    return true;
  };

  // Internal continueSentence() has an extra semantic step that the frame renderer does not execute:
  // it settles every active non-hold perform before forwarding. Record that boundary explicitly.
  const settleNonHold=pc.settleNonHoldPerforms;
  pc.settleNonHoldPerforms=function(goNextWhenOver=true,...rest){
    if(goNextWhenOver===false&&origin!==null&&!done)controlEvents.push({atMs:nowMs(),kind:'settle-nonhold',line:lastLine});
    return settleNonHold.call(this,goNextWhenOver,...rest);
  };

  // Keep the source engine in charge of perform semantics, but make the unattended planner
  // preserve plain wait and make manual text timing deterministic. Only visual/text performs
  // need lifecycle records; audio/static no-op performs would make long projects unnecessarily large.
  const arrange=pc.arrangeNewPerform;
  const trackedPerformCommands=new Set(['say','setTransform','setTempAnimation','setAnimation','setComplexAnimation','changeBg','changeFigure','playVideo','intro','pixiPerform']);
  pc.arrangeNewPerform=function(perform,s,...rest){
    const params=Object.fromEntries(s.args.map(a=>[a.key,a.value]));
    const command=s.command===0?'say':s.commandRaw;
    if(command==='wait'&&params.next!==true){
      perform.blockingAuto=()=>true;
      perform.blockingNext=()=>true;
    }
    if(policy.mode==='manual'&&s.command===0&&perform.performName!=='vocal-play'&&!perform.isHoldOn&&!params.notend){
      const n=w.compileText(s.content,3).reduce((sum,a)=>sum+a.length,0);
      perform.duration=n*w.textDelay(policy.textSpeed)+w.textAnimation(policy.textSpeed);
    }
    if(perform.performName==='vocal-play'||!trackedPerformCommands.has(command))return arrange.call(this,perform,s,...rest);

    const item={
      command,
      line:core.sceneManager.sceneData.currentSentenceId,
      role:'primary',
      durationMs:Math.max(0,Number(perform.duration)||0),
      hold:!!perform.isHoldOn,
      startMs:null,
      stopMs:null
    };
    const start=perform.startFunction,stop=perform.stopFunction;
    perform.startFunction=()=>{if(item.startMs===null)item.startMs=nowMs();return start?.();};
    perform.stopFunction=()=>{if(item.stopMs===null)item.stopMs=nowMs();return stop?.();};
    performWindows.push(item);
    return arrange.call(this,perform,s,...rest);
  };

  document.querySelector('.html-body__title-enter')?.style.setProperty('display','none');
  __probeCommands['preview.command.set-component-visibility']({showStarter:false,isShowLogo:false,showTitle:false,showControls:false,controlsVisibility:false,isEnterGame:true});
  if(typeof globalThis.__gpuDomInstall==='function')globalThis.__gpuDomInstall();
  __probeCommands['preview.command.run-scene-content']({sceneContent:script});
  await __reportNativePlan({phase:'initializing',checkpoint:'scene-started'});

  let poll;
  if(policy.mode==='auto')w.nativeAuto();
  else poll=setInterval(()=>{
    if(origin===null||done||manualTimer||pc.performList.some(p=>p.blockingAuto()||p.blockingNext()))return;
    const delay=lastCommand==='say'&&!lastParams.notend?policy.holdMs:0,begin=nowMs();
    manualTimer=setTimeout(()=>{
      manualTimer=null;
      if(delay>0)elastic.push({startMs:begin,endMs:nowMs(),line:lastLine});
      w.nativeNext();
    },delay);
  },10);

  let steps=0;
  const maxSteps=108000;
  while(!done&&steps++<maxSteps){
    globalThis.__nativePlanProgress={phase:'advancing',line:lastLine+1,totalLines:core.sceneManager.sceneData.currentScene.sentenceList.length,videoSeconds:origin===null?0:nowMs()/1000,events:events.length};
    await clock.runFor(planStepMs);
    await yieldTask();
    if(hintError)throw new Error(hintError);
    await __exportWaitForStageAssets();
    sampleDom();
    if(steps%50===0)await __reportNativePlan({...__nativePlanProgress,phase:'planning-progress',performs:pc.performList.map(p=>({name:p.performName,duration:p.duration,hold:p.isHoldOn}))});
  }

  clearInterval(poll);
  clearTimeout(manualTimer);
  clearTimeout(hintTimer);
  w.nativeStopAuto();
  yieldChannel.port1.close();
  yieldChannel.port2.close();
  if(!done)throw new Error('播放时序规划超时，场景可能含等待交互的指令');
  return {events,elastic,controlEvents,performWindows,stageExitWindows,domWorkload,blockedPrematureAutoNext,durationMs:origin===null?0:finishedAt-origin,options:w.store.getState().userData.optionData};
};

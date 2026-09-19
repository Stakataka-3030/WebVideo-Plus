globalThis.__createNativeTimeline=async({script,policy})=>{
   await __reportNativePlan({phase:"initializing",checkpoint:"timeline-entry"});
   const w=__wgProbe,core=w.core,pc=core.gameplay.performController,clock=__pwClock.controller,embed=clock._embedder,nativeTimer=embed.setTimeout.bind(embed);
   embed.setTimeout=(fn,delay)=>delay===undefined?(queueMicrotask(fn),()=>{}):nativeTimer(fn,delay);
   for(const [key,value] of Object.entries({textSpeed:policy.textSpeed,autoSpeed:policy.autoSpeed}))w.store.dispatch({type:'userData/setOptionData',payload:{key,value}});
   await __reportNativePlan({phase:"initializing",checkpoint:"before-clock"});await clock.runFor(500);await __reportNativePlan({phase:"initializing",checkpoint:"after-clock"});await clock.pauseAt(Date.now());if(!policy.renderDuringPlan){const app=core.gameplay.pixiStage.currentApp;app.ticker.remove(app.render,app);app.render=()=>{};}
   const normalize=src=>decodeURIComponent(new URL(src,location.href).pathname),mediaTimers=new WeakMap(),pause=HTMLMediaElement.prototype.pause;
   HTMLMediaElement.prototype.play=function(){pause.call(this);const d=policy.durations[normalize(this.currentSrc||this.src)];if(d&&!this.loop&&this.id!=='bgm'){clearTimeout(mediaTimers.get(this));mediaTimers.set(this,setTimeout(()=>this.dispatchEvent(new Event('ended')),d));}return Promise.resolve();};
   HTMLMediaElement.prototype.pause=function(){clearTimeout(mediaTimers.get(this));return pause.call(this);};
   const yieldQueue=[],yieldChannel=new MessageChannel();yieldChannel.port1.onmessage=()=>yieldQueue.shift()?.();const yieldTask=()=>new Promise(resolve=>{yieldQueue.push(resolve);yieldChannel.port2.postMessage(0);});const planStepMs=100,domWorkload=[];const sampleDom=()=>{if(typeof globalThis.__gpuDomCaptureNeeded!=='function')return;const capture=globalThis.__gpuDomCaptureNeeded();if(!capture)return;const state=globalThis.__gpuDomState,reason=state?.dirtyReason||'mutation',units=reason==='animation'||reason==='video'?Math.max(1,Math.round(planStepMs*(Number(policy.fps)||60)/1000)):1;domWorkload.push({atMs:origin===null?0:performance.now()-origin,reason,units});if(state)state.dirty=false;};const events=[],elastic=[],controlEvents=[];let origin=null,lastCommand='',lastParams={},lastLine=0,done=false,finishedAt=0,manualTimer=null;
   globalThis.__nativeScheduleAuto=(fn,delay)=>{const startMs=performance.now()-origin,line=lastLine,eligible=lastCommand==='say'&&!lastParams.notend;return setTimeout(()=>{if(eligible)elastic.push({startMs,endMs:performance.now()-origin,line});fn();},delay);};
   const recordTextSettle=()=>{if(origin!==null&&!done)controlEvents.push({atMs:performance.now()-origin,kind:'text-settle',line:lastLine});};core.events.textSettle.on(recordTextSettle);
   const finish=()=>{done=true;finishedAt=performance.now();w.nativeStopAuto();};
   globalThis.__nativeObserve=s=>{if(origin===null)origin=performance.now();lastCommand=s.command===0?'say':s.commandRaw;lastParams=Object.fromEntries(s.args.map(a=>[a.key,a.value]));lastLine=core.sceneManager.sceneData.currentSentenceId;events.push({index:lastLine,atMs:performance.now()-origin,command:lastCommand});if(manualTimer){clearTimeout(manualTimer);manualTimer=null;}if(lastCommand==='end')finish();};
   const ended=()=>core.sceneManager.sceneData.currentSentenceId>=core.sceneManager.sceneData.currentScene.sentenceList.length;
   globalThis.__nativeBeforeNext=()=>{if(ended()&&!pc.hasBlockingNextPerform()&&!pc.performList.some(p=>p.blockingAuto())){finish();return false;}if(origin!==null)controlEvents.push({atMs:performance.now()-origin,kind:'next'});return true;};
   if(policy.mode==='manual'){
    const arrange=pc.arrangeNewPerform;pc.arrangeNewPerform=function(perform,s,...rest){if(s.command===0&&perform.performName!=='vocal-play'&&!perform.isHoldOn){const params=Object.fromEntries(s.args.map(a=>[a.key,a.value]));if(!params.notend){const n=w.compileText(s.content,3).reduce((sum,a)=>sum+a.length,0);perform.duration=n*w.textDelay(policy.textSpeed)+w.textAnimation(policy.textSpeed);}}return arrange.call(this,perform,s,...rest);};
   }
   document.querySelector('.html-body__title-enter')?.style.setProperty('display','none');
   __probeCommands['preview.command.set-component-visibility']({showStarter:false,isShowLogo:false,showTitle:false,showControls:false,controlsVisibility:false,isEnterGame:true});
   if(typeof globalThis.__gpuDomInstall==='function')globalThis.__gpuDomInstall();__probeCommands['preview.command.run-scene-content']({sceneContent:script});
   await __reportNativePlan({phase:'initializing',checkpoint:'scene-started'});
   let poll;
   if(policy.mode==='auto')w.nativeAuto();
   else poll=setInterval(()=>{if(origin===null||done||manualTimer||pc.performList.some(p=>p.blockingAuto()||p.blockingNext()))return;const delay=lastCommand==='say'&&!lastParams.notend?policy.holdMs:0,begin=performance.now()-origin;manualTimer=setTimeout(()=>{manualTimer=null;if(delay>0)elastic.push({startMs:begin,endMs:performance.now()-origin,line:lastLine});w.nativeNext();},delay);},10);
   let steps=0;const maxSteps=108000;while(!done&&steps++<maxSteps){globalThis.__nativePlanProgress={phase:'advancing',line:lastLine+1,totalLines:core.sceneManager.sceneData.currentScene.sentenceList.length,videoSeconds:origin===null?0:(performance.now()-origin)/1000,events:events.length};await clock.runFor(planStepMs);await yieldTask();await __exportWaitForStageAssets();sampleDom();if(steps%50===0)await __reportNativePlan({...__nativePlanProgress,phase:'planning-progress',performs:pc.performList.map(p=>({name:p.performName,duration:p.duration,hold:p.isHoldOn}))});}
   core.events.textSettle.off(recordTextSettle);clearInterval(poll);clearTimeout(manualTimer);w.nativeStopAuto();yieldChannel.port1.close();yieldChannel.port2.close();
   if(!done)throw new Error('播放时序规划超时，场景可能含等待交互的指令');
   return {events,elastic,controlEvents,domWorkload,durationMs:origin===null?0:finishedAt-origin,options:w.store.getState().userData.optionData};
  };

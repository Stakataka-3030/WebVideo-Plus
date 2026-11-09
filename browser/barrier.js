function installStageAssetBarrier() {
 // Track requests made by setExpression, not every optional prefetch in Pixi's
 // asset cache. A newer request supersedes the old one; a destroyed manager no
 // longer owns work. The original returned promise and native error event stay
 // intact, while the barrier also reports errors the factory normally swallows.
 const requests=new Set();
 let expressionError=null;
 const fail=(manager,index,error)=>{
  if(manager.destroyed||expressionError)return;
  expressionError=new Error('Live2D 表情加载失败：'+(manager.settings?.name||manager.tag||'model')+' ['+String(index)+']：'+String(error?.message||error));
 };
 globalThis.__exportExpressionFailed=(manager,index,error)=>{
  // A stale A failure must not poison a newer B request on the same manager.
  // During start(), generation is not assigned on the tracking record yet.
  if(manager.__webvideoExpressionIndex===index&&[...requests].some(request=>request.manager===manager&&(request.generation===undefined||request.generation===manager.__webvideoExpressionGeneration)))fail(manager,index,error);
 };
 globalThis.__exportTrackExpression=(manager,index,start)=>{
  if(manager.destroyed)return start();
  const request={manager,index,generation:undefined};
  requests.add(request);
  let promise;
  try{promise=start();request.generation=manager.__webvideoExpressionGeneration;}
  catch(error){requests.delete(request);fail(manager,index,error);throw error;}
  // Observe without replacing the SDK promise or turning an active failure into
  // success. A caller that awaits it still receives the original rejection.
  Promise.resolve(promise).then(()=>requests.delete(request),error=>{requests.delete(request);if(request.generation===manager.__webvideoExpressionGeneration)fail(manager,index,error);});
  return promise;
 };
 const pending=()=>{
  if(expressionError)throw expressionError;
  for(const request of requests){
   if(request.manager.destroyed||request.generation!==request.manager.__webvideoExpressionGeneration)requests.delete(request);
  }
  return [...requests];
 };
 globalThis.__exportHasPendingExpressions=()=>pending().length>0;
 globalThis.__exportWaitForExpressions=async()=>{
  if(!pending().length)return;
  // This wait is also called *inside* a clock tick. Only the real embedder
  // timer may be used here: calling runFor recursively would deadlock or run
  // the next story command before the expression had actually been applied.
  await new Promise((resolve,reject)=>{
   const timer=__pwClock.controller._embedder.setTimeout;
   let cancelPoll=()=>{},finished=false;
   const finish=error=>{if(finished)return;finished=true;cancelPoll();cancelTimeout();error?reject(error):resolve();};
   const cancelTimeout=timer(()=>{
    try{finish(Error('Live2D 表情加载超时：'+pending().map(x=>(x.manager.settings?.name||x.manager.tag||'model')+' ['+String(x.index)+']').join(', ')));}catch(error){finish(error);}
   },20000);
   const check=()=>{if(finished)return;try{if(!pending().length)finish();else cancelPoll=timer(check,2);}catch(error){finish(error);}};
   check();
  });
 };
 globalThis.__exportWaitForStageAssets=async()=>{
  const stage=__wgProbe.core.gameplay.pixiStage;
  const missing=()=>[...stage.backgroundObjects,...stage.figureObjects].filter(object=>{
   if(!object.sourceUrl)return false;
   const children=object.pixiContainer?.children||[];
   if(!children.length)return true;
   const url=decodeURIComponent(new URL(object.sourceUrl,location.href).pathname);
   const expected=globalThis.__nativeAggregateCounts?.[url];
   return expected&&(children.length<expected||children.some(model=>!model.visible||!model.internalModel));
  });
  await Promise.resolve();
  if(!missing().length){await __exportWaitForExpressions();return;}
  await new Promise((resolve,reject)=>{
   const timer=__pwClock.controller._embedder.setTimeout;
   let cancelPoll=()=>{},finished=false;
   const cancelTimeout=timer(()=>{
    finished=true;cancelPoll();reject(Error('舞台素材或聚合模型加载超时：'+missing().map(x=>x.key+' ('+x.sourceUrl+')').join(', ')));
   },20000);
   const check=async()=>{
    try{
     // WebGAL 4.6.5 prepares Pixi textures through a queued upload callback.
     // During planning the renderer ticker is paused; pump that queue without
     // advancing story time, or both background and figure remain childless.
     const prepare=stage.currentApp?.renderer?.plugins?.prepare;
     if(prepare?.queue?.length&&typeof prepare.delayedTick==='function')prepare.delayedTick();
     await __pwClock.controller.runFor(0);
     await __exportWaitForExpressions();
    }catch(error){finished=true;cancelTimeout();reject(error);return;}
    if(finished)return;
    if(!missing().length){finished=true;cancelTimeout();resolve();}else cancelPoll=timer(check,2);
   };
   check();
  });
 };
}

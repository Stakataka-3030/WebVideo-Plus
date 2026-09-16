function installStageAssetBarrier() {
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
  if(!missing().length)return;
  await new Promise((resolve,reject)=>{
   const timer=__pwClock.controller._embedder.setTimeout;
   let cancelPoll=()=>{},finished=false;
   const cancelTimeout=timer(()=>{
    finished=true;cancelPoll();reject(Error('舞台素材或聚合模型加载超时：'+missing().map(x=>x.key+' ('+x.sourceUrl+')').join(', ')));
   },20000);
   const check=async()=>{
    try{await __pwClock.controller.runFor(0);}catch(error){finished=true;cancelTimeout();reject(error);return;}
    if(finished)return;
    if(!missing().length){finished=true;cancelTimeout();resolve();}else cancelPoll=timer(check,2);
   };
   check();
  });
 };
}

// MyGO keeps its own unvoiced mouth animation. Voiced lines use the exporter's
// offline audio envelope because the audio track is mixed outside the browser.
function installMygoExportMouth() {
 const stage=__wgProbe.core.gameplay.pixiStage, active=new Map(), textures=new Map(), bound=new WeakSet();
 const setMouth=stage.setModelMouthY.bind(stage),closed=new Set();
 let simulatedTarget=null;
 globalThis.__exportSpeechGeneration=0;
 const apply=(inner,value)=>{
  const core=inner?.coreModel;if(!core)return;
  core.setParamFloat?.('PARAM_MOUTH_OPEN_Y',value);
  core.setParameterValueById?.('ParamMouthOpenY',value);
 };
 const heldValue=key=>{
  if(closed.has(key))return 0;
  const level=stage.getCurrentMouthValue(key);
  return level==null?null:Math.max(0,Math.min(1,(level-50)/50));
 };
 // MyGO installs this protection for ordinary/WMDL figures, but its JSONL
 // loader omits it. Keep the native mouth curve and reapply its latest value
 // after motion updates, both during ticking and immediately before capture.
 const refresh=()=>{
  for(const object of stage.figureObjects){
   if(object.sourceType!=='live2d')continue;
   for(const model of object.pixiContainer?.children||[]){
    const inner=model.internalModel;if(!inner)continue;
    if(!bound.has(inner)){
     bound.add(inner);
     inner.on('beforeModelUpdate',()=>{const value=heldValue(object.key);if(value!=null)apply(inner,value);});
    }
    const value=heldValue(object.key);if(value!=null)apply(inner,value);
   }
  }
 };
 const close=key=>{
  if(!key)return;
  closed.add(key);stage.resetMouthY(key);
  const item=__wgProbe.stageManager.getCalculationStageState().figureAssociatedAnimation.find(x=>x.targetId===key);
  if(item)stage.performMouthSyncAnimation(key,item,'closed','center');
  textures.delete(key);
 };
 globalThis.__exportSetSpeechMode=(target,voiced)=>{
  // Invalidate old say callbacks, including callbacks created during fast seek.
  ++globalThis.__exportSpeechGeneration;
  if(simulatedTarget&&!active.has(simulatedTarget))close(simulatedTarget);
  simulatedTarget=voiced?null:target||null;
 };
 stage.setModelMouthY=(key,level)=>{
  // Native simulated speech may write only to this line's explicit target.
  // Offline voiced envelopes use setMouth directly and keep their own lifetime.
  if(key!==simulatedTarget)return;
  closed.delete(key);setMouth(key,level);
 };
 globalThis.__exportRefreshMouth=refresh;
 globalThis.__exportRecordMouth=()=>{};
 globalThis.__mygoApplyLip=lip=>{
  if(!lip.active){
   if(active.has(lip.target)){
    if(lip.target!==simulatedTarget)close(lip.target);
    active.delete(lip.target);textures.delete(lip.target);
   }
   return;
  }
  const now=performance.now(), previous=active.get(lip.target)||{value:0,at:now-20};
  const raw=Math.max(0,Math.min(1,lip.value)),alpha=raw > previous.value ? 0.55 : 0.3;
  const amount=1-Math.pow(1-alpha,Math.max(0,(now-previous.at)/20));
  const value=previous.value+(raw-previous.value)*amount;
  active.set(lip.target,{value,at:now});
  // Apply to all constituent models; refresh() keeps the value through motions.
  closed.delete(lip.target);setMouth(lip.target,50+50*value);
  const state=value>.75?'open':value>.5?'half_open':'closed';
  const item=__wgProbe.stageManager.getCalculationStageState().figureAssociatedAnimation.find(x=>x.targetId===lip.target);
  const object=stage.getStageObjByKey(lip.target),key=state==='half_open'?'halfOpen':state==='closed'?'close':'open';
  const signature=object?.uuid+':'+item?.mouthAnimation?.[key];
  if(item&&textures.get(lip.target)!==signature){textures.set(lip.target,signature);stage.performMouthSyncAnimation(lip.target,item,state,'center');}
 };
}

// Native say performs own speech start/stop. Smooth mode replaces only their
// random levels, using a local time-based curve without changing Math.random.
function installExportMouthController(policy='smooth'){
 const hold=policy!==false&&policy!=='legacy',smooth=policy==='smooth';
 const stage=__wgProbe.core.gameplay.pixiStage,original=stage.setModelMouthY.bind(stage),values=new Map(),bound=new WeakSet(),release=new Set(),modes=new Map(),speeches=new Map();
 let serial=0,simulatedTarget=null;
 function apply(inner,value){const core=inner?.coreModel;if(!core)return;core.setParamFloat?.('PARAM_MOUTH_OPEN_Y',value);core.setParameterValueById?.('ParamMouthOpenY',value);}
 function rand(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
 function nextSyllable(s){s.period=290+rand(s)*130;s.height=.48+rand(s)*.32;s.count++;s.rest=s.count%6===0?140:45;}
 globalThis.__exportSetSpeechMode=(target,voiced)=>{for(const [key,mode]of modes)if(mode==='simulated'){original(key,0);values.set(key,0);}speeches.clear();modes.clear();simulatedTarget=voiced?null:target||null;globalThis.__exportCurrentSimulatedTarget=simulatedTarget;if(target)modes.set(target,voiced?'voice':'simulated');};
 stage.setModelMouthY=(key,level)=>{if(!globalThis.__exportWritingVoice&&key!==simulatedTarget)return;const now=performance.now();values.set(key,Math.max(0,Math.min(1,level<50?0:(level-50)/50)));if(level<=0){release.add(key);speeches.delete(key);}else{release.delete(key);if(smooth&&modes.get(key)==='simulated'&&!speeches.has(key)){const s={start:now,seed:0x725ab+ ++serial*7919,count:0};nextSyllable(s);speeches.set(key,s);}}original(key,level);bind();};
 function bind(){for(const obj of stage.figureObjects){if(obj.sourceType!=='live2d')continue;for(const model of obj.pixiContainer?.children||[]){const inner=model.internalModel;if(!inner||bound.has(inner))continue;bound.add(inner);inner.on('beforeModelUpdate',()=>{if(hold&&values.has(obj.key))apply(inner,values.get(obj.key));const core=inner.coreModel;inner.__exportDrawnMouth=core.getParamFloat?.('PARAM_MOUTH_OPEN_Y')??core.getParameterValueById?.('ParamMouthOpenY');});}}}
 globalThis.__exportRefreshMouth=()=>{bind();if(!hold)return;const now=performance.now();for(const [key,s] of speeches){while(now-s.start>=s.period){s.start+=s.period;nextSyllable(s);}const phase=(now-s.start)/(s.period-s.rest);values.set(key,phase<1?s.height*Math.sin(Math.PI*Math.max(0,phase))**2:0);}for(const obj of stage.figureObjects)if(values.has(obj.key))for(const model of obj.pixiContainer?.children||[])apply(model.internalModel,values.get(obj.key));};
 globalThis.__exportMouthValues=values;
 globalThis.__exportMouthSamples=[];
 globalThis.__exportRecordMouth=t=>{if(globalThis.__exportMouthDiagnostics)for(const obj of stage.figureObjects){const inner=obj.pixiContainer?.children?.[0]?.internalModel;if(inner)globalThis.__exportMouthSamples.push({t,key:obj.key,mode:modes.get(obj.key),requested:values.get(obj.key),actual:inner.__exportDrawnMouth});}for(const key of release)values.delete(key);release.clear();};
}

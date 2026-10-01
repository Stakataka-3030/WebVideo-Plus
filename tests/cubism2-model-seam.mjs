// Opt-in numerical regression. Supply the separately authorized SDK and a lawful
// model; neither is redistributed or downloaded by this test. See docs/CUBISM2_TESTING.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [modelFile,sdkFile,casesFile,output]=process.argv.slice(2);
if(!modelFile||!sdkFile||!casesFile||!output)throw Error('Usage: node tests/cubism2-model-seam.mjs <model.json> <approved live2d.min.js> <cases.json> <output directory>');
const root=fileURLToPath(new URL('../',import.meta.url));
const sdk=fs.readFileSync(sdkFile),sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
const sdkHash=sha256(sdk);
assert.equal(sdkHash,'1f38a810c2ea019cc179ce49e1573bf6ed3b4ce700399a6df869430e20dda0d8','Unreviewed SDK: this harness only permits the separately approved SDK bytes');
const settings=JSON.parse(fs.readFileSync(modelFile,'utf8')),cases=JSON.parse(fs.readFileSync(casesFile,'utf8'));
assert.ok(Array.isArray(cases)&&cases.length,'cases.json must be a nonempty array');
assert.ok(!settings.motions?.idle?.length,'This focused harness requires a model without the default idle group');
for(const c of cases){
 assert.ok(typeof c.group==='string'&&settings.motions?.[c.group]?.[0],`Missing motion group ${c.group}`);
 assert.ok(Number.isFinite(c.cutSeconds)&&c.cutSeconds>=3&&Number.isInteger(c.cutSeconds*60),'cutSeconds must be at least three seconds and align to a 60 fps frame');
 assert.ok(!(c.repeatSeconds!==undefined&&c.stopSeconds!==undefined),'Choose a repeat or stop, not both');
 for(const key of ['repeatSeconds','stopSeconds'])assert.ok(c[key]===undefined||(Number.isFinite(c[key])&&c[key]>=0&&c[key]<c.cutSeconds),key+' must precede the cut');
}
const readModel=file=>fs.readFileSync(path.resolve(path.dirname(modelFile),file));
const model=readModel(settings.model);
const motionBytes=Object.fromEntries([...new Set(cases.map(c=>c.group))].map(group=>[group,Array.from(readModel(settings.motions[group][0].file))]));
const physics=settings.physics?JSON.parse(readModel(settings.physics)): {physics_hair:[]};
// Only JSON data enters the SDK VM. No host functions, require, process, file or
// network APIs are exposed. This is a restricted numerical harness, not WebGL.
const context=vm.createContext({}, {codeGeneration:{strings:false,wasm:false}});
const run=(source,timeout=30000)=>vm.runInContext(source,context,{timeout});
run("globalThis.window=globalThis;globalThis.navigator={userAgent:'Offline numerical test'};globalThis.__logs=[];globalThis.console={log:(...a)=>__logs.push(a.map(String).join(' ')),warn:(...a)=>__logs.push(a.map(String).join(' ')),error:(...a)=>__logs.push(a.map(String).join(' '))};");
run(sdk.toString('utf8'));
run(`globalThis.modelBytes=new Uint8Array(${JSON.stringify(Array.from(model))});globalThis.motionBytes=${JSON.stringify(motionBytes)};globalThis.settings=${JSON.stringify(settings)};globalThis.physics=${JSON.stringify(physics)};`);
run(`
 globalThis.fps=60;globalThis.now=100000;UtSystem.getUserTimeMSec=()=>now;
 const originalMotionUpdate=Live2DMotion.prototype.updateParam;
 Live2DMotion.prototype.updateParam=function(core,entry){originalMotionUpdate.call(this,core,entry);if(entry.isFinished()&&this.onFinishHandler){this.onFinishHandler(this);delete this.onFinishHandler;}};
 globalThis.makeCore=()=>{const core=Live2DModelWebGL.loadModel(modelBytes.buffer);for(const p of settings.init_params||[])core.setParamFloat(p.id,p.val??p.value);core.saveParam();return core;};
 globalThis.vertices=core=>core.getModelContext()._$aS.map((d,i)=>Array.from(core.getTransformedPoints(i)||[]));
 globalThis.compareVertices=(a,b)=>{let max=0,moved=0;for(let i=0;i<a.length;i++){let m=0;for(let j=0;j<a[i].length;j++)m=Math.max(m,Math.abs(a[i][j]-b[i][j]));if(m>0)moved++;max=Math.max(max,m);}return {max,moved,total:a.length};};
 globalThis.makePhysics=()=>physics.physics_hair.map(d=>{const h=new PhysicsHair();h.setup(d.setup.length,d.setup.regist,d.setup.mass);const types={x:PhysicsHair.Src.SRC_TO_X,y:PhysicsHair.Src.SRC_TO_Y,angle:PhysicsHair.Src.SRC_TO_G_ANGLE};for(const s of d.src)h.addSrcParam(types[s.ptype],s.id,s.scale,s.weight);for(const t of d.targets)h.addTargetParam(types[t.ptype],t.id,t.scale,t.weight);return h;});
 globalThis.makeManager=(loop=false)=>{
  const cache={},queue=new MotionQueueManager();
  return {queueManager:queue,groups:{idle:'idle'},definitions:settings.motions,settings:{...settings,initParams:(settings.init_params||[]).map(p=>({id:p.id,value:p.val??p.value}))},
   loadMotion:async(group,index)=>{if(!cache[group]){const m=Live2DMotion.loadMotion(new Uint8Array(motionBytes[group]).buffer);m.setFadeIn(500);m.setFadeOut(500);if(loop)m._$aL(true);cache[group]=m;}return cache[group];},
   stopAllMotions(){queue.stopAllMotions();},async startMotion(group,index,priority){const m=await this.loadMotion(group,index);queue.stopAllMotions();queue.startMotion(m);return true;}};
 };
 // Match the motion/save/transient-physics/deform/load layering, omitting GL,
 // expression, focus and pose controllers. Thus this test does not compare pixels.
 globalThis.step=(core,manager,hairs,frame)=>{
  const timeMs=Math.round(frame*1000/fps);now=100000+timeMs;
  manager.queueManager.updateParam(core);core.saveParam();
  core.setParamFloat('PARAM_BREATH',.5+.5*Math.sin(timeMs/1000*2*Math.PI/3.2345));
  for(const h of hairs)h.update(core,640+timeMs);
  const hair=core.getParamFloat('PARAM_HAIR_FRONT');core.getModelContext().update();
  const geometry=vertices(core);core.loadParam();return {hair,geometry};
 };
`);
const render=fs.readFileSync(path.join(root,'browser/render.js'),'utf8');
const slice=(from,to)=>{const a=render.indexOf(from),b=render.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,`Missing exporter anchor ${from}`);return render.slice(a,b);};
run(slice('globalThis.__exportHash32=','globalThis.__exportLive2DEventAt=')+slice('  const cubism2Entries=async','  const cubism4Entries=async'));
run(fs.readFileSync(path.join(root,'browser/workload.js'),'utf8'));
const results=[];
for(const scenario of cases){
 const result=await run(`(async()=>{
  const scenario=${JSON.stringify(scenario)},group=scenario.group,cut=scenario.cutSeconds;
  const changedAt=scenario.stopSeconds??scenario.repeatSeconds,times=changedAt===undefined?[0]:[0,changedAt*1000];
  const args=[{key:'id',value:'actor'},{key:'motion',value:group}];
  const parsed={sentenceList:times.map((t,i)=>({command:1,commandRaw:'changeFigure',content:'model.json',args:i>0&&scenario.stopSeconds!==undefined?[{key:'id',value:'actor'},{key:'bounds',value:'0,0,0,0'}]:args,startLine:i,endLine:i}))};
  const plan=__buildNativeWorkload({script:times.map(()=>'changeFigure:model.json;').join('\\n'),parsed,media:{},animations:{},timing:{durationSeconds:cut+4,lineTimes:times},root:'/test',project:'test',sceneName:'motion-seam.txt',fps});
  const planned=plan.live2dLifetimes[0];
  // Independent continuous oracle: repeated same-name commands are no-ops.
  const core=makeCore(),manager=makeManager(scenario.loop),hairs=makePhysics();now=100000;
  const continuousSeek=await manager.startMotion(group,0,3);
  const stopFrame=scenario.stopSeconds===undefined?-1:Math.ceil(scenario.stopSeconds*fps-.000001);
  let continuous;for(let frame=0;frame<=Math.round(cut*fps);frame++){if(frame===stopFrame)manager.stopAllMotions();continuous=step(core,manager,hairs,frame);}
  const restoredCore=makeCore(),restoredManager=makeManager(scenario.loop),restoredHairs=makePhysics(),first=cut-3;now=100000+first*1000;
  const restoredSeek=await __exportSeekCubism2Current(restoredManager,restoredManager.queueManager,restoredCore,'actor',planned,first*1000);
  let restored;for(let frame=Math.round(first*fps);frame<=Math.round(cut*fps);frame++){if(frame===stopFrame)restoredManager.stopAllMotions();restored=step(restoredCore,restoredManager,restoredHairs,frame);}
  return JSON.stringify({scenario,continuousSeek,restoredSeek,motionEpochs:planned.motionEvents.map(e=>({atMs:e.atMs,group:e.group})),continuousHair:continuous.hair,restoredHair:restored.hair,vertexDiff:compareVertices(continuous.geometry,restored.geometry)});
 })()`);
 results.push(JSON.parse(result));
}
fs.mkdirSync(output,{recursive:true});
const report={sdkSha256:sdkHash,modelSha256:sha256(model),scope:'Actual SDK/model and exporter helpers; simplified manager and numerical core update, no full plugin/browser/GL or original scene.',results,logs:JSON.parse(run('JSON.stringify(__logs)'))};
fs.writeFileSync(path.join(output,'cubism2-model-seam.json'),JSON.stringify(report,null,2)+'\n');
for(const r of results){
 assert.equal(r.continuousSeek,true,`continuous seek failed: ${JSON.stringify(r.scenario)}`);
 assert.equal(r.restoredSeek,true,`restored seek failed: ${JSON.stringify(r.scenario)}`);
 assert.equal(r.motionEpochs.length,r.scenario.stopSeconds===undefined?1:2,`unexpected motion epochs: ${JSON.stringify(r.scenario)}`);
 assert.ok(r.vertexDiff.total>0,`model has no drawables: ${JSON.stringify(r.scenario)}`);
 assert.equal(r.vertexDiff.max,0,`geometry differs: ${JSON.stringify(r.scenario)}`);
}
console.log(`Cubism2 numerical seam regression passed: ${results.length} cases`);

// Optional contract test against the SHA-256-pinned official raw WebGAL 4.6.5 bundle.
// Runs its figure-state/identity/motion functions and state setters unchanged.
// Unrelated animations, graphics, and numeric-array equality use test collaborators.
// No GPU, native browser, Cubism core, or actual MOC model is executed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundlePath=process.argv[2];
assert.ok(bundlePath,'Pass the official raw 4.6.5 assets/index-CC7KTie-.js bundle');
// An optional checkout argument permits review of an isolated integration tree.
const implementationRoot=process.argv[3]?path.resolve(process.argv[3]):root;
const bundle=fs.readFileSync(bundlePath,'utf8');
assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'),'356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6','Use the pinned official raw 4.6.5 runtime');
const between=(start,end)=>{const a=bundle.indexOf(start),b=bundle.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`missing runtime anchors ${start}`);return bundle.slice(a,b);};
const figure=between('function A$(e){','function T$('),identity=between('function VM(','function '),slot=between('function HM(','function eRe('),sync=between('function eRe(','function tRe(');
const method=between('changeModelMotionByKey(t,r){','changeSpineAnimationByKey(t,r){');
const stateMethods=between('setFreeFigureByKey(t){','setLive2dExpression(t){'),normalizeBounds=between('function rm(e){','const PE='),associated=between('function E$(e,t){','function A$(e){');
const workload=fs.readFileSync(path.join(implementationRoot,'browser/workload.js'),'utf8');
const cases=[
 [{motion:'pose'},{motion:'pose'},{motion:'pose',expression:'smile'}],
 [{motion:'pose'},{motion:'wave'},{motion:'pose'}],
 [{motion:'pose'},{},{motion:''},{motion:'pose'}],
 [{},{motion:''},{motion:'pose'}],
 [{motion:'pose'},{skin:'costume'},{skin:'costume'},{motion:'pose'}],
 [{motion:'pose'},{bounds:'0,0,0,0'},{bounds:'0,0,0,0'},{motion:'pose'}],
 [{motion:'pose'},{source:'other/model.json',motion:'pose'}],
 [{motion:'pose'},{left:true,motion:'pose'}],
 [{motion:'pose'},{bounds:'1,2,3,4',motion:'pose'}],
 [{motion:'pose'},{source:'none'},{motion:'pose'}],
 [{motion:'pose'},{clear:true},{motion:'pose'}],
 [{motion:'pose',bounds:'1,2,3,4'},{motion:'pose',bounds:'1.0, 2e0,03,4.00'},{motion:'pose'}],
 [{motion:'pose',bounds:'1,2,3,4'},{source:'other/model.json'},{source:'other/model.json',motion:'pose',bounds:'0,0,0,0'}],
 [{motion:'pose'},{bounds:'invalid'},{motion:'pose'}],
 [{motion:'pose',bounds:'1,2,3,4'},{bounds:'invalid',motion:'pose'}],
];
for(const commands of cases){
 const context=vm.createContext({assert,structuredClone});
 vm.runInContext(`
  const state={freeFigure:[],live2dMotion:[],live2dExpression:[],live2dBlink:[],live2dFocus:[],animationSettings:[],figureAssociatedAnimation:[]};
  class RuntimeState{${stateMethods}};
  const X=Object.assign(new RuntimeState(),{calculationStageState:state,getCalculationStageState:()=>state,setStage:(k,v)=>state[k]=v,setLive2dExpression(){},setLive2dBlink(){},setLive2dFocus(){},setFigureMetaData(){},updateAnimationSettings(){},removeEffectByTargetId(){},removeAnimationSettingsByTarget(){}});
  const Ue=(s,k)=>s.args.find(a=>a.key===k)?.value,Qt=(s,k)=>!!Ue(s,k),bn=(s,k)=>Ue(s,k),C_=s=>['left','right','left13','right13','left14','right14'].find(k=>Ue(s,k));
  const Ls='none',Ed=350,M3=450,Wn={figure:0},Ho=x=>x,mwe=(a,b)=>JSON.stringify(a)===JSON.stringify(b),wt=structuredClone,pu={},vu={},pC=()=>[{}],oi=()=>0,TC=()=>null,K={debug(){},error(){}};
  ${normalizeBounds}${associated}
  const R={gameplay:{performController:{unmountPerform(){}}},animationManager:{addAnimation(){}},figureDiffManager:{consume(){return false;}}};
  globalThis.RuntimeStage=class {${method}};
  const stage=new RuntimeStage();stage.figureObjects=[];stage.live2dFigureRecorder=[];stage.changeSpineSkinByKey=()=>{};
  stage.getStageObjByKey=key=>stage.figureObjects.find(x=>x.key===key);
  stage.updateL2dMotionByKey=(target,motion)=>{let r=stage.live2dFigureRecorder.find(x=>x.target===target);if(!r)stage.live2dFigureRecorder.push(r={target});r.motion=motion;};
  R.gameplay.pixiStage=stage;
  let atMs=0;const lives=[];
  const LA=old=>{old.life.endMs=atMs;stage.figureObjects=stage.figureObjects.filter(x=>x!==old);};
  const nRe=(key,source,position)=>{const life={startMs:atMs,endMs:30000,motionEvents:[]};lives.push(life);const child={internalModel:{motionManager:{stopAllMotions(){}}},motion(group){life.motionEvents.push([atMs,group]);}};stage.figureObjects.push({key,sourceUrl:source,sourceType:'live2d',life,pixiContainer:{children:[child]}});const motion=state.live2dMotion.find(x=>x.target===key)?.motion??'';stage.updateL2dMotionByKey(key,motion);if(motion)child.motion(motion);};
  ${figure}${identity}${slot}${sync}
  globalThis.apply=(sentence,time)=>{atMs=time;A$(sentence);const f=state.freeFigure.find(x=>x.key==='actor');HM({key:'actor',sourceUrl:f?.name??'',position:f?.basePosition??'center',bounds:state.live2dMotion.find(x=>x.target==='actor')?.overrideBounds,skipAnimation:true});eRe(state);};
  globalThis.runtimeLives=lives;
  ${workload}
 `,context);
 const sentenceList=commands.map(({source='hero/model.json',...args},i)=>({command:1,commandRaw:'changeFigure',content:source,args:Object.entries({id:'actor',next:true,...args}).map(([key,value])=>({key,value})),startLine:i,endLine:i}));
 sentenceList.forEach((s,i)=>context.apply(s,i*8000));
 const plan=context.__buildNativeWorkload({script:sentenceList.map(s=>'changeFigure:'+s.content+';').join('\n'),parsed:{sentenceList},media:{},animations:{},timing:{lineTimes:commands.map((_,i)=>i*8000),durationSeconds:30},root:'/test',project:'test',sceneName:'contract.txt',fps:60});
 const actual=Array.from(plan.live2dLifetimes,l=>({startMs:l.startMs,endMs:l.endMs,motionEvents:Array.from(l.motionEvents,e=>[e.atMs,e.group])}));
 assert.deepEqual(actual,JSON.parse(JSON.stringify(context.runtimeLives)),JSON.stringify(commands));
}
console.log(`Cubism2 motion planner matches pinned official WebGAL 4.6.5 runtime: ${cases.length} lifecycle scenarios`);

// The export clock advances tickers before dispatch; only _render evaluates motion.
const plugin=fs.readFileSync(path.join(path.dirname(bundlePath),'index.es-0XzJiDJZ.js'),'utf8');
assert.equal(crypto.createHash('sha256').update(plugin).digest('hex'),'8b6c11ea8b4724dd8254d61a009c4d0e7cc7389f31f76570dac354c56b11a724');
const from=plugin.indexOf('onTickerUpdate(){this.update(G.shared.deltaMS)}'),to=plugin.indexOf('destroy(t){',from);assert.ok(from>=0&&to>from);
const context=vm.createContext({});
vm.runInContext(`const G={shared:{deltaMS:16.6666667}},Ze={copyFrom(){return this},append(){return this}};class Model{${plugin.slice(from,to)}};globalThis.Model=Model;`,context);
const model=new context.Model(),calls=[];let playing=true,savedPose=41;
Object.assign(model,{deltaTime:0,elapsedTime:0,glContextID:1,textures:[],checkAlphaChange(){},registerInteraction(){},internalModel:{update(delta,elapsed){calls.push({delta,elapsed,playing});if(playing)savedPose++;},updateTransform(){},draw(){}}});
const reset={reset(){}},renderer={plugins:{interaction:{}},batch:reset,geometry:reset,shader:reset,state:reset,texture:reset,CONTEXT_UID:1,framebuffer:{viewport:{x:0,y:0,width:1920,height:1080}},globalUniforms:{uniforms:{projectionMatrix:{}}}};
model.onTickerUpdate();assert.equal(calls.length,0,'ticker must not evaluate motion');assert.equal(savedPose,41);
playing=false;model._render(renderer);assert.equal(calls.length,1);assert.equal(calls[0].playing,false);assert.equal(savedPose,41,'post-dispatch render must preserve last pre-stop saved pose');
const rendererSource=fs.readFileSync(path.join(implementationRoot,'src/Renderer.cs'),'utf8');assert.match(rendererSource,/app\.ticker\.remove\(app\.render,app\)/);
console.log('PASS actual pinned 4.6.5 Live2D ticker/_render methods: ticker only accumulates elapsed time; stop-before-render preserves previous-frame saved pose');

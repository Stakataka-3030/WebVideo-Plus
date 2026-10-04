// Optional contract test against the SHA-256-pinned WebGAL 4.6.4 / 4.6.5 bundles.
// Runs only its figure-state/identity/motion functions with mock stage collaborators.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundlePath=process.argv[2]||path.join(root,'package/runtime/web/assets/index-R1tKotR6.js');
const bundle=fs.readFileSync(bundlePath,'utf8');
const bundleHash=crypto.createHash('sha256').update(bundle).digest('hex'),is465=bundleHash==='356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6';
assert.ok(is465||bundleHash==='d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10','Use one of the exact supported runtimes');
const between=(start,end)=>{const a=bundle.indexOf(start),b=bundle.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`missing runtime anchors ${start}`);return bundle.slice(a,b);};
const figure=is465?between('function A$(e){','function T$('):between('function USe(e){','const DU='),identity=between(is465?'function VM(':'function sPe(','function '),slot=between(is465?'function HM(':'function sM(',is465?'function eRe(':'function pPe('),sync=between(is465?'function eRe(':'function pPe(',is465?'function tRe(':'function vPe(');
const method=between('changeModelMotionByKey(t,r){','changeSpineAnimationByKey(t,r){');
const workload=fs.readFileSync(path.join(root,'browser/workload.js'),'utf8');
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
  const Y={getCalculationStageState:()=>state,setStage:(k,v)=>state[k]=v,setLive2dMotion(v){const old=state.live2dMotion.find(x=>x.target===v.target);if(old){const bounds=old.overrideBounds;Object.assign(old,v);if(v.overrideBounds===undefined)old.overrideBounds=bounds;}else state.live2dMotion.push(v);},setFreeFigureByKey(v){state.freeFigure=state.freeFigure.filter(x=>x.key!==v.key);if(v.name)state.freeFigure.push(v);},setLive2dExpression(){},setLive2dBlink(){},setLive2dFocus(){},setFigureMetaData(){},updateAnimationSettings(){},removeEffectByTargetId(){},removeAnimationSettingsByTarget(){}};
  const je=(s,k)=>s.args.find(a=>a.key===k)?.value,Gt=(s,k)=>!!je(s,k),yn=(s,k)=>je(s,k),LT=s=>['left','right','left13','right13','left14','right14'].find(k=>je(s,k));
  const nf='none',Y3=350,K3=450,rn={figure:0},yi=x=>x,Ag=x=>x??[0,0,0,0],jSe=(a,b)=>JSON.stringify(a)===JSON.stringify(b),vt=structuredClone,ol={},al={},jT=()=>[{}],ri=()=>0,cp=()=>null,ee={debug(){},error(){}};
  const I={gameplay:{performController:{unmountPerform(){}}},animationManager:{addAnimation(){}}};
  globalThis.RuntimeStage=class {${method}};
  const stage=new RuntimeStage();stage.figureObjects=[];stage.live2dFigureRecorder=[];stage.changeSpineSkinByKey=()=>{};
  stage.getStageObjByKey=key=>stage.figureObjects.find(x=>x.key===key);
  stage.updateL2dMotionByKey=(target,motion)=>{let r=stage.live2dFigureRecorder.find(x=>x.target===target);if(!r)stage.live2dFigureRecorder.push(r={target});r.motion=motion;};
  I.gameplay.pixiStage=stage;
  let atMs=0;const lives=[];
  const QE=old=>{old.life.endMs=atMs;stage.figureObjects=stage.figureObjects.filter(x=>x!==old);};
  const mPe=(key,source,position)=>{const life={startMs:atMs,endMs:30000,motionEvents:[]};lives.push(life);const child={internalModel:{motionManager:{stopAllMotions(){}}},motion(group){life.motionEvents.push([atMs,group]);}};stage.figureObjects.push({key,sourceType:'live2d',life,pixiContainer:{children:[child]}});const motion=state.live2dMotion.find(x=>x.target===key)?.motion??'';stage.updateL2dMotionByKey(key,motion);if(motion)child.motion(motion);};
  ${is465?`const X=Y,R=I,Ue=je,Qt=Gt,bn=yn,C_=LT,Ls=nf,Ed=Y3,M3=K3,rm=Ag,mwe=jSe,wt=vt,pu=ol,vu=al,pC=jT,oi=ri,Rp=cp,K=ee,TC=yi,E$=()=>{};I.figureDiffManager={consume:()=>false};const LA=QE,nRe=mPe;`:''}
  ${figure}${identity}${slot}${sync}
  globalThis.apply=(sentence,time)=>{atMs=time;${is465?'A$':'USe'}(sentence);const f=state.freeFigure.find(x=>x.key==='actor');${is465?'HM':'sM'}({key:'actor',sourceUrl:f?.name??'',position:f?.basePosition??'center',bounds:state.live2dMotion.find(x=>x.target==='actor')?.overrideBounds,skipAnimation:true});${is465?'eRe':'pPe'}(state);};
  globalThis.runtimeLives=lives;
  ${workload}
 `,context);
 const sentenceList=commands.map(({source='hero/model.json',...args},i)=>({command:1,commandRaw:'changeFigure',content:source,args:Object.entries({id:'actor',next:true,...args}).map(([key,value])=>({key,value})),startLine:i,endLine:i}));
 sentenceList.forEach((s,i)=>context.apply(s,i*8000));
 const plan=context.__buildNativeWorkload({script:sentenceList.map(s=>'changeFigure:'+s.content+';').join('\n'),parsed:{sentenceList},media:{},animations:{},timing:{lineTimes:commands.map((_,i)=>i*8000),durationSeconds:30},root:'/test',project:'test',sceneName:'contract.txt',fps:60});
 const actual=Array.from(plan.live2dLifetimes,l=>({startMs:l.startMs,endMs:l.endMs,motionEvents:Array.from(l.motionEvents,e=>[e.atMs,e.group])}));
 assert.deepEqual(actual,JSON.parse(JSON.stringify(context.runtimeLives)),JSON.stringify(commands));
}
console.log(`Cubism2 motion planner matches pinned WebGAL ${is465?'4.6.5':'4.6.4'} runtime: ${cases.length} lifecycle scenarios`);

// The export clock advances tickers before dispatch; only _render evaluates motion.
const plugin=fs.readFileSync(path.join(path.dirname(bundlePath),is465?'index.es-0XzJiDJZ.js':'index.es-erQsk_Nn.js'),'utf8');
assert.equal(crypto.createHash('sha256').update(plugin).digest('hex'),is465?'8b6c11ea8b4724dd8254d61a009c4d0e7cc7389f31f76570dac354c56b11a724':'46590e11b6fb9877524fbb27525734d5208b67b3d28b4afb226d849bc95d7505');
const from=plugin.indexOf('onTickerUpdate(){this.update(G.shared.deltaMS)}'),to=plugin.indexOf('destroy(t){',from);assert.ok(from>=0&&to>from);
const context=vm.createContext({});
vm.runInContext(`const G={shared:{deltaMS:16.6666667}},Ze={copyFrom(){return this},append(){return this}};class Model{${plugin.slice(from,to)}};globalThis.Model=Model;`,context);
const model=new context.Model(),calls=[];let playing=true,savedPose=41;
Object.assign(model,{deltaTime:0,elapsedTime:0,glContextID:1,textures:[],checkAlphaChange(){},registerInteraction(){},internalModel:{update(delta,elapsed){calls.push({delta,elapsed,playing});if(playing)savedPose++;},updateTransform(){},draw(){}}});
const reset={reset(){}},renderer={plugins:{interaction:{}},batch:reset,geometry:reset,shader:reset,state:reset,texture:reset,CONTEXT_UID:1,framebuffer:{viewport:{x:0,y:0,width:1920,height:1080}},globalUniforms:{uniforms:{projectionMatrix:{}}}};
model.onTickerUpdate();assert.equal(calls.length,0,'ticker must not evaluate motion');assert.equal(savedPose,41);
playing=false;model._render(renderer);assert.equal(calls.length,1);assert.equal(calls[0].playing,false);assert.equal(savedPose,41,'post-dispatch render must preserve last pre-stop saved pose');
const rendererSource=fs.readFileSync(path.join(root,'src/Renderer.cs'),'utf8');assert.match(rendererSource,/app\.ticker\.remove\(app\.render,app\)/);
console.log('PASS actual pinned Live2D ticker/_render methods: ticker only accumulates elapsed time; stop-before-render preserves previous-frame saved pose');

// Runs unchanged functions extracted from the exact official 4.6.6 release.
// Collaborators model state only; native Pixi/rendered pixel parity is a separate Windows suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtime=process.env.WEBGAL466_ROOT||path.join(root,'.build/upstream466/web');
const entry=path.join(runtime,'assets/index-Dcp3ZA1M.js');
const available=fs.existsSync(entry);
if(process.env.WEBGAL466_ROOT)assert.ok(available,'Explicit WEBGAL466_ROOT must contain the official 4.6.6 bundle');
const source=available?fs.readFileSync(entry,'utf8'):'';
if(available)assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'d2b34606a380b9575ce1e50ed2251cb5e38b3d6f9b00200b2b0f252a13d209c0','Unmodified official 4.6.6 bundle required');
const check=(name,fn)=>test(name,{skip:available?false:'Set WEBGAL466_ROOT to the exact official 4.6.6 engine shell'},fn);
const plain=value=>JSON.parse(JSON.stringify(value));
const get=(obj,key)=>key.split('.').reduce((o,k)=>o?.[k],obj);
function set(obj,key,value){const parts=key.split('.');let o=obj;for(const k of parts.slice(0,-1))o=o[k]??= {};o[parts.at(-1)]=value;return obj;}
function merge(a,b){for(const [key,value]of Object.entries(b||{})){if(value&&typeof value==='object'&&!Array.isArray(value))merge(a[key]??={},value);else a[key]=value;}return a;}
function block(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);assert.equal(source.indexOf(start,a+start.length),-1,'Extraction start must be unique: '+start);return source.slice(a,b);}
function oracle(base={}){
 const context={structuredClone,ie:(o,k,v)=>o[k]=v,B_e:(o,p)=>Object.fromEntries(Object.entries(o).filter(([,v])=>p(v))),wn:f=>f,d1e:set,Xc:get,E1e:()=>x=>x,At:structuredClone,lRe:merge,Vt:(e,k)=>e.args?.find(a=>a.key===k)?.value,X:{debug(){}},Qe:{say:0,setAnimation:1,setTempAnimation:2}};
 context.globalThis=context;vm.createContext(context);
 const normalization='const '+block('j_e=["add"','const z_e=');
 const defaults=block('const Ti={',',O_=')+';';
 vm.runInContext(normalization+defaults+block('const G_=wn(d1e)','function wf(')+block('function U$(','const $$=')+block('function kp(','function W$(')+block('function OEe(','function REe(')+block('function cRe(','const fRe='),context);
 vm.runInContext('globalThis.api={normalize:_C,tracks:B$,end:v1e,sample:U$,defaults:Ti,Manager:U_e,compile:kp,duration:ai,isRelative:P1e,temp:OEe,preview:cRe};',context);
 context.state={effects:[{target:'hero',transform:merge(structuredClone(context.api.defaults),base)}],PerformList:[]};context.reruns=[];context.calls=[];
 context.q={getCalculationStageState:()=>context.state,updateEffect:({target,transform})=>{const row=context.state.effects.find(x=>x.target===target);merge(row.transform,transform);},removeAllPerform(){context.calls.push('remove');},setStage:(key,value)=>context.state[key]=value,commit(options){context.calls.push(['commit',options]);},applyCommittedPixiEffects(){context.calls.push('apply');}};
 context.R={animationManager:new context.api.Manager(),gameplay:{pixiStage:{removeAnimationByTargetKey:e=>context.calls.push(['removeAnimation',e])},performController:{beginCollectingPerforms(){context.calls.push('begin');},endCollectingPerforms(){context.calls.push('end');},arrangeNewPerform:(p,s)=>context.reruns.push(s),commitPendingPerforms(){context.calls.push('pending');}}}};
 context.cO=e=>{context.reruns.push(e);if(e.command===1)context.api.compile(e.content,'hero',false,false);};context.h8=e=>({script:e});context.k8=(target,value)=>context.rendered={target,value:plain(value)};
 const restore=block('const WTe=',',HTe=')+';globalThis.restore=d8;';vm.runInContext(restore,context);
 const tracks=(raw,overrides={})=>context.api.tracks(context.api.normalize(raw,overrides),{base:context.state.effects[0].transform,writeFullEffect:false});
 const sample=(raw,time,overrides={})=>{const result=structuredClone(context.state.effects[0].transform);for(const t of tracks(raw,overrides))set(result,t.path,context.api.sample(t.points,time));return plain(result);};
 return {context,tracks,sample,end:(raw,overrides={})=>plain(context.api.end(tracks(raw,overrides)))};
}
check('v1 arrays preserve cumulative duration and hold the first value before its first frame',()=>{
 const o=oracle({position:{x:100,y:20}}),raw=[{duration:500,position:{x:30}},{duration:700,position:{x:80}}];
 assert.deepEqual(plain(o.context.api.normalize(raw,{}).keyframes.map(f=>f.time)),[500,1200]);assert.equal(o.sample(raw,0).position.x,30);assert.equal(o.sample(raw,850).position.x,55);assert.equal(o.end(raw).position.x,80);
 assert.equal(o.context.api.normalize(raw,{}).version,1);assert.equal(o.context.api.normalize({version:1,relative:true,keyframes:raw},{}).relative,false);
});
check('v2 sorting, relative defaults, sparse axis inheritance, and absolute duration follow native tracks',()=>{
 const o=oracle({position:{x:100,y:20},scale:{x:2,y:0},alpha:0.8}),raw={version:2,keyframes:[{time:2000,position:{y:40},scale:{y:3}},{time:1000,position:{x:60},scale:{x:1.5},alpha:0.4}]};
 assert.deepEqual(plain(o.context.api.normalize(raw,{}).keyframes.map(f=>f.time)),[1000,2000]);
 assert.deepEqual(o.end(raw),{alpha:0.4,scale:{x:3,y:3},position:{x:160,y:60}});
 assert.equal(o.sample(raw,500).position.x,130);assert.equal(o.sample(raw,1500).position.y,50);assert.equal(o.sample(raw,2000).scale.y,3);
 o.context.R.animationManager.addAnimation('sparse',raw);assert.equal(o.context.api.duration('sparse'),2000);
});
check('inherit=false reverts an omitted animated property to the execution baseline',()=>{
 const o=oracle({position:{x:100,y:20},alpha:0.8}),raw={version:2,inherit:false,keyframes:[{time:1000,position:{x:60},alpha:0.4},{time:2000,position:{y:40}}]};
 assert.deepEqual(o.end(raw),{alpha:0.8,position:{x:100,y:60}});assert.equal(o.sample(raw,1500).position.x,130);assert.ok(Math.abs(o.sample(raw,1500).alpha-0.6)<1e-12);
});
check('relativeCalc overrides use the top-level property and validate unknown operators',()=>{
 const o=oracle({position:{x:100,y:20},scale:{x:0,y:2},alpha:0.8}),raw={version:2,relativeCalc:{position:'multiply',scale:'multiplyWithZeroFallback',alpha:'add',blur:'invalid'},keyframes:[{time:1000,position:{x:2,y:3},scale:{x:4,y:5},alpha:0.1,blur:7}]};
 assert.deepEqual(o.end(raw),{alpha:0.9,scale:{x:4,y:10},position:{x:200,y:60},blur:7});
 assert.deepEqual(plain(o.context.api.normalize(raw,{}).relativeCalc),{position:'multiply',scale:'multiplyWithZeroFallback',alpha:'add'});
});
check('legacy temporary arrays opt into v2 only through explicit boolean relative/inherit overrides',()=>{
 const o=oracle({position:{x:100,y:20}}),raw=[{duration:500,position:{x:60}},{duration:500,position:{y:40}}];
 assert.equal(o.context.api.normalize(raw,{}).version,1);assert.equal(o.context.api.normalize(raw,{relative:'true'}).version,1);
 assert.equal(o.context.api.normalize(raw,{relative:true}).version,2);assert.equal(o.sample(raw,250,{relative:true}).position.x,130);assert.deepEqual(o.end(raw,{relative:true}),{position:{x:160,y:60}});
 const parsed=o.context.api.temp({content:JSON.stringify(raw),args:[{key:'relative',value:false},{key:'inherit',value:true}]});assert.equal(parsed.version,2);assert.equal(parsed.relative,false);assert.equal(parsed.inherit,true);
});
check('same-time v2 frames retain input order and jump to the last point at the exact time',()=>{
 const o=oracle({position:{x:100}}),raw={keyframes:[{time:1000,position:{x:20}},{time:1000,position:{x:40}},{time:2000,position:{x:80}}]};
 assert.equal(o.sample(raw,999).position.x,119.98);assert.equal(o.sample(raw,1000).position.x,140);assert.equal(o.sample(raw,1500).position.x,160);
});
check('named animation compilation commits its terminal state once and chooses current/default baseline explicitly',()=>{
 const o=oracle({position:{x:100,y:20},alpha:0.8});o.context.R.animationManager.addAnimation('move',{keyframes:[{time:1000,position:{x:60}}]});
 const current=o.context.api.compile('move','hero',false,false);assert.equal(o.context.state.effects[0].transform.position.x,160);
 assert.equal(o.context.api.sample(current.find(t=>t.path==='position.x').points,500),130);
 const next=o.context.api.compile('move','hero',false,false);assert.equal(o.context.state.effects[0].transform.position.x,220);assert.equal(o.context.api.sample(next.find(t=>t.path==='position.x').points,500),190);
 const defaults=o.context.api.compile('move','hero',true,false);assert.equal(o.context.api.sample(defaults.find(t=>t.path==='position.x').points,500),30);assert.equal(o.context.state.effects[0].transform.position.x,60);
});
check('restorePerform skips relative held named/temp animations and preserves the already committed transform',()=>{
 const o=oracle({position:{x:100,y:20}}),move={keyframes:[{time:1000,position:{x:60}}]};
 o.context.R.animationManager.addAnimation('relative',move);o.context.api.compile('relative','hero',false,false);
 o.context.R.animationManager.addAnimation('absolute',{relative:false,keyframes:[{time:1000,rotation:0.5}]});
 o.context.state.PerformList=[{script:{command:1,content:'relative'}},{script:{command:2,content:JSON.stringify(move),args:[]}},{script:{command:1,content:'absolute'}},{script:{command:0,content:'Dialogue',args:[]}}];
 o.context.restore(true);assert.equal(o.context.state.effects[0].transform.position.x,160);assert.equal(o.context.state.effects[0].transform.rotation,0.5);
 assert.deepEqual(o.context.reruns.map(e=>e.content),['absolute','Dialogue']);assert.equal(o.context.state.isDialogNotend,false);assert.deepEqual(plain(o.context.calls.find(e=>Array.isArray(e)&&e[0]==='commit')),['commit',{applyPixiEffects:false,skipAnimation:true}]);
});
check('preview seeks relative animation from a saved baseline and never mutates calculation state',()=>{
 const o=oracle({position:{x:100,y:20}}),before=plain(o.context.state.effects),raw={keyframes:[{time:1000,position:{x:60}}]};
 for(const time of [750,250,1000])o.context.api.preview({target:'hero',animation:raw,time},{position:{x:100,y:20}});
 assert.equal(o.context.rendered.value.position.x,160);assert.deepEqual(plain(o.context.state.effects),before);
 o.context.api.preview({target:'hero',animation:raw,time:500,baseTransform:{position:{x:200,y:10}}},{position:{x:100}});assert.equal(o.context.rendered.value.position.x,230);
});

function navigation(){
 const bundle=fs.readFileSync(path.join(root,'baseline/terre-4.6.6.js'),'utf8'),a=bundle.indexOf('var commandType$1;'),b=bundle.indexOf('function TabItem(',a);assert.ok(a>=0&&b>a);
 const context={URL,WebVideoHostProfile:{terreVersion:'4.6.6',transformFrom:true,animationV2:true}};context.window=context;context.globalThis=context;vm.createContext(context);
 vm.runInContext('const bo=(o,k,v)=>(o[k]=v);'+bundle.slice(a,b)+';globalThis.parse=parseScene;globalThis.types=commandType;',context);
 for(const name of ['navigation-metadata','timeline-core','navigation-model'])vm.runInContext(fs.readFileSync(path.join(root,'browser',name+'.js'),'utf8'),context);
 return (source,animations)=>context.WebVideoNavigation.derive('games/oracle/game/scene/start.txt',source,context.parse(source),context.types,animations);
}
check('navigation terminal state agrees with native current/default, parallel, inheritance and v1 full-effect compilation',()=>{
 const derive=navigation(),base={position:{x:100,y:20},scale:{x:2,y:0},alpha:0.8,brightness:0.35};
 const cases=[
  [{keyframes:[{time:500,position:{x:60}},{time:1000,scale:{x:1.5}}]},'',false,false],
  [{inherit:false,keyframes:[{time:500,position:{x:60}},{time:1000,scale:{x:1.5}}]},'',false,false],
  [{keyframes:[{time:1000,position:{x:60}}]},' -transformFrom=default',true,false],
  [{keyframes:[{time:1000,position:{x:60}}]},' -relative=false -inherit=false',false,false],
  [{keyframes:[{time:1000,position:{x:60}}]},' -transformFrom=default -parallel',true,false],
  [[{duration:500,position:{x:60}},{duration:500,scale:{x:1.5}}],'',false,false],
  [[{duration:500,position:{x:60}},{duration:500,scale:{x:1.5}}],' -transformFrom=default',true,true],
  [[{duration:500,position:{x:60}},{duration:500,scale:{x:1.5}}],' -writeDefault -ignoreDefault',true,false],
 ];
 for(const [raw,flags,fromDefault,full]of cases){
  const o=oracle(base);o.context.R.animationManager.addAnimation('oracle',raw);o.context.api.compile('oracle','hero',fromDefault,full);const expected=plain(o.context.state.effects[0].transform);
  const source='changeFigure:hero.png -id=hero -transform='+JSON.stringify(base)+';\nsetAnimation:oracle -target=hero'+flags+';\nsetTransform:'+JSON.stringify(expected)+' -target=hero -duration=0 -transformFrom=current;';
  const model=derive(source,{oracle:raw});assert.deepEqual(plain(model.statements[2].parts.flatMap(p=>p.items)),['目标：hero'],'Terminal projection differs: '+JSON.stringify([raw,flags,model.statements[2].parts]));
 }
});

check('unchanged native RAF driver preserves a different first delta after a prefix skips the preceding animation',()=>{
 // Exact release driver/scheduler/c1e code. A linear numerical generator stands
 // in for interpolation; the native tracks/interpolation are tested above.
 function driver(){
  let now=0,pending=[];const context={window:{requestAnimationFrame:fn=>{pending.push(fn);return pending.length;}},performance:{now:()=>now},h$:(obj,keys)=>Object.fromEntries(Object.entries(obj).filter(([key])=>!keys.includes(key))),Zxe:()=>({from,to,duration})=>({next:elapsed=>({value:from+(to-from)*Math.min(1,elapsed/duration),done:elapsed>=duration})})};
  vm.runInNewContext(block('const M$=','var f1e=')+';globalThis.create=c1e;',context);
  return {create:options=>context.create(options),fire:time=>{now=time;const callbacks=pending;pending=[];callbacks.forEach(fn=>fn(time));}};
 }
 const continuous=driver(),restored=driver(),values={};
 const preceding=continuous.create({from:0,to:1500,duration:1500,onUpdate(){}});
 for(let time=16;time<1000;time+=16)continuous.fire(time);
 preceding.stop(); // Same __settleNonHold at t=1000 as the actual fixture.
 continuous.create({from:0,to:2000,duration:2000,onUpdate:value=>values.continuous=value});
 restored.create({from:0,to:2000,duration:2000,onUpdate:value=>values.restored=value});
 continuous.fire(1008);restored.fire(1008);
 assert.equal(values.continuous,16);assert.ok(Math.abs(values.restored-1000/60)<1e-12);
 for(let time=1024;time<=1488;time+=16){continuous.fire(time);restored.fire(time);}
 assert.ok(Math.abs(values.restored-values.continuous-2/3)<1e-10,'Shared native driver delta accumulates the prefix phase difference until animation completion');
});

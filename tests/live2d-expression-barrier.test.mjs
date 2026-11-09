import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=name=>fs.readFileSync(new URL('../browser/'+name,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const timers=new Set(),watchdogs=new Set();
 const embedder={performanceNow:()=>0,setTimeout(fn,ms){
  if(ms===undefined){queueMicrotask(fn);return ()=>{};}
  const item={ms};item.fn=()=>{timers.delete(item);watchdogs.delete(item);fn();};timers.add(item);
  if(ms===20000)watchdogs.add(item);else item.id=setTimeout(item.fn,ms);
  return ()=>{timers.delete(item);watchdogs.delete(item);clearTimeout(item.id);};
 }};
 const stage={backgroundObjects:[],figureObjects:[]},ctx={module:{exports:{}},console,URL,location:{href:'http://fixture/'},__wgProbe:{core:{gameplay:{pixiStage:stage}}}};
 vm.createContext(ctx);vm.runInContext(read('clock-source.js'),ctx);
 const Clock=ctx.module.exports.ClockController(),clock=new Clock(embedder);clock.install(0);ctx.__pwClock={controller:clock};
 vm.runInContext(read('barrier.js')+';installStageAssetBarrier();',ctx);
 const manager={settings:{name:'fixture'},destroyed:false,__webvideoExpressionGeneration:0};
 const start=(promise,index='smile')=>ctx.__exportTrackExpression(manager,index,()=>{manager.__webvideoExpressionGeneration++;return promise;});
 const schedule=(delay,func)=>clock.addTimer({type:'Timeout',delay,func});
 return {ctx,clock,manager,stage,start,schedule,timers,watchdogs};
}
test('one runFor waits for requested expression before a later exit callback',async()=>{
 const f=fixture(),d=deferred(),seen=[];
 f.schedule(10,()=>{seen.push(['request',f.clock.performanceNow()]);f.start(d.promise.then(()=>seen.push(['applied',f.clock.performanceNow()])));});
 f.schedule(20,()=>{seen.push(['destroy',f.clock.performanceNow()]);f.manager.destroyed=true;});
 let done=false;const run=f.clock.runFor(100).then(()=>{done=true;});await turn();
 assert.equal(done,false);assert.equal(f.clock.performanceNow(),10);assert.deepEqual(seen,[['request',10]]);
 d.resolve();await run;assert.deepEqual(seen,[['request',10],['applied',10],['destroy',20]]);assert.equal(f.clock.performanceNow(),100);assert.equal(f.timers.size,0);
});
test('last callback and zero-time replay wait for application before returning',async()=>{
 for(const delay of [0,10]){const f=fixture(),d=deferred();let applied=false,done=false;f.schedule(delay,()=>f.start(d.promise.then(()=>{applied=true;})));const run=f.clock.runFor(delay).then(()=>{assert.equal(applied,true);done=true;});await turn();assert.equal(done,false);d.resolve();await run;assert.equal(f.clock.performanceNow(),delay);assert.equal(f.timers.size,0);}
});
test('active rejection exits clock and stage barrier without advancing story',async()=>{
 const f=fixture(),d=deferred();f.schedule(10,()=>f.start(d.promise));f.schedule(20,()=>assert.fail('Future story ran after loading error'));
 const run=f.clock.runFor(100),rejected=assert.rejects(run,/expression transport failed/);await turn();d.reject(Error('expression transport failed'));await rejected;assert.equal(f.clock.performanceNow(),10);await assert.rejects(f.ctx.__exportWaitForStageAssets(),/expression transport failed/);assert.equal(f.timers.size,0);
});
test('destruction during the real wait releases it even if transport never settles',async()=>{
 const f=fixture(),d=deferred();f.start(d.promise);const run=f.clock.runFor(100);await turn();f.manager.destroyed=true;await run;assert.equal(f.clock.performanceNow(),100);assert.equal(f.timers.size,0);
});
test('superseded requests and unrequested optional prefetch do not block',async()=>{
 const f=fixture(),old=deferred(),current=deferred();const optional=Array.from({length:897},deferred);f.start(old.promise,'old');f.start(current.promise,'new');const run=f.clock.runFor(100);await turn();current.resolve();await run;assert.equal(f.clock.performanceNow(),100);assert.equal(f.timers.size,0);assert.equal(optional.length,897);
});
test('new expression issued while completing a request remains a blocker',async()=>{
 const f=fixture(),first=deferred(),second=deferred();f.start(first.promise.then(()=>{f.start(second.promise,'second');}));let done=false;const run=f.clock.runFor(100).then(()=>{done=true;});first.resolve();await turn();assert.equal(done,false);second.resolve();await run;assert.equal(f.timers.size,0);
});
test('future virtual-timer dependency fails with a real deadline rather than deadlocking',async()=>{
 const f=fixture(),d=deferred();f.schedule(10,()=>{f.start(d.promise);f.schedule(5,()=>d.resolve());});
 const run=f.clock.runFor(100),rejected=assert.rejects(run,/Live2D 表情加载超时.*smile/);await turn();assert.equal(f.clock.performanceNow(),10);assert.equal(f.watchdogs.size,1);
 const [deadline]=f.watchdogs;assert.equal(deadline.ms,20000);deadline.fn();await rejected;assert.equal(f.clock.performanceNow(),10);assert.equal(f.timers.size,0);
});
test('missing-stage timeout and prepare pumping remain bounded and do not advance time',async()=>{
 const f=fixture(),object={key:'hero',sourceUrl:'model.json',pixiContainer:{children:[]}};f.stage.figureObjects.push(object);
 let pumped=0;f.stage.currentApp={renderer:{plugins:{prepare:{queue:[1],delayedTick(){pumped++;object.pixiContainer.children.push({});}}}}};await f.ctx.__exportWaitForStageAssets();assert.equal(pumped,1);assert.equal(f.clock.performanceNow(),0);assert.equal(f.timers.size,0);
 object.pixiContainer.children=[];f.stage.currentApp=null;
 const wait=f.ctx.__exportWaitForStageAssets(),rejected=assert.rejects(wait,/舞台素材或聚合模型加载超时/);await turn();const [deadline]=f.watchdogs;deadline.fn();await rejected;assert.equal(f.timers.size,0);
});
test('stage with children still waits for the actual expression',async()=>{
 const f=fixture(),d=deferred();f.stage.figureObjects.push({key:'hero',sourceUrl:'model.json',pixiContainer:{children:[{}]}});f.start(d.promise);
 let done=false;const wait=f.ctx.__exportWaitForStageAssets().then(()=>{done=true;});await turn();assert.equal(done,false);d.resolve();await wait;assert.equal(f.clock.performanceNow(),0);assert.equal(f.timers.size,0);
});

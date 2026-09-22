import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../browser/render.js',import.meta.url),'utf8');
const start=source.indexOf('  const restoreCompletedCubism2Motion=async'),end=source.indexOf('  const seekCubism2State=',start);
assert.ok(start>=0&&end>start);
function fixture({idle=false,loop=false,throws=false}={}){
 const initialClock=()=>100000,clock={getUserTimeMSec:initialClock};let saved=0.3,saves=0,stops=0;
 const core={getModelImpl:()=>({parameters:[{getDefaultValue:()=>0,getParamID:()=> 'PARAM_X'}]}),getParamIndex:()=>0,getModelContext:()=>({getParamMin:()=>-10,getParamMax:()=>10}),setParamFloat:(_,value)=>{saved=value;},saveParam:()=>{saves++;}};
 class Queue{startMotion(motion){this.motion=motion;this.started=null;this.finished=false;}stopAllMotions(){this.finished=true;}isFinished(){return this.finished;}updateParam(proxy){if(throws)throw Error('probe failure');const now=clock.getUserTimeMSec();if(this.started===null)this.started=now;const age=now-this.started;proxy.setParamFloat('PARAM_X',Math.min(1,age/1000));this.finished=age>=1000;}}
 const manager={definitions:idle?{idle:[{}]}:{},groups:{idle:'idle'},settings:{},stopAllMotions:()=>{stops++;}};
 const context={MotionQueueManager:Queue,UtSystem:clock,fps:60,cubism2Entries:async()=>[{index:0,durationMs:1000,loop,motion:{}}]};
 vm.runInNewContext(source.slice(start,end)+';globalThis.restore=restoreCompletedCubism2Motion;',context);
 return {run:(life,now)=>context.restore(manager,core,'actor',life,now),clock,initialClock,manager,state:()=>({saved,saves,stops})};
}
const lifetime={startMs:0,motionEvents:[{atMs:0,group:'pose',index:0}]};
test('completed motion retains final parameter instead of restarting',async()=>{const f=fixture();assert.equal(await f.run(lifetime,5000),true);assert.equal(f.state().saved,1);assert.equal(f.state().saves,1);assert.equal(f.manager.__webVideoIdleSeekLast.kind,'completed');assert.equal(f.clock.getUserTimeMSec,f.initialClock);});
test('no motion does not synthesize an animation',async()=>{const f=fixture();assert.equal(await f.run({startMs:0,motionEvents:[]},5000),false);assert.equal(f.state().stops,0);assert.equal(f.state().saved,0.3);});
test('active, looping and standard-idle motions keep their existing resolver',async()=>{for(const [options,time] of [[{},500],[{loop:true},5000],[{idle:true},5000]]){const f=fixture(options);assert.equal(await f.run(lifetime,time),false);assert.equal(f.state().stops,0);}});
test('temporary core clock is restored even when replay fails',async()=>{const f=fixture({throws:true});await assert.rejects(f.run(lifetime,5000),/probe failure/);assert.equal(f.clock.getUserTimeMSec,f.initialClock);assert.equal(f.state().saved,0.3);});
test('initial seek follows clock advancement and matches quantized event time',()=>{const body=source.slice(source.indexOf('globalThis.__stepExportFrame=async'));assert.ok(body.indexOf('await __pwClock.controller.runFor(elapsed)')<body.indexOf('if(live2dBindingPending)'));assert.match(source,/const epochTime=Math\.round\(Math\.ceil/);});

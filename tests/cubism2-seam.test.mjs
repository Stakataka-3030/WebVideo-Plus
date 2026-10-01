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
 const context={MotionQueueManager:Queue,UtSystem:clock,fps:60,cubism2Entries:async (manager,group)=>group?[{index:0,durationMs:1000,loop,motion:{}}]:[]};
 vm.runInNewContext(source.slice(start,end)+';globalThis.restore=restoreCompletedCubism2Motion;',context);
 return {run:(life,now)=>context.restore(manager,core,'actor',life,now),clock,initialClock,manager,state:()=>({saved,saves,stops})};
}
const lifetime={startMs:0,motionEvents:[{atMs:0,group:'pose',index:0}]};
test('completed motion retains final parameter instead of restarting',async()=>{const f=fixture();assert.equal(await f.run(lifetime,5000),true);assert.equal(f.state().saved,1);assert.equal(f.state().saves,1);assert.equal(f.manager.__webVideoIdleSeekLast.kind,'completed');assert.equal(f.clock.getUserTimeMSec,f.initialClock);});
test('no motion does not synthesize an animation',async()=>{const f=fixture();assert.equal(await f.run({startMs:0,motionEvents:[]},5000),false);assert.equal(f.state().stops,0);assert.equal(f.state().saved,0.3);});
test('active, looping and standard-idle motions keep their existing resolver',async()=>{for(const [options,time] of [[{},500],[{loop:true},5000],[{idle:true},5000]]){const f=fixture(options);assert.equal(await f.run(lifetime,time),false);assert.equal(f.state().stops,0);}});
test('temporary core clock is restored even when replay fails',async()=>{const f=fixture({throws:true});await assert.rejects(f.run(lifetime,5000),/probe failure/);assert.equal(f.clock.getUserTimeMSec,f.initialClock);assert.equal(f.state().saved,0.3);});
test('initial seek follows clock advancement and matches quantized event time',()=>{const body=source.slice(source.indexOf('globalThis.__stepExportFrame=async'));assert.ok(body.indexOf('await __pwClock.controller.runFor(elapsed)')<body.indexOf('if(live2dBindingPending)'));assert.match(source,/const epochTime=Math\.round\(Math\.ceil/);});

// WebGAL 4.6.4 changeFigure/postFigureStateSet and changeModelMotionByKey:
// same identity + same recorded motion is a no-op, even after that motion ends.
// New model identities still start their requested motion on creation.
const workloadSource=fs.readFileSync(new URL('../browser/workload.js',import.meta.url),'utf8');
function planFigures(commands){
 const context={};vm.runInNewContext(workloadSource,context);
 const sentenceList=commands.map(({atMs,source='hero/model.json',...params},i)=>({command:1,commandRaw:'changeFigure',content:source,args:Object.entries({id:'actor',next:true,...params}).map(([key,value])=>({key,value})),startLine:i,endLine:i}));
 const script=sentenceList.map(s=>'changeFigure:'+s.content+';').join('\n');
 return context.__buildNativeWorkload({script,parsed:{sentenceList},media:{},animations:{},timing:{lineTimes:commands.map(c=>c.atMs),durationSeconds:30},root:'/test',project:'test',sceneName:'motion-seam.txt',fps:60});
}
const epochs=life=>Array.from(life.motionEvents,e=>[e.atMs,e.group]);
test('repeating the same motion preserves its original epoch, active or completed',()=>{
 for(const repeatedAt of [500,8000]){
  const plan=planFigures([{atMs:0,motion:'pose'},{atMs:repeatedAt,motion:'pose'},{atMs:10000,motion:'pose',expression:'smile'}]);
  assert.equal(plan.live2dLifetimes.length,1);
  assert.deepEqual(epochs(plan.live2dLifetimes[0]),[[0,'pose']]);
  assert.equal(plan.events.length,3,'do not remove commands or their non-motion effects');
  assert.equal(plan.live2dLifetimes[0].expressionEvents.length,1);
 }
});
test('different motions and switching back each start an epoch',()=>{
 const plan=planFigures([{atMs:0,motion:'pose'},{atMs:1000,motion:'wave'},{atMs:2000,motion:'pose'}]);
 assert.deepEqual(epochs(plan.live2dLifetimes[0]),[[0,'pose'],[1000,'wave'],[2000,'pose']]);
});
test('omitted or empty motion alone retains the same-identity motion',()=>{
 const plan=planFigures([{atMs:0,motion:'pose'},{atMs:1000},{atMs:2000,motion:''},{atMs:3000,motion:'pose'}]);
 assert.deepEqual(epochs(plan.live2dLifetimes[0]),[[0,'pose']]);
 assert.deepEqual(epochs(planFigures([{atMs:0},{atMs:1000,motion:''}]).live2dLifetimes[0]),[]);
});
test('skin or valid unchanged bounds can reset motion; a later same name restarts',()=>{
 for(const reset of [{skin:'costume'},{bounds:'0,0,0,0'}]){
  const plan=planFigures([{atMs:0,motion:'pose'},{atMs:1000,...reset},{atMs:2000,...reset},{atMs:3000,motion:'pose'}]);
  assert.equal(plan.live2dLifetimes.length,1);
  assert.deepEqual(epochs(plan.live2dLifetimes[0]),[[0,'pose'],[1000,''],[3000,'pose']]);
 }
});
test('same named motion restarts after source, position or bounds identity changes',()=>{
 for(const changed of [{source:'other/model.json'},{left:true},{bounds:'1,2,3,4'}]){
  const plan=planFigures([{atMs:0,motion:'pose'},{atMs:1000,motion:'pose',...changed}]);
  assert.equal(plan.live2dLifetimes.length,2);
  assert.deepEqual(Array.from(plan.live2dLifetimes,epochs),[[[0,'pose']],[[1000,'pose']]]);
 }
});
test('removal and image replacement do not suppress the same motion on a fresh model',()=>{
 for(const removed of [{source:'none'},{clear:true},{source:'portrait.png'}]){
  const plan=planFigures([{atMs:0,motion:'pose'},{atMs:1000,...removed},{atMs:2000,motion:'pose'}]);
  assert.equal(plan.live2dLifetimes.length,2);
  assert.deepEqual(Array.from(plan.live2dLifetimes,epochs),[[[0,'pose']],[[2000,'pose']]]);
 }
});
test('motion names are scoped to a model target, including positional targets',()=>{
 const plan=planFigures([{atMs:0,id:'a',motion:'pose'},{atMs:1000,id:'b',motion:'pose'},{atMs:2000,id:'',left:true,motion:'pose'},{atMs:3000,id:'a',motion:'pose'}]);
 assert.deepEqual(Array.from(plan.live2dLifetimes,l=>[l.target,epochs(l)]),[['a',[[0,'pose']]],['b',[[1000,'pose']]],['fig-left',[[2000,'pose']]]]);
});
test('numeric-equivalent bounds preserve identity and same-name epoch',()=>{
 const plan=planFigures([{atMs:0,motion:'pose',bounds:'1,2,3,4'},{atMs:1000,motion:'pose',bounds:'1.0, 2e0,03,4.00'},{atMs:2000,motion:'pose'}]);
 assert.equal(plan.live2dLifetimes.length,1);
 assert.deepEqual(epochs(plan.live2dLifetimes[0]),[[0,'pose']]);
});
test('source changes reset omitted bounds and do not inherit old motion',()=>{
 const plan=planFigures([{atMs:0,motion:'pose',bounds:'1,2,3,4'},{atMs:1000,source:'other/model.json'},{atMs:2000,source:'other/model.json',motion:'pose',bounds:'0,0,0,0'}]);
 assert.equal(plan.live2dLifetimes.length,2);
 assert.deepEqual(epochs(plan.live2dLifetimes[1]),[[2000,'pose']]);
 assert.equal(plan.live2dLifetimes[1].bounds,'0,0,0,0');
});
test('invalid bounds follow runtime normalization without inventing a motion reset',()=>{
 const unchanged=planFigures([{atMs:0,motion:'pose'},{atMs:1000,bounds:'invalid'},{atMs:2000,motion:'pose'}]);
 assert.equal(unchanged.live2dLifetimes.length,1);
 assert.deepEqual(epochs(unchanged.live2dLifetimes[0]),[[0,'pose']]);
 const changed=planFigures([{atMs:0,motion:'pose',bounds:'1,2,3,4'},{atMs:1000,bounds:'invalid',motion:'pose'}]);
 assert.equal(changed.live2dLifetimes.length,2);
 assert.deepEqual(epochs(changed.live2dLifetimes[1]),[[1000,'pose']]);
});
test('completed-motion restore consumes the original epoch after a repeated command',async()=>{
 const life=planFigures([{atMs:0,motion:'pose'},{atMs:8000,motion:'pose'}]).live2dLifetimes[0];
 const f=fixture();assert.equal(await f.run(life,8500),true);
 assert.equal(f.manager.__webVideoIdleSeekLast.kind,'completed');
 assert.equal(f.manager.__webVideoIdleSeekLast.originMs,0);
 assert.equal(f.state().saved,1);
});
test('stopped motion retains the last saved pose, including interruption before completion',async()=>{
 for(const [stopMs,expected] of [[500,.483],[509,.5],[2000,1]]){
  const life=planFigures([{atMs:0,motion:'pose'},{atMs:stopMs,skin:'costume'}]).live2dLifetimes[0];
  const f=fixture();assert.equal(await f.run(life,5000),true);
  assert.equal(f.manager.__webVideoIdleSeekLast.kind,'stopped');
  assert.equal(f.state().saved,Math.fround(expected));
  assert.equal(f.clock.getUserTimeMSec,f.initialClock);
 }
 const f=fixture();assert.equal(await f.run({startMs:0,motionEvents:[{atMs:0,group:''}]},5000),false);
});
test('Cubism3/4 stopped poses seek the last pre-stop frame and stop their queues',async()=>{
 const start=source.indexOf('  const restoreCompletedCubism4Motion=async'),end=source.indexOf('  const seekCubism4State=',start);
 const rebaseStart=source.indexOf('globalThis.__exportRebaseCubism4QueueEntry='),rebaseEnd=source.indexOf('globalThis.__exportResolveCubism4Blink=',rebaseStart);
 for(const [stopMs,loop,expected] of [[500,false,.483],[509,false,.5],[2000,false,1],[2509,true,.5]]){
  let pose=0,saves=0,stops=0,entry;
  const selected={index:0,durationMs:1000,loop,loopFadeIn:false,motion:{}};
  const queue={_motions:[],doUpdateMotion(core,now){pose=Math.min(1,now-entry.start);}};
  const manager={groups:{idle:'idle'},stopAllMotions(){stops++;queue._motions=[];},async startMotion(){entry={_motion:selected.motion,setIsStarted(){},setStartTime(v){this.start=v;},setFadeInStartTime(){},setEndTime(){}};queue._motions=[entry];return true;}};
  const context={fps:60,performance:{now:()=>100000},cubism4Entries:async(m,g)=>g==='pose'?[selected]:[],__exportCubism2MotionEpoch:(life,now)=>life.motionEvents.filter(e=>e.atMs<=now).at(-1)};
  vm.runInNewContext(source.slice(rebaseStart,rebaseEnd)+source.slice(start,end)+';globalThis.restore=restoreCompletedCubism4Motion;',context);
  const life={startMs:0,motionEvents:[{atMs:0,group:'pose'},{atMs:stopMs,group:''}]};
  assert.equal(await context.restore(manager,queue,{saveParameters(){saves++;}},'actor',life,5000),true);
  assert.ok(Math.abs(pose-expected)<1e-10,`${stopMs}: ${pose} != ${expected}`);
  assert.equal(saves,1);assert.equal(stops,2);assert.equal(queue._motions.length,0);
  assert.equal(manager.__webVideoCubism4SeekLast.kind,'stopped');
 }
});

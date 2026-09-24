import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../browser/render.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('globalThis.__exportHash32='),source.indexOf('globalThis.__installNativeRendering='));
const start=source.indexOf('  const cubism4Entries=async'),end=source.indexOf('  const resolveCubism2State=',start);
assert.ok(start>0&&end>start);

function fixture({idle=true,waveLoop=false}={}){
  const context={performance:{now:()=>25000}};
  vm.runInNewContext(helpers,context);
  vm.runInNewContext(`(()=>{const fps=60;${source.slice(start,end)};globalThis.resolve=resolveCubism4State;globalThis.seek=seekCubism4State;globalThis.expression=rebaseCubism4Expression;})();`,context);
  const events=[],entry=()=>{
    const state={started:false,start:null,fade:null,end:null,last:null};
    return {state,setIsStarted:x=>state.started=x,setStartTime:x=>state.start=x,
      setFadeInStartTime:x=>state.fade=x,setEndTime:x=>state.end=x,
      setLastCheckEventSeconds:x=>state.last=x};
  };
  const queue={_motions:[],getCubismMotionQueueEntries(){return this._motions;},
    doUpdateMotion(core,now){core.sampled=now;}};
  const core={saved:false,saveParameters(){this.saved=true;}};
  const manager={definitions:{wave:[{}],...(idle?{Idle:[{}]}:{})},groups:{idle:'Idle'},
    loadMotion:async group=>group==='wave'?{getDuration:()=>waveLoop?-1:10,getLoopDuration:()=>10,getLoop:()=>waveLoop}:{getDuration:()=>-1,getLoopDuration:()=>2,getLoop:()=>true},
    stopAllMotions(){queue._motions=[];events.push('stop');},
    async startMotion(group,index,priority){const e=entry();queue._motions.push(e);events.push({group,index,priority,entry:e});return true;}};
  return {context,queue,core,manager,events};
}

test('Cubism 3/4 explicit motion starts at its absolute phase after a cut',async()=>{
  const f=fixture(),life={startMs:0,source:'hero.model3.json',motionEvents:[{atMs:1000,group:'wave',index:0,priority:3}]};
  assert.equal(await f.context.seek(f.manager,f.queue,f.core,'hero',life,5000),true);
  const started=f.events.find(x=>x.group==='wave');
  assert.equal(started.entry.state.started,true);
  assert.equal(started.entry.state.start,21);
  assert.equal(started.entry.state.fade,21);
  assert.equal(started.entry.state.end,31);
  assert.equal(started.entry.state.last,4);
});

test('a newly born model does not restart its already active explicit motion',async()=>{
  const f=fixture(),life={startMs:0,source:'hero.model3.json',motionEvents:[{atMs:0,group:'wave',index:0,priority:3}]};
  f.manager.state={isActive:(group,index)=>group==='wave'&&index===0};
  assert.equal(await f.context.seek(f.manager,f.queue,f.core,'hero',life,0),true);
  assert.equal(f.events.length,0);
});

test('Cubism 3/4 idle is selected by model age, not worker startup time',async()=>{
  const f=fixture(),life={startMs:0,source:'hero.model3.json',motionEvents:[{atMs:1000,group:'wave',index:0,priority:3}]};
  assert.equal(await f.context.seek(f.manager,f.queue,f.core,'hero',life,12500),true);
  const started=f.events.find(x=>x.group==='Idle');
  assert.equal(started.entry.state.start,23.5);
  assert.equal(started.entry.state.end,-1);
  assert.equal(started.entry.state.last,1.5);
});

test('completed explicit motion without idle retains its terminal pose',async()=>{
  const f=fixture({idle:false}),life={startMs:0,source:'hero.model3.json',motionEvents:[{atMs:1000,group:'wave',index:0,priority:3}]};
  assert.equal(await f.context.seek(f.manager,f.queue,f.core,'hero',life,15000),true);
  assert.equal(f.core.sampled,25);
  assert.equal(f.core.saved,true);
  assert.equal(f.manager.__webVideoIdleSeekLast.kind,'completed');
});

test('blink phase is deterministic at the same absolute model age',()=>{
  const f=fixture(),find=()=>{
    for(let age=.01;age<30;age+=.01){const s=f.context.__exportResolveCubism4Blink(age,5,.1,.05,.15,'hero|0');if(s.state===2)return age;}
    throw Error('No closing interval');
  };
  const age=find(),a=f.context.__exportResolveCubism4Blink(age,5,.1,.05,.15,'hero|0'),b=f.context.__exportResolveCubism4Blink(age,5,.1,.05,.15,'hero|0');
  assert.deepEqual({...a},{...b});
  assert.ok(a.value>=0&&a.value<=1);
  const later=f.context.__exportResolveCubism4Blink(age+.016,5,.1,.05,.15,'hero|0');
  assert.ok(Math.abs(later.value-a.value)<.3);
});

test('blink hook writes the same eye value across workers and reuses its schedule',()=>{
  const f=fixture(),life={startMs:1000,target:'hero',endMs:60000};
  f.context.__exportLive2DLifetimes=[life];
  f.context.__exportLive2DLifetimeAt=(items,target,time)=>items.find(x=>x.target===target&&x.startMs<=time&&time<x.endMs);
  const values=[];
  const makeBlink=()=>({getParameterIds:()=>['ParamEyeLOpen'],_blinkingIntervalSeconds:5,
    _closingSeconds:.1,_closedSeconds:.05,_openingSeconds:.15,
    updateParameters(){throw Error('The native random clock should not run');}});
  const blinkA=makeBlink(),blinkB=makeBlink(),core={setParameterValueById:(id,value)=>values.push([id,value])};
  assert.equal(f.context.__exportInstallCubism4Blink(blinkA,'hero'),true);
  assert.equal(f.context.__exportInstallCubism4Blink(blinkB,'hero'),true);
  f.context.__exportCurrentSimulationMs=24000;
  blinkA.updateParameters(core,1/60);
  const cached=blinkA.__webVideoBlinkSchedule.events.length;
  blinkA.updateParameters(core,1/60);
  assert.equal(blinkA.__webVideoBlinkSchedule.events.length,cached);
  blinkB.updateParameters(core,1/60);
  assert.equal(values[0][0],'ParamEyeLOpen');
  assert.equal(values[0][1],values[2][1]);
  assert.equal(blinkA._userTimeSeconds,23);
});

test('active expression fade is rebased from its script event',()=>{
  const f=fixture(),e={state:{},setIsStarted(x){this.state.started=x;},setStartTime(x){this.state.start=x;},setFadeInStartTime(x){this.state.fade=x;},setEndTime(x){this.state.end=x;}};
  f.manager.expressionManager={queueManager:{_motions:[e]}};
  assert.equal(f.context.expression(f.manager,{expressionEvents:[{atMs:2000,name:'smile'}]},2500),true);
  assert.equal(e.state.start,24.5);
  assert.equal(e.state.fade,24.5);
  assert.equal(e.state.end,-1);
});

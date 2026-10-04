// Portable tests run the production dual-profile workload/barrier directly.
// They prove scheduling/control-flow contracts, not native Pixi pixel parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../browser/workload.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function sentence(commandRaw,content,args={}){
  return{command:commandRaw==='say'?0:1,commandRaw,content,args:Object.entries(args).map(([key,value])=>({key,value}))};
}
function workload(statements,{performWindows=[],animations={},media={},durationSeconds=2,...extra}={}){
  const context={URL,scheduleAudioCommand:(audio,entry)=>audio.push(entry)};context.globalThis=context;
  vm.runInNewContext(source,context);
  const parsed={sentenceList:statements.map((s,index)=>({...s,startLine:index,endLine:index}))};
  const script=statements.map(s=>s.commandRaw+':'+s.content+s.args.map(a=>' -'+a.key+(a.value===true?'':'='+a.value)).join('')+';').join('\n');
  return plain(context.__buildNativeWorkload({script,parsed,animations,media,root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30,timing:{lineTimes:statements.map((_,i)=>i*100),durationSeconds,sourceEvents:[],stageExitWindows:[],performWindows},...extra}));
}
const blends=result=>result.softCutWindows.filter(w=>w.reason==='figure-diff');
const exits=result=>result.replayWindows.filter(w=>w.command==='changeFigure-exit');

test('4.6.5 image diff records its observed blend and replay window in the shared kernel',()=>{
  const result=workload([sentence('changeFigure','a.png',{id:'hero'}),sentence('changeFigureDiff','b.png',{id:'hero'})],{performWindows:[{role:'primary',line:1,command:'changeFigureDiff',startMs:100,stopMs:380,durationMs:280,hold:false}]});
  assert.equal(result.counts.changeFigureDiff,1);
  assert.equal(result.events[1].loads,true);
  assert.deepEqual(blends(result),[{startMs:100,endMs:380,reason:'figure-diff',target:'hero',line:2}]);
  assert.equal(result.replayWindows.find(w=>w.command==='changeFigureDiff').endMs,380);
  assert.deepEqual(exits(result),[]);
});

test('same-image diff ignores omitted or changed position instead of inventing a blend',()=>{
  for(const args of [{id:'hero'},{id:'hero',right:true},{id:'hero',bounds:'0,0,8,8'}]){
    const result=workload([sentence('changeFigure','a.png',{id:'hero',left:true}),sentence('changeFigureDiff','a.png',args)]);
    assert.deepEqual(blends(result),[]);
    assert.deepEqual(exits(result),[]);
  }
});

test('image diff retains prior identity position and exit animation',()=>{
  const result=workload([sentence('changeFigure','a.png',{id:'hero',left:true,exit:'fade'}),sentence('changeFigureDiff','b.png',{id:'hero',right:true,exit:'ignored'}),sentence('changeFigure','b.png',{id:'hero',left:true}),sentence('changeFigureDiff','none',{id:'hero'})],{animations:{fade:[{duration:700}]}});
  assert.equal(blends(result).length,1);
  assert.deepEqual(exits(result).map(w=>({line:w.line,startMs:w.startMs,endMs:w.endMs})),[{line:4,startMs:300,endMs:1000}]);
  assert.deepEqual(result.extraAnimations.map(([name])=>name),['fade']);
});

test('model diff none/empty preserves a lifetime until ordinary changeFigure removal',()=>{
  for(const name of ['hero.model3.json','hero.wmdl','unknown.custom'])for(const empty of ['none','']){
    const start=sentence('changeFigure',name,{id:'hero',motion:'idle'}),diff=sentence('changeFigureDiff',empty,{id:'hero'});
    const retained=workload([start,diff]);
    assert.equal(retained.live2dLifetimes.length,1);
    assert.equal(retained.live2dLifetimes[0].endMs,2000);
    assert.deepEqual(exits(retained),[]);
    const removed=workload([start,diff,sentence('changeFigure','none',{id:'hero'})]);
    assert.equal(removed.live2dLifetimes[0].endMs,200);
    assert.equal(exits(removed)[0].line,3);
  }
});

test('Spine URL type guards override image suffixes in either diff direction',()=>{
  for(const query of ['type=spine','type=%73pine','type=spine#skin','type=spine&type=image'])for(const [before,after] of [['a.png?'+query,'b.png'],['a.png','b.png?'+query]]){
    const result=workload([sentence('changeFigure',before,{id:'hero'}),sentence('changeFigureDiff',after,{id:'hero'}),sentence('changeFigure',before,{id:'hero'})]);
    assert.deepEqual(blends(result),[]);
    assert.deepEqual(exits(result),[],'Rejected diff must preserve previous identity');
  }
});

test('a first unsupported model diff cannot invent a replay lifetime',()=>{
  for(const name of ['hero.model3.json','hero.skel','hero.png?type=%73pine']){
    const result=workload([sentence('changeFigureDiff',name,{id:'hero'}),sentence('changeFigure','a.png',{id:'hero'})]);
    assert.deepEqual(result.live2dLifetimes,[]);
    assert.deepEqual(blends(result),[]);
    assert.deepEqual(exits(result),[]);
  }
});

test('ordinary image entry/replacement/removal remains independent of diff capability',()=>{
  const result=workload([sentence('changeFigure','a.png',{id:'hero'}),sentence('changeFigure','b.png',{id:'hero'}),sentence('changeFigure','none',{id:'hero'})]);
  assert.deepEqual(blends(result),[]);
  assert.deepEqual(exits(result).map(w=>w.line),[2,3]);
  assert.deepEqual(result.live2dLifetimes,[]);
});

test('ordinary named animation, vocal and legacy transform timing remains shared',()=>{
  const result=workload([sentence('setAnimation','fade',{target:'hero'}),sentence('setTransform','{"alpha":0.5}',{target:'hero',writeDefault:true,duration:500}),sentence('say','hello',{figureId:'hero',vocal:'line.wav'})],{animations:{fade:[{duration:450}]},media:{'/game/vocal/line.wav':{durationMs:300,hasAudio:true}}});
  assert.deepEqual(result.extraAnimations,[['fade',[{duration:450}]]]);
  assert.equal(result.audio[0].kind,'voice');
  assert.equal(result.audio[0].target,'hero');
  assert.equal(result.audio[0].endMs,500);
  assert.equal(result.events[2].voiceControlled,true);
});

async function barrier({ready=false,legacy=false,queued=false}={}){
  let pumps=0;const ticks=[];
  const object={key:'hero',sourceUrl:'/game/figure/a.png',pixiContainer:{children:ready?[{}]:[]}};
  const stage={backgroundObjects:[],figureObjects:[object],currentApp:{renderer:{plugins:{}}}};
  if(queued)stage.currentApp.renderer.plugins.prepare={queue:[{}],delayedTick(){pumps++;this.queue=[];object.pixiContainer.children=[{}];}};
  const context={URL,location:{href:'http://localhost/'},__wgProbe:{core:{gameplay:{pixiStage:stage}}},__pwClock:{controller:{_embedder:{setTimeout(fn,delay){const id=setTimeout(fn,delay===20000?100:0);return()=>clearTimeout(id);}},async runFor(ms){ticks.push(ms);if(legacy)object.pixiContainer.children=[{}];}}}};
  context.globalThis=context;vm.runInNewContext(fs.readFileSync(new URL('../browser/barrier.js',import.meta.url),'utf8'),context);context.installStageAssetBarrier();
  await context.__exportWaitForStageAssets();return{pumps,ticks};
}

test('shared asset barrier handles ready and legacy paths without advancing story time',async()=>{
  for(const options of [{ready:true},{legacy:true}]){const result=await barrier(options);assert.equal(result.pumps,0);assert.ok(result.ticks.every(ms=>ms===0));}
});

test('shared asset barrier pumps queued 4.6.5 preparation without advancing story time',async()=>{
  const result=await barrier({queued:true});assert.equal(result.pumps,1);assert.ok(result.ticks.every(ms=>ms===0));
});

test('first image diff honors ordinary clear and does not invent an outgoing figure',()=>{
 const result=workload([sentence('changeFigureDiff','a.png',{id:'hero',clear:true}),sentence('changeFigureDiff','b.png',{id:'hero'}),sentence('changeFigure','none',{id:'hero'})]);
 assert.deepEqual(blends(result),[]);assert.deepEqual(exits(result).map(w=>w.line),[3]);
});
test('first image diff honors bounds and named entry/exit while replacements ignore them',()=>{
 const result=workload([sentence('changeFigureDiff','a.png',{id:'hero',bounds:'1,2,3,4',enter:'in',exit:'out'}),sentence('changeFigure','a.png',{id:'hero',bounds:'1.0,2,3,4'}),sentence('changeFigureDiff','b.png',{id:'hero',bounds:'9,9,9,9',enter:'ignored',exit:'ignored'}),sentence('changeFigure','none',{id:'hero'})],{animations:{in:[{duration:200}],out:[{duration:800}]}});
 assert.deepEqual(result.extraAnimations.map(([name])=>name),['in','out']);assert.deepEqual(exits(result).map(w=>({line:w.line,duration:w.endMs-w.startMs})),[{line:4,duration:800}]);assert.equal(blends(result).length,1);
});
test('a rejected model diff remains rejected before the ordinary clear fallback',()=>{
 const result=workload([sentence('changeFigureDiff','hero.json',{id:'hero',clear:true,enter:'missing'}),sentence('changeFigure','a.png',{id:'hero'})]);
 assert.deepEqual(result.live2dLifetimes,[]);assert.deepEqual(exits(result),[]);assert.deepEqual(result.extraAnimations,[]);
});

test('native image formats retain correct identity through a diff and later ordinary replacement',()=>{
 for(const ext of ['svg','bmp','avif']){
  const result=workload([sentence('changeFigure','a.'+ext,{id:'hero'}),sentence('changeFigureDiff','b.png',{id:'hero'}),sentence('changeFigure','a.'+ext,{id:'hero'})]);
  assert.equal(blends(result).length,1,ext);assert.deepEqual(exits(result).map(w=>w.line),[3],ext);
  const reverse=workload([sentence('changeFigure','b.png',{id:'hero'}),sentence('changeFigureDiff','a.'+ext,{id:'hero'}),sentence('changeFigure','b.png',{id:'hero'})]);
  assert.equal(blends(reverse).length,1,ext);assert.deepEqual(exits(reverse).map(w=>w.line),[3],ext);
 }
});

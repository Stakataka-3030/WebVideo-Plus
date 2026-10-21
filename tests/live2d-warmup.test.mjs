import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const workloadSource=fs.readFileSync(new URL('../browser/workload.js',import.meta.url),'utf8');
function planFigures(commands){
 const context={};vm.runInNewContext(workloadSource,context);
 const sentenceList=commands.map(({atMs,source='hero/model.json',...params},i)=>({command:1,commandRaw:'changeFigure',content:source,args:Object.entries({id:'actor',next:true,...params}).map(([key,value])=>({key,value})),startLine:i,endLine:i}));
 const script=sentenceList.map(s=>'changeFigure:'+s.content+';').join('\n');
 return context.__buildNativeWorkload({script,parsed:{sentenceList},media:{},animations:{},timing:{lineTimes:commands.map(c=>c.atMs),durationSeconds:30},root:'/test',project:'test',sceneName:'motion-seam.txt',fps:60});
}
const epochs=life=>Array.from(life.motionEvents,e=>[e.atMs,e.group]);
test('motion changes retain epochs and bounded replay windows',()=>{
 const single=planFigures([{atMs:0,motion:'pose'},{atMs:8000,motion:'pose'},{atMs:10000,source:'none'}]);
 assert.equal(single.live2dLifetimes[0].motionEvents.length,1);
 assert.equal(single.replayWindows.some(w=>w.rootReplay),false);
 const plan=planFigures([{atMs:3500,motion:'null'},{atMs:7000,motion:'',bounds:'0,0,0,0'},{atMs:8000,motion:'idle',bounds:'0,0,0,0'},{atMs:10000,source:'none'}]);
 assert.deepEqual(epochs(plan.live2dLifetimes[0]),[[3500,'null'],[7000,''],[8000,'idle']]);
 assert.equal(plan.replayWindows.some(w=>w.rootReplay),false);
 assert.equal(plan.live2dLifetimes[0].startMs,3500);
 assert.equal(plan.live2dLifetimes[0].endMs,10000);
 const exit=plan.replayWindows.find(w=>w.command==='changeFigure-exit');
 assert.ok(exit);assert.equal(exit.startMs,10000);assert.equal(exit.endMs,10450);
});

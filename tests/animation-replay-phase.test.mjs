import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../browser/workload.js',import.meta.url),'utf8');
const ctx={scheduleAudioCommand(){}};vm.runInNewContext(source,ctx);
for(const [command,content,animations,args,duration]of [
 ['setAnimation','v1',{v1:[{duration:500},{duration:500}]},[],1000],
 ['setAnimation','v2',{v2:{version:2,keyframes:[{time:500,alpha:.5},{time:2000,position:{x:20}}]}},[{key:'keep',value:true}],2000],
 ['setTempAnimation',JSON.stringify([{duration:500},{duration:500}]),{},[],1000],
 ['setTransform','{"position":{"x":50}}',{},[{key:'duration',value:1000}],1000]
])test('active '+command+' '+content.slice(0,8)+' replays native driver history without changing duration or cut policy',()=>{
 const parsed={sentenceList:[{command:1,commandRaw:command,content,args,startLine:0,endLine:0}]};
 const plan=ctx.__buildNativeWorkload({script:command+':'+content+';',parsed,media:{},animations,timing:{durationSeconds:15,lineTimes:[1000],performWindows:[{command,line:0,role:'primary',durationMs:duration,hold:args.some(a=>a.key==='keep'),startMs:1000,stopMs:args.some(a=>a.key==='keep')?4000:1000+duration}]},root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30});
 const window=plan.replayWindows.find(w=>w.command===command);
 assert.ok(window);assert.equal(window.rootReplay,true);assert.equal(window.startMs,1000);assert.equal(window.endMs,1000+duration);assert.equal(window.noCut,false);
 assert.equal(plan.events[0].atMs,1000,'Driver replay must not retime the source command');
});

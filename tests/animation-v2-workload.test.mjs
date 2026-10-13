import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../browser/workload.js',import.meta.url),'utf8');
const context={URL,scheduleAudioCommand(){}};context.globalThis=context;vm.runInNewContext(source,context);
const duration=value=>context.__exportAnimationDuration(value);
test('v1 durations remain cumulative including object version 1',()=>{
 for(const raw of [[{duration:300},{duration:450}],{version:1,keyframes:[{duration:300},{duration:450}]}])assert.equal(duration(raw),750);
 assert.equal(duration([{duration:-2},{duration:'40'},{duration:200},null,3]),200);
});
test('v2 duration uses maximum absolute time and preserves sparse/relative data',()=>{
 const raw={version:2,relative:true,inherit:true,relativeCalc:{scale:'multiplyWithZeroFallback'},keyframes:[{time:1200,position:{x:20}},{time:300,alpha:.5},{time:1200,position:{y:10}}]};
 assert.equal(duration(raw),1200);assert.equal(duration({keyframes:[{time:400},{time:800}]}),800);assert.throws(()=>duration({effects:[]}),/动画文件无效/);
 const result=context.__buildNativeWorkload({script:'setAnimation:sparse -target=hero;\nwait:300;',parsed:{sentenceList:[{command:1,commandRaw:'setAnimation',content:'sparse',args:[{key:'target',value:'hero'}],startLine:0,endLine:0},{command:1,commandRaw:'wait',content:'300',args:[],startLine:1,endLine:1}]},animations:{sparse:raw},media:{},root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30});
 assert.deepEqual(JSON.parse(JSON.stringify(result.extraAnimations)),[['sparse',raw]]);assert.equal(result.duration,3);
});
test('temporary v2 absolute time and overridden arrays retain their own timing',()=>{
 for(const raw of [{version:2,keyframes:[{time:800},{time:300}]},[{duration:400},{duration:400}]]){
  const result=context.__buildNativeWorkload({script:'setTempAnimation:'+JSON.stringify(raw)+' -relative;\nchangeBg:a.png;',parsed:{sentenceList:[{command:1,commandRaw:'setTempAnimation',content:JSON.stringify(raw),args:[{key:'relative',value:true}],startLine:0,endLine:0},{command:1,commandRaw:'changeBg',content:'a.png',args:[],startLine:1,endLine:1}]},animations:{},media:{},root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30});
  assert.equal(result.events[1].atMs,800);
 }
});

// Execute production scheduling and audio mixing. Native Windows tests cover output audio/Live2D mouth pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const repo=process.env.WEBVIDEO_SOURCE_ROOT||path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=fs.readFileSync(path.join(repo,'browser/workload.js'),'utf8');
const audioSource=fs.readFileSync(path.join(repo,'browser/audio.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function workload(name,media){
 const context={URL,location:{href:'http://localhost/'}};context.globalThis=context;
 vm.createContext(context);vm.runInContext(audioSource+'\n'+source,context);
 const script=':hello -ignored.wav  -figureId=hero;',parsed={sentenceList:[{command:0,commandRaw:'say',content:'hello',args:[{key:'vocal',value:name},{key:'figureId',value:'hero'}],startLine:0,endLine:0}]};
 const plan=context.__buildNativeWorkload({script,parsed,animations:{},media,root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30,timing:{lineTimes:[0],durationSeconds:2,sourceEvents:[],stageExitWindows:[],performWindows:[]}});
 return {plan:plain(plan),mix:plain(vm.runInContext('audioMixArguments',context)(plan.audio,2,[]))};
}
test('old-style vocal separator padding keeps the same positive-duration audio track, mouth target and FFmpeg input',()=>{
 const media={'/game/vocal/speaker/one line.wav':{durationMs:650,hasAudio:true}},results=[];
 for(const suffix of ['', ' ', '  ', '\t ', '\r\n ']){
  const result=workload('./game/vocal/speaker/one line.wav'+suffix,media);results.push(result);
  assert.deepEqual(result.plan.audio,[{kind:'voice',path:'C:/fixture/game/vocal/speaker/one line.wav',atMs:0,endMs:650,volume:1,loop:false,target:'hero'}]);
  assert.equal(result.plan.events[0].voiceControlled,true);
  assert.ok(result.mix.includes('C:/fixture/game/vocal/speaker/one line.wav'));
  assert.ok(result.mix.includes('0.65'),'Offline mixer must retain the nonzero voice window');
 }
 for(const result of results)assert.deepEqual(result,results[0]);
});
test('fullwidth and internal spaces and encoded literal percent remain distinct legal vocal filenames',()=>{
 for(const [raw,name]of [['one  line.wav','one  line.wav'],['one\u3000line.wav','one\u3000line.wav'],['line.wav\u3000','line.wav\u3000'],['one%20line.wav','one line.wav'],['line.wav%2520','line.wav%20']]){
  const result=workload('./game/vocal/'+raw+' ',{['/game/vocal/'+name]:{durationMs:450,hasAudio:true}});
  assert.equal(result.plan.audio[0].path,'C:/fixture/game/vocal/'+name);
  assert.equal(result.plan.audio[0].endMs,450);
 }
});
test('a declared vocal without valid positive audio metadata fails instead of silently producing a zero-length track',()=>{
 for(const meta of [undefined,{durationMs:0,hasAudio:true},{durationMs:-1,hasAudio:true},{durationMs:NaN,hasAudio:true},{durationMs:Infinity,hasAudio:true},{durationMs:400,hasAudio:false}]){
  const media=meta===undefined?{}:{'/game/vocal/line.wav':meta};
  assert.throws(()=>workload('./game/vocal/line.wav ',media),error=>/line\.wav/.test(error.message)&&!/无法导出.*交互命令/.test(error.message),String(meta));
 }
});
test('percent-encoded trailing space and raw space before query/fragment never fall back to the trimmed media key',()=>{
 const media={'/game/vocal/line.wav':{durationMs:500,hasAudio:true}};
 for(const raw of ['./game/vocal/line.wav%20 ','./game/vocal/line.wav ?cache=1','./game/vocal/line.wav #voice'])assert.throws(()=>workload(raw,media),error=>/line\.wav/.test(error.message),raw);
});

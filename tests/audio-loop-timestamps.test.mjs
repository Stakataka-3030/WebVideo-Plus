import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../browser/audio.js',import.meta.url),'utf8'),context);
const mix=vm.runInContext('audioMixArguments',context);
const track={kind:'bgm',loop:true,loopPoints:{start:.13,end:.43},path:'music.ogg',atMs:0,endMs:null,volume:1};
const graph=args=>args[args.indexOf('-filter_complex')+1];

test('tagged loops rebuild the sample clock before offset and duration trimming',()=>{
 for(const sourceOffsetMs of [0,700,2345]){
  const args=mix([{...track,sourceOffsetMs}],2);
  assert.match(graph(args),new RegExp(`aloop=loop=-1:size=14400:start=6240,asetpts=N/SR/TB,atrim=start=${sourceOffsetMs/1000}:duration=2,asetpts=N/SR/TB`));
  assert.ok(!args.includes('-ss'));
  assert.ok(!args.includes('-stream_loop'));
 }
});

test('tagged loop clock repair preserves placement, fades and bounded duration',()=>{
 const filter=graph(mix([{...track,atMs:250,endMs:1750,fadeMs:100,fadeOutMs:200,sourceOffsetMs:700}],2));
 assert.match(filter,/asetpts=N\/SR\/TB,atrim=start=0.7:duration=1.5,asetpts=N\/SR\/TB/);
 assert.match(filter,/afade=t=in:d=0.1,afade=t=out:st=1.3:d=0.2,adelay=250\|250/);
});

test('untagged and invalid loop points keep the existing stream-loop path',()=>{
 for(const loopPoints of [null,{start:.43,end:.13},{start:NaN,end:.43}]){
  const args=mix([{...track,loopPoints,sourceOffsetMs:700}],2);
  assert.equal(args[0],'-stream_loop');
  assert.ok(args.includes('-ss'));
  assert.doesNotMatch(graph(args),/aloop=/);
 }
});

test('workload passes loop metadata only to looping BGM',()=>{
 vm.runInContext(fs.readFileSync(new URL('../browser/workload.js',import.meta.url),'utf8'),context);
 for(const command of ['bgm','playEffect']) {
  const plan=context.__buildNativeWorkload({script:command+':tone.ogg;',parsed:{sentenceList:[{command:1,commandRaw:command,content:'tone.ogg',args:[{key:'id',value:'loop'}]}]},media:{'/game/bgm/tone.ogg':{durationMs:500,hasAudio:true,loopPoints:{start:.13,end:.43}},'/game/vocal/tone.ogg':{durationMs:500,hasAudio:true,loopPoints:{start:.13,end:.43}}},animations:{},root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30,timing:null});
  assert.equal(plan.audio[0].loop,true);
  assert.equal(plan.audio[0].loopPoints?.start,command==='bgm'?.13:undefined);
 }
});

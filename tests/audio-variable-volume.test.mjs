import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({URL});
for(const name of ['audio','workload'])vm.runInContext(fs.readFileSync(new URL('../browser/'+name+'.js',import.meta.url),'utf8'),context);
function plan(command,value,resolved,timed=true){
 const voice=command==='say',name=voice?'hello':'tone.wav';
 return context.__buildNativeWorkload({script:voice?':hello -tone.wav -volume={v};':command+':tone.wav -volume={v};',parsed:{sentenceList:[{command:voice?0:1,commandRaw:command,content:name,args:[{key:'volume',value},...(voice?[{key:'vocal',value:'tone.wav'}]:[])]}]},media:{'/game/bgm/tone.wav':{durationMs:500,hasAudio:true},'/game/vocal/tone.wav':{durationMs:500,hasAudio:true}},animations:{},root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30,timing:timed?{lineTimes:[0],durationSeconds:1,sourceEvents:resolved===undefined?[]:[{index:0,audioVolume:resolved}],stageExitWindows:[],performWindows:[]}:null});
}
for(const command of ['bgm','playEffect','say'])test(command+' uses the volume observed after native variable substitution',()=>{
 const pre=plan(command,'{v}',undefined,false);assert.equal(pre.audio[0].volume,1,'unmeasured pass only discovers dependencies');
 const final=plan(command,'{v}','35');assert.equal(final.audio[0].volume,.35);
 assert.doesNotMatch(JSON.stringify(final),/"volume":null/);
 const mix=vm.runInContext('audioMixArguments',context)(final.audio,1);assert.match(mix.join(' '),/volume=0\.35/);
 assert.equal(plan(command,'{v}',0).audio[0].volume,0);
 assert.throws(()=>plan(command,'{v}','invalid'),/音量/);
 assert.equal(plan(command,80).audio[0].volume,.8);
});

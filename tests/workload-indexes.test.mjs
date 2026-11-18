import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../browser/workload.js',import.meta.url),'utf8'),context);

test('BGM time mapping retains interval order and rounding at boundaries',()=>{
 const options={autoSpeed:1,textSpeed:1};
 for(const spans of [[[0,10.5],[10.5,14],[20,29]],[[10,25],[0,20]],[[4,4],[5,20]]]){
  const elastic=spans.map(([startMs,endMs],line)=>({startMs,endMs,line}));
  const samples=[0,4,5,9.5,10.5,14,18,20,25,29,30];
  const total=elastic.reduce((sum,w)=>sum+w.endMs-w.startMs,0);
  for(const target of [28,35]){
   const map=t=>t+elastic.reduce((n,w)=>n+Math.max(0,Math.min(t,w.endMs)-w.startMs)/total*(target-30),0);
   const result={options,elastic,durationMs:30,controlEvents:[],events:[],performWindows:samples.map(startMs=>({startMs}))};
   const output=context.__finishNativeTimeline({result,pre:{parsedStatements:0},settings:{...options,mode:'bgm',fps:30},playlist:[{durationMs:target}],range:null});
   assert.deepEqual(Array.from(output.performWindows,w=>w.startMs),samples.map(map));
  }
 }
});

test('matching keeps the first eligible perform and the first unused exit in measurement order',()=>{
 const names=['a.png','b.png','c.png'];
 const input={script:names.map(n=>'changeBg:'+n+';').join('\n'),parsed:{sentenceList:names.map((content,i)=>({command:1,commandRaw:'changeBg',content,startLine:i,endLine:i,args:[]}))},root:'C:/fixture',animations:{},media:{},fps:30,timing:{lineTimes:[0,100,101],durationSeconds:1,
  performWindows:[{line:1,command:'changeBg',role:'vocal',startMs:100,durationMs:99},{line:1,command:'changeBg',startMs:null,durationMs:98},{line:'1',command:'changeBg',startMs:100,durationMs:17},{line:1,command:'changeBg',startMs:100,durationMs:18}],
  stageExitWindows:[{startMs:102,target:'bg-main-first',stopMs:250},{startMs:99,target:'bg-main-second',stopMs:260}]}};
 const plan=context.__buildNativeWorkload(input);
 assert.equal(plan.events.find(e=>e.sourceIndex===1).plannedDurationMs,17);
 assert.deepEqual(Array.from(plan.replayWindows.filter(w=>w.command==='changeBg-exit'),w=>w.endMs),[250,260]);
});

test('untimed preview retains the statement count and ordered unique video preflight paths',()=>{
 const names=['room.mp4','forest.mp4','room.mp4'];
 const input={script:names.map(n=>'changeBg:'+n+';').join('\n'),parsed:{sentenceList:names.map((content,i)=>({command:1,commandRaw:'changeBg',content,startLine:i,endLine:i,args:[]}))},root:'C:/fixture',animations:{},media:{},fps:30};
 const plan=context.__buildNativeWorkload(input);
 const summary=context.__previewNativeWorkload(input);
 assert.deepEqual(Object.keys(summary).sort(),['parsedStatements','videoPaths']);
 assert.equal(summary.parsedStatements,plan.parsedStatements);
 assert.deepEqual(Array.from(summary.videoPaths),[...new Set(Array.from(plan.videoCues,cue=>cue.path))]);
 assert.deepEqual(Array.from(summary.videoPaths),['/game/background/room.mp4','/game/background/forest.mp4']);
});

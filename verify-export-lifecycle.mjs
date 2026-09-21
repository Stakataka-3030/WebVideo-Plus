import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const context={console};
context.globalThis=context;
context.scheduleAudioCommand=()=>{};
vm.createContext(context);
for(const name of ['workload.js','timeline.js','render.js','finish-timeline.js']){
  const source=fs.readFileSync(path.join(root,'browser',name),'utf8');
  new vm.Script(source,{filename:name});
  if(name==='workload.js')vm.runInContext(source,context,{filename:name});
}
const build=context.__buildNativeWorkload,finish=context.__finishNativeTimeline;
assert.equal(typeof build,'function');
assert.equal(typeof finish,'function');

const say=(content,args=[],startLine=0,endLine=startLine)=>({command:0,commandRaw:'',content,args,startLine,endLine,isLineBreakHolder:false});
const cmd=(commandRaw,content,args=[],startLine=0,endLine=startLine)=>({command:99,commandRaw,content,args,startLine,endLine,isLineBreakHolder:false});
const holder=(line)=>({command:99,commandRaw:'comment',content:'',args:[],startLine:line,endLine:line,isLineBreakHolder:true});

{
  const script=[
    'setTransform:{"position":{"x":100}}',
    '  -duration=5000',
    '  -target=hero',
    '  -next',
    '  -keep;',
    'hero:hello;'
  ].join('\n');
  const parsed={sentenceList:[
    cmd('setTransform','{"position":{"x":100}}',[{key:'duration',value:5000},{key:'target',value:'hero'},{key:'next',value:true},{key:'keep',value:true}],0,4),
    holder(1),holder(2),holder(3),holder(4),
    say('hello',[{key:'speaker',value:'hero'}],5)
  ]};
  const timing={durationSeconds:8,lineTimes:[0,null,null,null,null,0],sourceEvents:[{index:0,forwardGroup:1},{index:5,forwardGroup:1}],controlEvents:[],performWindows:[
    {command:'setTransform',line:0,role:'primary',durationMs:5000,hold:true,startMs:0,stopMs:null},
    {command:'say',line:5,role:'primary',durationMs:1200,hold:false,startMs:0,stopMs:1200}
  ],stageExitWindows:[]};
  const plan=build({script,parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  const transform=plan.events.find(e=>e.command==='setTransform');
  assert.ok(transform.script.includes('-duration=5000'));
  assert.ok(transform.script.includes('-target=hero'));
  assert.ok(transform.script.includes('-keep'));
  assert.equal(transform.forwardGroup,1);
  const keepWindow=plan.replayWindows.find(w=>w.command==='setTransform');
  assert.equal(keepWindow.endMs,5000);
  assert.equal(keepWindow.dormantRestorable,true);
  assert.equal(keepWindow.noCut,false);
}

{
  const parsed={sentenceList:[
    cmd('wait','600',[{key:'next',value:true}],0),
    say('after-next',[],1)
  ]};
  const plan=build({script:'wait:600 -next;\nafter-next;',parsed,media:{},animations:{},timing:null,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(plan.events.find(e=>e.command==='say').atMs,0);

  const blocking={sentenceList:[cmd('wait','600',[],0),say('after',[],1)]};
  const blockingPlan=build({script:'wait:600;\nafter;',parsed:blocking,media:{},animations:{},timing:null,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(blockingPlan.events.find(e=>e.command==='say').atMs,600);
}

{
  const parsed={sentenceList:[say('new',[],0)]};
  const timing={durationSeconds:2,lineTimes:[600],sourceEvents:[{index:0,forwardGroup:2}],controlEvents:[{atMs:600,kind:'settle-nonhold',line:0}],performWindows:[{command:'say',line:0,role:'primary',durationMs:900,hold:false,startMs:600,stopMs:1500}],stageExitWindows:[]};
  const plan=build({script:'new;',parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.deepEqual(plan.events.slice(0,2).map(e=>e.command),['__settleNonHold','say']);
}

{
  const timing=finish({
    result:{
      options:{textSpeed:50,autoSpeed:50},
      events:[{index:0,atMs:0,command:'say'},{index:1,atMs:2000,command:'say'}],
      elastic:[{startMs:1000,endMs:2000,line:0}],
      controlEvents:[],
      performWindows:[
        {command:'say',line:0,role:'primary',durationMs:800,hold:false,startMs:0,stopMs:800},
        {command:'setTransform',line:0,role:'primary',durationMs:1500,hold:false,startMs:500,stopMs:2000},
        {command:'setTransform',line:0,role:'primary',durationMs:5000,hold:true,startMs:0,stopMs:3000}
      ],
      stageExitWindows:[{target:'hero-off',startMs:500,stopMs:2000}],
      durationMs:3000
    },
    pre:{parsedStatements:2},
    settings:{textSpeed:50,autoSpeed:50,mode:'bgm',fps:60,holdSeconds:1},
    playlist:[{durationMs:5000}],
    range:null
  });
  assert.equal(timing.durationSeconds,5);
  assert.equal(timing.performWindows[0].stopMs,800);
  assert.equal(timing.performWindows[1].stopMs,2000);
  assert.equal(timing.performWindows[2].stopMs,5000);
  assert.equal(timing.stageExitWindows[0].startMs,500);
  assert.equal(timing.stageExitWindows[0].stopMs,2000);
}

{
  const script=['changeFigure:model/model3.json -id=hero;','pixiPerform:rain;','pixiInit:;','changeFigure:none -id=hero;'].join('\n');
  const parsed={sentenceList:[
    cmd('changeFigure','model/model3.json',[{key:'id',value:'hero'}],0),
    cmd('pixiPerform','rain',[],1),
    cmd('pixiInit','',[],2),
    cmd('changeFigure','none',[{key:'id',value:'hero'}],3)
  ]};
  const timing={durationSeconds:6,lineTimes:[0,1000,3000,4000],sourceEvents:[{index:0,forwardGroup:1},{index:1,forwardGroup:2},{index:2,forwardGroup:3},{index:3,forwardGroup:4}],controlEvents:[],performWindows:[
    {command:'changeFigure',line:0,role:'primary',durationMs:300,hold:false,startMs:0,stopMs:300},
    {command:'pixiPerform',line:1,role:'primary',durationMs:0,hold:true,startMs:1000,stopMs:3000},
    {command:'changeFigure',line:3,role:'primary',durationMs:450,hold:false,startMs:4000,stopMs:4450}
  ],stageExitWindows:[{target:'hero123-off',startMs:4000,stopMs:4450}]};
  const plan=build({script,parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(plan.replayWindows.find(w=>w.command==='pixiPerform').noCut,true);
  assert.equal(plan.replayWindows.find(w=>w.command==='changeFigure-runtime').noCut,true);
  assert.equal(plan.replayWindows.find(w=>w.command==='changeFigure-exit').noCut,true);
}

console.log('Export lifecycle regression checks passed.');

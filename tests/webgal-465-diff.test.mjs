// Portable data-layer regressions only. These do not claim Pixi/WebView2 pixel
// parity; real decoded-image and worker-seam validation runs on Windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sandbox={URL,WebVideoTools:{register(){}}};
sandbox.globalThis=sandbox;sandbox.window=sandbox;
vm.createContext(sandbox);
for(const name of ['workload','navigation-metadata','timeline-core','navigation-model','project-core','auto-exit','filter-helpers','id-conversion']){
  vm.runInContext(fs.readFileSync(path.join(root,`browser/${name}.js`),'utf8'),sandbox,{filename:`browser/${name}.js`});
}
vm.runInContext('globalThis.autoExit=WebVideoAutoExit;globalThis.filters=WebVideoFilters;',sandbox);
const plain=value=>JSON.parse(JSON.stringify(value));
const command=(commandRaw,content,args={})=>({command:commandRaw==='say'?0:1,commandRaw,content,args:Object.entries(args).map(([key,value])=>({key,value}))});
function fixture(statements){
  const sentenceList=statements.map((sentence,line)=>({...sentence,startLine:line,endLine:line}));
  const script=sentenceList.map(s=>s.commandRaw+':'+s.content+s.args.map(({key,value})=>' -'+key+(value===true?'':'='+value)).join('')+';').join('\n');
  return {script,parsed:{sentenceList}};
}
function workload(statements,options={}){
  const f=fixture(statements),{lineTimes=statements.map((_,i)=>i*100),durationSeconds=2,performWindows=[],...rest}=options;
  return plain(sandbox.__buildNativeWorkload({...f,media:{},animations:{},timing:{lineTimes,durationSeconds,sourceEvents:[],performWindows,stageExitWindows:[]},root:'C:/fake',project:'C:/fake',sceneName:'start.txt',fps:30,...rest}));
}
function navigation(statements){
  const f=fixture(statements);
  return sandbox.WebVideoNavigation.derive('game/scene/start.txt',f.script,f.parsed,{0:'say'},{});
}
const diffWindows=result=>result.softCutWindows.filter(w=>w.reason==='figure-diff');
const figureExits=result=>result.replayWindows.filter(w=>w.command==='changeFigure-exit');
const items=row=>row.parts.flatMap(part=>part.items);

test('image diff carries its actual perform duration and protected replay window',()=>{
  const result=workload([command('changeFigure','a.png',{id:'hero',next:true}),command('changeFigureDiff','b.png',{id:'hero',next:true}),command('wait','1000')],{
    performWindows:[{role:'primary',line:1,command:'changeFigureDiff',startMs:100,stopMs:380,durationMs:280,hold:false}]
  });
  assert.equal(result.counts.changeFigureDiff,1);
  assert.equal(result.events.find(e=>e.command==='changeFigureDiff').loads,true);
  assert.deepEqual(diffWindows(result),[{startMs:100,endMs:380,reason:'figure-diff',target:'hero',line:2}]);
  assert.equal(result.replayWindows.find(w=>w.command==='changeFigureDiff')?.endMs,380);
  assert.deepEqual(figureExits(result),[]);
});

test('image diff uses the official 200 ms fallback when no perform trace exists',()=>{
  const result=workload([command('changeFigure','a.png',{id:'hero'}),command('changeFigureDiff','b.png',{id:'hero'})]);
  assert.equal(diffWindows(result)[0].endMs,300);
  assert.deepEqual(result.replayWindows,[],'A fallback scheduling guard is not an observed runtime replay');
});

test('repeating the same image under an explicit ID creates no phantom blend',()=>{
  for(const args of [{id:'hero'},{id:'hero',right:true},{id:'hero',bounds:'0,0,10,10'}]){
    const result=workload([command('changeFigure','a.png',{id:'hero',left:true}),command('changeFigureDiff','a.png',args)]);
    assert.deepEqual(diffWindows(result),[]);
    assert.deepEqual(figureExits(result),[]);
  }
});

test('image diff preserves original position and exit animation, ignoring replacement parameters',()=>{
  const result=workload([
    command('changeFigure','a.png',{id:'hero',left:true,exit:'fade'}),
    command('changeFigureDiff','b.png',{id:'hero',right:true,bounds:'0,0,10,10',clear:true,exit:'not-loaded'}),
    command('changeFigure','b.png',{id:'hero',left:true}),
    command('changeFigureDiff','none',{id:'hero'})
  ],{animations:{fade:[{duration:700}]}});
  assert.equal(diffWindows(result).length,1);
  assert.deepEqual(figureExits(result).map(({startMs,endMs,line})=>({startMs,endMs,line})),[{startMs:300,endMs:1000,line:4}]);
  assert.deepEqual(result.extraAnimations.map(([name])=>name),['fade']);
});

test('a first image diff follows entry semantics rather than inventing a blend',()=>{
  const result=workload([command('changeFigureDiff','a.png',{id:'hero',left:true}),command('changeFigure','a.png',{id:'hero',left:true})]);
  assert.deepEqual(diffWindows(result),[]);
  assert.deepEqual(figureExits(result),[]);
});

test('none and parser-normalized empty diff remove the identity once',()=>{
  for(const empty of ['none','']){
    const result=workload([command('changeFigure','a.png',{id:'hero'}),command('changeFigureDiff',empty,{id:'hero'}),command('changeFigureDiff',empty,{id:'hero'}),command('changeFigureDiff','a.png',{id:'hero'})]);
    assert.deepEqual(diffWindows(result),[]);
    assert.equal(figureExits(result).length,1);
    assert.equal(figureExits(result)[0].line,2);
  }
});

// Preflight intentionally rejects video diff even though upstream classifies
// video resources as textures. The scheduler stays inside that narrower contract.
test('exporter-rejected model and video diff preserve an existing image identity',()=>{
  for(const name of ['hero.model3.json','hero.skel','hero.webm']){
    const result=workload([command('changeFigure','a.png',{id:'hero'}),command('changeFigureDiff',name,{id:'hero'}),command('changeFigure','a.png',{id:'hero'})]);
    assert.deepEqual(diffWindows(result),[]);
    assert.deepEqual(figureExits(result),[]);
    assert.deepEqual(result.videoCues,[]);
    assert.deepEqual(result.live2dLifetimes,[]);
  }
});

test('an unsupported image diff against a model preserves its whole Live2D lifetime',()=>{
  const result=workload([command('changeFigure','hero.model3.json',{id:'hero',motion:'idle'}),command('changeFigureDiff','b.png',{id:'hero'}),command('changeFigure','hero.model3.json',{id:'hero'})]);
  assert.deepEqual(diffWindows(result),[]);
  assert.deepEqual(figureExits(result),[]);
  assert.equal(result.live2dLifetimes.length,1);
  assert.equal(result.live2dLifetimes[0].source,'hero.model3.json');
  assert.equal(result.live2dLifetimes[0].endMs,2000);
});

test('model diff removal preserves its lifetime until ordinary changeFigure removal',()=>{
  for(const name of ['hero.model3.json','hero.wmdl','avatar.custom'])for(const empty of ['none','']){
    const entry=command('changeFigure',name,{id:'hero',motion:'idle'});
    const diff=command('changeFigureDiff',empty,{id:'hero'});
    const retained=workload([entry,diff]);
    assert.equal(retained.live2dLifetimes.length,1);
    assert.equal(retained.live2dLifetimes[0].endMs,2000);
    assert.deepEqual(figureExits(retained),[]);
    const removed=workload([entry,diff,command('changeFigure','none',{id:'hero'})]);
    assert.equal(removed.live2dLifetimes[0].endMs,200);
    assert.equal(figureExits(removed).length,1);
    assert.equal(figureExits(removed)[0].line,3);
  }
});

test('navigation keeps image position, layer and filter state across a diff',()=>{
  const model=navigation([
    command('changeFigure','a.png',{id:'hero',left:true,zIndex:7}),
    command('setTransform','{"brightness":0.35,"position":{"x":80}}',{target:'hero',duration:0}),
    command('changeFigureDiff','b.png',{id:'hero',right:true,zIndex:99,transform:'{"brightness":1}'}),
    command('setTransform','{"brightness":0.35,"position":{"x":80}}',{target:'hero',duration:0}),
    command('changeFigure','b.png',{id:'hero',left:true,zIndex:7})
  ]);
  assert.match(model.statements[2].title,/立绘差分/);
  assert.deepEqual(plain(items(model.statements[3])),['目标：hero'],'Repeated effect must be unchanged after diff');
  assert.equal(model.statements[4].figureEntering,undefined);
  assert.deepEqual(plain(model.statements[4].parts),[],'Diff must retain prior zIndex');
  const auto=plain(sandbox.autoExit.scan(model));
  assert.deepEqual(auto.items,[],'Diff must not trigger automatic departure');
});

for(const [name,args,resets] of [
  ['current',{transformFrom:'current'},false],
  ['default',{transformFrom:'default'},true],
  ['legacy default',{writeDefault:true},true],
  ['legacy ignored default',{writeDefault:true,ignoreDefault:true},false],
  ['explicit current overrides legacy default',{transformFrom:'current',writeDefault:true},false],
  ['explicit default overrides ignoreDefault',{transformFrom:'default',ignoreDefault:true},true],
  ['parallel default only writes named fields',{transformFrom:'default',parallel:true},false]
])test(`navigation transformFrom ${name} matches 4.6.5 precedence after image diff`,()=>{
  const model=navigation([
    command('changeFigure','a.png',{id:'hero'}),
    command('setTransform','{"brightness":0.35,"position":{"y":80}}',{target:'hero',duration:0}),
    command('changeFigureDiff','b.png',{id:'hero'}),
    command('setTransform','{"position":{"x":40}}',{target:'hero',duration:0,...args})
  ]);
  const changes=items(model.statements[3]);
  assert.equal(changes.includes('亮度：1'),resets);
  assert.equal(changes.includes('Y轴位移：0'),resets);
  assert.ok(changes.includes('X轴位移：40'));
});

test('automatic exit uses retained position and latest image after diff',()=>{
  const model=navigation([command('changeFigure','a.png',{id:'hero',left:true}),command('changeFigureDiff','b.png',{id:'hero',right:true}),command('changeFigure','other.png',{id:'other',left:true})]);
  const result=plain(sandbox.autoExit.scan(model));
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].victims[0].pos,'left');
  assert.equal(result.items[0].victims[0].file,'b.png');
  assert.equal(result.patches[0].after,'changeFigure:none -id=hero -left -next;\n');
});

test('diff removal clears navigation and project presence and cannot receive a batch filter',()=>{
  for(const empty of ['none','']){
    const model=navigation([command('changeFigure','a.png',{id:'hero'}),command('changeFigureDiff',empty,{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'})]);
    assert.equal(model.statements[2].invalidSpeakerSource,true);
    const inspection=sandbox.WebVideoProjectCore.inspect(model,{markers:[]});
    assert.ok(inspection.issues.some(issue=>issue.code==='figure-not-seen'));
    const removal=sandbox.filters.rows(model).find(item=>item.row.command==='changeFigureDiff');
    assert.equal(removal.departure,true);
    assert.equal(removal.eligible,false);
  }
});

test('project inspection tracks the new image without discarding retained state',()=>{
  const model=navigation([command('changeFigure','a.png',{id:'hero'}),command('changeFigureDiff','b.png',{id:'hero'}),command('say','hello',{figureId:'hero'})]);
  const inspection=sandbox.WebVideoProjectCore.inspect(model,{markers:[]});
  assert.equal(inspection.rowDetails.get(model.statements[2].id).file,'b.png');
  assert.equal(inspection.issues.length,0);
});

test('known model diff removal keeps navigation effects, presence and automatic-exit state',()=>{
  for(const name of ['hero.model3.json','hero.skel','hero.png?type=spine'])for(const empty of ['none','']){
    const model=navigation([
      command('changeFigure',name,{id:'hero',left:true}),
      command('setTransform','{"brightness":0.35}',{target:'hero',duration:0}),
      command('changeFigureDiff',empty,{id:'hero'}),
      command('setTransform','{"brightness":0.35}',{target:'hero',duration:0}),
      command('say','hello',{speaker:'Hero',figureId:'hero'}),
      command('changeFigure','other.png',{id:'other',left:true})
    ]);
    assert.equal(model.statements[2].diffNoop,true);
    assert.equal(model.statements[4].invalidSpeakerSource,false);
    assert.deepEqual(plain(items(model.statements[3])),['目标：hero']);
    const inspection=sandbox.WebVideoProjectCore.inspect(model,{markers:[]});
    assert.equal(inspection.rowDetails.get(model.statements[4].id).file,name);
    assert.equal(inspection.issues.length,0);
    const auto=plain(sandbox.autoExit.scan(model));
    assert.equal(auto.items.length,1);
    assert.equal(auto.items[0].victims[0].file,name);
    const filter=sandbox.filters.rows(model).find(item=>item.row.id===model.statements[2].id);
    assert.equal(filter.departure,false);
    assert.equal(filter.eligible,false);
    const cue=sandbox.WebVideoProjectCore.makePlan(model,{path:model.path,source:model.source,ids:[model.statements[4].id]},
      {type:'figureCue',kind:'filter',target:'speaker',effect:{brightness:0.7}}, {bindings:{}}, {parse:()=>({})});
    assert.equal(cue.changed,1,'Figure cue must still find the retained model');
    assert.match(cue.patches[0].after,/-target=hero/);
  }
});

test('a first unsupported model diff never invents navigation presence or a replay lifetime',()=>{
  for(const name of ['hero.model3.json','hero.skel','hero.png?type=spine']){
    const commands=[command('changeFigureDiff',name,{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'})];
    const model=navigation(commands);
    assert.equal(model.statements[0].diffNoop,true);
    assert.equal(model.statements[0].figureEntering,undefined);
    assert.equal(model.statements[1].invalidSpeakerSource,true);
    const inspection=sandbox.WebVideoProjectCore.inspect(model,{markers:[]});
    assert.ok(inspection.issues.some(issue=>issue.code==='figure-not-seen'));
    assert.equal(inspection.rowDetails.has(model.statements[1].id),false);
    assert.deepEqual(workload(commands).live2dLifetimes,[]);
  }
});

test('a rejected model diff leaves the previous image available to project tools',()=>{
  for(const name of ['hero.model3.json','hero.skel','hero.png?type=spine']){
    const model=navigation([command('changeFigure','a.png',{id:'hero',left:true}),command('changeFigureDiff',name,{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'}),command('changeFigure','other.png',{id:'other',left:true})]);
    assert.equal(model.statements[1].diffNoop,true);
    assert.equal(model.statements[2].invalidSpeakerSource,false);
    const inspection=sandbox.WebVideoProjectCore.inspect(model,{markers:[]});
    assert.equal(inspection.rowDetails.get(model.statements[2].id).file,'a.png');
    assert.equal(sandbox.autoExit.scan(model).items[0].victims[0].file,'a.png');
  }
});

test('video removal remains a texture fallback in navigation, not a model no-op',()=>{
  const model=navigation([command('changeFigure','clip.webm',{id:'hero'}),command('changeFigureDiff','none',{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'})]);
  assert.equal(model.statements[1].diffNoop,undefined);
  assert.equal(model.statements[2].invalidSpeakerSource,true);
  assert.equal(sandbox.filters.rows(model).find(item=>item.row.command==='changeFigureDiff').departure,true);
});

test('bundled batch filter uses the same no-op guard as the portable helper',()=>{
  const helper=fs.readFileSync(path.join(root,'browser/filter-helpers.js'),'utf8').trimEnd();
  const bundled=fs.readFileSync(path.join(root,'browser/batch-filter.js'),'utf8');
  assert.ok(bundled.startsWith(helper));
});


test('ID conversion keeps a model available after a rejected diff removal',()=>{
  const commands=[command('changeFigure','hero.model3.json',{id:'hero'}),command('changeFigureDiff','none',{id:'hero'}),command('say','hello',{speaker:'Hero'})];
  const f=fixture(commands),model=navigation(commands);
  const native={parse:()=>f.parsed,write:(row,{args})=>{
    const values={...row.args,...args};
    return row.command+':'+row.content+Object.entries(values).filter(([,value])=>value!==false).map(([key,value])=>' -'+key+(value===true?'':'='+value)).join('')+';';
  }};
  const plan=sandbox.WebVideoIdConversion.plan(model,{overwrite:false,ignorePresence:false},{nameToId:{Hero:'hero'}},native);
  assert.equal(plan.stats.dialogues,1);
  assert.match(plan.after,/say:hello .*?-figureId=hero/);
  assert.ok(plan.warnings.some(message=>message.includes('图片差分不适用于当前素材')));
});


test('Spine query guards win over image suffixes in both workload directions',()=>{
  for(const [before,after] of [['a.png?type=spine','b.png'],['a.png','b.png?type=spine'],['a.png?type=spine#skin','b.png'],['a.png','b.png?type=spine#skin'],['a.png?type=%73pine','b.png'],['a.png','b.png?type=%73pine']]){
    const result=workload([command('changeFigure',before,{id:'hero'}),command('changeFigureDiff',after,{id:'hero'}),command('changeFigure',before,{id:'hero'})]);
    assert.deepEqual(diffWindows(result),[]);
    assert.deepEqual(figureExits(result),[],'Rejected diff must leave the old identity intact');
    assert.deepEqual(result.live2dLifetimes,[]);
  }
});


test('model query classification respects decoded values and first-parameter precedence',()=>{
  for(const name of ['hero.png?type=%73pine','hero.png?type=spine&type=image','hero.png?type=spine#skin']){
    const model=navigation([command('changeFigure',name,{id:'hero'}),command('changeFigureDiff','none',{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'})]);
    assert.equal(model.statements[1].diffNoop,true);
    assert.equal(model.statements[2].invalidSpeakerSource,false);
  }
  for(const name of ['hero.png?type=image&type=spine','hero.png?type=SPINE']){
    const model=navigation([command('changeFigure',name,{id:'hero'}),command('changeFigureDiff','none',{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'})]);
    assert.equal(model.statements[1].diffNoop,undefined);
    assert.equal(model.statements[2].invalidSpeakerSource,true);
  }
});

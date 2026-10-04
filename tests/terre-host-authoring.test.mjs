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
for(const name of ['navigation-metadata','timeline-core','navigation-model','project-core','auto-exit','filter-helpers','id-conversion']){
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
function navigation(statements){
  const f=fixture(statements);
  return sandbox.WebVideoNavigation.derive('game/scene/start.txt',f.script,f.parsed,{0:'say',36:'changeFigureDiff'},{});
}
const items=row=>row.parts.flatMap(part=>part.items);

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

test('unknown model-backed removal is rejected consistently across navigation, filters, checks and exits',()=>{
 for(const [file,args] of [['hero.wmdl',{}],['hero.custom',{motion:'idle'}],['hero.jsonl',{}]]){
  const model=navigation([command('changeFigure',file,{id:'hero',left:true,...args}),command('changeFigureDiff','none',{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'}),command('changeFigure','other.png',{id:'other',left:true})]);
  assert.equal(model.statements[1].diffNoop,true,file);
  assert.equal(model.statements[2].invalidSpeakerSource,false,file);
  assert.equal(sandbox.WebVideoProjectCore.inspect(model,{markers:[]}).rowDetails.get(model.statements[2].id).file,file);
  assert.equal(sandbox.filters.rows(model).find(item=>item.row.command==='changeFigureDiff').eligible,false);
  assert.equal(sandbox.autoExit.scan(model).items[0].victims[0].file,file);
 }
});

test('non-image replacement retains old image identity and cannot receive batch filters',()=>{
 for(const file of ['video.webm','hero.custom']){
  const model=navigation([command('changeFigure','hero.png',{id:'hero',left:true}),command('changeFigureDiff',file,{id:'hero'}),command('say','hello',{speaker:'Hero',figureId:'hero'})]);
  assert.equal(model.statements[1].diffNoop,true);
  assert.equal(sandbox.WebVideoProjectCore.inspect(model,{markers:[]}).rowDetails.get(model.statements[2].id).file,'hero.png');
  assert.equal(sandbox.filters.rows(model).find(item=>item.row.command==='changeFigureDiff').eligible,false);
 }
});

test('a first diff keeps normal entry effects and clear retains normal removal semantics',()=>{
 const model=navigation([command('changeFigureDiff','hero.png',{id:'hero',transform:'{"brightness":0.35}',left:true}),command('setTransform','{"brightness":0.35}',{target:'hero',duration:0})]);
 assert.equal(model.statements[0].figureEntering,true);
 assert.ok(model.statements[0].embeddedEffects.flatMap(part=>part.items).includes('亮度：0.35'));
 assert.deepEqual(plain(items(model.statements[1])),['目标：hero']);
 const clear=navigation([command('changeFigureDiff','hero.png',{id:'hero',clear:true}),command('say','hello',{speaker:'Hero',figureId:'hero'})]);
 assert.equal(clear.statements[0].figureEntering,undefined);
 assert.equal(clear.statements[1].invalidSpeakerSource,true);
 assert.equal(sandbox.filters.rows(clear).find(item=>item.row.command==='changeFigureDiff').eligible,false);
 assert.ok(sandbox.WebVideoProjectCore.inspect(clear,{markers:[]}).issues.some(issue=>issue.code==='figure-not-seen'));
 assert.equal(sandbox.autoExit.scan(clear).items.length,0);
});

test('replacement updates associated mouth images but preserves position, layer, effects and motion',()=>{
 const model=navigation([command('changeFigure','hero.png',{id:'hero',left:true,zIndex:20,motion:'idle',mouthOpen:'old-mouth.png'}),command('changeFigureDiff','hero2.png',{id:'hero',right:true,zIndex:99,motion:'jump',mouthClose:'new-mouth.png'}),command('changeFigure','hero2.png',{id:'hero',left:true,zIndex:20,mouthOpen:false,mouthClose:'new-mouth.png'}),command('say','hello',{speaker:'Hero',figureId:'hero'})]);
 assert.ok(items(model.statements[1]).includes('张开嘴：否'));
 assert.ok(items(model.statements[1]).includes('闭上嘴：new-mouth.png'));
 assert.equal(model.statements[2].figureEntering,undefined);
 assert.ok(model.statements[3].annotations.includes('动 idle'));
});

function idPlan(commands){
 const f=fixture(commands),model=navigation(commands),native={parse:()=>f.parsed,write:(row,{args,content=row.content})=>row.command+':'+content+Object.entries({...row.args,...args}).filter(([,value])=>value!==false).map(([key,value])=>' -'+key+(value===true?'':'='+value)).join('')+';'};
 return sandbox.WebVideoIdConversion.plan(model,{overwrite:false,ignorePresence:false},{nameToId:{Hero:'hero'}},native);
}
test('ID conversion carries an implicitly renamed actor through diff and dialogue',()=>{
 const plan=idPlan([command('changeFigure','Hero.png',{left:true}),command('changeFigureDiff','Hero2.png',{left:true}),command('say','hello',{speaker:'Hero'})]);
 assert.match(plan.after,/changeFigureDiff:Hero2\.png -left -id=hero/);
 assert.match(plan.after,/say:hello .*?-figureId=hero/);
 assert.equal(plan.warnings.length,0);
});
test('first diff uses normal entry ID inference and rejected diff removal preserves a live model ID',()=>{
 const first=idPlan([command('changeFigureDiff','Hero.png',{left:true}),command('say','hello',{speaker:'Hero'})]);
 assert.match(first.after,/changeFigureDiff:Hero\.png -left -id=hero/);
 assert.match(first.after,/-figureId=hero/);
 const model=idPlan([command('changeFigure','Hero.wmdl',{id:'hero'}),command('changeFigureDiff','none',{id:'hero'}),command('say','hello',{speaker:'Hero'})]);
 assert.match(model.after,/-figureId=hero/);assert.ok(model.warnings.some(message=>message.includes('图片差分不适用于当前素材')));
});

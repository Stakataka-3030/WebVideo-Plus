import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const versions=['4.6.4','4.6.5','4.6.6'];
const built=spawnSync(process.execPath,['scripts/build-timeline.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(built.status,0,built.stdout+built.stderr);
function once(source,find,replace){assert.equal(source.split(find).length,2,'Exact integration anchor must be unique: '+find.slice(0,100));return source.replace(find,()=>replace);}
function patch(source,p){
 if(p.find)return once(source,p.find,p.replace);
 const start=source.indexOf(p.scopeStart),end=source.indexOf(p.scopeEnd,start+p.scopeStart.length);
 assert.ok(start>=0&&end>start,p.scopeStart);assert.equal(source.indexOf(p.scopeStart,start+p.scopeStart.length),-1);
 const scope=source.slice(start,end),regex=new RegExp(p.regex,'g');assert.equal([...scope.matchAll(regex)].length,1,p.regex);
 return source.slice(0,start)+scope.replace(regex,p.replace.replace(/\$\{(\w+)\}/g,'$$<$1>'))+source.slice(end);
}
function parser(version){
 const bundle=read('baseline/terre-'+version+'.js'),start=bundle.indexOf('var commandType$1;'),end=bundle.indexOf('function TabItem(',start);
 assert.ok(start>=0&&end>start);const context=vm.createContext({URL,WebVideoTools:{register(){}}});
 context.window=context;context.globalThis=context;
 vm.runInContext('const bo=(o,k,v)=>(o[k]=v);'+bundle.slice(start,end)+';globalThis.parse=parseScene;globalThis.types=commandType;',context);
 for(const name of ['navigation-metadata','timeline-core','navigation-model','batch-next'])vm.runInContext(read('browser/'+name+'.js'),context);
 vm.runInContext('globalThis.batchNext=WebVideoBatchNext;',context);
 return {context,derive:source=>context.WebVideoTimelineCore.derive('games/demo/game/scene/start.txt',source,context.parse(source),context.types)};
}
for(const version of versions){
 test('Terre '+version+' baseline hash and all generated host anchors remain verified',()=>{
  const source=read('baseline/terre-'+version+'.js'),meta=JSON.parse(read(version==='4.6.4'?'baseline/local-baseline.json':'baseline/terre-'+version+'.json'));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),meta.baseHash);
  let result=source;
  for(const file of ['product-ui/menu-patches.json','product-ui/character-map-patches.json','timeline/patches.json','product-ui/game-patches.json']){
   const patches=JSON.parse(read('package/hosts/'+version+'/'+file));assert.ok(patches.length>0);
   for(const item of patches)result=patch(result,item);
  }
  const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:result,encoding:'utf8',maxBuffer:128*1024});
  assert.equal(syntax.status,0,syntax.stderr?.slice(-3000)||'Every full host profile must produce parseable JavaScript');
  assert.ok(result.includes('WebVideoStorySelector')===false,'Host views are injected separately');
  assert.ok(result.includes('WebVideoTimelineHost'));assert.ok(result.includes('WebVideoAddSentenceDialog'));
 });
 test('Terre '+version+' native parser and batch authoring use its own command enum',()=>{
  const {context,derive}=parser(version),model=derive('changeFigure:hero.png -id=hero;\nchangeFigureDiff:hero2.png -id=hero;\nHero:Hello -figureId=hero;');
  assert.equal(model.statements[1].command,version!=='4.6.4'?'changeFigureDiff':'say');
  assert.equal(context.batchNext.types.some(([command])=>command==='changeFigureDiff'),version!=='4.6.4');
  assert.equal(context.WebVideoNavigationMetadataProfiles[version].fields.brightness.default,1);
 });
 test('Terre '+version+' transformFrom precedence follows the native host capability',()=>{
  const {derive}=parser(version);
  const model=derive('changeFigure:hero.png -id=hero;\nsetTransform:{"brightness":0.35} -target=hero -duration=0;\nsetTransform:{"position":{"x":40}} -target=hero -duration=0 -writeDefault -transformFrom=current;');
  const changes=model.statements[2].parts.flatMap(part=>part.items);
  assert.equal(changes.includes('亮度：1'),version==='4.6.4');
  assert.ok(changes.includes('X轴位移：40'));
 });
}
test('product declares all host profiles without changing the legacy primary identity',()=>{
 const product=JSON.parse(read('package/product.json'));
 assert.deepEqual(product.supportedTerreVersions,versions);assert.equal(product.terreVersion,'4.6.4');
 for(const version of versions){assert.equal(product.hostProfiles[version].patchRoot,'hosts/'+version);assert.match(product.hostProfiles[version].baseHash,/^[a-f0-9]{64}$/);}
 for(const file of ['product-ui/menu-patches.json','product-ui/character-map-patches.json','timeline/patches.json','product-ui/game-patches.json'])assert.equal(read('package/'+file),read('package/hosts/4.6.4/'+file));
});

test('package integrity gates require all generated host profiles',()=>{
 const verifier=read('scripts/verify-package.mjs');
 assert.match(verifier,/supportedTerreVersions,\['4\.6\.4','4\.6\.5','4\.6\.6'\]/);
 for(const file of ['product-ui/menu-patches.json','product-ui/character-map-patches.json','product-ui/game-patches.json','timeline/patches.json'])assert.ok(verifier.includes(file));
});

test('the exact generated timeline payload loads helpers in production order',()=>{
 for(const version of versions){
  const bundle=read('baseline/terre-'+version+'.js'),start=bundle.indexOf('var commandType$1;'),end=bundle.indexOf('function TabItem(',start),context=vm.createContext({URL});
  context.window=context;context.globalThis=context;
  vm.runInContext('const bo=(o,k,v)=>(o[k]=v);'+bundle.slice(start,end)+';globalThis.parse=parseScene;globalThis.types=commandType;',context);
  context.WebVideoHostProfile={terreVersion:version,supportsFigureDiff:version!=='4.6.4',transformFrom:version!=='4.6.4'};
  vm.runInContext(read('package/timeline/timeline-core.js'),context);
  const source='changeFigure:hero.png -id=hero;\nchangeFigureDiff:smile.png -id=hero;';
  const model=context.WebVideoTimelineCore.derive('games/demo/game/scene/start.txt',source,context.parse(source),context.types);
  assert.equal(model.statements[1].command,version!=='4.6.4'?'changeFigureDiff':'say');
  if(version!=='4.6.4')assert.equal(model.statements[1].target,'hero');
 }
});

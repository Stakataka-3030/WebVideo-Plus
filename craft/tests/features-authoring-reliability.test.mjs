import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=process.env.WVP_SOURCE_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),context=vm.createContext({URL,console});context.window=context;
for(const n of ['navigation-metadata','timeline-core','filter-library','navigation-model'])vm.runInContext(fs.readFileSync(root+'/browser/'+n+'.js','utf8'),context);
for(const n of ['vendor/webgal-parser-4.6.5','script','navigation-description','id-completion','authoring'])vm.runInContext(fs.readFileSync(root+'/craft/features/'+n+'.js','utf8'),context);
const S=context.WebVideoCraftScript,F=context.WebVideoCraftFeatures,caps={multilineStatements:true,changeFigureDiff:true,transformFrom:true,sceneSemantics:true},snap=source=>({projectId:'fixture',path:'game/scene/a.txt',revision:1,source,runtimeCapabilities:caps}),rows=source=>S.parse(source,{capabilities:caps}).statements;
test('conditional entrance receives guarded exits, later uncertain state is not rewritten',()=>{
 const source='changeFigure:a.png -id=alice -left;\nchangeFigure:b.png -id=bob -left -when=flag;\nchangeFigure:c.png -id=carol -left;',p=F.autoExit(snap(source));assert.equal(p.stats.inserted,1);assert.match(p.after,/changeFigure:none -id=alice -left -next -when=flag/);assert.ok(!p.after.includes('changeFigure:none -id=bob'));assert.ok(p.warnings.length);const selected=F.selectionRows(snap(source),'exits');assert.equal(selected[1].eligible,true);assert.equal(selected[2].eligible,false);
});
test('unknown and wmdl model diff removal retain live stage identity and template',()=>{
 for(const file of ['hero.wmdl','hero.bin']){const source=`changeFigure:${file} -id=hero -motion=idle -expression=smile;\nchangeFigureDiff:none -id=hero;\nAlice:A -id -figureId=hero;`,scan=F.stageScan(S.parse(source,{capabilities:caps}));assert.equal(scan.rows[0].target.file,file);assert.equal(scan.rows[0].eligible,true);assert.equal(F.checks(snap(source)).filter(x=>x.type==='missing-figure').length,0);assert.match(F.expressionPreparation(snap(source)).after,new RegExp('changeFigure:'+file.replace('.','\\.')));const exits=F.autoExit(snap(source+'\nchangeFigure:other.png -id=other;'));assert.equal(exits.stats.inserted,1);assert.equal(F.selectionRows(snap(source),'exits')[1].eligible,false);}
});
test('performance checks read active figure motion and expression and reset after changes',()=>{
 const source='changeFigure:hero.model3.json -id=hero -motion=idle -expression=smile;\nAlice:A -id -figureId=hero;\nAlice:B -id -figureId=hero;\nAlice:C -id -figureId=hero;';assert.equal(F.checks(snap(source)).filter(x=>x.type==='repeated-performance').length,1);const changed=source.replace('Alice:C','changeFigure:hero.model3.json -id=hero -motion=wave;\nAlice:C');assert.equal(F.checks(snap(changed)).filter(x=>x.type==='repeated-performance').length,0);
});
test('batch and expanded named filters preserve execution conditions',()=>{
 const source='changeFigure:a.png -id=hero -when=flag;',p=F.batchFilter(snap(source),{figure:[{brightness:0.5}]});assert.equal(rows(p.after)[1].args.when,'flag');const code='setTransform:{"brightness":0.5} -target=hero -when=flag -transformFrom=current;',preset={id:'old',name:'Old',effects:[{brightness:0.5}]},edited=F.editFilters(snap(code),{mode:'replace',library:[preset],replacement:[{contrast:1.2},{saturation:0.5}]});for(const r of rows(edited.after)){assert.equal(r.args.when,'flag');assert.equal(r.args.transformFrom,'current');}
});
test('named filter grouping cannot merge different execution conditions',()=>{
 const source='setTransform:{"brightness":0.5} -target=hero -when=first;\nsetTransform:{"contrast":0.5} -target=hero -when=second;',library=[{id:'pair',name:'Pair',effects:[{brightness:0.5},{contrast:0.5}]}];assert.equal(F.findFilters(snap(source),library).length,0);
});
test('production writer keeps rich long text, original inline data and detects body injection',()=>{
 const text='文字（末字）<span style="color:rgb(1, 2, 3)">文本</span>\u200b'.repeat(5),source='Alice:'+text+' -vocal=line.wav -when=flag; inline',r=rows(source)[0],out=S.write(r,{args:{id:true,figureId:'hero'}});assert.equal(rows(out)[0].content,text);assert.match(out,/; inline$/);assert.throws(()=>S.write(r,{content:'text -id=intruder'}));
});
test('ID completion does not invent state after branches and preserves model no-op differences',()=>{
 const mapping={nameToId:{Alice:'alice',Bob:'bob'}},source='changeFigure:Alice.wmdl -id=alice -motion=idle;\nchangeFigureDiff:none -id=alice;\nAlice:A -id -figureId=alice;',p=F.idCompletion(snap(source),{},mapping);assert.ok(rows(p.after).some(r=>r.command==='changeFigureDiff'&&r.args.id==='alice'));const conditional=F.idCompletion(snap('changeFigure:Alice.png -left;\nchangeFigure:Bob.png -left -when=flag;\nAlice:A -left;'),{},mapping);assert.ok(!conditional.after.includes('changeFigure:none'));assert.ok(conditional.warnings.length);
});

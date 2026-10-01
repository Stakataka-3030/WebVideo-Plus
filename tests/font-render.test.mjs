import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateMeasurement,compareMeasurements,runtimeStyles} from './font-render.mjs';
const ids=['zh','zhHant','ja','digits','latin','wrap','explicitBreak','rounded'];
const good=()=>({ok:true,viewport:{width:1920,height:1080},platformFonts:Object.fromEntries([...ids,'dialogue','speaker'].map(id=>[id,[{familyName:'Fixture',isCustomFont:true}]])),samples:{...Object.fromEntries(ids.map(id=>[id,{font:'WebgalUI',advance:100,box:{x:0,y:0,width:800,height:80},scrollWidth:800,clientWidth:800,lines:Array.from({length:['wrap','explicitBreak'].includes(id)?2:1},()=>({width:100,text:'中文'}))}])),dialogue:{font:'WebgalUI',scrollWidth:800,clientWidth:800,scrollHeight:160,clientHeight:160,layers:[{x:200,y:780,width:600,height:60},{x:200,y:860,width:600,height:60}]},speaker:{font:'WebgalUI'}}});
test('accepts loaded, contained multilingual text',()=>assert.equal(validateMeasurement(good()),true));
test('rejects unloaded, fallback, clipping, misplaced, and lost-break regressions',()=>{
 for(const mutate of [r=>r.ok=false,r=>r.platformFonts.ja[0].isCustomFont=false,r=>r.samples.digits.scrollWidth=900,r=>r.samples.dialogue.layers[0].width=1900,r=>r.samples.explicitBreak.lines.pop(),r=>r.samples.zh.box.y=710,r=>r.samples.latin.font='serif']){const report=good();mutate(report);assert.throws(()=>validateMeasurement(report));}
});
test('comparison reports expected differences and rejects broad metric drift',()=>{
 const old=good(),current=good();current.samples.latin.advance=95;const result=compareMeasurements(old,current);assert.ok(Math.abs(result.latin.advanceChangePercent+5)<0.001);current.samples.zh.advance=140;assert.throws(()=>compareMeasurements(old,current),/15%/);
});
test('unchanged rounded font is an independent layout control',()=>{const old=good(),current=good();current.samples.rounded.advance=102;assert.throws(()=>compareMeasurements(old,current),/control moved/);});
test('native fixture cannot select a project-provided runtime or font',()=>{
 const project=new URL('./fixtures/font-render/project/',import.meta.url);
 assert.equal(fs.existsSync(new URL('index.html',project)),false);
 assert.equal(fs.existsSync(new URL('game/template',project)),false);
 assert.match(fs.readFileSync(new URL('game/userStyleSheet.css',project),'utf8'),/font-family: WebgalUI, sans-serif !important/);
 assert.match(fs.readFileSync(new URL('game/scene/start.txt',project),'utf8'),/日本語/);
});
test('runtime CSS points to the existing pinned font when build inputs are present',()=>{
 const root=new URL('../package/runtime/web/',import.meta.url);if(!fs.existsSync(new URL('index.html',root)))return;
 const lock=JSON.parse(fs.readFileSync(new URL('../build/dependencies.lock.json',import.meta.url),'utf8'));
 assert.equal(runtimeStyles(fileURLToPath(root)).fontSha256,lock.sourceHanSans.sha256);
});

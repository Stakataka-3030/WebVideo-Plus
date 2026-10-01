import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateUiFontReport} from './terre-ui-font-render.mjs';
const root=new URL('../',import.meta.url);
for(const file of ['timeline.css','timeline-theme.css','toolbar.css','tools.css'])test(file+' inherits ordinary fonts and uses host monospace token',()=>{
 const css=fs.readFileSync(new URL('browser/'+file,root),'utf8');
 assert.doesNotMatch(css,/Microsoft YaHei|PingFang|Consolas|ui-monospace|system-ui/);
 assert.doesNotMatch(css,/font\s*:[^;}]*\d[^;}]*\binherit\b/,'inherit is invalid as the family component of a font shorthand');
 if(file==='tools.css')assert.match(css,/font-family:var\(--fontFamilyMonospace,monospace\)/);
});
test('update notice inherits its real host rather than selecting a private font',()=>{
 const source=fs.readFileSync(new URL('browser/update-check.js',root),'utf8');
 assert.match(source,/font-family:inherit/);assert.doesNotMatch(source,/Microsoft YaHei|font-family:system-ui/);
});
const good=()=>({ok:true,before:{host:{fontFamily:'Host A'}},phases:['initial','host-family-and-mono-changed','base-token-only-changed','mono-token-unset'].map((name,index)=>({name,bodyFamily:index?'Host B':'Host A',monoFamily:index===3?'monospace':index?'Mono B':'Mono A',hostWithout:{host:{fontFamily:index?'Host B':'Host A'}},hostWith:{host:{fontFamily:index?'Host B':'Host A'}},nodes:[{id:'ordinary',expected:index?'Host B':'Host A',style:{fontFamily:index?'Host B':'Host A'}},{id:'code',expected:index===3?'monospace':index?'Mono B':'Mono A',style:{fontFamily:index===3?'monospace':index?'Mono B':'Mono A'}}]}))});
test('report validation accepts inheritance and rejects font leakage or host mutation',()=>{
 assert.equal(validateUiFontReport(good()),true);
 const wrong=good();wrong.phases[1].nodes[0].style.fontFamily='Private font';assert.throws(()=>validateUiFontReport(wrong),/inheritance/);
 const leaked=good();leaked.phases[0].hostWith.host.fontFamily='Private font';assert.throws(()=>validateUiFontReport(leaked),/host/);
 const unchanged=good();unchanged.phases[1].bodyFamily='Host A';assert.throws(()=>validateUiFontReport(unchanged),/host change/);
});

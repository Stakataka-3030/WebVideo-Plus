import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const steps=JSON.parse(fs.readFileSync(new URL('./fixtures/figure-diff/scene.json',import.meta.url),'utf8'));
const script=fs.readFileSync(new URL('./figure-diff-native.ps1',import.meta.url),'utf8');
test('native figure fixture has genuine settled dialogue cut candidates',()=>{
 assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
 const cuts=steps.map((step,i)=>({step,i})).filter(({step})=>step.id.endsWith('-cut'));
 assert.equal(cuts.length,8);
 for(const {step,i}of cuts){assert.match(step.source,/^Narrator:Safe boundary .+ -next;$/);assert.equal(steps[i-1].source,'wait:500;');assert.equal(steps[i+1].source,'wait:1000;');}
 assert.equal(steps.filter(s=>s.source.startsWith('wait:')).reduce((sum,s)=>sum+Number(s.source.match(/\d+/)[0]),0),12000);
});
test('native sampling follows named anchors and still requires real two-worker seams',()=>{
 for(const anchor of ['first-diff','same-image','current','default','second-diff','remove','reenter','end']){assert.ok(steps.some(s=>s.id===anchor));assert.ok(script.includes("Line-Time '"+anchor+"'"));}
 assert.doesNotMatch(script,/Line-Time\s+\d/);
 assert.match(script,/result\.effectiveWorkers -ne \$workers/);
 assert.match(script,/@\(-2,-1,0,1,2\)/);
 assert.match(script,/Compare-Png \$paths\[0\] \$paths\[1\]/);
});

test('dialogue remains visible and bounded color measurement cannot bypass full-frame seam checks',()=>{
 assert.equal(steps.find(s=>s.id==='show-textbox').source,'setTextbox:show -next;');
 assert.ok(!steps.some(s=>/setTextbox:hide/.test(s.source)));
 assert.match(script,/Clear\(\[Drawing.Color\]::Transparent\)/);
 assert.match(script,/FillRectangle\(\$brush,384,384,256,256\)/);
 assert.match(script,/\$figureRoi = .*width=1280; height=500/);
 assert.match(script,/Figure touches measurement boundary/);
 const compare=script.slice(script.indexOf('function Compare-Png'),script.indexOf('\n$measurements='));
 assert.doesNotMatch(compare,/figureRoi/);
 assert.match(compare,/\$a.Height/);
});

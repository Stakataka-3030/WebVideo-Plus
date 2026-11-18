import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../browser/render.js',import.meta.url),'utf8'),context);
const sample=context.__exportCreateLipSampler;
test('lip sampling closes inactive targets and mixes overlaps in original target order',()=>{
 const clips=[
  {target:'left',atMs:40,endMs:100,values:[.3,.9,.4],peak:1},
  {target:'right',atMs:0,endMs:80,values:[.2,.6,.7,.5],peak:.5},
  {target:'left',atMs:0,endMs:81,values:[0,.1,.8,0,.1],peak:1},
  {target:null,atMs:10,endMs:30,values:[1],peak:1},
  {target:'idle',atMs:10,endMs:10,values:[],peak:1}
 ];
 const next=sample(clips);
 for(const t of [65,80,81,99,100,1000,0,20,40,40,59.99,100]){
  const expected=[...new Set(clips.map(c=>c.target).filter(Boolean))].map(target=>{
   const active=clips.filter(c=>c.target===target&&t>=c.atMs&&t<c.endMs);
   return {target,active:active.length>0,value:Math.max(0,...active.map(c=>Math.min(1,(c.values[Math.floor((t-c.atMs)/20)]||0)/c.peak)))};
  });
  assert.deepEqual(JSON.parse(JSON.stringify(next(t))),expected);
 }
 assert.deepEqual(Array.from(sample([])(80)),[]);
});

test('prefix restoration stops at the last executable statement within its physical line count',()=>{
 const p={sentenceList:[{}, {isLineBreakHolder:true}, {isLineBreakHolder:'true'}, {}, {isLineBreakHolder:false}]};
 assert.deepEqual([0,1,2,3,4,5,10].map(n=>context.__exportPrefixSentenceTarget(p,n)),[0,1,1,1,4,5,5]);
 assert.equal(context.__exportPrefixSentenceTarget({sentenceList:[{isLineBreakHolder:true}]},1),0);
 assert.equal(context.__exportPrefixSentenceTarget({},1),0);
});

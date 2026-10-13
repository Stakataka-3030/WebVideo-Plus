import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const planner=fs.readFileSync(new URL('../src/Planner.cs',import.meta.url),'utf8');
// Execute the exact planning-stage registration expression, including the
// legacy API fallback. Native Windows tests verify the resulting perform window.
const prefix='await browser.Eval("for(const [name,effects] of "+J.Text(J.Get(pre,"extraAnimations")??new object[0])+"';
const start=planner.indexOf(prefix);
assert.ok(start>=0,'Planner must register project animation files before native timing');
const tail=planner.slice(start+prefix.length,planner.indexOf('");',start+prefix.length));
const source='for(const [name,effects] of '+JSON.stringify([['existing',[{duration:999}]],['project',[{duration:500},{duration:700}]],['sparse',{version:2,relative:true,inherit:true,keyframes:[{time:500,alpha:.5},{time:2000,position:{x:20}}]}]])+tail;
assert.ok(planner.indexOf('__createNativeTimeline(',start)>start,'Registration must precede native timing');
for(const bridge of [false,true])test('planning registration preserves raw payload and existing manager names '+(bridge?'bridge':'legacy'),()=>{
 const original={name:'existing',effects:[{duration:10}]},items=[original],calls=[];
 const manager={getAnimations:()=>items,addAnimation(value){calls.push(value);items.push(value);}};
 const probe={core:{animationManager:manager}};
 if(bridge)probe.addAnimation=(name,raw)=>{calls.push({name,raw});items.push({name,animation:raw});};
 vm.runInNewContext(source,{__wgProbe:probe});
 assert.equal(items[0],original);assert.equal(calls.length,2);assert.deepEqual(JSON.parse(JSON.stringify(calls[0][bridge?'raw':'effects'])),[{duration:500},{duration:700}]);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[1][bridge?'raw':'effects'])),{version:2,relative:true,inherit:true,keyframes:[{time:500,alpha:.5},{time:2000,position:{x:20}}]});
 vm.runInNewContext(source,{__wgProbe:probe});assert.equal(calls.length,2,'Repeated registration must keep already compiled manager objects');
});

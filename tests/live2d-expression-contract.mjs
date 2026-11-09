import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';

// Inputs come from EngineAdapter.Prepare on hash-checked official/MyGO bytes.
// Execute the real manager, factory and async helper; SDK parsing and transport
// are controlled collaborators. This does not claim a browser/SDK pixel pass.
const root=path.resolve(process.argv[2]);
const source=fs.readFileSync(path.join(root,'patched.mjs'),'utf8');
const metadata=JSON.parse(fs.readFileSync(path.join(root,'result.json'),'utf8'));
const name=source.match(/([\w$]+) as ExpressionManager,/)[1];
const start=source.indexOf('class '+name+' extends '),end=source.indexOf('}const ',start)+1;
const manager=source.slice(start,end),base=manager.match(/extends ([\w$]+)/)[1];
const factoryStart=source.indexOf('static loadExpression(s,t)'),factoryEnd=source.indexOf('}};let b=',factoryStart)+1;
assert.ok(start>0&&end>start&&factoryStart>0&&factoryEnd>factoryStart);
const factory=source.slice(factoryStart,factoryEnd);
const asyncHelper=source.slice(source.indexOf('I=(s,t,e)=>'),source.indexOf(';const '));
const wrapper=source.slice(source.indexOf(';const __webvideoSetExpression='));
assert.ok(wrapper.startsWith(';const __webvideoSetExpression='));
const barrier=fs.readFileSync(new URL('../browser/barrier.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture({tracked=true}={}){
 const requests=[],warnings=[],created=[],applied=[],events=[];
 const ctx={Promise,Error,console,[base]:EventEmitter,C:{warn:(...args)=>warnings.push(args)},j:{load:options=>{const task=deferred();requests.push({options,...task});return task.promise;}},St:class{},Mt:class{},URL,location:{href:'http://fixture/'},__pwClock:{controller:{_embedder:{setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);return ()=>clearTimeout(id);}},runFor:async()=>{}}},__wgProbe:{core:{gameplay:{pixiStage:{backgroundObjects:[],figureObjects:[]}}}}};
 vm.createContext(ctx);
 vm.runInContext('const '+asyncHelper+';'+manager+';class L{'+factory+'};L.expressionTasksMap=new WeakMap;L.motionTasksMap=new WeakMap;const b=L;'+name+'.prototype._loadExpression=function(s){return b.loadExpression(this,s)};globalThis.Manager='+name+';globalThis.Factory=L;'+wrapper,ctx);
 if(tracked)vm.runInContext(barrier+';installStageAssetBarrier();',ctx);
 const m=new ctx.Manager({name:'fixture-model'});
 m.definitions=['a','b','c'].map(name=>({name}));m.getExpressionIndex=name=>m.definitions.findIndex(item=>item.name===name);m.getExpressionFile=definition=>definition.name+'.json';
 m.createExpression=(json,definition)=>{const value={json,name:definition?.name||'default'};created.push(value);return value;};
 m._setExpression=value=>applied.push(value);m.currentExpression={name:'default'};
 m.on('expressionLoaded',(...args)=>events.push(['loaded',...args]));m.on('expressionLoadError',(...args)=>events.push(['error',...args]));
 return {ctx,m,requests,warnings,created,applied,events};
}
let checks=0;
async function check(name,run){await run();checks++;console.log('PASS '+name);}
await check('active successful load, set, cache reuse and native events',async()=>{
 const f=fixture();const result=f.m.setExpression('b');assert.equal(f.ctx.__exportHasPendingExpressions(),true);assert.equal(f.requests.length,1);
 f.requests[0].resolve({Parameters:[]});assert.equal(await result,true);assert.equal(f.applied.length,1);assert.equal(f.events[0][0],'loaded');assert.equal(f.m.currentExpression.name,'b');assert.equal(f.ctx.__exportHasPendingExpressions(),false);
 assert.equal(await f.m.setExpression('b'),false);assert.equal(await f.m.loadExpression(1),f.m.currentExpression);assert.equal(f.requests.length,1);
});
for(const outcome of ['resolve','reject'])await check('pending -> destroy -> '+outcome+' is cancellation, not a write or event',async()=>{
 const f=fixture();const result=f.m.setExpression(1);f.m.destroy();assert.equal(f.ctx.__exportHasPendingExpressions(),false);await f.ctx.__exportWaitForExpressions();
 f.requests[0][outcome](outcome==='resolve'?{Parameters:[]}:Error('XHR aborted'));
 assert.equal(await result,false);assert.equal(f.m.expressions,undefined);assert.equal(f.created.length,0);assert.equal(f.applied.length,0);assert.equal(f.events.length,0);assert.equal(f.warnings.length,0);
 assert.equal(await f.m.loadExpression(1),undefined);assert.equal(await f.m.setExpression('b'),false);assert.equal(await f.m.setRandomExpression(),false);assert.equal(await f.ctx.Factory.loadExpression(f.m,1),undefined);assert.equal(f.requests.length,1);
});
await check('direct loader rejection is visible alive, canceled only after destroy',async()=>{
 for(const destroy of [false,true]){const f=fixture(),d=deferred(),error=Error('real loader failure');f.m._loadExpression=()=>d.promise;const promise=f.m.setExpression('a');if(destroy)f.m.destroy();d.reject(error);if(destroy)assert.equal(await promise,false);else {await assert.rejects(promise,e=>e===error);await assert.rejects(f.ctx.__exportWaitForExpressions(),/real loader failure/);}}
});
await check('factory failures keep native error event and fail the export barrier',async()=>{
 for(const parsing of [false,true]){const f=fixture();if(parsing)f.m.createExpression=()=>{throw Error('invalid JSON/SDK input');};const p=f.m.setExpression('a');parsing?f.requests[0].resolve({}):f.requests[0].reject(Error('missing expression file'));assert.equal(await p,false);assert.equal(f.events.filter(x=>x[0]==='error').length,1);assert.equal(f.events.filter(x=>x[0]==='loaded').length,0);assert.equal(f.warnings.length,1);await assert.rejects(f.ctx.__exportWaitForStageAssets(),/Live2D 表情加载失败/);}
});
await check('shared pending cache has one transport and newest A -> B -> A wins',async()=>{
 const f=fixture(),a1=f.m.setExpression('a'),b=f.m.setExpression('b'),a2=f.m.setExpression('a');assert.equal(f.requests.length,2);
 f.requests[1].resolve({});assert.equal(await b,false);assert.equal(f.applied.length,0);f.requests[0].resolve({});assert.equal(await a1,false);assert.equal(await a2,true);assert.deepEqual(f.applied.map(x=>x.name),['a']);assert.equal(f.ctx.__exportHasPendingExpressions(),false);
});
await check('returning to current expression cancels pending switch',async()=>{
 const f=fixture();let p=f.m.setExpression('a');f.requests[0].resolve({});await p;
 const b=f.m.setExpression('b');assert.equal(await f.m.setExpression('a'),false);assert.equal(f.ctx.__exportHasPendingExpressions(),false);f.requests[1].resolve({});assert.equal(await b,false);assert.deepEqual(f.applied.map(x=>x.name),['a']);
});
await check('superseded failure preserves native reporting without poisoning newer success',async()=>{
 for(const direct of [false,true]){const f=fixture(),old=deferred(),fresh=deferred();if(direct)f.m._loadExpression=index=>index===0?old.promise:fresh.promise;
  const a=f.m.setExpression('a'),aRejected=direct?assert.rejects(a,/stale failure/):null,b=f.m.setExpression('b');
  (direct?old:f.requests[0]).reject(Error('stale failure'));if(direct)await aRejected;else {assert.equal(await a,false);assert.equal(f.events[0][0],'error');}
  assert.equal(f.ctx.__exportHasPendingExpressions(),true);(direct?fresh:f.requests[1]).resolve({});assert.equal(await b,true);await f.ctx.__exportWaitForStageAssets();assert.equal(f.ctx.__exportHasPendingExpressions(),false);
 }
});
await check('invalid index no-op does not untrack a valid outstanding request',async()=>{
 const f=fixture(),p=f.m.setExpression('a');assert.equal(await f.m.setExpression('missing'),false);assert.equal(f.ctx.__exportHasPendingExpressions(),true);f.requests[0].resolve({});assert.equal(await p,true);assert.equal(f.ctx.__exportHasPendingExpressions(),false);
});
await check('cached transport response after destroy never parses or reports success',async()=>{
 const f=fixture(),cache=deferred();let cacheHits=0;f.ctx.j.load=()=>{cacheHits++;return cache.promise;};const p=f.m.setExpression('c');assert.equal(cacheHits,1);f.m.destroy();cache.resolve({cached:true});assert.equal(await p,false);assert.equal(f.created.length,0);assert.equal(f.events.length,0);
});
await check('destroy from SDK creation or loaded listener is safe after await',async()=>{
 for(const duringCreate of [true,false]){const f=fixture();if(duringCreate)f.m.createExpression=()=>{f.m.destroy();return {};};else f.m.on('expressionLoaded',()=>f.m.destroy());const p=f.m.setExpression('a');f.requests[0].resolve({});assert.equal(await p,false);assert.equal(f.applied.length,0);assert.equal(f.m.expressions,undefined);if(duringCreate)assert.equal(f.events.length,0);}
});
await check('background loads are not export blockers and retain native error reporting',async()=>{
 const f=fixture();const optional=f.ctx.Factory.loadExpression(f.m,2);assert.equal(f.ctx.__exportHasPendingExpressions(),false);await f.ctx.__exportWaitForStageAssets();f.requests[0].reject(Error('optional failure'));await optional;assert.equal(f.events[0][0],'error');assert.equal(f.ctx.__exportHasPendingExpressions(),false);
});
await check('lifecycle protection also works without the export tracker',async()=>{
 const f=fixture({tracked:false}),p=f.m.setExpression(2);f.m.destroy();f.requests[0].resolve({});assert.equal(await p,false);assert.equal(f.events.length,0);
});
console.log(`PASS ${metadata.engine.id} ${metadata.engine.version}: ${checks} real-plugin lifecycle/cache/error contracts (${metadata.sourceHash}).`);

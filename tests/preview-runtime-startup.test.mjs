import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function preview(){
 let lang=2,stored='2',picker=false,url='http://terre/games/demo/index.html',docId={};
 const store={getState:()=>({userData:{optionData:{language:lang,textSpeed:50,autoSpeed:50}}})};
 const frame={contentWindow:{get location(){return {href:url};},localStorage:{getItem:()=>stored}},get contentDocument(){return {getElementById:()=>Object.assign(docId,{__reactContainer$a:{memoizedProps:{store}}}),querySelector:()=>picker?{}:null};}};
 const ctx={URL,setTimeout,window:{location:{origin:'http://terre'}},document:{getElementById:()=>frame}};ctx.window.window=ctx.window;
 const source=read('browser/editor-runtime.js');vm.runInNewContext(source.slice(0,source.indexOf('const WebVideoSingleLineHint=')),ctx);ctx.window.WebVideoRuntime.setContext({game:'demo'});
 return {runtime:ctx.window.WebVideoRuntime,set(values){({lang=lang,stored=stored,picker=picker,url=url,docId=docId}=values);}};
}
test('preview language is captured only from the settled current game',()=>{const f=preview();assert.deepEqual(plain(f.runtime.peekRuntimeStartup('demo')),{language:2,source:'preview'});assert.equal(f.runtime.peekRuntimeStartup('other'),null);});
test('language picker, mismatched storage and invalid defaults are not language evidence',()=>{const f=preview();for(const x of [{picker:true},{picker:false,stored:null},{stored:'1'},{stored:'2',lang:'2'},{lang:2.5},{lang:8},{lang:-1}]){f.set(x);assert.equal(f.runtime.peekRuntimeStartup('demo'),null,JSON.stringify(x));}f.set({lang:0,stored:'0'});assert.equal(f.runtime.peekRuntimeStartup('demo').language,0);});
test('cross-origin and malformed preview URLs cannot contribute language',()=>{const f=preview();for(const url of ['https://external/games/demo/index.html','http://terre/games/demolition/','bad']){f.set({url});assert.equal(f.runtime.peekRuntimeStartup('demo'),null);}});
function timingFixture(){
 let locale={language:2,source:'preview'},beforeResult=()=>{},jobs=0;const requests=[];
 const P={sha:async()=> 'hash',service:async(path,body)=>{if(path==='/api/config')return {settings:{fps:30}};if(path==='/api/timing'){requests.push(plain(body));return {id:String(++jobs)};}if(path.startsWith('/api/timing/')){await beforeResult();return {job:{state:'completed'},sourceHash:'hash',timing:{durationSeconds:3,storyTimeline:{dependencyHash:'dep'}}};}throw Error(path);}};
 const ctx={WebVideoProject:P,WebVideoRuntime:{peekRuntimeStartup:()=>locale},window:{},setTimeout(){return 1;},AbortController,Date,Promise};vm.runInNewContext(read('browser/timing-tasks.js'),ctx);
 return {run:ctx.window.WebVideoTimingTasks.run,requests,setLocale:x=>locale=x,beforeResult:fn=>beforeResult=fn};
}
const model={path:'games/demo/game/scene/start.txt',source:'hello;'};
test('timing job carries and returns the captured language',async()=>{const f=timingFixture(),r=await f.run(model,{textSpeed:50,autoSpeed:50});assert.deepEqual(f.requests[0].runtimeStartup,{language:2,source:'preview'});assert.deepEqual(plain(r.runtimeStartup),f.requests[0].runtimeStartup);});
test('missing preview evidence is passed as null for project-default resolution',async()=>{const f=timingFixture();f.setLocale(null);const r=await f.run(model,{});assert.equal(f.requests[0].runtimeStartup,null);assert.equal(r.runtimeStartup,null);});
test('a language change during timing rejects the stale result',async()=>{const f=timingFixture();f.beforeResult(()=>f.setLocale({language:0,source:'preview'}));await assert.rejects(f.run(model,{}),/预览语言已改变/);});
test('same-source timing consumers share only the same startup language',async()=>{const f=timingFixture();let release;f.beforeResult(()=>new Promise(r=>{release=r;}));const a=f.run(model,{});await new Promise(r=>setImmediate(r));const b=f.run(model,{});await new Promise(r=>setImmediate(r));assert.equal(f.requests.length,1);release();await Promise.all([a,b]);});
test('export, persisted timing and native workers preserve the startup contract',()=>{assert.match(read('browser/export-component.js'),/runtimeStartup:WebVideoRuntime\.peekRuntimeStartup\?\.\(game\)\?\?null/);for(const name of ['video-workflow','music-timeline']){const s=read('browser/'+name+'.js');assert.match(s,/analysisVersion:4/);assert.match(s,/runtimeStartup:result\.runtimeStartup\?\?null/);}for(const name of ['Planner','Renderer'])assert.match(read('src/'+name+'.cs'),/VerifyRuntimeStartup/);assert.match(read('src/QueueService.cs'),/"runtimeStartup",J\.Get\(d,"runtimeStartup"\)/);assert.match(read('src/JobRunner.cs'),/RuntimeStartup\.ValidateContract\(request,runtimeStartup\)/);});
test('different preview languages never coalesce into one running timing job',async()=>{
 const f=timingFixture(),releases=[];f.beforeResult(()=>new Promise(r=>releases.push(r)));
 const a=f.run(model,{});const rejected=assert.rejects(a,/预览语言已改变/);await new Promise(r=>setImmediate(r));
 f.setLocale({language:0,source:'preview'});const b=f.run(model,{});await new Promise(r=>setImmediate(r));
 assert.equal(f.requests.length,2);for(const release of releases)release();await rejected;assert.equal((await b).runtimeStartup.language,0);
});
test('persisted displayed timing becomes stale when the settled preview language changes',()=>{
 let language=2;const startup=()=>({language,source:'preview'}),ctx={window:{WebVideoProjectCore:{hash:()=> 'fingerprint'},WebVideoValidatedStoryTimings:new Set(['dep'])},WebVideoRuntime:{peekGameSettings:()=>({textSpeed:50,autoSpeed:50}),peekRuntimeStartup:startup},WebVideoProject:{state:()=>({scope:{game:'demo'}})},AbortController};
 const source=read('browser/video-workflow.js');vm.runInNewContext(source.slice(0,source.indexOf('function WebVideoTimeToggle'))+';globalThis.fresh=WebVideoTimelineTiming.fresh;',ctx);
 const cached={analysisVersion:4,runtimeStartup:startup(),settings:{textSpeed:50,autoSpeed:50},timing:{storyTimeline:{dependencyHash:'dep',scenes:[{scene:'start.txt',fingerprint:'fingerprint'}]}}};
 assert.equal(ctx.fresh(model,cached),true);language=0;assert.equal(ctx.fresh(model,cached),false);language=2;cached.analysisVersion=3;assert.equal(ctx.fresh(model,cached),false);
});

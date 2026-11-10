import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('queued and retried timing jobs persist their canonical source hash',()=>{
 const source=read('src/QueueService.cs');
 assert.match(source,/"sourceHash",Files\.HashText\(sourceText\)/);
 assert.match(source,/req\["sourceHash"\]=Files\.HashText\(retrySource\)/);
 assert.match(source,/"sourceHash",TimingSourceHash\(timingRequest\)/);
});
test('offline browser mute preserves the target runtime startup contract',()=>{
 const source=read('src/BrowserHost.cs'),method=source.slice(source.indexOf('public async Task InstallClock('),source.indexOf('public async Task Navigate('));
 assert.match(method,/object runtimeStartup=null/);assert.match(method,/View\.CoreWebView2\.IsMuted=true/);assert.match(method,/RuntimeStartup\.Script\(runtimeStartup\)/);
 assert.ok(method.indexOf('IsMuted=true')<method.indexOf('AddScriptToExecuteOnDocumentCreatedAsync'));
 assert.match(read('browser/id-tools.js'),/\[overwrite,setOverwrite\]=R\.useState\(false\)/);
});
test('shared figure label resolves library names while retaining the original reference',async()=>{
 let state,effect,requests=0;const id='a'.repeat(32),raw='http://127.0.0.1:1234/webvideo-shared/'+('b'.repeat(32))+'/'+id+'/figure/hero.png',ctx={URL,reactExports:{createElement:(type,props,...children)=>({type,props,children}),useState:v=>[state??v,x=>state=x],useEffect:fn=>effect=fn},WebVideoSharedMaterials:{request:async()=>{requests++;return {libraries:[{id,name:'角色素材'}]};}}};
 vm.createContext(ctx);vm.runInContext(read('browser/resource-labels.js'),ctx);let node=ctx.WebVideoFigureAddress({value:raw});assert.ok(node.children[0].includes('共享'));const cleanup=effect();await new Promise(r=>setImmediate(r));node=ctx.WebVideoFigureAddress({value:raw});assert.equal(node.children[0],'角色素材/figure/hero.png');assert.ok(node.props.title.endsWith(raw));effect();assert.equal(requests,1);cleanup();
});
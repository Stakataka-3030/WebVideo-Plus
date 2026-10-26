import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../browser/export-component.js',import.meta.url),'utf8');
const openingMessage=source.indexOf("setMessage('正在读取现有设置…')");
const begin=source.lastIndexOf('R.useEffect(',openingMessage),end=source.indexOf('},[opened,game,exportKind]);',begin);
assert.ok(begin>=0&&end>begin);
const effect=source.slice(begin,end+'},[opened,game,exportKind]);'.length);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(){
 const timers=new Map(),writes=[],requests=new Set();let id=0,cleanup,ready=false,attempts=0,pending=null,jobRequest=null,configRequest=null,notice=null,speedRequest=null;const calls=[];
 const record=name=>value=>writes.push({name,value});
 const box={AbortController,console,opened:true,game:'fixture',exportKind:'full',readOnOpen:{current:true},target:{name:'start.txt'},requestControllers:{current:requests},outputExtension:kind=>kind==='audio'?'.wav':'.mp4',connectionFailure:error=>error,
  setTimeout(fn,ms){const token=++id;timers.set(token,{fn,ms});return token;},clearTimeout(token){timers.delete(token);},R:{useEffect(fn){cleanup=fn();}},
  WebVideoServiceErrors:{async readDiscovery(fetch){attempts++;return fetch('/discovery',{});}},
  async webVideoExportRequest(url,options,timeout,controllers=requests){const controller=new AbortController();controllers.add(controller);try{if(pending){const current=pending;pending=null;return await new Promise((resolve,reject)=>{controller.signal.addEventListener('abort',()=>reject(Object.assign(Error('canceled'),{name:'AbortError'})));current.promise.then(resolve,reject);});}if(!ready)throw Error('fixture offline');return {baseUrl:'http://127.0.0.1:1234',token:'fixture'};}finally{controllers.delete(controller);}},
  async call(endpoint){calls.push(endpoint);if(endpoint==='/api/config'&&configRequest){const current=configRequest;configRequest=null;return await current.promise;}if(endpoint==='/api/jobs'&&jobRequest){const current=jobRequest;jobRequest=null;return await current.promise;}if(!ready)throw Error('fixture offline');return endpoint==='/api/jobs'?[]:{settings:{workers:1},gpuOptions:[],outputDir:'out'};},
  applyJobs:record('jobs'),async readSpeed(value,current=()=>true){if(!current())return;box.setSpeedLoading(true);try{if(speedRequest){const wait=speedRequest;speedRequest=null;await wait.promise;}if(current())record('speed')(value);}finally{if(current())box.setSpeedLoading(false);}},showError(error,jobId,origin){notice={error,jobId,origin};record('error')(error.message);},setNotice(value){notice=typeof value==='function'?value(notice):value;},
 };
 for(const name of ['Connection','Settings','OutputDir','WorkDir','RecommendedCodec','GpuOptions','GpuAdapters','EngineOptions','FileName','Message','SpeedLoading','SpeedError'])box['set'+name]=record(name);
 vm.createContext(box);
 return {writes,timers,requests,calls,config(value){configRequest=value;},get notice(){return notice;},get attempts(){return attempts;},set ready(value){ready=value;},pending(value){pending=value;},jobs(value){jobRequest=value;},start(){box.opened=true;box.readOnOpen.current=true;vm.runInContext(effect,box);},rerender(values={}){cleanup?.();Object.assign(box,values);vm.runInContext(effect,box);},hideForPicker(){box.readOnOpen.current=false;this.rerender({opened:false});},resumePicker(){this.rerender({opened:true});},speed(value){speedRequest=value;},get speedLoading(){return writes.filter(x=>x.name==='SpeedLoading').at(-1)?.value;},close(){cleanup?.();box.opened=false;},async flush(){for(let n=0;n<5;n++)await tick();},async advance(){await this.flush();const next=timers.entries().next().value;if(next){timers.delete(next[0]);next[1].fn();}await this.flush();}};
}
test('initial discovery recovers after more than fifteen failed attempts',async()=>{
 const h=harness();h.start();await h.flush();for(let i=0;i<15;i++)await h.advance();assert.ok(h.attempts>=16,'initial loop stopped at fifteen attempts');
 assert.equal(h.writes.filter(x=>x.name==='error').length,1,'same unavailable state must not open repeated errors');h.ready=true;await h.advance();
 assert.equal(h.writes.filter(x=>x.name==='Connection').length,1);assert.equal(h.writes.filter(x=>x.name==='jobs').length,1);assert.equal(h.timers.size,0);assert.equal(h.notice,null);h.close();
});
test('close cancels pending discovery and retry timers; repeated opens have one loop',async()=>{
 const h=harness(),pending=deferred();h.pending(pending);h.start();await h.flush();h.close();await h.flush();assert.equal(h.requests.size,0);assert.equal(h.timers.size,0);
 pending.resolve({baseUrl:'http://127.0.0.1:1234',token:'fixture'});await h.flush();assert.equal(h.writes.filter(x=>x.name==='Connection').length,0);
 h.start();await h.flush();assert.equal(h.timers.size,1);h.close();await h.flush();assert.equal(h.timers.size,0);
 h.ready=true;h.start();await h.flush();assert.equal(h.writes.filter(x=>x.name==='Connection').length,1);assert.equal(h.timers.size,0);h.close();
});
test('close during jobs initialization prevents old completion overwriting a reopened dialog',async()=>{
 const h=harness(),jobs=deferred();h.ready=true;h.jobs(jobs);h.start();await h.flush();h.close();const oldWrites=h.writes.length;
 jobs.resolve([{id:'old'}]);await h.flush();assert.equal(h.writes.length,oldWrites,'closed initialization wrote stale state');
 h.start();await h.flush();assert.equal(h.writes.filter(x=>x.name==='jobs').length,1);h.close();assert.equal(h.timers.size,0);
});

test('close during config initialization starts no subsequent jobs request',async()=>{const h=harness(),config=deferred();h.ready=true;h.config(config);h.start();await h.flush();h.close();const writes=h.writes.length;config.resolve({settings:{workers:1},gpuOptions:[],outputDir:'out'});await h.flush();assert.deepEqual(h.calls,['/api/config']);assert.equal(h.writes.length,writes);assert.equal(h.timers.size,0);});


test('game dependency change during config read restarts unfinished initialization',async()=>{
 const h=harness(),old=deferred();h.ready=true;h.config(old);h.start();await h.flush();h.rerender({game:'other-game'});await h.flush();
 assert.equal(h.calls.filter(x=>x==='/api/config').length,2);assert.equal(h.writes.filter(x=>x.name==='Connection').length,1);assert.equal(h.speedLoading,false);
 const before=h.writes.length;old.resolve({settings:{workers:99},gpuOptions:[],outputDir:'stale'});await h.flush();assert.equal(h.writes.length,before);assert.equal(h.timers.size,0);h.close();
});
test('export kind change during jobs read cannot leave the opening message stuck',async()=>{
 const h=harness(),old=deferred();h.ready=true;h.jobs(old);h.start();await h.flush();h.rerender({exportKind:'audio'});await h.flush();
 assert.equal(h.writes.filter(x=>x.name==='Connection').length,1);assert.equal(h.writes.filter(x=>x.name==='FileName').at(-1).value,'start.wav');assert.equal(h.writes.filter(x=>x.name==='Message').at(-1).value,'');
 const before=h.writes.length;old.resolve([{id:'stale'}]);await h.flush();assert.equal(h.writes.length,before);h.close();
});
test('picker return during unfinished initialization still obtains settings',async()=>{
 const h=harness(),old=deferred();h.ready=true;h.jobs(old);h.start();await h.flush();h.hideForPicker();h.resumePicker();await h.flush();
 assert.equal(h.writes.filter(x=>x.name==='Connection').length,1);assert.equal(h.speedLoading,false);const before=h.writes.length;old.resolve([]);await h.flush();assert.equal(h.writes.length,before);h.close();
});
test('picker return after completed initialization preserves edits and skips reloading defaults',async()=>{
 const h=harness();h.ready=true;h.start();await h.flush();const calls=h.calls.length,settings=h.writes.filter(x=>x.name==='Settings').length;
 h.hideForPicker();h.resumePicker();await h.flush();assert.equal(h.calls.length,calls);assert.equal(h.writes.filter(x=>x.name==='Settings').length,settings);assert.equal(h.speedLoading,false);h.close();
});
test('dependency cleanup after settings commit clears loading from an obsolete preview read',async()=>{
 const h=harness(),old=deferred();h.ready=true;h.speed(old);h.start();await h.flush();assert.equal(h.speedLoading,true);const requests=h.calls.length;
 h.rerender({game:'other-game'});await h.flush();assert.equal(h.speedLoading,false);assert.equal(h.calls.length,requests);const before=h.writes.length;old.resolve();await h.flush();assert.equal(h.writes.length,before);h.close();
});
test('config timeout keeps the existing sequential retry and recovers when available',async()=>{
 const h=harness(),request=deferred();h.ready=true;h.config(request);h.start();await h.flush();request.reject(Error('fixture config timeout'));await h.flush();assert.equal(h.timers.size,1);assert.equal(h.writes.filter(x=>x.name==='Connection').length,0);
 await h.advance();assert.equal(h.writes.filter(x=>x.name==='Connection').length,1);assert.equal(h.speedLoading,false);assert.equal(h.timers.size,0);h.close();
});


test('settings request deadline covers a stalled body and releases its controller',async()=>{
 const begin=source.indexOf('async function webVideoExportRequest('),end=source.indexOf('\nfunction webVideoGpuAdapterOptions',begin);assert.ok(begin>=0&&end>begin);
 const timers=new Map(),body=deferred(),controllers=new Set();let id=0;const box={AbortController,Promise,Error,JSON,WebVideoServiceErrors:{create:(code,message)=>Object.assign(Error(message),{code})},setTimeout(fn,ms){const token=++id;timers.set(token,{fn,ms});return token;},clearTimeout(token){timers.delete(token);},fetch:async()=>({ok:true,status:200,text:()=>body.promise})};vm.createContext(box);vm.runInContext(source.slice(begin,end)+';globalThis.request=webVideoExportRequest;',box);
 const first=box.request('/api/config',{},15000,controllers),rejection=assert.rejects(first,/超时/);await tick();assert.equal(controllers.size,1);assert.equal(timers.size,1);timers.values().next().value.fn();await rejection;assert.equal(controllers.size,0);assert.equal(timers.size,0);
 body.resolve('{"stale":true}');await tick();box.fetch=async()=>({ok:true,status:200,text:async()=>'{"workers":4}'});const response=await box.request('/api/config',{},15000,controllers);assert.equal((await response.json()).workers,4);assert.equal(controllers.size,0);assert.equal(timers.size,0);
});

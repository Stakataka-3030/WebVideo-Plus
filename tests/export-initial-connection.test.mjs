import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../browser/export-component.js',import.meta.url),'utf8');
const begin=source.indexOf('R.useEffect(()=>{if(!opened||!readOnOpen.current)return;'),end=source.indexOf('},[opened,game,exportKind]);',begin);
assert.ok(begin>=0&&end>begin);
const effect=source.slice(begin,end+'},[opened,game,exportKind]);'.length);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(){
 const timers=new Map(),writes=[],requests=new Set();let id=0,cleanup,ready=false,attempts=0,pending=null,jobRequest=null,configRequest=null,notice=null;const calls=[];
 const record=name=>value=>writes.push({name,value});
 const box={AbortController,console,opened:true,game:'fixture',exportKind:'full',readOnOpen:{current:true},target:{name:'start.txt'},requestControllers:{current:requests},outputExtension:()=>'.mp4',connectionFailure:error=>error,
  setTimeout(fn,ms){const token=++id;timers.set(token,{fn,ms});return token;},clearTimeout(token){timers.delete(token);},R:{useEffect(fn){cleanup=fn();}},
  WebVideoServiceErrors:{async readDiscovery(fetch){attempts++;return fetch('/discovery',{});}},
  async webVideoExportRequest(url,options,timeout,controllers=requests){const controller=new AbortController();controllers.add(controller);try{if(pending){const current=pending;pending=null;return await new Promise((resolve,reject)=>{controller.signal.addEventListener('abort',()=>reject(Object.assign(Error('canceled'),{name:'AbortError'})));current.promise.then(resolve,reject);});}if(!ready)throw Error('fixture offline');return {baseUrl:'http://127.0.0.1:1234',token:'fixture'};}finally{controllers.delete(controller);}},
  async call(endpoint){calls.push(endpoint);if(endpoint==='/api/config'&&configRequest){const current=configRequest;configRequest=null;return await current.promise;}if(endpoint==='/api/jobs'&&jobRequest){const current=jobRequest;jobRequest=null;return await current.promise;}if(!ready)throw Error('fixture offline');return endpoint==='/api/jobs'?[]:{settings:{workers:1},gpuOptions:[],outputDir:'out'};},
  applyJobs:record('jobs'),async readSpeed(value,current=()=>true){if(current())record('speed')(value);},showError(error,jobId,origin){notice={error,jobId,origin};record('error')(error.message);},setNotice(value){notice=typeof value==='function'?value(notice):value;},
 };
 for(const name of ['Connection','Settings','OutputDir','WorkDir','RecommendedCodec','GpuOptions','GpuAdapters','EngineOptions','FileName','Message','SpeedLoading','SpeedError'])box['set'+name]=record(name);
 vm.createContext(box);
 return {writes,timers,requests,calls,config(value){configRequest=value;},get notice(){return notice;},get attempts(){return attempts;},set ready(value){ready=value;},pending(value){pending=value;},jobs(value){jobRequest=value;},start(){box.readOnOpen.current=true;vm.runInContext(effect,box);},close(){cleanup?.();},async flush(){for(let n=0;n<5;n++)await tick();},async advance(){await this.flush();const next=timers.entries().next().value;if(next){timers.delete(next[0]);next[1].fn();}await this.flush();}};
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

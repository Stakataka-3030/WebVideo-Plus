import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../browser/'+p,import.meta.url),'utf8');
const source=read('export-component.js'),sub=read('subtitle-export-component.js');
const from=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i);return s.slice(i,j+b.length);};
const at=source.indexOf("setMessage('正在读取现有设置…')"),begin=source.lastIndexOf('R.useEffect(',at);
const effect=source.slice(begin,source.indexOf('},[opened,game,exportKind]);',begin)+'},[opened,game,exportKind]);'.length);
const speed=from(source,'async function readSpeed','finally{if(active())setSpeedLoading(false);}}');
const subAt=sub.indexOf('if(!open||picking.current)return;'),subBegin=sub.lastIndexOf('R.useEffect(',subAt),subEffect=sub.slice(subBegin,sub.indexOf('},[open,game]);',subBegin)+'},[open,game]);'.length);
const subStart=from(sub,'async function start(){','const button=').replace(/const button=$/,'');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
function fixture(visible=false){
 let opens=0,cleanup,speedValue={textSpeed:17,autoSpeed:29},submitted;
 const box={console,Set,WeakMap,URL,AbortController,setTimeout,opened:true,open:true,game:'demo',exportKind:'full',readOnOpen:{current:true},syncRef:{current:true},target:{name:'start.txt'},connection:{current:null},generation:{current:0},picking:{current:false},requests:{current:new Set()},settings:{current:null},inFlight:{current:false},ready:true,scene:'start.txt',base:'games/demo/game/scene/',selection:null,scope:'full',includeSpeaker:false,directory:'out',name:'sub.srt',submission:{current:null},crypto:{randomUUID:()=> 'test-id'},window:{location:{origin:'http://terre'},WebVideoPlus:{state:()=>({model:null})}},document:{getElementById(){if(!visible)return null;return frame;}},R:{useEffect(fn){cleanup=fn();}},outputExtension:()=>'.mp4',WebVideoServiceErrors:{readDiscovery:async()=>({})},webVideoExportRequest:async()=>({}),async call(ep,request){if(request){submitted=request;return {id:'job'};}return ep==='/api/jobs'?[]:{settings:{textSpeed:90,autoSpeed:90},gpuOptions:[],outputDir:'out'};},applyJobs(){},fail(e){box.error=e},showError(e){box.error=e}};
 const root={__reactContainer$test:{memoizedProps:{store:{getState:()=>({userData:{optionData:speedValue}})}}}};
 const frame={contentWindow:{location:{href:'http://terre/games/demo/'}},contentDocument:{getElementById:()=>root}};
 for(const key of [...(effect+speed+subEffect+subStart).matchAll(/\b(set[A-Z]\w*)\(/g)].map(x=>x[1]))box[key]=v=>{box[key+'Value']=v;};
 vm.createContext(box);vm.runInContext(from(read('editor-runtime.js'),'const WebVideoRuntime=(()=>{','window.WebVideoRuntime=WebVideoRuntime;'),box);box.WebVideoRuntime=box.window.WebVideoRuntime;box.WebVideoRuntime.setContext({game:'demo',showPreview(){opens++;visible=true;}});
 return {box,get opens(){return opens;},get submitted(){return submitted;},close(){cleanup?.();},setSpeed(s){speedValue=s;},hide(){visible=false;}};
}
for(const kind of ['full','stage','dialog','audio'])for(const visible of [false,true])test(`${kind}: passive open preserves ${visible?'visible':'closed'} preview`,async()=>{
 const f=fixture(visible);f.box.exportKind=kind;vm.runInContext(speed+'\n'+effect,f.box);await flush();assert.equal(f.opens,0);assert.equal(f.box.error,undefined);f.close();
});
test('subtitle open stays closed, submission reads current settings rather than initial config',async()=>{
 const f=fixture();vm.runInContext(subEffect,f.box);await flush();assert.equal(f.opens,0);assert.equal(f.box.setReadyValue,true);f.setSpeed({textSpeed:31,autoSpeed:47});vm.runInContext(subStart+';globalThis.startExport=start;',f.box);await f.box.startExport();assert.equal(f.opens,1);assert.equal(f.submitted.settings.textSpeed,31);assert.equal(f.submitted.settings.autoSpeed,47);
});
test('subtitle close during awaited preview read does not enqueue',async()=>{
 const f=fixture();vm.runInContext(subEffect,f.box);await flush();let resolve;f.box.WebVideoRuntime.readGameSettings=()=>new Promise(r=>resolve=r);vm.runInContext(subStart+';globalThis.startExport=start;',f.box);const pending=f.box.startExport();f.close();resolve({textSpeed:1,autoSpeed:2});await pending;assert.equal(f.submitted,undefined);
});
test('explicit video reread still opens preview and returns its real values',async()=>{
 const f=fixture();vm.runInContext(speed+';globalThis.reread=readSpeed;',f.box);const actual=await f.box.reread();assert.equal(f.opens,1);assert.equal(actual.textSpeed,17);assert.match(source,/syncGameSpeed\?await WebVideoRuntime\.readGameSettings\(game\)/);
});
test('passive repeated opens never open preview or mutate playback settings',async()=>{
 const f=fixture();for(let i=0;i<3;i++){f.box.readOnOpen.current=true;vm.runInContext(speed+'\n'+effect,f.box);await flush();f.close();}assert.equal(f.opens,0);
});

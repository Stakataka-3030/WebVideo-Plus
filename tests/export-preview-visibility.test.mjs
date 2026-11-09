import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../browser/'+p,import.meta.url),'utf8');
const source=read('export-component.js'),sub=read('subtitle-export-component.js');
const from=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i);return s.slice(i,j+b.length);};
const at=source.indexOf("setMessage('正在读取现有设置…')"),begin=source.lastIndexOf('R.useEffect(',at);
const effect=source.slice(begin,source.indexOf('},[opened,game,exportKind]);',begin)+'},[opened,game,exportKind]);'.length);
const lifecycle=from(source,'R.useEffect(()=>()=>{speedGeneration.current++;}', '[opened,game,exportKind]);');
const speed=from(source,'async function readSpeed','finally{if(active())setSpeedLoading(false);}}');
const subAt=sub.indexOf('if(!open||picking.current)return;'),subBegin=sub.lastIndexOf('R.useEffect(',subAt),subEffect=sub.slice(subBegin,sub.indexOf('},[open,game]);',subBegin)+'},[open,game]);'.length);
const videoStart=from(source,'async function start(){','async function action(').replace(/async function action\($/,'');
const subStart=from(sub,'async function start(){','const button=').replace(/const button=$/,'');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
function fixture(visible=false){
 let opens=0,cleanup,speedValue={textSpeed:17,autoSpeed:29},submitted;
 const box={console,Set,WeakMap,URL,AbortController,setTimeout,clearTimeout,settingsGame:{current:'demo'},speedGeneration:{current:0},submitting:{current:false},syncGameSpeed:true,audioExport:false,fullExport:true,transparentExport:false,storyScope:'full',rangeSelection:null,manualCutSelection:null,includeBackground:true,includeFigures:true,transparentFormat:'mov',useMusicTimeline:false,replaceGameBgm:false,subtitleRequest:()=>null,outputDir:'out',fileName:'test.mp4',music:[],enqueueRequest:{current:null},requestControllers:{current:new Set()},opened:true,open:true,game:'demo',exportKind:'full',readOnOpen:{current:true},syncRef:{current:true},target:{name:'start.txt'},connection:{current:null},generation:{current:0},picking:{current:false},requests:{current:new Set()},settings:{current:null},inFlight:{current:false},ready:true,scene:'start.txt',base:'games/demo/game/scene/',selection:null,scope:'full',includeSpeaker:false,directory:'out',name:'sub.srt',submission:{current:null},crypto:{randomUUID:()=> 'test-id'},window:{location:{origin:'http://terre'},WebVideoPlus:{state:()=>({model:null})}},document:{getElementById(){if(!visible)return null;return frame;}},R:{useEffect(fn){cleanup=fn();}},outputExtension:()=>'.mp4',WebVideoServiceErrors:{readDiscovery:async()=>({})},webVideoExportRequest:async()=>({}),async call(ep,request){if(request){submitted=request;return {id:'job'};}return ep==='/api/jobs'?[]:{settings:{textSpeed:90,autoSpeed:90},gpuOptions:[],outputDir:'out'};},applyJobs(){},fail(e){box.error=e},showError(e){box.error=e}};
 const root={__reactContainer$test:{memoizedProps:{store:{getState:()=>({userData:{optionData:speedValue}})}}}};
 const frame={contentWindow:{location:{href:'http://terre/games/demo/'}},contentDocument:{getElementById:()=>root}};
 for(const key of [...(effect+speed+subEffect+subStart+videoStart).matchAll(/\b(set[A-Z]\w*)\(/g)].map(x=>x[1]))box[key]=v=>{box[key+'Value']=typeof v==='function'?v(box[key+'Value']):v;};
 vm.createContext(box);vm.runInContext(from(read('editor-runtime.js'),'const WebVideoRuntime=(()=>{','window.WebVideoRuntime=WebVideoRuntime;'),box);box.WebVideoRuntime=box.window.WebVideoRuntime;box.WebVideoRuntime.setContext({game:'demo',showPreview(){opens++;visible=true;}});
 return {box,get opens(){return opens;},get submitted(){return submitted;},close(){cleanup?.();box.speedGeneration.current++;},setSpeed(s){speedValue=s;},hide(){visible=false;}};
}
for(const kind of ['full','stage','dialog','audio'])for(const visible of [false,true])test(`${kind}: passive open preserves ${visible?'visible':'closed'} preview`,async()=>{
 const f=fixture(visible);f.box.exportKind=kind;vm.runInContext(speed+'\n'+effect,f.box);await flush();assert.equal(f.opens,0);assert.equal(f.box.error,undefined);assert.equal(f.box.setSettingsValue.textSpeed,visible?17:90);assert.equal(f.box.setSettingsValue.autoSpeed,visible?29:90);f.close();
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

for(const kind of ['full','stage','dialog','audio'])test(`${kind}: submission reads fresh real settings, not config defaults`,async()=>{
 const f=fixture();f.box.exportKind=kind;f.box.audioExport=kind==='audio';f.box.fullExport=kind==='full';f.box.settings={workers:1,cubismCoreInitialMemoryMiB:128,textSpeed:90,autoSpeed:90};f.box.setTimeout=fn=>{fn();return 1;};f.setSpeed({textSpeed:32,autoSpeed:46});vm.runInContext(videoStart+';globalThis.startExport=start;',f.box);await f.box.startExport();assert.equal(f.opens,1);assert.equal(f.submitted.settings.textSpeed,32);assert.equal(f.submitted.settings.autoSpeed,46);
});
for(const stage of ['speed','delay'])test(`video close during ${stage} does not enqueue or report stale errors`,async()=>{
 const f=fixture();f.box.settings={workers:1,cubismCoreInitialMemoryMiB:128};let release;
 if(stage==='speed')f.box.WebVideoRuntime.readGameSettings=()=>new Promise(r=>release=r);else f.box.setTimeout=fn=>{release=fn;return 1;};
 vm.runInContext(videoStart+';globalThis.startExport=start;',f.box);const pending=f.box.startExport();await flush();f.close();release({textSpeed:12,autoSpeed:23});await pending;assert.equal(f.submitted,undefined);assert.equal(f.box.error,undefined);
});
test('video preview read failure cannot fall back to configured speed',async()=>{
 const f=fixture();f.box.settings={workers:1,cubismCoreInitialMemoryMiB:128,textSpeed:90};f.box.WebVideoRuntime.readGameSettings=async()=>{throw Error('preview unavailable');};vm.runInContext(videoStart+';globalThis.startExport=start;',f.box);await f.box.startExport();assert.equal(f.submitted,undefined);assert.match(f.box.error.message,/preview unavailable/);
});
test('explicit reread completion after project switch does not overwrite settings',async()=>{
 const f=fixture();let release;f.box.WebVideoRuntime.readGameSettings=()=>new Promise(r=>release=r);vm.runInContext(speed+';globalThis.reread=readSpeed;',f.box);const pending=f.box.reread();f.box.speedGeneration.current++;release({textSpeed:99,autoSpeed:99});await pending;assert.equal(f.box.setSettingsValue,undefined);
});
test('video reopening disclosure is independent of engine notices and manual toggle is passive',()=>{
 assert.match(source,/role:'note',children:'打开此面板只读取已有预览；加入导出队列或重新读取设置会打开预览/);
 assert.match(source,/if\(!e.target.checked\)readSpeed\(undefined,null,\{passive:true\}\)/);
 assert.match(sub,/开始导出字幕会打开预览/);
 assert.ok(source.indexOf("role:'note',children:'打开此面板只读取已有预览")<source.indexOf("children:'高级设置'"),'Preview disclosure must remain outside collapsed advanced settings');
});
test('subtitle read failure cannot enqueue using configured defaults',async()=>{
 const f=fixture();vm.runInContext(subEffect,f.box);await flush();f.box.WebVideoRuntime.readGameSettings=async()=>{throw Error('preview unavailable');};vm.runInContext(subStart+';globalThis.startExport=start;',f.box);await f.box.startExport();assert.equal(f.submitted,undefined);assert.match(f.box.error.message,/preview unavailable/);
});

test('video lifecycle cleanup invalidates awaited reads on close, switch, or unmount',()=>{
 let cleanup;const box={opened:true,game:'demo',exportKind:'full',speedGeneration:{current:0},R:{useEffect(fn){cleanup=fn();}}};vm.runInNewContext(lifecycle,box);assert.equal(box.speedGeneration.current,0);cleanup();assert.equal(box.speedGeneration.current,1);
});
test('subtitle open with an existing preview reads its actual speed without opening it again',async()=>{
 const f=fixture(true);vm.runInContext(subEffect,f.box);await flush();assert.equal(f.opens,0);assert.equal(f.box.settings.current.textSpeed,17);assert.equal(f.box.settings.current.autoSpeed,29);f.close();
});
for(const kind of ['full','stage','dialog','audio'])test(`${kind}: project switch while reading prevents submission`,async()=>{
 const f=fixture();f.box.exportKind=kind;f.box.settings={workers:1,cubismCoreInitialMemoryMiB:128};let release;f.box.WebVideoRuntime.readGameSettings=()=>new Promise(r=>release=r);vm.runInContext(videoStart+';globalThis.startExport=start;',f.box);const pending=f.box.startExport();f.box.game='other';f.box.speedGeneration.current++;release({textSpeed:17,autoSpeed:29});await pending;assert.equal(f.submitted,undefined);
});
for(const type of ['video','subtitle'])test(`${type}: close during selection hash prevents posting`,async()=>{
 const f=fixture();if(type==='subtitle'){vm.runInContext(subEffect,f.box);await flush();}else f.box.settings={workers:1,cubismCoreInitialMemoryMiB:128};
 const selection={source:'A:test;',ranges:[{startLine:1,endLine:1}]};if(type==='video')f.box.rangeSelection=selection;else f.box.selection=selection;f.box.window.WebVideoPlus.validateSelection=()=>true;f.box.setTimeout=fn=>{fn();return 1;};let release;f.box.webVideoExportHash=()=>new Promise(r=>release=r);
 vm.runInContext((type==='video'?videoStart:subStart)+';globalThis.startExport=start;',f.box);const pending=f.box.startExport();await flush();f.close();release('hash');await pending;assert.equal(f.submitted,undefined);
});
test('same-project reopened video ignores an old failed preview read',async()=>{
 const f=fixture();let reject;f.box.WebVideoRuntime.readGameSettings=()=>new Promise((_,r)=>reject=r);vm.runInContext(speed+';globalThis.reread=readSpeed;',f.box);const pending=f.box.reread();f.close();f.box.setSpeedErrorValue='new dialog';reject(Error('old error'));await pending;assert.equal(f.box.setSpeedErrorValue,'new dialog');
});

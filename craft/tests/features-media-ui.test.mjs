import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../ui/media-panel.js',import.meta.url),'utf8');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.textContent='';this.value='';this.disabled=false;this.checked=false;this.hidden=false;}
 append(...items){for(const item of items){item.remove?.();this.children.push(item);item.parent=this;if(this.tag==='select'&&this.children.length===1)this.value=item.value;}}
 setAttribute(k,v){this[k]=v;}
 removeAttribute(k){delete this[k];}
 addEventListener(k,fn){this.events[k]=fn;}
 removeEventListener(k){delete this.events[k];}
 replaceChildren(...items){this.children=[];this.append(...items);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function setup(overrides={}){
 const calls=[], document={createElement:t=>new Element(t),createTextNode:t=>Object.assign(new Element('#text'),{textContent:t})};
 const context={document,crypto:webcrypto,TextEncoder,WebVideoCraftFeatures:{navigation:s=>s.source.split('\n').map((line,index)=>({id:String(index),startLine:index+1,endLine:index+1,title:line}))},setInterval:()=>1,clearInterval:()=>{},confirm:()=>true};if(overrides.musicUI)context.WebVideoCraftMusicUI=overrides.musicUI;vm.createContext(context);vm.runInContext(source,context);
 const snap={projectId:'p',projectPath:'C:/Project',path:'start',sceneRelativePath:'start.txt',source:'A;\nB;',revision:1,engineId:'official',runtimeBindingSignature:'official-4.6.4'};
 const music={players:2,tracks:[{id:'a',name:'A',file:'a.ogg',volume:100,lane:0,startSeconds:0,durationSeconds:8}]};
 let state={loaded:true,music},caps={music:true,projectFiles:true,audioImport:true,previewSettings:true,timing:true,service:true,exportVideo:true,snapshot:true};
 const timing={seconds:12,settings:{textSpeed:70,autoSpeed:60},timing:{storyTimeline:{scenes:[{}]}},snapshot:snap,sourceHash:'hash'};
 const controller={state:()=>state,loadMusic:async()=>music,addTracks:async(...v)=>calls.push(['import',...v]),moveTrack:async()=>{},updateTrack:async()=>{},removeTrack:async()=>{},removePlayer:async()=>{},addPlayer:async()=>{},saveMusic:async()=>{},readSpeeds:async()=>({textSpeed:50,autoSpeed:50}),writeSpeeds:async v=>({...v,persistence:'session'}),measure:async options=>{options.onProgress({progress:.5,message:'measured'});return timing},getTiming:async()=>timing,cancel:async()=>calls.push(['cancel']),fitToMusic:async()=>({...timing,errorSeconds:.2,matched:true}),selectSegments:async ranges=>({...snap,sourceHash:'hash',ranges:ranges.map(r=>({...r,startSeconds:0,durationSeconds:4}))})};
 const bridge={capabilities:()=>caps,snapshot:async()=>({...snap}),service:async(ep)=>{calls.push([ep]);if(ep==='/api/config')return{settings:{}};if(ep==='/api/dialog/subtitle')return{path:'C:/captions.ass',name:'captions.ass'};if(ep==='/api/jobs')return[];return{}},exportVideo:async options=>{calls.push(['export',options]);return{id:'job'+calls.length}},cancelJob:async id=>calls.push(['cancelJob',id])};
 Object.assign(controller,overrides);
 const container=new Element('container'),errors=[],messages=[];
 const mounted=context.WebVideoCraftMediaUI.mount(container,{bridge,controller,run:async fn=>{try{return await fn()}catch(e){errors.push(e.message)}},notify:m=>messages.push(m),getSnapshot:()=>snap,getSelection:()=>[{startLine:1,endLine:1},{startLine:2,endLine:2}]});
 const nodes=()=>{const output=[];const walk=n=>{output.push(n);n.children.forEach(walk)};walk(container);return output};
 const button=text=>nodes().find(n=>n.tag==='button'&&n.textContent===text);
 const click=async text=>{button(text).events.click();for(let i=0;i<20;i++)await Promise.resolve();await new Promise(r=>setTimeout(r,5));};
 const field=label=>nodes().find(n=>n['aria-label']===label);
 const change=async(label,value)=>{const n=field(label);if(n.type==='checkbox')n.checked=value;else n.value=value;n.events.change?.();await Promise.resolve();};
 return{field,change,bridge,container,calls,errors,messages,mounted,button,click,nodes,snap,setCaps:v=>caps=v};
}
async function chooseDisjoint(f){f.snap.source='A;\nB;\nC;';await f.change('故事范围','selection');await f.click('读取当前场景');await f.change('导出第 1 行',true);await f.change('导出第 3 行',true);await f.click('锁定导出片段');}
test('selected disjoint ranges submit separately with source hash and actual API fields',async()=>{
 const f=setup();await chooseDisjoint(f);await f.click('加入导出队列');
 const exports=f.calls.filter(c=>c[0]==='export');assert.equal(exports.length,2);assert.equal(exports[0][1].range.sourceHash.length,64);assert.equal(exports[1][1].range.startLine,3);assert.equal(exports[0][1].fileName,'video-1.mp4');assert.equal(exports[0][1].settings.width,1920);assert.equal(f.errors.length,0);f.mounted.dispose();
});
test('stale selection stops export instead of using changed source',async()=>{
 const f=setup();await chooseDisjoint(f);f.snap.source+='changed';await f.click('加入导出队列');assert.ok(f.errors.some(e=>e.includes('已变化')));assert.equal(f.calls.filter(c=>c[0]==='export').length,0);f.mounted.dispose();
});
test('subtitle native chooser transfers exact chosen source and defaults soft/video anchor',async()=>{
 const f=setup();await f.click('选择 SRT / ASS / SSA…');await f.click('加入导出队列');const options=f.calls.find(c=>c[0]==='export')[1];assert.equal(options.subtitle.sourcePath,'C:/captions.ass');assert.equal(options.subtitle.mode,'soft');assert.equal(options.subtitle.anchor.type,'video');f.mounted.dispose();
});

for(const background of [true,false])for(const figures of [true,false])test(`stage request preserves background=${background} figures=${figures}`,async()=>{
 const f=setup();await f.change('导出内容','stage');await f.change('包含背景',background);await f.change('包含立绘',figures);await f.click('加入导出队列');
 const request=f.calls.find(c=>c[0]==='export')?.[1];assert.ok(request,f.errors.join(';'));assert.equal(request.exportKind,'stage');assert.equal(request.includeBackground,background);assert.equal(request.includeFigures,figures);assert.equal(request.fileName,background?'video.mp4':'video.mov');assert.equal(request.useMusicTimeline,false);assert.equal(request.replaceGameBgm,false);assert.equal(request.subtitle,undefined);assert.equal(request.sourceText,f.snap.source);f.mounted.dispose();
});
for(const kind of ['stage','dialog'])test(kind+' transparent WebM switches extension and passes format',async()=>{
 const f=setup();await f.change('导出内容',kind);if(kind==='stage')await f.change('包含背景',false);await f.change('透明视频格式','webm');await f.click('加入导出队列');const req=f.calls.find(c=>c[0]==='export')?.[1];assert.ok(req,f.errors.join(';'));assert.equal(req.transparentFormat,'webm');assert.equal(req.fileName,'video.webm');f.mounted.dispose();
});
test('audio hides video settings, excludes music and subtitles, outputs WAV',async()=>{
 const f=setup();await f.click('选择 SRT / ASS / SSA…');await f.change('导出内容','audio');await f.change('分辨率','not-a-size');f.field('并行数（1–32）').value='invalid';await f.click('加入导出队列');const req=f.calls.find(c=>c[0]==='export')?.[1];assert.ok(req,f.errors.join(';'));assert.equal(req.exportKind,'audio');assert.equal(req.fileName,'video.wav');assert.equal(req.subtitle,undefined);assert.equal(req.useMusicTimeline,false);assert.equal(req.settings.workers,1);f.mounted.dispose();
});
test('full quality, resolution, fps and story scope reach actual request',async()=>{
 const f=setup();await f.change('分辨率','2560x1440');await f.change('帧率','60');await f.change('导出质量','quality');await f.change('故事范围','fromScene');f.field('并行数（1–32）').value='8';await f.click('加入导出队列');const req=f.calls.find(c=>c[0]==='export')[1];assert.equal(req.storyScope,'fromScene');assert.deepEqual([req.settings.width,req.settings.height,req.settings.fps,req.settings.workers],[2560,1440,60,8]);assert.equal(req.settings.gpuRawMode,'quality');f.mounted.dispose();
});
test('invalid worker count and wrong output extension stop before export',async()=>{
 const f=setup();f.field('并行数（1–32）').value='1.5';await f.click('加入导出队列');assert.ok(f.errors.some(e=>e.includes('整数')));f.field('并行数（1–32）').value='4';f.field('文件名').value='bad.mov';await f.click('加入导出队列');assert.ok(f.errors.some(e=>e.includes('.mp4')));assert.equal(f.calls.filter(c=>c[0]==='export').length,0);f.mounted.dispose();
});
test('native shared form returns to dock and resets stage flags on reopen',async()=>{
 const f=setup(),host=new Element('native-config');f.container.append(host);const detach=f.mounted.attachExport(host,'stage');await f.change('包含立绘',false);assert.equal(f.field('包含立绘').checked,false);detach();assert.equal(host.children.length,0);f.mounted.attachExport(host,'stage');assert.equal(f.field('包含立绘').checked,true);assert.equal(f.field('包含背景').checked,true);f.mounted.dispose();
});
test('embedded range picker works without prior timing and rejects a changed scene',async()=>{
 const f=setup({selectSegments:()=>{throw Error('must not measure')}});await f.change('故事范围','selection');await f.click('读取当前场景');await f.click('全选语句');await f.click('锁定导出片段');await f.click('加入导出队列');const req=f.calls.find(c=>c[0]==='export')?.[1];assert.ok(req,f.errors.join(';'));assert.match(req.range.sourceHash,/^[a-f0-9]{64}$/);assert.deepEqual([req.range.startLine,req.range.endLine],[1,2]);f.snap.revision++;await f.click('加入导出队列');assert.equal(f.calls.filter(c=>c[0]==='export').length,1);assert.ok(f.errors.some(e=>e.includes('已变化')));f.mounted.dispose();
});
test('subtitle fields start collapsed and music uses named choices rather than copied IDs',async()=>{
 const f=setup();const details=f.nodes().find(n=>n.tag==='details');assert.notEqual(details.open,true);assert.equal(f.nodes().some(n=>n['aria-label']==='配乐 ID（从配置中复制）'),false);assert.ok(f.field('基准配乐').children.some(n=>n.value==='a'&&n.textContent.includes('A')));f.mounted.dispose();
});
test('cancel during queue creation cancels the returned job and stops remaining ranges',async()=>{
 const f=setup();await chooseDisjoint(f);let release;f.bridge.exportVideo=options=>new Promise(resolve=>{release=()=>{f.calls.push(['export',options]);resolve({id:'pending-job'})}});f.button('加入导出队列').events.click();for(let i=0;i<20;i++)await Promise.resolve();assert.ok(release);await f.click('取消本面板导出任务');release();for(let i=0;i<20;i++)await Promise.resolve();assert.equal(f.calls.filter(c=>c[0]==='export').length,1);assert.ok(f.calls.some(c=>c[0]==='cancelJob'&&c[1]==='pending-job'));f.mounted.dispose();
});

for (const view of ['export', 'music']) test('native export returns to the current dock view: ' + view, () => {
 const f=setup(),host=new Element('native-config');f.container.append(host);
 f.mounted.show('export');
 const exportCard=f.nodes().find(n=>String(n.className||'').includes('wvc-export-form')),originalParent=exportCard.parent;
 assert.equal(exportCard.hidden,false);
 const detach=f.mounted.attachExport(host,'stage');assert.equal(exportCard.parent,host);assert.equal(exportCard.hidden,false);
 if(view==='music')f.mounted.show('music');
 detach();assert.equal(exportCard.parent,originalParent);assert.equal(host.children.length,0);assert.equal(exportCard.hidden,view!=='export');
 if(view==='music')assert.equal(f.nodes().find(n=>n.tag==='h3'&&n.textContent==='设置导出音乐').parent.hidden,false);
 detach();assert.equal(exportCard.hidden,view!=='export','repeated detach must preserve current dock view');
 f.mounted.dispose();
});

test('native export cannot bypass an unsaved music leave refusal',()=>{let checked=0;const f=setup({musicUI:{mount:()=>({show(){},refresh(){},dispose(){},canLeave(){checked++;return false}})}}),host=new Element('native-config');f.container.append(host);f.mounted.show('music');assert.throws(()=>f.mounted.attachExport(host,'full'),/保存音乐/);assert.equal(checked,1);assert.equal(host.children.length,0);f.mounted.dispose()});

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); };

for (const [key, value] of [
 ['projectId', 'other-project'], ['projectPath', 'C:/Other'], ['path', 'other-scene'],
 ['source', 'Changed;'], ['revision', 2], ['engineId', 'mygo'], ['runtimeBindingSignature', 'official-4.6.5'],
]) test('queue preparation rejects a changed ' + key + ' after deferred speed read', async () => {
 const wait = deferred(); let reading = false;
 const f = setup({ readSpeeds: () => { reading = true; return wait.promise; } });
 f.button('加入导出队列').events.click(); await flush(); assert.equal(reading, true);
 f.snap[key] = value; wait.resolve({ textSpeed: 50, autoSpeed: 50 }); await flush();
 assert.equal(f.calls.filter(call => call[0] === 'export').length, 0);
 assert.ok(f.errors.some(error => /工程、剧本或运行时已变化/.test(error)), f.errors.join(';'));
 f.mounted.dispose();
});

test('each submitted export carries its captured seven-key snapshot proof', async () => {
 const f = setup(); await f.click('加入导出队列');
 const request = f.calls.find(call => call[0] === 'export')[1];
 assert.deepEqual({ ...request.snapshot }, f.snap);
 assert.notEqual(request.snapshot, f.snap, 'snapshot must not follow later live state changes');
 f.mounted.dispose();
});

test('project change between disjoint submissions stops the remaining range', async () => {
 const f = setup(); await chooseDisjoint(f); const wait = deferred();
 f.bridge.exportVideo = async options => { f.calls.push(['export', options]); return wait.promise; };
 f.button('加入导出队列').events.click(); await flush();
 assert.equal(f.calls.filter(call => call[0] === 'export').length, 1);
 f.snap.projectId = 'other-project'; wait.resolve({ id: 'already-queued' }); await flush();
 assert.equal(f.calls.filter(call => call[0] === 'export').length, 1);
 assert.ok(f.errors.some(error => /已变化/.test(error)));
 assert.equal(f.calls.filter(call => call[0] === 'cancelJob').length, 0, 'already queued work remains running');
 f.mounted.dispose();
});

test('disposal during deferred queue preparation never starts an export or emits late errors', async () => {
 const wait = deferred(), f = setup({ readSpeeds: () => wait.promise });
 f.button('加入导出队列').events.click(); await flush(); f.mounted.dispose();
 wait.resolve({ textSpeed: 50, autoSpeed: 50 }); await flush();
 assert.equal(f.calls.filter(call => call[0] === 'export').length, 0);
 assert.deepEqual(f.messages, []); assert.deepEqual(f.errors, []);
 const failed = deferred(), g = setup({ readSpeeds: () => failed.promise });
 g.button('加入导出队列').events.click(); await flush(); g.mounted.dispose();
 failed.reject(Error('late stale preview failure')); await flush();
 assert.deepEqual(g.messages, []); assert.deepEqual(g.errors, []);
});

test('disposal while the first fragment queues cancels only its late job and stops later ranges', async () => {
 const f = setup(); await f.click('加入导出队列'); await chooseDisjoint(f); const wait = deferred();
 f.bridge.exportVideo = async options => { f.calls.push(['export', options]); return wait.promise; };
 f.button('加入导出队列').events.click(); await flush(); const count = f.messages.length;
 f.mounted.dispose(); wait.resolve({ id: 'late-first-range' }); await flush();
 assert.equal(f.calls.filter(call => call[0] === 'export').length, 2, 'old queued job plus one interrupted fragment only');
 assert.deepEqual(f.calls.filter(call => call[0] === 'cancelJob').map(call => call[1]), ['late-first-range']);
 assert.equal(f.messages.length, count); assert.deepEqual(f.errors, []);
});

test('panel disposal releases music UI without globally canceling an independent timing consumer', () => {
 let independentTimingActive = true, musicDisposed = false;
 const f = setup({ cancel: async () => { independentTimingActive = false; }, musicUI: { mount: () => ({
  show() {}, refresh() {}, dispose() { musicDisposed = true; },
 }) } });
 f.mounted.dispose();
 assert.equal(musicDisposed, true); assert.equal(independentTimingActive, true);
});

for (const failure of [false, true]) test('a slow old cancel cannot target or overwrite a newly queued export' + (failure ? ' on failure' : ''), async () => {
 const f = setup(); await f.click('加入导出队列'); const wait = deferred(), canceled = [];
 f.bridge.cancelJob = async id => { canceled.push(id); if (canceled.length === 1) await wait.promise; };
 f.button('取消本面板导出任务').events.click(); await flush();
 await f.click('加入导出队列'); const messages = [...f.messages];
 if (failure) wait.reject(Error('old cancellation failed')); else wait.resolve();
 await flush();
 assert.equal(f.calls.filter(call => call[0] === 'export').length, 2);
 assert.equal(canceled.length, 1, 'old cancellation owns only the original job IDs');
 assert.deepEqual(f.messages, messages, 'old completion or error must not replace the new submission status');
 assert.deepEqual(f.errors, []); f.mounted.dispose();
});

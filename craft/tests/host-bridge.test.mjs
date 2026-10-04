import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {createBridge}=createRequire(import.meta.url)('../host-bridge.js');
function fixture(registry){let source='A:one;\nB:two;',revision=0,time=0;const undo=[],redo=[];
 const state={kind:'scene',get textContent(){return source;}};
 const stores={workspace:{currentGame:{id:'p',path:'C:/project'}},tabs:{activeTab:{path:'C:/project/game/scene/start.txt'}},file:{async getFolderContents(){return[{path:'C:/project/game/scene/start.txt',isDir:false}];}},editor:{
 getTextProjectionState:()=>state,peekSceneRevision:()=>String(revision),getSceneSelection:()=>({lastLineNumber:2}),
 replaceTextDocumentContent(p,after){undo.push(source);source=after;revision++;return true;},undoDocument(){redo.push(source);source=undo.pop();revision++;},redoDocument(){undo.push(source);source=redo.pop();revision++;},
 readTextDocumentFile:async()=>({content:source}),syncSceneSelectionFromTextLine(){},syncScenePreview(...args){f.preview=args;}}};
 const f={stores,get source(){return source;},set source(s){source=s;revision++;},sleep:async ms=>{time+=ms;}};
 f.bridge=createBridge({getStores:()=>stores,registry,invoke(){throw Error('unexpected native IPC');},now:()=>time,sleep:ms=>f.sleep(ms)});return f;
}
test('batch editing preserves native undo steps and refuses stale revision',async()=>{const f=fixture(),before=await f.bridge.snapshot();await f.bridge.commit({snapshot:before,after:'one'});await f.bridge.commit({snapshot:await f.bridge.snapshot(),after:'two'});await f.bridge.undo();assert.equal(f.source,'one');await f.bridge.undo();assert.equal(f.source,before.source);await assert.rejects(f.bridge.commit({snapshot:before,after:'bad'}),/版本/);});
test('selection uses actual native line and source offsets',async()=>{const f=fixture(),s=await f.bridge.snapshot();assert.equal(s.source.slice(s.selection.start,s.selection.end),'B:two;');});
for(const change of [f=>f.source='changed',f=>f.stores.workspace.currentGame.id='another',f=>f.stores.tabs.activeTab.path='C:/project/game/scene/other.txt'])test('change during quiet window prevents transaction '+change.toString(),async()=>{const f=fixture(),s=await f.bridge.snapshot();f.sleep=async()=>change(f);await assert.rejects(f.bridge.commit({snapshot:s,after:'unsafe'}));assert.notEqual(f.source,'unsafe');});
test('backwards wall time fails history separation',async()=>{const f=fixture(),s=await f.bridge.snapshot();f.sleep=async()=>{};await assert.rejects(f.bridge.commit({snapshot:s,after:'unsafe'}),/时钟/);});
test('preview passes path, line and exact line text',async()=>{const f=fixture();await f.bridge.preview(2);assert.deepEqual(f.preview,['C:/project/game/scene/start.txt',2,'B:two;',true]);});
test('VFS lists and reads through host store',async()=>{const f=fixture();assert.equal((await f.bridge.listScenes()).length,1);assert.equal(await f.bridge.readScene('start.txt'),f.source);await assert.rejects(f.bridge.readScene('../secret'),/路径/);});

test('verified 4.6.5 binding supplies newer syntax absent in beta2 host fields',async()=>{let version='4.6.5';const f=fixture(async()=>({runtimeVersion:version,enginePath:'C:/engine',engineId:'e'}));const s=await f.bridge.snapshot();assert.equal(s.runtimeCapabilities.changeFigureDiff,true);assert.equal(s.runtimeCapabilities.transformFrom,true);version='4.6.4';await assert.rejects(f.bridge.commit({snapshot:s,after:'changed'}),/版本/);assert.equal((await f.bridge.snapshot()).runtimeCapabilities.changeFigureDiff,false);});

test('cancel during native hint synchronization prevents later snippet and timer',async()=>{
 const source='choose:提示:__wvp_hint_test -defaultChoose=1 -wvpHint=1800;\nlabel:__wvp_hint_test;';
 const calls=[];let release,started=false;
 globalThis.WebVideoCraftScript={parse:()=>({}),hintPairs:()=>[{valid:true,key:'__wvp_hint_test',text:'提示',duration:1800,choose:{startLine:1,source:source.split('\n')[0]}}]};
 const stores={workspace:{currentGame:{id:'p',path:'C:/project'}},tabs:{activeTab:{path:'C:/project/game/scene/start.txt'}},file:{},editor:{getTextProjectionState:()=>({kind:'scene',textContent:source,isDirty:false}),peekSceneRevision:()=> 'r1'},previewSession:{currentGameServeUrl:'http://127.0.0.1:8899/game/test/'},previewSync:{async sendPreviewCommand(type){calls.push(type);started=true;await new Promise(r=>release=r);}}};
 const b=createBridge({getStores:()=>stores,rpc:async(method,payload)=>{calls.push([method,payload]);return{cancelled:true};}});
 try{const result=b.previewHint({line:1,key:'__wvp_hint_test',duration:1800});while(!started)await new Promise(setImmediate);await b.cancelHintPreview();release();await assert.rejects(result,/取消/);assert.equal(calls.filter(x=>typeof x==='string').length,1);assert(!calls.some(x=>Array.isArray(x)&&!x[1].cancel));}
 finally{delete globalThis.WebVideoCraftScript;}
});
test('timing dependencies invalidate when actual preview language changes',async()=>{
 const f=fixture();f.stores.previewSession={currentGameServeUrl:'http://127.0.0.1:8899/game/test/'};let language=1,discarded=0;
 f.stores.editor.collectDocumentPathsUnder=()=>[];
 const b=createBridge({getStores:()=>f.stores,registry:async()=>({enginePath:'C:/engine',runtimeVersion:'4.6.4',runtimeId:'open-webgal.webgal'}),invoke:async()=>{},rpc:async method=>{if(method==='snapshot.allocate')return{snapshotId:'owned',site:'C:/snapshot'};if(method==='snapshot.ready')return{snapshotId:'owned',dependencyHash:'unchanged-files'};if(method==='preview.settings')return{language,source:'preview'};if(method==='snapshot.discard'){discarded++;return; }throw Error('unexpected RPC');}});
 const one=await b.timingDependencyHash();language=2;assert.notEqual(await b.timingDependencyHash(),one);assert.equal(discarded,2);
});

test('export snapshot carries MyGO own version separately from base runtime version',async()=>{
 const f=fixture();f.stores.editor.collectDocumentPathsUnder=()=>[];let allocated;
 const b=createBridge({getStores:()=>f.stores,registry:async()=>({enginePath:'C:/mygo',engineVersion:'3.2.1',runtimeVersion:'4.6.4',runtimeId:'webgal-mygo.mygo'}),invoke:async()=>{},rpc:async(method,p)=>{if(method==='snapshot.allocate'){allocated=p;return{snapshotId:'owned',site:'C:/snapshot'};}if(method==='snapshot.ready')return{snapshotId:'owned'};throw Error(method);}});
 await b.exportSnapshot();assert.equal(allocated.engineVersion,'3.2.1');assert.equal(allocated.runtimeVersion,'4.6.4');assert.equal(allocated.runtimeId,'webgal-mygo.mygo');assert.deepEqual(allocated.sources,['C:/project','C:/mygo']);
 const snapshot=await b.snapshot();assert.equal(snapshot.runtimeCapabilities.changeFigureDiff,false);assert.equal(snapshot.runtimeCapabilities.transformFrom,false);
});

function exportFixture() {
 const f=fixture(), calls=[]; let resolveRegistry=async()=>({enginePath:'C:/engine',runtimeVersion:'4.6.5',runtimeId:'open-webgal.webgal'}), onExport=async()=>{};
 f.stores.workspace.currentGame.engineId='official465'; f.stores.editor.collectDocumentPathsUnder=()=>[f.stores.tabs.activeTab.path];
 const b=createBridge({getStores:()=>f.stores,registry:(...args)=>resolveRegistry(...args),invoke:async()=>{calls.push('export_web');await onExport();},rpc:async(method,payload)=>{
  calls.push([method,payload]);
  if(method==='snapshot.allocate')return{snapshotId:'owned',site:'C:/snapshot'};
  if(method==='snapshot.ready')return{snapshotId:'owned'};
  if(method==='snapshot.discard')return;
  if(method==='export.start')return{id:'job'};
  throw Error(method);
 }});
 return {...f,b,calls,setRegistry:fn=>resolveRegistry=fn,setExport:fn=>onExport=fn};
}
test('export enforces its caller snapshot before native preparation even for identical scene text',async()=>{
 for(const mutation of [f=>f.stores.workspace.currentGame.id='second',f=>{f.stores.workspace.currentGame.path='D:/project';f.stores.tabs.activeTab.path='D:/project/game/scene/start.txt';},f=>f.stores.workspace.currentGame.engineId='mygo321']){
  const f=exportFixture(),snapshot=await f.b.snapshot();mutation(f);
  await assert.rejects(f.b.exportVideo({snapshot,scene:snapshot.sceneRelativePath,sourceText:snapshot.source}),/变化/);
  assert.equal(f.calls.length,0);
 }
});
test('export expected snapshot catches rebinding inside asynchronous registry resolution',async()=>{
 const f=exportFixture(),snapshot=await f.b.snapshot();let entered,release;
 const started=new Promise(resolve=>entered=resolve),registry=new Promise(resolve=>release=resolve);
 f.setRegistry(()=>{entered();return registry;});
 const pending=f.b.exportVideo({snapshot,scene:snapshot.sceneRelativePath,sourceText:snapshot.source});await started;
 f.stores.workspace.currentGame.engineId='mygo321';release({enginePath:'C:/mygo',runtimeVersion:'4.6.4',engineVersion:'3.2.1',runtimeId:'webgal-mygo.mygo'});
 await assert.rejects(pending,/变化/);assert.equal(f.calls.length,0);
});
test('export removes caller-only snapshot metadata and discards prepared bytes after final source validation fails',async()=>{
 const f=exportFixture(),snapshot=await f.b.snapshot();
 await f.b.exportVideo({snapshot,scene:snapshot.sceneRelativePath,sourceText:snapshot.source,exportKind:'full'});
 const start=f.calls.find(call=>call[0]==='export.start');assert.equal('snapshot' in start[1].options,false);assert.equal(start[1].options.exportKind,'full');
 f.calls.length=0;f.setExport(()=>{f.stores.workspace.currentGame.engineId='changed';});
 await assert.rejects(f.b.exportVideo({snapshot,scene:snapshot.sceneRelativePath,sourceText:snapshot.source}),/变化/);
 assert.equal(f.calls.some(call=>call[0]==='export.start'),false);
 assert.equal(f.calls.filter(call=>call[0]==='snapshot.discard').length,1);
});
test('host subscriptions observe project path and engine identity even without text or selection edits',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');let tick;
 const context={setInterval:callback=>{tick=callback;return 1;},clearInterval(){}};
 runInNewContext(readFileSync(new URL('../host-bridge.js',import.meta.url),'utf8'),context);
 const f=fixture(),b=context.WebVideoCraftCreateBridge({getStores:()=>f.stores});let changes=0;
 const unsubscribe=b.subscribe(()=>changes++);tick();assert.equal(changes,1);
 f.stores.workspace.currentGame.engineId='official465';tick();assert.equal(changes,2);
 f.stores.workspace.currentGame.path='D:/project';tick();assert.equal(changes,3);
 tick();assert.equal(changes,3);unsubscribe();
});

for(const [name,change] of [
 ['project replacement',f=>f.stores.workspace.currentGame={...f.stores.workspace.currentGame,id:'new-project'}],
 ['in-place project identity',f=>f.stores.workspace.currentGame.id='new-project'],
 ['in-place engine binding',f=>f.stores.workspace.currentGame.engineId='changed-engine'],
 ['unsaved document',f=>f.stores.editor.hasUnsavedDocuments=true],
 ['native blocking-task failure',f=>f.stores.runtimeTask.beginBlockingTask=()=>{throw Error('native task unavailable');}],
]) test('allocated export snapshot is cleaned when '+name+' changes before native export',async()=>{
 const f=fixture();f.stores.workspace.currentGame.engineId='engine-one';f.stores.editor.collectDocumentPathsUnder=()=>[];f.stores.runtimeTask={beginBlockingTask:()=>()=>{}};
 let release,entered;const allocated=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),calls=[];
 const b=createBridge({getStores:()=>f.stores,registry:async()=>({enginePath:'C:/engine',runtimeVersion:'4.6.5',runtimeId:'open-webgal.webgal'}),invoke:async()=>calls.push('native export'),rpc:async(method,params)=>{
  calls.push([method,params]);if(method==='snapshot.allocate'){entered();return allocated;}if(method==='snapshot.discard')return;if(method==='snapshot.ready')return{snapshotId:'owned'};throw Error(method);
 }});
 const pending=b.exportSnapshot();await started;change(f);release({snapshotId:'owned',site:'C:/temporary'});
 await assert.rejects(pending);assert.equal(calls.includes('native export'),false);
 assert.deepEqual(calls.filter(call=>call[0]==='snapshot.discard'),[['snapshot.discard',{snapshotId:'owned'}]]);
});

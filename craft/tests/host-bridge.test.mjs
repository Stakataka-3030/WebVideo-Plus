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

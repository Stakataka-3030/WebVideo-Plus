import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const {readPinnedCraftUpdateState: read} = createRequire(import.meta.url)('../update/host-state.js');
const profile = Object.freeze({version:'1.0.0-beta.2',sha256:'3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d'});
function fixture() {
  return {_s:new Map([
    ['editor',{hasUnsavedDocuments:false}],
    ['modal',{modalStack:new Map()}],
    ['resource',{activeProgress:new Map(),games:[],engines:[],templates:[]}],
  ])};
}

test('pinned lazy ledgers may be absent without inventing or creating a store',()=>{
  const pinia=fixture(), before=[...pinia._s];
  assert.deepEqual(read(pinia,profile),{hasUnsavedDocuments:false,hasBlockingTasks:false,blockers:[],absentLazyStores:['runtime-task','managed-import','backup'],coverage:'known-work-only'});
  assert.deepEqual([...pinia._s],before);
  assert.equal(pinia._s.has('runtimeTask'),false);
});
test('exact verified executable profile is required even when all ledgers look idle',()=>{
  for(const invalid of [undefined,{}, {...profile,version:'1.0.0-beta.1'},{...profile,sha256:'0'.repeat(64)}])assert.throws(()=>read(fixture(),invalid),/版本未验证/);
});
test('missing Pinia, mandatory store, field, or unloaded resource collection remains unknown',()=>{
  for(const value of [undefined,{}, {_s:{}},{_s:[]}])assert.throws(()=>read(value,profile),/Pinia/);
  for(const id of ['editor','modal','resource']){const p=fixture();p._s.delete(id);assert.throws(()=>read(p,profile),/未就绪/);}
  for(const value of [undefined,null,0,'false']){const p=fixture();p._s.get('editor').hasUnsavedDocuments=value;assert.throws(()=>read(p,profile),/格式不匹配/);}
  for(const kind of ['games','engines','templates']){const p=fixture();p._s.get('resource')[kind]=undefined;assert.throws(()=>read(p,profile),/尚未加载/);}
});
test('dirty document is reported independently of task blockers',()=>{
  const p=fixture();p._s.get('editor').hasUnsavedDocuments=true;
  assert.equal(read(p,profile).hasUnsavedDocuments,true);assert.equal(read(p,profile).hasBlockingTasks,false);
});
for(const [id,key,reason] of [['runtime-task','hasBlockingTasks','native-runtime-task'],['managed-import','isBusy','native-managed-import'],['backup','restoring','native-backup-restore']]) {
  test(id+' is read afresh and rejects malformed present stores',()=>{
    const p=fixture();p._s.set(id,{...(id==='backup'?{loading:false}:{}),[key]:false});assert.equal(read(p,profile).hasBlockingTasks,false);
    p._s.get(id)[key]=true;assert.deepEqual(read(p,profile).blockers,[reason]);
    p._s.get(id)[key]=false;assert.equal(read(p,profile).hasBlockingTasks,false);
    for(const malformed of [undefined,null,{}, {[key]:0},{[key]:'false'}]){p._s.set(id,malformed);assert.throws(()=>read(p,profile),/未就绪|格式不匹配/);}
  });
}
test('all retained native modal entries block including closed export and keepAlive',()=>{
  const p=fixture(), stack=p._s.get('modal').modalStack;
  for(const entry of [{isOpen:true},{isOpen:false},{isOpen:false,keepAlive:true}]){
    stack.set('ExportDialog',entry);assert.deepEqual(read(p,profile).blockers,['native-modal']);stack.clear();
  }
  assert.equal(read(p,profile).hasBlockingTasks,false);
});
test('backup timeline cleanup remains blocking after its dialog closes',()=>{
  const p=fixture();p._s.set('backup',{loading:true,restoring:false});
  assert.deepEqual(read(p,profile).blockers,['native-backup-loading']);
  p._s.get('backup').loading=false;assert.equal(read(p,profile).hasBlockingTasks,false);
  delete p._s.get('backup').loading;assert.throws(()=>read(p,profile),/backup.loading/);
});
test('native progress and every creating resource type block, including zero progress',()=>{
  const p=fixture(), r=p._s.get('resource');r.activeProgress.set('template',0);
  assert.deepEqual(read(p,profile).blockers,['native-resource-progress']);r.activeProgress.clear();
  for(const kind of ['games','engines','templates']){
    r[kind]=[{status:'created'},{status:'error'},{status:'creating'}];
    assert.deepEqual(read(p,profile).blockers,['native-'+kind+'-creating']);r[kind]=[];
    for(const invalid of [null,{}, {status:'pending'}]){r[kind]=[invalid];assert.throws(()=>read(p,profile),/格式不匹配/);}r[kind]=[];
  }
});
test('malformed collection objects and throwing getters fail closed without mutation',()=>{
  for(const [id,key] of [['modal','modalStack'],['resource','activeProgress']]){
    const p=fixture();p._s.get(id)[key]={size:0};assert.throws(()=>read(p,profile),/格式不匹配/);
  }
  const p=fixture();Object.defineProperty(p._s.get('editor'),'hasUnsavedDocuments',{get(){throw Error('state unavailable');}});
  assert.throws(()=>read(p,profile),/state unavailable/);
});
test('browser classic script and serialized backend function are identical across VM realms',async()=>{
  const source=await fs.readFile(new URL('../update/host-state.js',import.meta.url),'utf8');
  const context=vm.createContext({});vm.runInContext(source,context);
  const serialized=vm.runInContext('('+read.toString()+')',context);
  const browser=context.WebVideoCraftReadUpdateState;
  assert.equal(browser.toString(),read.toString());
  for(const reader of [browser,serialized]){
    const p=fixture();p._s.get('resource').activeProgress.set('native-export',0);
    assert.equal(JSON.stringify(reader(p,profile)),JSON.stringify(read(p,profile)));
    assert.throws(()=>reader(p,{...profile,version:'unknown'}),/版本未验证/);
  }
  assert.equal(globalThis.WebVideoCraftReadUpdateState,undefined,'Node import does not add browser globals');
});

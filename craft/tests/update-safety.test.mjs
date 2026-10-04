import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {SessionActivity,readOwnInstallerLaunchState} from '../session/update-safety.mjs';
const profile={version:'1.0.0-beta.2',sha256:'3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d'};
function fixture(){
 const pinia={_s:new Map([['editor',{hasUnsavedDocuments:false}],['modal',{modalStack:new Map()}],['resource',{activeProgress:new Map(),games:[],engines:[],templates:[]}]])};
 let session={contextId:4,closed:false},readHook,cdpHook;
 const activity=new SessionActivity(),storage={snapshots:new Map(),metadataWrites:new Set()};
 const kernel={activityRevision:0,async readUpdateActivity(){await readHook?.();return {known:true,hasBlockingTasks:false,revision:this.activityRevision};}};
 const cdp={async call(method,p){assert.equal(method,'Runtime.evaluate');assert.equal(p.contextId,4);await cdpHook?.();return {result:{value:vm.runInNewContext(p.expression,{document:{querySelector:()=>({__vue_app__:{config:{globalProperties:{$pinia:pinia}}}})}})}};}};
 const read=()=>readOwnInstallerLaunchState({cdp,getSession:()=>session,profile,activity,storage,kernel});
 return {read,pinia,activity,storage,kernel,cdp,readHook:fn=>readHook=fn,cdpHook:fn=>cdpHook=fn,changeSession:()=>session={contextId:5,closed:false},close:()=>session.closed=true};
}
test('saved pinned host with uncreated lazy task store permits only own installer UI opening',async()=>{
 const f=fixture(),value=await f.read();assert.equal(value.hasBlockingTasks,false);assert.equal(value.hasUnsavedDocuments,false);
 assert.equal(value.coverage,'own-installer-ui-only');assert.equal(value.universalIdle,false);assert(value.absentLazyStores.includes('runtime-task'));assert(!f.pinia._s.has('runtime-task'));
});
test('dirty or native export modal blocks without a runtime-task store',async()=>{
 const f=fixture();f.pinia._s.get('editor').hasUnsavedDocuments=true;assert.equal((await f.read()).hasUnsavedDocuments,true);
 f.pinia._s.get('editor').hasUnsavedDocuments=false;f.pinia._s.get('modal').modalStack.set('ExportDialog',{isBusy:true});assert((await f.read()).blockers.includes('native-modal'));
});
test('missing mandatory native state and malformed service state fail closed',async()=>{
 const f=fixture();f.pinia._s.delete('resource');await assert.rejects(f.read(),/resource|状态/);
 for(const value of [null,{}, {known:false,hasBlockingTasks:true},{known:true,hasBlockingTasks:'false'}]){const g=fixture();g.kernel.readUpdateActivity=async()=>value;await assert.rejects(g.read(),/后台工作状态/);}
});
test('active service jobs, pending snapshots and metadata writes remain separate blockers',async()=>{
 const f=fixture();f.kernel.readUpdateActivity=async()=>({known:true,hasBlockingTasks:true,revision:0});assert((await f.read()).blockers.includes('webvideo-kernel-work'));
 const g=fixture();g.storage.snapshots.set('pending',{ready:false});assert((await g.read()).blockers.includes('webvideo-snapshot-work'));
 g.storage.snapshots.get('pending').ready=true;g.storage.metadataWrites.add('write');assert((await g.read()).blockers.includes('webvideo-metadata-write'));
 g.storage.metadataWrites.clear();assert.equal((await g.read()).hasBlockingTasks,false);
});
test('new in-flight RPC or a whole RPC during polling cannot produce a false clear result',async()=>{
 const f=fixture();let finish;const work=f.activity.run(()=>new Promise(r=>finish=r));assert((await f.read()).blockers.includes('webvideo-session-work'));finish();await work;
 const g=fixture();g.readHook(()=>g.activity.run(async()=>{}));assert((await g.read()).blockers.includes('webvideo-session-work'));
});
test('kernel activity changes while final native read is pending fail closed',async()=>{
 const f=fixture();f.cdpHook(()=>f.kernel.activityRevision++);assert((await f.read()).blockers.includes('webvideo-session-work'));
});
test('context changes and closure during either awaited read reject stale native proof',async()=>{
 for(const phase of ['readHook','cdpHook'])for(const action of ['changeSession','close']){const f=fixture();f[phase](()=>f[action]());await assert.rejects(f.read(),/页面已变化/);}
});
test('activity counter is released on errors without hiding generation changes',async()=>{
 const a=new SessionActivity();await assert.rejects(a.run(async()=>{throw Error('fixture');}),/fixture/);assert.equal(a.pending,0);assert.equal(a.revision,2);
});
test('synchronous final proof refuses activity that starts after the last async native check',async()=>{
 const f=fixture(),proof=await f.read();proof.assertCurrent();await f.activity.run(async()=>{});assert.throws(()=>proof.assertCurrent(),/出现 WebVideo/);
 const g=fixture(),proof2=await g.read();g.kernel.activityRevision++;assert.throws(()=>proof2.assertCurrent(),/出现 WebVideo/);
 const h=fixture(),proof3=await h.read();h.changeSession();assert.throws(()=>proof3.assertCurrent(),/页面已变化/);
});
test('malformed CDP collections reject, and a true native blocker cannot be erased by empty descriptions',async()=>{
 const proof={hasUnsavedDocuments:false,hasBlockingTasks:true,coverage:'known-work-only',blockers:[],absentLazyStores:[]};
 const f=fixture();f.cdp.call=async()=>({result:{value:proof}});assert.equal((await f.read()).hasBlockingTasks,true);
 for(const field of ['blockers','absentLazyStores'])for(const value of [undefined,null,{},[false]]){const g=fixture();g.cdp.call=async()=>({result:{value:{...proof,[field]:value}}});await assert.rejects(g.read(),/已知文档和工作状态/);}
});

test('official host closure needs explicit separate confirmation and keeps known-work scope honest',async()=>{
 const {readOfficialInstallState}=await import('../session/update-safety.mjs');
 const f=fixture();
 await assert.rejects(readOfficialInstallState({}),/确认/);
 // Reuse the real CDP expression and exact host profile, not the own-GUI proof.
 const session={contextId:4,closed:false};
 const options={cdp:f.cdp,getSession:()=>session,profile,activity:f.activity,storage:f.storage,kernel:f.kernel,confirmNormalClose:true};
 const proof=await readOfficialInstallState(options);
 assert.equal(proof.coverage,'official-confirmed-normal-close');assert.equal(proof.universalIdle,false);
 assert(proof.absentLazyStores.includes('runtime-task'));assert(!f.pinia._s.has('runtime-task'));
 f.pinia._s.get('modal').modalStack.set('ExportDialog',{isOpen:true});
 assert.equal((await readOfficialInstallState(options)).hasBlockingTasks,true);
 f.pinia._s.get('modal').modalStack.clear();f.pinia._s.get('editor').hasUnsavedDocuments=true;
 assert.equal((await readOfficialInstallState(options)).hasUnsavedDocuments,true);
 f.pinia._s.get('editor').hasUnsavedDocuments=false;f.pinia._s.set('runtime-task',{hasBlockingTasks:true});
 assert.equal((await readOfficialInstallState(options)).hasBlockingTasks,true);
 f.pinia._s.get('runtime-task').hasBlockingTasks=false;
 const final=await readOfficialInstallState(options);await f.activity.run(async()=>{});assert.throws(final.assertCurrent,/出现 WebVideo/);
});

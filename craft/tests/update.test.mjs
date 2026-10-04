import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {createAppUpdateStore} from './update-host-fixture.mjs';
import {UpdateCoordinator} from '../update/coordinator.mjs';
import {classifyOfficialUpdate,shouldRetainUpdateLock} from '../update/handoff-state.mjs';
const source=await fs.readFile(new URL('../update/client.js',import.meta.url),'utf8');
function fixture({nativeShape,initialStatus,readLocalState,hook=true}={}){
 const calls=[],alerts=[],watchdogs=[],app={inert:false},stores={appUpdate:createAppUpdateStore({status:initialStatus||'idle',availableUpdate:{version:'1.0.1',currentVersion:'1.0.0-beta.2'}}),editor:{hasUnsavedDocuments:false},runtimeTask:{hasBlockingTasks:false}},context={document:{querySelector:()=>app},alert:s=>alerts.push(s),confirm:()=>true,setTimeout:(fn,delay)=>delay===1000?watchdogs.push(fn):setTimeout(fn,delay),clearTimeout};
 vm.runInNewContext(source,context);let ack={ready:true},commitAck={committed:true,exitHost:true},abortAck={notStarted:true,cancelled:true,state:'not-started'},checkInfo={rid:1,version:'1.0.1',currentVersion:'1.0.0-beta.2',rawJson:{version:'1.0.1'}},failure,afterPrepare,afterCommit;
 const invoke=async(c,a,o)=>{calls.push([c,a,o]);if(failure?.command===c)throw Error(failure.message);if(c==='plugin:updater|check')return checkInfo;if(c==='plugin:updater|download')return 2;};
 const internals={invoke,transformCallback:()=>17,unregisterCallback(){}};
 if(nativeShape==='readonly')Object.defineProperty(internals,'invoke',{value:invoke,writable:false,configurable:false});
 if(nativeShape==='frozen')Object.freeze(internals);
 const originalDescriptor=Object.getOwnPropertyDescriptor(internals,'invoke');
 const client=context.WebVideoCraftCreateUpdates({getStores:()=>stores,internals,invoke,confirmInstall:options=>{if(typeof context.confirm!=='function')throw Error('官方更新需要确认后才能正常关闭 Craft');return context.confirm(options.message);},...(readLocalState===undefined?{}:{readLocalState}),rpc:async(c,p)=>{calls.push([c,p]);if(c==='update.prepare')afterPrepare?.();if(c==='update.commit')afterCommit?.();if(c==='update.abort')return abortAck;return c==='update.status'?{enabled:ack.ready===true,state:'idle'}:c==='update.commit'?commitAck:ack;}});
 if(hook)client.installOfficialHook();
 return {client,context,originalDescriptor,invoke,calls,alerts,watchdogs,app,stores,internals,setAck:a=>ack=a,setCommit:a=>commitAck=a,setAbort:a=>abortAck=a,setCheck:a=>checkInfo=a,afterCommit:fn=>afterCommit=fn,confirm:fn=>context.confirm=fn,fail:(command,message)=>failure={command,message},afterPrepare:fn=>afterPrepare=fn};
}
test('coordinated install closes normal window and never calls raw official installation',async()=>{
 const f=fixture();await f.client.check();await f.client.download();await f.client.install();
 const close=f.calls.find(x=>x[0]==='plugin:window|close');assert.deepEqual(JSON.parse(JSON.stringify(close[1])),{label:'main'});assert(!f.calls.some(x=>x[0]==='plugin:updater|install'||x[0]==='plugin:process|exit'));assert.equal(f.app.inert,true);assert.equal(f.client.state().status,'closing-host');
});
test('owned invocation facade preserves check/download options and connects real RID metadata to prepare',async()=>{
 const f=fixture();f.client.installOfficialHook();const check={timeout:10000},download={rid:1,onEvent:'caller-channel',headers:[['test','value']]};
 await f.client.invoke('plugin:updater|check',check);await f.client.invoke('plugin:updater|download',download);await f.client.invoke('plugin:updater|install',{updateRid:1,bytesRid:2});
 assert.equal(f.calls[0][1],check);assert.equal(f.calls[1][1],download);assert.equal(f.calls.filter(x=>x[0]==='update.prepare').length,1);assert.equal(f.calls.find(x=>x[0]==='update.prepare')[1].version,'1.0.1');
});
test('official combined update uses native signature-checking download before prepared install',async()=>{
 const f=fixture();f.client.installOfficialHook();await f.client.invoke('plugin:updater|check',{});await f.client.invoke('plugin:updater|download_and_install',{rid:1,onEvent:'owned-channel'});
 assert.deepEqual(f.calls.map(c=>c[0]),['plugin:updater|check','plugin:updater|download','update.prepare','update.commit','plugin:window|close','plugin:resources|close']);
});
test('signature/download failure never prepares or invokes installer',async()=>{
 const f=fixture();f.client.installOfficialHook();await f.client.invoke('plugin:updater|check',{});f.fail('plugin:updater|download','signature mismatch');await assert.rejects(f.client.invoke('plugin:updater|download_and_install',{rid:1}),/signature/);assert(!f.calls.some(x=>x[0]==='update.prepare'||x[0]==='plugin:updater|install'));
});
test('uncaptured check or mismatched bytes requires a new official check/download',async()=>{
 const f=fixture();f.client.installOfficialHook();await assert.rejects(f.client.invoke('plugin:updater|install',{updateRid:1,bytesRid:2}),/重新/);
 await f.client.invoke('plugin:updater|check',{});await f.client.invoke('plugin:updater|download',{rid:44});await assert.rejects(f.client.invoke('plugin:updater|install',{updateRid:1,bytesRid:2}),/重新/);assert(!f.calls.some(x=>x[0]==='update.prepare'));
});
test('closing update resources invalidates the facade mapping',async()=>{
 const f=fixture();f.client.installOfficialHook();await f.client.invoke('plugin:updater|check',{});await f.client.invoke('plugin:updater|download',{rid:1});await f.client.invoke('plugin:resources|close',{rid:2});await assert.rejects(f.client.invoke('plugin:updater|install',{updateRid:1,bytesRid:2}),/重新/);
});
test('dirty or busy native state prevents coordinator handoff',async()=>{
 const f=fixture();await f.client.check();await f.client.download();f.stores.editor.hasUnsavedDocuments=true;await assert.rejects(f.client.install(),/保存/);assert(!f.calls.some(x=>x[0]==='update.prepare'));
});
test('dirty state recheck after wrapper release aborts native install',async()=>{
 const f=fixture();await f.client.check();await f.client.download();f.afterPrepare(()=>f.stores.runtimeTask.hasBlockingTasks=true);await assert.rejects(f.client.install(),/运行任务/);assert(!f.calls.some(x=>x[0]==='plugin:updater|install'));assert(f.calls.some(x=>x[0]==='update.abort'));assert.equal(f.app.inert,false);
});
test('unready coordinator never invokes install and restores editing',async()=>{
 const f=fixture();await f.client.check();await f.client.download();f.setAck({ready:false});await assert.rejects(f.client.install(),/就绪/);assert(!f.calls.some(x=>x[0]==='plugin:updater|install'));assert.equal(f.app.inert,false);
});
test('native invoke rejection aborts the helper without masking the error',async()=>{
 const f=fixture();await f.client.check();await f.client.download();f.fail('plugin:window|close','official error');await assert.rejects(f.client.install(),/official error/);assert(f.calls.some(x=>x[0]==='update.abort'));assert.equal(f.app.inert,false);
});
test('unvalidated native completion observer cannot start real update',async()=>{
 const c=new UpdateCoordinator({observerValidated:false});await assert.rejects(c.prepare({version:'1.0.1'}),/尚未通过/);assert.equal(c.pending,null);
});
test('same-name wrapper cannot pretend update handoff has been proven',async()=>{
 const c=new UpdateCoordinator({observerValidated:true,installMode:'same-name'});await assert.rejects(c.prepare({version:'1.0.1'}),/同名/);assert.equal(c.pending,null);
});
function coordinatorFixture({release=true,arm=true}={}){
 let child,id;const events=[];
 const c=new UpdateCoordinator({statePath:'/fake/config.json',stateDir:'/fake/state',hostPid:123,wrapperPid:122,installMode:'same-name',observerValidated:true,sameNameValidated:true,readyTimeoutMs:20,wrapperTimeoutMs:20,
  spawnHelper(exe,args,options){events.push(['spawn',exe,args,options]);id=args[args.indexOf('--id')+1];child=new EventEmitter();child.connected=true;child.send=m=>{events.push(['send',m]);queueMicrotask(()=>{if(m.type==='commit')child.emit('message',{type:'committed',id});else child.emit('exit',0);});};child.disconnect=()=>{events.push(['disconnect']);child.connected=false;};child.unref=()=>events.push(['unref']);child.kill=()=>{events.push(['kill']);child.emit('exit',1);};if(arm)queueMicrotask(()=>child.emit('message',{type:'armed',id}));return child;},
  releaseWrapper(){events.push(['release']);if(release)queueMicrotask(()=>child.emit('message',{type:'wrapper-exited',id}));},
 });return {c,events,child:()=>child,id:()=>id};
}
test('helper arms before wrapper release, confirms exit before allowing install, detaches without completion wait',async()=>{
 const f=coordinatorFixture();const ack=await f.c.prepare({version:'1.0.1'});assert.equal(ack.ready,true);assert.equal(f.events[0][3].detached,true);assert.equal(f.events[0][3].stdio[3],'ipc');assert.equal(f.events[1][0],'release');
 assert.equal(f.c.handoff(),false);await f.c.commit();assert(f.c.handoff());assert.deepEqual(f.events.slice(-2).map(e=>e[0]),['disconnect','unref']);await assert.rejects(f.c.abort(),/不能终止/);
});
test('still-running wrapper fails closed and cancels observer before native installer',async()=>{
 const f=coordinatorFixture({release:false});await assert.rejects(f.c.prepare({version:'1.0.1'}),/未退出/);assert(f.events.some(e=>e[0]==='send'&&e[1].type==='abort'));assert.equal(f.c.pending,null);
});
test('observer failure cannot release wrapper or start installer',async()=>{
 const f=coordinatorFixture({arm:false});await assert.rejects(f.c.prepare({version:'1.0.1'}),/启动超时/);assert(!f.events.some(e=>e[0]==='release'));assert.equal(f.c.pending,null);
});
test('concurrent prepare is rejected and abort resets pending',async()=>{
 const f=coordinatorFixture();await f.c.prepare({version:'1.0.1'});await assert.rejects(f.c.prepare({version:'1.0.2'}),/进行/);await f.c.abort();assert.equal(f.c.pending,null);
});
const record={version:'2.0',supportedHosts:{'2.0':'new-hash'},wrapperSha256:'wrapper',originalSha256:'old-host'};
for(const [label,observed,hash,expected] of [
 ['unknown official version',{state:'exited',exitCode:0},'unknown-host','official-unvalidated'],
 ['compatible official version',{state:'exited',exitCode:0},'new-hash','official-compatible-unmounted'],
 ['installer failed after replacing host',{state:'exited',exitCode:5},'unknown-host','host-changed-unverified'],
 ['observer missed installer',{state:'indeterminate'},'new-hash','host-changed-unverified'],
 ['unchanged wrapper',{state:'exited',exitCode:0},'wrapper','host-unchanged'],
 ['failed unchanged wrapper',{state:'exited',exitCode:2},'wrapper','installer-failed'],
 ['unreadable target',{state:'exited',exitCode:0},undefined,'indeterminate'],
])test(label+' is diagnostic only and never authorizes remount',()=>{
 const result=classifyOfficialUpdate(record,observed,hash);assert.equal(result.state,expected);assert.equal(result.automaticRemount,false);assert.equal(result.hostSha256,hash);assert(result.message);
});

test('install commit is persisted before handoff and cannot be aborted into a racing installer',async()=>{const f=coordinatorFixture();await f.c.prepare({version:'1.0.1'});assert.deepEqual(await f.c.commit(),{committed:true,id:f.id()});await assert.rejects(f.c.abort(),/不能终止/);assert(!f.events.some(e=>e[0]==='kill'));assert(f.c.handoff());});

for(const [committed,observed,expected] of [
 [false,undefined,false],[false,{state:'indeterminate'},false],
 [true,undefined,true],[true,{state:'observed',pid:123},true],
 [true,{state:'indeterminate',pid:123},true],[true,{state:'exited'},true],
 [true,{state:'exited',exitCode:0},false],[true,{state:'exited',exitCode:5},false],
])test(`update lock retention: committed=${committed}, outcome=${observed?.state||'none'}, retained=${expected}`,()=>assert.equal(shouldRetainUpdateLock(committed,observed),expected));

test('armed but uncommitted update does not detach on ordinary host closure',async()=>{const f=coordinatorFixture();await f.c.prepare({version:'1.0.1'});assert.equal(f.c.handoff(),false);await f.c.abort();assert.equal(f.c.pending,null);assert(!f.events.some(e=>e[0]==='send'&&e[1].type==='commit'));});

test('clean handoff exits owned host through native API without launching updater from dirty environment',async()=>{const f=fixture();f.setCommit({committed:true,exitHost:true});await f.client.check();await f.client.download();await f.client.install();assert(f.calls.some(x=>x[0]==='plugin:window|close'&&x[1].label==='main'));assert(!f.calls.some(x=>x[0]==='plugin:updater|install'));});
test('central cancellation covers owned facade before prepare or host exit',async()=>{const f=fixture();f.confirm(()=>false);f.client.installOfficialHook();await f.client.invoke('plugin:updater|check',{});await f.client.invoke('plugin:updater|download',{rid:1});await assert.rejects(f.client.invoke('plugin:updater|install',{updateRid:1,bytesRid:2}),/取消/);assert(!f.calls.some(x=>x[0]==='update.prepare'||x[0]==='plugin:process|exit'||x[0]==='plugin:updater|install'));assert.equal(f.alerts.length,0);});

for(const nativeShape of ['readonly','frozen'])test(nativeShape+' Tauri internals remain unchanged while facade and guard initialize',async()=>{
 const f=fixture({nativeShape});const descriptor=Object.getOwnPropertyDescriptor(f.internals,'invoke');
 assert.equal(f.internals.invoke,f.invoke);assert.deepEqual(descriptor,f.originalDescriptor);
 assert.equal(f.client.installOfficialHook().guarded,true);assert.equal(f.stores.appUpdate.subscriptionState().actions,1);assert.equal(f.stores.appUpdate.subscriptionState().state,1);
 await f.client.check();await f.client.download();await f.client.install();
 assert.equal(f.internals.invoke,f.invoke);assert.deepEqual(Object.getOwnPropertyDescriptor(f.internals,'invoke'),f.originalDescriptor);
 assert.equal((await f.client.status()).officialUiGuard.safe,true);
});
test('official store guard preserves checks and download while refusing install-ready transition',async()=>{
 const f=fixture({hook:false}),s=f.stores.appUpdate;f.context.WebVideoCraftInstallOfficialGuard({getStores:()=>f.stores});s.setChecking();s.setAvailableUpdate({version:'1.0.1'});s.setUpdating();
 // The pinned controller catches a rejected setDownloaded in its download try.
 try{await f.internals.invoke('plugin:updater|download',{rid:1});s.setDownloaded();}catch(error){s.setError('update-failed',error.message);}
 assert.equal(s.status,'error');assert.equal(s.isDownloaded,false);assert.match(s.lastError.message,/WebVideo/);assert.equal(f.alerts.length,1);
 assert(!f.calls.some(([c])=>c==='plugin:updater|install'||c==='update.prepare'));
 assert.deepEqual(s.subscriptionState().options.actions,[true]);assert.equal(s.subscriptionState().options.state[0].flush,'sync');assert.equal(s.subscriptionState().options.state[0].detached,true);
});
test('captured official actions still consult guard and repeated init adds no subscriptions',()=>{
 const stores={appUpdate:createAppUpdateStore({availableUpdate:{version:'1.0.1'}})},captured=stores.appUpdate.setDownloaded,context={};vm.runInNewContext(source,context);
 const guard=context.WebVideoCraftInstallOfficialGuard({getStores:()=>stores});assert.equal(context.WebVideoCraftInstallOfficialGuard({getStores:()=>stores}),guard);
 assert.throws(()=>captured(),/WebVideo/);assert.equal(stores.appUpdate.isDownloaded,false);assert.equal(stores.appUpdate.subscriptionState().actions,1);
});
for(const state of ['downloaded','installed','restarting'])test('already '+state+' attach is normalized but permanently marked ambiguous',async()=>{
 const f=fixture({initialStatus:state});assert.equal(f.stores.appUpdate.status,'available');assert.equal(f.client.installOfficialHook().state,'guarded-ambiguous-start');
 const result=await f.client.status();assert.equal(result.enabled,false);assert.equal(result.officialUiGuard.guarded,true);assert.equal(result.officialUiGuard.safe,false);
 await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/无法排除/);assert(!f.calls.some(([c])=>c==='update.prepare'||c==='plugin:updater|install'));
});
test('sync store subscription normalizes direct and patch install-ready writes',()=>{
 const f=fixture(),s=f.stores.appUpdate;s.setAvailableUpdate({version:'1.0.1'});
 s.status='downloaded';assert.equal(s.status,'available');assert.equal(s.isDownloaded,false);
 s.$patch({status:'installed'});assert.equal(s.status,'available');s.$patch(x=>x.status='restarting');assert.equal(s.status,'available');
 assert.throws(()=>s.setRestarting(),/WebVideo/);assert.throws(()=>s.setInstalled(),/WebVideo/);
});
test('failed guard initialization does not mutate frozen native API or pretend status enabled',async()=>{
 const f=fixture({nativeShape:'frozen'});await f.client.check();await f.client.download();f.stores.appUpdate=undefined;
 const result=await f.client.status();assert.equal(result.enabled,false);assert.equal(result.officialUiGuard.guarded,false);assert.equal(f.internals.invoke,f.invoke);
 await assert.rejects(f.client.install(),/官方/);assert(!f.calls.some(([c])=>c==='update.prepare'));
});
test('backend validation gate remains false even when UI guard is armed',async()=>{const f=fixture();f.setAck({ready:false});const result=await f.client.status();assert.equal(result.enabled,false);assert.equal(result.officialUiGuard.safe,true);});

test('store replacement during preparation aborts before commit or host exit',async()=>{
 const f=fixture();await f.client.check();await f.client.download();f.afterPrepare(()=>{f.stores.appUpdate=createAppUpdateStore();});
 await assert.rejects(f.client.install(),/官方/);assert(!f.calls.some(([c])=>c==='update.commit'||c==='plugin:process|exit'||c==='plugin:updater|install'));assert(f.calls.some(([c])=>c==='update.abort'));
});

const nativeInfo={version:'1.0.1',currentVersion:'1.0.0-beta.2'};
async function routed(f){
 for(let n=0;n<50&&f.context.WebVideoCraftInstallOfficialGuard({getStores:()=>f.stores}).status().routePending;n++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.context.WebVideoCraftInstallOfficialGuard({getStores:()=>f.stores}).status().routePending,false);
}
function nativeFinished(f){const s=f.stores.appUpdate;s.setAvailableUpdate({...nativeInfo});s.setUpdating();s.setDownloaded();return s;}
test('normal native download routes after its toast without extra native download or failure state',async()=>{
 const f=fixture({nativeShape:'frozen'}),s=nativeFinished(f);f.calls.push(['native-downloaded-toast']);
 assert.equal(s.status,'available');assert.equal(s.lastError,undefined);assert.equal(s.isDownloaded,false);
 await routed(f);
 assert.deepEqual(f.calls.map(row=>row[0]),['native-downloaded-toast','plugin:updater|check','update.prepare','update.commit','plugin:window|close','plugin:resources|close']);
 const prepared=f.calls.find(row=>row[0]==='update.prepare')[1];assert.equal(prepared.confirmNormalClose,true);assert.equal(prepared.currentVersion,nativeInfo.currentVersion);assert.equal(prepared.metadata.version,nativeInfo.version);
 assert.equal(f.calls.find(row=>row[0]==='update.commit')[1].confirmNormalClose,true);
 assert.equal(s.lastError,undefined);assert.equal(f.client.state().status,'closing-host');assert.equal(f.app.inert,true);assert.equal(f.client.state().busy,true);
});
test('duplicate native completion callbacks share one queued owned route',async()=>{
 const f=fixture();nativeFinished(f);f.stores.appUpdate.setUpdating();f.stores.appUpdate.setDownloaded();await routed(f);
 assert.equal(f.calls.filter(row=>row[0]==='update.prepare').length,1);
});
test('native signature failure does not produce a completion route',async()=>{
 const f=fixture();const s=f.stores.appUpdate;s.setAvailableUpdate({...nativeInfo});s.setUpdating();s.setError('update-failed','signature invalid');await Promise.resolve();
 assert.equal(f.calls.length,0);assert.equal(s.status,'error');
});
for(const check of [null,{rid:1,version:'1.0.2',currentVersion:nativeInfo.currentVersion},{rid:1,version:nativeInfo.version,currentVersion:'1.0.0-beta.1'}])test('native completed version cannot authorize a changed fresh official check '+JSON.stringify(check),async()=>{
 const f=fixture();f.setCheck(check);nativeFinished(f);await routed(f);assert(!f.calls.some(row=>row[0]==='update.prepare'||row[0]==='plugin:window|close'));assert.match(f.stores.appUpdate.lastError.message,/版本已变化/);
});
test('native routing validates current store identity and update before its queued callback',async()=>{
 const f=fixture();nativeFinished(f);f.stores.appUpdate.setAvailableUpdate({...nativeInfo,version:'1.0.2'});await routed(f);assert.equal(f.calls.length,0);
 const g=fixture();nativeFinished(g);g.stores.appUpdate=createAppUpdateStore();await new Promise(resolve=>setImmediate(resolve));assert.equal(g.calls.length,0);
});
test('native selected identity is rechecked after fresh-check and preparation awaits',async()=>{
 const f=fixture();let finish;f.setCheck(new Promise(resolve=>finish=resolve));const checking=f.client.nativeDownloaded(nativeInfo);
 f.stores.appUpdate.setAvailableUpdate({...nativeInfo,version:'1.0.2'});finish({rid:1,...nativeInfo,rawJson:{version:nativeInfo.version}});await assert.rejects(checking,/版本或页面已变化/);assert(!f.calls.some(row=>row[0]==='update.prepare'));
 const g=fixture();g.afterPrepare(()=>g.stores.appUpdate.setAvailableUpdate({...nativeInfo,version:'1.0.2'}));await assert.rejects(g.client.nativeDownloaded(nativeInfo),/版本或页面已变化/);assert(!g.calls.some(row=>row[0]==='update.commit'));assert(g.calls.some(row=>row[0]==='update.abort'));
});
test('declining native coordinated close keeps native details untouched and allows retry',async()=>{
 const f=fixture();let closes=0;f.stores.modal={modalStack:new Map([['UpdateDetailsModal',{isOpen:true}]]),close(){closes++;}};
 f.confirm(()=>false);nativeFinished(f);await routed(f);assert.equal(closes,0);assert.equal(f.stores.modal.modalStack.get('UpdateDetailsModal').isOpen,true);assert.equal(f.stores.appUpdate.lastError,undefined);assert.equal(f.app.inert,false);assert.equal(f.client.state().busy,false);assert(!f.calls.some(row=>row[0]==='update.prepare'));
});
test('confirmed route closes only exact official details and waits for real stack removal',async()=>{
 let f,confirmed=false;f=fixture({readLocalState:()=>({coverage:'known-work-only',hasUnsavedDocuments:false,hasBlockingTasks:f.stores.modal.modalStack.size>0})});
 const stack=new Map([['UpdateDetailsModal',{isOpen:true}]]),closed=[];
 f.stores.modal={modalStack:stack,close(key){assert.equal(confirmed,true);closed.push(key);stack.get(key).isOpen=false;setImmediate(()=>stack.delete(key));}};
 f.confirm(()=>{confirmed=true;return true;});await f.client.nativeDownloaded(nativeInfo);
 assert.deepEqual(closed,['UpdateDetailsModal']);assert.equal(stack.size,0);assert(f.calls.some(row=>row[0]==='plugin:window|close'));
});
test('other native modal remains a blocker after official details are closed',async()=>{
 let f;f=fixture({readLocalState:()=>({coverage:'known-work-only',hasUnsavedDocuments:false,hasBlockingTasks:f.stores.modal.modalStack.size>0})});
 const stack=new Map([['UpdateDetailsModal',{isOpen:true}],['ExportDialog',{isOpen:true}]]),closed=[];
 f.stores.modal={modalStack:stack,close(key){closed.push(key);stack.delete(key);}};
 await assert.rejects(f.client.nativeDownloaded(nativeInfo),/任务完成/);assert.deepEqual(closed,['UpdateDetailsModal']);assert(stack.has('ExportDialog'));assert(!f.calls.some(row=>row[0]==='update.prepare'));
});
test('confirmed native About and details displays close through store actions while task modal stays open',async()=>{
 let f,confirmed=false;f=fixture({readLocalState:()=>({coverage:'known-work-only',hasUnsavedDocuments:false,hasBlockingTasks:f.stores.modal.modalStack.size>0})});
 const stack=new Map([['AboutModal',{isOpen:true}],['UpdateDetailsModal',{isOpen:true}],['ExportDialog',{isOpen:true}]]),closed=[];
 f.stores.modal={modalStack:stack,close(key){assert(confirmed);closed.push(key);stack.get(key).isOpen=false;setImmediate(()=>stack.delete(key));}};
 f.confirm(()=>{confirmed=true;return true;});await assert.rejects(f.client.nativeDownloaded(nativeInfo),/任务完成/);
 assert.deepEqual(closed,['AboutModal','UpdateDetailsModal']);assert.deepEqual([...stack.keys()],['ExportDialog']);assert.equal(stack.get('ExportDialog').isOpen,true);assert(!f.calls.some(row=>row[0]==='update.prepare'));
});
test('declining coordinated close preserves both About and details displays',async()=>{
 const f=fixture(),stack=new Map([['AboutModal',{isOpen:true}],['UpdateDetailsModal',{isOpen:true}]]);let closed=0;
 f.stores.modal={modalStack:stack,close(){closed++;}};f.confirm(()=>false);await assert.rejects(f.client.nativeDownloaded(nativeInfo),error=>error.cancelled===true);
 assert.equal(closed,0);assert.equal(stack.size,2);assert([...stack.values()].every(modal=>modal.isOpen));assert(!f.calls.some(row=>row[0]==='update.prepare'));
});
test('strict pinned local reader admits lazy-task absence and does not create a store',async()=>{
 const f=fixture({readLocalState:()=>({coverage:'known-work-only',hasUnsavedDocuments:false,hasBlockingTasks:false})});delete f.stores.runtimeTask;
 await f.client.nativeDownloaded(nativeInfo);assert(!Object.hasOwn(f.stores,'runtimeTask'));assert(f.calls.some(row=>row[0]==='update.prepare'));
});
for(const state of [null,{},Promise.resolve({coverage:'known-work-only',hasUnsavedDocuments:false,hasBlockingTasks:false}),{coverage:'unknown',hasUnsavedDocuments:false,hasBlockingTasks:false},{coverage:'known-work-only',hasUnsavedDocuments:false,hasBlockingTasks:'false'}])test('malformed local native-route state fails closed '+String(state?.coverage),async()=>{
 const f=fixture({readLocalState:()=>state});await assert.rejects(f.client.nativeDownloaded(nativeInfo),/状态/);assert(!f.calls.some(row=>row[0]==='update.prepare'));
});
test('a new local blocker after commit cancels without closing the host',async()=>{
 const f=fixture();f.afterCommit(()=>f.stores.editor.hasUnsavedDocuments=true);await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/关闭前/);
 assert(!f.calls.some(row=>row[0]==='plugin:window|close'));assert(f.calls.some(row=>row[0]==='update.abort'));assert.equal(f.app.inert,false);
});
test('normal-close watchdog keeps editing locked until definite not-started receipt',async()=>{
 const f=fixture();await f.client.check();await f.client.download();assert.deepEqual(JSON.parse(JSON.stringify(await f.client.install())),{closingHost:true,installed:false});
 let finish;f.setAbort(new Promise(resolve=>finish=resolve));const stopping=f.watchdogs[0]();await Promise.resolve();assert.equal(f.app.inert,true);assert.equal(f.client.state().busy,true);
 finish({notStarted:true,cancelled:true,state:'not-started'});await stopping;assert.equal(f.app.inert,false);assert.equal(f.client.state().busy,false);assert.equal(f.client.state().status,'not-started');
});
test('uncertain post-commit cancellation preserves lock and never claims installation did not start',async()=>{
 const f=fixture();f.setAbort({notStarted:false,state:'indeterminate',message:'receipt unavailable'});await f.client.nativeDownloaded(nativeInfo);await f.watchdogs[0]();
 assert.equal(f.app.inert,true);assert.equal(f.client.state().busy,true);assert.equal(f.client.state().status,'indeterminate');assert(f.alerts.some(text=>text.includes('无法确认官方安装已停止')));assert(!f.alerts.some(text=>text.includes('尚未开始')));
});
test('normal-close rejection waits for cancellation and preserves uncertainty on RPC failure',async()=>{
 const f=fixture();f.fail('plugin:window|close','close refused');f.setAbort(Promise.resolve().then(()=>{throw Error('lost receipt');}));
 await assert.rejects(f.client.nativeDownloaded(nativeInfo),error=>error.indeterminate===true&&/无法确认/.test(error.message));assert.equal(f.app.inert,true);assert.equal(f.client.state().status,'indeterminate');
});
test('definite already-finished installer result is distinct from not-started and indeterminate',async()=>{
 const f=fixture();f.setAbort({notStarted:false,installationStarted:true,finished:true,exitCode:5,state:'installer-failed'});await f.client.nativeDownloaded(nativeInfo);await f.watchdogs[0]();
 assert.equal(f.client.state().status,'installer-finished');assert(f.alerts.some(text=>text.includes('退出码 5')));assert(!f.alerts.some(text=>text.includes('尚未开始')));
});
test('missing explicit confirmation cannot close details, prepare, or close Craft',async()=>{
 const f=fixture();f.context.confirm=undefined;await assert.rejects(f.client.nativeDownloaded(nativeInfo),/需要确认/);assert(!f.calls.some(row=>row[0]==='update.prepare'||row[0]==='plugin:window|close'));
});
test('client IIFE reevaluation reuses detached guard and only replaces an idle owned route',async()=>{
 const f=fixture();let confirmations=0;f.confirm(()=>{confirmations++;return false;});
 const registry=f.context.__WebVideoCraftOfficialGuardRegistry;
 vm.runInNewContext(source,f.context);
 const second=f.context.WebVideoCraftCreateUpdates({getStores:()=>f.stores,internals:f.internals,confirmInstall:options=>f.context.confirm(options.message),rpc:async()=>{throw Error('cancelled route');}});second.installOfficialHook();
 assert.equal(f.context.__WebVideoCraftOfficialGuardRegistry,registry);assert.equal(f.stores.appUpdate.subscriptionState().actions,1);assert.equal(f.stores.appUpdate.subscriptionState().state,1);
 nativeFinished(f);await routed(f);assert.equal(confirmations,1);assert.equal(second.state().busy,false);
});
test('reevaluation cannot steal an already-queued official route',async()=>{
 const f=fixture();let confirmations=0;f.confirm(()=>{confirmations++;return false;});nativeFinished(f);
 vm.runInNewContext(source,f.context);const second=f.context.WebVideoCraftCreateUpdates({getStores:()=>f.stores,internals:f.internals,confirmInstall:options=>f.context.confirm(options.message),rpc:async()=>{throw Error('wrong route');}});
 assert.throws(()=>second.installOfficialHook(),/协调已在进行/);await routed(f);assert.equal(confirmations,1);assert.equal(f.stores.appUpdate.subscriptionState().actions,1);
});
test('invalid preexisting document guard registry fails closed without touching native APIs',()=>{
 for(const value of [undefined,null,{},Object.freeze({version:1,guards:{}})]){
  const context={__WebVideoCraftOfficialGuardRegistry:value};vm.runInNewContext(source,context);
  assert.throws(()=>context.WebVideoCraftInstallOfficialGuard({getStores:()=>({appUpdate:createAppUpdateStore()})}),/注册表无效/);
 }
});

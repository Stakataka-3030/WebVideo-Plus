// Inert, exact assembled production payload. No native programs, installer,
// download, network, registry access, or production user data is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs/promises';
import {buildBrowserPayload} from '../session/browser-payload.mjs';
import {makeDocument,Node,nodes} from './ui-dom.mjs';
import {createAppUpdateStore} from './update-host-fixture.mjs';

const info={version:'1.0.1',currentVersion:'1.0.0-beta.2'};
const payload=await buildBrowserPayload(fileURLToPath(new URL('..',import.meta.url)),{
 token:'inert-async-confirmation',bindingName:'testBinding',
 verifiedHostProfile:{version:'1.0.0-beta.2',sha256:'3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d'},
});
const drain=async()=>{for(let n=0;n<60;n++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture({realDialog=false,dialogUnavailable=false,dialogThrows=false,dialogCloseDeferred=false}={}){
 const dom=makeDocument(),{document,app}=dom;app.inert=false;
 const createElement=document.createElement;
 document.createElement=tag=>{
  const node=createElement(tag);
  const emit=node.emit.bind(node);node.emit=(type,extra={})=>emit(type,{stopPropagation(){},...extra});
  if(tag==='dialog'&&!dialogUnavailable){
   node.showModal=()=>{if(dialogThrows)throw Error('inert showModal failure');node.open=true;};
   node.close=()=>{node.open=false;if(!dialogCloseDeferred)void node.emit('close');};
  }
  return node;
 };
 const appUpdate=createAppUpdateStore({availableUpdate:{...info}}),closed=[],calls=[],alerts=[],confirmations=[],pending=deferred();
 const modal={modalStack:new Map([['AboutModal',{isOpen:true}],['UpdateDetailsModal',{isOpen:true}]]),close(key){closed.push(key);modal.modalStack.delete(key);}};
 const pinia={_s:new Map([['app-update',appUpdate],['editor',{hasUnsavedDocuments:false}],['modal',modal],['resource',{activeProgress:new Map(),games:[],engines:[],templates:[]}]])};
 app.__vue_app__={config:{globalProperties:{$pinia:pinia}}};
 const listeners=new Map(),listenerOptions=new Map(),timers=new Map();let nextTimer=0,nextRid=0;
 const native=Object.freeze({
  async invoke(command,args){
   calls.push({kind:'native',command,args});
   if(command==='plugin:updater|check')return {rid:++nextRid,...info,rawJson:{version:info.version}};
   if(command==='plugin:updater|download')return 100+args.rid;
   if(command==='plugin:resources|close'||command==='plugin:window|close')return;
   throw Error('Unexpected native invocation in inert fixture: '+command);
  },transformCallback:()=>17,unregisterCallback(){},
 });
 const context=vm.createContext({document,console,URL,TextEncoder,TextDecoder,crypto:webcrypto,
  location:{href:'tauri://localhost/'},
  setTimeout:(callback,ms)=>{const id=++nextTimer;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id),
  setInterval:()=>1,clearInterval(){},
  addEventListener(type,fn,options){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);listenerOptions.set(fn,options);},
  removeEventListener(type,fn,options){if(!!listenerOptions.get(fn)?.capture===!!options?.capture){listeners.get(type)?.delete(fn);listenerOptions.delete(fn);}},
  __TAURI_INTERNALS__:native,confirm(){throw Error('window.confirm and native dialog IPC are forbidden');},alert:message=>alerts.push(message),
 });
 context.window=context;context.self=context;
 context.testBinding=encoded=>{
  const request=JSON.parse(encoded);calls.push({kind:'rpc',command:request.method,args:request.params});
  const value=request.method==='update.prepare'?{ready:true}:request.method==='update.commit'?{committed:true,exitHost:true}:request.method==='update.abort'?{notStarted:true,cancelled:true}:undefined;
  if(!value)throw Error('Unexpected RPC in inert fixture: '+request.method);
  context.__WebVideoCraftReply({id:request.id,ok:true,value});
 };
 const result=vm.runInContext(payload,context);
 assert.equal(result.mounted,true);assert.equal(result.diagnostics.length,0);
 const initialListenerCount=[...listeners.values()].reduce((count,set)=>count+set.size,0);
 if(!realDialog)context.WebVideoCraftConfirmOfficialUpdate=({message})=>{confirmations.push(message);return pending.promise;};
 return {...dom,context,appUpdate,pinia,modal,closed,calls,alerts,confirmations,pending,native,result,timers,
  client:context.WebVideoCraftUpdates,
  listenerCount:()=>[...listeners.values()].reduce((count,set)=>count+set.size,0)-initialListenerCount,
  dispatch:type=>{for(const fn of [...(listeners.get(type)||[])])fn({type});},
  capture:event=>{for(const fn of [...(listeners.get(event.type)||[])])if(listenerOptions.get(fn)?.capture===true)fn(event);},
 };
}
function track(promise){const outcome={settled:false};outcome.promise=promise.then(value=>{outcome.settled=true;outcome.value=value;},error=>{outcome.settled=true;outcome.error=error;});return outcome;}
async function start(f,route='native'){
 if(route==='native')return track(f.client.nativeDownloaded({...info}));
 if(route==='own') {await f.client.check();await f.client.download();return track(f.client.install());}
 if(route==='facade') {const checked=await f.client.invoke('plugin:updater|check',{});const bytes=await f.client.invoke('plugin:updater|download',{rid:checked.rid});return track(f.client.invoke('plugin:updater|install',{updateRid:checked.rid,bytesRid:bytes}));}
 if(route==='combined') {const checked=await f.client.invoke('plugin:updater|check',{});return track(f.client.invoke('plugin:updater|download_and_install',{rid:checked.rid,onEvent:'inert-channel'}));}
 throw Error('Unknown route '+route);
}
function untouched(f){
 assert.deepEqual(f.closed,[],'unanswered/cancelled/stale confirmation must not close native details');
 assert.equal(f.app.inert,false,'unanswered/cancelled/stale confirmation must not lock editing');
 assert.equal(f.calls.some(call=>call.kind==='rpc'),false,'unanswered/cancelled/stale confirmation must not reach any backend RPC');
 assert.equal(f.calls.some(call=>call.command==='plugin:window|close'||call.command==='plugin:updater|install'||call.command==='plugin:process|exit'),false,'unanswered/cancelled/stale confirmation must not close host or invoke raw installer');
 assert.equal(f.modal.modalStack.size,2);
 assert.equal(f.context.__TAURI_INTERNALS__,f.native,'read-only native object remains unchanged');
}
function exactlyOneHandoff(f){
 assert.deepEqual(f.closed,['AboutModal','UpdateDetailsModal']);assert.equal(f.app.inert,true);
 assert.deepEqual(f.calls.filter(call=>call.kind==='rpc'||call.command==='plugin:window|close').map(call=>call.command),['update.prepare','update.commit','plugin:window|close']);
 assert.equal(f.calls.find(call=>call.command==='update.prepare').args.version,info.version);
 assert.equal(f.calls.find(call=>call.command==='update.prepare').args.confirmNormalClose,true);
 assert.equal(f.calls.some(call=>call.command==='plugin:updater|install'||call.command==='plugin:process|exit'),false);
}

for(const route of ['native','own','facade','combined'])test('exact payload '+route+' waits for deferred literal true before every handoff side effect',async()=>{
 const f=fixture(),outcome=await start(f,route);await drain();
 assert.equal(f.confirmations.length,1);assert.equal(outcome.settled,false);assert.equal(f.client.state().busy,true);untouched(f);
 f.pending.resolve(true);await outcome.promise;assert.equal(outcome.error,undefined);assert.equal(outcome.value.closingHost,true);exactlyOneHandoff(f);
});
for(const [label,value] of [['false',false],['undefined',undefined],['null',null],['zero',0],['one',1],['string true','true'],['object',{}],['boxed true',new Boolean(true)]])test('exact payload deferred '+label+' is cancellation without modal/host/RPC effects',async()=>{
 const f=fixture(),outcome=await start(f);await drain();untouched(f);f.pending.resolve(value);await outcome.promise;
 assert.equal(outcome.error?.cancelled,true);assert.equal(f.client.state().busy,false);untouched(f);assert.equal(f.alerts.length,0);
});
for(const mode of ['rejection','throw'])test('exact payload confirmation '+mode+' reports actual failure and fails closed',async()=>{
 const f=fixture();if(mode==='throw')f.context.WebVideoCraftConfirmOfficialUpdate=()=>{throw Error('inert dialog unavailable');};
 const outcome=await start(f);await drain();untouched(f);if(mode==='rejection')f.pending.reject(Error('inert dialog rejected'));await outcome.promise;
 assert.match(outcome.error?.message,/inert dialog/);assert.notEqual(outcome.error?.cancelled,true);assert.equal(f.client.state().busy,false);untouched(f);assert.equal(f.alerts.length,0);
});
for(const value of [false,0,1,'true',null,undefined,{},new Boolean(true)])test('exact payload synchronous non-true '+String(value)+' also cancels',async()=>{
 const f=fixture();f.context.WebVideoCraftConfirmOfficialUpdate=()=>value;const outcome=await start(f);await outcome.promise;assert.equal(outcome.error?.cancelled,true);untouched(f);
});
test('exact payload retains synchronous true compatibility',async()=>{const f=fixture();f.context.WebVideoCraftConfirmOfficialUpdate=()=>true;const outcome=await start(f);await outcome.promise;assert.equal(outcome.error,undefined);exactlyOneHandoff(f);});

test('exact payload double-click and reinjection keep one pending confirmation and one handoff',async()=>{
 const f=fixture(),outcome=await start(f);await drain();
 await assert.rejects(f.client.nativeDownloaded({...info}),/进行中/);await assert.rejects(f.client.check(),/进行中/);
 const pendingSubscriptions=f.appUpdate.subscriptionState();
 assert.equal(vm.runInContext(payload,f.context),f.result);assert.equal(f.context.WebVideoCraftUpdates,f.client);
 assert.equal(f.appUpdate.subscriptionState().actions,1);assert.equal(f.appUpdate.subscriptionState().state,pendingSubscriptions.state);
 assert.equal(nodes(f.body).filter(node=>node.dataset.webvideoCraft==='tools').length,1);
 assert.equal(f.confirmations.length,1);untouched(f);f.pending.resolve(true);await outcome.promise;assert.equal(outcome.error,undefined);exactlyOneHandoff(f);
});
test('exact payload guarded native completion duplicates share the same deferred confirmation',async()=>{
 const f=fixture();f.appUpdate.setUpdating();f.appUpdate.setDownloaded();await drain();
 assert.equal(f.confirmations.length,1);untouched(f);assert.equal(f.appUpdate.isDownloaded,false);
 f.appUpdate.setUpdating();f.appUpdate.setDownloaded();await drain();assert.equal(f.confirmations.length,1);untouched(f);
 f.pending.resolve(false);await drain();assert.equal(f.client.state().busy,false);assert.equal(f.appUpdate.lastError,undefined);assert.equal(f.alerts.length,0);untouched(f);
});
test('exact payload declined confirmation permits a fresh prompt and does not carry old approval forward',async()=>{
 const f=fixture(),first=await start(f);await drain();f.pending.resolve(false);await first.promise;untouched(f);
 const next=deferred();f.context.WebVideoCraftConfirmOfficialUpdate=()=>{f.confirmations.push('retry');return next.promise;};
 const second=await start(f);await drain();assert.equal(second.settled,false);assert.equal(f.confirmations.length,2);untouched(f);
 next.resolve(true);await second.promise;assert.equal(second.error,undefined);exactlyOneHandoff(f);
});

const staleChanges={
 'selected version':f=>f.appUpdate.setAvailableUpdate({...info,version:'1.0.2'}),
 'selected current version':f=>f.appUpdate.setAvailableUpdate({...info,currentVersion:'1.0.0-beta.1'}),
 'selected update removed':f=>f.appUpdate.setUpToDate(),
 'app-update store':f=>f.pinia._s.set('app-update',createAppUpdateStore({availableUpdate:{...info}})),
 'Pinia identity':f=>{f.app.__vue_app__.config.globalProperties.$pinia={_s:new Map(f.pinia._s)};},
 'app element':f=>{const next=new Node('div');next.setAttribute('id','app');next.__vue_app__=f.app.__vue_app__;f.app.remove();f.body.append(next);},
 'document identity':f=>{f.context.document={...f.document};},
 'pagehide':f=>f.dispatch('pagehide'),
};
for(const [label,change] of Object.entries(staleChanges))test('exact payload late true cannot act after pending '+label+' change',async()=>{
 const f=fixture(),outcome=await start(f);await drain();untouched(f);change(f);f.pending.resolve(true);await outcome.promise;
 assert(outcome.error,'stale approval must reject');untouched(f);assert.equal(f.client.state().busy,false);
});
for(const [label,change] of Object.entries(staleChanges).filter(([label])=>!label.startsWith('selected')))test('exact payload own install late true cannot act after pending '+label+' change',async()=>{
 const f=fixture(),outcome=await start(f,'own');await drain();untouched(f);change(f);f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);
});
test('exact payload newly dirty state during native dialog prevents preparation after approval',async()=>{
 const f=fixture(),outcome=await start(f);await drain();f.pinia._s.get('editor').hasUnsavedDocuments=true;f.pending.resolve(true);await outcome.promise;
 assert(outcome.error);assert.equal(f.calls.some(call=>call.kind==='rpc'),false);assert.equal(f.calls.some(call=>call.command==='plugin:window|close'),false);assert.equal(f.app.inert,false);
});

for(const route of ['own','facade','combined'])test('exact payload '+route+' resource invalidation during confirmation discards late approval',async()=>{
 const f=fixture(),outcome=await start(f,route);await drain();untouched(f);
 await f.client.invoke('plugin:resources|close',{rid:101});f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);
});
for(const key of ['version','currentVersion'])test('exact payload observed '+key+' change and restoration cannot resurrect old confirmation',async()=>{
 const f=fixture(),outcome=await start(f);await drain();untouched(f);
 f.appUpdate.setAvailableUpdate({...info,[key]:'changed-version'});f.appUpdate.setAvailableUpdate({...info});
 f.pending.resolve(true);await outcome.promise;assert(outcome.error,'changed-and-restored selection needs a new confirmation');untouched(f);
});
for(const key of ['editor','modal','workspace'])test('exact payload pending '+key+' store replacement invalidates late approval',async()=>{
 const f=fixture();if(key==='workspace')f.pinia._s.set(key,{currentGame:{id:'before',path:'C:/before'}});
 const outcome=await start(f);await drain();untouched(f);
 f.pinia._s.set(key,key==='editor'?{hasUnsavedDocuments:false}:key==='modal'?{...f.modal}:{currentGame:{id:'before',path:'C:/before'}});
 f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);
});
for(const key of ['id','path'])test('exact payload project '+key+' change while pending invalidates late approval',async()=>{
 const f=fixture(),workspace={currentGame:{id:'before',path:'C:/before'}};f.pinia._s.set('workspace',workspace);
 const outcome=await start(f);await drain();untouched(f);workspace.currentGame[key]='after';f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);
});
for(const key of ['WebVideoCraftUpdates','WebVideoCraftBridge'])test('exact payload replacing '+key+' while pending makes original answer inert',async()=>{
 const f=fixture(),outcome=await start(f);await drain();untouched(f);f.context[key]={replacement:true};f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);
});
test('exact payload beforeunload invalidates a late approval without closing details',async()=>{
 const f=fixture(),outcome=await start(f);await drain();untouched(f);f.dispatch('beforeunload');f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);
});
test('exact payload forced bootstrap retry cannot accept the previous client dialog answer',async()=>{
 const f=fixture(),outcome=await start(f);await drain();untouched(f);vm.runInContext('window.WebVideoCraftBootstrap=undefined',f.context);
 vm.runInContext(payload,f.context);assert.notEqual(f.context.WebVideoCraftUpdates,f.client);
 f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);
 assert.equal(f.appUpdate.subscriptionState().actions,1,'forced bootstrap must not duplicate official action protection');
 assert.equal(f.appUpdate.subscriptionState().state,1,'temporary confirmation subscription must be removed');
});

const dialogOf=f=>f.document.querySelector('[data-webvideo-craft="official-update-confirmation"]');
const cancelOf=dialog=>dialog.querySelector('[data-webvideo-craft="official-update-cancel"]');
const installOf=dialog=>dialog.querySelector('[data-webvideo-craft="official-update-install"]');
for(const route of ['native','own','facade','combined'])test('exact payload real owned DOM dialog '+route+' waits for explicit Install click, never native confirm',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f,route);await drain();const dialog=dialogOf(f);
 assert(dialog);assert.equal(dialog.open,true);assert.equal(f.document.activeElement,cancelOf(dialog),'Cancel receives initial focus');
 assert.match(dialog.textContent,/1\.0\.1/);assert.match(dialog.textContent,/正常关闭 Craft/);assert.match(dialog.textContent,/签名/);
 assert.equal(outcome.settled,false);untouched(f);await installOf(dialog).click();await outcome.promise;
 assert.equal(outcome.error,undefined);exactlyOneHandoff(f);assert.equal(dialogOf(f),null);assert.equal(f.appUpdate.subscriptionState().state,1);assert.equal(f.listenerCount(),0);
});
for(const action of ['Cancel','Escape','window close','pagehide','beforeunload'])test('exact payload real owned DOM '+action+' cancels without host/modal/RPC changes',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f);assert(dialog);untouched(f);
 if(action==='Cancel')await cancelOf(dialog).click();else if(action==='Escape')await dialog.emit('cancel');else if(action==='window close')dialog.close();else f.dispatch(action);
 await outcome.promise;assert.equal(outcome.error?.cancelled,true);untouched(f);assert.equal(dialogOf(f),null);assert.equal(f.appUpdate.subscriptionState().state,1);assert.equal(f.listenerCount(),0);
});
for(const [label,change] of Object.entries(staleChanges))test('exact payload real owned dialog discards Install click after '+label+' changes',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f);assert(dialog);untouched(f);
 change(f);await installOf(dialog).click();await outcome.promise;assert(outcome.error);untouched(f);assert.equal(dialog.isConnected,false);
});
for(const options of [{dialogUnavailable:true},{dialogThrows:true}])test('exact payload owned dialog capability failure remains closed '+JSON.stringify(options),async()=>{
 const f=fixture({realDialog:true,...options}),outcome=await start(f);await outcome.promise;assert(outcome.error);untouched(f);assert.equal(dialogOf(f),null);assert.equal(f.client.state().busy,false);assert.equal(f.appUpdate.subscriptionState().state,1);
});
test('owned DOM confirmation registry survives source reevaluation without sharing approval with duplicate requests',async()=>{
 const f=fixture({realDialog:true}),request={version:info.version,message:'Explicit inert test message'};
 const first=f.context.WebVideoCraftConfirmOfficialUpdate(request),dialog=dialogOf(f);assert(dialog);
 vm.runInContext(await fs.readFile(new URL('../update/confirmation.js',import.meta.url),'utf8'),f.context);
 const original=track(first),repeated=f.context.WebVideoCraftConfirmOfficialUpdate(request);assert.notEqual(repeated,first);assert.equal(await repeated,false);assert.equal(original.settled,false);
 assert.equal(await f.context.WebVideoCraftConfirmOfficialUpdate({...request,version:'1.0.2'}),false);
 assert.equal(f.document.querySelectorAll('[data-webvideo-craft="official-update-confirmation"]').length,1);
 await installOf(dialog).click();assert.equal(await first,true);assert.equal(dialogOf(f),null);untouched(f);
});
test('owned DOM removed old Install button cannot approve a new request',async()=>{
 const f=fixture({realDialog:true}),request={version:info.version,message:'Explicit inert test message'};
 const first=f.context.WebVideoCraftConfirmOfficialUpdate(request),old=dialogOf(f),oldInstall=installOf(old);await cancelOf(old).click();assert.equal(await first,false);
 const next=track(f.context.WebVideoCraftConfirmOfficialUpdate({...request,version:'1.0.2'})),current=dialogOf(f);assert.notEqual(current,old);
 await oldInstall.click();await drain();assert.equal(next.settled,false);assert.equal(current.open,true);untouched(f);
 await installOf(current).click();await next.promise;assert.equal(next.value,true);assert.equal(dialogOf(f),null);
});
test('owned DOM detached dialog cannot produce approval',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f);dialog.remove();await installOf(dialog).click();await outcome.promise;assert.equal(outcome.error?.cancelled,true);untouched(f);
});

test('exact payload observed project change and restoration cannot revive old approval',async()=>{
 const f=fixture(),subscribers=new Set();let currentGame={id:'before',path:'C:/before'};
 const workspace={$subscribe(callback){subscribers.add(callback);return()=>subscribers.delete(callback);}};
 Object.defineProperty(workspace,'currentGame',{get:()=>currentGame,set:game=>{currentGame=game;for(const callback of subscribers)callback();}});
 f.pinia._s.set('workspace',workspace);const outcome=await start(f);await drain();assert.equal(subscribers.size,1);untouched(f);
 workspace.currentGame={id:'after',path:'C:/after'};workspace.currentGame={id:'before',path:'C:/before'};
 f.pending.resolve(true);await outcome.promise;assert(outcome.error);untouched(f);assert.equal(subscribers.size,0);assert.equal(f.listenerCount(),0);
});

test('owned DOM close-before-queued-close-event cannot accept an immediate old Install click',async()=>{
 const f=fixture({realDialog:true,dialogCloseDeferred:true}),outcome=await start(f);await drain();const dialog=dialogOf(f),install=installOf(dialog);
 dialog.close();assert.equal(dialog.open,false);assert.equal(dialog.isConnected,true);await install.click();await outcome.promise;assert.equal(outcome.error?.cancelled,true);untouched(f);
 // The delayed native close event on an old element cannot dismiss its replacement.
 const next=track(f.context.WebVideoCraftConfirmOfficialUpdate({version:'1.0.2',message:'Replacement prompt'})),replacement=dialogOf(f);
 await dialog.emit('close');await drain();assert.equal(next.settled,false);assert.equal(replacement.open,true);
 await cancelOf(replacement).click();await next.promise;assert.equal(next.value,false);assert.equal(f.listenerCount(),0);
});
test('owned DOM removed Install button cannot authorize its still-open dialog',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f),install=installOf(dialog);install.remove();await install.click();await outcome.promise;
 assert.equal(outcome.error?.cancelled,true);untouched(f);assert.equal(dialogOf(f),null);assert.equal(f.listenerCount(),0);
});
test('owned DOM Install button moved outside its dialog cannot authorize it',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f),install=installOf(dialog);f.body.append(install);await install.click();await outcome.promise;
 assert.equal(outcome.error?.cancelled,true);untouched(f);assert.equal(dialogOf(f),null);assert.equal(f.listenerCount(),0);
});

// Bubble through a precomputed path, matching DOM propagation even if a click
// listener removes the dialog during dispatch. Underlying layer listeners must
// remain unreachable; stopping on the removed ancestor would be too late.
async function bubbleOwnedEvent(target,type,extra={}){
 const path=[];for(let node=target;node;node=node.parentNode)path.push(node);
 const event={target,key:undefined,defaultPrevented:false,propagationStopped:false,
  preventDefault(){event.defaultPrevented=true;},stopPropagation(){event.propagationStopped=true;},...extra};
 for(const node of path){await node.emit(type,event);if(event.propagationStopped)break;}
 return event;
}
for(const type of ['pointerdown','focusin','click'])test('owned DOM '+type+' cannot escape to underlying native modal layer',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f),explanation=dialog.querySelector('p');let outside=0;
 f.body.style.pointerEvents='none';f.body.addEventListener(type,()=>{outside++;f.modal.close('UpdateDetailsModal');});
 assert.match(dialog.style.cssText,/(?:^|;)pointer-events:auto(?:;|$)/,'dialog overrides inherited native modal pointer lock');
 const event=await bubbleOwnedEvent(explanation,type);assert.equal(event.propagationStopped,true);assert.equal(event.defaultPrevented,false);assert.equal(outside,0);assert.equal(outcome.settled,false);untouched(f);
 await cancelOf(dialog).click();await outcome.promise;untouched(f);assert.equal(f.body.style.pointerEvents,'none','owned dialog never changes native body policy');
});
for(const approved of [false,true])test('owned DOM '+(approved?'Install':'Cancel')+' stops click before teardown removes containment listeners',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f),button=approved?installOf(dialog):cancelOf(dialog);let outside=0;
 f.body.addEventListener('click',()=>{outside++;});
 const event=await bubbleOwnedEvent(button,'click');await outcome.promise;assert.equal(event.propagationStopped,true);assert.equal(outside,0);assert.equal(dialog.isConnected,false);
 if(approved){assert.equal(outcome.error,undefined);exactlyOneHandoff(f);}else{assert.equal(outcome.error?.cancelled,true);untouched(f);}
});
test('owned DOM Escape stops native layer key handler and closes only its own dialog',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f);let underlyingEscape=0;
 f.body.addEventListener('keydown',event=>{if(event.key==='Escape'){underlyingEscape++;f.modal.close('UpdateDetailsModal');}});
 const event=await bubbleOwnedEvent(cancelOf(dialog),'keydown',{key:'Escape'});await outcome.promise;
 assert.equal(event.defaultPrevented,true);assert.equal(event.propagationStopped,true);assert.equal(underlyingEscape,0);assert.equal(outcome.error?.cancelled,true);assert.equal(dialogOf(f),null);untouched(f);
});
test('owned DOM native cancel event cannot dismiss underlying native details',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f);let outside=0;f.body.addEventListener('cancel',()=>outside++);
 const event=await bubbleOwnedEvent(dialog,'cancel');await outcome.promise;assert.equal(event.defaultPrevented,true);assert.equal(event.propagationStopped,true);assert.equal(outside,0);untouched(f);
});

function capturedKeyEvent(target,key){const event={type:'keydown',target,key,defaultPrevented:false,propagationStopped:false,preventDefault(){event.defaultPrevented=true;},stopPropagation(){event.propagationStopped=true;}};return event;}
test('owned DOM window capture handles Escape before underlying document capture listener',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f),event=capturedKeyEvent(cancelOf(dialog),'Escape');let nativeDocumentCapture=0;
 f.capture(event);if(!event.propagationStopped){nativeDocumentCapture++;f.modal.close('UpdateDetailsModal');}
 await outcome.promise;assert.equal(event.defaultPrevented,true);assert.equal(event.propagationStopped,true);assert.equal(nativeDocumentCapture,0);assert.equal(outcome.error?.cancelled,true);untouched(f);assert.equal(f.listenerCount(),0);
});
test('owned DOM window capture handles body-targeted Escape only while its focus remains inside',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const event=capturedKeyEvent(f.body,'Escape');assert.equal(f.document.activeElement,cancelOf(dialogOf(f)));
 f.capture(event);await outcome.promise;assert.equal(event.defaultPrevented,true);assert.equal(event.propagationStopped,true);assert.equal(outcome.error?.cancelled,true);untouched(f);assert.equal(f.listenerCount(),0);
});
for(const kind of ['non-Escape','outside target and focus'])test('owned DOM window capture leaves '+kind+' untouched',async()=>{
 const f=fixture({realDialog:true}),outcome=await start(f);await drain();const dialog=dialogOf(f);
 if(kind==='outside target and focus')f.document.activeElement=f.app;
 const event=capturedKeyEvent(kind==='non-Escape'?cancelOf(dialog):f.app,kind==='non-Escape'?'Enter':'Escape');f.capture(event);await drain();
 assert.equal(event.defaultPrevented,false);assert.equal(event.propagationStopped,false);assert.equal(outcome.settled,false);untouched(f);
 await cancelOf(dialog).click();await outcome.promise;assert.equal(f.listenerCount(),0);
});

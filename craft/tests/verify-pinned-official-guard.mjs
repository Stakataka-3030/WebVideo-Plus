// Read-only integration probe. Executes the hash-pinned official TypeScript
// controller and setup-store with actual pinned Pinia/Vue in an inert VM.
// Only reactive macros/types are mechanically unwrapped; services are inert.
// No native process, registry, installer, network, or repository write occurs.
// Node 22.13+ (stripTypeScriptTypes) and isolated pinia3.0.4/vue3.5.35 required.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import path from 'node:path';import crypto from 'node:crypto';import {stripTypeScriptTypes,createRequire} from 'node:module';
const [sourceRoot,dependencyRoot,clientFile]=process.argv.slice(2);
if(!sourceRoot||!dependencyRoot||!clientFile)throw Error('Usage: node verify-pinned-official-guard.mjs <official-beta2-source-root> <inert-npm-dependency-root> <client.js>');
const require=createRequire(path.join(path.resolve(dependencyRoot),'package.json'));
assert.equal(require('pinia/package.json').version,'3.0.4');assert.equal(require('vue/package.json').version,'3.5.35');
const {createPinia,setActivePinia,defineStore}=require('pinia'),{ref,computed}=require('vue');
function official(relative,expected){const bytes=fs.readFileSync(path.join(sourceRoot,relative));const hash=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');assert.equal(hash,expected,'Pinned official source changed: '+relative);return bytes.toString('utf8');}
official('src/services/app-update/update-service.ts','67968904a0155dffc0797b156e1d2d42fe50b9d4');
const original=official('src/stores/app-update.ts','85120da16959d5e53d5f654676da43d582add18d');
let setup=original.slice(original.indexOf('  () => {')+10,original.indexOf('    return $$({'));
setup=stripTypeScriptTypes(setup,{mode:'strip'}).replaceAll('$ref','ref').replaceAll('$computed','computed');
const refs=['status','availableUpdate','skippedVersion','lastCheckedAt','lastError','downloadProgress'];
for(const name of refs)setup=setup.replace(new RegExp('(?<![\\w])'+name+'(?![\\w])','g'),name+'.value').replaceAll('let '+name+'.value =','let '+name+' =');
const exports=['status','availableUpdate','skippedVersion','lastCheckedAt','lastError','downloadProgress','isChecking','isUpdating','isDownloaded','isInstalled','isRestarting','isAvailableUpdateSkipped','setChecking','setUpToDate','setAvailableUpdate','skipVersion','skipAvailableVersion','setUpdating','updateDownloadProgress','setDownloaded','setInstalled','setRestarting','setError'];
const context=vm.createContext({ref,computed,defineStore,console,logger:{error(){}},getDownloadProgressToastKey:()=>''});vm.runInContext('globalThis.useStore=defineStore("app-update",()=>{'+setup+'\nreturn {'+exports.join(',')+'};});',context);
let c=official('src/features/app-update/useAppUpdateController.ts','1167d5e283fb90f5eb37bb2aa6ce9abd6a534592');c=c.slice(c.indexOf('type AppUpdateCheckReason'));c=stripTypeScriptTypes(c,{mode:'strip'}).replaceAll('export function','function');vm.runInContext(c+'\nglobalThis.createController=createAppUpdateController;',context);
const pinia=createPinia();setActivePinia(pinia);const s=context.useStore(pinia);const calls=[];const controller=context.createController({appUpdateStore:s,hasInstallBlockers:()=>false,modalStore:{open(){}},service:{checkForUpdate:async()=>({version:'1.0.1'}),downloadUpdate:async()=>calls.push('download'),installUpdate:async()=>calls.push('install'),restartApp:async()=>calls.push('restart')},toastApi:new Proxy({},{get:()=>()=>{}})});
s.setAvailableUpdate({version:'1.0.1'});const captured=s.setDownloaded;let guards=0;s.$onAction(({name})=>{if(name==='setDownloaded'){guards++;throw Error('Use coordinated panel');}},true);await controller.runUpdateAction();assert.deepEqual(calls,['download']);assert.equal(s.status,'error');assert.throws(()=>captured(),/coordinated/);await controller.runUpdateAction();assert.deepEqual(calls,['download','download']);assert.equal(s.isDownloaded,false);assert.equal(guards,3);console.log('PASS exact controller + transformed exact setup-store + actual Pinia3.0.4: native download preserved, setDownloaded blocked, captured action blocked, repeat cannot install');
// Scope limit: setting downloaded before attach can have a service.installUpdate already in flight.
s.status='downloaded';let finish;const unsafe=context.createController({appUpdateStore:s,hasInstallBlockers:()=>false,modalStore:{open(){}},service:{installUpdate:()=>{calls.push('install-already-started');return new Promise(r=>finish=r);},restartApp:async()=>{}},toastApi:new Proxy({},{get:()=>()=>{}})});const inFlight=unsafe.runUpdateAction();s.setError('update-failed','late attach','available');assert.equal(calls.at(-1),'install-already-started');finish();await inFlight;console.log('CONFIRMED late-attach downloaded-state normalization cannot undo already-started service install');
vm.runInContext(fs.readFileSync(clientFile,'utf8'),context);context.alert=()=>{};
let current=context.useStore(createPinia());current.setAvailableUpdate({version:'1.0.1'});const ownedCalls=[];const editor={hasUnsavedDocuments:false},runtimeTask={hasBlockingTasks:false};const stores=()=>({appUpdate:current,editor,runtimeTask});const guard=context.WebVideoCraftInstallOfficialGuard({getStores:stores});assert.equal(guard.status().safe,true);const capturedSetter=current.setDownloaded;assert.throws(()=>capturedSetter(),/官方检查/);assert.equal(current.status,'available');
const exact=context.createController({appUpdateStore:current,hasInstallBlockers:()=>false,modalStore:{open(){}},service:{downloadUpdate:async()=>ownedCalls.push('download'),installUpdate:async()=>ownedCalls.push('install'),restartApp:async()=>ownedCalls.push('restart')},toastApi:new Proxy({},{get:()=>()=>{}})});await exact.runUpdateAction();await exact.runUpdateAction();assert.deepEqual(ownedCalls,['download','download']);assert.equal(current.status,'error');
for(const value of ['downloaded','installed','restarting']){current.status=value;assert(!['downloaded','installed','restarting'].includes(current.status));current.$patch({status:value});assert(!['downloaded','installed','restarting'].includes(current.status));current.$patch(state=>state.status=value);assert(!['downloaded','installed','restarting'].includes(current.status));current.$state.status=value;assert(!['downloaded','installed','restarting'].includes(current.status));}
const native=Object.freeze({invoke:async()=>{throw Error('inert native function');}});const client=context.WebVideoCraftCreateUpdates({internals:native,rpc:async()=>({enabled:true}),getStores:stores,officialGuard:guard});client.installOfficialHook();assert.equal((await client.status()).enabled,true);assert.equal(native.invoke.name,'invoke');assert.equal(context.WebVideoCraftInstallOfficialGuard({getStores:stores}),guard);console.log('PASS current production guard + exact controller + actual Pinia: captured refs, duplicate arm, repeated download, direct/$patch/$state dangerous writes all blocked; frozen native untouched');
current=context.useStore(createPinia());assert.equal(guard.status().safe,false);assert.equal((await client.status()).enabled,false);current.setAvailableUpdate({version:'1.0.1'});current.setDownloaded();const late=context.WebVideoCraftInstallOfficialGuard({getStores:stores});assert.equal(late.status().safe,false);assert.equal(late.status().guarded,true);assert.equal(current.status,'available');console.log('PASS changed store disables old guard; late-attach downloaded state is normalized and remains permanently unsafe');

// Exercise the normal exact controller with a registered owned route. Native
// downloads complete and publish their usual toast; there is no failed toast.
current=context.useStore(createPinia());current.setAvailableUpdate({version:'1.0.1',currentVersion:'1.0.0-beta.2'});
const routeCalls=[],toastCalls=[];context.confirm=()=>false;
const routeNative=Object.freeze({invoke:async(command)=>{
 routeCalls.push(command);
 if(command==='plugin:updater|check'){
  assert(toastCalls.includes('updateDownloaded'),'route begins after native downloaded toast');
  return {rid:77,version:'1.0.1',currentVersion:'1.0.0-beta.2',rawJson:{version:'1.0.1'}};
 }
 if(command==='plugin:resources|close')return;
 throw Error('unexpected native install or close: '+command);
}});
const routed=context.WebVideoCraftCreateUpdates({internals:routeNative,getStores:stores,confirmInstall:async options=>context.confirm(options.message),rpc:async()=>{throw Error('cancelled route must not prepare');}});
routed.installOfficialHook();const routedGuard=context.WebVideoCraftInstallOfficialGuard({getStores:stores});
const normal=context.createController({appUpdateStore:current,hasInstallBlockers:()=>false,modalStore:{open(){}},service:{
 downloadUpdate:async()=>routeCalls.push('original-native-download'),installUpdate:async()=>routeCalls.push('UNSAFE-native-install'),restartApp:async()=>routeCalls.push('UNSAFE-native-restart'),
},toastApi:new Proxy({},{get:(_,name)=>()=>toastCalls.push(name)})});
await normal.runUpdateAction();
for(let n=0;n<50&&routedGuard.status().routePending;n++)await new Promise(resolve=>setImmediate(resolve));
assert.equal(routedGuard.status().routePending,false);assert.equal(current.status,'available');assert.equal(current.lastError,undefined);
assert.deepEqual(routeCalls,['original-native-download','plugin:updater|check','plugin:resources|close']);
assert(toastCalls.includes('updateDownloaded'));assert(!toastCalls.includes('updateFailed'));
await normal.runUpdateAction();
for(let n=0;n<50&&routedGuard.status().routePending;n++)await new Promise(resolve=>setImmediate(resolve));
assert.equal(routeCalls.filter(x=>x==='original-native-download').length,2);
assert(!routeCalls.some(x=>x.startsWith('UNSAFE')));assert.equal(current.isDownloaded,false);
console.log('PASS exact controller + actual pinned Pinia: supported synchronous state normalization routes native download completion after normal toast; cancellation and native retry never reach original install/restart');
const positiveCalls=[],watchdogs=[];context.confirm=()=>true;context.setTimeout=fn=>watchdogs.push(fn);
const positiveNative=Object.freeze({invoke:async command=>{
 positiveCalls.push(command);
 if(command==='plugin:updater|check')return {rid:78,version:'1.0.1',currentVersion:'1.0.0-beta.2',rawJson:{version:'1.0.1'}};
 if(command==='plugin:resources|close'||command==='plugin:window|close')return;
 throw Error('raw install/restart is never used: '+command);
}});
const positive=context.WebVideoCraftCreateUpdates({internals:positiveNative,getStores:stores,confirmInstall:async options=>context.confirm(options.message),rpc:async(method,params)=>{
 positiveCalls.push(method);assert.equal(params.confirmNormalClose,true);
 if(method==='update.prepare'){assert.equal(params.metadata.version,'1.0.1');return {ready:true};}
 if(method==='update.commit')return {committed:true,exitHost:true};
 throw Error('unexpected RPC '+method);
}});positive.installOfficialHook();await normal.runUpdateAction();
for(let n=0;n<50&&routedGuard.status().routePending;n++)await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(positiveCalls,['plugin:updater|check','update.prepare','update.commit','plugin:window|close','plugin:resources|close']);
assert.equal(positive.state().status,'closing-host');assert.equal(positive.state().busy,true);assert.equal(watchdogs.length,1);
assert(!routeCalls.some(x=>x.startsWith('UNSAFE')));assert(!toastCalls.includes('updateFailed'));assert.equal(current.lastError,undefined);
console.log('PASS exact native controller confirmation path delegates only to owned prepare/commit and normal window close; no raw updater install, process exit, or success claim');

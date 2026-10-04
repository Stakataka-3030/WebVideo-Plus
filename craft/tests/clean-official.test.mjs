import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {CleanUpdateCoordinator,cleanupOwnedOfficialStage} from '../update/clean-coordinator.mjs';
import {UpdateCoordinator} from '../update/coordinator.mjs';
const validation={updateObserverValidated:false,sameNameUpdateValidated:false,officialCleanUpdateValidated:false};
async function fixture(t,options={}){
 const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'craft-clean-policy-'));t.after(()=>fs.rm(stateDir,{recursive:true,force:true}));
 const events=[];let child,id;const staged={directory:'/fixture/state/official-update/staged-owned',record:{version:'1.0.1'}};
 const coordinator=new CleanUpdateCoordinator({stateDir,statePath:'/fixture/config.json',hostPid:10,wrapperPid:9,installMode:'same-name',autoInstallEnabled:true,observerValidated:false,sameNameValidated:false,cleanInstallValidated:false,cancelWaitMs:10,
  stageOfficial:async()=>{events.push('stage');return staged;},cleanupStage:async value=>{assert.equal(value.staged,staged);events.push('cleanup');},
  releaseWrapper:()=>{events.push('release-wrapper');queueMicrotask(()=>child.emit('message',{type:'wrapper-exited',id}));},
  spawnHelper(exe,args,spawnOptions){events.push({exe,args,spawnOptions});id=args[args.indexOf('--id')+1];child=Object.assign(new EventEmitter(),{pid:77,connected:true});
   child.send=(message,callback)=>{events.push(message.type);callback?.();queueMicrotask(()=>{
    if(message.type==='commit'){if(options.childError)child.emit('error',Error('inert postspawn pipe error'));else if(options.commitError)child.emit('message',{id,type:'error',message:'inert acknowledgement lost'});else child.emit('message',{id,type:'committed'});}
    if(message.type==='abort'){child.emit('message',{id,type:'result',result:{state:'aborted'}});if(!options.delayExit)child.emit('exit',0);}
    if(message.type==='cancel-before-launch'&&options.cancelResult){child.emit('message',{id,type:'result',result:options.cancelResult});child.emit('exit',0);}
   });};
   child.kill=()=>{events.push('kill-helper');child.emit('exit',1);};child.disconnect=()=>{child.connected=false;events.push('disconnect');};child.unref=()=>events.push('unref');
   queueMicrotask(()=>child.emit('message',{id,type:'armed'}));return child;
  },...options.coordinator});
 return {coordinator,events,child:()=>child,id:()=>id,staged};
}
test('enabled clean policy remains separate from all false acceptance evidence',async t=>{
 const f=await fixture(t);const before=await f.coordinator.status();assert.equal(before.enabled,true);assert.deepEqual(before.validation,validation);assert.deepEqual(before.runtimePolicy,{officialAutoInstallEnabled:true});
 await f.coordinator.prepare({version:'1.0.1',currentVersion:'1.0.0-beta.2',metadata:{}});const spawned=f.events.find(x=>x?.args);assert(spawned.args[0].endsWith('clean-handoff.mjs'));assert.equal(spawned.spawnOptions.detached,true);
 const reply=await f.coordinator.commit();assert.equal(reply.committed,true);assert.equal(reply.exitHost,true);assert.equal(reply.closeGraceMs,30000);assert(f.coordinator.handoff());assert(!f.events.includes('cleanup'));assert.deepEqual((await f.coordinator.status()).validation,validation);
});
for(const enabled of [false,undefined])test('missing/false runtime policy refuses before staging even if historical evidence true '+enabled,async t=>{const f=await fixture(t,{coordinator:{autoInstallEnabled:enabled,observerValidated:true,sameNameValidated:true,cleanInstallValidated:true}});assert.equal((await f.coordinator.status()).enabled,false);await assert.rejects(f.coordinator.prepare({version:'1.0.1'}),/未启用/);assert.equal(f.events.length,0);});
test('legacy coordinator cannot be enabled by an unrelated runtime flag',async()=>{const c=new UpdateCoordinator({autoInstallEnabled:true,installMode:'same-name',observerValidated:false,sameNameValidated:false});await assert.rejects(c.prepare({version:'1.0.1'}),/尚未通过/);});
test('runtime enablement cannot bypass same-name ownership requirement',async t=>{const f=await fixture(t,{coordinator:{installMode:'external'}});assert.equal((await f.coordinator.status()).enabled,false);await assert.rejects(f.coordinator.prepare({version:'1.0.1'}),/同名/);assert.equal(f.events.length,0);});
test('precommit cancellation waits actual helper exit before owned-stage cleanup',async t=>{const f=await fixture(t,{delayExit:true});await f.coordinator.prepare({version:'1.0.1'});let done=false;const aborted=f.coordinator.abort().then(result=>{done=true;return result;});await new Promise(r=>setImmediate(r));assert.equal(done,false);assert(!f.events.includes('cleanup'));f.child().emit('exit',0);const result=await aborted;assert.equal(result.notStarted,true);assert.equal(done,true);assert(f.events.includes('cleanup'));});
test('aborting a completed stage before helper start discards it without late helper',async t=>{let resolve;const f=await fixture(t,{coordinator:{stageOfficial:()=>new Promise(r=>resolve=r)}});const prepared=f.coordinator.prepare({version:'1.0.1'});prepared.catch(()=>{});const aborted=f.coordinator.abort();resolve(f.staged);await aborted;await assert.rejects(prepared,/取消/);assert(f.events.includes('cleanup'));assert(!f.events.some(x=>x?.args));});
test('commit acknowledgement loss requests prelaunch cancellation and returns trusted no-install result',async t=>{const result={state:'host-unchanged',observed:{state:'not-started',launchAttempted:false}};const f=await fixture(t,{commitError:true,cancelResult:result});await f.coordinator.prepare({version:'1.0.1'});const reply=await f.coordinator.commit();assert.equal(reply.exitHost,false);assert.equal(reply.notStarted,true);assert.equal(reply.commitRequested,true);assert(f.events.includes('cancel-before-launch'));assert(!f.events.includes('kill-helper'));});
test('window-close refusal can cancel after commit without killing any installer',async t=>{const f=await fixture(t,{cancelResult:{state:'host-unchanged',observed:{state:'not-started',launchAttempted:false}}});await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();const reply=await f.coordinator.abort();assert.equal(reply.notStarted,true);assert.equal(reply.cancelled,true);assert(!f.events.includes('kill-helper'));assert(!f.events.includes('cleanup'),'committed artifact cleanup is owned by the helper');});
test('uncertain postcommit cancellation retains artifacts and never claims no install',async t=>{const f=await fixture(t);await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();const reply=await f.coordinator.abort();assert.equal(reply.notStarted,false);assert.equal(reply.state,'indeterminate');assert.equal(reply.commitRequested,true);assert(!f.events.includes('cleanup'));assert(!f.events.includes('kill-helper'));f.child().emit('exit',0);});
test('already-running installer result cannot be reported as cancelled or unstarted',async t=>{const f=await fixture(t,{cancelResult:{state:'official-unvalidated',observed:{state:'exited',exitCode:0}}});await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();const reply=await f.coordinator.abort();assert.equal(reply.notStarted,false);assert.equal(reply.installationStarted,true);assert.equal(reply.finished,true);assert.equal(reply.exitCode,0);assert(!f.events.includes('kill-helper'));});
test('cleanup refuses directory outside its owned staging root before touching bytes',async()=>{await assert.rejects(cleanupOwnedOfficialStage({state:{stateDir:'/owned/state'},staged:{directory:'/foreign/staged-x',record:{}}}),/outside owned/);});

test('commit is closing-host until actual installer observation, never premature installing',async t=>{const f=await fixture(t);await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();assert.equal((await f.coordinator.status()).state,'closing-host');f.child().emit('message',{id:f.id(),type:'installer-observed',observed:{pid:123}});assert.equal((await f.coordinator.status()).state,'installing');f.child().emit('exit',0);});

test('exact clean runner VM covers enabled policy, journal, cancellation, cleanup and unchanged antirollback',async()=>{
 const root=fileURLToPath(new URL('../..',import.meta.url)),script=fileURLToPath(new URL('./clean-handoff-vm.mjs',import.meta.url));
 const result=await promisify(execFile)(process.execPath,['--experimental-vm-modules',script,root],{timeout:15000});
 const evidence=JSON.parse(result.stdout);assert.equal(evidence.failed,0);assert(evidence.passed>=20);assert.equal(evidence.nativeExecuted,false);assert.equal(evidence.networkUsed,false);assert.equal(evidence.runtimePolicy.officialAutoInstallEnabled,true);assert.deepEqual(evidence.historicalAcceptance,validation);
});

test('trusted not-started remains available after helper exit through committedPending',async t=>{const f=await fixture(t,{cancelResult:{state:'host-unchanged',observed:{state:'not-started',launchAttempted:false}}});await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();await f.coordinator.abort();assert.equal(f.coordinator.pending,null);assert.equal((await f.coordinator.abort()).notStarted,true);assert.equal(f.coordinator.busy,false);});
test('helper exit without terminal receipt keeps committed uncertainty busy and cannot imply cancellation',async t=>{const f=await fixture(t);await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();f.child().emit('exit',1);assert.equal(f.coordinator.pending,null);assert.equal(f.coordinator.busy,true);const result=await f.coordinator.abort();assert.equal(result.notStarted,false);assert.equal(result.state,'indeterminate');await assert.rejects(f.coordinator.prepare({version:'1.0.2'}),/进行/);assert(!f.events.includes('cleanup'));});

test('started-and-finished installer outcome keeps the old session blocked',async t=>{const f=await fixture(t,{cancelResult:{state:'official-unvalidated',observed:{state:'exited',exitCode:0}}});await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();await f.coordinator.abort();assert.equal(f.coordinator.pending,null);assert.equal(f.coordinator.busy,true);await assert.rejects(f.coordinator.prepare({version:'1.0.2'}),/进行/);});
test('trusted not-started plus helper exit permits a fresh prepared update',async t=>{const f=await fixture(t,{cancelResult:{state:'host-unchanged',observed:{state:'not-started',launchAttempted:false}}});await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();await f.coordinator.abort();assert.equal(f.coordinator.busy,false);await f.coordinator.prepare({version:'1.0.2'});assert.equal(f.coordinator.pending.ready,true);await f.coordinator.abort();});

test('postspawn child error waits for later trusted not-started and helper termination',async t=>{const f=await fixture(t,{childError:true,cancelResult:{state:'host-unchanged',observed:{state:'not-started',launchAttempted:false}}});await f.coordinator.prepare({version:'1.0.1'});const outcome=await f.coordinator.commit();assert.equal(outcome.exitHost,false);assert.equal(outcome.notStarted,true);assert.equal(f.coordinator.pending,null);assert.equal(f.coordinator.busy,false);assert.equal((await f.coordinator.abort()).notStarted,true);});

test('late repeated commit cannot erase committed uncertainty after helper exit',async t=>{const f=await fixture(t);await f.coordinator.prepare({version:'1.0.1'});await f.coordinator.commit();f.child().emit('exit',1);const saved=f.coordinator.committedPending;assert.equal(f.coordinator.pending,null);await assert.rejects(f.coordinator.commit(),/失效/);assert.equal(f.coordinator.committedPending,saved);assert.equal(f.coordinator.busy,true);assert.equal((await f.coordinator.abort()).notStarted,false);assert(!f.events.includes('cleanup'));});

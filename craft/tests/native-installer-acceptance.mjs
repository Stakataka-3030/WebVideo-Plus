// Windows acceptance of REAL verified packages. No executable is launched.
// Every mutation is confined to fresh copies beneath this run's owned temp root.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {verifyPackage,assertNoLinks,fileHash,hostRecordPath} from '../installer/transaction.mjs';
const options={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--package','--upgrade-package','--host-exe'].includes(key)||options[key]||!process.argv[i+1])throw Error('Usage: node native-installer-acceptance.mjs --package <older verified package> --upgrade-package <current verified package> --host-exe <official host exe>');options[key]=path.resolve(process.argv[i+1]);}
for(const key of ['--package','--upgrade-package','--host-exe'])if(!options[key])throw Error('Missing '+key);
if(process.platform!=='win32')throw Error('This acceptance script requires Windows; portable transaction tests are separate.');
const oldRoot=options['--package'],currentRoot=options['--upgrade-package'],hostSource=options['--host-exe'];assertNoLinks(hostSource);
const oldManifest=verifyPackage(oldRoot),currentManifest=verifyPackage(currentRoot),hostSha=fileHash(hostSource);
const officialHostSha='3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d';assert.equal(hostSha,officialHostSha,'Require the verified official Craft beta.2 host');
for(const manifest of [oldManifest,currentManifest]){assert.ok(manifest.supportedHosts.some(x=>x.sha256===hostSha));assert.equal(manifest.updateObserverValidated,false);assert.equal(manifest.sameNameUpdateValidated,false);}
assert.notEqual(oldManifest.manifestSha256,currentManifest.manifestSha256,'A real package upgrade requires different verified package manifests, not an identical reinstall');
// Exercise the transaction module that is actually shipped in the current package.
const {install,uninstall}=await import(pathToFileURL(path.join(currentRoot,'craft/installer/transaction.mjs')).href);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'webvideo-craft-installer-acceptance-')),owner=crypto.randomUUID(),ownerFile=path.join(root,'.owned-acceptance-run');fs.writeFileSync(ownerFile,owner);
const report={schemaVersion:1,startedAt:new Date().toISOString(),root,inputs:{oldPackage:oldRoot,currentPackage:currentRoot,hostSource,oldManifestSha256:oldManifest.manifestSha256,currentManifestSha256:currentManifest.manifestSha256,hostSha256:hostSha},cases:[],executablesLaunched:false,officialUpdaterInvoked:false,scope:'filesystem transaction acceptance with real payloads; native wrapper startup is separate'};
function fixture(name,mode='same-name'){
 const home=path.join(root,name);assert.ok(path.dirname(home)===root);fs.mkdirSync(path.join(home,'host'),{recursive:true});const craftExe=path.join(home,'host','webgal-craft.exe');fs.copyFileSync(hostSource,craftExe);
 return {home,mode,craftExe,adapterRoot:path.join(home,'adapter'),packageRoot:currentRoot};
}
const statePath=o=>path.join(o.adapterRoot,'config.json'),backup=o=>path.join(path.dirname(o.craftExe),'webgal-craft.webvideo-original.exe');
function record(name,body){const start=Date.now();const detail=body();report.cases.push({name,status:'passed',durationMs:Date.now()-start,...detail});console.log('PASS '+name);}
let failure;
try{
 record('external install, real upgrade, repeat, uninstall',()=>{
  const o=fixture('external','external');const a=install({...o,packageRoot:oldRoot});assert.equal(a.changed,true);assert.equal(fileHash(o.craftExe),hostSha);assert.equal(fs.existsSync(backup(o)),false);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);
  fs.mkdirSync(a.state.stateDir,{recursive:true});const marker=path.join(a.state.stateDir,'acceptance-user-data.txt');fs.writeFileSync(marker,'preserve owned test state');
  const upgraded=install(o);assert.equal(upgraded.changed,true);assert.equal(upgraded.state.package.manifestSha256,currentManifest.manifestSha256);assert.equal(install(o).changed,false);assert.equal(fs.readFileSync(marker,'utf8'),'preserve owned test state');
  const detached=uninstall(statePath(o));assert.equal(detached.state.status,'detached');assert.equal(fileHash(o.craftExe),hostSha);assert.equal(fs.readFileSync(marker,'utf8'),'preserve owned test state');assert.equal(uninstall(statePath(o)).changed,false);
  return {home:o.home,hostSha256:fileHash(o.craftExe),statePreserved:true,oldInstallId:a.state.installId,newInstallId:upgraded.state.installId};
 });
 record('same-name upgrade owns wrapper and restores exact original',()=>{
  const o=fixture('same-name');const a=install({...o,packageRoot:oldRoot});assert.equal(fileHash(backup(o)),hostSha);assert.equal(fileHash(o.craftExe),a.state.ownership.wrapperSha256);
  const upgraded=install(o);assert.equal(upgraded.changed,true);assert.equal(fileHash(backup(o)),hostSha);assert.equal(fileHash(o.craftExe),upgraded.state.ownership.wrapperSha256);assert.equal(install(o).changed,false);
  const detached=uninstall(statePath(o));assert.equal(detached.state.status,'detached');assert.equal(fileHash(o.craftExe),hostSha);assert.equal(fs.existsSync(backup(o)),false);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);
  return {home:o.home,restoredHostSha256:fileHash(o.craftExe),ownedWrapperSha256:upgraded.state.ownership.wrapperSha256};
 });
 record('changed foreign host is refused and preserved',()=>{
  const o=fixture('foreign-host');install(o);const foreign=Buffer.from('Owned acceptance fixture simulating a newer foreign host; never executable.\n');fs.writeFileSync(o.craftExe,foreign);const changed=fileHash(o.craftExe);
  assert.throws(()=>install(o));const result=uninstall(statePath(o));assert.equal(result.state.status,'host-changed');assert.equal(fileHash(o.craftExe),changed);assert.equal(fileHash(backup(o)),hostSha);
  return {home:o.home,foreignHostSha256:changed,retainedOriginalSha256:fileHash(backup(o)),foreignPreserved:true};
 });
 record('ordinary injected failure restores only owned bytes',()=>{
  const o=fixture('owned-rollback');assert.throws(()=>install({...o,failAt:'host-replaced'}));assert.equal(fileHash(o.craftExe),hostSha);assert.equal(fs.existsSync(backup(o)),false);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);
  return {home:o.home,restoredHostSha256:fileHash(o.craftExe)};
 });
 record('foreign change during rollback is never overwritten',()=>{
  const o=fixture('foreign-rollback');let foreignSha;assert.throws(()=>install({...o,onPhase:phase=>{if(phase==='host-replaced'){fs.writeFileSync(o.craftExe,'Owned acceptance fixture: foreign write during transaction.\n');foreignSha=fileHash(o.craftExe);throw Error('Intentional owned acceptance interruption');}}}),/rollback incomplete/);
  assert.equal(fileHash(o.craftExe),foreignSha);assert.equal(fileHash(backup(o)),hostSha);
  return {home:o.home,foreignHostSha256:foreignSha,retainedOriginalSha256:fileHash(backup(o)),foreignPreserved:true};
 });
}catch(error){failure=error;report.failure={message:error.message,stack:error.stack};}
finally{
 // Verify original inputs remained untouched, even if an acceptance assertion failed.
 try{assert.equal(fileHash(hostSource),hostSha);assert.equal(verifyPackage(oldRoot).manifestSha256,oldManifest.manifestSha256);assert.equal(verifyPackage(currentRoot).manifestSha256,currentManifest.manifestSha256);report.inputHashesUnchanged=true;}catch(error){report.inputHashesUnchanged=false;failure??=error;report.inputFailure=error.message;}
 report.status=failure?'failed':'passed';report.completedAt=new Date().toISOString();assert.equal(fs.readFileSync(ownerFile,'utf8'),owner);const output=path.join(root,'acceptance.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('Evidence retained: '+output);
 // Deliberately retain this owned temp tree for independent review. No caller
 // path is deleted, and no foreign host is restored or executed during cleanup.
}
if(failure)throw failure;

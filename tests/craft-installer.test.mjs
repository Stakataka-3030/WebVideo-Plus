import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {install,repair,uninstall,prepareUpdateUnmount,remountAfterVerifiedUpdate,verifyPackage,readState,fileHash,hostRecordPath,recoverSessionLock} from '../craft/installer/transaction.mjs';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function fixture(body){const home=fs.mkdtempSync(path.join(os.tmpdir(),'craft-installer-check-'));try{body(home);}finally{fs.rmSync(home,{recursive:true,force:true});}}
function payload(home,name='payload',version='1c'){
 const root=path.join(home,name),files={'node.exe':'fixture node never executed','WebGAL.Video.exe':'fixture kernel never executed','WebVideoCraft.Launcher.exe':'fixture wrapper '+version,'craft/launch-injected.mjs':'// fixture session '+version,'craft/session/api.mjs':'export const test=true;'};
 for(const [name,data]of Object.entries(files)){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
 fs.writeFileSync(path.join(root,'MANIFEST.json'),JSON.stringify({schemaVersion:1,product:'WebVideo+ Craft',version,supportedHosts:[{version:'beta.2',sha256:hash('official fixture version A')},{version:'beta.3',sha256:hash('official fixture version B')}],updateObserverValidated:false,sameNameUpdateValidated:false,entry:'craft/launch-injected.mjs',node:'node.exe',kernel:'WebGAL.Video.exe',wrapper:'WebVideoCraft.Launcher.exe',files:Object.entries(files).map(([name,data])=>({path:name,bytes:Buffer.byteLength(data),sha256:hash(data)}))}));return root;
}
function setup(home,mode='same-name'){
 const packageRoot=payload(home),adapterRoot=path.join(home,'adapter'),craftExe=path.join(home,'host/webgal-craft.exe');fs.mkdirSync(path.dirname(craftExe));fs.writeFileSync(craftExe,'official fixture version A');return {packageRoot,adapterRoot,craftExe,mode,processCheck:()=>false};
}
const statePath=o=>path.join(o.adapterRoot,'config.json');
const original=o=>path.join(path.dirname(o.craftExe),'webgal-craft.webvideo-original.exe');
function tree(root){const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);return files(root).sort().map(f=>[path.relative(root,f),fileHash(f)]);}
test('legacy external package remains readable for migration',()=>fixture(home=>{const o=setup(home,'external'),before=fileHash(o.craftExe);const a=install(o);assert.equal(a.state.installMode,'external');assert.equal(fileHash(o.craftExe),before);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);assert.equal(install(o).changed,false);assert.equal(uninstall(statePath(o),o).state.status,'detached');assert.equal(fileHash(o.craftExe),before);}));
test('same-name install/reinstall/uninstall preserves exact original and mutable data',()=>fixture(home=>{const o=setup(home),before=fileHash(o.craftExe),a=install(o);assert.equal(fileHash(original(o)),before);assert.equal(fileHash(o.craftExe),a.state.ownership.wrapperSha256);fs.mkdirSync(a.state.stateDir,{recursive:true});fs.writeFileSync(path.join(a.state.stateDir,'settings.json'),'user settings');assert.equal(install(o).changed,false);uninstall(statePath(o),o);assert.equal(fileHash(o.craftExe),before);assert.equal(fs.existsSync(original(o)),false);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);assert.equal(fs.readFileSync(path.join(a.state.stateDir,'settings.json'),'utf8'),'user settings');assert.equal(uninstall(statePath(o),o).changed,false);assert.equal(install(o).state.status,'installed');}));
test('verified upgrade swaps package and wrapper but preserves state/original',()=>fixture(home=>{const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);fs.writeFileSync(path.join(a.state.stateDir,'settings.json'),'keep');const originalHash=fileHash(original(o));o.packageRoot=payload(home,'payload2','2c');const b=install(o);assert.equal(b.state.installId,a.state.installId);assert.equal(b.state.package.version,'2c');assert.equal(fileHash(original(o)),originalHash);assert.equal(fileHash(o.craftExe),b.state.ownership.wrapperSha256);assert.equal(fs.readFileSync(path.join(a.state.stateDir,'settings.json'),'utf8'),'keep');}));
for(const phase of ['staged','published','host-replaced','recorded'])test('new install rollback at '+phase,()=>fixture(home=>{const o=setup(home),before=fileHash(o.craftExe);assert.throws(()=>install({...o,failAt:phase}),/Injected/);assert.equal(fileHash(o.craftExe),before);assert.equal(fs.existsSync(o.adapterRoot),false);assert.equal(fs.existsSync(original(o)),false);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);}));
for(const phase of ['published','host-replaced','recorded'])test('upgrade rollback at '+phase,()=>fixture(home=>{const o=setup(home);install(o);const before=tree(o.adapterRoot),exe=fileHash(o.craftExe),backup=fileHash(original(o)),record=fs.readFileSync(hostRecordPath(o.craftExe));o.packageRoot=payload(home,'payload2','2c');assert.throws(()=>install({...o,failAt:phase}),/Injected/);assert.deepEqual(tree(o.adapterRoot),before);assert.equal(fileHash(o.craftExe),exe);assert.equal(fileHash(original(o)),backup);assert.deepEqual(fs.readFileSync(hostRecordPath(o.craftExe)),record);}));
for(const phase of ['host-restored','record-removed'])test('uninstall rollback at '+phase,()=>fixture(home=>{const o=setup(home);install(o);const before=tree(o.adapterRoot),exe=fileHash(o.craftExe),record=fs.readFileSync(hostRecordPath(o.craftExe));assert.throws(()=>uninstall(statePath(o),{...o,failAt:phase}),/Injected/);assert.deepEqual(tree(o.adapterRoot),before);assert.equal(fileHash(o.craftExe),exe);assert.deepEqual(fs.readFileSync(hostRecordPath(o.craftExe)),record);}));
test('changed host from official update is never overwritten by stale recovery',()=>fixture(home=>{const o=setup(home);install(o);fs.writeFileSync(o.craftExe,'official fixture version B');const updated=fileHash(o.craftExe),r=uninstall(statePath(o),o);assert.equal(r.hostChanged,true);assert.equal(fileHash(o.craftExe),updated);assert.equal(fs.existsSync(original(o)),true);const renewed=install(o);assert.equal(renewed.state.host.sha256,updated);assert.equal(fileHash(original(o)),updated);uninstall(statePath(o),o);assert.equal(fileHash(o.craftExe),updated);}));
test('update unmount keeps recovery and explicit evidence gates reattach',()=>fixture(home=>{const o=setup(home);const manifestPath=path.join(o.packageRoot,'MANIFEST.json'),testManifest=JSON.parse(fs.readFileSync(manifestPath));testManifest.updateObserverValidated=true;testManifest.sameNameUpdateValidated=true;fs.writeFileSync(manifestPath,JSON.stringify(testManifest));const a=install(o);const detached=prepareUpdateUnmount(statePath(o),o);assert.equal(detached.state.status,'update-unmounted');assert.equal(fileHash(o.craftExe),a.state.ownership.originalSha256);fs.writeFileSync(o.craftExe,'official fixture version B');assert.throws(()=>remountAfterVerifiedUpdate(statePath(o),{},o),/evidence/);const evidence={expectedHostHash:fileHash(o.craftExe),version:'beta.3',provenance:'test official pinned fixture'};assert.throws(()=>remountAfterVerifiedUpdate(statePath(o),evidence,o),/trusted coordinator/);const b=remountAfterVerifiedUpdate(statePath(o),evidence,{...o,verifyUpdateReceipt:()=>true});assert.equal(fileHash(original(o)),evidence.expectedHostHash);assert.equal(fileHash(o.craftExe),b.state.ownership.wrapperSha256);assert.equal(b.state.host.version,'beta.3');}));
test('busy lease blocks mutations without killing any process',()=>fixture(home=>{const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);fs.writeFileSync(path.join(a.state.stateDir,'session.json'),JSON.stringify({schemaVersion:1,hostPid:42}));assert.throws(()=>uninstall(statePath(o),{processCheck:()=>true}),/Close/);assert.equal(fileHash(o.craftExe),a.state.ownership.wrapperSha256);}));
test('own updater may open Setup but live session prevents install, repair and uninstall with byte-identical recovery',()=>fixture(home=>{
 const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);
 fs.writeFileSync(path.join(a.state.stateDir,'session.lock'),JSON.stringify({sessionId:'own-updater-session',pid:42}));
 fs.writeFileSync(path.join(a.state.stateDir,'session.json'),JSON.stringify({schemaVersion:1,sessionId:'own-updater-session',hostPid:43,wrapperPid:44,coordinatorPid:42}));
 const before=tree(home);
 for(const operation of [()=>install(o),()=>repair(o),()=>uninstall(statePath(o),o)]){
  assert.throws(operation,/Session lock/);assert.deepEqual(tree(home),before,'opening/cancelling Setup cannot grant a mutation bypass');
 }
 // No task counters are consulted by this independent install-time guard.
 fs.unlinkSync(path.join(a.state.stateDir,'session.lock'));
 const leaseBefore=tree(home);for(const operation of [()=>install({...o,processCheck:()=>true}),()=>repair({...o,processCheck:()=>true}),()=>uninstall(statePath(o),{processCheck:()=>true})]){
  assert.throws(operation,/Close the owned/);assert.deepEqual(tree(home),leaseBefore);
 }
}));
test('unknown target, backup and modified package fail closed',()=>fixture(home=>{const o=setup(home);fs.mkdirSync(o.adapterRoot);const foreign=path.join(o.adapterRoot,'foreign.txt');fs.writeFileSync(foreign,'keep');assert.throws(()=>install(o),/unowned/);assert.equal(fs.readFileSync(foreign,'utf8'),'keep');fs.unlinkSync(foreign);fs.rmdirSync(o.adapterRoot);fs.writeFileSync(original(o),'unrelated');assert.throws(()=>install(o),/Unowned/);fs.unlinkSync(original(o));fs.appendFileSync(path.join(o.packageRoot,'node.exe'),'modified');assert.throws(()=>install(o),/integrity/);}));
test('manifest traversal, case duplicates and unlisted files are rejected',()=>fixture(home=>{const root=payload(home),file=path.join(root,'MANIFEST.json'),good=JSON.parse(fs.readFileSync(file));for(const bad of ['../escape','craft/../escape','C:/escape','craft\\escape','/escape','NUL','craft/con.txt','trailing.']){const m=structuredClone(good);m.files[0].path=bad;fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>verifyPackage(root),/Unsafe/);}const m=structuredClone(good);m.files.push({...m.files[0],path:'NODE.EXE'});fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>verifyPackage(root),/Duplicate/);fs.writeFileSync(file,JSON.stringify(good));fs.writeFileSync(path.join(root,'extra.txt'),'unlisted');assert.throws(()=>verifyPackage(root),/Unlisted/);}));
test('symlinked source/package/target paths are rejected',()=>fixture(home=>{const o=setup(home);fs.symlinkSync(o.packageRoot,path.join(home,'linked'),'dir');assert.throws(()=>verifyPackage(path.join(home,'linked')),/Linked/);fs.symlinkSync(path.dirname(o.craftExe),o.adapterRoot,'dir');assert.throws(()=>install(o),/Linked/);}));
test('same host lock rejects concurrent installers for different adapter roots',()=>fixture(home=>{const o=setup(home);fs.mkdirSync(o.craftExe+'.webvideo.install-lock');assert.throws(()=>install(o));assert.equal(fs.existsSync(o.adapterRoot),false);}));
test('failure before touching host never restores over a newly created foreign backup/record',()=>fixture(home=>{const o=setup(home),before=fileHash(o.craftExe);assert.throws(()=>install({...o,onPhase:phase=>{if(phase==='staged'){fs.writeFileSync(original(o),'foreign backup');fs.writeFileSync(hostRecordPath(o.craftExe),'foreign record');throw Error('foreign mutation');}}}),/foreign mutation/);assert.equal(fs.readFileSync(original(o),'utf8'),'foreign backup');assert.equal(fs.readFileSync(hostRecordPath(o.craftExe),'utf8'),'foreign record');assert.equal(fileHash(o.craftExe),before);}));
test('foreign adapter additions stop rollback rather than deleting foreign data',()=>fixture(home=>{const o=setup(home);assert.throws(()=>install({...o,onPhase:phase=>{if(phase==='published'){fs.writeFileSync(path.join(o.adapterRoot,'foreign.txt'),'keep me');throw Error('interrupt');}}}),/rollback incomplete/);assert.equal(fs.readFileSync(path.join(o.adapterRoot,'foreign.txt'),'utf8'),'keep me');assert.ok(fs.readdirSync(home).some(name=>name.includes('.transaction-')));}));
test('foreign executable change stops install rollback without overwriting updater bytes',()=>fixture(home=>{const o=setup(home);assert.throws(()=>install({...o,onPhase:phase=>{if(phase==='host-replaced'){fs.writeFileSync(o.craftExe,'new updater bytes');throw Error('interrupt');}}}),/rollback incomplete/);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'new updater bytes');assert.equal(fs.readFileSync(original(o),'utf8'),'official fixture version A');}));
test('foreign record after uninstall deletion is not overwritten during rollback',()=>fixture(home=>{const o=setup(home);install(o);assert.throws(()=>uninstall(statePath(o),{...o,onPhase:phase=>{if(phase==='record-removed'){fs.writeFileSync(hostRecordPath(o.craftExe),'new owner record');throw Error('interrupt');}}}),/rollback refused/);assert.equal(fs.readFileSync(hostRecordPath(o.craftExe),'utf8'),'new owner record');}));
test('host nested inside adapter target is rejected in either overlap direction',()=>fixture(home=>{const o=setup(home);assert.throws(()=>install({...o,adapterRoot:home}),/isolated/);assert.throws(()=>install({...o,adapterRoot:path.join(path.dirname(o.craftExe),'adapter')}),/isolated/);}));

test('exclusive session lock blocks spawn-window mutation and stale recovery requires dead matching lease',()=>fixture(home=>{const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);const lock=path.join(a.state.stateDir,'session.lock');fs.writeFileSync(lock,JSON.stringify({sessionId:'owned-session',pid:42}));assert.throws(()=>uninstall(statePath(o),o),/Session lock/);fs.writeFileSync(path.join(a.state.stateDir,'session.json'),JSON.stringify({schemaVersion:1,sessionId:'owned-session',coordinatorPid:42,hostPid:43}));assert.throws(()=>recoverSessionLock(statePath(o),{processCheck:()=>true}),/still alive/);assert.equal(recoverSessionLock(statePath(o),{processCheck:()=>false}).changed,true);assert.equal(fs.existsSync(lock),false);}));
test('incomplete session lock fails closed before lease exists',()=>fixture(home=>{const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);fs.writeFileSync(path.join(a.state.stateDir,'session.lock'),'');assert.throws(()=>uninstall(statePath(o),o),/Unknown\/incomplete/);}));

test('unknown host cannot be adopted by recording its current hash',()=>fixture(home=>{const o=setup(home);fs.writeFileSync(o.craftExe,'unknown host');assert.throws(()=>install(o),/Unsupported Craft host/);assert.equal(fs.existsSync(o.adapterRoot),false);assert.equal(fs.existsSync(original(o)),false);}));

test('development package cannot remount even with caller-supplied verifier approval',()=>fixture(home=>{const o=setup(home);install(o);prepareUpdateUnmount(statePath(o),o);fs.writeFileSync(o.craftExe,'official fixture version B');assert.throws(()=>remountAfterVerifiedUpdate(statePath(o),{expectedHostHash:fileHash(o.craftExe),version:'beta.3',provenance:'test'}, {...o,verifyUpdateReceipt:()=>true}),/not validated/);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version B');}));

for(const mode of ['external','same-name'])for(const damage of ['corrupt','missing'])test(`explicit ${mode} repair replaces a ${damage} owned file and preserves mutable data`,()=>fixture(home=>{
 const o=setup(home,mode),installed=install(o),target=path.join(o.adapterRoot,'craft/session/api.mjs'),expected=fileHash(target);
 fs.mkdirSync(installed.state.stateDir,{recursive:true});fs.writeFileSync(path.join(installed.state.stateDir,'settings.json'),'settings to keep');
 fs.mkdirSync(path.join(o.adapterRoot,'logs'));fs.writeFileSync(path.join(o.adapterRoot,'logs','install.log'),'logs to keep');
 const custom={...readState(statePath(o)),runtimePath:'C:/chosen/runtime',customPreference:{language:'zh-CN'}};fs.writeFileSync(statePath(o),JSON.stringify(custom));
 if(damage==='corrupt')fs.writeFileSync(target,'corrupted owned payload');else fs.unlinkSync(target);
 assert.throws(()=>install(o),/integrity mismatch/);
 const beforeHost=fileHash(o.craftExe),beforeOriginal=mode==='same-name'?fileHash(original(o)):null;
 const result=repair(o);
 assert.equal(result.changed,true);assert.equal(result.repaired,true);assert.deepEqual(result.repairedFiles,['craft/session/api.mjs']);assert.equal(fileHash(target),expected);
 assert.equal(result.state.installId,installed.state.installId);assert.equal(result.state.createdAt,installed.state.createdAt);assert.equal(result.state.runtimePath,custom.runtimePath);assert.deepEqual(result.state.customPreference,custom.customPreference);
 assert.equal(result.state.updateObserverValidated,false);assert.equal(result.state.sameNameUpdateValidated,false);
 assert.equal(fileHash(o.craftExe),beforeHost);if(beforeOriginal)assert.equal(fileHash(original(o)),beforeOriginal);
 assert.equal(fs.readFileSync(path.join(installed.state.stateDir,'settings.json'),'utf8'),'settings to keep');assert.equal(fs.readFileSync(path.join(o.adapterRoot,'logs','install.log'),'utf8'),'logs to keep');
 assert.equal(verifyPackage(o.adapterRoot,{allowMutable:true}).manifestSha256,installed.state.package.manifestSha256);
}));

test('same-version repair recopies healthy files on every explicit attempt; install remains a no-op',()=>fixture(home=>{
 const o=setup(home);install(o);const originalCopy=fs.copyFileSync,copied=[];
 try{fs.copyFileSync=(source,...rest)=>{copied.push(source);return originalCopy(source,...rest);};
  assert.equal(install(o).changed,false);assert.equal(copied.length,0);
  for(let i=0;i<2;i++){copied.length=0;const result=install({...o,repair:true});assert.equal(result.repaired,true);assert.equal(result.changed,true);assert.deepEqual(result.repairedFiles,[]);assert.equal(copied.length,6);}
 }finally{fs.copyFileSync=originalCopy;}
 assert.equal(fs.readdirSync(home).some(name=>/\.(stage|retired|transaction|install-lock)/.test(name)),false);
}));

const unsafeRepairCases=[
 ['unknown file',o=>fs.writeFileSync(path.join(o.adapterRoot,'foreign.txt'),'keep foreign'),/Unlisted/],
 ['unknown empty directory',o=>fs.mkdirSync(path.join(o.adapterRoot,'foreign-dir')),/Unlisted/],
 ['changed manifest',o=>fs.appendFileSync(path.join(o.adapterRoot,'MANIFEST.json'),' '),/manifest changed/],
 ['invalid manifest',o=>fs.writeFileSync(path.join(o.adapterRoot,'MANIFEST.json'),JSON.stringify({schemaVersion:9})),/manifest/],
 ['missing manifest',o=>fs.unlinkSync(path.join(o.adapterRoot,'MANIFEST.json')),/ENOENT/],
 ['changed wrapper host',o=>fs.writeFileSync(o.craftExe,'official fixture version B'),/Changed\/unowned/],
 ['changed original host',o=>fs.writeFileSync(original(o),'official fixture version B'),/Changed\/unowned/],
 ['missing host record',o=>fs.unlinkSync(hostRecordPath(o.craftExe)),/ownership record/],
 ['changed host owner',o=>{const f=hostRecordPath(o.craftExe),s=JSON.parse(fs.readFileSync(f));s.installId=crypto.randomUUID();fs.writeFileSync(f,JSON.stringify(s));},/another adapter owner/],
 ['same-id changed host ownership',o=>{const f=hostRecordPath(o.craftExe),s=JSON.parse(fs.readFileSync(f));s.ownership.wrapperSha256='a'.repeat(64);fs.writeFileSync(f,JSON.stringify(s));},/Host ownership changed/],
 ['changed config launch ownership',o=>{const s=JSON.parse(fs.readFileSync(statePath(o)));s.package.node='other.exe';fs.writeFileSync(statePath(o),JSON.stringify(s));},/launch ownership/],
 ['changed config kernel ownership',o=>{const s=JSON.parse(fs.readFileSync(statePath(o)));s.kernelExe=path.join(o.adapterRoot,'other.exe');fs.writeFileSync(statePath(o),JSON.stringify(s));},/kernel ownership/],
 ['changed config update gates',o=>{const s=JSON.parse(fs.readFileSync(statePath(o)));s.sameNameUpdateValidated=true;fs.writeFileSync(statePath(o),JSON.stringify(s));},/validation ownership/],
 ['changed config official runtime policy',o=>{const s=JSON.parse(fs.readFileSync(statePath(o)));s.officialAutoInstallEnabled=true;fs.writeFileSync(statePath(o),JSON.stringify(s));},/validation ownership/],
 ['unknown session lock',o=>{fs.mkdirSync(path.join(o.adapterRoot,'state'));fs.writeFileSync(path.join(o.adapterRoot,'state/session.lock'),'');},/Unknown\/incomplete/],
 ['matching stale session lock',o=>{fs.mkdirSync(path.join(o.adapterRoot,'state'));fs.writeFileSync(path.join(o.adapterRoot,'state/session.lock'),JSON.stringify({sessionId:'stale',pid:42}));fs.writeFileSync(path.join(o.adapterRoot,'state/session.json'),JSON.stringify({schemaVersion:1,sessionId:'stale',coordinatorPid:42}));},/Session lock/],
 ['immutable file replaced by directory',o=>{const f=path.join(o.adapterRoot,'node.exe');fs.unlinkSync(f);fs.mkdirSync(f);},/replaced by directory/],
 ['immutable file replaced by hardlink',o=>{const f=path.join(o.adapterRoot,'node.exe');fs.unlinkSync(f);fs.linkSync(path.join(o.packageRoot,'node.exe'),f);},/Linked/],
 ['immutable file replaced by symlink',o=>{const f=path.join(o.adapterRoot,'node.exe');fs.unlinkSync(f);fs.symlinkSync(path.join(o.packageRoot,'node.exe'),f);},/Linked/],
 ['mutable directory link',o=>fs.symlinkSync(o.packageRoot,path.join(o.adapterRoot,'state'),'dir'),/Linked/]
];
for(const [name,mutate,error] of unsafeRepairCases)test('repair refuses '+name+' without deleting the unexpected bytes',()=>fixture(home=>{
 const o=setup(home);install(o);mutate(o);const host=fileHash(o.craftExe),originalBytes=fs.readFileSync(original(o));
 assert.throws(()=>repair(o),error);assert.throws(()=>repair(o),error);
 assert.equal(fileHash(o.craftExe),host);assert.deepEqual(fs.readFileSync(original(o)),originalBytes);
 assert.equal(fs.readdirSync(home).some(name=>/\.(stage|retired|transaction|install-lock)/.test(name)),false);
}));

test('repair refuses a missing owner, different package, changed external host, busy lease and detached state',()=>fixture(home=>{
 const o=setup(home,'external');assert.throws(()=>repair(o),/existing owned/);assert.equal(fs.existsSync(o.adapterRoot),false);
 const installed=install(o);const other=payload(home,'other','2c');assert.throws(()=>repair({...o,packageRoot:other}),/exact installed package/);
 assert.throws(()=>install({...o,repair:'true'}),/explicitly/);
 fs.writeFileSync(o.craftExe,'official fixture version B');assert.throws(()=>repair(o),/Changed\/unowned/);fs.writeFileSync(o.craftExe,'official fixture version A');
 fs.mkdirSync(installed.state.stateDir);fs.writeFileSync(path.join(installed.state.stateDir,'session.json'),JSON.stringify({schemaVersion:1,hostPid:42}));assert.throws(()=>repair({...o,processCheck:()=>true}),/Close/);
 uninstall(statePath(o),o);assert.throws(()=>repair(o),/requires an installed adapter/);
}));

for(const phase of ['staged','published','host-replaced','recorded'])test('repair rollback at '+phase+' restores damaged bytes, config and mutable files exactly',()=>fixture(home=>{
 const o=setup(home),a=install(o);fs.writeFileSync(path.join(o.adapterRoot,'node.exe'),'damaged before repair');fs.unlinkSync(path.join(o.adapterRoot,'craft/session/api.mjs'));
 fs.mkdirSync(a.state.stateDir);fs.writeFileSync(path.join(a.state.stateDir,'settings.json'),'preserve');fs.mkdirSync(path.join(o.adapterRoot,'logs'));fs.writeFileSync(path.join(o.adapterRoot,'logs/first.log'),'preserve log');
 const before=tree(o.adapterRoot),host=fileHash(o.craftExe),backup=fileHash(original(o)),record=fs.readFileSync(hostRecordPath(o.craftExe)),progress=[];
 assert.throws(()=>repair({...o,failAt:phase,onProgress:p=>progress.push(p)}),/Injected/);
 assert.deepEqual(tree(o.adapterRoot),before);assert.equal(fileHash(o.craftExe),host);assert.equal(fileHash(original(o)),backup);assert.deepEqual(fs.readFileSync(hostRecordPath(o.craftExe)),record);assert.ok(progress.some(p=>p.stage==='rollback'));
 assert.equal(fs.readdirSync(home).some(name=>/\.(stage|retired|transaction|install-lock)/.test(name)),false);
 assert.equal(repair(o).changed,true);
}));

test('repair refuses concurrent unknown additions or official host changes before publication',()=>{
 for(const mutate of [o=>fs.writeFileSync(path.join(o.adapterRoot,'foreign.txt'),'foreign'),o=>fs.writeFileSync(o.craftExe,'official fixture version B')])fixture(home=>{
  const o=setup(home);install(o);fs.writeFileSync(path.join(o.adapterRoot,'node.exe'),'original damaged');
  assert.throws(()=>repair({...o,onPhase:phase=>{if(phase==='staged')mutate(o);}}),/changed during staging/);
  assert.equal(fs.readFileSync(path.join(o.adapterRoot,'node.exe'),'utf8'),'original damaged');
  assert.equal(fs.readdirSync(home).some(name=>/\.(stage|retired|transaction|install-lock)/.test(name)),false);
 });
});

test('repair refuses foreign writes during rollback and retains recovery evidence',()=>fixture(home=>{
 const o=setup(home);install(o);fs.writeFileSync(path.join(o.adapterRoot,'node.exe'),'damaged');
 assert.throws(()=>repair({...o,onPhase:phase=>{if(phase==='published'){fs.writeFileSync(path.join(o.adapterRoot,'foreign.txt'),'keep');throw Error('interrupted');}}}),/rollback incomplete/);
 assert.equal(fs.readFileSync(path.join(o.adapterRoot,'foreign.txt'),'utf8'),'keep');assert.ok(fs.readdirSync(home).some(name=>name.includes('.transaction-')));assert.ok(fs.readdirSync(home).some(name=>name.includes('.retired-')));
 assert.throws(()=>repair(o),/Unlisted/);
}));

test('install safely accepts an explicitly selected empty target directory',()=>fixture(home=>{
 const o=setup(home);fs.mkdirSync(o.adapterRoot);assert.equal(install(o).changed,true);assert.equal(readState(statePath(o)).status,'installed');
}));
for(const phase of ['staged','published','host-replaced','recorded'])test('empty-target installation rollback preserves the empty directory at '+phase,()=>fixture(home=>{
 const o=setup(home),before=fileHash(o.craftExe);fs.mkdirSync(o.adapterRoot);assert.throws(()=>install({...o,failAt:phase}),/Injected/);
 assert.deepEqual(fs.readdirSync(o.adapterRoot),[]);assert.equal(fileHash(o.craftExe),before);assert.equal(fs.existsSync(original(o)),false);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);assert.equal(install(o).changed,true);
}));
test('empty target receiving an unknown file during staging is never adopted or deleted',()=>fixture(home=>{
 const o=setup(home),before=fileHash(o.craftExe);fs.mkdirSync(o.adapterRoot);
 assert.throws(()=>install({...o,onPhase:phase=>{if(phase==='staged')fs.writeFileSync(path.join(o.adapterRoot,'foreign.txt'),'keep');}}),/changed during staging/);
 assert.equal(fs.readFileSync(path.join(o.adapterRoot,'foreign.txt'),'utf8'),'keep');assert.equal(fileHash(o.craftExe),before);
}));

for(const [current,next,accepted] of [['1.1.6.0c','1.1.5.9c',false],['1.1.6c','1.1.5c',false],['1.1.6.1c','1.1.6c',false],['1.1.6.0c','1.1.6c',true],['1.1.9c','1.1.10c',true],['1.2.0c','1.10.0c',true],['2.0.0c','1.99.99c',false],['1.1.6c','legacy',false]])test(`version gate ${accepted?'allows':'refuses'} ${current} -> ${next}`,()=>fixture(home=>{
 const o=setup(home);fs.rmSync(o.packageRoot,{recursive:true});o.packageRoot=payload(home,'payload',current);install(o);const before=tree(o.adapterRoot),host=fileHash(o.craftExe);o.packageRoot=payload(home,'next',next);
 if(accepted)assert.equal(install(o).state.package.version,next);else{assert.throws(()=>install(o),/downgrade|Cannot compare/);assert.deepEqual(tree(o.adapterRoot),before);assert.equal(fileHash(o.craftExe),host);}
}));

test('operation progress reports bounded stages and observer failures cannot interrupt a commit',()=>fixture(home=>{
 const o=setup(home),events=[],previousNow=Date.now;let now=1000;
 try{Date.now=()=>now;install({...o,onProgress:event=>events.push(event)});}finally{Date.now=previousNow;}
 for(const stage of ['validate-source','validate-owned','stage-package','verify-stage','publish','update-host','record-state','cleanup','complete'])assert.ok(events.some(event=>event.stage===stage),stage);
 for(const stage of ['validate-source','stage-package','verify-stage']){const progress=events.filter(event=>event.stage===stage);assert.ok(progress.length<=2);assert.equal(progress.at(-1).checked,5);assert.equal(progress.at(-1).total,5);}
 assert.equal(repair({...o,onProgress:()=>{throw Error('observer closed');}}).changed,true);
 const done=[];uninstall(statePath(o),{...o,onProgress:p=>done.push(p)});assert.equal(done.at(-1).stage,'complete');
}));

const manager=fileURLToPath(new URL('../craft/installer/manage.mjs',import.meta.url));
function cli(action,args){const child=spawnSync(process.execPath,[manager,action,...args],{encoding:'utf8'});assert.equal(child.error,undefined);const output=child.stdout.trim().split('\n');assert.equal(output.length,1,child.stdout);return {code:child.status,result:JSON.parse(output[0]),progress:child.stderr.trim()?child.stderr.trim().split('\n').map(line=>JSON.parse(line)):[]};}
const installCliArgs=o=>['--package',o.packageRoot,'--dest',o.adapterRoot,'--craft',o.craftExe,'--mode',o.mode];
test('CLI emits one versioned result, JSONL progress, explicit repair and unchanged outcomes',()=>fixture(home=>{
 const o=setup(home);let run=cli('install',installCliArgs(o));assert.equal(run.code,0);assert.equal(run.result.schemaVersion,1);assert.equal(run.result.type,'result');assert.equal(run.result.action,'install');assert.equal(run.result.status,'completed');assert.equal(run.result.ok,true);
 assert.ok(run.progress.length>0);for(const p of run.progress){assert.equal(p.type,'progress');assert.equal(p.schemaVersion,1);assert.equal(p.action,'install');assert.equal(typeof p.stage,'string');}
 run=cli('install',installCliArgs(o));assert.equal(run.result.status,'unchanged');assert.equal(run.result.changed,false);
 fs.unlinkSync(path.join(o.adapterRoot,'node.exe'));run=cli('repair',installCliArgs(o));assert.equal(run.code,0);assert.equal(run.result.action,'repair');assert.equal(run.result.status,'completed');assert.equal(run.result.repaired,true);assert.deepEqual(run.result.repairedFiles,['node.exe']);
 run=cli('repair',installCliArgs(o));assert.equal(run.code,0);assert.equal(run.result.changed,true);assert.deepEqual(run.result.repairedFiles,[]);
}));
test('CLI changed-host uninstall is an actionable warning on repeated attempts, never success',()=>fixture(home=>{
 const o=setup(home);install(o);fs.writeFileSync(o.craftExe,'official fixture version B');
 for(let i=0;i<2;i++){const run=cli('uninstall',['--state',statePath(o)]);assert.equal(run.code,2);assert.equal(run.result.ok,false);assert.equal(run.result.status,'warning');assert.equal(run.result.manualActionRequired,true);assert.equal(run.result.hostChanged,true);assert.equal(run.result.changed,false);assert.match(run.result.message,/preserved/);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version B');assert.equal(fs.existsSync(original(o)),true);}
}));
test('CLI refuses unsupported, duplicate, missing and action-inappropriate args with structured errors',()=>fixture(home=>{
 const o=setup(home),args=installCliArgs(o);
 for(const [action,bad] of [['unknown',[]],['install',[]],['install',[...args,'--dest',o.adapterRoot]],['install',[...args,'--repair','true']],['repair',[...args,'--state',statePath(o)]],['uninstall',['--state',statePath(o),'--package',o.packageRoot]],['repair',['--package','--dest',o.adapterRoot]]]){
  const run=cli(action,bad);assert.equal(run.code,1);assert.equal(run.result.ok,false);assert.equal(run.result.status,'error');assert.equal(run.result.type,'result');assert.equal(run.result.changed,null);assert.equal(run.progress.length,0);
 }
 assert.equal(fs.existsSync(o.adapterRoot),false);
}));
test('CLI recover-session no-op and disabled updater handoff remain explicit',()=>fixture(home=>{
 const o=setup(home);install(o);let run=cli('recover-session',['--state',statePath(o)]);assert.equal(run.code,0);assert.equal(run.result.status,'unchanged');
 run=cli('remount-verified-update',['--state',statePath(o),'--evidence','assertions.json']);assert.equal(run.code,1);assert.match(run.result.message,/disabled.*trusted Windows/);
}));

test('same-name repair recopies the package without rewriting either validated host executable',()=>fixture(home=>{
 const o=setup(home);install(o);const rename=fs.renameSync,copy=fs.copyFileSync,writes=[];
 try{
  fs.renameSync=(source,target)=>{if(target===o.craftExe||target===original(o))writes.push(target);return rename(source,target);};
  fs.copyFileSync=(source,target,...args)=>{if(target===o.craftExe||target===original(o))writes.push(target);return copy(source,target,...args);};
  assert.equal(repair(o).changed,true);assert.deepEqual(writes,[]);
 }finally{fs.renameSync=rename;fs.copyFileSync=copy;}
}));
test('repair preserves a host changed after publication and rolls its own package back',()=>fixture(home=>{
 const o=setup(home);install(o);fs.writeFileSync(path.join(o.adapterRoot,'node.exe'),'damaged');const before=tree(o.adapterRoot);
 assert.throws(()=>repair({...o,onPhase:phase=>{if(phase==='published')fs.writeFileSync(o.craftExe,'official fixture version B');}}),/Changed\/unowned/);
 assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version B');assert.deepEqual(tree(o.adapterRoot),before);assert.equal(fs.readFileSync(original(o),'utf8'),'official fixture version A');
}));
test('a dangling target link is rejected before empty-folder adoption',()=>fixture(home=>{
 const o=setup(home);fs.symlinkSync(path.join(home,'missing'),o.adapterRoot,'dir');assert.throws(()=>install(o),/Linked/);assert.equal(fs.lstatSync(o.adapterRoot).isSymbolicLink(),true);
}));

function singleEntry(root){const file=path.join(root,'MANIFEST.json'),m=JSON.parse(fs.readFileSync(file));m.launchMode='same-name';fs.writeFileSync(file,JSON.stringify(m));}
test('single original entry is the default and new package rejects external mode',()=>fixture(home=>{
 const o=setup(home);singleEntry(o.packageRoot);assert.throws(()=>install({...o,mode:'external'}),/external mode is retired/);
 delete o.mode;const result=install(o);assert.equal(result.state.installMode,'same-name');assert.equal(fileHash(o.craftExe),result.state.ownership.wrapperSha256);
}));
test('old external installation migrates to one original entry with preferences, identity and state preserved',()=>fixture(home=>{
 const o=setup(home,'external'),previous=install(o);fs.mkdirSync(previous.state.stateDir);fs.writeFileSync(path.join(previous.state.stateDir,'preferences.json'),'keep');
 const state=readState(statePath(o));state.customPreference={language:'zh-CN'};fs.writeFileSync(statePath(o),JSON.stringify(state));
 o.packageRoot=payload(home,'new','2c');singleEntry(o.packageRoot);o.mode='same-name';const result=install(o);
 assert.equal(result.state.installId,previous.state.installId);assert.equal(result.state.createdAt,previous.state.createdAt);assert.deepEqual(result.state.customPreference,state.customPreference);
 assert.equal(result.state.installMode,'same-name');assert.equal(fileHash(original(o)),previous.state.ownership.originalSha256);assert.equal(fileHash(o.craftExe),result.state.ownership.wrapperSha256);
 assert.equal(readState(hostRecordPath(o.craftExe)).installId,previous.state.installId);assert.equal(fs.readFileSync(path.join(result.state.stateDir,'preferences.json'),'utf8'),'keep');
 uninstall(statePath(o),o);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version A');
}));
for(const phase of ['staged','published','host-replaced','recorded'])test('legacy external migration rollback restores exact old installation at '+phase,()=>fixture(home=>{
 const o=setup(home,'external');install(o);const before=tree(o.adapterRoot),host=fileHash(o.craftExe);o.packageRoot=payload(home,'new','2c');singleEntry(o.packageRoot);o.mode='same-name';
 assert.throws(()=>install({...o,failAt:phase}),/Injected/);assert.deepEqual(tree(o.adapterRoot),before);assert.equal(fileHash(o.craftExe),host);assert.equal(fs.existsSync(original(o)),false);assert.equal(fs.existsSync(hostRecordPath(o.craftExe)),false);
}));
for(const status of ['installed','host-changed','update-unmounted'])test('explicit reinstall safely adopts known updated host from '+status,()=>fixture(home=>{
 const o=setup(home),a=install(o);if(status==='update-unmounted')prepareUpdateUnmount(statePath(o),o);
 fs.writeFileSync(o.craftExe,'official fixture version B');if(status==='host-changed')uninstall(statePath(o),o);
 const result=install(o);assert.equal(result.state.installId,a.state.installId);assert.equal(result.state.host.version,'beta.3');assert.equal(fs.readFileSync(original(o),'utf8'),'official fixture version B');
 uninstall(statePath(o),o);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version B');
}));
for(const phase of ['staged','published','host-replaced','recorded'])test('known official host adoption rolls back without restoring old host at '+phase,()=>fixture(home=>{
 const o=setup(home);install(o);fs.writeFileSync(o.craftExe,'official fixture version B');const before=tree(o.adapterRoot),record=fs.readFileSync(hostRecordPath(o.craftExe));
 assert.throws(()=>install({...o,failAt:phase}),/Injected/);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version B');assert.equal(fs.readFileSync(original(o),'utf8'),'official fixture version A');assert.deepEqual(tree(o.adapterRoot),before);assert.deepEqual(fs.readFileSync(hostRecordPath(o.craftExe)),record);
}));
test('unknown updated hosts and tampered backups are preserved and never implicitly adopted',()=>fixture(home=>{
 const o=setup(home);install(o);fs.writeFileSync(o.craftExe,'unknown official update');assert.throws(()=>install(o),/Unsupported Craft host/);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'unknown official update');assert.equal(fs.readFileSync(original(o),'utf8'),'official fixture version A');
 fs.writeFileSync(o.craftExe,'official fixture version B');fs.writeFileSync(original(o),'foreign backup');assert.throws(()=>install(o),/Changed\/unowned/);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version B');assert.equal(fs.readFileSync(original(o),'utf8'),'foreign backup');
}));
test('active or unknown official update lock blocks install, repair and uninstall',()=>fixture(home=>{
 const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);const lock=path.join(a.state.stateDir,'update.lock');fs.writeFileSync(lock,'{}');
 for(const action of [()=>install(o),()=>repair(o),()=>uninstall(statePath(o),o)])assert.throws(action,/Official update coordination/);
 assert.equal(fileHash(o.craftExe),a.state.ownership.wrapperSha256);
}));
test('CLI refuses retired external installation before touching host',()=>fixture(home=>{
 const o=setup(home,'external');const run=cli('install',installCliArgs(o));assert.equal(run.code,1);assert.match(run.result.message,/external enhanced launchers are retired/);assert.equal(fs.existsSync(o.adapterRoot),false);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version A');
}));

test('expired observed official update lock recovers only after all recorded processes exit',()=>fixture(home=>{
 const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);const id=crypto.randomUUID(),lock=path.join(a.state.stateDir,'update.lock');
 fs.writeFileSync(lock,JSON.stringify({schemaVersion:1,id,pid:42,deadline:'2026-01-01T00:00:00Z'}));
 fs.writeFileSync(path.join(a.state.stateDir,'update.json'),JSON.stringify({schemaVersion:2,id,helperPid:42,installerPid:43,hostPid:44,wrapperPid:45,installId:a.state.installId,craftExe:o.craftExe,state:'indeterminate',requestedAt:'2025-12-31T23:45:00Z'}));
 assert.throws(()=>recoverSessionLock(statePath(o),{processCheck:pid=>pid===43}),/still alive/);assert.equal(fs.existsSync(lock),true);
 const result=recoverSessionLock(statePath(o),{processCheck:()=>false});assert.equal(result.updateId,id);assert.equal(result.changed,true);assert.equal(fs.existsSync(lock),false);
}));
test('expired unobserved committed official install is never guessed complete',()=>fixture(home=>{
 const o=setup(home),a=install(o);fs.mkdirSync(a.state.stateDir);const id=crypto.randomUUID(),lock=path.join(a.state.stateDir,'update.lock');
 fs.writeFileSync(lock,JSON.stringify({schemaVersion:1,id,pid:42,deadline:'2026-01-01T00:00:00Z'}));
 const journal={schemaVersion:2,id,helperPid:42,installId:a.state.installId,craftExe:o.craftExe,state:'install-requested',requestedAt:'2025-12-31T23:45:00Z'};
 fs.writeFileSync(path.join(a.state.stateDir,'update.json'),JSON.stringify(journal));assert.throws(()=>recoverSessionLock(statePath(o),{processCheck:()=>false}),/completion is unknown/);assert.equal(fs.existsSync(lock),true);
 journal.state='prepared';delete journal.requestedAt;fs.writeFileSync(path.join(a.state.stateDir,'update.json'),JSON.stringify(journal));assert.equal(recoverSessionLock(statePath(o),{processCheck:()=>false}).changed,true);
}));

test('legacy external migration adopts only allowlisted already-updated host without restoring stale bytes',()=>fixture(home=>{
 const o=setup(home,'external'),a=install(o);fs.writeFileSync(o.craftExe,'unknown current');o.mode='same-name';assert.throws(()=>install(o),/Unsupported Craft host/);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'unknown current');
 fs.writeFileSync(o.craftExe,'official fixture version B');const result=install(o);assert.equal(result.state.installId,a.state.installId);assert.equal(result.state.host.version,'beta.3');assert.equal(fs.readFileSync(original(o),'utf8'),'official fixture version B');uninstall(statePath(o),o);assert.equal(fs.readFileSync(o.craftExe,'utf8'),'official fixture version B');
}));

test('official runtime policy is package-bound independently of historical acceptance flags',()=>fixture(home=>{
 const o=setup(home),file=path.join(o.packageRoot,'MANIFEST.json'),manifest=JSON.parse(fs.readFileSync(file));
 manifest.officialAutoInstallEnabled=true;manifest.officialCleanUpdateValidated=false;
 fs.writeFileSync(file,JSON.stringify(manifest));const result=install(o);
 assert.equal(result.state.officialAutoInstallEnabled,true);
 for(const field of ['updateObserverValidated','sameNameUpdateValidated','officialCleanUpdateValidated'])assert.equal(result.state[field],false);
 assert.equal(readState(statePath(o)).officialAutoInstallEnabled,true);
 const record=JSON.parse(fs.readFileSync(hostRecordPath(o.craftExe)));assert.equal(record.officialAutoInstallEnabled,true);
 assert.equal(repair(o).repaired,true);
 prepareUpdateUnmount(statePath(o),o);
 assert.throws(()=>remountAfterVerifiedUpdate(statePath(o),{expectedHostHash:fileHash(o.craftExe),version:'beta.2',provenance:'inert fixture'}, {...o,verifyUpdateReceipt:()=>true}),/not validated/,'opening clean policy never enables legacy remount route');
}));

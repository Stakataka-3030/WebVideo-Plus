import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const STATE_VERSION=1;
const mutable=new Set(['config.json','state','logs']);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const fileHash=file=>hash(fs.readFileSync(file));
const exists=file=>fs.existsSync(file);
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const within=(root,file)=>{const r=path.relative(path.resolve(root),path.resolve(file));return r!==''&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);};
const recordName='webvideo-craft.install.json';
export const hostRecordPath=craftExe=>path.join(path.dirname(path.resolve(craftExe)),recordName);
export function assertNoLinks(file){
 let current=path.resolve(file);
 for(;;){if(exists(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Linked/reparse path is not allowed: '+current);const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
function safeRelative(value){
 if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||value.includes('\0')||path.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(p)))throw Error('Unsafe package path: '+value);
 return value;
}
function readJson(file){assertNoLinks(file);return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function writeAtomic(file,bytes){
 assertNoLinks(file);fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+crypto.randomUUID();
 try{fs.writeFileSync(tmp,bytes,{flag:'wx'});fs.renameSync(tmp,file);}finally{if(exists(tmp))fs.unlinkSync(tmp);}
}
function writeJson(file,value){writeAtomic(file,JSON.stringify(value,null,2)+'\n');}
function walk(root){
 const result=[];
 for(const entry of fs.readdirSync(root,{withFileTypes:true})){const file=path.join(root,entry.name);assertNoLinks(file);if(entry.isDirectory())result.push(...walk(file));else if(entry.isFile())result.push(file);else throw Error('Non-regular package file: '+file);}
 return result;
}
export function verifyPackage(root,{allowMutable=false,onProgress}={}){
 root=path.resolve(root);assertNoLinks(root);const manifestPath=path.join(root,'MANIFEST.json'),manifest=readJson(manifestPath);
 if(manifest.schemaVersion!==1||manifest.product!=='WebVideo+ Craft'||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Unsupported Craft package manifest');
 if(!Array.isArray(manifest.supportedHosts)||!manifest.supportedHosts.length||manifest.supportedHosts.some(h=>!h.version||! /^[a-f0-9]{64}$/.test(h.sha256||'')))throw Error('Missing verified Craft host compatibility allowlist');
 // Verify each directory on entry and each file immediately before hashing.
 // Root ancestry is checked once, not once per dependency. No cross-call cache.
 const expected=new Map();
 for(const item of manifest.files){const relative=safeRelative(item.path),key=relative.toLowerCase();
  if(expected.has(key)||key==='manifest.json'||mutable.has(relative.split('/')[0].toLowerCase()))throw Error('Duplicate/reserved package path: '+relative);
  if(!Number.isSafeInteger(item.bytes)||item.bytes<0||! /^[a-f0-9]{64}$/.test(item.sha256||''))throw Error('Package integrity mismatch: '+relative);
  expected.set(key,item);
 }
 for(const key of ['entry','wrapper','node','kernel']){safeRelative(manifest[key]);if(!expected.has(manifest[key].toLowerCase()))throw Error('Missing launch contract: '+key);}
 const seen=new Set();let checked=0,lastProgress=0;
 const visit=directory=>{for(const name of fs.readdirSync(directory)){
  const file=path.join(directory,name),relative=path.relative(root,file).split(path.sep).join('/'),key=relative.toLowerCase();
  if(onProgress&&(lastProgress===0||Date.now()-lastProgress>=250)){onProgress({stage:'files',checked,total:manifest.files.length,path:relative});lastProgress=Date.now();}
  const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('Linked/reparse path is not allowed: '+file);
  if(stat.isDirectory()){visit(file);continue;}if(!stat.isFile())throw Error('Non-regular package file: '+file);
  if(seen.has(key))throw Error('Duplicate package filesystem path: '+relative);seen.add(key);
  if(relative==='MANIFEST.json'||allowMutable&&mutable.has(relative.split('/')[0].toLowerCase()))continue;
  const item=expected.get(key);if(!item)throw Error('Unlisted package file: '+relative);
  if(stat.size!==item.bytes||fileHash(file)!==item.sha256)throw Error('Package integrity mismatch: '+relative);checked++;
 }};
 onProgress?.({stage:'tree',checked:0,total:manifest.files.length});visit(root);
 for(const [key,item] of expected)if(!seen.has(key))throw Error('Package integrity mismatch: '+item.path);
 onProgress?.({stage:'verified',checked,total:manifest.files.length});
 return {...manifest,manifestSha256:fileHash(manifestPath)};
}
function validateState(state,statePath){
 if(state.schemaVersion!==1||state.stateVersion!==STATE_VERSION||! /^[a-f0-9-]{36}$/.test(state.installId||''))throw Error('Invalid Craft installation ownership');
 for(const key of ['craftExe','adapterRoot','kernelExe','stateDir']){if(typeof state[key]!=='string'||!path.isAbsolute(state[key]))throw Error('Invalid state path: '+key);assertNoLinks(state[key]);}
 if(!same(statePath,path.join(state.adapterRoot,'config.json'))&&!same(statePath,hostRecordPath(state.craftExe)))throw Error('State path does not match its owner');
 if(!same(state.stateDir,path.join(state.adapterRoot,'state'))||!within(state.adapterRoot,state.kernelExe)||same(state.adapterRoot,path.dirname(state.craftExe))||within(path.dirname(state.craftExe),state.adapterRoot)||within(state.adapterRoot,path.dirname(state.craftExe)))throw Error('Adapter state must remain outside the host install tree');
 if(!['external','same-name'].includes(state.installMode))throw Error('Invalid install mode');
 const expected=state.installMode==='same-name'?path.join(path.dirname(state.craftExe),'webgal-craft.webvideo-original.exe'):state.craftExe;
 if(!same(state.originalExe,expected))throw Error('Original executable path is not owned');
 for(const key of ['originalSha256','wrapperSha256'])if(!/^[a-f0-9]{64}$/.test(state.ownership?.[key]||''))throw Error('Invalid ownership hash');
 return state;
}
export function readState(file){return validateState(readJson(file),path.resolve(file));}
function processAlive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}
export function assertIdle(state,{processCheck=processAlive,allowCoordinatorSelf=false}={}){
 const sessionLock=path.join(state.stateDir,'session.lock');
 if(exists(sessionLock)){
  let owner;try{owner=readJson(sessionLock);}catch{throw Error('Unknown/incomplete session lock; refuse installation mutation');}
  if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.sessionId!=='string')throw Error('Unknown session lock owner');
  if(!(allowCoordinatorSelf&&owner.pid===process.pid))throw Error('Session lock is present; close session or explicitly recover a stale lock');
 }
 const leasePath=path.join(state.stateDir,'session.json');if(!exists(leasePath))return;
 const lease=readJson(leasePath);if(lease.schemaVersion!==1)throw Error('Unknown active-session lease');
 for(const key of ['hostPid','wrapperPid','coordinatorPid']){const pid=Number(lease[key]);if(!Number.isSafeInteger(pid)||pid<=0)continue;if(key==='coordinatorPid'&&allowCoordinatorSelf&&pid===process.pid)continue;if(processCheck(pid,lease,key))throw Error('Close the owned Craft/session process before changing installation: '+key);}
}
function lock(root,body){
 assertNoLinks(root);fs.mkdirSync(path.dirname(root),{recursive:true});const dir=root+'.install-lock';fs.mkdirSync(dir);
 try{return body();}finally{fs.rmdirSync(dir);}
}
function hostLock(craftExe,body){return lock(craftExe+'.webvideo',body);}
function snapshot(file){return exists(file)?fs.readFileSync(file):null;}
function restore(file,bytes){if(bytes===null){if(exists(file))fs.unlinkSync(file);}else writeAtomic(file,bytes);}
function checkExpected(file,expected){if(!exists(file)||fileHash(file)!==expected)throw Error('Changed/unowned executable: '+file);}
function fail(options,phase){options.onPhase?.(phase);if(options.failAt===phase)throw Error('Injected transaction failure at '+phase);}
function fingerprint(file){return exists(file)?fileHash(file):null;}
function treeHash(root){
 const entries=[];const visit=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,item.name);assertNoLinks(file);entries.push([path.relative(root,file),item.isDirectory()?'directory':fileHash(file)]);if(item.isDirectory())visit(file);}};visit(root);return hash(JSON.stringify(entries));
}
function ownedChange(changes,file,bytes,before,{exclusive=false}={}){
 if(fingerprint(file)!==(before===null?null:hash(before)))throw Error('Concurrent change before write: '+file);
 if(exclusive)fs.writeFileSync(file,bytes,{flag:'wx'});else writeAtomic(file,bytes);
 changes.push({file,before,after:hash(bytes)});
}
function ownedDelete(changes,file,before){if(fingerprint(file)!==(before===null?null:hash(before)))throw Error('Concurrent change before delete: '+file);if(before!==null){fs.unlinkSync(file);changes.push({file,before,after:null});}}
function validateChanges(changes){for(const item of changes)if(fingerprint(item.file)!==item.after)throw Error('Foreign change prevents rollback: '+item.file);}
function rollbackChanges(changes){for(const item of [...changes].reverse())restore(item.file,item.before);}
function copyPackage(source,destination,manifest){fs.mkdirSync(destination);for(const entry of manifest.files){const target=path.join(destination,...entry.path.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,...entry.path.split('/')),target);}fs.copyFileSync(path.join(source,'MANIFEST.json'),path.join(destination,'MANIFEST.json'));verifyPackage(destination);}
function preserveMutable(source,destination){for(const name of ['state','logs'])if(exists(path.join(source,name))){walk(path.join(source,name));fs.cpSync(path.join(source,name),path.join(destination,name),{recursive:true,errorOnExist:true});}}

export function install(options){
 const packageRoot=path.resolve(options.packageRoot),adapterRoot=path.resolve(options.adapterRoot),craftExe=path.resolve(options.craftExe),mode=options.mode||'external';
 if(!['external','same-name'].includes(mode)||path.basename(craftExe).toLowerCase()!=='webgal-craft.exe')throw Error('Select a valid Craft executable and install mode');
 if(same(packageRoot,adapterRoot)||within(packageRoot,adapterRoot)||within(adapterRoot,packageRoot)||same(adapterRoot,path.dirname(craftExe))||within(path.dirname(craftExe),adapterRoot)||within(adapterRoot,path.dirname(craftExe)))throw Error('Package, adapter and host directories must be isolated');
 for(const file of [packageRoot,adapterRoot,craftExe])assertNoLinks(file);
 const manifest=verifyPackage(packageRoot);if(!exists(craftExe))throw Error('Craft executable is missing');
 return hostLock(craftExe,()=>lock(adapterRoot,()=>{
  const config=path.join(adapterRoot,'config.json'),record=hostRecordPath(craftExe),backup=path.join(path.dirname(craftExe),'webgal-craft.webvideo-original.exe');
  let previous=null;
  if(exists(adapterRoot)){if(!exists(config))throw Error('Refusing to adopt an unowned adapter directory');previous=readState(config);if(!same(previous.craftExe,craftExe)||previous.installMode!==mode)throw Error('Existing adapter belongs to another host/mode');assertIdle(previous,options);const priorManifest=verifyPackage(adapterRoot,{allowMutable:true});if(priorManifest.manifestSha256!==previous.package.manifestSha256)throw Error('Previous package manifest changed');}
  if(exists(record)){const owned=readState(record);if(!previous||owned.installId!==previous.installId)throw Error('Host already has another adapter owner');}
  if(mode==='same-name'){
   if(previous?.status==='installed'){checkExpected(craftExe,previous.ownership.wrapperSha256);checkExpected(backup,previous.ownership.originalSha256);}
   else {if(exists(backup)||exists(record))throw Error('Unowned recovery file or host record exists');}
  }else if(previous?.status==='installed')checkExpected(craftExe,previous.ownership.originalSha256);
  const originalHash=previous?.status==='installed'?previous.ownership.originalSha256:fileHash(craftExe);
  const supportedHost=manifest.supportedHosts.find(h=>h.sha256===originalHash);if(!supportedHost)throw Error('Unsupported Craft host: this package has no verified bridge compatibility for its executable hash');
  if(previous?.status==='installed'&&previous.package.manifestSha256===manifest.manifestSha256)return {changed:false,state:previous};
  const wrapperHash=manifest.files.find(f=>f.path===manifest.wrapper).sha256;
  const state={schemaVersion:1,stateVersion:STATE_VERSION,installId:previous?.installId||crypto.randomUUID(),craftExe,originalExe:mode==='same-name'?backup:craftExe,installMode:mode,adapterRoot,kernelExe:path.join(adapterRoot,...manifest.kernel.split('/')),stateDir:path.join(adapterRoot,'state'),host:{sha256:originalHash,version:supportedHost.version,reportedVersion:options.hostVersion||previous?.host.reportedVersion||''},supportedHosts:Object.fromEntries(manifest.supportedHosts.map(h=>[h.version,h.sha256])),ownership:{wrapperSha256:wrapperHash,originalSha256:originalHash},package:{version:manifest.version,manifestSha256:manifest.manifestSha256,entry:manifest.entry,node:manifest.node,wrapper:manifest.wrapper},createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),status:'installed',updateObserverValidated:manifest.updateObserverValidated===true,sameNameUpdateValidated:manifest.sameNameUpdateValidated===true};
  const id=crypto.randomUUID(),stage=adapterRoot+'.stage-'+id,retired=adapterRoot+'.retired-'+id,journal=adapterRoot+'.transaction-'+id+'.json';
  const beforeExe=snapshot(craftExe),beforeBackup=snapshot(backup),beforeRecord=snapshot(record),changes=[];const previousTree=previous?treeHash(adapterRoot):null;let moved=false,published=false,stageTree=null;
  writeJson(journal,{schemaVersion:1,operation:'install',installId:state.installId,adapterRoot,stage,retired,craftExe,expectedBeforeSha256:hash(beforeExe),phase:'staging'});
  try{
   copyPackage(packageRoot,stage,manifest);if(previous)preserveMutable(adapterRoot,stage);writeJson(path.join(stage,'config.json'),state);stageTree=treeHash(stage);fail(options,'staged');
   if(previous){if(treeHash(adapterRoot)!==previousTree)throw Error('Existing adapter changed during staging');fs.renameSync(adapterRoot,retired);moved=true;}fs.renameSync(stage,adapterRoot);published=true;fail(options,'published');
   if(mode==='same-name'){
    if(!previous||previous.status!=='installed')ownedChange(changes,backup,beforeExe,beforeBackup,{exclusive:true});
    ownedChange(changes,craftExe,fs.readFileSync(path.join(adapterRoot,...manifest.wrapper.split('/'))),beforeExe);fail(options,'host-replaced');
    ownedChange(changes,record,Buffer.from(JSON.stringify(state,null,2)+'\n'),beforeRecord);
   }
   fail(options,'recorded');let retainedRecovery=null;if(moved){if(treeHash(retired)===previousTree)fs.rmSync(retired,{recursive:true});else retainedRecovery=retired;}fs.unlinkSync(journal);return {changed:true,state,retainedRecovery};
  }catch(error){
   try{
    validateChanges(changes);
    if(published&&treeHash(adapterRoot)!==stageTree)throw Error('Foreign adapter change prevents rollback');
    if(moved&&(treeHash(retired)!==previousTree||!published&&exists(adapterRoot)))throw Error('Foreign recovery/target change prevents rollback');
    if(exists(stage)&&stageTree!==null&&treeHash(stage)!==stageTree)throw Error('Foreign staging change prevents rollback');
    rollbackChanges(changes);if(published)fs.rmSync(adapterRoot,{recursive:true});if(moved)fs.renameSync(retired,adapterRoot);if(exists(stage))fs.rmSync(stage,{recursive:true});fs.unlinkSync(journal);
   }catch(rollback){error.message+='; rollback incomplete, retain recovery journal '+journal+': '+rollback.message;}
   throw error;
  }
 }));
}

export function uninstall(statePath,options={}){
 const initial=readState(statePath);return hostLock(initial.craftExe,()=>lock(initial.adapterRoot,()=>{
  const state=readState(path.join(initial.adapterRoot,'config.json'));assertIdle(state,options);
  if(state.status==='detached')return {changed:false,state,hostChanged:false};
  const record=hostRecordPath(state.craftExe),config=path.join(state.adapterRoot,'config.json');
  if(state.installMode==='external'){state.status='detached';state.detachedAt=new Date().toISOString();writeJson(config,state);return {changed:true,state,hostChanged:false};}
  if(exists(record)&&readState(record).installId!==state.installId)throw Error('Host ownership changed');
  checkExpected(state.originalExe,state.ownership.originalSha256);
  const current=fileHash(state.craftExe);
  if(current!==state.ownership.wrapperSha256){
   // An official update (or another owner) replaced the target. Never restore
   // an older executable over it. Keep recovery and explicit diagnostic state.
   state.status='host-changed';state.observedHostSha256=current;writeJson(config,state);return {changed:false,state,hostChanged:true};
  }
  const beforeExe=snapshot(state.craftExe),beforeConfig=snapshot(config),beforeRecord=snapshot(record),beforeBackup=snapshot(state.originalExe),changes=[];
  try{
   ownedChange(changes,state.craftExe,beforeBackup,beforeExe);fail(options,'host-restored');state.status=options.forUpdate?'update-unmounted':'detached';state.detachedAt=new Date().toISOString();ownedChange(changes,config,Buffer.from(JSON.stringify(state,null,2)+'\n'),beforeConfig);
   ownedDelete(changes,record,beforeRecord);fail(options,'record-removed');
   // Keep the exact backup for update handoff; its process may still be mapped.
   if(!options.forUpdate)ownedDelete(changes,state.originalExe,beforeBackup);
   return {changed:true,state,hostChanged:false};
  }catch(error){try{validateChanges(changes);rollbackChanges(changes);}catch(rollback){error.message+='; rollback refused foreign change: '+rollback.message;}throw error;}
 }));
}
export function prepareUpdateUnmount(statePath,options={}){return uninstall(statePath,{...options,forUpdate:true,allowCoordinatorSelf:true});}
export function remountAfterVerifiedUpdate(statePath,evidence,options={}){
 const state=readState(statePath);
 if(state.status!=='update-unmounted'&&state.status!=='host-changed')throw Error('No explicit update handoff is pending');
 if(!evidence||! /^[a-f0-9]{64}$/.test(evidence.expectedHostHash||'')||!evidence.version||!evidence.provenance)throw Error('Verified official update evidence is required');
 if(typeof options.verifyUpdateReceipt!=='function'||options.verifyUpdateReceipt({state,evidence})!==true)throw Error('A trusted coordinator must verify official update completion; JSON assertions alone are insufficient');
 assertIdle(state,options);checkExpected(state.craftExe,evidence.expectedHostHash);
 if(state.installMode!=='same-name')throw Error('External mode does not need executable remount');
 const manifest=verifyPackage(state.adapterRoot,{allowMutable:true});if(manifest.manifestSha256!==state.package.manifestSha256)throw Error('Adapter package changed');
 if(manifest.updateObserverValidated!==true||manifest.sameNameUpdateValidated!==true)throw Error('This package has not validated the native updater completion and wrapper release gates');
 if(!manifest.supportedHosts.some(h=>h.sha256===evidence.expectedHostHash&&h.version===evidence.version))throw Error('Updated host is not in the verified compatibility allowlist');
 return hostLock(state.craftExe,()=>lock(state.adapterRoot,()=>{
  checkExpected(state.craftExe,evidence.expectedHostHash);checkExpected(state.originalExe,state.ownership.originalSha256);
  const record=hostRecordPath(state.craftExe);if(exists(record)&&readState(record).installId!==state.installId)throw Error('Host ownership changed');
  const config=path.join(state.adapterRoot,'config.json'),beforeExe=snapshot(state.craftExe),beforeBackup=snapshot(state.originalExe),beforeConfig=snapshot(config),beforeRecord=snapshot(record),changes=[];
  try{ownedChange(changes,state.originalExe,beforeExe,beforeBackup);ownedChange(changes,state.craftExe,fs.readFileSync(path.join(state.adapterRoot,...manifest.wrapper.split('/'))),beforeExe);fail(options,'host-replaced');state.ownership.originalSha256=evidence.expectedHostHash;state.host={sha256:evidence.expectedHostHash,version:evidence.version};state.updateEvidence={...evidence};state.status='installed';ownedChange(changes,config,Buffer.from(JSON.stringify(state,null,2)+'\n'),beforeConfig);ownedChange(changes,record,Buffer.from(JSON.stringify(state,null,2)+'\n'),beforeRecord);return {changed:true,state};}
  catch(error){try{validateChanges(changes);rollbackChanges(changes);}catch(rollback){error.message+='; rollback refused foreign change: '+rollback.message;}throw error;}
 }));
}

export function recoverSessionLock(statePath,{processCheck=processAlive}={}){
 const state=readState(statePath);return hostLock(state.craftExe,()=>lock(state.adapterRoot,()=>{
  const file=path.join(state.stateDir,'session.lock');if(!exists(file))return {changed:false};
  const before=snapshot(file),owner=readJson(file),lease=readJson(path.join(state.stateDir,'session.json'));
  if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||!owner.sessionId||lease.sessionId!==owner.sessionId)throw Error('Stale session ownership cannot be established');
  for(const pid of [owner.pid,lease.coordinatorPid,lease.hostPid,lease.wrapperPid].filter(p=>Number.isSafeInteger(p)&&p>0))if(processCheck(pid,lease))throw Error('A recorded session process is still alive');
  if(fingerprint(file)!==hash(before))throw Error('Session lock changed during recovery');
  fs.unlinkSync(file);return {changed:true,sessionId:owner.sessionId};
 }));
}

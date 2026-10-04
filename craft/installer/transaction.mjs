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
 for(;;){
  let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(stat&&(stat.isSymbolicLink()||stat.isFile()&&stat.nlink>1))throw Error('Linked/reparse path is not allowed: '+current);
  const parent=path.dirname(current);if(parent===current)break;current=parent;
 }
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
export function verifyPackage(root,options={}){return inspectPackage(root,options);}
// Only install's explicit repair path may accept damaged declared files. Manifest,
// tree shape and ownership checks remain mandatory before staging any replacement.
function inspectPackage(root,{allowMutable=false,onProgress}={},repairState=null){
 root=path.resolve(root);assertNoLinks(root);const manifestPath=path.join(root,'MANIFEST.json');assertNoLinks(manifestPath);
 const manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/,''));
 if(manifest.schemaVersion!==1||manifest.product!=='WebVideo+ Craft'||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Unsupported Craft package manifest');
 if(!Array.isArray(manifest.supportedHosts)||!manifest.supportedHosts.length||manifest.supportedHosts.some(h=>!h.version||! /^[a-f0-9]{64}$/.test(h.sha256||'')))throw Error('Missing verified Craft host compatibility allowlist');
 // Verify each directory on entry and each file immediately before hashing.
 // Root ancestry is checked once, not once per dependency. No cross-call cache.
 const expected=new Map(),directories=new Set();
 for(const item of manifest.files){const relative=safeRelative(item.path),key=relative.toLowerCase();
  if(expected.has(key)||key==='manifest.json'||mutable.has(relative.split('/')[0].toLowerCase()))throw Error('Duplicate/reserved package path: '+relative);
  if(!Number.isSafeInteger(item.bytes)||item.bytes<0||! /^[a-f0-9]{64}$/.test(item.sha256||''))throw Error('Package integrity mismatch: '+relative);
  expected.set(key,item);
  const parts=key.split('/');for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));
 }
 for(const key of directories)if(expected.has(key)||key==='manifest.json')throw Error('Conflicting package file/directory path: '+key);
 for(const key of ['entry','wrapper','node','kernel']){safeRelative(manifest[key]);if(!expected.has(manifest[key].toLowerCase()))throw Error('Missing launch contract: '+key);}
 if(repairState&&hash(manifestBytes)!==repairState.package?.manifestSha256)throw Error('Previous package manifest changed');
 const seen=new Set(),damagedFiles=[];let checked=0,lastProgress=0;
 const visit=directory=>{for(const name of fs.readdirSync(directory)){
  const file=path.join(directory,name),relative=path.relative(root,file).split(path.sep).join('/'),key=relative.toLowerCase();
  if(onProgress&&(lastProgress===0||Date.now()-lastProgress>=250)){onProgress({stage:'files',checked,total:manifest.files.length,path:relative});lastProgress=Date.now();}
  const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||stat.isFile()&&stat.nlink>1)throw Error('Linked/reparse path is not allowed: '+file);
  if(seen.has(key))throw Error('Duplicate package filesystem path: '+relative);seen.add(key);
  const top=relative.split('/')[0].toLowerCase(),isMutable=allowMutable&&mutable.has(top);
  if(repairState&&isMutable&&relative.split('/')[0]!==top)throw Error('Mutable ownership path casing changed: '+relative);
  if(stat.isDirectory()){
   if(expected.has(key)||key==='manifest.json'||top==='config.json')throw Error('Package file replaced by directory: '+relative);
   if(repairState&&!isMutable&&!directories.has(key))throw Error('Unlisted package directory: '+relative);
   visit(file);continue;
  }
  if(!stat.isFile())throw Error('Non-regular package file: '+file);
  if(isMutable&&['state','logs'].includes(key))throw Error('Mutable directory replaced by file: '+relative);
  if(relative==='MANIFEST.json'||isMutable)continue;
  const item=expected.get(key);if(!item)throw Error('Unlisted package file: '+relative);
  if(stat.size!==item.bytes||fileHash(file)!==item.sha256){if(!repairState)throw Error('Package integrity mismatch: '+relative);damagedFiles.push(relative);}checked++;
 }};
 onProgress?.({stage:'tree',checked:0,total:manifest.files.length});visit(root);
 for(const [key,item] of expected)if(!seen.has(key)){if(!repairState)throw Error('Package integrity mismatch: '+item.path);damagedFiles.push(item.path);checked++;}
 onProgress?.({stage:'verified',checked,total:manifest.files.length});
 const manifestSha256=fileHash(manifestPath);
 if(manifestSha256!==hash(manifestBytes))throw Error('Package manifest changed during verification');
 if(repairState&&manifestSha256!==repairState.package.manifestSha256)throw Error('Previous package manifest changed');
 return {...manifest,manifestSha256,...(repairState?{damagedFiles}:{})};
}
function validateState(state,statePath){
 if(state.schemaVersion!==1||state.stateVersion!==STATE_VERSION||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(state.installId||''))throw Error('Invalid Craft installation ownership');
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
 const updateLock=path.join(state.stateDir,'update.lock');
 if(exists(updateLock))throw Error('Official update coordination is still active; wait for completion or review the retained update record before changing installation');
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
function checkExpected(file,expected){assertNoLinks(file);if(!exists(file)||fileHash(file)!==expected)throw Error('Changed/unowned executable: '+file);}
function fail(options,phase){options.onPhase?.(phase);if(options.failAt===phase)throw Error('Injected transaction failure at '+phase);}
function fingerprint(file){return exists(file)?fileHash(file):null;}
function treeHash(root){
 assertNoLinks(root);const entries=[];const visit=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,item.name);assertNoLinks(file);if(!item.isDirectory()&&!item.isFile())throw Error('Non-regular package file: '+file);entries.push([path.relative(root,file),item.isDirectory()?'directory':fileHash(file)]);if(item.isDirectory())visit(file);}};visit(root);return hash(JSON.stringify(entries));
}
function ownedChange(changes,file,bytes,before,{exclusive=false}={}){
 if(fingerprint(file)!==(before===null?null:hash(before)))throw Error('Concurrent change before write: '+file);
 if(exclusive)fs.writeFileSync(file,bytes,{flag:'wx'});else writeAtomic(file,bytes);
 changes.push({file,before,after:hash(bytes)});
}
function ownedDelete(changes,file,before){if(fingerprint(file)!==(before===null?null:hash(before)))throw Error('Concurrent change before delete: '+file);if(before!==null){fs.unlinkSync(file);changes.push({file,before,after:null});}}
function validateChanges(changes){for(const item of changes)if(fingerprint(item.file)!==item.after)throw Error('Foreign change prevents rollback: '+item.file);}
function rollbackChanges(changes){for(const item of [...changes].reverse())restore(item.file,item.before);}
function progressReporter(options){
 let lastStage=null,lastAt=0;
 return (stage,details={},force=false)=>{
  const now=Date.now();if(!force&&stage===lastStage&&now-lastAt<250)return;lastStage=stage;lastAt=now;
  // A disconnected progress observer must not interrupt or misreport a commit.
  try{options.onProgress?.({stage,...details});}catch{}
 };
}
function verificationProgress(report,stage){return event=>report(stage,{checked:event.checked,total:event.total,...(event.path?{path:event.path}:{})},event.stage==='verified');}
function copyPackage(source,destination,manifest,report){
 fs.mkdirSync(destination);let checked=0;report('stage-package',{checked,total:manifest.files.length});
 for(const entry of manifest.files){const target=path.join(destination,...entry.path.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,...entry.path.split('/')),target);report('stage-package',{checked:++checked,total:manifest.files.length,path:entry.path});}
 fs.copyFileSync(path.join(source,'MANIFEST.json'),path.join(destination,'MANIFEST.json'));report('stage-package',{checked,total:manifest.files.length},true);
 const copied=verifyPackage(destination,{onProgress:verificationProgress(report,'verify-stage')});if(copied.manifestSha256!==manifest.manifestSha256)throw Error('Source package manifest changed during staging');
}
function validateRepairOwner(state,manifest,record,{allowRecovery=false}={}){
 if(state.status!=='installed'&&!(allowRecovery&&['host-changed','update-unmounted','detached'].includes(state.status)))throw Error('Repair requires an installed adapter; detached or update-pending ownership cannot be repaired');
 if(typeof state.package?.version!=='string'||state.package.version!==manifest.version||state.package.manifestSha256!==manifest.manifestSha256)throw Error('Repair package does not match installation ownership');
 for(const key of ['entry','node','wrapper'])if(state.package[key]!==manifest[key])throw Error('Repair launch ownership changed: '+key);
 if(!same(state.kernelExe,path.join(state.adapterRoot,...manifest.kernel.split('/'))))throw Error('Repair kernel ownership changed');
 const wrapper=manifest.files.find(item=>item.path===manifest.wrapper),host=manifest.supportedHosts.find(item=>item.sha256===state.ownership.originalSha256&&item.version===state.host?.version);
 if(!wrapper||wrapper.sha256!==state.ownership.wrapperSha256||!host||state.host?.sha256!==state.ownership.originalSha256)throw Error('Repair executable ownership changed');
 for(const key of ['updateObserverValidated','sameNameUpdateValidated','officialCleanUpdateValidated','officialAutoInstallEnabled'])if(state[key]!== (manifest[key]===true)&&!(['officialCleanUpdateValidated','officialAutoInstallEnabled'].includes(key)&&state[key]===undefined&&manifest[key]!==true))throw Error('Repair update validation ownership changed');
 if(state.installMode==='external'){if(record)throw Error('External adapter has an unexpected host owner record');return;}
 if(!record){if(allowRecovery&&['update-unmounted','detached'].includes(state.status))return;throw Error('Repair requires the matching host ownership record');}
 for(const key of ['installId','installMode','status'])if(record[key]!==state[key]&&!(allowRecovery&&key==='status'&&state.status!=='installed'&&record.status==='installed'))throw Error('Host ownership changed: '+key);
 for(const key of ['craftExe','originalExe','adapterRoot','kernelExe','stateDir'])if(!same(record[key],state[key]))throw Error('Host ownership changed: '+key);
 for(const key of ['originalSha256','wrapperSha256'])if(record.ownership[key]!==state.ownership[key])throw Error('Host ownership changed: '+key);
 for(const key of ['version','manifestSha256','entry','node','wrapper'])if(record.package?.[key]!==state.package[key])throw Error('Host package ownership changed: '+key);
 if(record.host?.sha256!==state.host.sha256||record.host?.version!==state.host.version)throw Error('Host version ownership changed');
}

function assertNoDowngrade(previous,incoming){
 // Craft product and installer versions differ only by an optional build field.
 const parse=value=>{const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?c$/.exec(value||'');return m?m.slice(1).map(n=>BigInt(n||'0')):null;};
 const before=parse(previous),after=parse(incoming);if(!before)return;
 if(!after)throw Error('Cannot compare incoming Craft package version with installed version '+previous);
 for(let i=0;i<before.length;i++){if(after[i]>before[i])return;if(after[i]<before[i])throw Error('Craft package downgrade is not allowed: '+previous+' -> '+incoming);}
}
function readOwnedSnapshot(file){assertNoLinks(file);const bytes=fs.readFileSync(file);return {bytes,state:validateState(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),path.resolve(file))};}
function preserveMutable(source,destination){for(const name of ['state','logs'])if(exists(path.join(source,name))){walk(path.join(source,name));fs.cpSync(path.join(source,name),path.join(destination,name),{recursive:true,errorOnExist:true});}}

export function install(options){
 const report=progressReporter(options),repair=options.repair===true;
 if(options.repair!==undefined&&typeof options.repair!=='boolean')throw Error('Repair must be explicitly true or false');
 const packageRoot=path.resolve(options.packageRoot),adapterRoot=path.resolve(options.adapterRoot),craftExe=path.resolve(options.craftExe),mode=options.mode||'same-name';
 if(!['external','same-name'].includes(mode)||path.basename(craftExe).toLowerCase()!=='webgal-craft.exe')throw Error('Select a valid Craft executable and install mode');
 if(same(packageRoot,adapterRoot)||within(packageRoot,adapterRoot)||within(adapterRoot,packageRoot)||same(adapterRoot,path.dirname(craftExe))||within(path.dirname(craftExe),adapterRoot)||within(adapterRoot,path.dirname(craftExe)))throw Error('Package, adapter and host directories must be isolated');
 for(const file of [packageRoot,adapterRoot,craftExe])assertNoLinks(file);
 const manifest=verifyPackage(packageRoot,{onProgress:verificationProgress(report,'validate-source')});
 if(manifest.launchMode==='same-name'&&mode!=='same-name')throw Error('This Craft package only replaces the original entry; external mode is retired');if(!exists(craftExe))throw Error('Craft executable is missing');
 return hostLock(craftExe,()=>lock(adapterRoot,()=>{
  report('validate-owned');
  const config=path.join(adapterRoot,'config.json'),record=hostRecordPath(craftExe),backup=path.join(path.dirname(craftExe),'webgal-craft.webvideo-original.exe');
  let previous=null,priorManifest=null,owned=null,previousBytes=null,recordBytes=null;
  const targetExisted=exists(adapterRoot);let previousTree=null;
  if(targetExisted){
   if(!fs.lstatSync(adapterRoot).isDirectory())throw Error('Adapter target is not a directory');
   if(!exists(config)){if(fs.readdirSync(adapterRoot).length!==0)throw Error('Refusing to adopt an unowned adapter directory');previousTree=treeHash(adapterRoot);}
   else{
    const snapshot=readOwnedSnapshot(config);previous=snapshot.state;previousBytes=snapshot.bytes;
    const migrating=previous.installMode==='external'&&mode==='same-name'&&!repair;
    if(!same(previous.craftExe,craftExe)||previous.installMode!==mode&&!migrating)throw Error('Existing adapter belongs to another host/mode');
    assertIdle(previous,options);previousTree=treeHash(adapterRoot);
    priorManifest=inspectPackage(adapterRoot,{allowMutable:true,onProgress:verificationProgress(report,'validate-owned')},repair?previous:null);
    if(priorManifest.manifestSha256!==previous.package?.manifestSha256)throw Error('Previous package manifest changed');
    assertNoDowngrade(priorManifest.version,manifest.version);
   }
   if(treeHash(adapterRoot)!==previousTree)throw Error('Existing adapter changed during verification');
  }
  if(repair&&!previous)throw Error('Repair requires an existing owned installation');
  if(exists(record)){const snapshot=readOwnedSnapshot(record);owned=snapshot.state;recordBytes=snapshot.bytes;if(!previous||owned.installId!==previous.installId)throw Error('Host already has another adapter owner');}
  if(previous&&(repair||previous.status!=='detached'))validateRepairOwner(previous,priorManifest,owned,{allowRecovery:!repair});
  if(repair){
   if(previous.package.manifestSha256!==manifest.manifestSha256)throw Error('Repair requires the exact installed package; use install to change versions');
  }
  if(repair&&mode==='same-name')checkExpected(craftExe,previous.ownership.wrapperSha256);
  const currentHash=fileHash(craftExe),migratingExternal=!repair&&previous?.installMode==='external'&&mode==='same-name';
  const previousWrapped=previous?.status==='installed'&&previous.installMode==='same-name'&&currentHash===previous.ownership.wrapperSha256;
  // Explicit installation can adopt a new *allowlisted* official host after an
  // update. A stale backup is never written over the current host; it is replaced
  // by the newly verified bytes only as part of the complete rollback transaction.
  const recoveringOfficial=!repair&&previous?.installMode==='same-name'&&['installed','host-changed','update-unmounted'].includes(previous.status)&&!previousWrapped;
  if(mode==='same-name'){
   if(previousWrapped||recoveringOfficial){checkExpected(backup,previous.ownership.originalSha256);}
   else {if(exists(backup)||exists(record))throw Error('Unowned recovery file or host record exists');if(previous?.status==='installed'&&!migratingExternal)checkExpected(craftExe,previous.ownership.originalSha256);}
   if(repair)checkExpected(craftExe,previous.ownership.wrapperSha256);
  }else if(previous?.status==='installed'&&!migratingExternal)checkExpected(craftExe,previous.ownership.originalSha256);
  const originalHash=recoveringOfficial||migratingExternal?currentHash:previous?.status==='installed'?previous.ownership.originalSha256:currentHash;
  const supportedHost=manifest.supportedHosts.find(h=>h.sha256===originalHash);if(!supportedHost)throw Error('Unsupported Craft host: this package has no verified bridge compatibility for its executable hash');
  if(!repair&&previous?.status==='installed'&&previous.installMode===mode&&!recoveringOfficial&&previous.package.manifestSha256===manifest.manifestSha256){report('complete');return {changed:false,repaired:false,state:previous};}
  const wrapperHash=manifest.files.find(f=>f.path===manifest.wrapper).sha256;
  const state={...(previous||{}),schemaVersion:1,stateVersion:STATE_VERSION,installId:previous?.installId||crypto.randomUUID(),craftExe,originalExe:mode==='same-name'?backup:craftExe,installMode:mode,adapterRoot,kernelExe:path.join(adapterRoot,...manifest.kernel.split('/')),stateDir:path.join(adapterRoot,'state'),host:{sha256:originalHash,version:supportedHost.version,reportedVersion:options.hostVersion||previous?.host.reportedVersion||''},supportedHosts:Object.fromEntries(manifest.supportedHosts.map(h=>[h.version,h.sha256])),ownership:{wrapperSha256:wrapperHash,originalSha256:originalHash},package:{version:manifest.version,manifestSha256:manifest.manifestSha256,entry:manifest.entry,node:manifest.node,wrapper:manifest.wrapper},createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),status:'installed',updateObserverValidated:manifest.updateObserverValidated===true,sameNameUpdateValidated:manifest.sameNameUpdateValidated===true,officialCleanUpdateValidated:manifest.officialCleanUpdateValidated===true,officialAutoInstallEnabled:manifest.officialAutoInstallEnabled===true};
  const id=crypto.randomUUID(),stage=adapterRoot+'.stage-'+id,retired=adapterRoot+'.retired-'+id,journal=adapterRoot+'.transaction-'+id+'.json';
  const beforeExe=snapshot(craftExe),beforeBackup=snapshot(backup),beforeRecord=snapshot(record),changes=[];
  // Bind host checks to the actual rollback snapshots, not an earlier read.
  if(hash(beforeExe)!==(mode==='same-name'&&previousWrapped?previous.ownership.wrapperSha256:originalHash))throw Error('Host changed before staging');
  if(mode==='same-name'&&(previousWrapped||recoveringOfficial)&&(beforeBackup===null||hash(beforeBackup)!==previous.ownership.originalSha256))throw Error('Original host changed before staging');
  if((previous&&fingerprint(config)!==hash(previousBytes))||fingerprint(record)!==(recordBytes===null?null:hash(recordBytes)))throw Error('Installation ownership changed before staging');
  let moved=false,published=false,stageTree=null;
  const assertInputsUnchanged=()=>{
   for(const [file,bytes] of [[craftExe,beforeExe],[backup,beforeBackup],[record,beforeRecord]]){assertNoLinks(file);if(fingerprint(file)!==(bytes===null?null:hash(bytes)))throw Error('Host ownership changed during staging: '+file);}
  };
  writeJson(journal,{schemaVersion:1,operation:repair?'repair':'install',installId:state.installId,adapterRoot,stage,retired,craftExe,expectedBeforeSha256:hash(beforeExe),phase:'staging'});
  try{
   copyPackage(packageRoot,stage,manifest,report);
   if(previous){report('preserve-state');preserveMutable(adapterRoot,stage);}
   writeJson(path.join(stage,'config.json'),state);stageTree=treeHash(stage);fail(options,'staged');
   assertInputsUnchanged();
   if(previous)assertIdle(previous,options);
   if(targetExisted&&treeHash(adapterRoot)!==previousTree)throw Error('Existing adapter changed during staging');
   if(!targetExisted&&exists(adapterRoot))throw Error('Unowned adapter target appeared during staging');
   report('publish');
   if(targetExisted){fs.renameSync(adapterRoot,retired);moved=true;}fs.renameSync(stage,adapterRoot);published=true;fail(options,'published');
   if(mode==='same-name'){
    report('update-host');
    if(!previousWrapped)ownedChange(changes,backup,beforeExe,beforeBackup,{exclusive:!recoveringOfficial});
    // Exact-package repair never needs to rewrite the already verified host EXE.
    if(!repair)ownedChange(changes,craftExe,fs.readFileSync(path.join(adapterRoot,...manifest.wrapper.split('/'))),beforeExe);fail(options,'host-replaced');
    report('record-state');ownedChange(changes,record,Buffer.from(JSON.stringify(state,null,2)+'\n'),beforeRecord);
   }
   fail(options,'recorded');
   // Do not report success if a concurrent writer changed the newly published
   // package/host or recovery ownership after our final write.
   validateChanges(changes);checkExpected(craftExe,mode==='same-name'?wrapperHash:originalHash);
   if(mode==='same-name')checkExpected(backup,originalHash);
   if(treeHash(adapterRoot)!==stageTree)throw Error('Published adapter changed before commit');
   report('cleanup');let retainedRecovery=null;
   if(moved){if(treeHash(retired)===previousTree)fs.rmSync(retired,{recursive:true});else retainedRecovery=retired;}
   fs.unlinkSync(journal);report('complete');
   return {changed:true,repaired:repair,repairedFiles:repair?priorManifest.damagedFiles:[],state,retainedRecovery};
  }catch(error){
   report('rollback');
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
export function repair(options){return install({...options,repair:true});}

export function uninstall(statePath,options={}){
 const report=progressReporter(options);report('validate-owned');
 const initial=readState(statePath);return hostLock(initial.craftExe,()=>lock(initial.adapterRoot,()=>{
  const state=readState(path.join(initial.adapterRoot,'config.json'));assertIdle(state,options);
  if(state.status==='detached'){report('complete');return {changed:false,state,hostChanged:false};}
  const record=hostRecordPath(state.craftExe),config=path.join(state.adapterRoot,'config.json');
  if(state.installMode==='external'){report('record-state');state.status='detached';state.detachedAt=new Date().toISOString();writeJson(config,state);report('complete');return {changed:true,state,hostChanged:false};}
  if(exists(record)&&readState(record).installId!==state.installId)throw Error('Host ownership changed');
  checkExpected(state.originalExe,state.ownership.originalSha256);
  const current=fileHash(state.craftExe);
  if(current!==state.ownership.wrapperSha256){
   // An official update (or another owner) replaced the target. Never restore
   // an older executable over it. Keep recovery and explicit diagnostic state.
   report('record-state');state.status='host-changed';state.observedHostSha256=current;writeJson(config,state);report('complete');return {changed:false,state,hostChanged:true,manualActionRequired:true,message:'Craft executable has changed. It was preserved; recovery files remain and require manual review.'};
  }
  const beforeExe=snapshot(state.craftExe),beforeConfig=snapshot(config),beforeRecord=snapshot(record),beforeBackup=snapshot(state.originalExe),changes=[];
  if(beforeExe===null||hash(beforeExe)!==state.ownership.wrapperSha256||beforeBackup===null||hash(beforeBackup)!==state.ownership.originalSha256)throw Error('Host ownership changed before uninstall');
  try{
   report('update-host');ownedChange(changes,state.craftExe,beforeBackup,beforeExe);fail(options,'host-restored');report('record-state');state.status=options.forUpdate?'update-unmounted':'detached';state.detachedAt=new Date().toISOString();ownedChange(changes,config,Buffer.from(JSON.stringify(state,null,2)+'\n'),beforeConfig);
   ownedDelete(changes,record,beforeRecord);fail(options,'record-removed');
   // Keep the exact backup for update handoff; its process may still be mapped.
   report('cleanup');if(!options.forUpdate)ownedDelete(changes,state.originalExe,beforeBackup);
   report('complete');return {changed:true,state,hostChanged:false};
  }catch(error){report('rollback');try{validateChanges(changes);rollbackChanges(changes);}catch(rollback){error.message+='; rollback refused foreign change: '+rollback.message;}throw error;}
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

export function recoverSessionLock(statePath,options={}){
 const {processCheck=processAlive}=options,report=progressReporter(options);report('validate-owned');
 const state=readState(statePath);return hostLock(state.craftExe,()=>lock(state.adapterRoot,()=>{
  const candidates=[];let sessionId,updateId;
  const updateFile=path.join(state.stateDir,'update.lock');
  if(exists(updateFile)){
   const before=snapshot(updateFile),owner=readJson(updateFile),journal=readJson(path.join(state.stateDir,'update.json'));
   const deadline=Date.parse(owner.deadline),now=options.now===undefined?Date.now():options.now;
   if(owner.schemaVersion!==1||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(owner.id||'')||!Number.isSafeInteger(owner.pid)||owner.pid<=0||!Number.isFinite(deadline)||deadline>now||journal.schemaVersion!==2||journal.id!==owner.id||journal.helperPid!==owner.pid||journal.installId!==state.installId||!same(journal.craftExe,state.craftExe))throw Error('Official update lock is active or its recovery ownership cannot be established');
   if(processCheck(owner.pid,journal,'helperPid'))throw Error('The official update helper is still alive');
   // A committed update with no observed installer could still be running.
   // An expired helper alone is not evidence of installer completion.
   if(!Number.isSafeInteger(journal.installerPid)||journal.installerPid<=0){if(journal.requestedAt||!['prepared','aborted'].includes(journal.state))throw Error('Official installer completion is unknown; inspect the recorded update before recovery');}
   for(const key of ['installerPid','hostPid','wrapperPid']){const pid=journal[key];if(Number.isSafeInteger(pid)&&pid>0&&processCheck(pid,journal,key))throw Error('A recorded official update process is still alive: '+key);}
   candidates.push({file:updateFile,before});updateId=owner.id;
  }
  const file=path.join(state.stateDir,'session.lock');
  if(exists(file)){
   const before=snapshot(file),owner=readJson(file),lease=readJson(path.join(state.stateDir,'session.json'));
   if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||!owner.sessionId||lease.sessionId!==owner.sessionId)throw Error('Stale session ownership cannot be established');
   for(const pid of [owner.pid,lease.coordinatorPid,lease.hostPid,lease.wrapperPid].filter(p=>Number.isSafeInteger(p)&&p>0))if(processCheck(pid,lease))throw Error('A recorded session process is still alive');
   candidates.push({file,before});sessionId=owner.sessionId;
  }
  for(const item of candidates)if(fingerprint(item.file)!==hash(item.before))throw Error('Recovery lock changed during verification');
  if(candidates.length){report('cleanup');for(const item of candidates)fs.unlinkSync(item.file);}
  report('complete');return {changed:candidates.length>0,...(sessionId?{sessionId}:{}),...(updateId?{updateId}:{})};
 }));
}

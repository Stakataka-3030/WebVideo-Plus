import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {install,uninstall,recoverInstallation,recoverSessionLock,readState,hostRecordPath} from '../installer/transaction.mjs';
import {acquireSessionLease} from '../session/lease.mjs';
import {KernelSession} from '../session/kernel.mjs';
import {SessionStorage} from '../session/storage.mjs';
import {spawnService} from '../session/process.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const transaction=new URL('../installer/transaction.mjs',import.meta.url).href;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function home(t){const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'craft-recovery-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function payload(dir,name='payload',version='1.1.14c'){
 const root=path.join(dir,name),files={'node.exe':'inert node','kernel.exe':'inert kernel','wrapper.exe':'wrapper '+version,'craft/main.mjs':'inert source '+version};
 for(const [name,data]of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),data);}
 fs.writeFileSync(path.join(root,'MANIFEST.json'),JSON.stringify({schemaVersion:1,product:'WebVideo+ Craft',version,supportedHosts:[{version:'fixture',sha256:hash('official inert host')}],entry:'craft/main.mjs',node:'node.exe',kernel:'kernel.exe',wrapper:'wrapper.exe',files:Object.entries(files).map(([p,data])=>({path:p,bytes:Buffer.byteLength(data),sha256:hash(data)}))}));return root;
}
function installation(dir){const options={packageRoot:payload(dir),adapterRoot:path.join(dir,'adapter'),craftExe:path.join(dir,'host','webgal-craft.exe')};fs.mkdirSync(path.dirname(options.craftExe));fs.writeFileSync(options.craftExe,'official inert host');return options;}

for(const upgrade of [false,true])for(const phase of ['staged','published','host-replaced','recorded'])test(`real coordinator interruption recovers ${upgrade?'upgrade':'new install'} at ${phase}`,t=>{
 const dir=home(t),options=installation(dir);if(upgrade){install(options);fs.mkdirSync(path.join(options.adapterRoot,'state'),{recursive:true});fs.writeFileSync(path.join(options.adapterRoot,'state','keep'),'user state');options.packageRoot=payload(dir,'new-payload','1.1.15c');}
 const sentinel=path.join(dir,'neighbor');fs.writeFileSync(sentinel,'untouched');
 const result=spawnSync(process.execPath,['--input-type=module','-e',"const {install}=await import(process.argv[1]);install({...JSON.parse(process.argv[2]),onPhase:p=>{if(p===process.argv[3])process.exit(91);}});",transaction,JSON.stringify(options),phase],{encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.status,91,result.stderr);const recovered=recoverInstallation(path.join(options.adapterRoot,'config.json'));assert.equal(recovered.changed,true);
 const final=install(options);assert.equal(final.state.status,'installed');assert.equal(final.state.package.version,upgrade?'1.1.15c':'1.1.14c');assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');if(upgrade)assert.equal(fs.readFileSync(path.join(options.adapterRoot,'state','keep'),'utf8'),'user state');
 assert(!fs.existsSync(options.adapterRoot+'.install-lock'));assert(!fs.existsSync(options.craftExe+'.webvideo.install-lock'));
});

test('recovery retains a foreign file and its journal',t=>{
 const dir=home(t),options=installation(dir);const child=spawnSync(process.execPath,['--input-type=module','-e',"const {install}=await import(process.argv[1]);install({...JSON.parse(process.argv[2]),onPhase:p=>{if(p==='published')process.exit(91);}});",transaction,JSON.stringify(options)],{encoding:'utf8',windowsHide:true});assert.equal(child.status,91);
 fs.writeFileSync(path.join(options.adapterRoot,'foreign'),'keep');assert.throws(()=>recoverInstallation(path.join(options.adapterRoot,'config.json')),/Foreign/);assert.equal(fs.readFileSync(path.join(options.adapterRoot,'foreign'),'utf8'),'keep');assert(fs.readdirSync(dir).some(n=>n.includes('.transaction-')));
});

for(const phase of ['host-restored','record-removed'])test('real detach interruption recovers at '+phase,t=>{
 const dir=home(t),options=installation(dir);install(options);const state=path.join(options.adapterRoot,'config.json');
 const result=spawnSync(process.execPath,['--input-type=module','-e',"const {uninstall}=await import(process.argv[1]);uninstall(process.argv[2],{onPhase:p=>{if(p===process.argv[3])process.exit(91);}});",transaction,state,phase],{encoding:'utf8',windowsHide:true});assert.equal(result.status,91,result.stderr);
 assert.equal(recoverInstallation(state).changed,true);assert.equal(uninstall(state).state.status,'detached');assert.equal(fs.readFileSync(options.craftExe,'utf8'),'official inert host');
});

test('pre-spawn failure releases the atomically published session lock',async t=>{
 const dir=home(t),lock=acquireSessionLease(dir,{sessionId:crypto.randomUUID(),installId:crypto.randomUUID()});assert.equal(JSON.parse(fs.readFileSync(lock.file)).phase,'preparing');await assert.rejects(lock.prepare(async()=>{throw Error('synthetic mkdir failure');}),/synthetic/);assert(!fs.existsSync(lock.file));
});

test('real pre-spawn coordinator exit recovers without a lease or matching old session',t=>{
 const dir=home(t),options=installation(dir),installed=install(options),state=installed.state;fs.mkdirSync(state.stateDir,{recursive:true});
 const helper=new URL('../session/lease.mjs',import.meta.url).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',"const {acquireSessionLease}=await import(process.argv[1]);acquireSessionLease(process.argv[2],JSON.parse(process.argv[3]));process.exit(91);",helper,state.stateDir,JSON.stringify({sessionId:crypto.randomUUID(),installId:state.installId})],{encoding:'utf8',windowsHide:true});assert.equal(child.status,91,child.stderr);
 assert.equal(recoverSessionLock(path.join(options.adapterRoot,'config.json')).changed,true);assert(!fs.existsSync(path.join(state.stateDir,'session.lock')));
});

const serviceSource=String.raw`import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import {spawn} from 'node:child_process';
 const config=JSON.parse(fs.readFileSync(process.argv.at(-1))),dir=config.stateDir;
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
 fs.writeFileSync(path.join(dir,'controlled-pids.json'),JSON.stringify({service:process.pid,descendant:child.pid}));
 const server=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const data=body?JSON.parse(body):{};res.setHeader('Content-Type','application/json');
 if(req.url==='/health'){res.end(JSON.stringify({pid:process.pid,serviceId:'controlled-service'}));return;}
 if(req.url==='/api/shutdown'){res.end('{}');return;}
 const control=path.join(dir,'control.json'),value=fs.existsSync(control)?JSON.parse(fs.readFileSync(control)):{};
 if(req.url==='/api/jobs'&&req.method==='POST'||req.url==='/api/timing'){if(value.reject){res.statusCode=400;res.end(JSON.stringify({error:'controlled rejection'}));return;}if(value.loseResponse){req.socket.destroy();return;}res.end(JSON.stringify({id:'00000000-0000-4000-8000-000000000001'}));return;}
 if(req.url==='/api/jobs'){res.end(JSON.stringify(value.jobs||[]));return;}
 res.end('{}');});server.listen(0,'127.0.0.1',()=>{if(process.env.WVP_CONTROLLED_DISCOVERY!=='absent')fs.writeFileSync(path.join(config.terreDir,'public','assets','video-export-service.json'),JSON.stringify({baseUrl:'http://127.0.0.1:'+server.address().port,pid:process.pid,serviceId:'controlled-service',token:'controlled-token'}));});`;
async function controlled(t,{timeout=5000,discovery=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'craft-controlled-')),node=path.join(dir,'node.exe'),guard=path.join(dir,'process-guard.exe'),script=path.join(dir,'controlled-service.mjs');fs.copyFileSync(process.execPath,node);fs.writeFileSync(script,serviceSource);
 const compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),compiled=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/out:'+guard,path.join(repo,'bootstrap','process-guard.cs')],{encoding:'utf8',windowsHide:true});assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
 const root=path.join(dir,'session');fs.mkdirSync(root);const storage=new SessionStorage(await fsp.realpath(root));const kernel=new KernelSession({kernel:node,root,storage,startTimeoutMs:timeout,spawnKernel:(exe,args,options)=>spawnService(exe,[script,args.at(-1)],{...options,env:{...process.env,WVP_CONTROLLED_DISCOVERY:discovery?'present':'absent'}})});
 t.after(async()=>{await kernel.stop();await fsp.rm(dir,{recursive:true,force:true,maxRetries:30,retryDelay:100});});
 return {dir,root,storage,kernel,async pids(){const file=path.join(root,'kernel','controlled-pids.json');for(let i=0;i<100;i++){if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file));await delay(25);}throw Error('controlled service did not start');},control(value){fs.writeFileSync(path.join(root,'kernel','control.json'),JSON.stringify(value));}};
}
async function assertGone(pids){for(let i=0;i<100;i++){if(pids.every(pid=>{try{process.kill(pid,0);return false;}catch{return true;}}))return;await delay(25);}assert.fail('owned controlled descendants remained alive: '+pids.join(','));}

test('real guarded startup timeout and retry leave no service or descendant',async t=>{
 const f=await controlled(t,{timeout:1200,discovery:false});const start=f.kernel.start(),pids=await f.pids();await assert.rejects(start,/timeout/);await assertGone([pids.service,pids.descendant]);assert.equal(f.kernel.child,null);
 fs.unlinkSync(path.join(f.root,'kernel','controlled-pids.json'));const again=f.kernel.start();const next=await f.pids();await assert.rejects(again,/timeout/);await assertGone([next.service,next.descendant]);
});

test('real stop during startup converges once and closes its process tree',async t=>{
 const f=await controlled(t,{timeout:5000,discovery:false});const starting=f.kernel.start();starting.catch(()=>{});const pids=await f.pids();const stop=f.kernel.stop();assert.equal(f.kernel.stop(),stop);await stop;await assert.rejects(starting,/关闭/);await assertGone([pids.service,pids.descendant]);await assert.rejects(f.kernel.start(),/关闭/);
});

test('real service transport releases completed snapshots and preserves cancel retry sources until terminal cleanup',async t=>{
 const f=await controlled(t);await f.kernel.start();const pids=await f.pids(),project=path.join(f.dir,'project');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'source'),'source');
 async function snapshot(){const allocated=await f.storage.allocate({id:'p',path:project},[project],'4.6.5','open-webgal.webgal');fs.mkdirSync(path.join(allocated.site,'game','scene'),{recursive:true});fs.writeFileSync(path.join(allocated.site,'index.html'),'owned');fs.writeFileSync(path.join(allocated.site,'game','scene','start.txt'),'A:text;');await f.storage.ready(allocated.snapshotId);return allocated;}
 const id='00000000-0000-4000-8000-000000000001',s=await snapshot();await f.kernel.request({endpoint:'/api/jobs',data:{},snapshotId:s.snapshotId});f.control({jobs:[{id,state:'canceled',phase:'canceling'}]});await f.kernel.sweepSnapshots();assert(fs.existsSync(s.site));f.control({jobs:[{id,state:'canceled',phase:'canceled'}]});await f.kernel.sweepSnapshots();assert(fs.existsSync(s.site));f.control({jobs:[{id,state:'completed',phase:'cleanup'}]});await f.kernel.sweepSnapshots();assert(fs.existsSync(s.site));f.control({jobs:[{id,state:'completed',phase:'completed'}]});await f.kernel.sweepSnapshots();assert(!fs.existsSync(s.site));
 const removed=await snapshot();f.control({});await f.kernel.request({endpoint:'/api/jobs',data:{},snapshotId:removed.snapshotId});f.control({jobs:[{id,state:'failed'}]});await f.kernel.sweepSnapshots();assert(fs.existsSync(removed.site));f.control({jobs:[]});await f.kernel.sweepSnapshots();assert(!fs.existsSync(removed.site));
 const rejected=await snapshot();f.control({reject:true});await assert.rejects(f.kernel.request({endpoint:'/api/jobs',data:{},snapshotId:rejected.snapshotId}),/controlled rejection/);assert(!fs.existsSync(rejected.site));
 const failed=await snapshot();f.control({loseResponse:true});await assert.rejects(f.kernel.request({endpoint:'/api/jobs',data:{},snapshotId:failed.snapshotId}));assert(fs.existsSync(failed.site));await f.kernel.stop();await assertGone([pids.service,pids.descendant]);assert(fs.existsSync(failed.site),'lost acceptance remains retryable across shutdown');assert.equal(f.storage.snapshots.size,1);
});


test('real snapshot owner exit recovers only hashed ready copies and retains incomplete ownership records',async t=>{
 const dir=home(t),sessions=path.join(dir,'sessions'),session=path.join(sessions,crypto.randomUUID()),project=path.join(dir,'project');fs.mkdirSync(session,{recursive:true});fs.mkdirSync(project);fs.writeFileSync(path.join(project,'source'),'source');
 const module=new URL('../session/storage.mjs',import.meta.url).href;
 const script="import fs from 'node:fs';import path from 'node:path';const {SessionStorage}=await import(process.argv[1]);const storage=new SessionStorage(process.argv[2]),project=process.argv[3];for(let i=0;i<2;i++){const s=await storage.allocate({id:'project',path:project},[project]);fs.mkdirSync(path.join(s.site,'game','scene'),{recursive:true});fs.writeFileSync(path.join(s.site,'index.html'),'owned');fs.writeFileSync(path.join(s.site,'game','scene','start.txt'),'A:text;');if(i===0)await storage.ready(s.snapshotId);}process.exit(91);";
 const child=spawnSync(process.execPath,['--input-type=module','-e',script,module,session,project],{encoding:'utf8',windowsHide:true});assert.equal(child.status,91,child.stderr);
 const ledgerFile=path.join(session,'owned-snapshots.json'),ledger=JSON.parse(fs.readFileSync(ledgerFile)),ready=ledger.snapshots.find(s=>s.ready),incomplete=ledger.snapshots.find(s=>!s.ready);
 ledger.serviceStarted=true;ledger.servicePids=[process.pid];fs.writeFileSync(ledgerFile,JSON.stringify(ledger));await SessionStorage.recoverSessions(sessions);assert(fs.existsSync(ready.site),'live recorded service protects its source');
 delete ledger.serviceStarted;delete ledger.servicePids;fs.writeFileSync(ledgerFile,JSON.stringify(ledger));await SessionStorage.recoverSessions(sessions);assert(!fs.existsSync(ready.site));assert(fs.existsSync(incomplete.site));assert.deepEqual(JSON.parse(fs.readFileSync(ledgerFile)).snapshots,[incomplete]);
});

test('completed owned snapshot cleanup preserves changed copies and reports retained ownership',async t=>{
 const dir=home(t),root=path.join(dir,'session'),project=path.join(dir,'project');fs.mkdirSync(root);fs.mkdirSync(project);fs.writeFileSync(path.join(project,'source'),'source');const storage=new SessionStorage(root),s=await storage.allocate({id:'p',path:project},[project]);fs.mkdirSync(path.join(s.site,'game','scene'),{recursive:true});fs.writeFileSync(path.join(s.site,'index.html'),'owned');fs.writeFileSync(path.join(s.site,'game','scene','start.txt'),'A:text;');await storage.ready(s.snapshotId);fs.writeFileSync(path.join(s.site,'foreign'),'keep');
 const retained=await storage.close();assert.equal(retained.length,1);assert.equal(retained[0].message,'snapshot-content-changed');assert.equal(fs.readFileSync(path.join(s.site,'foreign'),'utf8'),'keep');assert.equal(JSON.parse(fs.readFileSync(path.join(root,'owned-snapshots.json'))).snapshots[0].id,s.snapshotId);
});

test('real verified remount interruption restores the exact unmounted files',t=>{
 const dir=home(t),options=installation(dir);install(options);const stateFile=path.join(options.adapterRoot,'config.json');const manifestFile=path.join(options.adapterRoot,'MANIFEST.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
 // The inert fixture opts into the same completed native-update contract as the production package.
 manifest.updateObserverValidated=true;manifest.sameNameUpdateValidated=true;fs.writeFileSync(manifestFile,JSON.stringify(manifest));const state=readState(stateFile);state.package.manifestSha256=hash(fs.readFileSync(manifestFile));state.updateObserverValidated=true;state.sameNameUpdateValidated=true;fs.writeFileSync(stateFile,JSON.stringify(state));fs.writeFileSync(hostRecordPath(options.craftExe),JSON.stringify(state));
 uninstall(stateFile,{forUpdate:true});const before=fs.readFileSync(options.craftExe),backup=fs.readFileSync(state.originalExe),evidence={expectedHostHash:hash('official inert host'),version:'fixture',provenance:'controlled fixture'};
 const child=spawnSync(process.execPath,['--input-type=module','-e',"const {remountAfterVerifiedUpdate}=await import(process.argv[1]);remountAfterVerifiedUpdate(process.argv[2],JSON.parse(process.argv[3]),{verifyUpdateReceipt:()=>true,onPhase:p=>{if(p==='host-replaced')process.exit(91);}});",transaction,stateFile,JSON.stringify(evidence)],{encoding:'utf8',windowsHide:true});assert.equal(child.status,91,child.stderr);
 assert.equal(recoverInstallation(stateFile).changed,true);assert.deepEqual(fs.readFileSync(options.craftExe),before);assert.deepEqual(fs.readFileSync(state.originalExe),backup);assert.equal(readState(stateFile).status,'update-unmounted');
});


test('concurrent allocation cannot exceed the session snapshot count budget',async t=>{
 const dir=home(t),root=path.join(dir,'session'),project=path.join(dir,'project');fs.mkdirSync(root);fs.mkdirSync(project);fs.writeFileSync(path.join(project,'source'),'source');const storage=new SessionStorage(root),results=await Promise.allSettled(Array.from({length:65},()=>storage.allocate({id:'p',path:project},[project])));assert.equal(results.filter(r=>r.status==='fulfilled').length,64);assert.equal(results.filter(r=>r.status==='rejected').length,1);await storage.close();assert.equal(storage.snapshots.size,0);
});


test('durable pre-directory owner record recovers an interrupted install lock publication',t=>{
 const dir=home(t),options=installation(dir),helper="import fs from 'node:fs';import path from 'node:path';const root=process.argv[1];fs.writeFileSync(root+'.install-owner.json',JSON.stringify({schemaVersion:1,pid:process.pid,root:path.resolve(root),createdAt:new Date().toISOString()}));fs.mkdirSync(root+'.install-lock');process.exit(91);";
 const child=spawnSync(process.execPath,['--input-type=module','-e',helper,options.adapterRoot],{encoding:'utf8',windowsHide:true});assert.equal(child.status,91,child.stderr);assert.equal(install(options).state.status,'installed');assert(!fs.existsSync(options.adapterRoot+'.install-owner.json'));
});


test('real exclusive owner hardlink publication exit recovers its exact temporary peer',t=>{
 const dir=home(t),options=installation(dir),helper="import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';const root=process.argv[1],pending=root+'.install-owner.json',temp=pending+'.tmp-'+crypto.randomUUID();fs.writeFileSync(temp,JSON.stringify({schemaVersion:1,pid:process.pid,root:path.resolve(root),createdAt:new Date().toISOString()}));fs.linkSync(temp,pending);process.exit(91);";
 const child=spawnSync(process.execPath,['--input-type=module','-e',helper,options.adapterRoot],{encoding:'utf8',windowsHide:true});assert.equal(child.status,91,child.stderr);assert.equal(install(options).state.status,'installed');assert(!fs.readdirSync(dir).some(name=>name.includes('install-owner')));
});


test('real cross-session failed and canceled retry sources survive close then release after authoritative job deletion/completion',async t=>{
 const dir=home(t),sessions=path.join(dir,'sessions'),session=path.join(sessions,crypto.randomUUID()),project=path.join(dir,'project');fs.mkdirSync(session,{recursive:true});fs.mkdirSync(project);fs.writeFileSync(path.join(project,'source'),'source');
 const module=new URL('../session/storage.mjs',import.meta.url).href;
 const script="import fs from 'node:fs';import path from 'node:path';const {SessionStorage}=await import(process.argv[1]);const storage=new SessionStorage(process.argv[2]),project=process.argv[3];for(let i=0;i<2;i++){const s=await storage.allocate({id:'project',path:project},[project]);fs.mkdirSync(path.join(s.site,'game','scene'),{recursive:true});fs.writeFileSync(path.join(s.site,'index.html'),'owned');fs.writeFileSync(path.join(s.site,'game','scene','start.txt'),'A:text;');await storage.ready(s.snapshotId);await storage.pinSnapshot(s.snapshotId,{kind:'queue',taskId:i?'00000000-0000-4000-8000-000000000002':'00000000-0000-4000-8000-000000000001'});}await storage.close({preserveTasks:true});process.exit(91);";
 const child=spawnSync(process.execPath,['--input-type=module','-e',script,module,session,project],{encoding:'utf8',windowsHide:true});assert.equal(child.status,91,child.stderr);const file=path.join(session,'owned-snapshots.json'),ledger=JSON.parse(fs.readFileSync(file)),[a,b]=ledger.snapshots;
 await SessionStorage.recoverSessions(sessions);assert(fs.existsSync(a.site)&&fs.existsSync(b.site));
 const jobs=[{id:a.taskId,project:a.site,state:'failed',phase:'failed'},{id:b.taskId,project:b.site,state:'canceled',phase:'canceled'}];assert.equal((await SessionStorage.recoverSessions(sessions,{queue:jobs})).pending,true);assert(fs.existsSync(a.site)&&fs.existsSync(b.site));
 // A fresh queue can retry these exact unchanged source files.
 assert.equal(fs.readFileSync(path.join(a.site,'game','scene','start.txt'),'utf8'),'A:text;');assert.equal(fs.readFileSync(path.join(b.site,'game','scene','start.txt'),'utf8'),'A:text;');
 await SessionStorage.recoverSessions(sessions,{queue:[jobs[1]]});assert(!fs.existsSync(a.site)&&fs.existsSync(b.site));
 await SessionStorage.recoverSessions(sessions,{queue:[{id:'malformed',state:'failed'}]});assert(fs.existsSync(b.site));
 await SessionStorage.recoverSessions(sessions,{queue:[{id:b.taskId,project:b.site,state:'completed',phase:'completed'}]});assert(!fs.existsSync(b.site));assert.deepEqual(JSON.parse(fs.readFileSync(file)).snapshots,[]);
});

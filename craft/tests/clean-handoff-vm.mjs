// INERT SOURCE TEST ONLY. Invoked by clean-official.test.mjs with VM modules.
// Executes current production JavaScript without transforming its source in a VM with explicitly simulated
// Windows process, filesystem, package acceptance, staged artifact and child IPC.
// Cleanup checks use fresh test-owned temporary files; the runner uses virtual files.
// No native program, NSIS, network request, registry access or production write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import {assertNoLinks,fileHash} from '../installer/transaction.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const expected=Object.fromEntries(['craft/update/clean-handoff.mjs','craft/update/handoff-state.mjs','craft/update/clean-coordinator.mjs','craft/update/official-stage.mjs'].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const sources={};for(const [file,digest] of Object.entries(expected)){sources[file]=fs.readFileSync(path.join(root,file),'utf8');assert.equal(hash(sources[file]),digest,'source changed while loading VM: '+file);}
const versionFile=path.join(root,'craft/version.json'),versionBytes=fs.readFileSync(versionFile),version=JSON.parse(versionBytes),flags=['updateObserverValidated','sameNameUpdateValidated','officialCleanUpdateValidated'];
for(const flag of flags)assert.equal(version[flag],false,'historical acceptance remains false: '+flag);
assert.equal(version.officialAutoInstallEnabled,true,'source runtime policy is enabled independently of acceptance');
assert.equal(typeof vm.SourceTextModule,'function','run with --experimental-vm-modules');
const results=[],mode='instrumented-inert-orchestration';
const clone=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(r=>setImmediate(r));
async function until(predicate,label){for(let i=0;i<40;i++){if(predicate())return;await tick();}throw Error('Harness did not reach '+label);}
async function settled(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Harness evaluation did not settle')),1500);})]);}finally{clearTimeout(timer);}}
function synthetic(context,exports,id){const names=Object.keys(exports);return new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,exports[name]);},{context,identifier:id});}
async function makeCase(options={}){
 const id='11111111-1111-4111-8111-111111111111',pid=7000,stateDir='/qa/adapter/state',craftExe='/qa/host/webgal-craft.exe',originalExe='/qa/host/webgal-craft.webvideo-original.exe';
 const state={officialAutoInstallEnabled:Object.hasOwn(options,'stateEnabled')?options.stateEnabled:true,installId:'qa-install-id',status:'installed',installMode:'same-name',adapterRoot:'/qa/adapter',stateDir,craftExe,originalExe,package:{manifestSha256:'a'.repeat(64)},ownership:{wrapperSha256:hash('wrapper'),originalSha256:hash('original')}};
 const staged={record:{version:options.stageVersion||'1.0.1',currentVersion:'1.0.0-beta.2',sha256:hash('inert-installer')},installer:stateDir+'/official-update/staged-test/installer.exe'};
 // This manifest exists only in VM memory. It intentionally models accepted
 // prerequisites to reach deeper branches; production manifest flags stay false.
 const manifest={manifestSha256:state.package.manifestSha256,supportedHosts:[{version:'1.0.1',sha256:hash('known-new-host')}],officialAutoInstallEnabled:true,...Object.fromEntries(flags.map(k=>[k,false])),...(options.manifest||{})};
 const files=new Map([[craftExe,'wrapper'],[originalExe,'original'],[stateDir+'/session.json',JSON.stringify({hostPid:7002,wrapperPid:7001})]]),events=[],messages=[],timers=new Map(),children=[];
 if(options.foreignLock)files.set(stateDir+'/update.lock',JSON.stringify(options.foreignLock));
 const event=(type,details={})=>events.push({sequence:events.length,type,...details});
 const missing=file=>Object.assign(Error('ENOENT '+file),{code:'ENOENT'});
 const virtualFs={
  existsSync:file=>files.has(file),
  readFileSync(file,encoding){if(!files.has(file))throw missing(file);const data=files.get(file);return encoding?String(data):Buffer.from(data);},
  writeFileSync(file,data,settings){if(settings?.flag==='wx'&&files.has(file))throw Object.assign(Error('EEXIST '+file),{code:'EEXIST'});assert(file.startsWith(stateDir+'/'),'source attempted write outside virtual owned state');files.set(file,String(data));event('write',{file,data:String(data)});},
  renameSync(from,to){assert(from.startsWith(stateDir+'/')&&to.startsWith(stateDir+'/'),'source rename outside virtual owned state');if(!files.has(from))throw missing(from);const data=files.get(from);files.delete(from);files.set(to,data);event('rename',{from,to,data});},
  unlinkSync(file){assert(file.startsWith(stateDir+'/'),'source unlink outside virtual owned state');if(!files.has(file))throw missing(file);files.delete(file);event('unlink',{file});},
 };
 class Child extends EventEmitter{
  constructor(kind){super();this.kind=kind;this.pid=7003;this.exitCode=null;this.killed=0;this.stdin=new EventEmitter();this.stdout=new EventEmitter();this.stderr=new EventEmitter();this.stdout.setEncoding=this.stderr.setEncoding=()=>{};this.stdin.write=(text,callback)=>{event('stdin',{kind,text});if(options.stdinError){callback?.(Error('synthetic stdin failure'));return;}callback?.();if(text==='cancel\n')queueMicrotask(()=>{this.stdout.emit('data',JSON.stringify({state:'not-started',launchAttempted:false,reason:'inert cancellation acknowledged'})+'\n');this.finish(2);});};}
  finish(code=0){if(this.exitCode!==null)return;this.exitCode=code;event('child-exit',{kind:this.kind,code});this.emit('exit',code);queueMicrotask(()=>this.emit('close',code));}
  kill(){this.killed++;event('child-kill',{kind:this.kind});this.finish(9);return true;}
 }
 const fakeProcess=new EventEmitter();Object.assign(fakeProcess,{platform:'win32',arch:'x64',pid,connected:true,exitCode:undefined,env:{PATH:'inert',WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'qa-debug',WEBVIEW2_USER_DATA_FOLDER:'qa-profile',WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER:'qa-pipe'},argv:['node','clean-handoff.mjs','--state','/qa/adapter/config.json','--host-pid','7002','--wrapper-pid','7001','--version','1.0.1','--id',options.invalidId?'malformed':id,'--stage',stateDir+'/official-update/staged-test','--host-args','[]']});
 fakeProcess.send=(value,callback)=>{const message=clone(value);messages.push(message);event('ipc-send',{message});callback?.();};fakeProcess.disconnect=()=>{fakeProcess.connected=false;event('disconnect');};
 let nextTimer=0,stageCalls=0;
 const context=vm.createContext({process:fakeProcess,Buffer,Date,console:Object.freeze({log(){},error(){}}),setTimeout:(callback,ms)=>{const timer=++nextTimer;timers.set(timer,{callback,ms});event('timer-set',{timer,ms});return timer;},clearTimeout:timer=>{timers.delete(timer);event('timer-clear',{timer});}});
 const classifier=new vm.SourceTextModule(sources['craft/update/handoff-state.mjs'],{context,identifier:'exact:handoff-state.mjs'});await classifier.link(()=>{throw Error('Unexpected classifier import');});
 const cleanEnv=environment=>Object.fromEntries(Object.entries(environment).filter(([k])=>!['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER'].includes(k.toUpperCase())));
 const imports={
  'node:fs':{default:virtualFs},'node:path':{default:path.posix},'node:crypto':{default:{randomUUID:()=>crypto.randomUUID()}},
  'node:child_process':{spawn(exe,args,settings){const kind=exe==='powershell.exe'?'notice':'native';assert.equal(kind==='native'?exe:args[0],kind==='native'?'/qa/adapter/CraftOfficialInstaller.exe':'-NoProfile');assert(!Object.keys(settings.env).some(k=>k.toUpperCase().startsWith('WEBVIEW2_')));event('spawn',{kind,exe,args:clone(args),settings:clone(settings)});const child=new Child(kind);children.push(child);if(kind==='notice'&&!options.noticeTimeout)queueMicrotask(()=>child.finish());return child;}},
  '../installer/transaction.mjs':{readState:()=>clone(state),verifyPackage:()=>clone(manifest),assertNoLinks:file=>{if(options.linkRejected&&file.endsWith('session.json'))throw Error('synthetic link rejection');},fileHash:file=>hash(virtualFs.readFileSync(file))},
  './clean-coordinator.mjs':{cleanupOwnedOfficialStage:async()=>{event('cleanup-stage');}},
  './official-stage.mjs':{verifyOfficialStage:async()=>{stageCalls++;if(options.stageDeferred)await options.stageDeferred;if(options.stageRejected)throw Error('synthetic rejected stage: signature or ownership');return clone(staged);},cleanOfficialEnvironment:cleanEnv},
 };
 const module=new vm.SourceTextModule(sources['craft/update/clean-handoff.mjs'],{context,identifier:'exact:clean-handoff.mjs'});
 await module.link(specifier=>specifier==='./handoff-state.mjs'?classifier:imports[specifier]?synthetic(context,imports[specifier],'mock:'+specifier):Promise.reject(Error('Unapproved import '+specifier)));
 const evaluation=module.evaluate();
 const native=()=>children.find(c=>c.kind==='native'),notice=()=>children.find(c=>c.kind==='notice');
 const emit=value=>{assert(native(),'native protocol fixture not spawned');native().stdout.emit('data',JSON.stringify(value)+'\n');};
 const command=type=>fakeProcess.emit('message',{type,id});
 const read=file=>JSON.parse(files.get(stateDir+'/'+file));
 const fire=ms=>{const entry=[...timers.entries()].find(([,value])=>value.ms===ms);assert(entry,'expected bounded timer '+ms);timers.delete(entry[0]);entry[1].callback();};
 const invariants=()=>{assert.equal(files.get(originalExe),'original');for(const e of events.filter(e=>['write','rename','unlink'].includes(e.type)))assert(!(e.file===craftExe||e.file===originalExe||e.to===craftExe||e.to===originalExe));assert.equal(timers.size,0,'all bounded timers cleaned');assert.equal(fakeProcess.connected,false);};
 return {id,stateDir,craftExe,files,events,messages,children,evaluation,native,notice,emit,command,read,fire,invariants,stageCalls:()=>stageCalls,process:fakeProcess};
}
async function test(name,run){await run();results.push({name,passed:true,mode});}
async function arm(f){await until(()=>f.native()?.stdout.listenerCount('data'),'native protocol listeners');f.emit({state:'armed'});f.emit({state:'wrapper-exited'});}
async function commit(f){f.command('commit');const request=f.events.find(e=>e.type==='rename'&&e.to.endsWith('/update.json')&&JSON.parse(e.data).state==='install-requested');const write=f.events.find(e=>e.type==='stdin'&&e.text==='commit\n');assert(request&&write&&request.sequence<write.sequence,'journal must persist before native commit write');f.emit({state:'committed'});}
for(const enabled of [false,undefined])await test('manifest runtime policy '+enabled+' refuses even with true historical evidence',async()=>{const f=await makeCase({manifest:{officialAutoInstallEnabled:enabled,...Object.fromEntries(flags.map(k=>[k,true]))}});await settled(f.evaluation);assert.equal(f.children.length,0);assert.equal(f.stageCalls(),0);assert(f.messages.some(m=>m.type==='error'&&/not enabled/.test(m.message)));f.invariants();});
for(const enabled of [false,undefined])await test('installed runtime policy '+enabled+' refuses before stage',async()=>{const f=await makeCase({stateEnabled:enabled});await settled(f.evaluation);assert.equal(f.children.length,0);assert.equal(f.stageCalls(),0);f.invariants();});
await test('malformed identity rejected before state/stage/native work',async()=>{const f=await makeCase({invalidId:true});await settled(f.evaluation);assert.equal(f.stageCalls(),0);assert.equal(f.children.length,0);assert(f.messages.some(m=>/identity/.test(m.message)));f.invariants();});
await test('rejected stage cannot create lock or native child',async()=>{const f=await makeCase({stageRejected:true});await settled(f.evaluation);assert.equal(f.stageCalls(),1);assert.equal(f.children.length,0);assert(!f.files.has(f.stateDir+'/update.lock'));assert(!f.files.has(f.stateDir+'/update.json'));f.invariants();});
await test('mismatched staged version refused before lock or child',async()=>{const f=await makeCase({stageVersion:'1.0.2'});await settled(f.evaluation);assert.equal(f.children.length,0);assert(!f.files.has(f.stateDir+'/update.lock'));assert(f.messages.some(m=>m.type==='error'&&/version changed/.test(m.message)));f.invariants();});
await test('linked session refused before stage or native child',async()=>{const f=await makeCase({linkRejected:true});await settled(f.evaluation);assert.equal(f.stageCalls(),0);assert.equal(f.children.length,0);f.invariants();});
await test('foreign lock remains untouched and installer never starts',async()=>{const owner={schemaVersion:1,id:'foreign',pid:999,deadline:'2030-01-01T00:00:00Z'},f=await makeCase({foreignLock:owner});await settled(f.evaluation);assert.deepEqual(f.read('update.lock'),owner);assert.equal(f.children.length,0);f.invariants();});
await test('precommit abort kills only inert helper and removes owned lock',async()=>{const f=await makeCase();await arm(f);assert.equal(f.read('update.json').helperPid,7000);f.command('abort');await settled(f.evaluation);assert.equal(f.native().killed,1);assert(!f.events.some(e=>e.type==='stdin'));assert.equal(f.read('update.json').state,'aborted');assert(!f.files.has(f.stateDir+'/update.lock'));assert(!f.notice());f.invariants();});
for(const [label,bytes,state] of [['known','known-new-host','official-compatible-unmounted'],['unknown','unknown-new-host','official-unvalidated']])await test(label+' host result forwards protocol, persists PID and never remounts',async()=>{
 const f=await makeCase();await arm(f);await commit(f);f.emit({state:'observed',pid:7100,startedAt:'2026-10-04T00:00:00Z'});assert.equal(f.read('update.json').installerPid,7100);assert.equal(f.read('update.json').helperPid,7000);assert.deepEqual(f.read('update.json').validation,Object.fromEntries(flags.map(k=>[k,false])));assert.equal(f.read('update.json').runtimePolicy.officialAutoInstallEnabled,true);
 // Installer file replacement is simulated by the harness, never by the source.
 f.files.set(f.craftExe,bytes);f.emit({state:'exited',pid:7100,exitCode:0});f.native().finish();await settled(f.evaluation);
 const record=f.read('update.json');assert.equal(record.state,state);assert.equal(record.automaticRemount,false);assert.equal(record.hostSha256,hash(bytes));assert.equal(f.files.get(f.craftExe),bytes);assert(!f.files.has(f.stateDir+'/update.lock'));assert.equal(f.children.filter(c=>c.kind==='notice').length,1);
 assert.deepEqual(f.messages.filter(m=>['armed','wrapper-exited','committed'].includes(m.type)).map(m=>m.type),['armed','wrapper-exited','committed']);assert.equal(f.read('OFFICIAL-UPDATE-RECOVERY.txt').state,state);f.invariants();
});
await test('commit persists despite uncertain native stdin and retains update lock',async()=>{const f=await makeCase({stdinError:true});await arm(f);f.command('commit');assert.equal(f.read('update.json').state,'install-requested');assert(!f.messages.some(m=>m.type==='committed'));f.native().finish(2);await settled(f.evaluation);assert(f.messages.some(m=>m.type==='error'&&/stdin/.test(m.message)));assert(f.files.has(f.stateDir+'/update.lock'));f.invariants();});
await test('committed watchdog kills helper only and retains observed installer lock',async()=>{const f=await makeCase();await arm(f);await commit(f);f.emit({state:'observed',pid:7100,startedAt:'2026-10-04T00:00:00Z'});f.fire(905000);await settled(f.evaluation);assert.equal(f.native().killed,1);assert(f.files.has(f.stateDir+'/update.lock'));assert.equal(f.read('update.json').installerPid,7100);assert.equal(f.children.length,2,'only native helper and bounded notice exist in the protocol model');assert(!f.events.some(e=>e.type==='child-kill'&&e.kind==='installer'));f.invariants();});
await test('trusted not-started receipt releases committed lock',async()=>{const f=await makeCase();await arm(f);await commit(f);f.emit({state:'not-started',launchAttempted:false,reason:'inert host-live deadline'});f.native().finish(2);await settled(f.evaluation);assert(!f.files.has(f.stateDir+'/update.lock'));f.invariants();});
await test('notice is capped at thirty-five seconds and cannot retain successful lock',async()=>{const f=await makeCase({noticeTimeout:true});await arm(f);await commit(f);f.files.set(f.craftExe,'known-new-host');f.emit({state:'exited',pid:7100,exitCode:0});f.native().finish();await until(()=>f.notice(),'bounded notice');assert(!f.files.has(f.stateDir+'/update.lock'));f.fire(35000);await settled(f.evaluation);assert.equal(f.notice().killed,1);assert.equal(f.native().killed,0);f.invariants();});
await test('cancel-after-commit confirms not-started and releases lock before reporting without a notice',async()=>{const f=await makeCase();await arm(f);await commit(f);f.command('cancel-before-launch');await settled(f.evaluation);assert.equal(f.read('update.json').observed.state,'not-started');assert(!f.files.has(f.stateDir+'/update.lock'));assert(!f.notice());assert(f.events.some(e=>e.type==='cleanup-stage'));const released=f.events.find(e=>e.type==='unlink'&&e.file.endsWith('/update.lock')),reported=f.events.find(e=>e.type==='ipc-send'&&e.message.type==='result');assert(released.sequence<reported.sequence);f.invariants();});
for(const how of ['abort','disconnect'])await test(how+' during stage re-verification cannot spawn native helper late',async()=>{let release;const stageDeferred=new Promise(r=>release=r),f=await makeCase({stageDeferred});await until(()=>f.stageCalls()>0,'stage verification');if(how==='abort')f.command('abort');else{f.process.connected=false;f.process.emit('disconnect');}release();await settled(f.evaluation);assert.equal(f.children.length,0);assert(!f.files.has(f.stateDir+'/update.lock'));f.invariants();});
await test('uncommitted disconnect promptly aborts the armed helper',async()=>{const f=await makeCase();await arm(f);f.process.connected=false;f.process.emit('disconnect');await settled(f.evaluation);assert.equal(f.native().killed,1);assert.equal(f.read('update.json').state,'aborted');assert(!f.files.has(f.stateDir+'/update.lock'));f.invariants();});
await test('uncertain committed result retains staged artifact and lock',async()=>{const f=await makeCase();await arm(f);await commit(f);f.emit({state:'indeterminate',launchAttempted:true});f.native().finish(2);await settled(f.evaluation);assert(f.files.has(f.stateDir+'/update.lock'));assert(!f.events.some(e=>e.type==='cleanup-stage'));f.invariants();});
await test('post-spawn helper error preserves observed installer uncertainty',async()=>{const f=await makeCase();await arm(f);await commit(f);f.emit({state:'observed',pid:7100,startedAt:'2026-10-04T00:00:00Z'});f.native().emit('error',Error('synthetic kill failure after spawn'));f.native().finish(2);await settled(f.evaluation);assert.equal(f.read('update.json').observed.state,'indeterminate');assert.equal(f.read('update.json').observed.pid,7100);assert(f.files.has(f.stateDir+'/update.lock'));assert(!f.events.some(e=>e.type==='cleanup-stage'));f.invariants();});
await test('terminal stdout arriving after exit is drained before lock release',async()=>{const f=await makeCase();await arm(f);await commit(f);f.native().exitCode=0;f.native().emit('exit',0);f.emit({state:'not-started',launchAttempted:false});f.native().emit('close',0);await settled(f.evaluation);assert.equal(f.read('update.json').observed.state,'not-started');assert(!f.files.has(f.stateDir+'/update.lock'));f.invariants();});
await test('host-close timeout retains bounded recovery notice with its no-start reason',async()=>{const f=await makeCase();await arm(f);await commit(f);f.emit({state:'not-started',launchAttempted:false,reason:'Normal Craft close was not completed within 30 seconds'});f.native().finish(2);await settled(f.evaluation);assert(f.notice());const call=f.events.find(e=>e.type==='spawn'&&e.kind==='notice');const encoded=call.args[call.args.indexOf('-MessageBase64')+1];assert(Buffer.from(encoded,'base64').toString().includes('30 seconds'));f.invariants();});
for(const change of ['none','same-bytes-replacement','changed-content','extra-file'])await test('owned cleanup final identity fence: '+change,async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'craft-cleanup-vm-')),state={stateDir:path.join(home,'state')},directory=path.join(state.stateDir,'official-update/staged-owned'),installer=path.join(directory,'installer.exe'),record={sha256:hash('owned installer fixture')};
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(installer,'owned installer fixture');fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(record));if(change==='extra-file')fs.writeFileSync(path.join(directory,'foreign.txt'),'retain');
 try{
  const context=vm.createContext({process:{env:{}},Buffer});let swapped=false;
  const asyncFs={...fsPromises,readdir:async folder=>{const names=await fsPromises.readdir(folder);if(!swapped&&['same-bytes-replacement','changed-content'].includes(change)){swapped=true;if(change==='same-bytes-replacement'){fs.renameSync(installer,path.join(home,'previous-installer'));fs.writeFileSync(installer,'owned installer fixture');}else fs.writeFileSync(installer,'foreign replacement bytes');}return names;}};
  const imports={'node:fs/promises':{default:asyncFs},'node:fs':{default:fs},'node:path':{default:path},'../installer/transaction.mjs':{readState:()=>state,assertNoLinks,fileHash},'./official-stage.mjs':{stageOfficialUpdate(){},verifyOfficialStage:async()=>({record}),cleanOfficialEnvironment:value=>value},'./coordinator.mjs':{UpdateCoordinator:class{}}};
  const module=new vm.SourceTextModule(sources['craft/update/clean-coordinator.mjs'],{context,identifier:'exact:cleanup-coordinator.mjs'});await module.link(specifier=>synthetic(context,imports[specifier],'mock:'+specifier));await module.evaluate();
  const work=module.namespace.cleanupOwnedOfficialStage({state,staged:{directory,record}});
  if(change==='none'){await work;assert(!fs.existsSync(directory));}
  else{await assert.rejects(work,/Refusing cleanup/);assert(fs.existsSync(installer));if(change==='changed-content')assert.equal(fs.readFileSync(installer,'utf8'),'foreign replacement bytes');if(change==='extra-file')assert.equal(fs.readFileSync(path.join(directory,'foreign.txt'),'utf8'),'retain');}
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
await test('incomplete terminal receipt remains indeterminate and retains committed lock',async()=>{const f=await makeCase();await arm(f);await commit(f);f.emit({state:'not-started'});f.native().finish(2);await settled(f.evaluation);assert.equal(f.read('update.json').observed.state,'indeterminate');assert(f.files.has(f.stateDir+'/update.lock'));assert(!f.events.some(e=>e.type==='cleanup-stage'));f.invariants();});
// Independently execute byte-exact production staging guards with only their
// filesystem boundary mocked. A same-version fixture must fail before fetch,
// signature evaluation or staging. No successful signature acceptance is mocked
// into this assertion and no alternate production policy is introduced.
await test('real staging and receipt verification still refuse same-version',async()=>{
 const context=vm.createContext({Buffer,URL,AbortSignal,fetch:()=>{throw Error('network forbidden');}});let fetches=0,writes=0,signatures=0;
 const originalHash='3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d',v='1.0.0-beta.2';
 const state={stateDir:'/qa/state',installId:'test',package:{manifestSha256:'a'},ownership:{originalSha256:originalHash},host:{sha256:originalHash,version:v}};
 const metadata={version:v,platforms:{'windows-x86_64-nsis':{url:'https://api.github.com/repos/A-kirami/webgal-craft/releases/assets/577401298',signature:'not-used'}}};
 const receipt={schemaVersion:1,type:'official-craft-installer',installId:state.installId,packageManifestSha256:'a',source:'https://github.com/A-kirami/webgal-craft/releases/latest/download/latest.json',hostSha256:originalHash,currentVersion:v,version:v,target:'windows-x86_64-nsis'};
 const imports={'node:fs/promises':{default:{readFile:async()=>JSON.stringify(receipt),writeFile:async()=>{writes++;throw Error('writes forbidden');}}},'node:path':{default:path.posix},'node:crypto':{default:crypto},'../installer/transaction.mjs':{assertNoLinks(){},readState:()=>state},'./minisign.mjs':{verifyMinisign(){signatures++;throw Error('unexpected signature evaluation');}}};
 const module=new vm.SourceTextModule(sources['craft/update/official-stage.mjs'],{context,identifier:'exact:official-stage.mjs'});await module.link(specifier=>synthetic(context,imports[specifier],'mock:'+specifier));await module.evaluate();
 await assert.rejects(module.namespace.stageOfficialUpdate({statePath:'/qa/config',version:v,currentVersion:v,metadata,fetchImpl:async()=>{fetches++;throw Error('network forbidden');}}),/downgrade/);
 await assert.rejects(module.namespace.verifyOfficialStage(state,'/qa/state/official-update/staged-test'),/ownership/);assert.equal(fetches,0);assert.equal(writes,0);assert.equal(signatures,0);
});
for(const [file,digest] of Object.entries(expected))assert.equal(hash(fs.readFileSync(path.join(root,file))),digest,'source changed during QA');
assert.equal(hash(fs.readFileSync(versionFile)),hash(versionBytes),'production version flags file changed');
const report={schemaVersion:1,sourceProfile:'current-source-no-transformation',mode,executedAt:new Date().toISOString(),node:process.version,passed:results.length,failed:0,sourceHashes:expected,harnessSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),runtimePolicy:{officialAutoInstallEnabled:version.officialAutoInstallEnabled},historicalAcceptance:Object.fromEntries(flags.map(k=>[k,version[k]])),nativeExecuted:false,nsisExecuted:false,networkUsed:false,registryAccessed:false,productionFilesModified:false,forwardSignedUpgradeValidated:false,automaticRemountImplemented:false,limitations:['Runner uses virtual Windows/process/filesystem/package/stage/child/timer boundaries; cleanup-only cases use owned temporary files with mocked prior signature acceptance. This does not establish real OS, signed forward-update or native session integration acceptance.','Positive inner-runner cases use runtime-enabled manifest/state fixtures with all three historical validation flags false; production signatures are not bypassed by a runtime policy.','Stage rejection case tests outer error handling; separate unchanged real stage/receipt guards confirm equal-version refusal.','Does not execute CleanUpdateCoordinator, CraftStarter, launch-injected.mjs, exit-code 75 or real session detach/restart.'],results};
console.log(JSON.stringify(report,null,2));

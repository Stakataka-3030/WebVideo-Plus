import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {CraftOwnUpdates, compareCraftVersions, parseCraftVersion, validateCraftRelease, validateCraftDescriptor} from '../update/own-updates.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const prefix = 'https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/';
function release(version = '1.1.9.0c', body = Buffer.from('inert test installer')) {
  const tag = 'craft-v' + version, name = `WebVideoCraft-Setup-${version}.exe`;
  const descriptor = {schemaVersion:1,product:'craft',channel:'stable',platform:'windows',architecture:'x64',version,tag,assets:[{name,sha256:hash(body),size:body.length}]};
  const metadata = Buffer.from(JSON.stringify(descriptor));
  const asset = (name, bytes) => ({name,size:bytes.length,state:'uploaded',digest:'sha256:'+hash(bytes),browser_download_url:prefix+tag+'/'+name});
  return {body,metadata,descriptor,record:{tag_name:tag,draft:false,prerelease:false,body:'<!-- webvideo-compat: {"product":"craft","webgal":["4.6.4","4.6.5"]} -->',assets:[asset(name,body),asset('webvideo-release.json',metadata)]}};
}
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'craft-updater-test-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const item = options.item || release(), calls = [], launches = [], reveals = [];
  const host = {hasUnsavedDocuments:false,hasBlockingTasks:false};
  let otherPending = false;
  const fetchImpl = async (url, init) => {
    calls.push({url,init});
    if (options.fetchImpl) return options.fetchImpl(url,init,item);
    if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify(options.releases || [item.record]));
    if (url.endsWith('/webvideo-release.json')) return new Response(item.metadata);
    if (url.endsWith('.exe')) return new Response(options.downloadBody || item.body);
    throw Error('unexpected URL '+url);
  };
  const client = new CraftOwnUpdates({adapterRoot:path.join(root,'adapter'),cacheRoot:path.join(root,'updates'),currentVersion:'1.1.8.0c',fetchImpl,readHostState:options.readHostState || (async()=>({...host})),isOtherUpdatePending:()=>otherPending,launchInstaller:async file=>launches.push(file),revealInstaller:async file=>reveals.push(file)});
  return {root,item,client,calls,launches,reveals,host,setOther:value=>otherPending=value};
}

test('Craft versions are strict four-part c versions and compare numerically',()=>{
  assert.equal(compareCraftVersions('1.1.10.0c','1.1.9.0c'),1);
  assert.equal(compareCraftVersions('1.1.8.0c','1.1.8.0c'),0);
  for(const value of ['1.1.8','1.1.8c','1.1.8.0','1.1.8.0t','01.1.8.0c','1.1.65536.0c','1.1.8.0c.exe']) assert.throws(()=>parseCraftVersion(value));
});
test('requires Craft product marker, stable release, exact canonical assets and GitHub digests',()=>{
  for(const change of [r=>r.prerelease=true,r=>r.draft=true,r=>r.body='',r=>r.body=r.body.replace('craft','terre'),r=>r.assets[0].digest=null,r=>r.assets[0].browser_download_url='https://evil.example/setup.exe',r=>r.assets.push({...r.assets[0]}),r=>r.assets[0].state='new']) {
    const r=release().record;change(r);assert.throws(()=>validateCraftRelease(r));
  }
  const r=release();const checked=validateCraftRelease(r.record);
  for(const change of [d=>d.product='terre',d=>d.channel='preview',d=>d.version='1.1.10.0c',d=>d.assets[0].sha256='0'.repeat(64),d=>d.assets[0].size++]) {
    const d=structuredClone(r.descriptor);change(d);assert.throws(()=>validateCraftDescriptor(d,checked));
  }
});
test('selects numeric newest stable Craft release without /latest or cross-product fallback',async t=>{
  const latest=release('1.1.10.0c'), older=release('1.1.9.0c'), terre={...release('9.9.9.0c').record,tag_name:'v9.9.9.0'};
  const f=await fixture(t,{item:latest,releases:[older.record,terre,latest.record]});
  assert.equal((await f.client.check()).version,'1.1.10.0c');
  assert(f.calls.every(x=>!x.url.includes('/latest')));assert.equal(f.launches.length,0);
  assert.equal(f.calls.length,2,'metadata only, never the installer during check');
});
test('does not downgrade or install current release',async t=>{
  const f=await fixture(t,{releases:[release('1.1.7.0c').record,release('1.1.8.0c').record]});
  assert.equal(await f.client.check(),null);await assert.rejects(f.client.download(),/先检查/);
});
test('malformed newest Craft release fails closed rather than silently choosing older release',async t=>{
  const newest=release('1.1.10.0c').record;newest.body='';
  const f=await fixture(t,{releases:[newest,release().record]});
  await assert.rejects(f.client.check(),/产品标记/);assert.equal(f.client.candidate,null);
});
test('descriptor byte corruption is rejected before enabling downloads',async t=>{
  const item=release();item.metadata=Buffer.from(JSON.stringify({...item.descriptor,channel:'preview'}));
  const f=await fixture(t,{item});await assert.rejects(f.client.check(),/完整性/);await assert.rejects(f.client.download(),/先检查/);
});
test('downloaded bytes are verified and installer opens only on explicit user action, with no installed claim',async t=>{
  const f=await fixture(t);await f.client.check();const result=await f.client.download();
  assert.equal(result.verified,true);assert.equal(f.launches.length,0);assert.equal(result.sha256,hash(f.item.body));
  const file=f.client.downloaded.file;assert(file.startsWith(path.join(f.root,'updates')));
  const count=f.calls.length;await f.client.download();assert.equal(f.calls.length,count,'repeat download rechecks local bytes without creating extra cache');
  await f.client.reveal();assert.deepEqual(f.reveals,[file]);assert.equal(f.launches.length,0);
  const opened=await f.client.install();assert.equal(opened.opened,true);assert.equal(opened.installed,false);assert.deepEqual(f.launches,[file]);
  await assert.rejects(f.client.install(),/已经打开/);
});
for(const [name,bytes] of [['corrupt',Buffer.from('wrong test installer')],['truncated',Buffer.from('a')],['oversized',Buffer.alloc(1000)]]) test(name+' installer is discarded and never launched',async t=>{
  const f=await fixture(t,{downloadBody:bytes});await f.client.check();await assert.rejects(f.client.download(),/校验失败|超出/);
  assert.equal(f.client.downloaded,null);assert.deepEqual(await fs.readdir(path.join(f.root,'updates')),[]);assert.equal(f.launches.length,0);
});
test('rechecks downloaded SHA-256 before opening and rejects changed files',async t=>{
  const f=await fixture(t);await f.client.check();await f.client.download();await fs.writeFile(f.client.downloaded.file,Buffer.alloc(f.item.body.length));
  await assert.rejects(f.client.install(),/发生变化/);assert.equal(f.launches.length,0);
});
test('dirty, busy, and unknown host state cannot launch installer',async t=>{
  const f=await fixture(t);await f.client.check();await f.client.download();
  f.host.hasUnsavedDocuments=true;await assert.rejects(f.client.install(),/保存/);
  f.host.hasUnsavedDocuments=false;f.host.hasBlockingTasks=true;await assert.rejects(f.client.install(),/任务/);
  delete f.host.hasBlockingTasks;await assert.rejects(f.client.install(),/无法确认/);assert.equal(f.launches.length,0);
});
test('checks native state again after potentially slow disk verification',async t=>{
  let reads=0;const f=await fixture(t,{readHostState:async()=>({hasUnsavedDocuments:++reads>1,hasBlockingTasks:false})});
  await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/保存/);assert.equal(f.launches.length,0);
});
test('official update and own update serialize at backend',async t=>{
  const f=await fixture(t);f.setOther(true);await assert.rejects(f.client.check(),/官方更新/);
  f.setOther(false);await f.client.check();await f.client.download();f.setOther(true);await assert.rejects(f.client.install(),/官方更新/);assert.equal(f.launches.length,0);
});
test('fails closed on unsafe redirect without contacting the untrusted host',async t=>{
  const f=await fixture(t,{fetchImpl:(url,init,item)=>url.startsWith('https://api.github.com/')?new Response(JSON.stringify([item.record])):new Response('',{status:302,headers:{location:'http://evil.example/setup.exe'}})});
  await assert.rejects(f.client.check(),/不安全/);assert.equal(f.calls.length,2);
});
test('permits only GitHub release CDN redirects and checks resulting bytes',async t=>{
  const f=await fixture(t,{fetchImpl:(url,init,item)=>url.startsWith('https://api.github.com/')?new Response(JSON.stringify([item.record])):url.includes('release-assets.githubusercontent.com')?new Response(item.metadata):new Response('',{status:302,headers:{location:'https://release-assets.githubusercontent.com/test?signed=value'}})});
  assert.equal((await f.client.check()).version,'1.1.9.0c');assert.equal(f.calls.length,3);
});
test('cache must remain outside the replaceable adapter and reject linked parents',async t=>{
  const f=await fixture(t);assert.throws(()=>new CraftOwnUpdates({adapterRoot:f.root,cacheRoot:path.join(f.root,'updates'),currentVersion:'1.1.8.0c'}),/目录之外/);
  const actual=path.join(f.root,'actual');await fs.mkdir(actual);await fs.symlink(actual,path.join(f.root,'updates'),'dir');await f.client.check();await assert.rejects(f.client.download(),/链接路径/);
});
test('scans past first page and refuses incomplete bounded listings',async t=>{
  const irrelevant=Array.from({length:100},(_,i)=>({tag_name:'terre-v'+i,draft:false,prerelease:false}));
  const f=await fixture(t,{fetchImpl:(url,init,item)=>url.startsWith('https://api.github.com/')?new Response(JSON.stringify(url.endsWith('page=1')?irrelevant:[item.record])):new Response(item.metadata)});
  assert.equal((await f.client.check()).version,'1.1.9.0c');assert(f.calls.some(x=>x.url.endsWith('page=2')));
  const g=await fixture(t,{fetchImpl:()=>new Response(JSON.stringify(irrelevant))});await assert.rejects(g.client.check(),/尚未完整/);assert.equal(g.calls.length,10);
});

const source = await fs.readFile(new URL('../update/own-client.js',import.meta.url),'utf8');
function browserFixture(overrides={}) {
  const calls=[],app={inert:false},stores={editor:{hasUnsavedDocuments:false},runtimeTask:{hasBlockingTasks:false}};
  const context={document:{querySelector:()=>app}};vm.runInNewContext(source,context);
  const client=context.WebVideoCraftCreateOwnUpdates({getStores:()=>stores,...(Object.hasOwn(overrides,'readLocalState')?{readLocalState:overrides.readLocalState}:{}),rpc:async method=>{calls.push(method);if(overrides.rpc)return overrides.rpc(method);if(method==='ownUpdate.check')return{version:'1.1.9.0c'};if(method==='ownUpdate.download')return{version:'1.1.9.0c',verified:true};if(method==='ownUpdate.install')return{opened:true,installed:false};return{revealed:true};}});
  return{calls,app,stores,client};
}
test('browser own update path uses scoped RPC and no native official updater commands',async()=>{
  const f=browserFixture();await f.client.check();await f.client.download();await f.client.install();
  assert.deepEqual(f.calls,['ownUpdate.check','ownUpdate.download','ownUpdate.install']);assert.equal(f.client.state().status,'opened');assert.equal(f.app.inert,false);
});
test('browser requires verified download and live clean host state before opening',async()=>{
  const f=browserFixture();await assert.rejects(f.client.install(),/下载/);await f.client.check();await f.client.download();
  f.stores.editor.hasUnsavedDocuments=true;await assert.rejects(f.client.install(),/保存/);assert(!f.calls.includes('ownUpdate.install'));assert.equal(f.app.inert,false);
});
test('browser failed launch restores editing and permits retry',async()=>{
  let fail=true;const f=browserFixture({rpc:async method=>{if(method==='ownUpdate.check')return{version:'1.1.9.0c'};if(method==='ownUpdate.download')return{version:'1.1.9.0c',verified:true};if(fail)throw Error('test failure');return{opened:true,installed:false};}});
  await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/test failure/);assert.equal(f.app.inert,false);fail=false;await f.client.install();assert.equal(f.client.state().status,'opened');
});
test('browser repeat click while checking is rejected and does not duplicate RPC',async()=>{
  let resolve;const f=browserFixture({rpc:()=>new Promise(r=>resolve=r)});const pending=f.client.check();
  await assert.rejects(f.client.check(),/正在进行/);resolve(null);await pending;assert.equal(f.calls.length,1);
});

test('release descriptor generator binds the source installer version and exact final bytes',async t=>{
  const {buildCraftReleaseDescriptor}=await import('../update/build-release-descriptor.mjs');
  const f=await fixture(t),versionFile=path.join(f.root,'version.json'),installer=path.join(f.root,'WebVideoCraft-Setup-1.1.9.0c.exe');
  await fs.writeFile(versionFile,JSON.stringify({installerVersion:'1.1.9.0c'}));await fs.writeFile(installer,f.item.body);
  const result=await buildCraftReleaseDescriptor(installer,{versionsFile:versionFile});
  assert.equal(result.installerSha256,hash(f.item.body));assert.equal(result.installerSize,f.item.body.length);assert.equal(result.releaseTag,'craft-v1.1.9.0c');
  const bytes=await fs.readFile(result.descriptorPath);assert.equal(result.descriptorSha256,hash(bytes));
  assert.deepEqual(JSON.parse(bytes),f.item.descriptor);assert.match(result.bodyMarker,/"product":"craft"/);
  await assert.rejects(buildCraftReleaseDescriptor(path.join(f.root,'WebVideoCraft-Setup-1.1.8.0c.exe'),{versionsFile:versionFile}),/source installerVersion/);
  assert.deepEqual(JSON.parse(await fs.readFile(versionFile,'utf8')),{installerVersion:'1.1.9.0c'},'never edits source version metadata');
});

test('closing the Craft session cancels in-flight network work and rejects subsequent actions',async t=>{
  const f=await fixture(t,{fetchImpl:(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})});
  const checking=f.client.check();await Promise.resolve();await f.client.close();await assert.rejects(checking,/已关闭/);
  assert.equal(f.client.busy,false);await assert.rejects(f.client.check(),/已关闭/);assert.equal(f.launches.length,0);
});
test('normal host closure during final save-state check cannot launch installer',async t=>{
  let reads=0,continueRead;const f=await fixture(t,{readHostState:async()=>{if(++reads===2)await new Promise(resolve=>continueRead=resolve);return{hasUnsavedDocuments:false,hasBlockingTasks:false};}});
  await f.client.check();await f.client.download();const opening=f.client.install();
  while(!continueRead)await new Promise(resolve=>setImmediate(resolve));
  const closing=f.client.close();continueRead();await closing;await assert.rejects(opening,/已关闭/);assert.equal(f.launches.length,0);
});

test('tampering while the second native state read is pending is rejected before launch',async t=>{
  let reads=0,finishRead;const f=await fixture(t,{readHostState:async()=>{if(++reads===2)await new Promise(resolve=>finishRead=resolve);return{hasUnsavedDocuments:false,hasBlockingTasks:false};}});
  await f.client.check();await f.client.download();const opening=f.client.install();
  while(!finishRead)await new Promise(resolve=>setImmediate(resolve));
  await fs.writeFile(f.client.downloaded.file,Buffer.alloc(f.item.body.length));finishRead();
  await assert.rejects(opening,/发生变化/);assert.equal(f.launches.length,0);assert.equal(f.client.launched,false);
});
for(const action of ['install','reveal']) test(action+' rejects cached installers with another hard link',async t=>{
  const f=await fixture(t);await f.client.check();await f.client.download();
  await fs.link(f.client.downloaded.file,path.join(f.root,'alias.exe'));
  await assert.rejects(f.client[action](),/发生变化/);assert.equal(f.launches.length,0);assert.equal(f.reveals.length,0);
});
test('normal installer and Explorer launches strip session WebView debug and profile variables case-insensitively',async()=>{
  const {launchCraftInstaller,cleanInstallerEnvironment}=await import('../update/own-updates.mjs');
  const {EventEmitter}=await import('node:events');
  const environment={SystemRoot:'C:\\Windows',PATH:'safe-path',WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=12345',webview2_additional_browser_arguments:'--another-port',WEBVIEW2_USER_DATA_FOLDER:'isolated-session-profile',WebView2_User_Data_Folder:'another-profile',WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER:'test-pipe',webview2_pipe_for_script_debugger:'lowercase-test-pipe',KEEP:'unchanged'};
  const original={...environment},calls=[];
  const spawnImpl=(...args)=>{calls.push(args);const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  for(const reveal of [false,true])await launchCraftInstaller('C:\\Temp\\verified.exe',{reveal,spawnImpl,platform:'win32',environment});
  assert.deepEqual(environment,original,'do not mutate the running session environment');
  assert.deepEqual(cleanInstallerEnvironment(environment),{SystemRoot:'C:\\Windows',PATH:'safe-path',KEEP:'unchanged'});
  assert.equal(calls[0][0],'C:\\Temp\\verified.exe');assert.deepEqual(calls[0][1],[]);assert.equal(calls[1][0],'C:\\Windows\\explorer.exe');
  for(const [, , options] of calls){assert.equal(options.shell,false);assert.deepEqual(options.env,{SystemRoot:'C:\\Windows',PATH:'safe-path',KEEP:'unchanged'});}
});

for (const [label, change] of [
  ['missing platform', descriptor => delete descriptor.platform],
  ['wrong platform', descriptor => { descriptor.platform = 'linux'; }],
  ['missing architecture', descriptor => delete descriptor.architecture],
  ['wrong architecture', descriptor => { descriptor.architecture = 'arm64'; }],
]) test('descriptor '+label+' fails before download or installer launch despite valid digests', async t => {
  const item = release(); change(item.descriptor);
  assert.throws(() => validateCraftDescriptor(item.descriptor, validateCraftRelease(item.record)), /Windows x64/);
  item.metadata = Buffer.from(JSON.stringify(item.descriptor));
  const metadataAsset = item.record.assets.find(asset => asset.name === 'webvideo-release.json');
  metadataAsset.size = item.metadata.length; metadataAsset.digest = 'sha256:' + hash(item.metadata);
  const f = await fixture(t, {item});
  await assert.rejects(f.client.check(), /Windows x64/);
  await assert.rejects(f.client.download(), /先检查/);
  await assert.rejects(f.client.install(), /下载/);
  assert.equal(f.client.candidate, null); assert.equal(f.launches.length, 0);
  assert(f.calls.every(call => !call.url.endsWith('.exe')));
});
test('download and cached install independently refuse a changed target', async t => {
  const f = await fixture(t); const selected = await f.client.check();
  assert.equal(selected.platform, 'windows'); assert.equal(selected.architecture, 'x64');
  f.client.candidate.platform = 'linux';
  await assert.rejects(f.client.download(), /Windows x64/);
  assert(f.calls.every(call => !call.url.endsWith('.exe')));
  f.client.candidate.platform = 'windows'; await f.client.download();
  f.client.candidate.architecture = 'arm64';
  await assert.rejects(f.client.install(), /Windows x64/); assert.equal(f.launches.length, 0);
});

const cleanKnownState = () => ({hasUnsavedDocuments:false,hasBlockingTasks:false,coverage:'known-work-only'});
test('pinned local reader handles absent lazy runtime-task but still requires guarded backend install',async()=>{
  const observations=[];let f;
  f=browserFixture({readLocalState:()=>{observations.push(f.app.inert);return cleanKnownState();}});
  delete f.stores.runtimeTask;await f.client.check();await f.client.download();await f.client.install();
  assert.deepEqual(observations,[false,true],'both checks run, the second while editing is inert');
  assert.deepEqual(f.calls,['ownUpdate.check','ownUpdate.download','ownUpdate.install']);
  assert.equal(f.client.state().status,'opened');assert.equal(f.app.inert,false);
});
test('legacy integration without pinned local reader still refuses missing runtime-task proof',async()=>{
  const f=browserFixture();delete f.stores.runtimeTask;await f.client.check();await f.client.download();
  await assert.rejects(f.client.install(),/无法确认/);assert(!f.calls.includes('ownUpdate.install'));
});
test('known native modal work blocks opening even when lazy runtime-task is absent',async()=>{
  const f=browserFixture({readLocalState:()=>({...cleanKnownState(),hasBlockingTasks:true,blockingReasons:['native-modal']})});
  delete f.stores.runtimeTask;await f.client.check();await f.client.download();
  await assert.rejects(f.client.install(),/任务/);assert(!f.calls.includes('ownUpdate.install'));assert.equal(f.app.inert,false);
});
for(const [label,readLocalState] of [
  ['null callback',null],['invalid callback',true],['missing proof',()=>undefined],['null proof',()=>null],
  ['missing coverage',()=>({hasUnsavedDocuments:false,hasBlockingTasks:false})],['unsupported coverage',()=>({...cleanKnownState(),coverage:'all-work-idle'})],
  ['missing document boolean',()=>({coverage:'known-work-only',hasBlockingTasks:false})],['missing work boolean',()=>({coverage:'known-work-only',hasUnsavedDocuments:false})],
  ['coerced document value',()=>({coverage:'known-work-only',hasUnsavedDocuments:0,hasBlockingTasks:false})],['coerced work value',()=>({coverage:'known-work-only',hasUnsavedDocuments:false,hasBlockingTasks:'false'})],
  ['asynchronous proof',()=>Promise.resolve(cleanKnownState())],['unsupported pinned host',()=>{throw Error('unsupported-host-profile');}],
]) test('own client refuses '+label+' without falling back to clean-looking generic stores',async()=>{
  const f=browserFixture({readLocalState});await f.client.check();await f.client.download();
  await assert.rejects(f.client.install());assert(!f.calls.includes('ownUpdate.install'));assert.equal(f.app.inert,false);assert.equal(f.client.state().busy,false);
});
test('pinned local dirty-document proof cannot be overridden by the generic clean editor store',async()=>{
  const f=browserFixture({readLocalState:()=>({...cleanKnownState(),hasUnsavedDocuments:true})});
  await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/保存/);assert(!f.calls.includes('ownUpdate.install'));
});
test('work beginning between local checks refuses launch, restores editing, and permits a clean retry',async()=>{
  let reads=0;const f=browserFixture({readLocalState:()=>({...cleanKnownState(),hasBlockingTasks:++reads===2})});
  delete f.stores.runtimeTask;await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/任务/);
  assert(!f.calls.includes('ownUpdate.install'));assert.equal(f.app.inert,false);assert.equal(f.client.state().busy,false);
  await f.client.install();assert.equal(f.calls.filter(method=>method==='ownUpdate.install').length,1);assert.equal(f.client.state().status,'opened');
});
test('clean known-local proof never bypasses a backend job-state failure',async()=>{
  let fail=true;const f=browserFixture({readLocalState:cleanKnownState,rpc:async method=>{
    if(method==='ownUpdate.check')return{version:'1.1.9.0c'};
    if(method==='ownUpdate.download')return{version:'1.1.9.0c',verified:true};
    if(fail)throw Error('kernel-task-state-unavailable');return{opened:true,installed:false};
  }});
  delete f.stores.runtimeTask;await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/kernel-task-state-unavailable/);
  assert.equal(f.client.state().status,'failed');assert.equal(f.app.inert,false);assert.equal(f.client.state().busy,false);
  fail=false;await f.client.install();assert.equal(f.calls.filter(method=>method==='ownUpdate.install').length,2);
});
test('repeated Open while backend guard is pending cannot duplicate install or release inert state',async()=>{
  let finishInstall;const f=browserFixture({readLocalState:cleanKnownState,rpc:async method=>{
    if(method==='ownUpdate.check')return{version:'1.1.9.0c'};
    if(method==='ownUpdate.download')return{version:'1.1.9.0c',verified:true};
    return new Promise(resolve=>finishInstall=resolve);
  }});
  delete f.stores.runtimeTask;await f.client.check();await f.client.download();const opening=f.client.install();
  assert.equal(f.app.inert,true);await assert.rejects(f.client.install(),/正在进行/);
  assert.equal(f.app.inert,true);assert.equal(f.calls.filter(method=>method==='ownUpdate.install').length,1);
  finishInstall({opened:true,installed:false});await opening;assert.equal(f.app.inert,false);assert.equal(f.client.state().busy,false);
});
test('failed local recheck preserves an already-inert application',async()=>{
  let reads=0;const f=browserFixture({readLocalState:()=>({...cleanKnownState(),hasUnsavedDocuments:++reads===2})});
  f.app.inert=true;await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/保存/);
  assert.equal(f.app.inert,true);assert(!f.calls.includes('ownUpdate.install'));
});

for(const mode of ['active','started-and-finished','context-lost']) test('final installer hash cannot outlive '+mode+' session proof',async t=>{
  let revision=0,pending=0,contextValid=true,checks=0,finishVerification;
  const f=await fixture(t,{readHostState:async()=>{
    const captured=revision;
    return{hasUnsavedDocuments:false,hasBlockingTasks:false,coverage:'own-installer-ui-only',assertCurrent(){
      checks++;if(!contextValid)throw Error('session-context-lost');if(revision!==captured||pending)throw Error('session-work-changed');
    }};
  }});
  await f.client.check();await f.client.download();
  const original=f.client.verifyDownloaded.bind(f.client);let verifications=0;
  f.client.verifyDownloaded=async()=>{if(++verifications===2)await new Promise(resolve=>finishVerification=resolve);return original();};
  const opening=f.client.install();while(!finishVerification)await new Promise(resolve=>setImmediate(resolve));
  if(mode==='context-lost')contextValid=false;
  else{revision++;pending++;if(mode==='started-and-finished'){pending--;revision++;}}
  finishVerification();await assert.rejects(opening,/session-context-lost|session-work-changed/);
  assert.equal(checks,1);assert.equal(f.launches.length,0);assert.equal(f.client.launched,false);assert.equal(f.client.busy,false);
});
for(const [label,extra] of [
  ['missing validator',{}],['null validator',{assertCurrent:null}],['non-function validator',{assertCurrent:true}],
  ['unknown coverage',{coverage:'known-work-only',assertCurrent(){}}],
]) test('scoped own-installer proof rejects '+label,async t=>{
  const f=await fixture(t,{readHostState:async()=>({hasUnsavedDocuments:false,hasBlockingTasks:false,coverage:'own-installer-ui-only',...extra})});
  await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/凭据无效/);assert.equal(f.launches.length,0);
});
for(const [label,assertCurrent] of [
  ['false validator result',()=>false],['async validator',async()=>true],['rejected async validator',async()=>{throw Error('late-context-loss');}],
]) test('scoped own-installer proof rejects '+label+' before launch',async t=>{
  const f=await fixture(t,{readHostState:async()=>({hasUnsavedDocuments:false,hasBlockingTasks:false,coverage:'own-installer-ui-only',assertCurrent})});
  await f.client.check();await f.client.download();await assert.rejects(f.client.install(),/同步|未通过/);assert.equal(f.launches.length,0);
});
test('only the latest state proof is asserted synchronously immediately before installer spawn',async t=>{
  let reads=0,checked=false,microtaskRan=false;
  const f=await fixture(t,{readHostState:async()=>{
    const read=++reads;
    return{hasUnsavedDocuments:false,hasBlockingTasks:false,coverage:'own-installer-ui-only',assertCurrent(){
      assert.equal(read,2,'do not reuse the proof from before the first hash');checked=true;queueMicrotask(()=>microtaskRan=true);return true;
    }};
  }});
  f.client.launchInstaller=file=>{assert.equal(checked,true);assert.equal(microtaskRan,false,'no awaited continuation between final assertion and spawn');f.launches.push(file);return Promise.resolve();};
  await f.client.check();await f.client.download();const result=await f.client.install();
  assert.equal(result.opened,true);assert.equal(result.installed,false);assert.equal(reads,2);assert.equal(f.launches.length,1);
});

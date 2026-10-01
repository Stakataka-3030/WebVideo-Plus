// WebVideo+ Craft session launcher. No global environment or persistent background service.
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {SessionRpc,CdpConnection} from './session/rpc.mjs';
import {SessionStorage} from './session/storage.mjs';
import {KernelSession} from './session/kernel.mjs';
import {previewSettings,capturePreviewConfigs,PreviewSessionManager} from './session/preview.mjs';
import {UpdateCoordinator} from './update/coordinator.mjs';
import {readState,verifyPackage} from './installer/transaction.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),split=args.indexOf('--'),options=split<0?args:args.slice(0,split),hostArgs=split<0?[]:args.slice(split+1);
const option=k=>{const i=options.indexOf(k);return i<0?undefined:options[i+1];};
const configPath=option('--config')||option('--state');
if(!configPath)throw Error('请通过已验证的 Craft 适配安装配置启动');
const config=readState(configPath),manifest=verifyPackage(config.adapterRoot,{allowMutable:true});
if(manifest.manifestSha256!==config.package.manifestSha256)throw Error('适配包与安装记录不一致');
const craft=path.resolve(option('--craft')||config.originalExe||config.craftExe||''),kernel=path.resolve(option('--kernel')||config.kernelExe||'');
if(process.platform!=='win32')throw Error('Craft 原生启动只支持 Windows；云端可运行单元测试');
await fs.access(craft);await fs.access(kernel);
if(path.resolve(craft).toLowerCase()!==path.resolve(config.originalExe).toLowerCase()||path.resolve(kernel).toLowerCase()!==path.resolve(config.kernelExe).toLowerCase())throw Error('启动路径不属于当前安装记录');
if(option('--profile')&&!options.includes('--isolated-test'))throw Error('--profile 仅用于显式隔离测试');
const expected=config.ownership?.originalSha256||config.host?.sha256;
if(expected){const actual=crypto.createHash('sha256').update(await fs.readFile(craft)).digest('hex');if(!manifest.supportedHosts.some(h=>h.sha256===actual.toLowerCase()))throw Error('该 Craft 主程序不在已验证兼容列表');if(actual.toLowerCase()!==expected.toLowerCase())throw Error('Craft 文件已变化，请先检查新版本兼容性');}
const stateDir=config.stateDir||path.join(path.dirname(configPath||here),'state');await fs.mkdir(stateDir,{recursive:true});
const sessionId=crypto.randomUUID();
const installLocks=[(config.adapterRoot||path.dirname(stateDir))+'.install-lock',(config.craftExe||craft)+'.webvideo.install-lock'];const checkInstall=async()=>{for(const p of installLocks){if(await fs.stat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('适配安装器正在运行，请稍后重试');}};await checkInstall();
const lockPath=path.join(stateDir,'session.lock');let lock;try{lock=await fs.open(lockPath,'wx');await lock.writeFile(JSON.stringify({sessionId,pid:process.pid}));}catch(e){throw Error('另一个增强会话或未恢复的会话记录存在，请关闭 Craft 后使用安装器检查恢复');}
try{await checkInstall();}catch(e){await lock.close();await fs.rm(lockPath,{force:true});throw e;}
const root=path.join(stateDir,'sessions',sessionId);await fs.mkdir(root,{recursive:true});
const log=data=>fs.appendFile(path.join(root,'session.log'),JSON.stringify({at:new Date().toISOString(),...data})+'\n');
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const env={...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`};
if(option('--profile'))env.WEBVIEW2_USER_DATA_FOLDER=path.resolve(option('--profile'));
const app=spawn(craft,hostArgs,{cwd:path.dirname(craft),env,windowsHide:false,stdio:'ignore'});
let spawnError;app.once('error',e=>spawnError=e);const waitForApp=()=>app.exitCode!==null||app.signalCode!==null?Promise.resolve():new Promise(resolve=>app.once('exit',resolve));
const lease={schemaVersion:1,sessionId,coordinatorPid:process.pid,hostPid:app.pid,wrapperPid:Number(option('--wrapper-pid'))||undefined,hostExe:craft,startedAt:new Date().toISOString()};
await fs.writeFile(path.join(stateDir,'session.json'),JSON.stringify(lease));
const storage=new SessionStorage(root),service=new KernelSession({kernel,root,storage,runtimePath:config.runtimePath,stateRoot:path.join(stateDir,"kernel")});
const updater=new UpdateCoordinator({stateDir,hostPid:app.pid,craftExe:config.craftExe||craft,installMode:config.installMode||'external',supportedHosts:config.supportedHosts||{},observerValidated:false /* enable only after a package-scoped native compatibility test */});
let cdp,rpc,previewManager,closed=false;
async function shutdown(){if(closed)return;closed=true;rpc?.close();await previewManager?.close();cdp?.close();await service.stop();
  const current=JSON.parse(await fs.readFile(path.join(stateDir,'session.json'),'utf8').catch(()=>'{}'));if(current.sessionId===sessionId)await fs.writeFile(path.join(stateDir,'session.json'),JSON.stringify({...lease,closedAt:new Date().toISOString()}));await lock?.close();const owned=JSON.parse(await fs.readFile(lockPath,'utf8').catch(()=>'{}'));if(owned.sessionId===sessionId)await fs.rm(lockPath,{force:true});}
process.on('SIGINT',()=>console.error('请先保存并关闭此 Craft 窗口；会话会在宿主退出后自动清理。'));
try{
 let target;const until=Date.now()+25000;
 while(Date.now()<until){if(spawnError)throw spawnError;if(app.exitCode!==null)throw Error('Craft 已退出。请关闭其他已运行实例后，通过增强入口重试');
  try{const list=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json();const candidates=list.filter(x=>{try{const u=new URL(x.url);return x.type==='page'&&u.origin==='http://tauri.localhost';}catch{return false;}});if(candidates.length===1){target=candidates[0];break;}}
  catch{}await new Promise(r=>setTimeout(r,100));
 }
 if(!target)throw Error('未找到唯一的 Craft 主页面');
 // Check the actual listener and owning process ancestry; a command-line flag alone is not evidence.
 const ps=`$rows=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop); if(!$rows.Count){throw 'no listener'}; foreach($r in $rows){if($r.LocalAddress -notin @('127.0.0.1','::1')){throw 'non-loopback listener'};$p=$r.OwningProcess;$ok=$false;for($i=0;$i -lt 20 -and $p -gt 0;$i++){if($p -eq ${app.pid}){$ok=$true;break};$w=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p);if(!$w){break};$p=$w.ParentProcessId};if(!$ok){throw 'listener not owned by launched host'}};'verified'`;
 await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{timeout:15000,windowsHide:true});
 const wsUrl=new URL(target.webSocketDebuggerUrl);if(wsUrl.hostname!=='127.0.0.1'&&wsUrl.hostname!=='localhost'||Number(wsUrl.port)!==port)throw Error('调试目标地址不匹配');
 const socket=new WebSocket(wsUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});cdp=new CdpConnection(socket);
 let reinject;const contexts=new Map();cdp.on(m=>{if(m.sessionId)return;if(m.method==='Runtime.executionContextsCleared'){contexts.clear();rpc?.close();}if(m.method==='Runtime.executionContextCreated'){contexts.set(m.params.context.id,m.params.context);if(reinject)void reinject(m.params.context).catch(e=>log({event:'reinjection-failed',error:e.message}));}if(m.method==='Runtime.executionContextDestroyed'){contexts.delete(m.params.executionContextId);if(rpc?.contextId===m.params.executionContextId)rpc.close();}});
 const loadedPreviewConfigs=capturePreviewConfigs({call:(m,p)=>cdp.call(m,p),on:fn=>cdp.on(m=>{if(!m.sessionId)fn(m);})});await cdp.call('Network.enable');
 await cdp.call('Runtime.enable');await cdp.call('Page.enable');const tree=await cdp.call('Page.getFrameTree');
 const ctx=[...contexts.values()].find(c=>c.auxData?.isDefault&&c.auxData.frameId===tree.frameTree.frame.id&&c.origin==='http://tauri.localhost');if(!ctx)throw Error('Craft 主执行上下文无法验证');
 const bindingName='__wv_'+crypto.randomBytes(12).toString('hex');
 async function verifyProject(p){if(!p.project)return;const result=await cdp.call('Runtime.evaluate',{contextId:rpc.contextId,expression:`(()=>{const w=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('workspace').currentGame;return w?{id:w.id,path:w.path}:null})()`,returnByValue:true});const game=result.result?.value;if(!game||game.id!==p.project.id||path.resolve(game.path).toLowerCase()!==path.resolve(p.project.path).toLowerCase())throw Error('current-project-mismatch');}
 previewManager=new PreviewSessionManager(cdp,contexts,loadedPreviewConfigs);
 const handlers={
  'update.prepare':p=>updater.prepare(p),'update.abort':()=>updater.abort(),
  'preview.settings':async p=>{const r=await cdp.call('Runtime.evaluate',{contextId:rpc.contextId,expression:`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('previewSession')?.currentGameServeUrl`,returnByValue:true});if(r.result?.value!==p.url)throw Error('preview-project-mismatch');return previewManager.settings(p);},
  'backups.captureText':p=>storage.captureStoryText(p.project,p.files,p.slot),
  'backups.list':p=>storage.listBackups(p.project),'backups.capture':p=>storage.captureStory(p.snapshotId,p.project),
  'metadata.read':p=>storage.metadata(p), 'metadata.write':p=>storage.metadata(p,true),
  'snapshot.allocate':p=>storage.allocate(p.project,p.sources), 'snapshot.ready':p=>storage.ready(p.snapshotId), 'snapshot.discard':p=>storage.discard(p.snapshotId),
  'service.request':p=>service.request(p),
  'export.start':async p=>service.request({endpoint:'/api/jobs',data:p.options||{},snapshotId:p.snapshotId}),
  'job.cancel':p=>service.request({endpoint:'/api/jobs/'+p.jobId+'/cancel',data:{}}),
 };
 for(const name of Object.keys(handlers)){const original=handlers[name];handlers[name]=async p=>{await verifyProject(p);return original(p);};}
 rpc=new SessionRpc({contextId:ctx.id,bindingName,handlers});await cdp.call('Runtime.addBinding',{name:bindingName,executionContextId:ctx.id});
 cdp.on(m=>{if(m.sessionId||m.method!=='Runtime.bindingCalled')return;void rpc.dispatch(m.params).then(result=>cdp.call('Runtime.evaluate',{contextId:m.params.executionContextId,expression:`window.__WebVideoCraftReply?.(${JSON.stringify(result)})`})).catch(e=>log({event:'rpc-rejected',error:e.message}));});
 const files=['host-bridge.js','project-registry.js','features/vendor/webgal-parser-4.6.5.js','features/script.js','features/id-completion.js','features/authoring.js','features/media.js','features/imports.js','features/review.js','features/backups.js','update/client.js','ui/media-panel.js','ui/main.js'];
 const source=[];for(const file of files)source.push(await fs.readFile(path.join(here,file),'utf8'));
 const yaml=await fs.readFile(path.join(here,'..','vendor','js-yaml-4.1.1.min.js'),'utf8');
 const novel=await fs.readFile(path.join(here,'..','browser','novel-core.js'),'utf8');
 let styles='';try{styles=await fs.readFile(path.join(here,'ui/styles.css'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 source.push(`(()=>{const s=document.createElement('style');s.dataset.webvideoCraft='styles';s.textContent=${JSON.stringify(styles)};document.head.appendChild(s);})()`);
 const bootstrap=`(()=>{if(window.WebVideoCraftBridge)return;const pending=new Map();let id=0;const token=${JSON.stringify(rpc.token)};window.__WebVideoCraftReply=r=>{const p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.ok?p.resolve(r.value):p.reject(Error(r.error));};const request=(method,params)=>new Promise((resolve,reject)=>{const key=String(++id),timer=setTimeout(()=>{pending.delete(key);reject(Error('操作等待超时'));},180000);pending.set(key,{resolve,reject,timer});window[${JSON.stringify(bindingName)}](JSON.stringify({id:key,token,method,params}));});const getStores=()=>{const p=document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;if(!p?._s)throw Error('发行版宿主桥不可用');return Object.fromEntries(['editor','tabs','file','workspace','runtime-task','preview-session'].map(k=>[k.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),p._s.get(k)||p._s.get(k.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))]));};window.WebVideoCraftBridge=WebVideoCraftCreateBridge({getStores,invoke:(cmd,args)=>window.__TAURI_INTERNALS__.invoke(cmd,args),rpc:request,registry:WebVideoCraftResolveProject});window.WebVideoCraftUpdates=WebVideoCraftCreateUpdates({invoke:(cmd,args)=>window.__TAURI_INTERNALS__.invoke(cmd,args),internals:window.__TAURI_INTERNALS__,rpc:request,getStores});window.WebVideoCraftNovel=WebVideoNovel;window.WebVideoCraftUI?.mount(window.WebVideoCraftBridge);return {stores:Object.keys(getStores()),capabilities:WebVideoCraftBridge.capabilities(),ui:!!window.WebVideoCraftUI};})()`;
 async function waitForVue(contextId){const until=Date.now()+20000;while(Date.now()<until){const r=await cdp.call('Runtime.evaluate',{contextId,expression:`!!document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia`,returnByValue:true});if(r.result?.value)return;await new Promise(r=>setTimeout(r,100));}throw Error('Craft 页面初始化超时');}
 await waitForVue(ctx.id);
 const injected=await cdp.call('Runtime.evaluate',{contextId:ctx.id,expression:yaml+'\n'+novel+'\n'+source.join('\n')+'\n'+bootstrap,returnByValue:true});if(injected.exceptionDetails)throw Error(injected.exceptionDetails.text+' '+(injected.exceptionDetails.exception?.description||''));
 await log({event:'injected',target:target.id,result:injected.result?.value,listener:'verified-loopback-owned'});
 reinject=async next=>{if(!next.auxData?.isDefault||next.auxData.frameId!==tree.frameTree.frame.id||next.origin!=='http://tauri.localhost'||next.id===rpc.contextId&&!rpc.closed)return;const token=rpc.token;rpc.close();rpc=new SessionRpc({token,contextId:next.id,bindingName,handlers});await cdp.call('Runtime.addBinding',{name:bindingName,executionContextId:next.id});await waitForVue(next.id);const result=await cdp.call('Runtime.evaluate',{contextId:next.id,expression:yaml+'\n'+novel+'\n'+source.join('\n')+'\n'+bootstrap,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||'reinjection failed');await log({event:'reinjected',contextId:next.id});};
 await waitForApp();
 if(updater.pending){const outcome=await updater.pending.completion;await log({event:'update-completion',outcome});if(outcome.state!=='verified-compatible')console.error('官方更新结束，但增强适配尚未验证。请从官方入口打开 Craft 或运行适配安装器检查。');}
}catch(e){await log({event:'failed',error:e.message});console.error(e.message);process.exitCode=1;
 if(app.exitCode===null&&!spawnError){
  const message='WebVideo+ 接入失败：'+e.message+'。请保存工作并关闭此 Craft 窗口，再检查适配版本。关闭前本机会话调试端口仍存在。';
  const encoded=Buffer.from(message,'utf8').toString('base64');
  spawn('powershell.exe',['-NoProfile','-Command',`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')),'WebVideo+ Craft')`],{windowsHide:true,stdio:'ignore'});
  await waitForApp();
 }
}
finally{await shutdown();}

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {bootstrapCraft,buildBrowserPayload,joinBrowserScripts} from '../session/browser-payload.mjs';
import {nodes,makeDocument} from './ui-dom.mjs';
import {createAppUpdateStore} from './update-host-fixture.mjs';
const verifiedHostProfile={version:'1.0.0-beta.2',sha256:'3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d'};

test('script boundaries execute adjacent unterminated IIFEs and line comments',()=>{
 const c=vm.createContext({calls:[]});
 vm.runInContext(joinBrowserScripts(["(()=>{calls.push(1)})() // tail", "(()=>{calls.push(2)})()"]),c);
 assert.deepEqual(Array.from(c.calls),[1,2]);
});
for(const phase of ['initial injection','new document reinjection','readonly nonconfigurable invoke','frozen native API','partial Bridge-only initialization','conflicting readonly ambient parser']) test(phase+' executes exact full production payload, mounts UI and previews imports',async()=>{
 const {body,head,app,document}=makeDocument();
 const appUpdate=createAppUpdateStore();
 const pinia={_s:new Map([['app-update',appUpdate],['editor',{hasUnsavedDocuments:false}],['modal',{modalStack:new Map()}],['resource',{activeProgress:new Map(),games:[],engines:[],templates:[]}]])};
 app.__vue_app__={config:{globalProperties:{$pinia:pinia}}};
 const c=vm.createContext({document,console,URL,TextEncoder,TextDecoder,crypto:webcrypto,
   setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 c.window=c;c.self=c;c.__TAURI_INTERNALS__={invoke(...args){if(c.__nativeTestCallback)return c.__nativeTestCallback(...args);throw Error('No native mutation during assembly test');}};
 const nativeInvoke=c.__TAURI_INTERNALS__.invoke;
 if(phase==='readonly nonconfigurable invoke'){
  for(const key of ['invoke','ipc','postMessage','callbacks'])Object.defineProperty(c.__TAURI_INTERNALS__,key,{value:key==='invoke'?nativeInvoke:()=>{},writable:false,configurable:false});
  Object.defineProperty(c,'__TAURI_INTERNALS__',{value:c.__TAURI_INTERNALS__,writable:false,configurable:false});
 }
 if(phase==='frozen native API')Object.freeze(c.__TAURI_INTERNALS__);
 if(phase==='partial Bridge-only initialization')c.WebVideoCraftBridge={fromFailedPreviousAttempt:true};
 const ambientParser=Object.freeze({default(){throw Error('ambient parser must not be used');},SCRIPT_CONFIG:[]});
 if(phase==='conflicting readonly ambient parser')Object.defineProperty(c,'webgalParser',{value:ambientParser,writable:false,configurable:false});
 const descriptor=Object.getOwnPropertyDescriptor(c.__TAURI_INTERNALS__,'invoke');
 c.testBinding=()=>{throw Error('No RPC during assembly test');};
 const expression=await buildBrowserPayload(fileURLToPath(new URL('..',import.meta.url)),{token:'test-token',bindingName:'testBinding',verifiedHostProfile});
 const result=vm.runInContext(expression,c,{timeout:5000});
 assert.equal(result.ui,true);assert.ok(c.WebVideoCraftBridge);assert.ok(c.WebVideoCraftUpdates);
 assert.equal(result.officialUiGuard.safe,true);assert.equal(result.diagnostics.length,0);
 assert.ok(c.WebVideoCraftOwnUpdates);assert.equal(c.WebVideoCraftBridge.fromFailedPreviousAttempt,undefined);
 assert.ok(nodes(body).some(n=>n.dataset.webvideoCraft==='tools'));
 assert.equal(head.children.length,1);assert.match(head.children[0].textContent,/wvc-dock/);
 assert.ok(c.WebVideoCraftImports);assert.ok(c.WebVideoCraftMedia);assert.ok(c.WebVideoCraftBackups);
 assert.equal(typeof c.WebVideoCraftCommandPanel?.mount,'function');
 assert.equal(typeof c.WebVideoCraftNavigation?.describe,'function');
 assert.equal(typeof c.WebVideoCraftActualTime?.mount,'function');
 assert.equal(typeof c.WebVideoNavigation?.derive,'function');
 assert.equal(typeof c.WebVideoFilterLibrary?.match,'function');
 assert.equal(typeof c.WebVideoCraftExportDialog?.mount,'function');
 assert.equal(typeof c.WebVideoCraftMusicUI?.mount,'function');
 assert.equal(typeof c.WebVideoCraftActualTime?.mount,'function');
 assert.match(head.children[0].textContent,/wvc-export-platforms/);
 assert.match(head.children[0].textContent,/wvc-music-timeline/);
 assert.deepEqual(Object.getOwnPropertyDescriptor(c.__TAURI_INTERNALS__,'invoke'),descriptor);
 assert.equal(c.__TAURI_INTERNALS__.invoke,nativeInvoke);
 const repeated=vm.runInContext(expression,c,{timeout:5000});
 assert.equal(repeated,result);assert.equal(head.children.length,1);
 assert.equal(nodes(body).filter(n=>n.dataset.webvideoCraft==='tools').length,1);
 await exercisePayloadFunctions(c);
 await exerciseOwnOpenWithLazyTasks(c,pinia);
 await exerciseNativeDownloadRoute(c,pinia);
 if(phase==='conflicting readonly ambient parser')assert.equal(c.webgalParser,ambientParser);
 else assert.equal(c.webgalParser,undefined,'bundled parser stays private inside payload');
});

async function exerciseNativeDownloadRoute(c,pinia){
 const calls=[],alerts=[];let confirmations=0;
 c.__nativeTestCallback=async(command,args)=>{
  calls.push(command);
  if(command==='plugin:updater|check')return{rid:71,version:'1.0.1',currentVersion:'1.0.0-beta.2',rawJson:{version:'1.0.1'}};
  if(command==='plugin:resources|close')return;
  throw Error('Unexpected native operation in full-payload cancel fixture: '+command);
 };
 c.alert=message=>alerts.push(message);c.WebVideoCraftConfirmOfficialUpdate=async()=>{confirmations++;return false;};
 c.testBinding=()=>{throw Error('Cancelled native route must never reach backend preparation');};
 const store=pinia._s.get('app-update');
 for(let attempt=0;attempt<2;attempt++){
  store.setAvailableUpdate({version:'1.0.1',currentVersion:'1.0.0-beta.2'});
  store.setUpdating();store.setDownloaded();
  assert.equal(store.isDownloaded,false,'native private installer remains unreachable');
  for(let i=0;i<20;i++)await Promise.resolve();
  assert.equal(confirmations,attempt+1,'native download completion offers confirmation directly');
  assert.equal(c.WebVideoCraftUpdates.state().busy,false);
 }
 assert.equal(calls.filter(x=>x==='plugin:updater|check').length,2);
 assert.equal(calls.filter(x=>x==='plugin:resources|close').length,2);
 assert.equal(alerts.length,0,'normal cancellation is not a native failure');
 assert(!pinia._s.has('runtime-task'),'route never invents a universal idle store');
 assert.equal(c.document.querySelector('#app').inert,undefined);
}

async function exerciseOwnOpenWithLazyTasks(c,pinia){
 const calls=[];
 c.testBinding=encoded=>{
  const request=JSON.parse(encoded);calls.push(request.method);
  const value=request.method==='ownUpdate.check'?{version:'1.1.10.0c',currentVersion:'1.1.9.0c'}:request.method==='ownUpdate.download'?{verified:true,version:'1.1.10.0c'}:request.method==='ownUpdate.install'?{opened:true,installed:false}:null;
  assert.notEqual(value,null,'only explicit own-updater calls occur');c.__WebVideoCraftReply({id:request.id,ok:true,value});
 };
 const own=c.WebVideoCraftOwnUpdates;assert(!pinia._s.has('runtime-task'));
 await own.check();await own.download();
 pinia._s.get('modal').modalStack.set('ExportDialog',{isOpen:true});
 await assert.rejects(own.install(),/等待/);assert(!calls.includes('ownUpdate.install'));
 pinia._s.get('modal').modalStack.clear();
 pinia._s.get('editor').hasUnsavedDocuments=true;await assert.rejects(own.install(),/保存/);
 pinia._s.get('editor').hasUnsavedDocuments=false;
 assert.equal((await own.install()).installed,false);assert.equal(calls.filter(name=>name==='ownUpdate.install').length,1);
 assert(!pinia._s.has('runtime-task'),'real lazy host state was not fabricated');
 await assert.rejects(own.install(),/已经打开/);assert.equal(calls.filter(name=>name==='ownUpdate.install').length,1);
}

async function exercisePayloadFunctions(c){
 const original='; 原注释\r\nchangeFigure:alice.png -id=alice -left;\r\n旁白:保留原文;\r\n';
 let snapshot={projectId:'payload-test',projectPath:'C:/payload-test',path:'C:/payload-test/game/scene/start.txt',source:original,revision:'r1',runtimeCapabilities:{multilineStatements:true,changeFigureDiff:true,sceneSemantics:true}},commits=[],calls=[];
 const S=c.WebVideoCraftScript,model=S.parse(original,{path:snapshot.path,capabilities:snapshot.runtimeCapabilities});
 assert(model.statements.some(row=>row.command==='changeFigure'));
 const next=c.WebVideoCraftFeatures.batchNext(snapshot,{commands:['changeFigure','say']});
 assert(next.after.startsWith('; 原注释\r\n'));assert.match(next.after,/-next;/);
 assert.equal(snapshot.source,original,'authoring creates a preview, not an edit');
 const reparsed=S.parse(next.after,{capabilities:snapshot.runtimeCapabilities});
 assert(reparsed.statements.filter(row=>row.command!=='comment').every(row=>row.args.next===true));
 assert(c.WebVideoCraftFeatures.navigation(snapshot).length>0);
 const descriptions=c.WebVideoCraftNavigation.describe(model);assert.equal(descriptions.size,model.statements.length);
 assert.equal(typeof c.WebVideoCraftNovel.prepare,'function');assert.equal(c.WebVideoCraftNovel.plan,undefined,'Terre-only planner is not part of Craft facade');
 const novelText='离线预演保留原文。',prepared=c.WebVideoCraftNovel.prepare(novelText,{nameToId:{}});
 const bridge={snapshot:async()=>({...snapshot}),commit:async request=>{assert.equal(request.snapshot.source,snapshot.source);commits.push(request);snapshot={...snapshot,source:request.after,revision:'r'+(commits.length+1)};return {changed:true};},service:async(endpoint,data)=>{
  calls.push(endpoint);
  if(endpoint==='/api/character-map')return {nameToId:{alice:'alice'}};
  if(endpoint==='/api/ai/config')return {selected:'inert',profiles:{inert:{hasKey:true,model:'inert-fixture'}}};
  if(endpoint==='/api/ai/novel/start')return {id:'inert-novel'};
  if(endpoint==='/api/ai/novel/status')return {state:'complete',result:{segments:[{from:0,to:prepared.units.length-1,kind:'narration',speaker:'',uncertain:false,sceneBreak:false}],staging:{maxActors:1,assets:{actors:[],backgrounds:[]},changes:[{at:0,background:null,cast:[]}]}}};
  if(endpoint==='/api/ai/novel/cancel')return {ok:true};
  throw Error('unexpected service '+endpoint);
 }};
 // Use production defaults: no parser, YAML, novel or authoring substitutions.
 const imports=c.WebVideoCraftImports.create({bridge,sleep:async()=>{}});
 const json=await imports.previewAnogo('[{"背景":"bg/test.png"},{"角色":"Alice","对话":"你好;世界"},{"旁白":"下一行"}]');
 assert.equal(json.statementCount,3);assert.equal(commits.length,0);assert.equal(snapshot.source,original);
 await imports.apply();assert.equal(commits.length,1);assert(snapshot.source.startsWith(original));assert.match(snapshot.source,/Alice:你好\\;世界 -id -figureId=alice;/);
 S.parse(snapshot.source,{capabilities:snapshot.runtimeCapabilities});
 const yaml=await imports.previewAnogo('- 旁白: YAML安全解析\n');assert.match(yaml.text,/YAML安全解析/);
 await imports.cancel();await assert.rejects(imports.apply(),/预览/);assert.equal(commits.length,1);
 const novel=await imports.generateNovel(novelText,{confirmed:true});assert.match(novel.text,/离线预演保留原文/);assert.equal(commits.length,1);
 await imports.apply();assert.equal(commits.length,2);assert(snapshot.source.startsWith(original));
 await imports.previewAnogo('[{"旁白":"不能覆盖新编辑"}]');snapshot={...snapshot,source:snapshot.source+'; 用户新编辑\r\n',revision:'new'};
 await assert.rejects(imports.apply(),/变化/);assert.equal(commits.length,2);
 assert(calls.includes('/api/ai/novel/status'));await imports.dispose();
}

for(const component of ['official factory','own factory','official guard'])test(component+' failure cannot prevent editor UI mount',async()=>{
 const {document,app}=makeDocument();app.__vue_app__={config:{globalProperties:{$pinia:{_s:new Map()}}}};
 const boom=()=>{throw Error('synthetic '+component+' failure');};
 const guarded={status:()=>({guarded:true,safe:true,state:'guarded'})};let mounted=0,receivedGuard;
 const native=Object.freeze({invoke(){throw Error('must not invoke during mount');}});
 const context={document,console,__TAURI_INTERNALS__:native,setTimeout:()=>1,clearTimeout(){},
  WebVideoCraftCreateBridge:()=>({capabilities:()=>({commit:true})}),
  WebVideoCraftInstallOfficialGuard:component==='official guard'?boom:()=>guarded,
  WebVideoCraftCreateUpdates:component==='official factory'?boom:options=>{receivedGuard=options.officialGuard;return{installOfficialHook(){assert.equal(options.officialGuard,guarded);}};},
  WebVideoCraftCreateOwnUpdates:component==='own factory'?boom:()=>({available:true}),
  WebVideoCraftUI:{mount(){mounted++;}},WebVideoNovel:{}};
 context.window=context;
 const c=vm.createContext(context),result=vm.runInContext(`(${bootstrapCraft.toString()})({token:'test',bindingName:'testBinding'})`,c);
 assert.equal(result.mounted,true);assert.equal(result.ui,true);assert.equal(mounted,1);
 assert(result.diagnostics.some(item=>item.message.includes(component)));
 assert.equal(document.querySelector('[data-webvideo-craft="update-warning"]')?.textContent,'WebVideo+ 更新保护需检查');
 if(component!=='official guard')assert.equal(result.officialUiGuard.safe,true,'guard survives optional factory failure');
 if(component==='own factory')assert.equal(receivedGuard,guarded);
 const updater=component==='own factory'?c.WebVideoCraftOwnUpdates:c.WebVideoCraftUpdates;
 assert.equal((await updater.status()).enabled,false);
 await assert.rejects(updater.install(),/失败|未就绪/);
 assert.equal(c.__TAURI_INTERNALS__,native);
});

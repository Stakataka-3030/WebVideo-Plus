/* Full assembled browser payload → production UI/controller/bridge → kernel transport.
 * Only the native host, preview RPC and HTTP response are inert fixtures. No render.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {buildBrowserPayload} from '../session/browser-payload.mjs';
import {KernelSession} from '../session/kernel.mjs';
import {makeDocument,nodes} from './ui-dom.mjs';
import {createAppUpdateStore} from './update-host-fixture.mjs';

export async function buildExportContractCases() {
 const {document,app}=makeDocument();
 app.__vue_app__={config:{globalProperties:{$pinia:{_s:new Map([['app-update',createAppUpdateStore()]])}}}};
 const context=vm.createContext({document,console,URL,TextEncoder,TextDecoder,crypto:webcrypto,AbortController,
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 context.window=context;context.self=context;
 context.__TAURI_INTERNALS__=Object.freeze({invoke(){throw Error('Unexpected native call from bootstrap');}});
 context.testBinding=()=>{throw Error('Unexpected bootstrap RPC');};
 const payload=await buildBrowserPayload(fileURLToPath(new URL('..',import.meta.url)),{token:'fixture',bindingName:'testBinding'});
 const mounted=vm.runInContext(payload,context,{timeout:5000});
 assert.equal(mounted.ui,true);assert.equal(mounted.diagnostics.length,0);
 const source='A:one;\r\nB:two;',scenePath='C:/Project/game/scene/start.txt';
 const stores={workspace:{currentGame:{id:'p',path:'C:/Project'}},tabs:{activeTab:{path:scenePath}},file:{},
  previewSession:{currentGameServeUrl:'http://127.0.0.1:1/preview'},
  editor:{hasUnsavedDocuments:false,getTextProjectionState:()=>({kind:'scene',textContent:source,isDirty:false}),
   peekSceneRevision:()=> 'r1',collectDocumentPathsUnder:()=>[scenePath]}};
 const cases=[],nativeCalls=[];let currentName='';
 const kernel=new KernelSession({root:'/unused',kernel:'/unused',storage:{get:()=>({id:'owned-project',runtimeId:'open-webgal.webgal',engineVersion:'4.6.5'})}});
 kernel.discovery={baseUrl:'http://127.0.0.1:1',token:'fixture'};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/api/config'))return{ok:true,json:async()=>({settings:{}})};
  assert.equal(url,'http://127.0.0.1:1/api/jobs');assert.equal(options.method,'POST');
  const body=JSON.parse(options.body);
  assert.equal(body.project,'owned-project');assert.equal(body.settings.engine,'webgal');
  assert.equal(body.expectedRuntimeId,'open-webgal.webgal');assert.equal(body.expectedRuntimeVersion,'4.6.5');
  assert.equal(body.expectedWebgalVersion,'4.6.5');assert.equal(body.snapshot,undefined);
  cases.push({name:currentName,accepted:true,body});return{ok:true,json:async()=>({id:'job'+cases.length})};
 };
 const bridge=context.WebVideoCraftCreateBridge({getStores:()=>stores,
  registry:async()=>({enginePath:'C:/engine',templatePath:'C:/template',runtimeVersion:'4.6.5',runtimeId:'open-webgal.webgal'}),
  invoke:async(name,args)=>{assert.equal(name,'export_web');nativeCalls.push(args);},
  rpc:async(method,params)=>{
   if(method==='snapshot.allocate')return{snapshotId:'owned',site:'C:/snapshot'};
   if(method==='snapshot.ready')return{snapshotId:'owned'};
   if(method==='preview.settings')return{textSpeed:50,autoSpeed:50};
   if(method==='service.request')return kernel.request(params);
   if(method==='export.start')return kernel.request({endpoint:'/api/jobs',snapshotId:params.snapshotId,data:params.options});
   throw Error('Unexpected fixture RPC: '+method);
  }});
 async function ui(name,configure=async()=>{}) {
  currentName=name;const container=document.createElement('div');document.body.append(container);
  const controller=context.WebVideoCraftMedia.createController(bridge);let running=Promise.resolve();
  const panel=context.WebVideoCraftMediaUI.mount(container,{bridge,controller,run:fn=>(running=fn()),notify(){},getSnapshot:()=>null,getSelection:()=>[]});
  const field=label=>{const node=nodes(container).find(n=>n.getAttribute('aria-label')===label);assert.ok(node,label);return node;};
  const change=async(label,value)=>{const node=field(label);if(node.type==='checkbox')node.checked=value;else node.value=value;await node.emit('change');};
  const click=async label=>{const button=nodes(container).find(n=>n.tagName==='BUTTON'&&n.textContent===label);assert.ok(button,label);assert.equal(button.disabled,false,label);await button.click();await running;};
  try{await configure({field,change,click});const count=cases.length;await click('加入导出队列');assert.equal(cases.length,count+1,name);}
  finally{panel.dispose();container.remove();}
 }
 try {
  await ui('default-full');
  await ui('minimal-full',async f=>{await f.change('分辨率','1280x720');await f.change('故事范围','sceneOnly');f.field('并行数（1–32）').value='1';});
  await ui('selection',async f=>{await f.change('故事范围','selection');await f.click('读取当前场景');await f.click('全选语句');await f.click('锁定导出片段');});
  for(const kind of ['stage','dialog','audio'])await ui(kind,async f=>f.change('导出内容',kind));
  for(const kind of ['stage','dialog'])await ui(kind+'-webm',async f=>{await f.change('导出内容',kind);if(kind==='stage')await f.change('包含背景',false);await f.change('透明视频格式','webm');});
  for(const size of ['1280x720','1920x1080','2560x1440','3840x2160'])for(const fps of ['30','60'])for(const quality of ['recommended','quality','lossless','traditional']){
   await ui(size+'-'+fps+'-'+quality,async f=>{await f.change('分辨率',size);await f.change('帧率',fps);await f.change('导出质量',quality);});
  }
  assert.equal(nativeCalls.length,40);
  const minimal=cases.find(item=>item.name==='minimal-full').body;
  for(const [name,settings,error] of [
   ['native-probe-640x360-at-12fps',{width:640,height:360,fps:12},'分辨率或帧率无效'],
   ['native-probe-1280x720-at-24fps',{width:1280,height:720,fps:24},'分辨率或帧率无效'],
   ['unsupported-gpu',{gpu:'cpu'},'导出模式、GPU 或编码管线选项无效'],
   ['unsupported-codec-mode',{gpuRawMode:'cpu'},'导出模式、GPU 或编码管线选项无效'],
   ['zero-workers',{workers:0},'并行数需要填写 1–32 的整数'],
   ['fractional-workers',{workers:1.5},'并行数需要填写 1–32 的整数'],
  ])cases.push({name,accepted:false,error,body:{...minimal,settings:{...minimal.settings,...settings}}});
  cases.push({name:'placeholder-source-hash',accepted:false,error:'选区对应的剧本已经变化，请重新选择',body:{...minimal,range:{startLine:1,endLine:2,sourceHash:'hash'}}});
  cases.push({name:'wrong-full-extension',accepted:false,error:'输出文件名无效，需要以 .mp4 结尾',body:{...minimal,fileName:'video.webm'}});
  return cases;
 }finally{globalThis.fetch=originalFetch;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2])throw Error('An output JSON path is required');
 await writeFile(process.argv[2],JSON.stringify(await buildExportContractCases(),null,2));
}

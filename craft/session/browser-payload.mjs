import fs from 'node:fs/promises';
import path from 'node:path';

// Each classic-script unit is isolated from ASI hazards, including third-party UMD.
export function joinBrowserScripts(parts) {
 return parts.map(part => '\n;\n' + part + '\n;\n').join('');
}

// Serialized into the owned WebView. Native Tauri internals are read-only in
// the pinned host; this function only reads them. Optional updater setup must
// never decide whether editor/preview/export tools can mount.
export function bootstrapCraft({token,bindingName,verifiedHostProfile},dependencies={}) {
 const root=window;
 if(root.WebVideoCraftBootstrap?.mounted)return root.WebVideoCraftBootstrap;
 const diagnostics=[],pending=new Map();let id=0;
 root.__WebVideoCraftReply=r=>{
  const p=pending.get(r.id);if(!p)return;
  clearTimeout(p.timer);pending.delete(r.id);
  r.ok?p.resolve(r.value):p.reject(Error(r.error));
 };
 const request=(method,params)=>new Promise((resolve,reject)=>{
  const key=String(++id),timer=setTimeout(()=>{pending.delete(key);reject(Error('操作等待超时'));},180000);
  pending.set(key,{resolve,reject,timer});
  try{root[bindingName](JSON.stringify({id:key,token,method,params}));}
  catch(error){clearTimeout(timer);pending.delete(key);reject(error);}
 });
 const getStores=()=>{
  const p=document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
  if(!p?._s)throw Error('发行版宿主桥不可用');
  return Object.fromEntries(['editor','tabs','file','workspace','runtime-task','preview-session','preview-sync','app-update','modal'].map(k=>[k.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),p._s.get(k)||p._s.get(k.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))]));
 };
 const invoke=(cmd,args,options)=>root.__TAURI_INTERNALS__.invoke(cmd,args,options);
 root.WebVideoCraftBridge=root.WebVideoCraftCreateBridge({getStores,invoke,rpc:request,registry:root.WebVideoCraftResolveProject});
 const unavailable=(label,error)=>{
  const message=label+'初始化失败：'+String(error?.message||error);
  diagnostics.push({component:label,message});
  const fail=async()=>{throw Error(message);};
  return {status:async()=>({enabled:false,message}),state:()=>({status:'unavailable',busy:false,error:message}),check:fail,download:fail,install:fail,reveal:fail};
 };
 let officialGuard;
 try{officialGuard=root.WebVideoCraftInstallOfficialGuard({getStores});}
 catch(error){diagnostics.push({component:'Craft 官方安装保护',message:String(error?.message||error)});}
 try{
  if(!officialGuard)throw Error('官方安装保护未就绪，请保存并重新打开 Craft');
  root.WebVideoCraftUpdates=root.WebVideoCraftCreateUpdates({invoke,internals:root.__TAURI_INTERNALS__,rpc:request,getStores,officialGuard,readLocalState:()=>root.WebVideoCraftReadUpdateState(document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia,verifiedHostProfile)});
  root.WebVideoCraftUpdates.installOfficialHook();
 }catch(error){root.WebVideoCraftUpdates=unavailable('Craft 官方更新连接',error);}
 try{root.WebVideoCraftOwnUpdates=root.WebVideoCraftCreateOwnUpdates({rpc:request,getStores,readLocalState:()=>root.WebVideoCraftReadUpdateState(document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia,verifiedHostProfile)});}
 catch(error){root.WebVideoCraftOwnUpdates=unavailable('WebVideo+ 更新连接',error);}
 const novel=dependencies.novel;
 root.WebVideoCraftNovel=novel&&Object.freeze({prepare:novel.prepare,resolve:novel.resolve,validateStage:novel.validateStage});
 if(typeof root.WebVideoCraftUI?.mount!=='function')throw Error('Craft 增强界面未就绪');
 root.WebVideoCraftUI.mount(root.WebVideoCraftBridge);
 const result={mounted:true,stores:Object.keys(getStores()),capabilities:root.WebVideoCraftBridge.capabilities(),ui:true,officialUiGuard:officialGuard?.status(),diagnostics};
 if(diagnostics.length||result.officialUiGuard?.safe!==true){
  const warning=document.createElement('span');
  warning.className='wvc-mount-notice';warning.setAttribute('role','status');
  warning.setAttribute('data-webvideo-craft','update-warning');
  warning.textContent='WebVideo+ 更新保护需检查';
  warning.title=[...diagnostics.map(item=>item.message),result.officialUiGuard?.message].filter(Boolean).join('；');
  const header=document.querySelector('#app')?.querySelector('header');
  (header?.lastElementChild||header||document.body).appendChild(warning);
 }
 root.WebVideoCraftBootstrap=result;
 return result;
}

export async function buildBrowserPayload(here,{token,bindingName,verifiedHostProfile}) {
 const files=['host-bridge.js','project-registry.js','features/vendor/webgal-parser-4.6.5.js','features/script.js','features/navigation-description.js','features/id-completion.js','features/authoring.js','features/media.js','features/imports.js','features/review.js','features/backups.js','update/confirmation.js','update/client.js','update/host-state.js','update/own-client.js','ui/music-panel.js','ui/media-panel.js','ui/export-dialog.js','ui/command-panel.js','ui/actual-time.js','ui/main.js'];
 const source=[];
 for(const file of ['../vendor/js-yaml-4.1.1.min.js','../browser/novel-core.js','../browser/navigation-metadata.js','../browser/timeline-core.js','../browser/filter-library.js','../browser/navigation-model.js',...files]) source.push(await fs.readFile(path.join(here,file),'utf8'));
 const styles=(await Promise.all(['ui/styles.css','ui/export-dialog.css','ui/music-panel.css'].map(file=>fs.readFile(path.join(here,file),'utf8')))).join('\n');
 source.push(`(()=>{const s=document.createElement('style');s.dataset.webvideoCraft='styles';s.textContent=${JSON.stringify(styles)};document.head.appendChild(s);})();`);
 const bootstrap=`return (${bootstrapCraft.toString()})(${JSON.stringify({token,bindingName,verifiedHostProfile})},{novel:WebVideoNovel});`;
 return `(()=>{if(window.WebVideoCraftBootstrap?.mounted)return window.WebVideoCraftBootstrap;${joinBrowserScripts([...source,bootstrap])}})()`;
}

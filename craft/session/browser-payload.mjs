import fs from 'node:fs/promises';
import path from 'node:path';

// Each classic-script unit is isolated from ASI hazards, including third-party UMD.
export function joinBrowserScripts(parts) {
 return parts.map(part => '\n;\n' + part + '\n;\n').join('');
}

export async function buildBrowserPayload(here,{token,bindingName}) {
 const files=['host-bridge.js','project-registry.js','features/vendor/webgal-parser-4.6.5.js','features/script.js','features/id-completion.js','features/authoring.js','features/media.js','features/imports.js','features/review.js','features/backups.js','update/client.js','ui/media-panel.js','ui/main.js'];
 const source=[];
 for(const file of ['../vendor/js-yaml-4.1.1.min.js','../browser/novel-core.js',...files]) source.push(await fs.readFile(path.join(here,file),'utf8'));
 const styles=await fs.readFile(path.join(here,'ui/styles.css'),'utf8');
 source.push(`(()=>{const s=document.createElement('style');s.dataset.webvideoCraft='styles';s.textContent=${JSON.stringify(styles)};document.head.appendChild(s);})();`);
 const bootstrap=`(()=>{if(window.WebVideoCraftBridge)return;const pending=new Map();let id=0;const token=${JSON.stringify(token)};window.__WebVideoCraftReply=r=>{const p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.ok?p.resolve(r.value):p.reject(Error(r.error));};const request=(method,params)=>new Promise((resolve,reject)=>{const key=String(++id),timer=setTimeout(()=>{pending.delete(key);reject(Error('操作等待超时'));},180000);pending.set(key,{resolve,reject,timer});window[${JSON.stringify(bindingName)}](JSON.stringify({id:key,token,method,params}));});const getStores=()=>{const p=document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;if(!p?._s)throw Error('发行版宿主桥不可用');return Object.fromEntries(['editor','tabs','file','workspace','runtime-task','preview-session','preview-sync'].map(k=>[k.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),p._s.get(k)||p._s.get(k.replace(/-([a-z])/g,(_,x)=>x.toUpperCase()))]));};window.WebVideoCraftBridge=WebVideoCraftCreateBridge({getStores,invoke:(cmd,args)=>window.__TAURI_INTERNALS__.invoke(cmd,args),rpc:request,registry:WebVideoCraftResolveProject});window.WebVideoCraftUpdates=WebVideoCraftCreateUpdates({invoke:(cmd,args)=>window.__TAURI_INTERNALS__.invoke(cmd,args),internals:window.__TAURI_INTERNALS__,rpc:request,getStores});window.WebVideoCraftNovel=WebVideoNovel;window.WebVideoCraftUI?.mount(window.WebVideoCraftBridge);return {stores:Object.keys(getStores()),capabilities:WebVideoCraftBridge.capabilities(),ui:!!window.WebVideoCraftUI};})()`;
 return joinBrowserScripts([...source,bootstrap]);
}

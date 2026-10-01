// Fixed operations in an exact, currently selected preview frame; no caller code.
import fs from 'node:fs';import vm from 'node:vm';
const library=vm.runInNewContext(fs.readFileSync(new URL('../features/vendor/webgal-parser-4.6.5.js',import.meta.url),'utf8')+';webgalParser;');
export function capturePreviewConfigs(cdp){const requests=new Map(),loaded=new Map(),generations=new Map();let disposed=false;const parser=new library.default(undefined,x=>x,[],library.SCRIPT_CONFIG);
 const off=cdp.on(m=>{if(m.method==='Page.frameDetached'){loaded.delete(m.params.frameId);generations.set(m.params.frameId,(generations.get(m.params.frameId)||0)+1);}if(m.method==='Page.frameNavigated'){loaded.delete(m.params.frame.id);generations.set(m.params.frame.id,(generations.get(m.params.frame.id)||0)+1);for(const [id,r]of requests)if(r.frameId===m.params.frame.id)requests.delete(id);}
  if(m.method==='Network.responseReceived'){const p=m.params;if(p.response.url.split('?')[0].endsWith('/game/config.txt'))requests.set(p.requestId,{frameId:p.frameId,loaderId:p.loaderId,url:p.response.url,generation:generations.get(p.frameId)||0});}
  if(m.method==='Network.loadingFinished'&&requests.has(m.params.requestId)){const request=requests.get(m.params.requestId);requests.delete(m.params.requestId);void cdp.call('Network.getResponseBody',{requestId:m.params.requestId}).then(r=>{if(disposed||(generations.get(request.frameId)||0)!==request.generation)return;const text=r.base64Encoded?Buffer.from(r.body,'base64').toString('utf8'):r.body;if(text.length>1048576)return;const entries=parser.parseConfig(text),key=entries.find(x=>x.command==='Game_key')?.args?.[0];if(typeof key==='string'&&key)loaded.set(request.frameId,{...request,key});}).catch(()=>{});}});loaded.dispose=()=>{disposed=true;off();requests.clear();loaded.clear();};return loaded;}
async function runtimeSettings(expected) {
  const samePage=()=>location.origin===expected.origin&&location.pathname.replace(/\/$/,'')===expected.path;
  if(!samePage())throw Error('preview-changed');
  const element=document.getElementById('root');if(!element)throw Error('preview-not-ready');
  const queue=[element._reactRootContainer?._internalRoot?.current,...Object.keys(element).filter(k=>k.startsWith('__reactContainer$')||k.startsWith('__reactFiber$')).map(k=>element[k])].filter(Boolean),seen=new Set();let store;
  for(let i=0;i<queue.length&&i<3000;i++){const n=queue[i];if(!n||seen.has(n))continue;seen.add(n);for(const p of [n.memoizedProps,n.pendingProps])for(const s of [p?.store,p?.value?.store])if(s?.getState?.()?.userData?.optionData){store=s;break;}if(store)break;for(const x of [n.child,n.sibling,n.alternate,n.stateNode?.current])if(x&&!seen.has(x))queue.push(x);}
  if(!store)throw Error('实际预览设置尚未就绪');
  if(expected.startup){
    const raw=localStorage.getItem('lang'),language=store.getState().userData.optionData.language;
    if(document.querySelector('._langWrapper_1oupq_10'))throw Error('请先在当前工程预览中完成语言选择');
    if(typeof raw!=='string'||! /^[0-7]$/.test(raw)||!Number.isInteger(language)||Number(raw)!==language)throw Error('当前预览语言未完成初始化，请选择语言后重试');
    return {language,source:'preview'};
  }
  let persistence;
  if(expected.values){
    if(expected.previous){const actual=store.getState().userData.optionData;if(['textSpeed','autoSpeed'].some(k=>Number(actual[k])!==Number(expected.previous[k])))throw Error('预览速度已变化，请重新测量');}
    // Disk Game_key may differ from the already loaded game. Never use it to guess a DB key.
    const runtimeKey=()=>{const u=store.getState().userData;return u.gameConfigInit?.Game_key===u.globalGameVar?.Game_key?u.globalGameVar.Game_key:undefined;};
    const key=expected.loadedGameKey;persistence='session';const speeds={textSpeed:store.getState().userData.optionData.textSpeed,autoSpeed:store.getState().userData.optionData.autoSpeed};
    if(typeof key==='string'&&key&&runtimeKey()===key){
      const unchanged=()=>{if(!samePage()||runtimeKey()!==key||Object.keys(speeds).some(k=>store.getState().userData.optionData[k]!==speeds[k]))throw Error(persistence==='stored'?'设置已写入，但预览状态随后变化，请重新读取':'preview-changed');};
      const databases=await indexedDB.databases();unchanged();
      if(databases.some(x=>x.name==='localforage')){
        const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('localforage');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('禁止创建未知预览数据库'));};});
        try{unchanged();persistence=await new Promise((resolve,reject)=>{const tx=db.transaction('keyvaluepairs','readwrite'),objects=tx.objectStore('keyvaluepairs'),r=objects.get(key);let wrote=false;r.onsuccess=()=>{try{unchanged();if(!r.result?.optionData)return;objects.put({...r.result,optionData:{...r.result.optionData,...expected.values}},key);wrote=true;}catch{tx.abort();}};tx.oncomplete=()=>resolve(wrote?'stored':'session');tx.onabort=tx.onerror=()=>reject(Error('预览设置保存失败'));});}finally{db.close();}
      }unchanged();
    }
    if(!samePage())throw Error('preview-changed');
    for(const [key,value]of Object.entries(expected.values))store.dispatch({type:'userData/setOptionData',payload:{key,value}});
  }
  const o=store.getState().userData.optionData,result={textSpeed:Number(o.textSpeed),autoSpeed:Number(o.autoSpeed)};
  if(Object.values(result).some(v=>!Number.isFinite(v)||v< -500||v>100))throw Error('preview-setting-invalid');
  return persistence?{...result,persistence}:result;
}
export async function previewSettings(cdp,contexts,{url,values,expected:previous,startup=false},loadedKeys=new Map()) {
  const parsed=new URL(url);if(parsed.protocol!=='http:'||!['127.0.0.1','localhost'].includes(parsed.hostname))throw Error('preview-origin-denied');
  if(values&&(Object.keys(values).some(k=>!['textSpeed','autoSpeed'].includes(k))||Object.values(values).some(v=>!Number.isFinite(v)||v< -100||v>100)))throw Error('preview-setting-invalid');
  const tree=await cdp.call('Page.getFrameTree'),frames=[];const walk=n=>{frames.push(n.frame);for(const c of n.childFrames||[])walk(c);};walk(tree.frameTree);
  const matches=frames.filter(f=>{try{const u=new URL(f.url);return u.origin===parsed.origin&&u.pathname.replace(/\/$/,'')===parsed.pathname.replace(/\/$/,'');}catch{return false;}});
  if(matches.length!==1)throw Error('请先打开当前项目的内嵌预览；预览目标必须唯一');
  const context=[...contexts.values()].find(c=>c.auxData?.isDefault&&c.auxData.frameId===matches[0].id&&c.origin===parsed.origin);if(!context)throw Error('当前预览不支持设置桥');
  const loaded=loadedKeys.get(matches[0].id),expectedConfig=new URL('game/config.txt',parsed.origin+parsed.pathname.replace(/\/$/,'')+'/');
  const matchesConfig=loaded&&new URL(loaded.url).origin===expectedConfig.origin&&new URL(loaded.url).pathname===expectedConfig.pathname;
  const loadedGameKey=matchesConfig&&loaded.loaderId===matches[0].loaderId?loaded.key:undefined;
  const expression=`(${runtimeSettings.toString()})(${JSON.stringify({origin:parsed.origin,path:parsed.pathname.replace(/\/$/,''),values,previous,loadedGameKey,startup})})`;
  const result=await cdp.call('Runtime.evaluate',{contextId:context.id,expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||'preview-setting-failed');return result.result.value;
}

export class PreviewSessionManager {
  constructor(cdp,mainContexts,mainLoaded){Object.assign(this,{cdp,mainContexts,mainLoaded});this.attached=new Map();this.attaching=new Map();this.closed=false;
    this.disposeListener=cdp.on(m=>{if(m.method==='Target.detachedFromTarget'){for(const [id,s]of this.attached)if(s.sessionId===m.params.sessionId){s.off();s.loaded.dispose?.();this.attached.delete(id);}}});
  }
  async settings(request){
    return this.operation(request,previewSettings);
  }
  async operation(request,operation){
    try{return await operation(this.cdp,this.mainContexts,request,this.mainLoaded);}
    catch(e){if(!/预览目标必须唯一|不支持设置桥/.test(e.message))throw e;}
    const expected=new URL(request.url),same=value=>{try{const u=new URL(value);return u.origin===expected.origin&&u.pathname.replace(/\/$/,'')===expected.pathname.replace(/\/$/,'');}catch{return false;}};
    const info=await this.cdp.call('Target.getTargets');const matches=info.targetInfos.filter(t=>t.type==='iframe'&&same(t.url));
    if(matches.length!==1)throw Error('没有唯一且匹配当前工程的独立预览 frame');
    const target=matches[0];
    // A matching localhost URL alone is insufficient. Prove its frame owner is an iframe
    // in the launched Craft page, before attaching to an out-of-process target.
    const owner=await this.cdp.call('DOM.getFrameOwner',{frameId:target.targetId});
    const described=await this.cdp.call('DOM.describeNode',{backendNodeId:owner.backendNodeId});
    const node=described.node,attributes=Object.fromEntries(Array.from({length:(node.attributes?.length||0)/2},(_,i)=>[node.attributes[i*2],node.attributes[i*2+1]]));
    if(node.localName!=='iframe'||!same(attributes.src))throw Error('预览 frame 不属于当前 Craft 页面');
    let scoped=this.attached.get(target.targetId);
    if(!scoped){if(!this.attaching.has(target.targetId))this.attaching.set(target.targetId,(async()=>{const {sessionId}=await this.cdp.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});const contexts=new Map();
      const transport={call:(method,params)=>this.cdp.call(method,params,sessionId),on:fn=>this.cdp.on(m=>{if(m.sessionId===sessionId)fn(m);})};
      const off=transport.on(m=>{if(m.method==='Runtime.executionContextCreated')contexts.set(m.params.context.id,m.params.context);if(m.method==='Runtime.executionContextDestroyed')contexts.delete(m.params.executionContextId);if(m.method==='Runtime.executionContextsCleared')contexts.clear();});
      const loaded=capturePreviewConfigs(transport);try{await transport.call('Network.enable');await transport.call('Runtime.enable');await transport.call('Page.enable');}catch(e){off();loaded.dispose?.();await this.cdp.call('Target.detachFromTarget',{sessionId}).catch(()=>{});throw e;}
      const attached={sessionId,transport,contexts,loaded,off};if(this.closed){off();loaded.dispose?.();await this.cdp.call('Target.detachFromTarget',{sessionId}).catch(()=>{});throw Error('preview-session-closed');}this.attached.set(target.targetId,attached);return attached;})().finally(()=>this.attaching.delete(target.targetId)));scoped=await this.attaching.get(target.targetId);
    }
    // Context IDs are meaningful only within this flattened target session.
    return operation(scoped.transport,scoped.contexts,request,scoped.loaded);
  }
  async close(){this.closed=true;this.disposeListener();await Promise.allSettled([...this.attaching.values()]);this.mainLoaded.dispose?.();for(const s of this.attached.values()){s.off();s.loaded.dispose?.();await this.cdp.call('Target.detachFromTarget',{sessionId:s.sessionId}).catch(()=>{});}this.attached.clear();}
}

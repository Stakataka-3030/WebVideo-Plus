// Fixed, scoped timed-hint operation for the pinned WebGAL 4.6.5 preview.
// Host integration must cancel the active ticket before any other preview navigation.

export function hintPageOperation(expected) {
  const slot = '__WebVideoCraftTimedHintV1';
  const samePage = () => location.origin === expected.origin &&
    location.pathname.replace(/\/$/, '') === expected.path && location.search === expected.search;
  if (!samePage()) throw Error('preview-changed');
  const old = window[slot];
  const describe = record => ({state:record.state,ticket:record.ticket,clicked:record.clicked===true,
    duration:record.duration,elapsedMs:record.startedAt===null?0:Math.max(0,performance.now()-record.startedAt),
    ...(record.reason?{reason:record.reason}:{}),...(record.guardChanges?{guardChanges:record.guardChanges}:{})});
  if (expected.action === 'status') {
    return old?.version === 1 && old.ticket === expected.ticket ? describe(old) :
      {state:'cancelled',ticket:expected.ticket,clicked:false,reason:'navigation-ticket-changed'};
  }
  if (expected.action === 'cancel') {
    if (old?.version === 1 && old.ticket === expected.ticket) {
      old.stop('cancelled','cancelled-by-host'); return describe(old);
    }
    return {state:'not-current',ticket:expected.ticket,clicked:false};
  }
  if (old !== undefined && old?.version !== 1) throw Error('hint-operation-slot-conflict');
  old?.stop('cancelled','superseded-by-new-hint');
  const record = {version:1,ticket:expected.ticket,state:'waiting',clicked:false,duration:expected.duration,
    startedAt:null,createdAt:performance.now(),timer:null,observer:null,reason:null};
  window[slot] = record;
  const stop = (state,reason) => {
    if (record.timer !== null) clearTimeout(record.timer);
    record.timer = null; record.observer?.disconnect();record.observer = null;
    if (!['completed','cancelled','failed'].includes(record.state)) {
      record.state=state;record.reason=reason||null;
    }
  };
  record.stop=stop;
  // Redux may replace globalGameVar with an equal object during preview housekeeping.
  // Compare a captured, bounded semantic value instead of the container reference.
  // Tags retain undefined vs missing, array vs object and non-string primitive types.
  function variableState(value) {
    let count=0,characters=0;const seen=new Set();
    const text=value=>{characters+=value.length;if(characters>262144)throw Error('hint-game-state-too-large');return value;};
    function encode(v,depth){
      if(++count>10000||depth>32)throw Error('hint-game-state-too-large');
      if(v===null)return ['null'];
      if(v===undefined)return ['undefined'];
      if(typeof v==='string')return ['string',text(v)];
      if(typeof v==='boolean')return ['boolean',v];
      if(typeof v==='number'&&Number.isFinite(v))return ['number',Object.is(v,-0)?'-0':v];
      if(typeof v!=='object'||seen.has(v))throw Error('hint-game-state-unsupported');
      if(!Array.isArray(v)&&Object.prototype.toString.call(v)!=='[object Object]')throw Error('hint-game-state-unsupported');
      if(Array.isArray(v)&&v.length>10000)throw Error('hint-game-state-too-large');
      const keys=Object.keys(v);
      if(keys.length>10000)throw Error('hint-game-state-too-large');
      if(Object.getOwnPropertySymbols(v).length)throw Error('hint-game-state-unsupported');
      if(Array.isArray(v)&&(keys.length!==v.length||keys.some(k=>! /^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=v.length)))throw Error('hint-game-state-unsupported');
      seen.add(v);
      const result=Array.isArray(v)?['array',Array.from(v,x=>encode(x,depth+1))]:
        ['object',keys.sort().map(k=>[text(k),encode(v[k],depth+1)])];
      seen.delete(v);return result;
    }
    return JSON.stringify(encode(value,0));
  }
  function view() {
    const container=document.getElementById('chooseContainer');
    const main=container?.firstElementChild;
    if (!container?.isConnected || main?.children.length!==1) return null;
    const outer=main.firstElementChild;
    if (outer?.children.length!==1) return null;
    const item=outer.firstElementChild;
    if (!item?.isConnected || item.textContent.trim()!==expected.text ||
        item.getAttribute('aria-disabled')==='true' || item.hidden || !item.getClientRects().length) return null;
    const style=getComputedStyle(item);
    if (style.display==='none'||style.visibility==='hidden') return null;
    const reactProps=Object.keys(item).filter(k=>k.startsWith('__reactProps$')||k.startsWith('__reactEventHandlers$'));
    if (reactProps.length!==1) return null;
    const handler=item[reactProps[0]]?.onClick;
    if (typeof handler!=='function') return null;
    const starts=[container._reactRootContainer?._internalRoot?.current,
      ...Object.keys(container).filter(k=>k.startsWith('__reactContainer$')||k.startsWith('__reactFiber$')).map(k=>container[k])].filter(Boolean);
    const seen=new Set(),queue=starts;let store=null,choices=null;
    for(let i=0;i<queue.length&&i<3000;i++){
      const node=queue[i];if(!node||seen.has(node))continue;seen.add(node);
      const p=node.memoizedProps;
      if(p?.store?.getState?.()?.userData?.optionData) {if(store&&store!==p.store)return null;store=p.store;}
      if(Array.isArray(p?.chooseOptions)){if(choices&&choices!==p.chooseOptions)return null;choices=p.chooseOptions;}
      // Only the mounted tree, never alternate/pending props from a different render.
      for(const next of [node.child,node.sibling])if(next&&!seen.has(next))queue.push(next);
    }
    if (!store || choices?.length!==1) return null;
    const option=choices[0];
    if (option.text!==expected.text || option.jump!==expected.key || option.jumpToScene===true ||
        option.showCondition!==undefined || option.enableCondition!==undefined) return null;
    const state=store.getState();
    if(!state.GUI||!state.userData?.globalGameVar) return null;
    return {container,item,handler,store,choices,option,gui:state.GUI,game:state.userData.globalGameVar,gameState:variableState(state.userData.globalGameVar)};
  }
  let captured=null,mutated=false;
  const identities=['container','item','handler','store','choices','option','gui','gameState'];
  const changedKeys=(a,b)=>[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].filter(k=>a?.[k]!==b?.[k]);
  function changes(current){return {identities:current?identities.filter(k=>current[k]!==captured[k]):['view-unavailable'],
    mutated,guiFields:changedKeys(captured.gui,current?.gui),gameFields:changedKeys(captured.game,current?.game)};}
  const tick=()=>{
    try {
    record.timer=null;
    if(window[slot]!==record){stop('cancelled','navigation-ticket-changed');return;}
    if(!samePage()){stop('cancelled','preview-changed');return;}
    const current=view();
    if(!captured){
      if(!current){
        if(performance.now()-record.createdAt>=6000){stop('failed','无法唯一确认单行提示、保护标签与实际选项状态');return;}
        record.timer=setTimeout(tick,40);return;
      }
      captured=current;record.startedAt=performance.now();record.state='showing';
      record.observer=new MutationObserver(()=>{mutated=true;});
      record.observer.observe(captured.container,{childList:true,subtree:true,attributes:true,characterData:true});
    } else if(mutated||!current||identities.some(k=>current[k]!==captured[k])) {
      record.guardChanges=changes(current);stop('cancelled','提示或游戏状态已变化，未自动选择');return;
    }
    const remaining=expected.duration-(performance.now()-record.startedAt);
    if(remaining>0){record.timer=setTimeout(tick,Math.min(40,remaining));return;}
    // Re-check immediately before the single native click. No await lies between check and click.
    const last=view();
    if(mutated||window[slot]!==record||!samePage()||!last||identities.some(k=>last[k]!==captured[k])){
      record.guardChanges=changes(last);stop('cancelled','提示在结束前变化，未自动选择');return;
    }
    record.observer?.disconnect();record.observer=null;
    record.clicked=true;captured.item.click();record.state='completed';
    } catch(error) { stop('failed',error.message||String(error)); }
  };
  tick();
  return describe(record);
}

function validate(request) {
  const parsed=new URL(request.url);
  if(parsed.protocol!=='http:'||!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.username||parsed.password)
    throw Error('preview-origin-denied');
  const ticket=String(request.ticket??'');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(ticket))throw Error('hint-ticket-invalid');
  if(!request.cancel){
    if(typeof request.text!=='string'||!request.text.trim()||request.text.length>4096||/[\r\n]/.test(request.text))throw Error('hint-text-invalid');
    if(!/^__wvp_hint_[A-Za-z0-9_]+$/.test(request.key||''))throw Error('hint-target-key-required');
    if(!Number.isFinite(request.duration)||request.duration<100||request.duration>60000)throw Error('hint-duration-invalid');
  }
  return {origin:parsed.origin,path:parsed.pathname.replace(/\/$/,''),search:parsed.search,
    text:request.text?.trim(),key:request.key,duration:request.duration,ticket};
}

export async function runHint(cdp,contexts,request) {
  const expected=validate(request),tree=await cdp.call('Page.getFrameTree'),frames=[];
  const walk=node=>{frames.push(node.frame);for(const child of node.childFrames||[])walk(child);};walk(tree.frameTree);
  const matches=frames.filter(frame=>{try{const u=new URL(frame.url);return u.origin===expected.origin&&u.pathname.replace(/\/$/,'')===expected.path&&u.search===expected.search;}catch{return false;}});
  // Keep these exact settings-bridge errors so PreviewSessionManager can route OOPIFs.
  if(matches.length!==1)throw Error('请先打开当前项目的内嵌预览；预览目标必须唯一');
  const found=[...contexts.values()].filter(c=>c.auxData?.isDefault&&c.auxData.frameId===matches[0].id&&c.origin===expected.origin);
  if(found.length!==1)throw Error('当前预览不支持设置桥');
  const contextId=found[0].id;
  async function operation(action){
    const result=await cdp.call('Runtime.evaluate',{contextId,
      expression:`(${hintPageOperation.toString()})(${JSON.stringify({...expected,action})})`,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||'hint-preview-failed');
    const value=result.result?.value;if(!value||value.ticket!==expected.ticket)throw Error('hint-result-invalid');return value;
  }
  if(request.cancel)return operation('cancel');
  let result=await operation('start');
  const until=Date.now()+expected.duration+9000;
  try{
    while(['waiting','showing'].includes(result.state)){
      if(Date.now()>until)throw Error('单行提示预览超时');
      await new Promise(resolve=>setTimeout(resolve,80));
      result=await operation('status');
    }
    if(result.state==='failed')throw Error(result.reason||'hint-preview-failed');
    return result;
  }catch(error){await operation('cancel').catch(()=>{});throw error;}
}

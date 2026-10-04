(function(root){'use strict';
 // Craft beta.2's controller calls its module-private service directly. Pinia's
 // supported subscriptions can hold install-ready state and route completed
 // native downloads. Never assign to frozen/non-writable Tauri internals.
 // Detached Pinia subscriptions outlive a failed optional UI mount. Retain our
 // own document registry when the assembled payload is evaluated again.
 const registryKey='__WebVideoCraftOfficialGuardRegistry';
 if(!Object.prototype.hasOwnProperty.call(root,registryKey))Object.defineProperty(root,registryKey,{value:Object.freeze({version:1,guards:new WeakMap()}),writable:false,configurable:false});
 const registryDescriptor=Object.getOwnPropertyDescriptor(root,registryKey),registry=registryDescriptor?.value;
 const guards=registryDescriptor?.writable===false&&registryDescriptor?.configurable===false&&Object.isFrozen(registry)&&registry?.version===1&&Object.prototype.toString.call(registry.guards)==='[object WeakMap]'?registry.guards:null;
 const guidance='Craft 官方检查和签名下载仍可用；下载完成后由 WebVideo+ 验证并协调安装，确认后正常关闭 Craft，以干净环境启动官方安装器';
 root.WebVideoCraftInstallOfficialGuard=function({getStores}){
  if(!guards)throw Error('官方更新保护注册表无效，请重新打开 Craft');
  const store=getStores().appUpdate;
  if(!store||store.$id!=='app-update'||typeof store.$onAction!=='function'||typeof store.$subscribe!=='function'||typeof store.setError!=='function'||typeof store.setDownloaded!=='function')throw Error('Craft 官方更新状态保护不可用；请勿在增强会话中安装官方更新');
  if(guards.has(store))return guards.get(store);
  const risky=()=>['downloaded','installed','restarting'].includes(store.status)||store.isDownloaded===true||store.isInstalled===true||store.isRestarting===true;
  const ambiguous=risky();let normalizing=false,probing=false,subscribed=false,installRoute,routeBusy=()=>false,queued=false;
  const current=()=>{try{return getStores().appUpdate===store;}catch{return false;}};
  const blocked=()=>{const error=Error(guidance);error.code='WEBVIDEO_OFFICIAL_INSTALL_GUARDED';return error;};
  const normalize=()=>{
   if(normalizing||!risky())return;
   normalizing=true;try{
    if(installRoute&&!ambiguous&&current()&&store.availableUpdate&&typeof store.setAvailableUpdate==='function')store.setAvailableUpdate({...store.availableUpdate});
    else store.setError('update-failed',guidance,store.availableUpdate?'available':'idle');
   }
   finally{normalizing=false;}
   if(risky())throw Error('无法解除官方更新的待安装状态；请关闭并重新打开 Craft');
  };
  const stopAction=store.$onAction(({name,after})=>{
   if(name==='setDownloaded'&&!probing&&installRoute&&!ambiguous&&current()&&store.status==='updating'){
    const info=store.availableUpdate;
    if(typeof info?.version!=='string'||typeof info?.currentVersion!=='string'||typeof after!=='function')throw blocked();
    const captured={version:info.version,currentVersion:info.currentVersion};
    after(()=>{
     normalize();if(risky())throw blocked();if(queued)return;queued=true;
     // Native controller finishes its normal downloaded toast before routing.
     Promise.resolve().then(()=>{
      if(!current()||store.availableUpdate?.version!==captured.version||store.availableUpdate?.currentVersion!==captured.currentVersion)throw Error('官方更新版本或页面已变化，请重新检查');
      return installRoute(captured);
     }).catch(error=>{
      if(error.cancelled)return;
      if(current())store.setError('update-failed',error.message,store.availableUpdate?'available':'idle');
      root.alert?.((error.indeterminate||error.installationStarted?'Craft 官方更新状态待确认：':'Craft 官方更新尚未开始：')+error.message);
     }).finally(()=>{queued=false;});
    });
    return;
   }
   if(['setDownloaded','setInstalled','setRestarting'].includes(name)){
    if(!probing)root.alert?.(guidance);throw blocked();
   }
  },true);
  let stopState;
  try{
   if(typeof stopAction!=='function')throw Error('官方更新操作订阅未就绪');
   // Verify the supported pre-action subscription really runs before the setter.
   // This also covers action references captured by a controller before injection.
   probing=true;let refused=false;
   try{store.setDownloaded();}catch(error){if(error.code==='WEBVIDEO_OFFICIAL_INSTALL_GUARDED')refused=true;else throw error;}
   finally{probing=false;}
   if(!refused)throw Error('官方更新状态转换未受到保护');
   stopState=store.$subscribe(normalize,{detached:true,flush:'sync'});
   if(typeof stopState!=='function')throw Error('官方更新状态订阅未就绪');
   normalize();subscribed=true;
  }catch(error){try{normalize();}catch{}if(typeof stopState==='function')stopState();if(typeof stopAction==='function')stopAction();throw error;}
  const handle=Object.freeze({registerInstallRoute(route,isBusy=()=>false){
   if(typeof route!=='function'||typeof isBusy!=='function'||typeof store.setAvailableUpdate!=='function')throw Error('官方更新协调回调不可用');
   if(installRoute!==route&&(queued||routeBusy()))throw Error('官方更新协调已在进行，请等待当前交接');
   installRoute=route;routeBusy=isBusy;
  },status(){
   const active=current(),safe=subscribed&&active&&!ambiguous;
   return {guarded:subscribed&&active,safe,state:!active?'store-unavailable':ambiguous?'guarded-ambiguous-start':'guarded',mode:'pinned-beta2-state-transition',routed:!!installRoute,routePending:queued,nativeInvokeMutated:false,message:ambiguous?'接入时官方更新已经处于待安装或重启状态，无法排除先前已开始的安装；请保存并关闭 Craft 后重新打开，再检查恢复状态。'+guidance:guidance};
  }});
  guards.set(store,handle);return handle;
 };
 // The invocation facade belongs only to this adapter. Official native UI keeps
 // its own check/download/signature path and is guarded at its pinned store seam.
 root.WebVideoCraftCreateUpdates=function({invoke,internals,rpc,getStores,officialGuard,readLocalState,confirmInstall,onState=()=>{}}){
  const nativeInvoke=internals?.invoke?internals.invoke.bind(internals):invoke;
  const updates=new Map(),downloads=new Map();let update,bytesRid,busy=false,status='idle',closingHost=false;
  const publish=(next,details={})=>{status=next;onState({status,version:update?.version,...details});};
  const blockers=()=>{
   let state;if(readLocalState!==undefined){if(typeof readLocalState!=='function')throw Error('官方更新本机状态连接无效');state=readLocalState();if(state?.coverage!=='known-work-only')throw Error('官方更新本机状态范围无法确认');}
   else{const s=getStores();state={hasUnsavedDocuments:s.editor?.hasUnsavedDocuments,hasBlockingTasks:s.runtimeTask?.hasBlockingTasks};}
   if(typeof state?.hasUnsavedDocuments!=='boolean'||typeof state?.hasBlockingTasks!=='boolean')throw Error('宿主更新任务状态尚未初始化，不能确认安装安全');return state.hasUnsavedDocuments||state.hasBlockingTasks;
  };
  const idle=()=>{if(busy)throw Error('更新操作进行中');};
  async function observed(command,args={},options){
   const result=await nativeInvoke(command,args,options);
   if(command==='plugin:updater|check'&&result)updates.set(result.rid,{version:result.version,currentVersion:result.currentVersion,metadata:result.rawJson});
   if(command==='plugin:updater|download')downloads.set(result,args.rid);
   if(command==='plugin:resources|close'){updates.delete(args.rid);downloads.delete(args.rid);}
   return result;
  }
  const guardStatus=()=>officialGuard?.status?.()||{guarded:false,safe:false,state:'not-installed',message:'官方更新状态保护未初始化'};
  async function closeUpdateDisplays(){
   const modal=getStores().modal;
   if(!modal)return;
   if(Object.prototype.toString.call(modal.modalStack)!=='[object Map]'||typeof modal.close!=='function')throw Error('官方更新详情状态不可用');
   const displays=['AboutModal','UpdateDetailsModal'];
   if(!displays.some(key=>modal.modalStack.has(key)))return;
   for(const key of displays)if(modal.modalStack.has(key))modal.close(key);
   const until=Date.now()+1000;
   while(displays.some(key=>modal.modalStack.has(key))){
    if(getStores().modal!==modal||Date.now()>=until)throw Error('请关闭官方更新详情后重试');
    await new Promise(resolve=>root.setTimeout(resolve,25));
   }
  }
  async function coordinate(known,assertSelected=()=>{}){
   if(guardStatus().safe!==true)throw Error(guardStatus().message);
   assertSelected();
   const requestConfirmation=confirmInstall??root.WebVideoCraftConfirmOfficialUpdate;
   if(typeof requestConfirmation!=='function')throw Error('官方更新需要确认后才能正常关闭 Craft');
   const document=root.document,appAtConfirmation=document?.querySelector('#app'),storesAtConfirmation=getStores(),clientAtConfirmation=root.WebVideoCraftUpdates,bridgeAtConfirmation=root.WebVideoCraftBridge;
   const vueAtConfirmation=appAtConfirmation?.__vue_app__,piniaAtConfirmation=vueAtConfirmation?.config?.globalProperties?.$pinia;
   const projectAtConfirmation=storesAtConfirmation.workspace?.currentGame,projectIdentity=projectAtConfirmation?{id:projectAtConfirmation.id,path:projectAtConfirmation.path}:null;
   let confirmationExpired=false;
   const expireConfirmation=()=>{confirmationExpired=true;};
   const assertContext=()=>{
    const current=getStores(),project=current.workspace?.currentGame;
    if(confirmationExpired||root.document!==document||document?.querySelector('#app')!==appAtConfirmation||appAtConfirmation?.__vue_app__!==vueAtConfirmation||appAtConfirmation?.__vue_app__?.config?.globalProperties?.$pinia!==piniaAtConfirmation||appAtConfirmation?.isConnected===false||root.WebVideoCraftUpdates!==clientAtConfirmation||root.WebVideoCraftBridge!==bridgeAtConfirmation||['appUpdate','editor','modal','workspace'].some(key=>current[key]!==storesAtConfirmation[key])||(projectIdentity?project?.id!==projectIdentity.id||project?.path!==projectIdentity.path:!!project))throw Error('确认期间 Craft 页面或工程已变化，请重新检查更新');
    if(guardStatus().safe!==true)throw Error(guardStatus().message);
    assertSelected();
   };
   const stopConfirmationChecks=[];
   for(const event of ['pagehide','beforeunload'])root.addEventListener?.(event,expireConfirmation,{once:true});
   try{
    for(const store of [storesAtConfirmation.appUpdate,storesAtConfirmation.workspace])if(typeof store?.$subscribe==='function'){
     const stop=store.$subscribe(()=>{try{assertContext();}catch{confirmationExpired=true;}},{detached:true,flush:'sync'});
     if(typeof stop!=='function')throw Error('确认期间无法观察官方更新上下文');stopConfirmationChecks.push(stop);
    }
    publish('confirming',{version:known.version});
    // The owned HTML dialog avoids beta.2's forbidden Tauri dialog command.
    // A Promise is not consent: wait and require the literal boolean true.
    const answer=await requestConfirmation({version:known.version,message:'将更新至 Craft '+known.version+'。请确认已保存文档并结束所有导出、导入和后台工作。将重新取得同一版本的官方安装包并验证签名，然后正常关闭 Craft，用不带本次调试及临时 profile 的干净环境运行官方安装器。更新后增强功能不会自动重新挂载，须用兼容的 WebVideo+ 安装器重新接入。继续？'});
    if(answer!==true){const error=Error('已取消官方更新安装');error.cancelled=true;throw error;}
    assertContext();
    if(getStores().editor?.hasUnsavedDocuments!==false)throw Error('请先保存文档再安装官方更新');
   }finally{for(const stop of stopConfirmationChecks)stop();for(const event of ['pagehide','beforeunload'])root.removeEventListener?.(event,expireConfirmation);}
   await closeUpdateDisplays();
   assertContext();
   if(blockers())throw Error('请先保存文档并等待任务完成');
   const app=root.document?.querySelector('#app'),previous=app?.inert;let commitRequested=false,uncertain=false;if(app)app.inert=true;
   const stop=async error=>{
    let outcome;try{outcome=await rpc('update.abort',{});}catch(abortError){if(commitRequested)error.abortError=abortError.message;}
    if(commitRequested&&outcome?.installationStarted===true&&outcome.finished===true&&Number.isInteger(outcome.exitCode)){
     uncertain=true;closingHost=true;error.installationStarted=true;
     error.message='官方安装器已运行并结束，退出码 '+outcome.exitCode+'。请查看更新记录并核对实际安装结果，再使用兼容的 WebVideo+ 安装器重新接入。';
     publish('installer-finished',{error:error.message,outcome});
    }else if(commitRequested&&outcome?.notStarted!==true){
     uncertain=true;closingHost=true;error.indeterminate=true;
     error.message='无法确认官方安装已停止。请保持 Craft 窗口打开，不要继续安装或强制结束进程；安装可能仍会运行，请查看更新记录并按安装器的恢复提示处理。'+(outcome?.message||error.abortError||error.message);
     publish('indeterminate',{error:error.message,outcome});
    }else{closingHost=false;publish('not-started',{error:error.message,outcome});if(app)app.inert=previous;busy=false;}
    return error;
   };
   try{
    publish('preparing',{version:known.version});const ack=await rpc('update.prepare',{...known,confirmNormalClose:true});if(!ack?.ready)throw Error('更新协调器未就绪');
    if(guardStatus().safe!==true)throw Error(guardStatus().message);
    assertContext();
    if(blockers())throw Error('安装前出现未保存文档或运行任务');
    commitRequested=true;
    const commit=await rpc('update.commit',{confirmNormalClose:true});if(!commit?.committed||commit.exitHost!==true)throw Error(commit?.message||'干净环境更新交接已失效，请重新检查');
    if(guardStatus().safe!==true)throw Error(guardStatus().message);
    assertContext();
    if(blockers())throw Error('关闭前出现未保存文档或运行任务');
    publish('closing-host',{version:known.version});
    // Craft beta.2's pinned updater 2.10.1 ignores restartAfterInstall. Do not
    // pretend auto-relaunch can be suppressed; the helper preserves that path.
    await nativeInvoke('plugin:window|close',{label:'main'});
    closingHost=true;
    // If normal teardown succeeds this document disappears. A surviving page
    // must obtain definitive prelaunch cancellation before editing is restored.
    root.setTimeout(async()=>{
     try{
      const error=await stop(Error('Craft 窗口仍未关闭，本次官方安装已请求停止'));
      root.alert?.((error.indeterminate||error.installationStarted?'Craft 官方更新状态待确认：':'Craft 官方安装已停止：')+error.message);
     }catch(error){publish('indeterminate',{error:error.message});root.alert?.('无法确认官方更新的停止结果，请保持窗口打开并检查更新记录。'+error.message);}
    },1000);
    return {closingHost:true,installed:false};
   }catch(error){throw await stop(error);}
   finally{if(!closingHost&&!uncertain&&app)app.inert=previous;}
  }
  async function install(args){
   idle();const known=updates.get(args.updateRid);
   if(!known||downloads.get(args.bytesRid)!==args.updateRid)throw Error('请在 WebVideo+ 的更新面板重新检查并下载 Craft 官方更新，再安装');
   const assertSelected=()=>{if(updates.get(args.updateRid)!==known||downloads.get(args.bytesRid)!==args.updateRid)throw Error('确认期间官方更新下载记录已变化，请重新检查并下载');};
   busy=true;try{return await coordinate(known,assertSelected);}finally{if(!closingHost)busy=false;}
  }
  async function nativeDownloaded(info){
   idle();if(guardStatus().safe!==true)throw Error(guardStatus().message);
   if(typeof info?.version!=='string'||typeof info?.currentVersion!=='string')throw Error('官方下载版本信息无效');
   const selectedStore=getStores().appUpdate;
   const assertSelected=()=>{if(getStores().appUpdate!==selectedStore||selectedStore.availableUpdate?.version!==info.version||selectedStore.availableUpdate?.currentVersion!==info.currentVersion)throw Error('官方下载版本或页面已变化，请重新检查');};
   assertSelected();
   busy=true;let checked;
   try{
    publish('checking');checked=await observed('plugin:updater|check',{});
    if(!checked||checked.version!==info.version||checked.currentVersion!==info.currentVersion)throw Error('官方更新版本已变化，请重新检查并下载');
    // The original private resource stays with Craft. This fresh check supplies
    // public raw metadata; the backend downloads and verifies signed bytes again.
    return await coordinate(updates.get(checked.rid),assertSelected);
   }catch(error){if(!error.indeterminate&&!error.installationStarted)publish(error.cancelled?'downloaded':'failed',{error:error.message});throw error;}
   finally{if(checked)await observed('plugin:resources|close',{rid:checked.rid}).catch(()=>{});if(!closingHost)busy=false;}
  }
  async function facade(command,args={},options){
   try{
    if(command==='plugin:updater|install')return await install(args);
    if(command==='plugin:updater|download_and_install'){
     idle();if(!updates.has(args.rid))throw Error('请重新检查官方更新后再安装');
     // The official download still performs the native signature verification.
     // Keep its caller-owned channel and options intact.
     busy=true;let downloaded;try{downloaded=await observed('plugin:updater|download',args,options);}finally{busy=false;}
     try{return await install({updateRid:args.rid,bytesRid:downloaded});}
     finally{await observed('plugin:resources|close',{rid:downloaded}).catch(()=>{});}
    }
    return await observed(command,args,options);
   }catch(error){if(!error.cancelled&&(command==='plugin:updater|install'||command==='plugin:updater|download_and_install'))root.alert?.(error.indeterminate||error.installationStarted?'Craft 官方更新状态待确认：'+error.message:'Craft 更新尚未开始：'+error.message);throw error;}
  }
  return {
   state:()=>({status,version:update?.version,busy}),
   invoke:facade,
   async status(){const value=await rpc('update.status',{}),guard=guardStatus();return {...value,enabled:value?.enabled===true&&guard.safe===true,officialUiGuard:guard,...(!guard.safe?{message:guard.message}:{})};},
   installOfficialHook(){officialGuard??=root.WebVideoCraftInstallOfficialGuard({getStores});officialGuard.registerInstallRoute(nativeDownloaded,()=>busy);return guardStatus();},
   nativeDownloaded,
   async check(){idle();busy=true;try{
    if(bytesRid!==undefined)await observed('plugin:resources|close',{rid:bytesRid});if(update)await observed('plugin:resources|close',{rid:update.rid});update=undefined;bytesRid=undefined;
    publish('checking');update=await observed('plugin:updater|check',{});publish(update?'available':'up-to-date');return update;
   }catch(error){publish('failed',{error:error.message});throw error;}finally{busy=false;}},
   async download(){idle();if(!update)throw Error('请先检查更新');busy=true;let callback;
    try{if(bytesRid!==undefined){await observed('plugin:resources|close',{rid:bytesRid});bytesRid=undefined;}publish('downloading');callback=internals.transformCallback(message=>{const event=message.message;if(event)onState({status:'downloading',event});},false);
     const channel={__TAURI_TO_IPC_KEY__(){return '__CHANNEL__:'+callback;}};
     bytesRid=await observed('plugin:updater|download',{rid:update.rid,onEvent:channel});publish('downloaded');
    }catch(error){publish('failed',{error:error.message});throw error;}finally{if(callback!==undefined)internals.unregisterCallback(callback);busy=false;}
   },
   async install(){if(!update||bytesRid===undefined)throw Error('请先下载已验证更新');return install({updateRid:update.rid,bytesRid});},
  };
 };
})(globalThis);

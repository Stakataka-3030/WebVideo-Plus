(function(root){'use strict';
 root.WebVideoCraftCreateUpdates=function({invoke,internals,rpc,getStores,onState=()=>{}}){
  let update,bytesRid,busy=false,status='idle';const publish=(next,details={})=>{status=next;onState({status,version:update?.version,...details});};
  const blockers=()=>{const s=getStores();if(typeof s.editor?.hasUnsavedDocuments!=='boolean'||typeof s.runtimeTask?.hasBlockingTasks!=='boolean')throw Error('宿主更新任务状态尚未初始化，不能确认安装安全');return s.editor.hasUnsavedDocuments||s.runtimeTask.hasBlockingTasks;};
  return {
   state:()=>({status,version:update?.version,busy}),
   async check(){if(busy)throw Error('更新操作进行中');busy=true;try{
     if(bytesRid!==undefined)await invoke('plugin:resources|close',{rid:bytesRid});if(update)await invoke('plugin:resources|close',{rid:update.rid});update=undefined;bytesRid=undefined;
     publish('checking');update=await invoke('plugin:updater|check',{});publish(update?'available':'up-to-date');return update;}finally{busy=false;}},
   async download(){if(!update||busy)throw Error('请先检查更新');busy=true;let callback;
    try{publish('downloading');callback=internals.transformCallback(message=>{const event=message.message;if(event)onState({status:'downloading',event});},false);
      const channel={__TAURI_TO_IPC_KEY__(){return '__CHANNEL__:'+callback;}};
      bytesRid=await invoke('plugin:updater|download',{rid:update.rid,onEvent:channel});publish('downloaded');
    }catch(e){publish('failed',{error:e.message});throw e;}finally{if(callback!==undefined)internals.unregisterCallback(callback);busy=false;}},
   async install(){if(busy||!update||bytesRid===undefined)throw Error('请先下载已验证更新');if(blockers())throw Error('请先保存文档并等待任务完成');
    busy=true;const app=document.querySelector('#app'),previous=app?.inert;if(app)app.inert=true;
    try{publish('preparing');const ack=await rpc('update.prepare',{version:update.version});if(!ack?.ready)throw Error('更新协调器未就绪');
      if(blockers())throw Error('安装前出现未保存文档或运行任务');
      publish('installing');await invoke('plugin:updater|install',{updateRid:update.rid,bytesRid,restartAfterInstall:false});
    }catch(e){await rpc('update.abort',{}).catch(()=>{});publish('failed',{error:e.message});throw e;}
    finally{if(app)app.inert=previous;busy=false;}},
  };
 };
})(globalThis);

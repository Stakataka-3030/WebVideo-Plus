import {createRequire} from 'node:module';
const {readPinnedCraftUpdateState}=createRequire(import.meta.url)('../update/host-state.js');

// Own-installer opening is not a host-exit or installation authorization. The
// independent install transaction still requires the live session to end.
export class SessionActivity {
 constructor(){this.pending=0;this.revision=0;}
 async run(action){this.pending++;this.revision++;try{return await action();}finally{this.pending--;this.revision++;}}
}

// Both consumers share observations, never an authorization scope. Official
// shutdown additionally requires explicit user confirmation and uses normal
// window close; this predicate cannot prove untracked native work quiescent.
export const readOwnInstallerLaunchState=options=>readSessionUpdateState(options,'own-installer-ui-only');
export async function readOfficialInstallState(options){
 if(options.confirmNormalClose!==true)throw Error('尚未确认保存并正常关闭 Craft');
 return readSessionUpdateState(options,'official-confirmed-normal-close');
}
async function readSessionUpdateState({cdp,getSession,profile,activity,storage,kernel},coverage){
 const session=getSession();
 if(!cdp||!session||session.closed)throw Error('Craft 原生状态不可用，请等待页面接入');
 const revision=activity.revision;
 const validSession=()=>{if(getSession()!==session||session.closed)throw Error('Craft 页面已变化，请重新检查更新');};
 const service=await kernel.readUpdateActivity();validSession();
 if(service?.known!==true||typeof service.hasBlockingTasks!=='boolean'||!Number.isSafeInteger(service.revision)||!Number.isSafeInteger(kernel.activityRevision))throw Error('无法确认 WebVideo+ 后台工作状态，请等待任务完成或正常重启 Craft');
 const expression=`(${readPinnedCraftUpdateState.toString()})(document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia,${JSON.stringify(profile)})`;
 const result=await cdp.call('Runtime.evaluate',{contextId:session.contextId,expression,returnByValue:true});validSession();
 const native=result.result?.value;
 const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
 if(result.exceptionDetails||native?.coverage!=='known-work-only'||typeof native.hasUnsavedDocuments!=='boolean'||typeof native.hasBlockingTasks!=='boolean'||!strings(native.blockers)||!strings(native.absentLazyStores))throw Error('无法确认 Craft 已知文档和工作状态，尚未打开安装器');
 if(!(storage.snapshots instanceof Map)||!(storage.metadataWrites instanceof Set))throw Error('WebVideo+ 会话工作记录不可用');
 const reasons=[...native.blockers];
 if(service.hasBlockingTasks)reasons.push('webvideo-kernel-work');
 if(activity.pending||activity.revision!==revision||kernel.activityRevision!==service.revision)reasons.push('webvideo-session-work');
 if([...storage.snapshots.values()].some(item=>item.ready!==true))reasons.push('webvideo-snapshot-work');
 if(storage.metadataWrites.size)reasons.push('webvideo-metadata-write');
 const assertCurrent=()=>{
  validSession();
  if(activity.pending||activity.revision!==revision||kernel.activityRevision!==service.revision||[...storage.snapshots.values()].some(item=>item.ready!==true)||storage.metadataWrites.size)throw Error('检查后出现 WebVideo+ 工作，请等待完成并重新打开安装器');
 };
 return {hasUnsavedDocuments:native.hasUnsavedDocuments,hasBlockingTasks:native.hasBlockingTasks||service.hasBlockingTasks||reasons.length>0,
  coverage,nativeCoverage:native.coverage,universalIdle:false,
  absentLazyStores:native.absentLazyStores,blockers:reasons,assertCurrent};
}

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The session only arms the bounded helper and releases the native wrapper.
// It MUST NOT wait for installer completion while that same-name wrapper lives.
export class UpdateCoordinator {
 constructor({stateDir,statePath,hostPid,wrapperPid,craftExe,installMode,observerValidated=false,sameNameValidated=false,releaseWrapper,helperEntrypoint='handoff.mjs',helperEnvironment,spawnHelper=spawn,readyTimeoutMs=120000,wrapperTimeoutMs=10000}){
  Object.assign(this,{stateDir,statePath,hostPid,wrapperPid,craftExe,installMode,observerValidated,sameNameValidated,releaseWrapper,helperEntrypoint,helperEnvironment,spawnHelper,readyTimeoutMs,wrapperTimeoutMs});this.pending=null;
 }
 isEnabled(){return this.installMode==='same-name'&&this.observerValidated===true&&this.sameNameValidated===true;}
 assertEnabled(){
  if(!this.observerValidated)throw Error('当前适配包尚未通过原生安装观察验证，请保存并关闭 Craft，再用安装器卸载挂载后从原入口完成官方更新');
  if(this.installMode!=='same-name'||!this.sameNameValidated)throw Error('同名入口的官方更新交接尚未通过原生验证，请关闭 Craft 并用安装器恢复官方入口');
 }
 async status(){
  let last;try{last=JSON.parse(await fs.readFile(path.join(this.stateDir,'update.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')return {enabled:false,state:'unreadable',message:'无法读取官方更新交接记录，请使用安装器检查'};}
  return {enabled:this.isEnabled(),validation:{updateObserverValidated:this.observerValidated===true,sameNameUpdateValidated:this.sameNameValidated===true},state:this.pending?(this.pending.result?.state||(this.pending.committed?'installing':this.pending.ready?'ready':'preparing')):last?.state||'idle',last,automaticRemount:false};
 }
 async prepare({version}){
  if(this.pending)throw Error('更新协调已在进行');
  this.assertEnabled();
  if(typeof version!=='string'||!/^[0-9A-Za-z.+-]+$/.test(version))throw Error('更新版本无效');
  if(!this.statePath||!Number.isSafeInteger(this.hostPid)||this.hostPid<=0||!Number.isSafeInteger(this.wrapperPid)||this.wrapperPid<=0||typeof this.releaseWrapper!=='function')throw Error('更新会话进程归属不完整');
  const id=crypto.randomUUID();
  const child=this.spawnHelper(process.execPath,[path.join(path.dirname(fileURLToPath(import.meta.url)),this.helperEntrypoint),'--state',this.statePath,'--host-pid',String(this.hostPid),'--wrapper-pid',String(this.wrapperPid),'--version',version,'--id',id,...(this.helperExtraArgs||[])],{env:this.helperEnvironment,windowsHide:true,detached:true,stdio:['ignore','ignore','ignore','ipc']});
  let readyResolve,readyReject,wrapperResolve,wrapperReject,doneResolve,exitResolve;
  const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),wrapperGone=new Promise((r,j)=>{wrapperResolve=r;wrapperReject=j;}),completion=new Promise(r=>doneResolve=r),termination=new Promise(r=>exitResolve=r);
  // Rejections can arrive before prepare reaches the respective await.
  ready.catch(()=>{});wrapperGone.catch(()=>{});
  const pending={id,child,completion,termination,exited:false,ready:false,handedOff:false};this.pending=pending;
  const timer=setTimeout(()=>readyReject(Error('更新观察器启动超时')),this.readyTimeoutMs);
  child.on('message',event=>{if(event?.id!==id)return;if(event.type==='armed'){clearTimeout(timer);readyResolve();}else if(event.type==='wrapper-exited')wrapperResolve();else if(event.type==='installer-observed'){pending.installerObserved=event.observed;}else if(event.type==='committed'){pending.committed=true;pending.commitResolve?.({committed:true,id});}else if(event.type==='result'){pending.result=event.result;pending.commitReject?.(Error('更新观察器已结束')); doneResolve(event.result);}else if(event.type==='error'){const e=Error(event.message||'官方更新观察器失败');readyReject(e);wrapperReject(e);pending.commitReject?.(e);}});
  child.on('error',error=>{clearTimeout(timer);readyReject(error);wrapperReject(error);pending.commitReject?.(error);if(!child.pid){pending.exited=true;exitResolve();doneResolve({state:'indeterminate',message:error.message});}});
  child.once('exit',()=>{pending.exited=true;exitResolve();clearTimeout(timer);const error=Error('官方更新观察器已退出');readyReject(error);wrapperReject(error);pending.commitReject?.(error);doneResolve(pending.result||{state:'indeterminate',message:error.message});if(this.pending===pending&&!pending.handedOff)this.pending=null;});
  try{
   await ready;
   await this.releaseWrapper({id,stage:'update-handoff'});
   let wrapperTimer;try{await Promise.race([wrapperGone,new Promise((_,reject)=>{wrapperTimer=setTimeout(()=>reject(Error('原入口包装器未退出，官方更新尚未开始')),this.wrapperTimeoutMs);})]);}finally{clearTimeout(wrapperTimer);}
   if(pending.result)throw Error('更新观察器已经结束，请重试');
   pending.ready=true;return {ready:true,id,version,automaticRemount:false};
  }catch(error){clearTimeout(timer);await UpdateCoordinator.prototype.abort.call(this);throw error;}
 }
 async commit(){
  const pending=this.pending;if(!pending?.ready||pending.result||!pending.child.connected)throw Error('更新交接已失效');
  if(pending.committed)return {committed:true,id:pending.id};
  if(pending.committing)throw Error('更新安装提交正在进行');pending.committing=true;pending.commitRequested=true;
  let timer;try{return await new Promise((resolve,reject)=>{pending.commitResolve=resolve;pending.commitReject=reject;timer=setTimeout(()=>reject(Error('更新交接提交超时')),10000);pending.child.send({type:'commit',id:pending.id},error=>{if(error)reject(error);});});}
  finally{clearTimeout(timer);pending.committing=false;}
 }
 // Call only after the exact owned host has exited. The helper keeps its own
 // installer handle, deadline, journal and update lock after IPC disconnection.
 handoff(){
  if(!this.pending?.ready||!this.pending.commitRequested)return false;
  this.pending.handedOff=true;const child=this.pending.child;
  if(child.connected)child.disconnect();child.unref();return true;
 }
 async abort(){
  const pending=this.pending;if(!pending)return;
  if(pending.handedOff||pending.commitRequested)throw Error('官方更新已交接，不能终止安装器');
  if(pending.child.connected)try{pending.child.send({type:'abort',id:pending.id});}catch{}
  // Abort never terminates the installer, even if install already started.
  const timer=setTimeout(()=>pending.child.kill(),3000);let deadline;
  try{await Promise.race([pending.termination,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('更新准备进程尚未退出，保留暂存文件与恢复记录')),4000);})]);
   if(pending.child.connected)pending.child.disconnect();pending.child.unref();if(this.pending===pending)this.pending=null;
  }finally{clearTimeout(timer);clearTimeout(deadline);}
 }
}

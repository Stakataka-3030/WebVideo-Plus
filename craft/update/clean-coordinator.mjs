import {UpdateCoordinator} from './coordinator.mjs';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {readState,assertNoLinks,fileHash} from '../installer/transaction.mjs';
import {stageOfficialUpdate,verifyOfficialStage,cleanOfficialEnvironment} from './official-stage.mjs';

export async function cleanupOwnedOfficialStage({statePath,state,staged}){
 if(!staged?.directory||!staged.record)return;
 const owner=state||readState(statePath),directory=path.resolve(staged.directory),parent=path.join(owner.stateDir,'official-update');
 if(path.dirname(directory)!==path.resolve(parent)||!/^staged-[a-zA-Z0-9]+$/.test(path.basename(directory)))throw Error('Refusing cleanup outside owned official staging');
 assertNoLinks(directory);try{await fs.lstat(directory);}catch(error){if(error.code==='ENOENT')return;throw error;}
 const namesToRemove=['installer.exe','receipt.json'],identity=new Map();
 for(const name of namesToRemove){const file=path.join(directory,name);assertNoLinks(file);identity.set(name,fsSync.lstatSync(file));}
 const receiptHash=fileHash(path.join(directory,'receipt.json'));
 const verified=await verifyOfficialStage(owner,directory);
 if(JSON.stringify(verified.record)!==JSON.stringify(staged.record))throw Error('Refusing cleanup of changed official stage ownership');
 const names=(await fs.readdir(directory)).sort();if(names.join('|')!=='installer.exe|receipt.json')throw Error('Refusing cleanup of unexpected staging contents');
 // Never recursively remove a directory: a concurrently added foreign file is
 // retained, and rmdir fails rather than deleting anything beyond these files.
 const check=name=>{const file=path.join(directory,name),before=identity.get(name);assertNoLinks(file);const after=fsSync.lstatSync(file);if(!after.isFile()||['dev','ino','nlink','size','mtimeMs'].some(key=>after[key]!==before[key])||fileHash(file)!==(name==='installer.exe'?staged.record.sha256:receiptHash))throw Error('Refusing cleanup of replaced official stage file');return file;};
 // Recheck inode/content at the deletion boundary with no intervening awaits.
 for(const name of namesToRemove)check(name);
 for(const name of namesToRemove)fsSync.unlinkSync(check(name));
 fsSync.rmdirSync(directory);
}
function cancellationOutcome(pending,value){
 const observed=value?.observed;
 if(observed?.state==='not-started'&&observed.launchAttempted===false)return {cancelled:true,notStarted:true,commitRequested:pending.commitRequested===true,state:'not-started',message:'已确认官方安装器未启动；当前 Craft 可以继续使用。'};
 if(observed?.state==='exited'&&Number.isInteger(observed.exitCode))return {cancelled:false,notStarted:false,commitRequested:true,installationStarted:true,finished:true,exitCode:observed.exitCode,state:value.state||'installer-finished',message:'官方安装器已运行并结束，请按恢复记录检查原入口。'};
 return {cancelled:false,notStarted:false,commitRequested:true,state:'indeterminate',message:'官方更新提交结果尚未确认，安装器可能已经启动。恢复记录与安装包已保留；请先等待更新结果，不要重复安装。'};
}
export class CleanUpdateCoordinator extends UpdateCoordinator {
 constructor(options){super({...options,helperEntrypoint:'clean-handoff.mjs',helperEnvironment:cleanOfficialEnvironment(process.env)});this.cleanInstallValidated=options.cleanInstallValidated===true;this.autoInstallEnabled=options.autoInstallEnabled===true;this.stageOfficial=options.stageOfficial||stageOfficialUpdate;this.staging=null;this.hostArgs=options.hostArgs||[];this.cleanupStage=options.cleanupStage||cleanupOwnedOfficialStage;this.cancelWaitMs=options.cancelWaitMs??35000;this.staged=null;this.cleanupWork=null;this.committedPending=null;}
 get busy(){return !!this.staging||!!this.pending||!!this.cleanupWork||!!(this.committedPending?.commitRequested&&!(this.committedPending.exited&&cancellationOutcome(this.committedPending,this.committedPending.result).notStarted));}
 isEnabled(){return this.autoInstallEnabled===true&&this.installMode==='same-name';}
 assertEnabled(){if(!this.autoInstallEnabled)throw Error('本包未启用 Craft 官方自动安装');if(this.installMode!=='same-name')throw Error('官方更新需要已验证的同名入口安装记录');}
 async status(){const status=await super.status();return {...status,validation:{updateObserverValidated:this.observerValidated===true,sameNameUpdateValidated:this.sameNameValidated===true,officialCleanUpdateValidated:this.cleanInstallValidated},runtimePolicy:{officialAutoInstallEnabled:this.autoInstallEnabled},...(this.cleanupWarning?{cleanupWarning:this.cleanupWarning}:{}),state:this.staging?'verifying-official-installer':this.pending?.cancelling?'cancelling-before-launch':this.pending?.result?.state|| (this.pending?.installerObserved?'installing':this.pending?.commitRequested?(this.pending.committed?'closing-host':'commit-uncertain'):status.state),mode:'signed-clean-environment'};}
 async prepare({version,currentVersion,metadata}){
  if(this.busy)throw Error('更新协调已在进行');
  this.assertEnabled();
  const controller=new AbortController();this.staging=controller;this.committedPending=null;this.cleanupWarning=null;
  try{
   this.stagingWork=this.stageOfficial({statePath:this.statePath,version,currentVersion,metadata,signal:controller.signal});
   const staged=await this.stagingWork;this.staged=staged;this.stagingWork=null;
   if(controller.signal.aborted)throw controller.signal.reason;
   this.helperExtraArgs=['--stage',staged.directory,'--host-args',JSON.stringify(this.hostArgs)];
   return await super.prepare({version});
  }catch(error){await this.discardStage();throw error;}finally{if(this.staging===controller){this.staging=null;this.stagingWork=null;}}
 }
 async discardStage(){
  if(this.cleanupWork)return this.cleanupWork;
  if(!this.staged||this.pending&&!this.pending.exited||this.committedPending?.commitRequested)return;
  const staged=this.staged;this.staged=null;
  this.cleanupWork=this.cleanupStage({statePath:this.statePath,staged}).catch(error=>{this.cleanupWarning='官方更新暂存文件已保留：'+error.message;});
  try{await this.cleanupWork;}finally{this.cleanupWork=null;}
 }
 async cancelBeforeLaunch(pending=this.pending||this.committedPending){
  if(!pending)return {cancelled:true,notStarted:true,commitRequested:false,state:'not-started'};
  if(pending.cancelling)return pending.cancelling;
  const work=(async()=>{
   if(pending.child.connected)try{pending.child.send({type:'cancel-before-launch',id:pending.id},()=>{});}catch{}
   let timeout;try{return await Promise.race([(async()=>{const value=await pending.completion,outcome=cancellationOutcome(pending,value);if(outcome.notStarted)await pending.termination;return outcome;})(),new Promise(resolve=>{timeout=setTimeout(()=>resolve(cancellationOutcome(pending,undefined)),this.cancelWaitMs);})]);}
   finally{clearTimeout(timeout);}
  })();pending.cancelling=work;try{return await work;}finally{if(pending.cancelling===work)pending.cancelling=null;}
 }
 async commit(){
  const pending=this.pending;if(pending)this.committedPending=pending;
  try{return {...await super.commit(),exitHost:true,closeGraceMs:30000};}
  catch(error){if(!pending?.commitRequested)throw error;return {committed:pending.committed===true,exitHost:false,...await this.cancelBeforeLaunch(pending),commitError:error.message};}
 }
 async abort(){
  this.staging?.abort(Error('官方更新准备已取消'));if(this.stagingWork)await this.stagingWork.catch(()=>{});
  const pending=this.pending||this.committedPending;
  if(pending?.commitRequested)return this.cancelBeforeLaunch(pending);
  await super.abort();await this.discardStage();return {cancelled:true,notStarted:true,commitRequested:false,state:'not-started'};
 }
}

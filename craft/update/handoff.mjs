import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {readState,verifyPackage,assertNoLinks,fileHash} from '../installer/transaction.mjs';
import {classifyOfficialUpdate,shouldRetainUpdateLock} from './handoff-state.mjs';

// Detached one-shot helper. No service, registry, startup task, network request,
// host mutation, forced app termination, or automatic remount is performed here.
const args=process.argv.slice(2),options={};
const allowed=new Set(['--state','--host-pid','--wrapper-pid','--version','--id']);
let observer,lockPath,lockId,record,journal,timer,aborted=false,committed=false,retainLock=false;
const send=value=>{if(process.connected)try{process.send(value,()=>{});}catch{}};
async function notifyResult(state,result){
 const message=result.message+'\n\nCraft 原入口：'+state.craftExe+'\n\n这条提示将在 30 秒后关闭；说明也已保存在增强组件 state/OFFICIAL-UPDATE-RECOVERY.txt。';
 const notification=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(state.adapterRoot,'craft/update/notify-result.ps1'),'-MessageBase64',Buffer.from(message,'utf8').toString('base64')],{windowsHide:true,stdio:'ignore'});
 let deadline;try{await new Promise(resolve=>{notification.once('error',resolve);notification.once('exit',resolve);deadline=setTimeout(()=>{notification.kill();resolve();},35000);});}finally{clearTimeout(deadline);}
}
function atomic(file,value){assertNoLinks(file);const temp=file+'.tmp-'+crypto.randomUUID();try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function releaseLock(){if(!lockPath)return;try{assertNoLinks(lockPath);const current=JSON.parse(fs.readFileSync(lockPath,'utf8'));if(current.id===lockId&&current.pid===process.pid)fs.unlinkSync(lockPath);}catch{}}
process.on('message',message=>{
 if(message?.id!==lockId)return;
 if(message.type==='abort'&&!committed){aborted=true;observer?.kill();}
 if(message.type==='commit'&&record&&observer&&observer.exitCode===null&&!aborted){try{record={...record,state:'install-requested',requestedAt:new Date().toISOString()};atomic(journal,record);committed=true;send({type:'committed',id:lockId});}catch(error){retainLock=committed;send({type:'error',id:lockId,message:error.message});}}
});
try{
 if(process.platform!=='win32')throw Error('官方更新交接只支持 Windows');
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid handoff arguments');options[args[i]]=args[i+1];}
 const statePath=path.resolve(options['--state']||''),state=readState(statePath);
 const id=options['--id'],version=options['--version'],hostPid=Number(options['--host-pid']),wrapperPid=Number(options['--wrapper-pid']);
 if(!/^[a-f0-9-]{36}$/.test(id||'')||!/^[0-9A-Za-z.+-]+$/.test(version||'')||!Number.isSafeInteger(hostPid)||hostPid<=0||!Number.isSafeInteger(wrapperPid)||wrapperPid<=0)throw Error('Invalid handoff identity');
 lockId=id;const manifest=verifyPackage(state.adapterRoot,{allowMutable:true});
 if(manifest.manifestSha256!==state.package.manifestSha256||manifest.updateObserverValidated!==true||manifest.sameNameUpdateValidated!==true)throw Error('Package-scoped official update gates are not validated');
 if(state.status!=='installed'||state.installMode!=='same-name'||fileHash(state.craftExe)!==state.ownership.wrapperSha256||fileHash(state.originalExe)!==state.ownership.originalSha256)throw Error('Owned entry changed before update');
 const leaseFile=path.join(state.stateDir,'session.json');assertNoLinks(leaseFile);const lease=JSON.parse(fs.readFileSync(leaseFile,'utf8'));
 if(lease.hostPid!==hostPid||lease.wrapperPid!==wrapperPid||lease.closedAt)throw Error('Update process lease changed');
 fs.mkdirSync(state.stateDir,{recursive:true});lockPath=path.join(state.stateDir,'update.lock');assertNoLinks(lockPath);
 const timeoutSeconds=900,deadline=new Date(Date.now()+timeoutSeconds*1000).toISOString();
 fs.writeFileSync(lockPath,JSON.stringify({schemaVersion:1,id,pid:process.pid,deadline}),{flag:'wx'});
 journal=path.join(state.stateDir,'update.json');record={schemaVersion:2,id,installId:state.installId,version,hostPid,wrapperPid,helperPid:process.pid,craftExe:state.craftExe,state:'prepared',createdAt:new Date().toISOString(),deadline};atomic(journal,record);
 const executable=path.join(state.adapterRoot,'CraftInstallerObserver.exe');
 observer=spawn(executable,[String(hostPid),version,'webgal-craft',String(timeoutSeconds),String(wrapperPid),state.craftExe,state.originalExe],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let buffer='',last,stderr='',armed=false;observer.stdout.setEncoding('utf8');observer.stderr.setEncoding('utf8');
 observer.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8192);});
 observer.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>65536){observer.kill();return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);try{const event=JSON.parse(line);if(event.state==='armed'){armed=true;send({type:'armed',id});}else if(event.state==='wrapper-exited')send({type:'wrapper-exited',id});else {last=event;if(event.state==='observed'){record={...record,state:'installer-observed',installerPid:event.pid,installerStartedAt:event.startedAt,observed:event};atomic(journal,record);}}}catch{}}});
 timer=setTimeout(()=>observer.kill(),(timeoutSeconds+5)*1000);
 const outcome=await new Promise(resolve=>{observer.once('error',error=>resolve({state:'indeterminate',reason:error.message}));observer.once('exit',()=>resolve(last||{state:'indeterminate',reason:stderr||'Observer exited without a completion receipt'}));});
 clearTimeout(timer);retainLock=shouldRetainUpdateLock(committed,outcome);let hostSha256;try{assertNoLinks(state.craftExe);hostSha256=fileHash(state.craftExe);}catch{}
 const result=aborted?{state:'aborted',version,message:'官方安装调用未完成；保留现有文件'}:classifyOfficialUpdate({version,supportedHosts:Object.fromEntries(manifest.supportedHosts.map(h=>[h.version,h.sha256])),...state.ownership},outcome,hostSha256);
 const completed={...record,...result,observed:outcome,completedAt:new Date().toISOString()};
 // Never let an old helper replace a later transaction's diagnostic record.
 assertNoLinks(journal);if(JSON.parse(fs.readFileSync(journal,'utf8')).id===id)atomic(journal,completed);
 const guidance=path.join(state.stateDir,'OFFICIAL-UPDATE-RECOVERY.txt');
 atomic(guidance,{version,state:result.state,message:result.message,officialEntry:state.craftExe,hostSha256:hostSha256||null,completedAt:completed.completedAt});
 send({type:'result',id,result:completed});if(!armed)send({type:'error',id,message:outcome.reason||'Observer failed before arming'});
 if(!retainLock)releaseLock();if(!aborted&&armed)await notifyResult(state,result);
}catch(error){retainLock=committed;send({type:'error',id:lockId||options['--id'],message:error.message});if(record&&journal)try{atomic(journal,{...record,state:'indeterminate',message:error.message,completedAt:new Date().toISOString()});}catch{}process.exitCode=1;}
finally{clearTimeout(timer);if(observer&&observer.exitCode===null)observer.kill();if(!retainLock)releaseLock();if(process.connected)process.disconnect();}

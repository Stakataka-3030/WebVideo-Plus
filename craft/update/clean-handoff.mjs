import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {readState,verifyPackage,assertNoLinks,fileHash} from '../installer/transaction.mjs';
import {verifyOfficialStage,cleanOfficialEnvironment} from './official-stage.mjs';
import {cleanupOwnedOfficialStage} from './clean-coordinator.mjs';
import {classifyOfficialUpdate,shouldRetainUpdateLock} from './handoff-state.mjs';
const options={},args=process.argv.slice(2),allowed=new Set(['--state','--host-pid','--wrapper-pid','--version','--id','--stage','--host-args']);
let native,record,journal,lockPath,id,timer,state,staged,committed=false,aborted=false,retainLock=false,ownsUpdateLock=false,prelaunchCancelRequested=false;
const send=value=>{if(process.connected)try{process.send(value,()=>{});}catch{}};
function atomic(file,value){assertNoLinks(file);const temporary=file+'.tmp-'+crypto.randomUUID();try{fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}
function release(){if(!lockPath)return;try{assertNoLinks(lockPath);const current=JSON.parse(fs.readFileSync(lockPath,'utf8'));if(current.id===id&&current.pid===process.pid)fs.unlinkSync(lockPath);}catch{}}
async function notify(state,result){
 const message=result.message+'\n\nCraft 原入口：'+state.craftExe+'\n\n提示将在 30 秒后关闭；说明已保存在增强组件 state/OFFICIAL-UPDATE-RECOVERY.txt。';
 const notice=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(state.adapterRoot,'craft/update/notify-result.ps1'),'-MessageBase64',Buffer.from(message).toString('base64')],{env:cleanOfficialEnvironment(process.env),windowsHide:true,stdio:'ignore'});
 let timeout;try{await new Promise(resolve=>{notice.once('error',resolve);notice.once('exit',resolve);timeout=setTimeout(()=>{notice.kill();resolve();},35000);});}finally{clearTimeout(timeout);}
}
function abortUncommitted(){if(!committed){aborted=true;if(native&&native.exitCode===null)native.kill();}}
process.on('disconnect',abortUncommitted);
process.on('message',message=>{
 if(message?.id!==id)return;
 if(message.type==='abort')abortUncommitted();
 if(message.type==='cancel-before-launch'){
  prelaunchCancelRequested=true;
  if(!committed)abortUncommitted();
  else if(native&&native.exitCode===null){try{record={...record,cancellationRequestedAt:new Date().toISOString()};atomic(journal,record);native.stdin.write('cancel\n',error=>{if(error)send({type:'error',id,message:error.message});});}catch(error){send({type:'error',id,message:error.message});}}
 }
 if(message.type==='commit'&&!committed&&record&&native&&native.exitCode===null&&!aborted){
  try{record={...record,state:'install-requested',requestedAt:new Date().toISOString()};atomic(journal,record);committed=true;native.stdin.write('commit\n',error=>{if(error)send({type:'error',id,message:error.message});});}
  catch(error){send({type:'error',id,message:error.message});}
 }
});
try{
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('官方干净环境交接只支持 Windows x86_64');
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||options[args[i]]!==undefined||!args[i+1])throw Error('Invalid clean handoff argument');options[args[i]]=args[i+1];}
 id=options['--id'];const version=options['--version'],hostPid=Number(options['--host-pid']),wrapperPid=Number(options['--wrapper-pid']),hostArgs=JSON.parse(options['--host-args']||'[]');
 if(!/^[a-f0-9-]{36}$/.test(id||'')||!/^[0-9A-Za-z.+-]+$/.test(version||'')||!Number.isSafeInteger(hostPid)||hostPid<=0||!Number.isSafeInteger(wrapperPid)||wrapperPid<=0||!Array.isArray(hostArgs)||hostArgs.length>128||hostArgs.some(a=>typeof a!=='string'||/[\0\r\n]/.test(a)))throw Error('Invalid clean handoff identity');
 state=readState(path.resolve(options['--state']||''));const manifest=verifyPackage(state.adapterRoot,{allowMutable:true});
 if(manifest.manifestSha256!==state.package.manifestSha256||manifest.officialAutoInstallEnabled!==true||state.officialAutoInstallEnabled!==true)throw Error('Package-scoped official automatic installation is not enabled');
 if(state.status!=='installed'||state.installMode!=='same-name'||fileHash(state.craftExe)!==state.ownership.wrapperSha256||fileHash(state.originalExe)!==state.ownership.originalSha256)throw Error('Owned Craft entry changed');
 const leaseFile=path.join(state.stateDir,'session.json');assertNoLinks(leaseFile);const lease=JSON.parse(fs.readFileSync(leaseFile,'utf8'));if(lease.hostPid!==hostPid||lease.wrapperPid!==wrapperPid||lease.closedAt)throw Error('Owned Craft session changed');
 staged=await verifyOfficialStage(state,options['--stage']);staged.directory=options['--stage'];if(staged.record.version!==version)throw Error('Staged official version changed');
 if(aborted)throw Error('Official update session ended before native preparation');
 const seconds=900,deadline=new Date(Date.now()+(seconds+5)*1000).toISOString();
 lockPath=path.join(state.stateDir,'update.lock');assertNoLinks(lockPath);fs.writeFileSync(lockPath,JSON.stringify({schemaVersion:1,id,pid:process.pid,deadline}),{flag:'wx'});ownsUpdateLock=true;
 journal=path.join(state.stateDir,'update.json');record={schemaVersion:2,id,installId:state.installId,helperPid:process.pid,hostPid,wrapperPid,version,craftExe:state.craftExe,state:'prepared',validation:{updateObserverValidated:manifest.updateObserverValidated===true,sameNameUpdateValidated:manifest.sameNameUpdateValidated===true,officialCleanUpdateValidated:manifest.officialCleanUpdateValidated===true},runtimePolicy:{officialAutoInstallEnabled:true},mode:'signed-clean-environment',installerSha256:staged.record.sha256,createdAt:new Date().toISOString(),deadline};atomic(journal,record);
 native=spawn(path.join(state.adapterRoot,'CraftOfficialInstaller.exe'),[String(hostPid),String(wrapperPid),state.originalExe,state.craftExe,staged.installer,staged.record.sha256,staged.record.currentVersion,version,String(seconds),JSON.stringify(hostArgs)],{env:cleanOfficialEnvironment(process.env),windowsHide:true,stdio:['pipe','pipe','pipe']});
 let buffer='',last,stderr='',armed=false;native.stdin.on('error',error=>send({type:'error',id,message:error.message}));native.stdout.setEncoding('utf8');native.stderr.setEncoding('utf8');native.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-8192));
 native.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>65536){native.kill();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);try{
  const event=JSON.parse(line);
  if(event.state==='armed'){armed=true;send({type:'armed',id});}
  else if(event.state==='wrapper-exited')send({type:'wrapper-exited',id});
  else if(event.state==='committed')send({type:'committed',id});
  else{last=event;if(event.state==='observed'){record={...record,state:'installer-observed',installerPid:event.pid,installerStartedAt:event.startedAt,observed:event};atomic(journal,record);send({type:'installer-observed',id,observed:event});}}
 }catch(error){send({type:'error',id,message:error.message});}}});
 let drainTimer;
 const outcome=await new Promise(resolve=>{
  let spawnFailed=false,nativeError;
  native.on('error',error=>{nativeError=error.message;spawnFailed=!native.pid&&!armed&&!committed;});
  // close, unlike exit, waits until stdout has drained its final receipt.
  native.once('close',()=>{clearTimeout(drainTimer);resolve(spawnFailed?{state:'not-started',launchAttempted:false,reason:nativeError}:last&&(last.state==='exited'&&Number.isInteger(last.exitCode)||last.state==='not-started'&&last.launchAttempted===false)?last:{state:'indeterminate',...(last?.pid?{pid:last.pid,startedAt:last.startedAt}:{}),reason:nativeError||stderr||'Clean native helper did not return a terminal receipt'});});
  timer=setTimeout(()=>{native.kill();drainTimer=setTimeout(()=>resolve({state:'indeterminate',...(last?.pid?{pid:last.pid,startedAt:last.startedAt}:{}),reason:'Clean helper exceeded its deadline without a drained exit receipt'}),1000);},(seconds+5)*1000);
 });
 clearTimeout(timer);clearTimeout(drainTimer);retainLock=shouldRetainUpdateLock(committed,outcome);let hostSha256;try{assertNoLinks(state.craftExe);hostSha256=fileHash(state.craftExe);}catch{}
 const result=aborted?{state:'aborted',version,message:'官方更新已取消；现有入口和文件未被修改'}:classifyOfficialUpdate({version,supportedHosts:Object.fromEntries(manifest.supportedHosts.map(h=>[h.version,h.sha256])),...state.ownership},outcome,hostSha256);
 if(!retainLock)try{await cleanupOwnedOfficialStage({state,staged});staged=null;}catch(error){record={...record,cleanupWarning:error.message};}
 const completed={...record,...result,observed:outcome,completedAt:new Date().toISOString()};assertNoLinks(journal);if(JSON.parse(fs.readFileSync(journal,'utf8')).id===id)atomic(journal,completed);
 atomic(path.join(state.stateDir,'OFFICIAL-UPDATE-RECOVERY.txt'),{version,state:result.state,message:result.message,officialEntry:state.craftExe,hostSha256:hostSha256||null,installerMessage:outcome.reason||null});
 if(!retainLock)release();
 send({type:'result',id,result:completed});if(!armed)send({type:'error',id,message:outcome.reason||'Clean native helper failed before arming'});
 const quietCancellation=outcome.state==='not-started'&&outcome.launchAttempted===false&&prelaunchCancelRequested&&process.connected;
 if(!aborted&&armed&&!quietCancellation)await notify(state,outcome.state==='not-started'?{...result,message:result.message+'\n\n官方安装器未启动：'+(outcome.reason||'未完成正常关闭，请关闭 Craft 后重试。')}:result);
}catch(error){retainLock=committed;send({type:'error',id:id||options['--id'],message:error.message});if(record&&journal)try{atomic(journal,{...record,state:'indeterminate',message:error.message,completedAt:new Date().toISOString()});}catch{}process.exitCode=1;}
finally{clearTimeout(timer);if(native&&native.exitCode===null){native.kill();native.stdin.destroy();native.stdout.destroy();native.stderr.destroy();native.unref();}if(ownsUpdateLock&&!retainLock&&staged&&(!native||native.exitCode!==null))try{await cleanupOwnedOfficialStage({state,staged});}catch{}if(!retainLock)release();if(process.connected)process.disconnect();}

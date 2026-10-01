import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export class UpdateCoordinator {
  constructor({stateDir,hostPid,craftExe,installMode,supportedHosts={},observerValidated=false,appName='webgal-craft'}){Object.assign(this,{stateDir,hostPid,craftExe,installMode,supportedHosts,observerValidated,appName});this.pending=null;}
  async prepare({version}){
    if(this.pending)throw Error('更新协调已在进行');
    if(!this.observerValidated)throw Error('当前适配包尚未通过原生安装完成观察器验证，请使用官方更新并在结束后重新启动增强入口');
    if(this.installMode==='same-name')throw Error('同名包装器更新交接尚未验证，请先用安装器恢复官方入口');
    if(typeof version!=='string'||!/^[0-9A-Za-z.+-]+$/.test(version))throw Error('更新版本无效');
    await fs.mkdir(this.stateDir,{recursive:true});const journal=path.join(this.stateDir,'update.json');
    const record={schemaVersion:1,id:crypto.randomUUID(),version,hostPid:this.hostPid,craftExe:this.craftExe,state:'prepared',createdAt:new Date().toISOString()};
    await fs.writeFile(journal,JSON.stringify(record));
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(path.dirname(fileURLToPath(import.meta.url)),'observe-installer.ps1'),'-HostPid',String(this.hostPid),'-Version',version,'-AppName',this.appName],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let buffer='',armedResolve,armedReject,finishResolve,final;
    const armed=new Promise((r,j)=>{armedResolve=r;armedReject=j;}),completion=new Promise(r=>finishResolve=r);
    const timer=setTimeout(()=>{armedReject(Error('更新观察器启动超时'));child.kill();},10000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);try{const event=JSON.parse(line);if(event.state==='armed'){clearTimeout(timer);armedResolve();}else final=event;}catch{}}});
    child.once('error',e=>{clearTimeout(timer);armedReject(e);finishResolve({state:'indeterminate',reason:e.message});});
    child.once('exit',async()=>{clearTimeout(timer);armedReject(Error('更新观察器已退出'));let result={state:'indeterminate',version};
      if(final?.state==='exited'&&final.exitCode===0){const expected=this.supportedHosts[version];if(expected){try{const hash=crypto.createHash('sha256').update(await fs.readFile(this.craftExe)).digest('hex');if(hash===expected.toLowerCase())result={state:'verified-compatible',version,hostSha256:hash};else result.reason='安装后文件尚未匹配受支持版本';}catch(e){result.reason=e.message;}}
        else result={state:'installed-unvalidated-version',version};}
      else if(final?.state==='exited')result={state:'installer-failed',version,exitCode:final.exitCode};
      await fs.writeFile(journal,JSON.stringify({...record,...result,observed:final,completedAt:new Date().toISOString()})).catch(()=>{});finishResolve(result);
    });
    this.pending={record,completion,child};try{await armed;}catch(e){child.kill();await completion;this.pending=null;throw e;}return {ready:true,id:record.id,version};
  }
  async abort(){if(this.pending){this.pending.child.kill();await this.pending.completion;this.pending=null;}}
}

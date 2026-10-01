import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const GET=new Set(['/api/config','/api/jobs','/api/ai/config','/api/character-map','/api/anogo-actions','/api/filters','/api/preset-effects']);
const POST=new Set(['/api/jobs','/api/timing','/api/music/duration','/api/ai/save','/api/ai/remove','/api/ai/novel/start','/api/ai/novel/status','/api/ai/novel/cancel','/api/character-map','/api/anogo-actions','/api/filters/save','/api/preset-effects/save','/api/settings','/api/dialog/folder','/api/dialog/subtitle','/api/subtitles/start','/api/subtitles/status','/api/subtitles/cancel']);
export class KernelSession {
  constructor({kernel,root,storage,runtimePath,stateRoot=path.join(root,'kernel'),isolatedRuntimeValidation=false,readRuntimeStartup}){Object.assign(this,{kernel,root,storage,runtimePath,stateRoot,isolatedRuntimeValidation,readRuntimeStartup});this.child=null;this.discovery=null;this.jobs=new Set();}
  async start(){
    if(this.discovery)return;if(this.starting)return this.starting;
    this.starting=this._start();try{await this.starting;}finally{this.starting=null;}
  }
  async _start(){
    const terre=path.join(this.root,'host'),state=this.stateRoot;
    await fs.mkdir(path.join(terre,'public','assets'),{recursive:true});await fs.mkdir(path.join(state,'user-data'),{recursive:true});
    const config={stateDir:state,gamesRoot:path.join(this.root,'games'),terreDir:terre,outputDir:path.join(this.root,'output'),workDir:path.join(this.root,'work'),
      allowedOrigins:[],modules:['exporter','subtitles','generativeAI','musicTimeline'],importLegacyUserData:false,autoRefreshAiModels:false,automaticBackups:false,requireRuntimeParity:true,runtimePath:this.runtimePath||'',servicePort:0};
    for(const dir of [config.gamesRoot,config.outputDir,config.workDir])await fs.mkdir(dir,{recursive:true});
    const file=path.join(state,'config.json');await fs.writeFile(file,JSON.stringify(config));
    this.child=spawn(this.kernel,['service','--config',file],{cwd:path.dirname(this.kernel),windowsHide:true,stdio:'ignore'});
    let startError;this.child.once('error',e=>{startError=e;});
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){if(startError)throw startError;if(this.child.exitCode!==null)throw Error('kernel-service-exited');
      try{const d=JSON.parse(await fs.readFile(path.join(terre,'public','assets','video-export-service.json'),'utf8'));
        const u=new URL(d.baseUrl);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||d.pid!==this.child.pid||typeof d.token!=='string')throw Error('invalid-kernel-discovery');
        const response=await fetch(u.origin+'/health',{signal:AbortSignal.timeout(1500)});const health=await response.json();
        if(health.pid!==this.child.pid||health.serviceId!==d.serviceId)throw Error('kernel-identity-mismatch');this.discovery=d;return;
      }catch(e){if(!['ENOENT'].includes(e.code)&&e.message.startsWith('invalid-'))throw e;}
      await new Promise(r=>setTimeout(r,100));
    }throw Error('kernel-start-timeout');
  }
  async request({endpoint,data,snapshotId}){
    const method=data===undefined?'GET':'POST';
    if(!(method==='GET'?GET:POST).has(endpoint)&&!(method==='GET'&&/^\/api\/timing\/[a-f0-9-]{36}$/.test(endpoint))&&!(method==='POST'&&/^\/api\/jobs\/[a-f0-9-]{36}\/cancel$/.test(endpoint)))throw Error('service-operation-denied');
    const body=data===undefined?undefined:{...data};
    if(body&&['/api/jobs','/api/timing','/api/music/duration','/api/ai/novel/start'].includes(endpoint)){const s=this.storage.get(snapshotId);
      if(['/api/jobs','/api/timing'].includes(endpoint)){const supported=this.isolatedRuntimeValidation?['4.6.4','4.6.5']:['4.6.4'];if(s.runtimeId!=='open-webgal.webgal'||!supported.includes(s.engineVersion))throw Error('当前工程没有已完成验收的精确导出档位；4.6.5 正在隔离验证，不能自动回退到其他引擎');body.expectedRuntimeVersion=s.engineVersion;body.expectedRuntimeId=s.runtimeId;body.settings={...(body.settings||{}),engine:'webgal'};delete body.runtimeStartup;const startup=await this.readRuntimeStartup?.(s);if(startup)body.runtimeStartup=startup;}body.project=s.id;}
    await this.start();const response=await fetch(this.discovery.baseUrl+endpoint,{method,headers:{Authorization:'Bearer '+this.discovery.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'kernel-request-failed');return result;
  }
  async stop(){if(this.discovery)await fetch(this.discovery.baseUrl+'/api/shutdown',{method:'POST',headers:{Authorization:'Bearer '+this.discovery.token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(3000)}).catch(()=>{});
    if(this.child&&this.child.exitCode===null){await Promise.race([new Promise(r=>this.child.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(this.child.exitCode===null)this.child.kill();}this.discovery=null;
  }
}

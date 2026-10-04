import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const GET=new Set(['/api/config','/api/jobs','/api/ai/config','/api/character-map','/api/anogo-actions','/api/filters','/api/preset-effects']);
const POST=new Set(['/api/jobs','/api/timing','/api/music/duration','/api/ai/save','/api/ai/remove','/api/ai/novel/start','/api/ai/novel/status','/api/ai/novel/cancel','/api/character-map','/api/anogo-actions','/api/filters/save','/api/preset-effects/save','/api/settings','/api/dialog/folder','/api/dialog/subtitle','/api/subtitles/start','/api/subtitles/status','/api/subtitles/cancel']);
// QueueService/JobRunner use completed/failed/canceled; AiNovelTasks uses
// complete/failed/cancelled. Subtitle routes are only defensively allowlisted
// here; this C# source has no standalone subtitle lifecycle handler. Unknown contracts cannot prove update safety.
const STARTS=new Map([['/api/jobs','queue'],['/api/timing','queue'],['/api/ai/novel/start','novel'],['/api/subtitles/start','subtitles']]);
const STATUS=new Map([['/api/ai/novel/status','novel'],['/api/subtitles/status','subtitles']]);
const MAX_TRACKED_TASKS=64,MAX_QUEUE_ROWS=1024;
const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const serviceKey=discovery=>JSON.stringify([discovery?.baseUrl,discovery?.pid,discovery?.serviceId,discovery?.token]);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function taskState(task,kind){
 if(!record(task)||!validId(task.id)||typeof task.state!=='string')throw Error('kernel-task-status-malformed');
 if(kind==='queue'){
  if(['queued','running'].includes(task.state))return 'active';
  // completed is published before cleanup, then published with phase completed.
  // A final cacheCleanupWarning is historical and does not mean work is active.
  if(task.state==='completed')return task.phase==='completed'?'terminal':task.phase==='cleanup'?'active':'unknown';
  if(['failed','canceled'].includes(task.state))return 'terminal';
 }else{
  if(task.state==='running')return 'active';
  if(['complete','failed','cancelled'].includes(task.state))return 'terminal';
 }
 return 'unknown';
}
export class KernelSession {
  constructor({kernel,root,storage,runtimePath,stateRoot=path.join(root,'kernel'),readRuntimeStartup}){Object.assign(this,{kernel,root,storage,runtimePath,stateRoot,readRuntimeStartup});this.child=null;this.discovery=null;this._tasks=new Map();this._inFlight=0;this._activityRevision=0;this._activityProblem=null;this._everStarted=false;this._stopping=false;this._novelStartsInFlight=0;}
  async start(){
    if(this.discovery)return;if(this.starting)return this.starting;
    this._everStarted=true;this._activityRevision++;this.starting=this._start();try{await this.starting;}finally{this.starting=null;this._activityRevision++;}
  }
  async _start(){
    const terre=path.join(this.root,'host'),state=this.stateRoot;
    await fs.mkdir(path.join(terre,'public','assets'),{recursive:true});await fs.mkdir(path.join(state,'user-data'),{recursive:true});
    const config={stateDir:state,gamesRoot:path.join(this.root,'games'),terreDir:terre,outputDir:path.join(this.root,'output'),workDir:path.join(this.root,'work'),
      allowedOrigins:[],modules:['exporter','subtitles','generativeAI','musicTimeline'],importLegacyUserData:false,autoRefreshAiModels:false,automaticBackups:false,requireRuntimeParity:true,runtimePath:this.runtimePath||'',servicePort:0};
    for(const dir of [config.gamesRoot,config.outputDir,config.workDir])await fs.mkdir(dir,{recursive:true});
    const file=path.join(state,'config.json');await fs.writeFile(file,JSON.stringify(config));
    this.child=spawn(this.kernel,['service','--config',file],{cwd:path.dirname(this.kernel),windowsHide:true,stdio:'ignore'});
    let startError;this.child.once('error',e=>{startError=e;this._activityProblem||='kernel-service-lost';this._activityRevision++;});
    this.child.once('exit',()=>{this._activityProblem||='kernel-service-lost';this._activityRevision++;});
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
  get activityRevision(){return this._activityRevision;}
  _rememberActivity(endpoint,data,result,attempt){
    const kind=data!==undefined&&STARTS.get(endpoint);
    if(kind){
      if(!record(result)||!validId(result.id)){this._activityProblem||='kernel-start-outcome-unknown';return;}
      if(attempt.serviceKey!==serviceKey(this.discovery)){this._activityProblem||='kernel-service-identity-changed';return;}
      // AiNovelTasks permits only one active novel, and clears its prior status
      // ledger on successful start. Same-service acceptance proves that prior
      // singleton ended even if cancellation stopped the UI's final polling.
      if(kind==='novel')for(const [key,task] of this._tasks)if(task.kind==='novel'&&task.serviceKey===attempt.serviceKey)this._tasks.delete(key);
      const key=kind+':'+result.id;
      if(!this._tasks.has(key)&&this._tasks.size>=MAX_TRACKED_TASKS){this._activityProblem||='kernel-task-tracking-limit';return;}
      this._tasks.set(key,{kind,id:result.id,serviceKey:attempt.serviceKey});
    }
    const observed=STATUS.get(endpoint);
    if(data!==undefined&&observed&&record(result)&&result.id===data?.id){
      try{if(taskState(result,observed)==='terminal'&&this._tasks.get(observed+':'+result.id)?.serviceKey===attempt.serviceKey)this._tasks.delete(observed+':'+result.id);}catch{}
    }
    if(data===undefined&&endpoint==='/api/jobs'&&Array.isArray(result)&&result.length<=MAX_QUEUE_ROWS){
      try{const seen=new Set(),terminal=[];for(const job of result){const state=taskState(job,'queue');if(seen.has(job.id)||state==='unknown')return;seen.add(job.id);if(state==='terminal')terminal.push('queue:'+job.id);}for(const key of terminal)if(this._tasks.get(key)?.serviceKey===attempt.serviceKey)this._tasks.delete(key);}catch{}
    }
  }
  async request(params){
    this._inFlight++;this._activityRevision++;const attempt={dispatched:false,responseComplete:false};
    try{const result=await this._request(params,attempt);this._rememberActivity(params.endpoint,params.data,result,attempt);return result;}
    catch(error){if(attempt.dispatched){if(params?.data!==undefined&&STARTS.has(params?.endpoint))this._activityProblem||='kernel-start-outcome-unknown';else if(!attempt.responseComplete)this._activityProblem||='kernel-request-outcome-unknown';}throw error;}
    finally{if(attempt.novelStart)this._novelStartsInFlight--;this._inFlight--;this._activityRevision++;}
  }
  async _request({endpoint,data,snapshotId},attempt){
    const method=data===undefined?'GET':'POST';
    if(!(method==='GET'?GET:POST).has(endpoint)&&!(method==='GET'&&/^\/api\/timing\/[a-f0-9-]{36}$/.test(endpoint))&&!(method==='POST'&&/^\/api\/jobs\/[a-f0-9-]{36}\/cancel$/.test(endpoint)))throw Error('service-operation-denied');
    const body=data===undefined?undefined:{...data};
    if(body&&['/api/jobs','/api/timing','/api/music/duration','/api/ai/novel/start'].includes(endpoint)){const s=this.storage.get(snapshotId);
      if(['/api/jobs','/api/timing'].includes(endpoint)){const base=s.runtimeVersion??(s.runtimeId==='open-webgal.webgal'?s.engineVersion:undefined);const official=s.runtimeId==='open-webgal.webgal'&&['4.6.4','4.6.5'].includes(s.engineVersion)&&base===s.engineVersion;const mygo=s.runtimeId==='webgal-mygo.mygo'&&s.engineVersion==='3.2.1'&&base==='4.6.4';if(!official&&!mygo)throw Error(`当前工程引擎 ${s.runtimeId||'未知'} ${s.engineVersion||'未知'}（基础 WebGAL ${base||'未知'}）不在已验证精确档位内；支持 WebGAL 4.6.4 / 4.6.5、MyGO 3.2.1（基础 WebGAL 4.6.4），未回退到其他引擎。请检查 Craft 工程的引擎绑定`);body.expectedRuntimeVersion=s.engineVersion;body.expectedRuntimeId=s.runtimeId;body.expectedWebgalVersion=base;body.settings={...(body.settings||{}),engine:mygo?'mygo':'webgal'};delete body.runtimeStartup;const startup=await this.readRuntimeStartup?.(s);if(startup)body.runtimeStartup=startup;}body.project=s.id;}
    await this.start();attempt.serviceKey=serviceKey(this.discovery);
    // Overlapping singleton starts can return out of order. Receipt arrival must
    // not retire a newer active novel using a delayed older start response.
    if(method==='POST'&&endpoint==='/api/ai/novel/start'){attempt.novelStart=true;if(this._novelStartsInFlight++)this._activityProblem||='kernel-concurrent-start-outcomes';}
    attempt.dispatched=true;const response=await fetch(this.discovery.baseUrl+endpoint,{method,headers:{Authorization:'Bearer '+this.discovery.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
    const result=await response.json();attempt.responseComplete=true;if(!response.ok)throw Error(result.error||'kernel-request-failed');return result;
  }
  async readUpdateActivity(){
    const result=(known,hasBlockingTasks,reason,activeJobs=this._tasks.size)=>({known,hasBlockingTasks,coverage:'known-kernel-work-only',universalIdle:false,inFlight:this._inFlight,activeJobs,revision:this.activityRevision,...(reason?{reason}:{})});
    if(this._inFlight||this.starting)return result(true,true,'kernel-request-in-flight');
    if(this._activityProblem)return result(false,true,this._activityProblem);
    if(this._stopping)return result(false,true,'kernel-service-stopping');
    // Merely opening the updater must not create a kernel or background process.
    if(!this._everStarted&&!this.child&&!this.discovery)return result(true,false,undefined,0);
    const discovery=this.discovery,child=this.child,revision=this.activityRevision;
    const identity=discovery&&{baseUrl:discovery.baseUrl,token:discovery.token,pid:discovery.pid,serviceId:discovery.serviceId};
    const unchanged=()=>this.activityRevision===revision&&!this._inFlight&&!this._stopping&&!this._activityProblem&&this.discovery===discovery&&this.child===child&&child?.pid===identity?.pid&&child?.exitCode===null&&!child.signalCode&&Object.keys(identity||{}).every(key=>discovery[key]===identity[key]);
    try{
      if(!identity||!child||child.exitCode!==null||child.signalCode||!Number.isSafeInteger(child.pid)||identity.pid!==child.pid||typeof identity.token!=='string'||!identity.token||typeof identity.serviceId!=='string'||!identity.serviceId)throw Error('kernel-service-identity-unavailable');
      const url=new URL(identity.baseUrl);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('kernel-service-identity-unavailable');
      if(this._tasks.size>MAX_TRACKED_TASKS)throw Error('kernel-task-tracking-limit');
      const signal=AbortSignal.timeout(10000),tasks=[...this._tasks.entries()];
      const query=async(endpoint,data)=>{
        const response=await fetch(identity.baseUrl+endpoint,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+identity.token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal});
        if(!response.ok)throw Error('kernel-activity-status-unavailable');return response.json();
      };
      const queue=await query('/api/jobs');if(!Array.isArray(queue)||queue.length>MAX_QUEUE_ROWS)throw Error('kernel-queue-status-malformed');
      const states=new Map();let active=0;
      for(const job of queue){const state=taskState(job,'queue');if(states.has(job.id)||state==='unknown')throw Error('kernel-queue-status-unknown');states.set(job.id,state);if(state==='active')active++;}
      const terminal=[];
      for(const [key,task] of tasks){
        if(task.serviceKey!==serviceKey(identity))throw Error('kernel-task-service-changed');
        let state;
        if(task.kind==='queue'){state=states.get(task.id);if(!state)throw Error('kernel-tracked-job-missing');}
        else{const value=await query(task.kind==='novel'?'/api/ai/novel/status':'/api/subtitles/status',{id:task.id});if(value?.id!==task.id)throw Error('kernel-task-identity-changed');state=taskState(value,task.kind);if(state==='unknown')throw Error('kernel-task-status-unknown');if(state==='active')active++;}
        if(state==='terminal')terminal.push(key);
      }
      if(!unchanged())return result(false,true,'kernel-activity-changed');
      for(const key of terminal)this._tasks.delete(key);
      if(terminal.length)this._activityRevision++;
      return result(true,active>0,active?'kernel-background-tasks':undefined,active);
    }catch(error){return result(false,true,unchanged()?String(error.message||'kernel-activity-unavailable'):'kernel-activity-changed');}
  }
  async stop(){this._stopping=true;this._activityRevision++;if(this.discovery)await fetch(this.discovery.baseUrl+'/api/shutdown',{method:'POST',headers:{Authorization:'Bearer '+this.discovery.token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(3000)}).catch(()=>{});
    if(this.child&&this.child.exitCode===null){await Promise.race([new Promise(r=>this.child.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(this.child.exitCode===null)this.child.kill();}this.discovery=null;
  }
}

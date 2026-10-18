import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fileHash(file){const h=crypto.createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
export async function safeChild(root,relative,{missing=false}={}) {
  if(typeof relative!=='string'||!relative||/[\\:\0]/.test(relative)||relative.startsWith('/')||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('invalid-relative-path');
  const real=await fs.realpath(root);let current=real;
  for(const part of relative.split('/')){current=path.join(current,part);try{const stat=await fs.lstat(current);if(stat.isSymbolicLink())throw Error('linked-path-denied');}catch(e){if(e.code!=='ENOENT'||!missing)throw e;}}
  return current;
}
export class SessionStorage {
  constructor(root){this.root=root;this.snapshots=new Map();this.metadataWrites=new Set();this.retainedSnapshots=[];this.servicePids=[];}
  async fingerprint(roots,{withSize=false,skipGit=true}={}){const manifest=[];let bytes=0;const walk=async(dir,prefix)=>{
    for(const item of await fs.readdir(dir,{withFileTypes:true})){if(skipGit&&item.name==='.git')continue;if(item.isSymbolicLink())throw Error('source-link-denied');
      const p=path.join(dir,item.name),name=prefix+'/'+item.name;if(item.isDirectory())await walk(p,name);else if(item.isFile()){
        const st=await fs.stat(p);bytes+=st.size;if(bytes>32*1024**3||manifest.length>200000)throw Error('project-snapshot-budget');manifest.push([name,st.size,await fileHash(p)]);
      }else throw Error('source-special-file');}
    };for(let i=0;i<roots.length;i++)await walk(roots[i],String(i));manifest.sort((a,b)=>a[0].localeCompare(b[0]));const hash=sha(JSON.stringify(manifest));return withSize?{hash,bytes}:hash;}
  async allocate(project,sources=[],engineVersion,runtimeId,runtimeVersion){
    if(!project||typeof project.id!=='string'||typeof project.path!=='string'||!path.isAbsolute(project.path))throw Error('invalid-project');
    if(this.snapshots.size+(this.allocationsInFlight||0)>=64)throw Error('等待中的工程快照过多，请先完成或移除现有任务');
    this.allocationsInFlight=(this.allocationsInFlight||0)+1;try{
    const projectRoot=await fs.realpath(project.path), id=crypto.randomUUID(),site=path.join(this.root,'games',id);
    await fs.mkdir(path.dirname(site),{recursive:true});
    const roots=[...new Set(await Promise.all(sources.map(p=>fs.realpath(p))))];
    if(!roots.includes(projectRoot))throw Error('source-project-missing');
    const fingerprint=await this.fingerprint(roots,{withSize:true}),sourceHash=fingerprint.hash;
    const disk=await fs.statfs(this.root);if(Number(disk.bavail)*Number(disk.bsize)<fingerprint.bytes+256*1024**2)throw Error('可用空间不足以创建工程快照');
    if([...this.snapshots.values()].reduce((n,s)=>n+(s.sourceBytes||0),fingerprint.bytes)>32*1024**3)throw Error('工程快照空间已达上限');
    this.snapshots.set(id,{id,site,project:{id:project.id,path:projectRoot},engineVersion,runtimeVersion:runtimeVersion??(runtimeId==='open-webgal.webgal'?engineVersion:undefined),runtimeId,roots,sourceHash,sourceBytes:fingerprint.bytes,ready:false});
    await this.saveLedger();return {snapshotId:id,site};
    }finally{this.allocationsInFlight--;}
  }
  async ready(id){const s=this.snapshots.get(id);if(!s||s.ready)throw Error('unknown-snapshot');
    const st=await fs.lstat(s.site);if(st.isSymbolicLink()||!st.isDirectory())throw Error('invalid-snapshot');
    const manifest=[];let bytes=0;
    if(s.runtimeId&&s.engineVersion){
      const descriptor=await safeChild(s.site,'webgal-engine.json',{missing:true});
      const identity={id:s.runtimeId,version:s.engineVersion,webgalVersion:s.runtimeVersion};
      if(!identity.webgalVersion)throw Error('绑定引擎缺少基础 WebGAL 版本，请重新打开工程');
      // Craft may omit this descriptor when materializing its VFS. Reconstruct
      // only missing metadata; never overwrite contradictory exported identity.
      const existing=await fs.readFile(descriptor,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(existing!==null){const actual=JSON.parse(existing);if(Object.keys(identity).some(key=>actual[key]!==identity[key]))throw Error('导出快照的引擎描述与当前工程绑定不一致');}
      else await fs.writeFile(descriptor,JSON.stringify(identity),{flag:'wx'});
    }
    // WebVideo's export music metadata is independent of Craft's own playable-game
    // materialization policy. Include exactly this owned feature file when present.
    const music=await this.metadata({project:s.project,file:'video-project.json',fallback:null});
    if(music!==null){JSON.parse(music);const target=await safeChild(s.site,'video-project.json',{missing:true});await fs.writeFile(target,music);}
    const walk=async(dir,rel='')=>{for(const item of await fs.readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('snapshot-link-denied');const file=path.join(dir,item.name),name=rel+item.name;
      if(item.isDirectory())await walk(file,name+'/');else if(item.isFile()){const stat=await fs.stat(file);bytes+=stat.size;if(bytes>32*1024**3)throw Error('snapshot-too-large');manifest.push([name,stat.size,await fileHash(file)]);if(manifest.length>100000)throw Error('snapshot-too-large');}else throw Error('snapshot-special-file');}};
    await walk(s.site);if(!manifest.some(x=>x[0]==='index.html')||!manifest.some(x=>x[0].startsWith('game/scene/')))throw Error('not-webgal-snapshot');
    if(await this.fingerprint(s.roots)!==s.sourceHash)throw Error('source-changed-during-snapshot');
    manifest.sort((a,b)=>a[0].localeCompare(b[0]));s.hash=sha(JSON.stringify(manifest));s.ready=true;s.cleanupHash=sha(JSON.stringify(manifest.map(([name,size,hash])=>['0/'+name,size,hash])));await this.saveLedger();
    return {snapshotId:id,site:s.site,projectId:s.project.id,dependencyHash:s.hash};
  }
  get(id){const s=this.snapshots.get(id);if(!s?.ready)throw Error('snapshot-not-ready');return s;}
  async listBackups(project){const dir=await safeChild(project.path,'.webvideo-plus/backups',{missing:true});let entries;
    try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return[];throw e;}
    const result=[];for(const entry of entries.slice(0,2000)){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
      const file='.webvideo-plus/backups/'+entry.name;try{const data=JSON.parse(await this.metadata({project,file}));result.push({file,name:entry.name,label:data.label||data.kind||entry.name,kind:data.kind||'scene',createdAt:data.createdAt||''});}catch(e){result.push({file,name:entry.name,error:e.message});}}
    return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  async captureStory(snapshotId,project){const s=this.get(snapshotId);if(s.project.id!==project.id||await fs.realpath(project.path)!==s.project.path)throw Error('snapshot-project-mismatch');
    const files=[],dir=path.join(s.site,'game','scene');const walk=async(p,rel='game/scene/')=>{for(const item of await fs.readdir(p,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('snapshot-link-denied');if(item.isDirectory())await walk(path.join(p,item.name),rel+item.name+'/');else if(item.name.endsWith('.txt'))files.push({path:rel+item.name,source:await fs.readFile(path.join(p,item.name),'utf8')});}};await walk(dir);
    const id=crypto.randomUUID(),file='.webvideo-plus/backups/story-'+id+'.json',value={schemaVersion:1,kind:'storySet',id,label:'Craft 全故事快照',projectId:project.id,createdAt:new Date().toISOString(),dependencyHash:s.hash,files};
    await this.metadata({project,file,text:JSON.stringify(value),create:true},true);return {file,...value};
  }
  async captureStoryText(project,files,slot){if(slot!==undefined&&!['automatic-open','automatic-ten-minute'].includes(slot))throw Error('invalid-backup-slot');if(!Array.isArray(files)||!files.length||files.length>10000)throw Error('invalid-story-snapshot');const seen=new Set();for(const f of files){if(typeof f.source!=='string'||!f.path?.startsWith('game/scene/')||!f.path.endsWith('.txt')||seen.has(f.path))throw Error('invalid-story-file');await safeChild(project.path,f.path,{missing:true});seen.add(f.path);}
    const id=slot||crypto.randomUUID(),file='.webvideo-plus/backups/'+(slot||'story-'+id)+'.json',value={schemaVersion:1,kind:'storySet',id,label:slot==='automatic-open'?'打开项目时的故事快照':slot?'最近十分钟故事快照':'Craft 全故事快照',projectId:project.id,createdAt:new Date().toISOString(),files};
    const before=slot?await this.metadata({project,file,fallback:null}):null;
    await this.metadata({project,file,text:JSON.stringify(value),create:before===null,expectedText:before},true);return {file,...value};}
  async pinSnapshot(id,task){const snapshot=this.get(id);Object.assign(snapshot,{preserve:true,...task});await this.saveLedger();}
  async recoverPrevious(queue){return SessionStorage.recoverSessions(path.dirname(this.root),{queue});}
  async trackService(pid){this.serviceStarted=true;if(pid===undefined)this.servicePids=[];if(Number.isSafeInteger(pid)&&pid>0&&!this.servicePids.includes(pid))this.servicePids.push(pid);await this.saveLedger();}
  async saveLedger(){
    const write=async()=>{const file=path.join(this.root,'owned-snapshots.json'),temp=file+'.'+crypto.randomUUID()+'.tmp';
      try{const handle=await fs.open(temp,'wx');try{await handle.writeFile(JSON.stringify({schemaVersion:1,ownerPid:this.ownerPid??process.pid,serviceStarted:this.serviceStarted===true,servicePids:this.servicePids,snapshots:[...this.retainedSnapshots,...[...this.snapshots.values()].map(s=>({id:s.id,site:s.site,ready:s.ready,cleanupHash:s.cleanupHash,preserve:s.preserve,kind:s.kind,taskId:s.taskId}))]}));await handle.sync();}finally{await handle.close();}await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}};
    this.ledgerWrite=(this.ledgerWrite||Promise.resolve()).catch(()=>{}).then(write);return this.ledgerWrite;
  }
  async close({preserveTasks=false}={}){const retained=[];for(const id of [...this.snapshots.keys()])try{if(preserveTasks&&this.snapshots.get(id).preserve)continue;await this.discard(id);}catch(error){retained.push({snapshotId:id,message:error.message});}return retained;}
  static async recoverSessions(directory,{queue}={}){
    const entries=await fs.readdir(directory,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});const retained=[];
    for(const entry of entries){if(!entry.isDirectory()||entry.isSymbolicLink()||!/^[a-f0-9-]{36}$/.test(entry.name))continue;
      const root=await fs.realpath(path.join(directory,entry.name)),file=path.join(root,'owned-snapshots.json');
      try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1048576)continue;const ledger=JSON.parse(await fs.readFile(file,'utf8'));
        if(ledger.schemaVersion!==1||!Number.isSafeInteger(ledger.ownerPid)||ledger.ownerPid<=0||!Array.isArray(ledger.snapshots)||ledger.snapshots.length>64)continue;
        try{process.kill(ledger.ownerPid,0);continue;}catch(e){if(e.code!=='ESRCH')continue;}
        const pids=ledger.servicePids;if(ledger.serviceStarted===true){
          if(!Array.isArray(pids)||!pids.length||pids.length>2||pids.some(pid=>!Number.isSafeInteger(pid)||pid<=0))continue;
          let live=false;for(const pid of pids)try{process.kill(pid,0);live=true;}catch(e){if(e.code!=='ESRCH')live=true;}if(live)continue;
        }
        if(ledger.snapshots.some(s=>s?.preserve)&&queue===undefined){retained.pending=true;continue;}
        if(queue!==undefined&&(!Array.isArray(queue)||queue.length>1024||queue.some(job=>!job||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(job.id)||!['queued','running','completed','canceled','failed','needs_attention'].includes(job.state))||new Set(queue.map(job=>job.id)).size!==queue.length)){retained.pending=true;continue;}
        const storage=new SessionStorage(root);storage.ownerPid=ledger.ownerPid;for(const s of ledger.snapshots){
          if(s?.preserve){
            if(s.kind!=='queue'){storage.retainedSnapshots.push(s);continue;}
            const references=queue.filter(job=>job.id===s.taskId||typeof job.project==='string'&&path.resolve(job.project).toLowerCase()===path.resolve(s.site).toLowerCase());
            if(references.some(job=>job.state!=='completed'||job.phase!=='completed')){storage.retainedSnapshots.push(s);retained.pending=true;continue;}
          }
          if(!s||!/^[a-f0-9-]{36}$/.test(s.id)||s.site!==path.join(root,'games',s.id)||!s.ready||!/^[a-f0-9]{64}$/.test(s.cleanupHash||'')){storage.retainedSnapshots.push(s);continue;}storage.snapshots.set(s.id,s);}
        if(storage.snapshots.size){await storage.close().then(warnings=>retained.push(...warnings));}
      }catch(e){if(e.code!=='ENOENT')retained.push({session:entry.name,message:e.message});}
    }return retained;
  }
  async discard(id){const s=this.snapshots.get(id);if(!s)throw Error('unknown-owned-snapshot');
    const parent=await fs.realpath(path.join(this.root,'games'));if(path.dirname(s.site)!==parent)throw Error('snapshot-owner-mismatch');
    const stat=await fs.lstat(s.site).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(stat?.isSymbolicLink())throw Error('snapshot-link-denied');if(stat&&s.cleanupHash&&await this.fingerprint([s.site],{skipGit:false})!==s.cleanupHash)throw Error('snapshot-content-changed');if(stat)await fs.rm(s.site,{recursive:true});this.snapshots.delete(id);await this.saveLedger();
  }
  async metadata({project,file,text,expectedText,create=false,fallback=null},write=false){
    if(!project?.path||!path.isAbsolute(project.path))throw Error('invalid-project');
    // Reads support actual project assets; writes are explicitly scoped to adapter metadata.
    if(write&&!(/^\.webvideo-plus\/(?:[\w.-]+\/)*[\w.-]+\.json$/.test(file)||file==='video-project.json'))throw Error('metadata-write-denied');
    if(!write&&!(/^(?:game\/|\.webvideo-plus\/)/.test(file)||file==='video-project.json'))throw Error('metadata-read-denied');
    const target=await safeChild(project.path,file,{missing:true});
    if(!write){try{const stat=await fs.stat(target);if(stat.size>16*1024*1024)throw Error('file-too-large');return await fs.readFile(target,'utf8');}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
    if(typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024)throw Error('metadata-size');
    JSON.parse(text);if(this.metadataWrites.has(target))throw Error('metadata-busy');this.metadataWrites.add(target);
    try{const current=await fs.readFile(target,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(current!==null&&(expectedText===undefined||expectedText!==current))throw Error('metadata-conflict');if(current===null&&!create)throw Error('metadata-missing');if(create&&current!==null)throw Error('metadata-already-exists');
      await fs.mkdir(path.dirname(target),{recursive:true});await safeChild(project.path,file,{missing:true});
      const temp=target+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,text,{flag:'wx'});
      try{await safeChild(project.path,file,{missing:true});const latest=await fs.readFile(target,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(latest!==current)throw Error('metadata-conflict');await fs.rename(temp,target);}finally{await fs.rm(temp,{force:true});}
      return {saved:true};
    }finally{this.metadataWrites.delete(target);}
  }
}

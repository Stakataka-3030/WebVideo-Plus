/* Uses Terre's existing file API and editor buffers. Project files are plain JSON. */
const WebVideoProject=((terreApi)=>{
 const C=window.WebVideoProjectCore,listeners=new Set();let scope=null,project=C.metadata(),music={schemaVersion:1,enabled:false,tracks:[]},loadError='',busy=false,loading=false,localQueue=Promise.resolve();
 const nativeSaves=new Map(),nativeEdit=terreApi.assetsControllerEditTextFile;
 terreApi.assetsControllerEditTextFile=function(body,...rest){const promise=nativeEdit.call(this,body,...rest),path=body?.path;if(path&&promise?.then){const set=nativeSaves.get(path)||new Set();nativeSaves.set(path,set);set.add(promise);promise.then(()=>set.delete(promise),()=>set.delete(promise));}return promise;};
 const changed=()=>{listeners.forEach(fn=>fn());window.WebVideoPlus?.changed();};
 const url=path=>'/'+path.split('/').map(encodeURIComponent).join('/')+'?wvp='+Date.now();
 async function read(path,missing=null){const r=await fetch(url(path),{cache:'no-store'});if(r.status===404)return missing;if(!r.ok)throw Error('读取失败：'+path);return r.text();}
 async function post(endpoint,data){const r=await fetch('/api/assets/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const text=await r.text();if(!r.ok||/path error|no right|failed/i.test(text))throw Error('Terre 保存失败：'+text.slice(0,180));try{return JSON.parse(text);}catch{return text;}}
 async function write(path,text,{create=false}={}){
  if(create&&await read(path,null)===null){const at=path.lastIndexOf('/');await post('createNewFile',{source:path.slice(0,at),name:path.slice(at+1)});}
  await post('editTextFile',{path,textFile:text});const saved=await read(path,null);if(saved!==text)throw Error('保存后的内容校验不符：'+path);
 }
 async function json(path,fallback){const text=await read(path,null);if(text===null)return fallback;try{return JSON.parse(text);}catch{throw Error('项目配置无法解析，请先恢复备份：'+path);}}
 function projectPath(rel,at=scope){if(!at)throw Error('请先打开项目');return at.root+'/'+C.safePath(rel);}
 const musicPath=at=>projectPath('video-project.json',at);
 function sameScene(path){return scope&&path.startsWith(scope.root+'/game/scene/')&&!path.split('/').some(p=>p==='..')&&!path.includes('%');}
 const withLock=fn=>{const at=scope,key=at?.root;if(!key)return Promise.reject(Error('请先打开项目'));const guarded=()=>{if(scope!==at)throw Error('项目已切换，请重新打开工具');return fn();};if(navigator.locks)return navigator.locks.request('webvideo-project:'+key,guarded);const next=localQueue.then(guarded,guarded);localQueue=next.catch(()=>{});return next;};
 async function currentDisk(snapshot){
  if(!window.WebVideoPlus.validateSelection(snapshot))throw Error('剧本或选区已变化，请重新预览影响');
  await window.WebVideoPlus.flushEditor?.();
  const saves=nativeSaves.get(snapshot.path);if(saves?.size)await Promise.race([Promise.all([...saves]),new Promise((_,reject)=>setTimeout(()=>reject(Error('等待 Terre 保存超时，请稍后再试')),10000))]);
  for(let n=0;n<12;n++){if(!window.WebVideoPlus.validateSelection(snapshot))throw Error('剧本已变化，请重新预览影响');const disk=await read(snapshot.path,null);if(disk!==null&&C.norm(disk)===C.norm(snapshot.source))return disk;await new Promise(r=>setTimeout(r,100));}
  throw Error('编辑缓冲区与文件不一致，请等待 Terre 保存或重新打开剧本后再试');
 }
 const api={
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  state(){return {scope,project,music,error:loadError,busy,loading};},
  async activate(game){if(game&&(/[\\/%]/.test(game)||game==='.'||game==='..'))throw Error('项目路径无效');if(scope?.game===game)return;scope=game?{game,root:'games/'+game}:null;project=C.metadata();music={schemaVersion:1,enabled:false,tracks:[]};loadError='';const at=scope;loading=!!at;changed();if(!at)return;try{const m=await json(musicPath(at),{enabled:false,tracks:[]});if(scope===at){music=C.musicProject(m);loading=false;changed();}}catch(e){if(scope===at){loadError=e.message;loading=false;changed();}}},
  async update(mutator){return withLock(async()=>{const at=scope,p=C.metadata(JSON.parse(JSON.stringify(project)));const next=mutator(p)||p;if(scope===at){project=next;changed();}return next;});},
  parse(text){return parseScene(text);},
  model(path,text){return window.WebVideoTimelineCore.derive(path,text,parseScene(text),commandType);},
  writer(row,{content=row.content,args={}}={}){
   const parsed=parseScene(row.source).sentenceList.find(s=>!s.isLineBreakHolder);if(!parsed)throw Error('语句无法解析');
   const speakerArg=parsed.args.find(a=>a.key==='speaker');let command=parsed.commandRaw;
   if(row.command==='say')command=speakerArg?String(speakerArg.value):command==='say'?undefined:command;
   const originalArgs=parsed.args.filter(a=>row.command!=='say'||a.key!=='speaker');
   const result=combineSubmitString(command,C.escapeText(content),originalArgs,Object.entries(args).map(([key,value])=>({key,value})),parsed.inlineComment||'');
   if(/[\r\n]/.test(result))throw Error('第 '+row.startLine+' 行的单条语句仍含换行，已停止写入。');
   return result;
  },
  plan(selection,operation){const model=window.WebVideoPlus.state().model;return C.makePlan(model,selection,operation,project,{parse:parseScene,write:api.writer});},
  async commit(plan,label='批量操作'){
   return withLock(async()=>{if(busy)throw Error('上一项操作仍在执行');busy=true;changed();const at=scope;
    try{
     const model=window.WebVideoPlus.state().model;if(!model||model.path!==plan.path||model.source!==plan.before||!sameScene(plan.path))throw Error('剧本已变化，请重新预览影响');
     if(plan.after===plan.before)throw Error('没有需要应用的修改');parseScene(plan.after);
     const snapshot={path:model.path,source:model.source,revision:model.revision},beforeDisk=await currentDisk(snapshot);
     const id=crypto.randomUUID(),backupPath=projectPath('.webvideo-plus/backups/'+id+'.json',at),backup={schemaVersion:1,id,label,path:plan.path,createdAt:new Date().toISOString(),before:beforeDisk,after:plan.after};
     await write(backupPath,JSON.stringify(backup,null,2),{create:true});
     if(!window.WebVideoPlus.validateSelection(snapshot)||C.norm(await read(plan.path,null))!==C.norm(beforeDisk))throw Error('保存备份期间剧本发生变化，未覆盖原文');
     const afterDisk=beforeDisk.includes('\r\n')?C.norm(plan.after).replace(/\n/g,'\r\n'):plan.after;
     await write(plan.path,afterDisk);window.WebVideoPlus.replaceBuffer(plan.path,C.norm(plan.after));
     if(plan.reviewOffsets?.length)window.WebVideoPlus.markForReview(plan.path,C.norm(plan.after),plan.reviewOffsets.map(offset=>C.norm(plan.after.slice(0,offset)).length));
     if(['idize','restore','expressionPrep','batchFilter','batchNext','autoExit','filterEdit','presetEffect','novelImport','importAnogo'].includes(plan.operation?.type)){changed();return {backupPath,changed:plan.changed};}
     let warning='';try{const p=C.metadata(JSON.parse(JSON.stringify(project)));p.backups.unshift({id,label,path:plan.path,file:backupPath,createdAt:backup.createdAt});p.backups=p.backups.slice(0,200);const afterModel=api.model(plan.path,C.norm(plan.after));if(plan.operation?.type!=='restore')p.markers.push(...C.generatedMarkers(afterModel,{...plan,patches:plan.patches.map(p=>({...p,startOffset:C.norm(plan.before.slice(0,p.startOffset)).length,endOffset:C.norm(plan.before.slice(0,p.endOffset)).length,after:C.norm(p.after)}))},id));if(scope===at)project=p;}catch(e){warning='剧本已应用，备份文件已保存，但项目索引更新失败：'+e.message;}
     changed();return {id,backupPath,warning,changed:plan.changed??plan.patches?.length??1};
    }finally{busy=false;changed();}
   });
  },
  async listBackups(){
   const at=scope;if(!at)return [];const directory=projectPath('.webvideo-plus/backups',at);let listing;
   try{listing=(await terreApi.assetsControllerReadAssets(directory)).data;}catch(e){if(e?.status===404||e?.response?.status===404)return [];throw e;}
   const files=(Array.isArray(listing?.dirInfo)?listing.dirInfo:[]).filter(item=>typeof item.name==='string'&&item.name.endsWith('.json')&&!/[\\/]/.test(item.name)),entries=[];
   for(let offset=0;offset<files.length;offset+=4){const batch=await Promise.all(files.slice(offset,offset+4).map(async info=>{const file=directory+'/'+info.name;try{const data=await json(file,null);if(!data||typeof data.before!=='string'||typeof data.path!=='string')throw Error('备份格式不完整');const scenePrefix=at.root+'/game/scene/';if(data.kind==='storySet'?data.path!==at.root+'/game/scene':data.kind==='music'?data.path!==musicPath(at):!data.path.startsWith(scenePrefix))throw Error('备份目标不属于当前项目');C.safePath(data.path.slice(at.root.length+1));return {id:data.id||info.name,file,path:data.path,kind:data.kind||'scene',label:data.label||'历史备份',createdAt:data.createdAt||'',scene:data.kind==='storySet'?'全部故事（'+(Number(data.fileCount)||0)+' 个 TXT）':data.kind==='music'?'音乐时间线':data.path.slice(scenePrefix.length)};}catch(error){return {id:info.name,file,label:info.name,createdAt:'',error:error.message};}}));entries.push(...batch);}
   if(scope!==at)throw Error('项目已切换，请重新打开恢复面板');return entries.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||a.file.localeCompare(b.file));
  },
  async restoreStories(item){return withLock(async()=>{const at=scope;busy=true;changed();try{await window.WebVideoPlus.flushEditor?.();const pending=[...nativeSaves].filter(([path])=>path.startsWith(at.root+'/game/scene/')).flatMap(([,set])=>[...set]);if(pending.length)await Promise.all(pending);if(scope!==at)throw Error('项目已切换，回滚已取消');const result=await api.service('/api/backups/restore-stories',{project:at.game,file:item.file.split('/').pop(),expectedCreatedAt:item.createdAt});for(const path of result.files||[]){if(!path.startsWith(at.root+'/game/scene/'))throw Error('恢复目标无效');const text=await read(path,null);if(text!==null)window.WebVideoPlus.replaceBuffer(path,C.norm(text));}return result;}finally{busy=false;changed();}});},
  async readBackup(item){if(!scope||!item.file.startsWith(scope.root+'/.webvideo-plus/backups/'))throw Error('备份不属于当前项目');C.safePath(item.file.slice(scope.root.length+1));return json(item.file,null);},
  restorePlan(backup){const model=window.WebVideoPlus.state().model;if(!model||backup.path!==model.path)throw Error('请先打开备份对应的场景');if(typeof backup.before!=='string')throw Error('备份内容无效');return {path:model.path,before:model.source,after:C.norm(backup.before),changed:1,patches:[{startOffset:0,endOffset:model.source.length,before:model.source,after:C.norm(backup.before)}],warnings:[],operation:{type:'restore'}};},
  async createScene(name,script){
   name=C.safePath(name);if(!name.endsWith('.txt'))name+='.txt';const at=scope,file=projectPath('game/scene/'+name,at);if(await read(file,null)!==null)throw Error('场景已存在，请换一个文件名');parseScene(script);await write(file,script,{create:true});return {file,name};
  },
  async saveMusic(value){const next=C.musicProject(value);return withLock(async()=>{const at=scope,before=await read(musicPath(at),null),id=crypto.randomUUID(),file=projectPath('.webvideo-plus/backups/music-'+id+'.json',at),createdAt=new Date().toISOString();await write(file,JSON.stringify({schemaVersion:1,kind:'music',id,path:musicPath(at),createdAt,before:before||JSON.stringify({schemaVersion:1,enabled:false,tracks:[]}),after:next},null,2),{create:true});await write(musicPath(at),JSON.stringify(next,null,2),{create:true});if(scope===at){music=next;changed();}let warning='';try{const p=C.metadata(JSON.parse(JSON.stringify(project)));p.backups.unshift({id,kind:'music',label:'音乐时间线',path:musicPath(at),file,createdAt});p.backups=p.backups.slice(0,200);if(scope===at){project=p;changed();}}catch(e){warning='音乐已保存，但备份索引更新失败。备份文件：'+file+'。'+e.message;}return {...next,warning};});},
  async uploadAudio(file){if(!scope)throw Error('请先打开项目');if(file.size>128*1024*1024)throw Error('单个音频不能超过 128 MB');const ext=file.name.split('.').pop().toLowerCase();if(!['wav','mp3','ogg','flac','m4a','aac','webm','opus'].includes(ext))throw Error('不支持此音频格式');const name='wvp-'+crypto.randomUUID()+'.'+ext;const target=projectPath('game/bgm');const data=new FormData();data.append('targetDirectory',target);data.append('files',file,name);const response=await fetch('/api/assets/upload',{method:'POST',body:data});if(!response.ok)throw Error('导入音频失败');return {file:'game/bgm/'+name,label:file.name,url:url(target+'/'+name)};},
  assetUrl(file){return url(projectPath(C.safePath(file)));},
  async sha(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');},
  async service(endpoint,data){const discovery=await (await fetch('/assets/video-export-service.json',{cache:'no-store'})).json();const base=new URL(discovery.baseUrl);if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname))throw Error('导出服务地址不是本机地址');const response=await fetch(base.origin+base.pathname.replace(/\/$/,'')+endpoint,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+discovery.token,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await response.json();if(!response.ok)throw Error(result.error||'导出服务请求失败');return result;},
  async preview(snapshot,line){await currentDisk(snapshot);const row=api.model(snapshot.path,snapshot.source).statements.find(s=>s.startLine<=line&&s.endLine>=line);if(!row)throw Error('找不到预览语句');EditorPreviewClient.ensureConnected();await new Promise(resolve=>setTimeout(resolve,250));const sent=EditorPreviewClient.sendSyncScene({scenePath:snapshot.path,lineNumber:row.endLine,lineCommandString:row.source,force:true,settleMode:'immediate'});if(!sent)throw Error('预览尚未连接，请打开 Terre 的侧边预览后重试');window.WebVideoPlus.jump(row,{preview:false});return row;},
  read,write,json,projectPath
 };window.WebVideoProject=api;return api;
})(api);
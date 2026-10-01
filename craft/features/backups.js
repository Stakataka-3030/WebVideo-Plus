/* Restore controller: native editor transactions for scenes, CAS for owned metadata.
 * A storySet is a saved VFS snapshot, not an atomic multi-document undo transaction. */
(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fail=message=>{throw Error(message);};
  function sameProject(a,b){if(a.projectId!==b.projectId||a.projectPath!==b.projectPath)fail('工程已切换，恢复已取消');}
  function sameScene(a,b){sameProject(a,b);for(const k of ['path','revision','source'])if(a[k]!==b[k])fail('目标场景或未保存内容已变化，请重新恢复');}
  function scenePath(path,snapshot){
    if(typeof path!=='string')fail('备份缺少场景路径');
    let value=path.replaceAll('\\','/');const prefix=String(snapshot.projectPath).replaceAll('\\','/').replace(/\/$/,'')+'/';
    if(value.startsWith(prefix))value=value.slice(prefix.length);
    if(!value.startsWith('game/scene/')||!value.endsWith('.txt')||/[\x00-\x1f:%?*"<>|]/.test(value)||value.split('/').some(s=>!s||s==='.'||s==='..'))fail('备份场景不属于当前工程');
    return value;
  }
  function validate(backup,snapshot){
    if(!backup||typeof backup!=='object'||Array.isArray(backup))fail('备份格式无效');
    if(backup.schemaVersion!==undefined&&backup.schemaVersion!==1)fail('备份版本不兼容');
    if(backup.projectId!==undefined&&backup.projectId!==snapshot.projectId)fail('备份属于其他工程');
    if(backup.projectPath!==undefined&&String(backup.projectPath).replaceAll('\\','/').replace(/\/$/,'')!==String(snapshot.projectPath).replaceAll('\\','/').replace(/\/$/,''))fail('备份路径属于其他工程');
    if(backup.kind==='storySet'){
      if(!Array.isArray(backup.files)||!backup.files.length||backup.files.length>10000)fail('故事快照没有有效的场景');
      const paths=new Set();let total=0;
      for(const file of backup.files){const path=scenePath(file.path,snapshot);if(paths.has(path)||typeof file.source!=='string'||file.source.length>16*1024*1024)fail('故事快照包含重复路径或无效内容');paths.add(path);total+=file.source.length;}
      if(total>128*1024*1024)fail('故事快照过大');
    } else if(backup.kind!=='music'){
      scenePath(backup.path,snapshot);const source=backup.before??backup.source;
      if(typeof source!=='string'||source.length>16*1024*1024)fail('场景备份正文无效');
    }
    return backup;
  }
  function createController(bridge,options={}){
    let busy=false;
    const uuid=options.uuid||(()=>root.crypto.randomUUID());
    async function snapshot(){const s=await bridge.snapshot();if(!s?.projectId||!s.projectPath)fail('请打开当前工程场景');return clone(s);}
    async function load(item,captured){const value=(typeof item==='string'||item?.file)?await bridge.readBackup(item):clone(item);sameProject(captured,await snapshot());if(item&&typeof item==='object'&&item.createdAt!==undefined&&item.createdAt!==value?.createdAt)fail('自动备份已更新，请重新读取并确认');return validate(value,captured);}
    async function run(action){if(busy)fail('备份或恢复正在执行');busy=true;try{return await action();}finally{busy=false;}}
    async function saveBackup(captured,value){
      sameProject(captured,await snapshot());const file='.webvideo-plus/backups/restore-'+uuid()+'.json';
      await bridge.writeProjectFile(file,JSON.stringify({schemaVersion:1,projectId:captured.projectId,projectPath:captured.projectPath,createdAt:new Date().toISOString(),...value},null,2),{create:true});
      sameProject(captured,await snapshot());return file;
    }
    return Object.freeze({
      async list(){const captured=await snapshot(),rows=await bridge.listBackups();sameProject(captured,await snapshot());if(!Array.isArray(rows))fail('备份列表无效');return clone(rows);},
      async read(item){const captured=await snapshot();return clone(await load(item,captured));},
      async captureStory(){return run(async()=>{const captured=await snapshot(),result=await bridge.captureStorySnapshot();sameProject(captured,await snapshot());return {...result,notice:'全故事快照读取已保存的 VFS 文件；未保存编辑仍留在编辑器中',atomicRestore:false};});},
      async restoreScene(item,{scenePath:chosen,confirmed=false}={}){
        if(!confirmed)fail('恢复会替换目标场景的当前编辑内容，请明确确认');
        return run(async()=>{
          const captured=await snapshot(),backup=await load(item,captured);if(backup.kind==='music')fail('请选择场景备份');
          let path,source;
          if(backup.kind==='storySet'){
            if(!chosen)fail('全故事快照须明确选择一个场景逐个恢复，不支持跨文件原子恢复');
            path=scenePath(chosen,captured);const entry=backup.files.find(f=>scenePath(f.path,captured)===path);if(!entry)fail('所选场景不在该快照中');source=entry.source;
          }else{path=scenePath(backup.path,captured);source=backup.before??backup.source;if(chosen&&scenePath(chosen,captured)!==path)fail('场景选择与备份不匹配');}
          sameProject(captured,await snapshot());
          const target=await bridge.openScene(path.slice('game/scene/'.length));
          sameProject(captured,target);if(scenePath(target.path,captured)!==path)fail('宿主打开了不同的目标场景');
          sameScene(target,await snapshot());
          if(target.source===source)return {changed:false,path,atomicRestore:false,message:'当前场景与备份一致'};
          const safetyBackup=await saveBackup(target,{kind:'scene',label:'恢复前当前编辑内容',path:target.path,before:target.source});
          sameScene(target,await snapshot());
          const result=await bridge.commit({snapshot:clone(target),after:source,label:'恢复备份：'+(backup.label||path)});
          return {...result,path,safetyBackup,atomicRestore:false,message:'已恢复所选场景到编辑缓冲区，可撤销，未自动保存；其他场景未改动'};
        });
      },
      async restoreMusic(item,{confirmed=false}={}){
        if(!confirmed)fail('恢复会替换当前音乐配置，请明确确认');
        return run(async()=>{
          const captured=await snapshot(),backup=await load(item,captured);if(backup.kind!=='music')fail('请选择音乐配置备份');
          if(typeof backup.before!=='string')fail('该备份没有原音乐配置；不能将缺失文件伪装为可恢复配置');
          let value;try{value=JSON.parse(backup.before);}catch{fail('备份中的音乐配置 JSON 无效');}
          const normalize=options.normalizeMusic||root.WebVideoCraftMedia?.normalizeMusic;if(!normalize)fail('音乐配置校验模块未加载');normalize(value);
          const before=await bridge.readProjectFile('video-project.json',null);sameProject(captured,await snapshot());
          if(before===backup.before)return {changed:false,message:'音乐配置与备份一致'};
          const safetyBackup=await saveBackup(captured,{kind:'music',label:'恢复前音乐配置',before});
          sameProject(captured,await snapshot());
          await bridge.writeProjectFile('video-project.json',backup.before,{expectedText:before,create:before===null});
          return {changed:true,safetyBackup,message:'音乐配置已通过版本校验恢复；请重新读取音乐面板，未覆盖面板内未保存草稿'};
        });
      },
      startAutomatic({onState=()=>{},clock=()=>Date.now(),setTimeout:later=root.setTimeout,clearTimeout:clear=root.clearTimeout}={}){
        let stopped=false,timer=null,checking=false,scope=null,openNeeded=true,lastTenSlot=null,queued=false;
        const notify=value=>{try{onState(value);}catch{}};
        const slot=()=>{const d=new Date(clock());d.setMinutes(Math.floor(d.getMinutes()/10)*10,0,0);return d.getTime();};
        const schedule=()=>{if(stopped)return;const d=new Date(clock());d.setMinutes(Math.floor(d.getMinutes()/10)*10+10,0,0);timer=later(()=>{timer=null;void tick();},Math.max(1000,Math.min(60000,d.getTime()-clock())));};
        async function tick(){
          if(stopped)return;if(checking){queued=true;return;}checking=true;
          try{
            const captured=await snapshot();if(stopped)return;
            const project=captured.projectId+'|'+captured.projectPath;
            if(project!==scope){scope=project;openNeeded=true;lastTenSlot=slot();}
            if(busy)return;
            const nowSlot=slot(),kind=openNeeded?'automatic-open':nowSlot!==lastTenSlot?'automatic-ten-minute':null;
            if(!kind)return;
            const result=await run(()=>bridge.captureStorySnapshot({slot:kind}));
            const latest=await snapshot();
            if(stopped||latest.projectId!==captured.projectId||latest.projectPath!==captured.projectPath)return;
            if(kind==='automatic-open')openNeeded=false;else lastTenSlot=nowSlot;
            notify({state:'captured',file:result.file,projectId:captured.projectId,slot:kind,savedFilesOnly:true});
          }catch(e){if(!stopped)notify({state:'failed',message:e.message});}
          finally{checking=false;if(timer!==null)clear(timer);if(queued&&!stopped){queued=false;timer=later(()=>{timer=null;void tick();},0);}else schedule();}
        }
        const unsubscribe=bridge.subscribe?.(()=>{if(!stopped)void tick();});
        void tick();
        return ()=>{stopped=true;if(timer!==null)clear(timer);unsubscribe?.();};
      },
      state:()=>({busy,atomicRestore:false}),
    });
  }
  root.WebVideoCraftBackups={createController};
  if(typeof module!=='undefined'&&module.exports)module.exports={createController};
})(globalThis);

(function(root){
  'use strict';
  const usable=x=>x&&x.status==='created'&&x.availability==='available';
  root.WebVideoCraftResolveProject=async function(game,invoke){
    const names=await indexedDB.databases();if(!names.some(x=>x.name==='WebGALCraft'))throw Error('Craft 项目数据库不存在');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('WebGALCraft');r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('拒绝创建未知项目数据库'));};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const all=table=>new Promise((resolve,reject)=>{const tx=db.transaction(table,'readonly'),r=tx.objectStore(table).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{
      const [games,engines,templates]=await Promise.all(['games','engines','templates'].map(all));
      const recorded=games.find(x=>x.id===game.id);if(!recorded||recorded.path!==game.path)throw Error('工程注册记录已变化');
      const config=await invoke('read_project_config_cmd',{projectPath:game.path});
      const byRef=ref=>{const matches=engines.filter(x=>ref?.version!==undefined&&x.engineId===ref.id&&x.version===ref.version);if(matches.length>1)throw Error('引擎引用不唯一，请在 Craft 中修复绑定');return matches[0];};
      const engine=engines.find(x=>x.id===recorded.engineId)||byRef(config?.engine);
      if(!usable(engine))throw Error('当前引擎未就绪，请在 Craft 中修复绑定');
      const version=engine.metadata?.webgalVersion?.trim(),parts=/^(\d+)\.(\d+)\.(\d+)$/.exec(version||'');
      if(!parts||Number(parts[1])<4||Number(parts[1])===4&&(Number(parts[2])<6||Number(parts[2])===6&&Number(parts[3])<2))throw Error('该引擎版本尚未通过 Craft 适配验证（需要稳定版 4.6.2 或更高）');
      let templatePath;
      if(config?.engine){
        if(!config.template)templatePath=engine.path.replace(/[\\/]$/,'')+'/game/template';
        else if(config.template.kind==='engineBuiltin'){const t=byRef(config.template.engine);if(!usable(t))throw Error('绑定模板引擎不可用');templatePath=t.path.replace(/[\\/]$/,'')+'/game/template';}
        else if(config.template.kind==='standalone'){const matches=templates.filter(x=>x.metadata?.name===config.template.name&&x.status==='created');if(matches.length!==1||!usable(matches[0]))throw Error('模板缺失或绑定不唯一');templatePath=matches[0].path;}
        else throw Error('当前模板类型尚未适配');
      }
      return {enginePath:engine.path,templatePath,engineVersion:engine.version,runtimeVersion:version,engineId:engine.id};
    }finally{db.close();}
  };
})(globalThis);

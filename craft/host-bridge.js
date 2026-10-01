/* Craft beta.2 adapter. Uses host stores, never Terre's file-first editing path. */
(function (root) {
  'use strict';
  function createBridge({ getStores, invoke, rpc, registry, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
    const subscribers = new Set(); let committing = false, subscriptionTimer, lastObserved, binding, activeHint;
    const fail = message => { throw new Error(message); };
    const normal = p => String(p).replaceAll('\\', '/').replace(/\/$/, '');
    const relative = p => {
      if (typeof p !== 'string' || !p || /[\\:\0]/.test(p) || p.startsWith('/') || p.split('/').some(x => !x || x === '.' || x === '..')) fail('工程相对路径无效');
      return p;
    };
    function context() {
      const s = getStores(), game = s.workspace?.currentGame;
      if (!game?.id || !game.path || !s.editor || !s.tabs || !s.file) fail('Craft 编辑器桥尚未就绪，请打开工程');
      return { ...s, game, projectPath: normal(game.path) };
    }
    function assertContext(c) {
      const now = context();
      if (now.game.id !== c.game.id || now.projectPath !== c.projectPath) fail('工程已切换，请重新操作');
      return now;
    }
    async function refreshBinding(){if(!registry)return;const c=context(),resolved=await registry(c.game,invoke);assertContext(c);binding={projectId:c.game.id,projectPath:c.projectPath,engineId:c.game.engineId,resolved,signature:JSON.stringify(resolved)};}
    function snapshotSync() {
      const c = context(), path = c.tabs.activeTab?.path, state = path && c.editor.getTextProjectionState(path);
      if (!path || state?.kind !== 'scene' || typeof state.textContent !== 'string') fail('请打开可编辑的场景剧本');
      const normalized = normal(path), prefix = c.projectPath + '/game/scene/';
      if (!normalized.startsWith(prefix) || !normalized.endsWith('.txt')) fail('活动文档不属于当前工程场景');
      const revision = c.editor.peekSceneRevision(path);
      if (typeof revision !== 'string') fail('当前宿主没有可验证的场景版本');
      const selected = c.editor.getSceneSelection?.(path), lines = state.textContent.split('\n');
      const line = Math.max(1, Math.min(lines.length, selected?.lastLineNumber || 1));
      let start = 0; for (let i = 0; i < line - 1; i++) start += lines[i].length + 1;
      const resolved=binding?.projectId===c.game.id&&binding.projectPath===c.projectPath&&binding.engineId===c.game.engineId?binding:undefined;
      const parts=resolved?.resolved.runtimeVersion?.split('.').map(Number),newSyntax=!!parts&&(parts[0]>4||parts[0]===4&&(parts[1]>6||parts[1]===6&&parts[2]>=5));
      return { projectId:c.game.id, projectPath:c.projectPath, path, source:state.textContent, revision,engineId:c.game.engineId,runtimeBindingSignature:resolved?.signature,
        sceneRelativePath:normalized.slice(prefix.length), selection:{start,end:start + lines[line - 1].length},
        selectionKind:'native-current-line', line, runtimeCapabilities:{...state.runtimeCapabilities,...(resolved?{changeFigureDiff:newSyntax,transformFrom:newSyntax}:{})} };
    }
    function validateSnapshot(expected) {
      const now = snapshotSync();
      for (const key of ['projectId','projectPath','path','source','revision','engineId','runtimeBindingSignature']) if (now[key] !== expected?.[key]) fail('剧本、版本或工程已变化，请重新预览');
      return now;
    }
    function changed() { for (const fn of subscribers) { try { fn(); } catch {} } }
    const bridge = {
      snapshot:async()=>{await refreshBinding();return snapshotSync();},
      async commit({snapshot,after,label='WebVideo+ 批量编辑'}) {
        if (committing) fail('上一项编辑仍在执行');
        if (typeof after !== 'string' || after.length > 16 * 1024 * 1024) fail('剧本大小无效');
        await refreshBinding();if(committing)fail('上一项编辑仍在执行');validateSnapshot(snapshot); if (after === snapshot.source) return {revision:snapshot.revision,changed:false};
        committing = true;
        try {
          // Craft's exposed store has no history-boundary API. Require >300ms revision quiet
          // before every batch, so two replace-all transactions cannot merge in native history.
          const started=now(); await sleep(350);
          if(now()-started<310) fail('系统时钟已变化，请重新预览后再提交');
          await refreshBinding();
          validateSnapshot(snapshot);
          const c = context();
          // No await between final revision/content check and native transaction.
          if (!c.editor.replaceTextDocumentContent(snapshot.path, after, {source:'external'})) fail('Craft 拒绝了编辑事务');
          const result = snapshotSync();
          if (result.source !== after) fail('Craft 编辑结果与预期不同，请检查并撤销');
          changed(); return {revision:result.revision,changed:true,label};
        } finally { committing = false; }
      },
      async undo() { const c=context(), s=snapshotSync(); c.editor.undoDocument(s.path); changed(); },
      async redo() { const c=context(), s=snapshotSync(); c.editor.redoDocument(s.path); changed(); },
      async readScene(path) {
        const c=context(), full=normal(path).startsWith(c.projectPath+'/game/scene/') ? path : c.projectPath+'/game/scene/'+relative(path);
        if (!normal(full).startsWith(c.projectPath+'/game/scene/') || /\/\.\.?\//.test(normal(full))) fail('场景路径无效');
        const open=c.editor.getTextProjectionState(full);
        if(open?.kind==='scene') return open.textContent;
        const data=await c.editor.readTextDocumentFile(full); assertContext(c);
        if(typeof data.content!=='string') fail('场景文本格式无法识别'); return data.content;
      },
      async listScenes() {
        const c=context(), result=[], queue=[c.projectPath+'/game/scene']; let count=0;
        while(queue.length) {
          if(++count>10000) fail('场景目录过大');
          const items=await c.file.getFolderContents(queue.shift()); assertContext(c);
          for(const item of items) {
            const p=normal(item.path); if(!p.startsWith(c.projectPath+'/game/scene/')) fail('宿主返回了工程外路径');
            if(item.isDir) queue.push(item.path);
            else if(p.endsWith('.txt')) result.push({path:item.path,name:p.slice((c.projectPath+'/game/scene/').length)});
          }
        } return result;
      },
      async navigate(line) {
        await bridge.cancelHintPreview();
        const c=context(), s=snapshotSync();
        if(!Number.isInteger(line)||line<1||line>s.source.split('\n').length) fail('行号无效');
        c.editor.syncSceneSelectionFromTextLine(s.path,line);changed();
      },
      async preview(line) {
        const c=context(), s=snapshotSync(); await bridge.navigate(line); assertContext(c);
        validateSnapshot(s);
        if(typeof c.editor.syncScenePreview!=='function') fail('宿主未提供场景预览');
        await c.editor.syncScenePreview(s.path,line,s.source.split('\n')[line-1],true);
      },
      subscribe(fn) {subscribers.add(fn);if(!subscriptionTimer)subscriptionTimer=setInterval(()=>{
        let state;try{const c=context(),p=c.tabs.activeTab?.path;state=JSON.stringify([c.game.id,p,p&&c.editor.peekSceneRevision(p),p&&c.editor.getSceneSelection?.(p)]);}catch(e){state=e.message;}
        if(state!==lastObserved){lastObserved=state;if(activeHint){try{const current=snapshotSync();if(current.projectId!==activeHint.projectId||current.path!==activeHint.path||current.revision!==activeHint.revision)void bridge.cancelHintPreview();}catch{void bridge.cancelHintPreview();}}changed();}
      },400);return()=>{subscribers.delete(fn);if(!subscribers.size){clearInterval(subscriptionTimer);subscriptionTimer=null;}};},
      capabilities() {
        try {const c=context();return {snapshot:true,commit:true,undo:true,redo:true,listScenes:true,readScene:true,navigate:true,
          preview:typeof c.editor.syncScenePreview==='function',readProjectFile:!!rpc,writeProjectFile:!!rpc,
          exportVideo:!!rpc,service:!!rpc,parseScene:false,measureTimeline:false,projectFiles:!!rpc,music:!!rpc,timing:!!rpc,
          previewSettings:!!rpc&&!!c.previewSession?.currentGameServeUrl,previewHint:!!rpc&&!!c.previewSession?.currentGameServeUrl&&typeof c.previewSync?.sendPreviewCommand==='function',audioImport:typeof invoke==='function',backups:!!rpc,ai:!!rpc,coordinatedUpdate:false};}
        catch(e){return {snapshot:false,commit:false,reason:e.message};}
      },
      async readProjectFile(file,fallback=null){const c=context();relative(file);
        if(file.startsWith('game/')){try{const result=await c.editor.readTextDocumentFile(c.projectPath+'/'+file);assertContext(c);return result.content;}catch(e){throw Error('工程资源读取失败：'+e.message);}}
        return rpc('metadata.read',{project:{id:c.game.id,path:c.projectPath},file,fallback});},
      async writeProjectFile(file,text,options={}){const c=context();relative(file);return rpc('metadata.write',{expectedText:options.expectedText,create:options.create===true,project:{id:c.game.id,path:c.projectPath},file,text});},
      async service(endpoint,data){const c=context();let snapshotId;
        if(endpoint==='/api/music/duration'){const file=relative(data?.file);if(!/^game\/(bgm|vocal)\//.test(file))fail('音乐必须位于工程音频目录');const physicalPath=await c.file.resolveFilePath(c.projectPath+'/'+file);assertContext(c);return rpc('audio.duration',{project:{id:c.game.id,path:c.projectPath},file,physicalPath});}
        const document=['/api/timing','/api/jobs'].includes(endpoint)?await bridge.snapshot():null;
        if(document&&data?.sourceText!==undefined&&(data.sourceText!==document.source||data.scene!==document.sceneRelativePath))fail('导出或计时请求的剧本已经变化，请重新预览');
        if(data!==undefined&&['/api/timing','/api/jobs','/api/music/duration','/api/ai/novel/start'].includes(endpoint))snapshotId=(await bridge.exportSnapshot()).snapshotId;
        if(document){await refreshBinding();validateSnapshot(document);}
        assertContext(c);return rpc('service.request',{project:{id:c.game.id,path:c.projectPath},endpoint,data,snapshotId});},
      async cancelJob(jobId){return rpc('job.cancel',{jobId});},
      async exportVideo(options){const before=await bridge.snapshot();if(options?.sourceText!==undefined&&(options.sourceText!==before.source||options.scene!==before.sceneRelativePath))fail('导出选区已变化，请重新预览');
        const snap=await bridge.exportSnapshot();await refreshBinding();validateSnapshot(before);return rpc('export.start',{snapshotId:snap.snapshotId,options});},
      async exportSnapshot(){
        const c=context();
        if(c.editor.hasUnsavedDocuments) fail('请先保存 Craft 中所有文档，再进行导出或实际时间测量');
        if(!registry) fail('当前宿主缺少可验证的项目注册表');
        const project=await registry(c.game,invoke); assertContext(c);
        const revisions=()=>JSON.stringify(c.editor.collectDocumentPathsUnder(c.projectPath).map(path=>[path,c.editor.peekSceneRevision(path)]).sort());
        const before=revisions();
        const allocation=await rpc('snapshot.allocate',{project:{id:c.game.id,path:c.projectPath},engineVersion:project.runtimeVersion,runtimeId:project.runtimeId,sources:[c.projectPath,project.enginePath,project.templatePath].filter(Boolean)});
        assertContext(c); if(c.editor.hasUnsavedDocuments) fail('整理工程前出现未保存文档');
        const finish=c.runtimeTask?.beginBlockingTask('webvideo-snapshot-'+allocation.snapshotId);
        try {
          await invoke('export_web',{exportId:allocation.snapshotId,gamePath:c.projectPath,enginePath:project.enginePath,
            templatePath:project.templatePath,outputPath:allocation.site,gameName:c.game.metadata?.name||'WebGAL',replaceExisting:false});
          assertContext(c);if(c.editor.hasUnsavedDocuments||revisions()!==before) fail('整理工程期间剧本发生变化，请保存后重试');
          return await rpc('snapshot.ready',{snapshotId:allocation.snapshotId});
        } catch(e){await rpc('snapshot.discard',{snapshotId:allocation.snapshotId}).catch(()=>{});throw e;}
        finally{finish?.();}
      },
      async timingDependencyHash(){const c=context(),snapshot=await bridge.exportSnapshot();try{const url=c.previewSession?.currentGameServeUrl,startup=url?await rpc('preview.settings',{url,startup:true}):null;assertContext(c);return snapshot.dependencyHash+'|locale='+JSON.stringify(startup);}finally{await rpc('snapshot.discard',{snapshotId:snapshot.snapshotId});}},
      async listBackups(){const c=context();return rpc('backups.list',{project:{id:c.game.id,path:c.projectPath}});},
      async readBackup(item){const file=typeof item==='string'?item:item.file;if(!file?.startsWith('.webvideo-plus/backups/'))fail('备份路径无效');return JSON.parse(await bridge.readProjectFile(file));},
      async captureStorySnapshot({slot}={}){const c=context();if(c.editor.hasUnsavedDocuments)fail('请先保存文档，故事快照不会覆盖未保存内容');
        const revision=()=>JSON.stringify(c.editor.collectDocumentPathsUnder(c.projectPath).map(p=>[p,c.editor.peekSceneRevision(p)]).sort()),before=revision();
        const scenes=await bridge.listScenes(),files=[];for(const scene of scenes){assertContext(c);files.push({path:'game/scene/'+scene.name,source:await bridge.readScene(scene.path)});}
        for(let i=0;i<scenes.length;i++){if(await bridge.readScene(scenes[i].path)!==files[i].source)fail('捕获期间故事文件已变化，请稍后重试');}
        assertContext(c);if(c.editor.hasUnsavedDocuments||revision()!==before)fail('捕获期间文档已变化，请稍后重试');
        return rpc('backups.captureText',{project:{id:c.game.id,path:c.projectPath},files,slot});},
      async readPreviewSettings(){const c=context(),url=c.previewSession?.currentGameServeUrl;if(!url)fail('请先打开 Craft 当前项目的游戏预览');return rpc('preview.settings',{url});},
      async writePreviewSettings(values,{expected,projectId}={}){const c=context(),url=c.previewSession?.currentGameServeUrl;if(!url)fail('请先打开 Craft 当前项目的游戏预览');
        if(projectId!==undefined&&projectId!==c.game.id)fail('工程已切换');return rpc('preview.settings',{url,values,expected});},
      async openScene(path){const c=context(),full=normal(path).startsWith(c.projectPath+'/game/scene/')?path:c.projectPath+'/game/scene/'+relative(path);
        await bridge.cancelHintPreview();assertContext(c);
        if(!normal(full).startsWith(c.projectPath+'/game/scene/'))fail('场景路径无效');
        c.tabs.openTab(normal(full).split('/').pop(),full,{forceNormal:true,focus:true});
        for(let i=0;i<100;i++){assertContext(c);if(c.tabs.activeTab?.path===full&&c.editor.getTextProjectionState(full)?.kind==='scene')return snapshotSync();await sleep(50);}fail('等待场景载入超时');},
      async importAudio(){const c=context(),files=await invoke('plugin:dialog|open',{options:{multiple:true,directory:false,filters:[{name:'音频',extensions:['wav','mp3','ogg','flac','m4a','aac','webm','opus']}]}});assertContext(c);if(!files)return[];
        const result=[];for(const source of (Array.isArray(files)?files:[files])){assertContext(c);const ext=String(source).split('.').pop().toLowerCase();if(!['wav','mp3','ogg','flac','m4a','aac','webm','opus'].includes(ext))fail('音频格式不支持');
          const name='wvp-'+crypto.randomUUID()+'.'+ext;
          await c.file.ensureWritable(c.projectPath+'/game/bgm/'+name);assertContext(c);
          const actual=await invoke('import_external_entry',{source,targetDirectory:c.projectPath+'/game/bgm',preferredName:name,projectRoot:c.projectPath});
          assertContext(c);relative(actual);result.push({file:'game/bgm/'+actual,label:normal(source).split('/').pop()});
        }changed();return result;},
      async cancelHintPreview(){const old=activeHint;activeHint=null;if(!old)return {cancelled:false};old.cancelled=true;
        await rpc('preview.hint',{url:old.url,ticket:old.ticket,cancel:true}).catch(()=>{});return {cancelled:true};},
      async previewHint({line,key,duration}){await bridge.cancelHintPreview();const s=await bridge.snapshot(),c=context();
        if(c.editor.getTextProjectionState(s.path).isDirty)fail('请先保存当前场景，再预览计时提示');
        const model=root.WebVideoCraftScript?.parse(s.source,{path:s.path,capabilities:s.runtimeCapabilities});
        const hint=model&&root.WebVideoCraftScript.hintPairs(model).find(p=>p.valid&&p.choose.startLine===line&&p.key===key&&p.duration===duration);
        if(!hint)fail('请选择有效且未变化的成对单行提示');
        const url=c.previewSession?.currentGameServeUrl;if(!url||typeof c.previewSync?.sendPreviewCommand!=='function')fail('请先打开当前项目的 Craft 预览');
        const ticket=crypto.randomUUID(),record={ticket,url,projectId:s.projectId,path:s.path,revision:s.revision,cancelled:false};activeHint=record;
        const current=()=>{if(activeHint!==record||record.cancelled)fail('提示预览已取消');validateSnapshot(s);if(context().previewSession?.currentGameServeUrl!==url)fail('预览工程已变化');};
        try{current();await c.previewSync.sendPreviewCommand('preview.command.sync-scene',{sceneName:s.sceneRelativePath,sentenceId:Math.max(0,hint.choose.startLine-1),settleMode:'immediate'},{timeoutMs:10000});
          current();await c.previewSync.sendPreviewCommand('preview.command.run-snippet',{snippet:hint.choose.source},{timeoutMs:10000});current();
          return await rpc('preview.hint',{url,text:hint.text,key:hint.key,duration:hint.duration,ticket});
        }finally{if(activeHint===record)activeHint=null;}
      },
      _context:context, _invoke:invoke,
    };
    return Object.freeze(bridge);
  }
  root.WebVideoCraftCreateBridge=createBridge;
  if (typeof module !== 'undefined' && module.exports) module.exports={createBridge};
})(globalThis);

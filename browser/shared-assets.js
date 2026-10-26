const WebVideoSharedMaterials=(()=>{
 const enabled=__WEBVIDEO_SHARED_ENABLED__;
 let resourcePrefix=null;const exportsInFlight=new Map();
 const kinds={figure:'立绘 / Live2D',background:'背景',bgm:'背景音乐',vocal:'语音 / 音效',video:'视频'};
 async function request(endpoint,data,signal){
  try{const discovery=await WebVideoServiceErrors.readDiscovery((url,options)=>fetch(url,{...options,signal})),response=await fetch(new URL(endpoint,discovery.baseUrl),{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+discovery.token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:signal??AbortSignal.timeout(120000)});return await WebVideoServiceErrors.readResponse(response,{endpoint});}
  catch(error){if(error?.name==='AbortError')throw error;if(error?.name==='TimeoutError')throw WebVideoServiceErrors.create('service_timeout',error.message,{endpoint},error);throw WebVideoServiceErrors.requestError(error,{endpoint});}
 }
 function reference(id,file){return '__shared/'+id+'/'+file;}
 function file(kind,id,entry,url){return {...entry,path:url,isDir:false};}
 function thumbnailUrl(id,name){return resourcePrefix+id+'/'+name.split('/').map(x=>encodeURIComponent(x).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');}
 function isResourceUrl(value){return typeof value==='string'&&!!resourcePrefix&&value.startsWith(resourcePrefix);}
 async function resolve(kind,id,entry,signal){const result=await request('/api/shared/resolve',{kind,reference:reference(id,entry.path)},signal);if(!isResourceUrl(result.url))throw Error('共享素材地址无效，请刷新素材列表');return result.url;}
 function exportGame(project,platform){const key=project+'|'+platform;if(exportsInFlight.has(key))return exportsInFlight.get(key);const pending=request('/api/shared/export',{project,platform,requestId:crypto.randomUUID()},AbortSignal.timeout(1800000)).finally(()=>exportsInFlight.delete(key));exportsInFlight.set(key,pending);return pending;}
 function supported(value){return !/ -|[*#%&?@"<>|:;]/.test(value);}
  let readyPreview=null;const previewWaiters=new Set(),notifyPreview=()=>{for(const check of [...previewWaiters])check();};
  function previewFrame(project){try{const state=useEditorStore.getState(),frame=document.getElementById('gamePreviewIframe'),url=new URL(frame?.contentWindow?.location.href);if(state.subPage!==project||!state.isShowPreview||url.origin!==window.location.origin||!(decodeURIComponent(url.pathname)==='/games/'+project||decodeURIComponent(url.pathname).startsWith('/games/'+project+'/')))return null;return {frame,document:frame.contentDocument,project};}catch{return null;}}
  eventBus.on('editor-preview:ready',({ready})=>{readyPreview=ready?previewFrame(useEditorStore.getState().subPage):null;notifyPreview();});
  useEditorStore.subscribe((state,previous)=>{if(state.subPage!==previous.subPage||!state.isShowPreview){readyPreview=null;notifyPreview();}});
  window.addEventListener('message',event=>{if(event.data?.type==='webgal.preview.bootstrap.request'&&event.source===document.getElementById('gamePreviewIframe')?.contentWindow){readyPreview=null;notifyPreview();}});
  function waitPreview(project,signal){
   EditorPreviewClient.ensureConnected();
   return new Promise((resolve,reject)=>{
    let timer;const finish=error=>{clearTimeout(timer);previewWaiters.delete(check);signal.removeEventListener('abort',cancel);error?reject(error):resolve();},cancel=()=>finish(Object.assign(Error('预览已取消'),{name:'AbortError'}));
    const check=()=>{if(signal.aborted||useEditorStore.getState().subPage!==project||!useEditorStore.getState().isShowPreview)return cancel();const current=previewFrame(project);if(current&&readyPreview?.frame===current.frame&&readyPreview.document===current.document&&readyPreview.project===project&&EditorPreviewClient.getPreviewQueryCapabilityState()!=='unknown')finish();};
    if(signal.aborted)return cancel();previewWaiters.add(check);signal.addEventListener('abort',cancel,{once:true});
    try{window.WebVideoTools?.state()?.context?.showPreview?.();check();}catch(error){finish(error);}
    if(previewWaiters.has(check))timer=setTimeout(()=>finish(Error('预览尚未就绪，请检查预览窗口后重试')),15000);
   });
  }
  return {enabled,useFigureMetadata:WebVideoUseFigureMetadata,formatFigureReference:WebVideoFormatFigureReference,kinds,request,reference,file,supported,waitPreview,resolve,isResourceUrl,thumbnailUrl,exportGame,setResourcePrefix(value){resourcePrefix=value;}};
})();
function Assets(props){const root=props.rootPath??[],base=props.basePath??[],eligible=root[0]==='games'&&root[2]==='game'&&(!base.length||Object.hasOwn(WebVideoSharedMaterials.kinds,base[0]));return reactExports.createElement(eligible?WebVideoSharedAssets:WebVideoLocalAssets,eligible?{...props,key:root[1]+':'+base.join('/')}:props);}
function WebVideoSharedFileList({rootPath,entries,selected,onOpen,onCopy}){
 const R=reactExports,h=R.createElement,viewType=useEditorStore.use.viewType();
 return h('div',{style:{flex:1,minHeight:48,position:'relative'},'aria-label':'共享素材列表',role:'list'},h(AutoSizer,null,({height,width})=>{
  const columns=Math.max(1,Math.floor(width/(viewType==='grid'?96:192))),rowHeight=viewType==='grid'?width/columns:28;
  return h(FixedSizeList,{height,width,itemCount:Math.ceil(entries.length/columns),itemSize:rowHeight},({index,style})=>h('div',{style:{...style,display:'grid',gridTemplateColumns:`repeat(${columns},1fr)`}},entries.slice(index*columns,(index+1)*columns).map(file=>h('div',{key:file.path,'data-wvp-shared-entry':file.path,role:'listitem',tabIndex:0,onKeyDown:e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen(file);}},style:{minWidth:0}},h(FileElement,{rootPath,file,type:viewType,selected:selected?.path===file.originalPath,isProtected:true,desc:file.sourceScope,handleOpenFile:()=>onOpen(file),handleBackupFile:()=>onCopy(file),handleRenameFile:()=>{},handleDeleteFile:()=>{},checkHasFile:()=>false})))));
 }));
}
function WebVideoSharedAssets(props){
 if(!WebVideoSharedMaterials.enabled)return reactExports.createElement(WebVideoLocalAssets,props);
 const R=reactExports,h=R.createElement,M=WebVideoSharedMaterials,base=props.basePath??[],project=props.rootPath[1];const {mutate:refreshLocal}=useSWRConfig();
 const initial=/^(?:(?:figure|background|bgm|vocal|video)\/)?__shared\/([a-f0-9]+)\/(.*)$/.exec((props.selectedFilePath??[]).join('/'));
 const localProps={...props,...((props.selectedFilePath??[]).includes('__shared')?{selectedFilePath:[]}:{}),...(base.includes('__shared')?{basePath:base.slice(0,1)}:{})};
 const [localPath,setLocalPath]=R.useState(base),[libraries,setLibraries]=R.useState([]),[library,setLibrary]=R.useState(initial?.[1]||''),[folder,setFolder]=R.useState(initial?.[2]?.split('/').slice(0,-1).join('/')||''),[entries,setEntries]=R.useState([]),[selected,setSelected]=R.useState(null),[busy,setBusy]=R.useState(false),[error,setError]=R.useState(''),[notice,setNotice]=R.useState(''),[filter,setFilter]=R.useState(''),[refreshKey,setRefreshKey]=R.useState(0),[manage,setManage]=R.useState(false),[copyTargets,setCopyTargets]=R.useState(false),[expanded,setExpanded]=R.useState(null);
 const currentKind=Object.hasOwn(M.kinds,localPath[0])?localPath[0]:null,showShared=!localPath.length||!!currentKind,sharedExpanded=expanded??libraries.length>0;
 const viewType=useEditorStore.use.viewType(),updateViewType=useEditorStore.use.updateViewType(),sortBy=useEditorStore.use.sortBy(),sortOrder=useEditorStore.use.sortOrder();
 const generation=R.useRef(0),copying=R.useRef(false),pendingCopy=R.useRef(null),previewing=R.useRef(null),alive=R.useRef(true);
 R.useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;previewing.current?.abort();};},[]);
 const run=async action=>{if(copying.current)return;setError('');setNotice('');setBusy(true);try{return await action();}catch(e){if(alive.current&&e.name!=='AbortError')setError(WebVideoServiceErrors.describe(e));}finally{if(alive.current)setBusy(false);}};
 const refresh=async()=>{const result=await M.request('/api/shared/libraries');M.setResourcePrefix(result.resourcePrefix);if(alive.current){setLibraries(result.libraries);if(result.resourceError)setError(WebVideoServiceErrors.describe(Error(result.resourceError)));}return result.libraries;};
 R.useEffect(()=>{run(refresh);},[]);
 R.useEffect(()=>{if(!showShared||!sharedExpanded||!library)return;const current=++generation.current;setSelected(null);setEntries([]);setError('');const controller=new AbortController();M.request('/api/shared/list',{id:library,path:folder},controller.signal).then(result=>{if(current===generation.current&&alive.current)setEntries(result.entries);},e=>{if(e.name!=='AbortError'&&current===generation.current&&alive.current)setError(WebVideoServiceErrors.describe(e));});return()=>controller.abort();},[showShared,sharedExpanded,library,folder,refreshKey]);
 R.useEffect(()=>{previewing.current?.abort();setSelected(null);setCopyTargets(false);},[currentKind]);
 const active=libraries.find(l=>l.id===library),available=libraries.filter(l=>!currentKind||l.kind==='all'||l.kind===currentKind);
 R.useEffect(()=>{if(active&&currentKind&&active.kind!=='all'&&active.kind!==currentKind){setLibrary('');setFolder('');setSelected(null);}},[currentKind,active?.id]);
 const chooseLibrary=id=>{setLibrary(id);setFolder('');setSelected(null);setFilter('');setError('');setNotice('');setManage(false);setCopyTargets(false);};
 const add=()=>run(async()=>{const picked=await M.request('/api/shared/dialog',{});if(picked.canceled)return;const result=await M.request('/api/shared/add',{path:picked.path,kind:'all'});await refresh();setExpanded(true);chooseLibrary(result.id);});
 const referenceKind=entry=>currentKind||(active?.kind!=='all'&&active?.kind)||(/\.(?:mp3|wav|ogg|opus|m4a|aac|flac)$/i.test(entry?.path??'')?'vocal':/\.(?:mp4|webm|mov|mkv)$/i.test(entry?.path??'')?'video':'figure');
 const choose=async entry=>{if(!M.supported(entry.path))throw Error('文件名含剧本保留字符，请调整素材文件名后引用');const kind=referenceKind(entry),url=await M.resolve(kind,library,entry);if(alive.current)props.fileFunction?.open?.(M.file(kind,library,entry,url),'asset');};
 const copy=(entry=selected,kind=currentKind)=>{if(!entry||previewing.current)return;if(!kind){setCopyTargets(true);return;}return run(async()=>{copying.current=true;try{const signature=project+'|'+kind+'|'+library+'|'+entry.path,result=await M.request('/api/shared/copy',{requestId:(pendingCopy.current?.key===signature?pendingCopy.current:pendingCopy.current={key:signature,id:crypto.randomUUID()}).id,project,kind,reference:M.reference(library,entry.path)});pendingCopy.current=null;if(alive.current){setCopyTargets(false);setNotice('已复制到 '+kind+'/'+result.reference);setSelected({...entry,localReference:result.reference,localKind:kind});window.dispatchEvent(new CustomEvent('webvideo:shared-copied',{detail:{project,kind,reference:result.reference}}));await refreshLocal([...props.rootPath,kind].join('/'));}}finally{copying.current=false;}});};
 const preview=()=>{if(!selected||copying.current||previewing.current)return;const kind=referenceKind(selected),controller=new AbortController(),stopObserving=useEditorStore.subscribe((state,previous)=>{if(previous.isShowPreview&&!state.isShowPreview)controller.abort();});previewing.current=controller;return run(async()=>{const ref=M.reference(library,selected.path);if(!M.supported(ref))throw Error('文件名含剧本保留字符，请调整素材文件名后预览');const url=await M.resolve(kind,library,selected,controller.signal);if(!alive.current||controller.signal.aborted||useEditorStore.getState().subPage!==project)return;await M.waitPreview(project,controller.signal);if(!alive.current||controller.signal.aborted||useEditorStore.getState().subPage!==project)return;const commands={figure:'changeFigure',background:'changeBg',bgm:'bgm',vocal:'playEffect',video:'playVideo'};if(!EditorPreviewClient.setComponentVisibility({showStarter:false,showTitle:false,showMenuPanel:false,isEnterGame:true,isShowLogo:false})||!EditorPreviewClient.runSnippet(commands[kind]+':'+url+';'))throw Error('预览连接已断开，请重试');}).finally(()=>{stopObserving();if(previewing.current===controller)previewing.current=null;});};
 const displayEntries=R.useMemo(()=>{
  if(!library)return available.filter(l=>l.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(l=>({name:l.name,path:l.id,isDir:true,extName:'',sharedLibrary:l,sourceScope:l.kind==='all'?undefined:M.kinds[l.kind]}));
  const allowed=props.allowedExtNames??(currentKind?({figure:['.png','.jpg','.jpeg','.webp','.json'],background:['.png','.jpg','.jpeg','.webp','.mp4','.webm','.mkv'],bgm:['.mp3','.ogg','.wav','.opus'],vocal:['.mp3','.ogg','.wav','.opus'],video:['.mp4','.webm','.mkv']})[currentKind]:[]);
  const list=entries.filter(e=>(e.isDir||!allowed.length||allowed.includes(e.extName))&&e.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  list.sort((a,b)=>{if(a.isDir!==b.isDir)return a.isDir?-1:1;const order=sortOrder==='desc'?-1:1;if(sortBy==='size'&&!a.isDir)return order*((a.size??0)-(b.size??0));if(sortBy==='lastModified')return order*((a.lastModified??0)-(b.lastModified??0));return order*a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});});
  return list.map(e=>({...e,originalPath:e.path,path:referenceKind(e)+'/'+M.reference(library,e.path),...(!e.isDir?{webVideoResourceUrl:M.thumbnailUrl(library,e.path)}:{})}));
 },[entries,library,folder,filter,libraries,currentKind,props.allowedExtNames,sortBy,sortOrder]);
 const openEntry=file=>{if(busy)return;if(file.sharedLibrary){chooseLibrary(file.sharedLibrary.id);return;}setNotice('');setCopyTargets(false);if(file.isDir){setFolder(file.originalPath);setSelected(null);setFilter('');}else setSelected({...file,path:file.originalPath});};
 const button=(text,action,options={})=>h(Button,{size:'small',disabled:busy,onClick:()=>action(),...options},text),toolbar={display:'flex',gap:4,alignItems:'center',padding:4,flexWrap:'wrap'};
 return h('div',{'data-wvp-shared-assets':true,style:{display:'flex',flexDirection:'column',height:'100%',minHeight:0,overflow:'hidden'}},
  h('div',{'data-wvp-local-region':true,style:{flex:showShared&&sharedExpanded?'1 1 52%':'1 1 100%',minHeight:100,overflow:'hidden'}},h(WebVideoLocalAssets,{...localProps,webVideoPathChanged:setLocalPath})),
  showShared&&h('section',{'aria-label':'共享素材','data-wvp-shared-region':true,style:{display:'flex',flexDirection:'column',flex:sharedExpanded?'1 1 48%':'0 0 auto',minHeight:sharedExpanded?150:undefined,overflow:'hidden',background:'rgba(128,88,182,.055)',borderTop:'1px solid var(--border-color,rgba(128,88,182,.16))'}},
   h('div',{style:toolbar},button(sharedExpanded?'共享素材 ▾':'共享素材 ▸',()=>setExpanded(!sharedExpanded),{appearance:'subtle','aria-expanded':sharedExpanded,'aria-label':sharedExpanded?'收起共享素材':'展开共享素材',style:{fontSize:12,whiteSpace:'nowrap'}}),sharedExpanded&&h(Input,{size:'small',type:'search',value:filter,placeholder:'过滤文件','aria-label':'过滤共享素材',onChange:(_,d)=>setFilter(d.value),style:{flex:1,minWidth:80}}),sharedExpanded&&button(null,()=>{if(folder){setFolder(folder.split('/').slice(0,-1).join('/'));setSelected(null);}else chooseLibrary('');setFilter('');},{icon:h(ArrowLeftIcon$1),title:'上一级','aria-label':'共享素材上一级',disabled:busy||!library}),sharedExpanded&&button(null,()=>run(async()=>{await refresh();setRefreshKey(n=>n+1);} ),{icon:h(ArrowSyncIcon),title:'刷新','aria-label':'刷新共享素材'}),button(null,add,{icon:h(FolderAddIcon),title:'添加共享文件夹','aria-label':'添加共享文件夹'}),sharedExpanded&&button(null,()=>updateViewType(viewType==='grid'?'list':'grid'),{icon:h(viewType==='grid'?GridIcon:ListIcon),title:viewType==='grid'?'列表视图':'网格视图','aria-label':'切换共享素材视图'})),
   sharedExpanded&&active&&h('div',{style:{...toolbar,paddingTop:0,fontSize:12,color:'var(--text-weak)'}},h('span',{title:active.root,style:{flex:1,minWidth:0,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},active.name+(folder?' / '+folder:'')),h('span',null,'只读'),button('来源',()=>setManage(!manage),{appearance:'subtle'})),
   sharedExpanded&&manage&&active&&h('div',{style:{...toolbar,fontSize:12}},h('span',{style:{flex:'1 1 100%',overflowWrap:'anywhere'}},active.root),button('更换位置',()=>run(async()=>{const picked=await M.request('/api/shared/dialog',{initial:active.root});if(picked.canceled)return;await M.request('/api/shared/relocate',{id:library,path:picked.path});await refresh();setRefreshKey(n=>n+1);})),button('转换本项目旧引用',()=>run(async()=>{const result=await M.request('/api/shared/upgrade-project',{project});setNotice(result.changed?'已转换 '+result.changed+' 个文件，已保留备份':'本项目引用已是当前格式');})),button('取消登记',()=>run(async()=>{if(!window.confirm('取消登记“'+active.name+'”？已引用的素材将暂时不可用。'))return;await M.request('/api/shared/remove',{id:library});chooseLibrary('');setExpanded(null);await refresh();}))),
   sharedExpanded&&h(WebVideoSharedFileList,{rootPath:props.rootPath,entries:displayEntries,selected,onOpen:openEntry,onCopy:file=>{if(busy)return;const entry={...file,path:file.originalPath};setSelected(entry);copy(entry,currentKind);}}),
   sharedExpanded&&!displayEntries.length&&!busy&&h('div',{style:{padding:'4px 8px',fontSize:12,color:'var(--text-weak)'}},library?'当前文件夹为空':'添加共享文件夹'),
   sharedExpanded&&selected&&h('div',{style:toolbar},button('预览',preview),props.isProtected&&button('引用共享素材',()=>run(()=>choose(selected)),{appearance:'primary'}),!props.isProtected&&button('复制引用路径',()=>run(async()=>{await navigator.clipboard.writeText(await M.resolve(referenceKind(selected),library,selected));setNotice('引用路径已复制');})),button('复制到当前项目',()=>copy()),selected.localReference&&button(props.isProtected?'选择副本':'打开副本',()=>run(()=>props.fileFunction?.open?.({...selected,path:selected.localKind+'/'+selected.localReference,name:selected.localReference},'asset')))),
   sharedExpanded&&copyTargets&&selected&&h('div',{style:toolbar},h('span',{style:{fontSize:12}},'复制到'),Object.entries(M.kinds).map(([kind,label])=>button(label,()=>copy(selected,kind),{key:kind}))),
   notice&&h('div',{role:'status',style:{padding:'4px 8px',fontSize:12}},notice),error&&h('div',{role:'alert',style:{padding:'4px 8px',fontSize:12,color:'var(--danger,#b42318)',overflowWrap:'anywhere'}},h('div',null,error.summary),h('div',{style:{color:'var(--text-weak)',marginTop:4}},error.nextStep),h('details',null,h('summary',null,'技术详情'),h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'20vh',overflowY:'auto'}},error.technical))),busy&&h('div',{role:'status',style:{padding:'4px 8px',fontSize:12,color:'var(--text-weak)'}},'正在处理…')));
}

function WebVideoFormatFigureReference(value){
 if(typeof value!=='string')return value;
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname))return value;const match=/^\/webvideo-shared\/([a-f0-9]{32})\/([a-f0-9]{32})\/(.+)$/i.exec(url.pathname);if(!match)return value;const parts=match[3].split('/').map(part=>{try{return decodeURIComponent(part);}catch{return part;}}),name=parts.pop(),source=match[2].slice(0,4)+'…'+match[2].slice(-4);return name+' · 共享 '+source+(parts.length?' / '+parts.join(' / '):'');}catch{return value;}
}
function WebVideoFigureAddress({value}){
 return reactExports.createElement('span',{title:value,'data-wvp-figure-label':true,style:{display:'block',flex:'1 1 auto',minWidth:0,maxWidth:'100%',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},WebVideoFormatFigureReference(value));
}
function WebVideoFigureMetadataUrl(project,reference){return /^https?:\/\//i.test(reference)?reference:'/games/'+encodeURIComponent(project)+'/game/figure/'+reference;}
function WebVideoParseFigureMetadata(data){
 const sorted=values=>values.filter(value=>typeof value==='string').sort((a,b)=>a.localeCompare(b));let motions=[],expressions=[],skins=[];const spine=!!data?.animations;
 if(spine){motions=Object.keys(data.animations);if(Array.isArray(data.skins))skins=data.skins.map(s=>s?.name);}
 else{if(data?.motions)motions=Object.keys(data.motions);if(Array.isArray(data?.expressions))expressions=data.expressions.map(e=>e?.name);if(data?.FileReferences?.Motions)motions=Object.keys(data.FileReferences.Motions);if(Array.isArray(data?.FileReferences?.Expressions))expressions=data.FileReferences.Expressions.map(e=>e?.Name);}
 return {motions:sorted(motions),expressions:sorted(expressions),skins:sorted(skins),spine};
}
function WebVideoUseFigureMetadata(project,reference,setters,nativeFormats){
 const R=reactExports,identity=project+'\u0000'+reference,[attempt,setAttempt]=R.useState(0),[state,setState]=R.useState({identity:null,status:'idle',error:''});
 R.useEffect(()=>{
  let active=true,timedOut=false;const controller=new AbortController(),clear=()=>{setters.motions([]);setters.expressions([]);setters.skins([]);setters.spine(false);setters.jsonl?.(false);};clear();
  const lower=typeof reference==='string'?reference.toLowerCase():'',jsonl=!!(lower&&nativeFormats?.isJsonl(reference)),wmdl=!!nativeFormats&&lower.endsWith('.wmdl');
  if(typeof reference!=='string'||!(jsonl||wmdl||(nativeFormats?(lower.endsWith('.json')||lower.includes('.json?')):reference.includes('json')))){setState({identity,status:'idle',error:''});return()=>{active=false;controller.abort();};}
  if(jsonl)setters.jsonl?.(true);
  setState({identity,status:'loading',error:''});const timeout=setTimeout(()=>{timedOut=true;controller.abort();},15000);
  Promise.resolve().then(async()=>{
   const url=WebVideoFigureMetadataUrl(project,reference),options={signal:controller.signal,cache:'no-cache'},read=async target=>{const response=await fetch(target,options);if(!response.ok)throw Error('HTTP '+response.status);return response;};
   const response=await read(url);
   if(jsonl)return nativeFormats.parseJsonl(await response.text());
   let data=await response.json();
   if(wmdl){data=data?.modelRelativePath?await (await read(url.substring(0,url.lastIndexOf('/')+1)+String(data.modelRelativePath))).json():{};data={motions:data?.motions,expressions:data?.expressions};}
   return WebVideoParseFigureMetadata(data);
  }).then(parsed=>{
   if(!active||controller.signal.aborted)return;setters.motions(parsed.motions||[]);setters.expressions(parsed.expressions||[]);setters.skins(parsed.skins||[]);setters.spine(!!parsed.spine);setState({identity,status:'ready',error:''});
  }).catch(error=>{if(active)setState({identity,status:'error',error:timedOut?'模型选项读取超时':'模型选项读取失败：'+error.message});}).finally(()=>clearTimeout(timeout));
  return()=>{active=false;controller.abort();clearTimeout(timeout);};
 },[project,reference,attempt]);
 return {identity,status:state.identity===identity?state.status:'loading',error:state.identity===identity?state.error:'',retry:()=>setAttempt(value=>value+1)};
}
function WebVideoModelOptions({metadata,kind,...props}){
 const R=reactExports,h=R.createElement;
 if(metadata.status==='ready'&&props.optionList.length)return h(SearchableCascader,{...props,key:metadata.identity});
 const empty={motions:'暂无动作',expressions:'暂无表情',skins:'暂无皮肤'},placeholder=metadata.status==='loading'?'读取中…':metadata.status==='error'?'读取失败':empty[kind];
 return h('div',{style:{display:'flex',alignItems:'center',gap:4,minWidth:0,width:'100%'}},h(Input,{value:props.value??'',readOnly:true,placeholder,title:metadata.error||placeholder,style:{minWidth:0,flex:1},'aria-label':placeholder}),metadata.status==='error'&&h(Button,{size:'small',onClick:metadata.retry,title:metadata.error},'重试'));
}

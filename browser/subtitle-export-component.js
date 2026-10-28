function WebVideoDialogueSubtitles({game,target}){
 const R=reactExports,h=R.createElement;
 const [open,setOpen]=R.useState(false),[ready,setReady]=R.useState(false),[busy,setBusy]=R.useState(false),[message,setMessage]=R.useState(''),[problem,setProblem]=R.useState(null);
 const [includeSpeaker,setIncludeSpeaker]=R.useState(false),[scope,setScope]=R.useState('full'),[selection,setSelection]=R.useState(null),[directory,setDirectory]=R.useState(''),[name,setName]=R.useState(''),[job,setJob]=R.useState(null);
 const requests=R.useRef(new Set()),connection=R.useRef(null),settings=R.useRef(null),submission=R.useRef(null),inFlight=R.useRef(false),generation=R.useRef(0),picking=R.useRef(false);
 const base=['games',game,'game','scene'].join('/')+'/',raw=String(target?.path||'').replaceAll('\\','/'),scene=raw.startsWith(base)?raw.slice(base.length):raw.replace(/^scene\//,'');
 const fail=error=>{const p=WebVideoServiceErrors.describe(error);setMessage(p.summary);setProblem(p);};
 async function call(endpoint,body){
  const conn=WebVideoServiceErrors.validateDiscovery(connection.current);
  const response=await webVideoExportRequest(conn.baseUrl+endpoint,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+conn.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},endpoint.startsWith('/api/dialog/')?600000:body===undefined?15000:120000,requests.current);
  return WebVideoServiceErrors.readResponse(response,{endpoint});
 }
 const close=()=>{generation.current++;for(const c of requests.current)c.abort();setOpen(false);};
 R.useEffect(()=>{const show=()=>{setSelection(null);setScope('full');setJob(null);setProblem(null);setOpen(true);};window.addEventListener('webvideo:open-subtitle-export',show);return()=>{window.removeEventListener('webvideo:open-subtitle-export',show);generation.current++;for(const c of requests.current)c.abort();};},[]);
 R.useEffect(()=>{
  if(!open||picking.current)return;const token=++generation.current;setBusy(false);setReady(false);setMessage('正在读取导出设置…');setProblem(null);
  (async()=>{try{
   const conn=await WebVideoServiceErrors.readDiscovery((url,options)=>webVideoExportRequest(url,options,15000,requests.current));if(token!==generation.current)return;connection.current=conn;
   const cfg=await call('/api/config');const speed=await WebVideoRuntime.readGameSettings(game);if(token!==generation.current)return;
   settings.current={...cfg.settings,...speed,mode:'auto',bgmBaseMode:'auto',segmentCutMode:'auto',manualCutPoints:''};setDirectory(cfg.outputDir);setName((target?.name||'字幕.txt').replace(/\.txt$/i,'')+'.srt');setMessage('');setReady(true);
  }catch(error){if(token===generation.current)fail(error);}})();
  return()=>{generation.current++;for(const c of requests.current)c.abort();};
 },[open,game]);
 R.useEffect(()=>{
  if(!open||!job?.id||['completed','failed','canceled','needs_attention'].includes(job.state))return;
  let live=true,timer;const poll=async()=>{try{const rows=await call('/api/jobs');if(!live)return;const row=rows.find(row=>row.id===job.id);if(row){setJob(row);setMessage(row.message||'正在生成字幕…');}}catch(error){if(live)fail(error);}if(live)timer=setTimeout(poll,1000);};poll();return()=>{live=false;clearTimeout(timer);};
 },[open,job?.id,job?.state]);
 async function pickRange(){picking.current=true;setOpen(false);try{const next=await window.WebVideoPlus.requestSelection({mode:'range'});if(next)setSelection(next);}catch(error){fail(error);}finally{setOpen(true);picking.current=false;}}
 async function chooseFolder(){const token=generation.current;try{const value=await call('/api/dialog/folder',{initial:directory});if(token===generation.current&&!value.canceled&&value.path)setDirectory(value.path);}catch(error){if(token===generation.current)fail(error);}}
 async function start(){
  if(inFlight.current||!ready)return;inFlight.current=true;setBusy(true);setProblem(null);const token=generation.current;
  try{
   if(!scene||!game)throw Error('请先打开场景文本。');
   const model=window.WebVideoPlus?.state().model;let sourceText=model?.path===base+scene?model.source:undefined,range;
   if(selection){if(!window.WebVideoPlus.validateSelection(selection))throw Error('选区已变化，请重新选择。');sourceText=selection.source;range={startLine:selection.ranges[0].startLine,endLine:selection.ranges[0].endLine,sourceHash:await webVideoExportHash(sourceText.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'))};}
   const request={project:game,scene,sourceText,range,storyScope:scope,runtimeStartup:WebVideoRuntime.peekRuntimeStartup?.(game)??null,exportKind:'subtitles',includeSpeaker,settings:settings.current,outputDir:directory,fileName:name};
   const signature=JSON.stringify(request);if(submission.current?.signature!==signature)submission.current={signature,id:crypto.randomUUID()};request.requestId=submission.current.id;
   let result;try{result=await call('/api/jobs',request);}catch(error){result=await call('/api/jobs/by-request/'+request.requestId).catch(()=>null);if(!result?.id)throw error;}
   if(token===generation.current){setJob({id:result.id,state:'queued'});setMessage('已加入字幕导出队列。');}submission.current=null;
  }catch(error){if(token===generation.current)fail(error);}finally{inFlight.current=false;if(token===generation.current)setBusy(false);}
 }
 const button=(text,onClick,disabled=false,appearance='secondary')=>h(Button,{onClick,disabled,appearance},text);
 const field=(title,control)=>h('label',{style:{display:'grid',gap:6}},title,control);
 const inputStyle={width:'100%',boxSizing:'border-box',minHeight:32,padding:'5px 8px',font:'inherit',color:'var(--colorNeutralForeground1)',background:'var(--colorNeutralBackground1)',border:'1px solid var(--colorNeutralStroke1)',borderRadius:4};
 const running=job&&!['completed','failed','canceled','needs_attention'].includes(job.state);
 return h(Dialog,{open,onOpenChange:(_,d)=>{if(!d.open)close();}},h(DialogSurface,{'aria-label':'导出字幕（SRT）',style:{width:520,maxWidth:'calc(100vw - 48px)'}},h(DialogBody,null,
  h(DialogTitle,null,'导出字幕（SRT）'),h(DialogContent,{style:{display:'grid',gap:16}},
   h('p',{style:{margin:0,fontSize:13}},'当前场景：'+(target?.name||'请先打开场景文本')),
   h('label',null,h('input',{type:'checkbox',checked:includeSpeaker,disabled:busy||running,onChange:e=>setIncludeSpeaker(e.target.checked)}),' 包含说话人'),
   selection?h('div',null,'已选择第 '+selection.ranges[0].startLine+'–'+selection.ranges[0].endLine+' 行 ',button('取消选段',()=>setSelection(null),busy||running)):field('故事范围',h('select',{style:inputStyle,value:scope,disabled:busy||running,onChange:e=>setScope(e.target.value)},...Object.entries({full:'全篇',fromScene:'由本场景开始',sceneOnly:'仅本场景'}).map(([value,label])=>h('option',{key:value,value},label)))),
   window.WebVideoPlus?.modules.includes('timelineSelector')?button('选择剧情范围',pickRange,!ready||busy||running):null,
   field('保存文件夹',h('div',{style:{display:'flex',gap:8}},h('input',{style:inputStyle,value:directory,disabled:busy||running,onChange:e=>setDirectory(e.target.value)}),button('选择…',chooseFolder,!ready||busy||running))),
   field('文件名',h('input',{style:inputStyle,value:name,disabled:busy||running,onChange:e=>setName(e.target.value)})),
   h('p',{'aria-live':'polite',style:{margin:0,fontSize:13}},message),problem?h('details',null,h('summary',null,'技术详情'),h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},problem.technical)):null),
  h(DialogActions,null,button('关闭',close),running?button('取消任务',async()=>{try{await call('/api/jobs/'+job.id+'/cancel',{});}catch(error){fail(error);}}):null,job?.state==='completed'?button('打开文件夹',()=>call('/api/jobs/'+job.id+'/folder',{}).catch(fail)):button(busy?'正在加入…':'导出字幕',start,!ready||busy||running,'primary')))));
}

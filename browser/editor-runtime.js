// Read the current game's two playback options. Never modify game options or project files.
const WebVideoRuntime=(()=>{
 const stores=new WeakMap();let context={},navigation=0;
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function frameFor(game){const frame=document.getElementById('gamePreviewIframe');if(!frame)return null;try{const url=new URL(frame.contentWindow.location.href);if(url.origin!==window.location.origin||!(decodeURIComponent(url.pathname)==='/games/'+game||decodeURIComponent(url.pathname).startsWith('/games/'+game+'/')))return null;return frame;}catch{return null;}}
 function storeFor(frame){
  const root=frame.contentDocument?.getElementById('root');if(!root)return null;
  const cached=stores.get(frame);if(cached?.root===root)return cached.store;
  const roots=[root._reactRootContainer?._internalRoot?.current,...Object.keys(root).filter(key=>key.startsWith('__reactContainer$')||key.startsWith('__reactFiber$')).map(key=>root[key])],seen=new Set(),queue=roots.filter(Boolean);
  for(let i=0;i<queue.length&&i<3000;i++){const node=queue[i];if(!node||seen.has(node))continue;seen.add(node);for(const props of [node.memoizedProps,node.pendingProps]){for(const store of [props?.store,props?.value?.store])if(store&&typeof store.getState==='function'&&store.getState()?.userData?.optionData){stores.set(frame,{root,store});return store;}}for(const next of [node.child,node.sibling,node.alternate,node.stateNode?.current])if(next&&!seen.has(next))queue.push(next);}
  return null;
 }
 function peekGameSettings(game=context.game){try{const frame=frameFor(game),options=frame&&storeFor(frame)?.getState()?.userData?.optionData;if(!options)return null;const textSpeed=Number(options.textSpeed),autoSpeed=Number(options.autoSpeed);if(![textSpeed,autoSpeed].every(n=>Number.isFinite(n)&&n>=-500&&n<=100))return null;return {textSpeed,autoSpeed};}catch{return null;}}
 function singleLineHintDuration(row){if(row?.command!=='choose'||Number(row.args?.defaultChoose)!==1||row.args?.next===true)return 0;const ms=Number(row.args?.wvpHint);if(!Number.isFinite(ms)||ms<100||ms>60000)return 0;const options=String(row.content||'').split(/(?<!\\)\|/);if(options.length!==1)return 0;const nodes=options[0].split(/(?<!\\):/);return nodes.length>1&&/^__wvp_hint_[A-Za-z0-9_]+$/.test(nodes[1].trim())?ms:0;}
 function singleChooseItem(frame){const main=frame?.contentDocument?.getElementById('chooseContainer')?.firstElementChild;if(!main||main.children.length!==1)return null;const outer=main.firstElementChild;if(!outer||outer.children.length!==1)return null;return outer.firstElementChild;}
 async function waitPreviewSettled(ticket,before,path,minSentenceId){const scene=String(path||'').replace(/\\/g,'/').split('/game/scene/').pop();for(let i=0;i<100;i++){if(ticket!==navigation)return false;const current=EditorPreviewClient.getLastStageSnapshot?.();if(current&&current!==before&&String(current.sceneName||'').replace(/\\/g,'/').endsWith(scene)&&Number(current.sentenceId)>=minSentenceId)return true;await sleep(50);}return false;}
 async function dismissSingleLineHint(ticket,frame,duration){let item=null;for(let i=0;i<40;i++){if(ticket!==navigation||frameFor(context.game)!==frame)return;item=singleChooseItem(frame);if(item)break;await sleep(25);}if(!item)return;await sleep(duration);if(ticket!==navigation||frameFor(context.game)!==frame)return;if(singleChooseItem(frame)===item)item.click();}
 async function readGameSettings(game=context.game){if(!game)throw Error('请先打开项目');context.showPreview?.();for(let i=0;i<80;i++){if(context.game&&context.game!==game)throw Error('项目已切换，请重新读取设置');const result=peekGameSettings(game);if(result)return result;await sleep(100);}throw Error('尚未读取到预览内的播放设置。请等待游戏预览加载完成后重试。');}
 async function writeGameSettings(values,game=context.game){
  const clean={};for(const key of ['textSpeed','autoSpeed'])if(values[key]!==undefined){const value=Number(values[key]);if(!Number.isFinite(value)||value<-100||value>100)throw Error('速度需要在 -100 到 100 之间。');clean[key]=value;}
  await readGameSettings(game);const frame=frameFor(game),store=frame&&storeFor(frame);if(!store)throw Error('预览尚未就绪。');const config=(await api.manageGameControllerGetGameConfig(game)).data,key=WebgalParser.parseConfig(config).find(item=>item.command==='Game_key')?.args?.[0];if(!key)throw Error('无法读取当前游戏的保存标识。');if(context.game!==game||frameFor(game)!==frame)throw Error('预览已切换，未修改速度。');
  const database=await new Promise((resolve,reject)=>{const request=frame.contentWindow.indexedDB.open('localforage');request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('keyvaluepairs'))request.result.createObjectStore('keyvaluepairs');};request.onerror=()=>reject(Error('无法保存预览速度。'));request.onsuccess=()=>resolve(request.result);});
  try{await new Promise((resolve,reject)=>{const tx=database.transaction('keyvaluepairs','readwrite'),objects=tx.objectStore('keyvaluepairs'),request=objects.get(key);request.onsuccess=()=>{const current=request.result||JSON.parse(JSON.stringify(store.getState().userData));objects.put({...current,optionData:{...current.optionData,...clean}},key);};tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('保存预览速度失败。'));});}finally{database.close();}
  if(context.game!==game||frameFor(game)!==frame)throw Error('预览已切换，速度已保存，请重新打开此游戏。');for(const [key,value]of Object.entries(clean))store.dispatch({type:'userData/setOptionData',payload:{key,value}});const actual=peekGameSettings(game);if(Object.entries(clean).some(([key,value])=>actual?.[key]!==value))throw Error('预览速度未成功更新。');window.WebVideoPlus?.changed();return actual;
 }
 async function syncPreview(snapshot,row){const ticket=++navigation;if(!snapshot?.path||!row)return;context.showPreview?.();EditorPreviewClient.ensureConnected();await window.WebVideoPlus?.flushEditor?.();let diskReady=false;
  for(let i=0;i<50;i++){
   if(ticket!==navigation||!window.WebVideoPlus?.validateSelection(snapshot))return;
   // Native sync reads the scene from Terre; wait for native autosave rather than changing files here.
   if(!diskReady){const response=await fetch('/'+snapshot.path.split('/').map(encodeURIComponent).join('/')+'?wvpSync='+Date.now(),{cache:'no-store'});
   if(response.ok){const text=await response.text();if(text.replace(/\r\n/g,'\n')===snapshot.source.replace(/\r\n/g,'\n'))diskReady=true;}}
   if(diskReady){
    const ready=frameFor(context.game),hintMs=singleLineHintDuration(row);if(ready&&hintMs){const before=EditorPreviewClient.getLastStageSnapshot?.(),beforeLine=Math.max(0,row.startLine-1);if(!EditorPreviewClient.sendSyncScene({scenePath:snapshot.path,lineNumber:beforeLine,lineCommandString:';',force:true,settleMode:'immediate'})){await sleep(100);continue;}if(!await waitPreviewSettled(ticket,before,snapshot.path,beforeLine))throw Error('单行提示的预览状态恢复超时。');if(ticket!==navigation||frameFor(context.game)!==ready)return;if(!EditorPreviewClient.runSnippet(row.source))throw Error('单行提示未能发送到预览。');void dismissSingleLineHint(ticket,ready,hintMs);return {line:row.endLine};}if(ready&&EditorPreviewClient.sendSyncScene({scenePath:snapshot.path,lineNumber:row.endLine,lineCommandString:row.source,force:true,settleMode:'immediate'}))return {line:row.endLine};
   }await sleep(100);
  }throw Error('预览尚未完成同步，请等待保存与预览加载完成后再次点击。');
 }
 return {setContext(value){context=value;},peekGameSettings,readGameSettings,writeGameSettings,syncPreview,cancelNavigation(){navigation++;},storeFor};
})();
window.WebVideoRuntime=WebVideoRuntime;
const WebVideoSingleLineHint=(()=>{
 const reserved=/^__wvp_hint_[A-Za-z0-9_]+$/;
 const splitOptions=value=>String(value||'').split(/(?<!\\)\|/);
 const splitNodes=value=>String(value||'').split(/(?<!\\):/);
 function analyze(row){
  if(!row||row.command!=='choose')return {isHint:false,convertible:false,reason:'not-choose'};
  const args=row.args||{},options=splitOptions(row.content),nodes=splitNodes(options[0]||''),text=(nodes[0]||'').trim(),target=(nodes[1]||'').trim(),duration=Number(args.wvpHint);
  const isHint=options.length===1&&nodes.length===2&&reserved.test(target)&&Number(args.defaultChoose)===1&&!args.next&&Number.isFinite(duration)&&duration>=100&&duration<=60000;
  if(isHint)return {isHint:true,convertible:false,text,target,duration};
  const unsafeArgs=Object.keys(args).filter(key=>key!=='defaultChoose');
  const convertible=args.wvpHint===undefined&&options.length===1&&nodes.length===2&&!String(options[0]).includes('->')&&!!text&&!!target&&unsafeArgs.length===0;
  return {isHint:false,convertible,text,target,duration:1800,reason:convertible?'single-choice':'unsafe',unsafeArgs};
 }
 function id(){return '__wvp_hint_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
 function createText(text='时间 / 地点',duration=1800){const target=id();return 'choose:'+text+':'+target+' -defaultChoose=1 -wvpHint='+duration+';\nlabel:'+target+';';}
 function buildPlan(model,rows,duration=1800){
  if(!model||!Array.isArray(rows)||!rows.length)throw Error('没有可转换的单选分支。');
  const current=new Map(model.statements.map(row=>[row.id,row])),patches=[];
  for(const requested of rows){const row=current.get(requested.id)||current.get(String(requested.startLine-1)+':'+String(requested.endLine-1));if(!row)continue;const info=analyze(row);if(!info.convertible)continue;
   const parsed=parseScene(row.source).sentenceList.find(sentence=>!sentence.isLineBreakHolder);if(!parsed)continue;
   const target=id(),hint=combineSubmitString(parsed.commandRaw||'choose',info.text+':'+target,parsed.args,[{key:'defaultChoose',value:1},{key:'wvpHint',value:duration}],parsed.inlineComment||''),replacement=hint+'\nlabel:'+target+';'+(/\n$/.test(row.source)?'\n':'');
   patches.push({startOffset:row.startOffset,endOffset:row.endOffset,before:model.source.slice(row.startOffset,row.endOffset),after:replacement,line:row.startLine,oldTarget:info.target});
  }
  if(!patches.length)throw Error('没有可安全转换的单选分支。');
  patches.sort((a,b)=>a.startOffset-b.startOffset);let after=model.source;for(const patch of [...patches].reverse())after=after.slice(0,patch.startOffset)+patch.after+after.slice(patch.endOffset);parseScene(after);
  return {schemaVersion:1,path:model.path,before:model.source,after,operation:{type:'singleLineHint'},patches,warnings:[],changed:patches.length};
 }
 async function applyPlan(plan,label){
  const live=window.WebVideoPlus?.state().model;if(!live||live.path!==plan.path||live.source!==plan.before)throw Error('剧本已变化，请重新执行转换。');
  if(window.WebVideoProject?.commit)return await window.WebVideoProject.commit(plan,label);
  await window.WebVideoPlus.flushEditor?.();const latest=window.WebVideoPlus?.state().model;if(!latest||latest.path!==plan.path||latest.source!==plan.before)throw Error('剧本已变化，请重新执行转换。');
  await api.manageGameControllerEditTextFile({textFile:plan.after,path:plan.path});window.WebVideoPlus.replaceBuffer(plan.path,plan.after);eventBus?.emit?.('editor:update-scene',{scene:plan.after});return {changed:plan.changed};
 }
 async function convertRows(rows,{confirm=true,duration=1800,label='转为单行提示'}={}){
  const model=window.WebVideoPlus?.state().model,plan=buildPlan(model,rows,duration);if(confirm&&!window.confirm('将 '+plan.changed+' 个单选分支转为单行提示？\n\n原选项的跳转目标会被取消，改为显示约 '+(duration/1000)+' 秒后继续下一句。'))return {changed:0,canceled:true};
  return await applyPlan(plan,label);
 }
 function convertibleRows(model=window.WebVideoPlus?.state().model){return model?.statements?.filter(row=>analyze(row).convertible)||[];}
 return {analyze,createText,buildPlan,convertRows,convertibleRows};
})();
window.WebVideoSingleLineHint=WebVideoSingleLineHint;
let WebVideoChooseHintOriginal=null;
function webVideoChooseHintState(sentence){
 const args=sentence?.args||[],hintArg=args.find(a=>a.key==='wvpHint'),defaultArg=args.find(a=>a.key==='defaultChoose'),content=String(sentence?.content||''),options=content.split(/(?<!\\)\|/),nodes=(options[0]||'').split(/(?<!\\):/),target=nodes[1]?.trim()||'',duration=Number(hintArg?.value);
 return {requested:!!hintArg,duration:Number.isFinite(duration)&&duration>=100&&duration<=60000?duration:1800,defaultChoose:Number(defaultArg?.value),optionCount:options.length,reservedTarget:/^__wvp_hint_[A-Za-z0-9_]+$/.test(target)};
}
function webVideoSubmitChooseArgs(sentence,updates){
 const args=new Map((sentence?.args||[]).map(arg=>[arg.key,arg.value]));for(const update of updates){if(update.value===''||update.value===false)args.delete(update.key);else args.set(update.key,update.value);}
 const argText=[...args].map(([key,value])=>value===true?' -'+key:' -'+key+'='+value).join(''),head=sentence.commandRaw===undefined?String(sentence.content||''):String(sentence.commandRaw)+':'+String(sentence.content||''),comment=String(sentence.inlineComment||'').trim();
 return head+argText+(comment?'; '+comment:';');
}
function WebVideoChooseHintEditor(props){
 const R=reactExports,h=R.createElement,root=R.useRef(null),state=webVideoChooseHintState(props.sentence),valid=state.requested&&state.optionCount===1&&state.reservedTarget&&state.defaultChoose===1,canEnable=state.optionCount===1&&state.reservedTarget,lockTip='请先关闭“单行提示”再添加选项。添加多个选项会变成交互分支，并阻断 Video+ 自动导出。';
 R.useEffect(()=>{const host=root.current;if(!host)return;const buttons=[...host.querySelectorAll('button')],add=buttons.find(button=>button.getAttribute('aria-label')==='添加语句'||button.title==='添加语句')||buttons[buttons.length-1];if(add){add.disabled=state.requested;add.setAttribute('aria-disabled',state.requested?'true':'false');add.title=state.requested?lockTip:'';const row=add.parentElement;if(row){row.title=state.requested?lockTip:'';row.style.cursor=state.requested?'not-allowed':'';}}const defaults=[...host.querySelectorAll('input[type="checkbox"]')].filter(input=>input.dataset.wvpHintToggle!=='1');for(const input of defaults){const lockDefault=valid;input.disabled=lockDefault;const holder=input.closest('label')||input.parentElement;if(holder)holder.title=lockDefault?'单行提示固定使用第一个选项作为快速预览默认项；关闭“单行提示”后可修改。':'';}},[state.requested,state.optionCount,state.reservedTarget,state.defaultChoose,valid,props.sentence?.content]);
 const toggle=event=>{const on=event.currentTarget.checked;if(on&&!canEnable)return;const updates=[{key:'wvpHint',value:on?state.duration:''}];if(on)updates.push({key:'defaultChoose',value:1});props.onSubmit(webVideoSubmitChooseArgs(props.sentence,updates));};
 let message,title='';
 if(state.requested&&!valid){message='当前“单行提示”配置无效，会阻断 Video+ 导出。请保持一个选项和默认选项，或关闭此开关。';title=message;}
 else if(state.requested){message='单行提示开启：仅允许一个选项，约 '+(state.duration/1000).toFixed(state.duration%1000?1:0)+' 秒后自动继续，可用于 Video+ 导出。';}
 else if(!canEnable){message=state.optionCount!==1?'普通多选项分支会阻断 Video+ 自动导出；删到一个选项后才能使用单行提示。':'此分支不是由 Video+ 单行提示创建；普通分支会阻断 Video+ 自动导出。';title=message;}
 else message='关闭状态是普通 WebGAL 分支，会阻断 Video+ 自动导出；开启后将作为非交互单行提示自动继续。';
 const control=h('div',{style:{display:'flex',flexDirection:'column',gap:'5px',padding:'8px 0'},title},h('label',{style:{display:'flex',alignItems:'center',gap:'8px',width:'fit-content',cursor:!state.requested&&!canEnable?'not-allowed':'pointer'}},h('input',{type:'checkbox','data-wvp-hint-toggle':'1',checked:state.requested,disabled:!state.requested&&!canEnable,onChange:toggle}),'单行提示（Video+）'),h('small',{style:{lineHeight:1.5,opacity:state.requested&&!valid?1:.72,color:state.requested&&!valid?'var(--colorPaletteRedForeground1,#b10e1c)':'inherit'}},message));
 return h('div',{ref:root},h(WebVideoChooseHintOriginal,{...props,extraOptions:h(R.Fragment,null,props.extraOptions,control)}));
}
function installWebVideoChooseHintEditor(){
 if(WebVideoChooseHintOriginal||typeof sentenceEditorConfig==='undefined'||typeof commandType==='undefined')return !!WebVideoChooseHintOriginal;
 const config=sentenceEditorConfig.find(item=>item.type===commandType.choose);if(!config||typeof config.component!=='function')return false;WebVideoChooseHintOriginal=config.component;config.component=WebVideoChooseHintEditor;return true;
}
function WebVideoRuntimeHost(){
 installWebVideoChooseHintEditor();
 const game=useEditorStore.use.subPage(),showSidebar=useGameEditorContext(s=>s.updateIsShowSidebar),showPreview=useEditorStore.use.updateIsShowPreview();
 reactExports.useEffect(()=>{window.WebVideoFilterLibrary?.load();window.WebVideoPresetLibrary?.load();const focus=()=>window.WebVideoFilterLibrary?.load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
 useWebVideoAutomaticBackups(game);
 WebVideoRuntime.setContext({game,showPreview(){showSidebar(true);showPreview(true);}});
 reactExports.useEffect(()=>()=>WebVideoRuntime.cancelNavigation(),[game]);return reactExports.createElement(WebVideoCharacterMapHost);
}

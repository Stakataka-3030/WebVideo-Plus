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
    const ready=frameFor(context.game);if(ready&&EditorPreviewClient.sendSyncScene({scenePath:snapshot.path,lineNumber:row.endLine,lineCommandString:row.source,force:true,settleMode:'immediate'}))return {line:row.endLine};
   }await sleep(100);
  }throw Error('预览尚未完成同步，请等待保存与预览加载完成后再次点击。');
 }
 return {setContext(value){context=value;},peekGameSettings,readGameSettings,writeGameSettings,syncPreview,cancelNavigation(){navigation++;},storeFor};
})();
window.WebVideoRuntime=WebVideoRuntime;
function WebVideoRuntimeHost(){
 const game=useEditorStore.use.subPage(),showSidebar=useGameEditorContext(s=>s.updateIsShowSidebar),showPreview=useEditorStore.use.updateIsShowPreview();
 reactExports.useEffect(()=>{window.WebVideoFilterLibrary?.load();window.WebVideoPresetLibrary?.load();const focus=()=>window.WebVideoFilterLibrary?.load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
 useWebVideoAutomaticBackups(game);
 WebVideoRuntime.setContext({game,showPreview(){showSidebar(true);showPreview(true);}});
 reactExports.useEffect(()=>()=>WebVideoRuntime.cancelNavigation(),[game]);return reactExports.createElement(WebVideoCharacterMapHost);
}

const WebVideoProjectResources=(()=>{
 const initial=()=>({skipAssets:false,shareEngineAssets:false,engine:null});
 function enabled(){return typeof WebVideoSharedMaterials!=='undefined'&&WebVideoSharedMaterials.enabled===true;}
 function nativeData(data){const {webVideoResources,...rest}=data;return rest;}
 function failure(value){return value?.error||value?.message||'项目创建失败，请重试';}
 async function create(data){
  const options=data.webVideoResources;
  if(!enabled()||!options?.skipAssets){const result=await api.manageGameControllerCreateGame(nativeData(data)),body=result?.data;if(body?.status&&body.status!=='success'||body?.data===false)throw Error(failure(body));return result;}
  const result=await WebVideoSharedMaterials.request('/api/project-resources/create',{...nativeData(data),webVideoResources:{skipAssets:true,shareEngineAssets:!!options.shareEngineAssets,assetEnginePath:options.shareEngineAssets?options.assetEnginePath||'':''}});if(result?.status!=='success'||result.data!==true)throw Error(failure(result));return {data:result};
 }
 function useOptions(){
  const R=reactExports,[options,setOptions]=R.useState(initial),[busy,setBusy]=R.useState(false),[selecting,setSelecting]=R.useState(false),[error,setError]=R.useState(''),[derivative,setDerivative]=R.useState(''),[defaultEngine,setDefaultEngine]=R.useState(null),work=R.useRef({alive:true,busy:false,selecting:false,generation:0});
  R.useEffect(()=>{work.current.alive=true;return()=>{work.current.alive=false;work.current.generation++;};},[]);
  const active=enabled(),locked=busy||selecting;
  R.useEffect(()=>{if(!active||!options.skipAssets||!options.shareEngineAssets||options.engine)return;let alive=true;const controller=new AbortController();setDefaultEngine(null);WebVideoSharedMaterials.request('/api/project-resources/source',{derivative},controller.signal).then(source=>{if(alive)setDefaultEngine(source);}).catch(error=>{if(alive&&error?.name!=='AbortError')setError(error?.message||'素材来源读取失败');});return()=>{alive=false;controller.abort();};},[active,options.skipAssets,options.shareEngineAssets,options.engine,derivative]);
  const update=(key,value)=>{if(work.current.busy||work.current.selecting)return;setOptions(current=>({...current,[key]:value}));setError('');};
  const withOptions=data=>{const dto=nativeData(data);if(!enabled()||!options.skipAssets)return dto;return {...dto,webVideoResources:{skipAssets:true,shareEngineAssets:!!options.shareEngineAssets,assetEnginePath:options.shareEngineAssets?options.engine?.root||'':''}};};
  const chooseEngine=async()=>{
   if(!enabled()||!options.skipAssets||!options.shareEngineAssets||work.current.busy||work.current.selecting)return false;const generation=++work.current.generation;work.current.selecting=true;setSelecting(true);setError('');
   try{const result=await WebVideoSharedMaterials.request('/api/project-resources/resource-dialog',{initial:options.engine?.root??defaultEngine?.root??''});if(!work.current.alive||generation!==work.current.generation||result?.canceled)return false;if(typeof result?.root!=='string'||!result.root.trim())throw Error('请选择素材来源的引擎文件夹');setOptions(current=>({...current,engine:result}));setError('');return true;}
   catch(error){if(work.current.alive&&generation===work.current.generation)setError(error?.message||'素材来源读取失败，请重新选择');return false;}
   finally{if(work.current.alive&&generation===work.current.generation){work.current.selecting=false;setSelecting(false);}}
  };
  const submit=async(action,onSuccess)=>{
   if(work.current.busy||work.current.selecting)return false;work.current.busy=true;setBusy(true);setError('');
   try{await action();if(work.current.alive){onSuccess();setOptions(initial());}return true;}
   catch(error){if(work.current.alive)setError(error?.message||'项目创建失败，请重试');return false;}
   finally{work.current.busy=false;if(work.current.alive)setBusy(false);}
  };
  return {enabled:active,options,defaultEngine,busy,selecting,locked,error,update,withOptions,chooseEngine,submit,setDerivative(value){setDerivative(value??'');setError('');},disabled:locked,canToggle(){if(work.current.busy||work.current.selecting)return false;setError('');return true;}};
 }
 return {create,useOptions,enabled};
})();
function WebVideoProjectResourceHelp({label,content}){
 return reactExports.createElement(__CODEX_TOOLTIP__,{content,relationship:'description',positioning:'after'},reactExports.createElement(Button,{type:'button',appearance:'subtle',size:'small','aria-label':label+'：这是什么',style:{fontSize:12,minWidth:0,padding:'0 4px',textDecorationLine:'underline',textDecorationStyle:'dotted',textUnderlineOffset:3}},'这是什么'));
}
function WebVideoProjectResourceFields({state}){
 const h=reactExports.createElement;
 const feedback=state.error?h('div',{role:'alert',style:{fontSize:12,color:'var(--danger,#b42318)',overflowWrap:'anywhere'}},state.error):state.busy?h('div',{role:'status',style:{fontSize:12,color:'var(--text-weak)'}},'正在创建…'):null;
 if(!state.enabled)return feedback;
 const sharing=state.options.skipAssets&&state.options.shareEngineAssets,engine=state.options.engine||state.defaultEngine,resourceRoot=engine?.resourceRoot??'',current=engine?'当前素材：'+resourceRoot:'跟随上方选择的游戏引擎';
 return h('div',{'data-wvp-project-resources':true,style:{display:'flex',flexDirection:'column',gap:8,minWidth:0}},
  h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:4}},h(Checkbox,{checked:state.options.skipAssets,disabled:state.locked,label:'创建空白项目',onChange:(_,data)=>state.update('skipAssets',!!data.checked)}),h(WebVideoProjectResourceHelp,{label:'空白项目',content:'先创建空白项目，示例图片、音乐和立绘不复制。之后可引用共享文件夹，让多个项目使用同一份素材。'})),
  h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:4}},h(Checkbox,{checked:state.options.skipAssets&&state.options.shareEngineAssets,disabled:state.locked||!state.options.skipAssets,label:'共享资源使用引擎内自带的资源',onChange:(_,data)=>state.update('shareEngineAssets',!!data.checked)}),h(WebVideoProjectResourceHelp,{label:'共享资源',content:'素材保留在引擎的 game 文件夹，创建后可在共享素材区引用。默认跟随上方选择的引擎，也可选择其他包含 game 文件夹的引擎目录。'+(resourceRoot?' 当前素材文件夹：'+resourceRoot+'。':'')})),
  sharing&&h('div',{style:{display:'flex',alignItems:'center',gap:4,minWidth:0}},h(Input,{value:resourceRoot,readOnly:true,disabled:state.locked,placeholder:'跟随上方选择的游戏引擎','aria-label':'共享素材来源文件夹',title:resourceRoot,style:{minWidth:0,flex:1}}),h(Button,{type:'button',size:'small',disabled:state.locked,onClick:state.chooseEngine},state.selecting?'正在选择…':'选择其他文件夹')),
  sharing&&state.options.engine&&h(Button,{type:'button',size:'small',appearance:'subtle',disabled:state.locked,onClick:()=>state.update('engine',null)},'跟随所选引擎'),feedback);
}

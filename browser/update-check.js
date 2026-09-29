// GitHub release bodies may declare: <!-- webvideo-compat: {"webgal":["4.6.4"]} -->
// Older published releases predate this marker; keep their verified baseline here.
const WebVideoUpdates=(()=>{
 const endpoint='https://api.github.com/repos/Stakataka-3030/WebVideo-Plus/releases?per_page=100';
 const legacy=new Set(['1.0.0','1.0.1','1.0.4','1.1.0']);
 const listeners=new Set();let state={phase:'idle',visible:false,message:'',url:''},started=false,serial=0,latestSeen='';
 const emit=next=>{state={...state,...next};for(const listener of listeners)listener(state);};
 const parts=value=>{const match=String(value||'').match(/^v?(\d+)\.(\d+)\.(\d+)$/);return match?match.slice(1).map(Number):null;};
 const compare=(left,right)=>{const a=parts(left),b=parts(right);if(!a||!b)return 0;for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
 const version=tag=>String(tag||'').replace(/^v/,'');
 const releaseUrl=tag=>/^v?\d+\.\d+\.\d+$/.test(tag||'')?'https://github.com/Stakataka-3030/WebVideo-Plus/releases/tag/'+encodeURIComponent(tag):'';
 function supports(release){
  const value=version(release.tag_name),body=String(release.body||'');
  const marker=body.match(/<!--\s*webvideo-compat:\s*(\{[^\r\n]*\})\s*-->/i);
  if(marker){try{const data=JSON.parse(marker[1]);return Array.isArray(data.webgal)?data.webgal.filter(item=>/^\d+\.\d+\.\d+$/.test(item)):[];}catch{return [];}}
  return legacy.has(value)?['4.6.4']:[];
 }
 function classify(rows,engine,current){
  if(!/^\d+\.\d+\.\d+$/.test(engine||''))return {kind:'unknown',message:'无法确认 Terre 默认 WebGAL 引擎版本，不能自动推荐安装包。',url:''};
  const releases=rows.filter(row=>row&&!row.draft&&!row.prerelease&&parts(row.tag_name)&&releaseUrl(row.tag_name)).sort((a,b)=>compare(b.tag_name,a.tag_name));
  if(!releases.length)throw Error('GitHub 没有可读取的正式发行版');
  const compatible=releases.find(row=>supports(row).includes(engine));
  const latest=releases[0],latestVersion=version(latest.tag_name);
  if(!compatible)return {kind:'unsupported',message:'WebGAL '+engine+' 暂无已发布的兼容 WebVideo+ 版本；请勿仅按版本号升级。',url:'https://github.com/Stakataka-3030/WebVideo-Plus/releases'};
  const target=version(compatible.tag_name),url=releaseUrl(compatible.tag_name);
  if(releases.some(row=>compare(row.tag_name,compatible.tag_name)>0&&!supports(row).length))return {kind:'unknown',message:'发现较新的 WebVideo+，但其发行说明没有兼容范围；请在发行页确认后再安装。',url:releaseUrl(latest.tag_name)};
  if(compare(target,current)>0)return {kind:'update',message:'WebGAL '+engine+' 可更新至兼容的 WebVideo+ '+target+'。'+(compare(latestVersion,target)>0?'更新的 '+latestVersion+' 不适配当前引擎。':''),url};
  if(compare(latestVersion,target)>0)return {kind:'keep',message:'WebGAL '+engine+' 需要保留兼容的 WebVideo+ '+target+'；较新的 '+latestVersion+' 面向其他引擎版本。',url};
  return {kind:'current',message:'WebGAL '+engine+' 已使用当前可用的兼容版本（'+current+'）。',url:''};
 }
 function engineVersion(){
  const context=typeof WebVideoUpdateContext==='object'?WebVideoUpdateContext:{};
  if(context.engineId!=='open-webgal.webgal')return null;
  const installed=String(context.engineVersion||''),editor=typeof __INFO==='object'?String(__INFO.version||''):'';
  if(installed&&editor&&installed!==editor)return null;
  return installed||editor||null;
 }
 async function preferences(body){
  const descriptor=await(await fetch('/assets/video-export-service.json',{cache:'no-store'})).json(),base=new URL(descriptor.baseUrl);
  if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname))throw Error('本机导出服务地址无效');
  const response=await fetch(base.origin+'/api/update-preferences',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+descriptor.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('无法保存更新提醒设置');return response.json();
 }
 function suppressed(preference,latest){
  if(preference.mode==='never')return true;
  const baseline=parts(preference.baselineVersion),available=parts(latest);
  if(!baseline||!available)return preference.mode!=='on';
  return preference.mode==='next-release'?compare(latest,preference.baselineVersion)<=0:preference.mode==='next-major'?available[0]<=baseline[0]:false;
 }
 async function snooze(mode){
  try{await preferences({mode,baselineVersion:latestSeen||String(WebVideoUpdateContext.productVersion||'')});emit({visible:false,preference:mode});}
  catch{emit({phase:'failed',visible:true,message:'更新提醒设置未保存，请确认本机导出服务正在运行。'});}
 }
 async function check(manual=false){
  const id=++serial,engine=engineVersion(),current=String(WebVideoUpdateContext.productVersion||'');
  let preference={mode:'on'};
  try{preference=await preferences();}catch{if(!manual){emit({phase:'failed',visible:false,message:'无法读取更新提醒设置'});return state;}}
  if(id!==serial)return state;
  if(!manual&&preference.mode==='never'){emit({phase:'suppressed',visible:false,preference:preference.mode});return state;}
  emit({phase:'checking',visible:manual,message:'正在检查 WebVideo+ 更新…',url:''});
  if(!engine){emit({phase:'done',visible:manual||preference.mode==='on',kind:'unknown',message:'无法确认 Terre 默认引擎版本，检查更新失败；启动不受影响。',url:''});return state;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch(endpoint,{headers:{Accept:'application/vnd.github+json'},signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('GitHub 返回 HTTP '+response.status);
   const length=Number(response.headers.get('content-length')||0);if(length>2*1024*1024)throw Error('发行列表过大');
   const raw=await response.text();if(raw.length>2*1024*1024)throw Error('发行列表过大');
   const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('发行列表格式错误');
   const latest=rows.filter(row=>row&&!row.draft&&!row.prerelease&&parts(row.tag_name)).sort((a,b)=>compare(b.tag_name,a.tag_name))[0];
   latestSeen=latest?version(latest.tag_name):current;
   if(!manual&&suppressed(preference,latestSeen)){if(id===serial)emit({phase:'suppressed',visible:false,preference:preference.mode});return state;}
   if(preference.mode!=='on')try{await preferences({mode:'on',baselineVersion:''});}catch{}
   const result=classify(rows,engine,current);if(id===serial)emit({...result,phase:'done',visible:manual||result.kind!=='current',preference:'on'});
  }catch(error){if(id===serial)emit({phase:'failed',kind:'failed',visible:manual||preference.mode==='on',message:'检查更新失败。'+(error.name==='AbortError'?'连接超时，请稍后重试。':'请检查网络或稍后重试。')+'不会影响 Terre 启动。',url:''});}
  finally{clearTimeout(timer);}
  return state;
 }
 const api={check,classify,snooze,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},state(){return state;},start(){if(started)return;started=true;let retries=0;const run=async()=>{const result=await check(false);if(result.phase==='failed'&&result.message==='无法读取更新提醒设置'&&retries++<3)setTimeout(run,2000);};run();},dismiss(){emit({visible:false});}};
 globalThis.WebVideoUpdates=api;
 return api;
})();
(()=>{
 if(typeof document==='undefined')return;
 let notice=null;
 const buttonStyle='border:1px solid var(--colorNeutralStroke1,#aaa);border-radius:5px;background:var(--colorNeutralBackground1,#fff);color:var(--colorNeutralForeground1,#222);padding:5px 10px;cursor:pointer;font:inherit';
 const node=(tag,text)=>{const item=document.createElement(tag);item.textContent=text;return item;};
 const action=(label,fn)=>{const item=node('button',label);item.type='button';item.style.cssText=buttonStyle;item.addEventListener('click',fn);return item;};
 WebVideoUpdates.subscribe(status=>{
  if(!status.visible){notice?.remove();notice=null;return;}
  if(!document.body)return;
  if(!notice){notice=document.createElement('aside');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.style.cssText='position:fixed;right:20px;bottom:20px;z-index:1100;max-width:370px;width:min(370px,calc(100vw - 40px));box-sizing:border-box;padding:16px;border:1px solid var(--colorNeutralStroke2,#bbb);border-radius:10px;background:var(--colorNeutralBackground1,#fff);color:var(--colorNeutralForeground1,#222);box-shadow:0 8px 28px #0003;font-family:system-ui,"Microsoft YaHei UI",sans-serif;font-size:13px;line-height:1.55';document.body.appendChild(notice);}
  notice.replaceChildren();const title=node('strong','WebVideo+ 更新检查');title.style.cssText='display:block;font-size:15px;margin-bottom:6px';notice.append(title,node('div',status.message));
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px';
  if(status.url){const link=node('a','查看发行页');link.href=status.url;link.target='_blank';link.rel='noopener noreferrer';link.style.cssText=buttonStyle+';text-decoration:none;background:var(--colorBrandBackground,#0f6cbd);color:var(--colorNeutralForegroundOnBrand,#fff)';actions.appendChild(link);}
  const retry=action('重新检查',()=>WebVideoUpdates.check(true));retry.disabled=status.phase==='checking';actions.append(retry);
  const reminder=document.createElement('select');reminder.setAttribute('aria-label','更新提醒设置');reminder.style.cssText=buttonStyle;for(const [value,label] of [['','提醒设置…'],['next-release','下个版本前不要提醒我'],['next-major','下个主要版本前不要提醒我'],['never','不要提醒我'],['on','恢复提醒']]){const option=node('option',label);option.value=value;reminder.appendChild(option);}reminder.addEventListener('change',()=>{if(reminder.value)WebVideoUpdates.snooze(reminder.value);});actions.append(reminder,action('关闭',()=>WebVideoUpdates.dismiss()));notice.appendChild(actions);
 });
 const start=()=>WebVideoUpdates.start();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else setTimeout(start,0);
})();

/* Pure project operations. No network, file writes or model calls in this layer. */
(function(root){
 'use strict';
 const norm=s=>String(s??'').replace(/\r\n/g,'\n'),positions=['left','center','right','left13','right13','left14','right14'];
 const hash=s=>root.WebVideoTimelineCore.fingerprint(norm(s));
 const safeId=value=>{value=String(value||'').trim();if(!/^[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,95}$/u.test(value))throw Error('ID 只能包含文字、数字、下划线、点和连字符');return value;};
 const safePath=value=>{value=String(value||'').replace(/\\/g,'/').trim();if(!value||/^(?:\/|[A-Za-z]:|https?:|data:)/i.test(value)||value.split('/').some(x=>!x||x==='.'||x==='..')||/[\x00-\x1f<>:"|?*%]/.test(value))throw Error('请填写项目内的相对文件路径');return value;};
 const escapeText=text=>String(text??'').replace(/;/g,'\\;').replace(/\r?\n/g,'|');
 function metadata(value={}){if(value.schemaVersion!==undefined&&value.schemaVersion!==1)throw Error('项目配置版本暂不支持');for(const name of ['templates','markers','backups'])if(value[name]!==undefined&&!Array.isArray(value[name]))throw Error('项目配置中的 '+name+' 无效');return {schemaVersion:1,bindings:{},templates:[],markers:[],backups:[],timings:{},storyTiming:null,showChecks:true,showVideoTime:false,...value};}
 function expand(template,row,project){const values={speaker:row.speaker||'',figureId:project.bindings[row.speaker]?.id||row.args.figureId||row.args.id||'',content:escapeText(row.content),motion:row.args.motion||'',expression:row.args.expression||''};return String(template).replace(/\{\{(\w+)\}\}/g,(_,key)=>{if(!(key in values)||values[key]==='')throw Error(`第 ${row.startLine} 行缺少模板变量 ${key}`);return String(values[key]);});}
 function makePlan(model,selection,operation,project,native){
  if(!model||!selection||selection.path!==model.path||selection.source!==model.source)throw Error('选择已失效，请重新选择');
  const chosen=new Set(selection.ids),rows=model.rows.filter(r=>chosen.has(r.id));if(!rows.length)throw Error('请先选择剧情事件');
  const patches=[],warnings=[],eol=model.source.includes('\r\n')?'\r\n':'\n';
  const cleanSnippet=text=>{text=norm(text).trim();if(!text)throw Error('内容不能为空');if(/\{\{[^}]+\}\}/.test(text))throw Error('模板仍有未填写的变量');native.parse(text);return text.replace(/\n/g,eol);};
  for(const row of rows){let replacement,at=row.startOffset,end=row.endOffset;
   if(operation.type==='insert'){
    const value=cleanSnippet(expand(operation.script,row,project));at=operation.position==='after'?row.endOffset:row.startOffset;end=at;
    replacement=(at>0&&!/[\r\n]$/.test(model.source.slice(0,at))?eol:'')+value+eol;
   }else if(operation.type==='figureCue'){
    if(row.command!=='say')continue;
    const figures=new Map();for(const statement of model.statements){if(statement.startLine>=row.startLine)break;if(statement.command!=='changeFigure')continue;if(statement.args.clear===true)figures.clear();const key=String(statement.args.id||'fig-'+(positions.find(p=>statement.args[p]===true)||'center'));if(statement.content==='none'||!statement.content)figures.delete(key);else figures.set(key,statement);}
    let target=operation.target==='background'?'bg-main':operation.target==='speaker'?String(row.args.figureId||project.bindings[row.speaker]?.id||(positions.find(p=>row.args[p]===true)?'fig-'+positions.find(p=>row.args[p]===true):'')):'fig-'+operation.target;
    if(positions.includes(operation.target)){const matches=[...figures].filter(([id,item])=>(positions.find(p=>item.args[p]===true)||'center')===operation.target);if(matches.length===1)target=matches[0][0];else target='';}
    if(!target&&operation.target==='speaker'&&figures.size===1)target=[...figures.keys()][0];
    if(!target||target!=='bg-main'&&!figures.has(target))throw Error('第 '+row.startLine+' 行无法确定要修改的人物，请选择人物所在位置。');
    let value;
    if(operation.kind==='filter'){
      const effect={};for(const [key,number] of Object.entries(operation.effect||{})){if(!['brightness','contrast','saturation','blur'].includes(key)||!Number.isFinite(number)||number<0||number>20)throw Error('滤镜数值无效');effect[key]=number;}
      const ms=Number(operation.duration||0);if(!Number.isFinite(ms)||ms<0||ms>60000)throw Error('过渡时间应在 0 到 60 秒之间');
      value='setTransform:'+JSON.stringify(effect)+' -target='+safeId(target)+' -duration='+ms+' -keep -next;';
    }else{if(!['expression','motion'].includes(operation.kind))throw Error('未知演出类型');const name=String(operation.value||'').trim();if(!name||/[\s;|]/.test(name))throw Error('请填写模型中实际存在的表情或动作名称');const figure=figures.get(target);value=native.write(figure,{args:{[operation.kind]:name,next:true}}).trim();}
    value=cleanSnippet(value);end=at;replacement=value+eol;
   }else if(operation.type==='statement')replacement=cleanSnippet(expand(operation.script,row,project))+(/\n$/.test(row.source)?eol:'');
   else if(operation.type==='text'){
    if(!operation.find)throw Error('查找内容不能为空');if(!row.content.includes(operation.find))continue;
    replacement=native.write(row,{content:row.content.split(operation.find).join(operation.replace??'')});
   }else if(operation.type==='parameter'){
    if(!/^[A-Za-z_][\w]*$/.test(operation.key||''))throw Error('参数名无效');
    replacement=native.write(row,{args:{[operation.key]:operation.remove?false:operation.value}});
   }else if(operation.type==='bind'){
    if(row.command!=='say'||!row.speaker)continue;const binding=project.bindings[row.speaker];
    if(!binding?.id){warnings.push(`第 ${row.startLine} 行：${row.speaker} 尚未设置 ID，已跳过`);continue;}
    const args={figureId:safeId(binding.id)};for(const p of positions)args[p]=false;replacement=native.write(row,{args});
   }else if(operation.type==='explicitIds'){
    const position=positions.find(p=>row.args[p]===true)||'center';
    if(row.command==='changeFigure'&&!row.args.id)replacement=native.write(row,{args:{id:'fig-'+position}});
    else if(row.command==='say'&&!row.args.figureId&&positions.some(p=>row.args[p]===true)){const args={figureId:'fig-'+position};for(const p of positions)args[p]=false;replacement=native.write(row,{args});}else continue;
   }else throw Error('未知批量操作');
   replacement=norm(replacement).replace(/\n/g,eol);if(end>at&&/\n$/.test(row.source)&&!replacement.endsWith(eol))replacement+=eol;
   if(model.source.slice(at,end)!==replacement)patches.push({startOffset:at,endOffset:end,before:model.source.slice(at,end),after:replacement,line:row.startLine});
  }
  patches.sort((a,b)=>a.startOffset-b.startOffset);for(let i=1;i<patches.length;i++)if(patches[i].startOffset<patches[i-1].endOffset)throw Error('操作范围重叠');
  let after=model.source;for(const p of [...patches].reverse())after=after.slice(0,p.startOffset)+p.after+after.slice(p.endOffset);
  native.parse(after);return {schemaVersion:1,path:model.path,before:model.source,after,operation,patches,warnings,changed:patches.length,beforeHash:hash(model.source),afterHash:hash(after)};
 }
 function anchor(model,row,status='待调整',operationId=''){
  const index=model.statements.findIndex(s=>s.id===row.id);
  return {id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,path:model.path,revision:model.revision,startLine:row.startLine,text:norm(row.source).trim(),previous:norm(model.statements[index-1]?.source||'').trim(),next:norm(model.statements[index+1]?.source||'').trim(),status,operationId};
 }
 function resolveAnchor(model,mark){if(mark.path!==model.path)return null;const candidates=model.statements.filter(s=>norm(s.source).trim()===mark.text);if(candidates.length===1)return candidates[0];if(mark.revision===model.revision){const exact=candidates.find(row=>row.startLine===mark.startLine);if(exact)return exact;}const matched=candidates.filter(s=>{const i=model.statements.indexOf(s);return norm(model.statements[i-1]?.source||'').trim()===mark.previous&&norm(model.statements[i+1]?.source||'').trim()===mark.next;});return matched.length===1?matched[0]:null;}
 function generatedMarkers(model,plan,operationId){let shift=0;const spans=plan.patches.map(p=>{const start=p.startOffset+shift;shift+=p.after.length-(p.endOffset-p.startOffset);return {start,end:start+p.after.length};});return model.statements.filter(s=>spans.some(p=>s.startOffset>=p.start&&s.startOffset<p.end)&&s.command!=='comment').map(s=>anchor(model,s,'待调整',operationId));}
 function inspect(model,project){
  const issues=[],states=new Map(),declared=new Set(),runs=new Map(),rowDetails=new Map();
  const issue=(row,code,message)=>issues.push({line:row.startLine,rowId:row.id,code,message});
  for(const s of model.statements){
   if(s.command==='changeFigure'){
    const implicit='fig-'+(positions.find(p=>s.args[p]===true)||'center'),id=String(s.args.id||implicit);
    if(s.content==='none'||s.content===''||s.args.clear===true){states.delete(id);declared.delete(id);runs.delete(id);}else{declared.add(id);const previous=states.get(id),state=previous?.file===s.content?{...previous}:{file:s.content};if(previous?.file!==s.content)runs.delete(id);if(s.args.motion!==undefined)state.motion=String(s.args.motion);if(s.args.expression!==undefined)state.expression=String(s.args.expression);states.set(id,state);}
   }
   if(s.command==='say'){
    const id=String(s.args.figureId||(positions.find(p=>s.args[p]===true)?'fig-'+positions.find(p=>s.args[p]===true):''));
    if(s.args.figureId&&!declared.has(String(s.args.figureId)))issue(s,'figure-not-seen','本场景此前未见 ID '+s.args.figureId+'，请核对是否由调用场景建立');
    const state=states.get(id);if(state){rowDetails.set(s.id,{...state});if(state.expression&&state.motion){const old=runs.get(id),n=old?.expression===state.expression&&old?.motion===state.motion?old.count+1:1;runs.set(id,{expression:state.expression,motion:state.motion,count:n});if(n===3)issue(s,'repeated-performance','连续 3 句的表情、动作均相同：'+state.expression+' / '+state.motion);}else runs.delete(id);}
   }
  }
  const resolvedMarkers=project.markers.filter(mark=>mark.path===model.path).map(mark=>({mark,row:resolveAnchor(model,mark)}));
  return {issues,rowDetails,resolvedMarkers};
 }
 function parseAnogo(input){
  const text=norm(input).trim().replace(/^```(?:json|yaml|yml)?\s*\n([\s\S]*?)\n```$/i,'$1');let data;
  if(text.startsWith('['))data=JSON.parse(text);else{
   const lines=text.split('\n');data=[];let current=null;
   const scalar=value=>{value=value.trim();if(value.startsWith('"'))return JSON.parse(value);if(value.startsWith("'")){if(!value.endsWith("'"))throw Error('单引号没有闭合');return value.slice(1,-1).replace(/''/g,"'");}if(/^[!&*[{]/.test(value))throw Error('请使用 AnoGO 的平面语句列表，不支持 YAML 标签、锚点或嵌套对象');return value.replace(/\s+#.*$/,'').trim();};
   for(let i=0;i<lines.length;i++){const line=lines[i];if(!line.trim()||/^\s*(?:#|---\s*$|\.\.\.\s*$)/.test(line))continue;const m=line.match(/^(\s*)(-\s+)?(背景|旁白|角色|动作|对话)\s*:\s*(.*)$/);if(!m)throw Error(`第 ${i+1} 行不是受支持的 AnoGO 字段`);if(m[2]){current={};data.push(current);}if(!current)throw Error('YAML 每条语句需要以 - 开始');if(m[3] in current)throw Error(`第 ${i+1} 行字段重复`);let value=m[4];if(/^[|>][+-]?$/.test(value.trim())){const folded=value.trim()[0]==='>',parts=[];const base=m[1].length+(m[2]?2:0);while(i+1<lines.length){const next=lines[i+1],indent=next.match(/^\s*/)[0].length;if(next.trim()&&indent<=base)break;i++;parts.push(next.trimStart());}value=parts.join(folded?' ':'\n');}else value=scalar(value);current[m[3]]=value;}
  }
  if(!Array.isArray(data)||!data.length)throw Error('请提供非空的 AnoGO 语句数组');
  return data.map((item,i)=>{if(!item||typeof item!=='object'||Array.isArray(item))throw Error(`第 ${i+1} 条语句必须是对象`);const keys=Object.keys(item);if(keys.some(k=>!['背景','旁白','角色','动作','对话'].includes(k)))throw Error(`第 ${i+1} 条包含未支持的字段`);const type='背景' in item?'background':'旁白' in item?'narration':'dialogue';const required=type==='background'?['背景']:type==='narration'?['旁白']:['角色','动作','对话'];if(required.some(k=>!(k in item)||!['string','number'].includes(typeof item[k]))||keys.length!==required.length)throw Error(`第 ${i+1} 条的字段不符合 AnoGO 格式`);return {type,...Object.fromEntries(required.map(k=>[k,String(item[k])]))};});
 }
 function importAnogo(input,project,{actions={},dialogueOnly=false}={}){
  const statements=parseAnogo(input),lines=[],warnings=[];
  const value=v=>{v=String(v);if(/[\r\n;]/.test(v))throw Error('素材路径或参数中不能含换行和分号');return v;};
  for(const [index,s] of statements.entries()){
   if(s.type==='background'){lines.push('changeBg:'+value(s.背景)+' -next;');continue;}
   if(s.type==='narration'){lines.push(':'+escapeText(s.旁白)+';');continue;}
   if(!s.角色.trim()||/[;:\r\n]/.test(s.角色))throw Error(`第 ${index+1} 条角色名无效`);
   const binding=project.bindings[s.角色],action=actions[s.角色+'/'+s.动作]||actions[s.动作];
   if(s.动作&&!action){warnings.push(`第 ${index+1} 条：${s.角色} / ${s.动作} 未映射动作`);lines.push('; 动作待映射：'+s.角色+' / '+s.动作.replace(/[\r\n]/g,' '));}
   if(binding?.figure&&!dialogueOnly){let change='changeFigure:'+value(binding.figure)+' -id='+safeId(binding.id);if(action?.motion)change+=' -motion='+value(action.motion);if(action?.expression)change+=' -expression='+value(action.expression);lines.push(change+' -next;');}
   else if(!dialogueOnly&&s.动作)warnings.push(`第 ${index+1} 条：${s.角色} 尚未配置立绘文件`);
   lines.push(s.角色+':'+escapeText(s.对话)+(!dialogueOnly&&binding?.id?' -figureId='+safeId(binding.id):'')+';');
  }
  return {script:lines.join('\n')+'\n',warnings,statements:statements.length,needsMapping:!dialogueOnly&&warnings.length>0};
 }
 function musicProject(value={}){
  const version=value.schemaVersion===undefined?1:Number(value.schemaVersion);if(![1,2].includes(version))throw Error('音乐时间线版本暂不支持');
  if(!Array.isArray(value.tracks||[])||(value.tracks||[]).length>64)throw Error('音乐时间线最多包含 64 个片段');const tracks=(value.tracks||[]).map((track,i)=>{
   const n=(key,fallback,min,max)=>{const v=Number(track[key]??fallback);if(!Number.isFinite(v)||v<min||v>max)throw Error(`音乐 ${i+1} 的 ${key} 超出范围`);return v;};
   const durationSeconds=n('durationSeconds',0,.001,86400),fadeInSeconds=n('fadeInSeconds',0,0,86400),fadeOutSeconds=n('fadeOutSeconds',0,0,86400);
   if(fadeInSeconds+fadeOutSeconds>durationSeconds)throw Error(`音乐 ${i+1} 的淡入淡出超过片段长度`);
   return {lane:Math.floor(n('lane',0,0,63)),fullLength:!!track.fullLength,id:String(track.id||`track-${i}`),name:String(track.name||track.file?.split('/').pop()||'音乐'),scene:version===1&&track.scene?safePath(track.scene):'',file:safePath(track.file),startSeconds:n('startSeconds',0,0,86400),offsetSeconds:n('offsetSeconds',0,0,86400),durationSeconds,volume:n('volume',100,0,100),fadeInSeconds,fadeOutSeconds,loop:!!track.loop,enabled:track.enabled!==false};
  });
  const legacyPlayers=version===1?Object.fromEntries(Object.entries(value.players||{}).filter(([key,count])=>typeof count==='number'&&Number.isInteger(count)&&count>=1&&count<=64)):{},players=version===2?Math.max(1,Math.min(64,Number.isInteger(value.players)?value.players:1)):Math.max(1,...Object.values(legacyPlayers),...tracks.map(t=>t.lane+1));
  return {schemaVersion:version,enabled:value.enabled!==false,replaceGameBgm:!!value.replaceGameBgm,players,legacyPlayers,tracks};
 }
 root.WebVideoProjectCore={norm,hash,safeId,safePath,escapeText,metadata,expand,makePlan,anchor,resolveAnchor,generatedMarkers,inspect,parseAnogo,importAnogo,musicProject};
})(typeof window==='undefined'?globalThis:window);

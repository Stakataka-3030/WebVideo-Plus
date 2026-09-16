/* One conversion owns all of this state. Only the resulting text and backup leave the operation. */
(function(root){
 const positions=['center','left','right','left13','right13','left14','right14'],own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k),fold=v=>String(v??'').trim().toLowerCase(),str=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'',norm=s=>String(s).replace(/\r\n/g,'\n');
 function plan(model,options,mapping,native){
  if(!model)throw Error('请先打开剧本。');
  if(!mapping||mapping.fatal)throw Error('角色映射表不可用，请先调整 id 对应表。');
  const table=new Map(Object.entries(mapping.nameToId||{}).map(([name,id])=>[fold(name),str(id)])),knownIds=new Map([...table.values()].map(id=>[fold(id),id]));
  if(!table.size)throw Error('角色映射表为空。');
  const inside=()=>true;
  const aliases=[...table].map(([name,id])=>({name:name.replace(/[\s\u3000]+/g,' '),id})),pathCache=new Map(),warnings=[],patches=[],stats={figures:0,dialogues:0,effects:0,exitRows:0,skipped:0};
  const warn=(row,message)=>{if(inside(row)){warnings.push('第 '+row.startLine+' 行：'+message);stats.skipped++;}};
  function matchPath(path){const value=fold(path).replace(/\\/g,'/').replace(/[\s\u3000]+/g,' ');if(pathCache.has(value))return pathCache.get(value);let best=0,ids=new Set();for(const {name,id} of aliases){let at=-1,matched=false;while((at=value.indexOf(name,at+1))>=0){const latin=/^[a-z]/i.test(name)||/[a-z]$/i.test(name);if(!latin||(!/[a-z]/i.test(value[at-1]||'')&&!/[a-z]/i.test(value[at+name.length]||''))){matched=true;break;}}if(matched){const score=name.replace(/\s/g,'').length;if(score>best){best=score;ids=new Set([id]);}else if(score===best)ids.add(id);}}
   if(!ids.size)for(const token of value.split(/[\/_.\-\s]+/)){const id=knownIds.get(token);if(id)ids.add(id);}const result={id:ids.size===1?[...ids][0]:null,ambiguous:ids.size>1};pathCache.set(value,result);return result;
  }
  const rawByLine=new Map((native.parse(model.source).sentenceList||[]).filter(s=>!s.isLineBreakHolder).map(s=>[s.startLine,s]));let speaker='';
  const items=model.statements.map(row=>{const raw=rawByLine.get(row.startLine-1),a=row.args,pos=positions.find(p=>a[p]===true)||'center';if(row.command==='say'){if(own(a,'speaker'))speaker=String(a.speaker??'');if(raw?.commandRaw===''||a.clear===true)speaker='';}const gone=row.command==='changeFigure'&&(!row.content||row.content==='none'||a.clear===true),existing=str(a.id),match=row.command==='changeFigure'&&!gone?matchPath(row.content):null;return {row,pos,gone,existing,hasExisting:own(a,'id')&&a.id!==false&&a.id!=='',actor:match?.id||knownIds.get(fold(existing))||null,ambiguous:match?.ambiguous,speaker:row.command==='say'?speaker:'',sayActor:row.command==='say'?table.get(fold(speaker)):null};});
  const stage=new Map(),renamed=new Map();let order=0;const liveAt=pos=>[...stage.values()].filter(v=>v.pos===pos).sort((a,b)=>a.order-b.order),lookup=id=>stage.get(renamed.get(id)||id);
  const expectedId=item=>inside(item.row)&&item.actor&&(!item.hasExisting||options.overwrite)?item.actor:item.existing||'fig-'+item.pos;
  function write(row,variants){if(!inside(row)||!variants.length)return;const eol=model.source.includes('\r\n')?'\r\n':'\n';let text=variants.map((value,i)=>{const {__content,...args}=value;return norm(native.write(row,{...(typeof __content==='string'?{content:__content}:{}),args:{...args,...(i<variants.length-1?{next:true}:{})}})).trimEnd();}).join('\n');if(/\n$/.test(row.source))text+='\n';text=text.replace(/\n/g,eol);if(text!==model.source.slice(row.startOffset,row.endOffset))patches.push({startOffset:row.startOffset,endOffset:row.endOffset,before:row.source,after:text,line:row.startLine});}
  for(let index=0;index<items.length;index++){
   const item=items[index],{row,pos,existing}=item,a=row.args;
   if(row.command==='changeFigure'){
    if(item.gone){let victims=existing?[lookup(existing)].filter(Boolean):liveAt(pos);if(!victims.length){warn(row,'没有找到对应的在场角色，离场语句保持原样。');continue;}
     if(inside(row)&&(!item.hasExisting||options.overwrite)){
      write(row,victims.map(v=>({id:v.custom?v.id:false})));stats.figures++;stats.exitRows+=Math.max(0,victims.length-1);
     }
     for(const victim of victims)stage.delete(victim.id);continue;
    }
    const previous=existing?lookup(existing):item.actor?[...stage.values()].find(v=>fold(v.actor)===fold(item.actor)&&v.pos===pos):stage.get('fig-'+pos);
    const actor=item.actor||previous?.actor||null;let output=existing||'fig-'+pos,custom=!!existing;
    if(inside(row)&&(!item.hasExisting||options.overwrite)){
     if(item.ambiguous){warn(row,'路径匹配到多个角色，未重新推断角色。');if(previous&&existing){output=previous.id;custom=previous.custom;write(row,[{id:output}]);}}
     else if(actor){output=actor;custom=true;const replacements=[];if(previous&&existing&&previous.id!==output){replacements.push({__content:'none',id:previous.id,next:true});stats.exitRows++;}replacements.push({id:output});write(row,replacements);stats.figures++;}
     else warn(row,'立绘路径没有匹配到角色，保持原样。');
    }
    if(existing&&output!==existing)renamed.set(existing,output);
    if(previous&&existing&&previous.id!==output)stage.delete(previous.id);
    stage.set(output,{id:output,actor,pos,file:row.content,custom,order:++order});continue;
   }
   if(row.command==='say'){
    if(!inside(row)||!item.speaker)continue;const hasId=own(a,'figureId')&&a.figureId!==false&&a.figureId!=='';
    if(hasId&&!options.overwrite)continue;if(!item.sayActor){warn(row,'说话人名字没有匹配到角色，保持原样。');continue;}
    const matches=[...stage.values()].filter(v=>fold(v.actor)===fold(item.sayActor)),hasPosition=positions.some(p=>a[p]===true),preferred=hasPosition?matches.filter(v=>v.pos===pos):matches,candidates=(preferred.length?preferred:matches).sort((a,b)=>b.order-a.order);let id=item.sayActor;
    if(!options.ignorePresence){if(!candidates.length){warn(row,'角色不在场，对话保持原样。');continue;}const present=candidates[0];if(!present.custom){warn(row,'在场立绘路径未能匹配角色 ID，对话保持原样。');continue;}id=present.id;}
    const args={figureId:id,id:true};for(const p of positions)args[p]=false;write(row,[args]);stats.dialogues++;continue;
   }
   if(!inside(row)||!str(a.target))continue;
   const target=str(a.target),slot=target.startsWith('fig-')&&positions.includes(target.slice(4))?target.slice(4):null;let targets=[];
   if(slot){targets=liveAt(slot).map(v=>v.id);if(!targets.length){for(let n=index+1;n<items.length&&items[n].row.groupId===row.groupId;n++){const future=items[n];if(future.row.command==='changeFigure'&&!future.gone&&future.pos===slot)targets.push(expectedId(future));}}}
   else if(renamed.has(target))targets=[renamed.get(target)];else{for(let n=index+1;n<items.length&&items[n].row.groupId===row.groupId;n++){const future=items[n];if(future.row.command==='changeFigure'&&!future.gone&&future.existing===target){targets=[expectedId(future)];break;}}}
   targets=[...new Set(targets)];if(targets.length&&(targets.length>1||targets[0]!==target)){write(row,targets.map(id=>({target:id})));stats.effects++;}
  }
  patches.sort((a,b)=>a.startOffset-b.startOffset);for(let n=1;n<patches.length;n++)if(patches[n].startOffset<patches[n-1].endOffset)throw Error('语句改写发生重叠，未修改剧本。');
  let after=model.source;for(const patch of [...patches].reverse())after=after.slice(0,patch.startOffset)+patch.after+after.slice(patch.endOffset);native.parse(after);
  return {path:model.path,before:model.source,after,patches,changed:patches.length,warnings,stats,operation:{type:'idize'}};
 }
 root.WebVideoIdConversion={plan};
})(window);

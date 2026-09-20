/* Read-only projection. A row always retains one original statement ID, even if split into display parts. */
(function(root){
 'use strict';
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k),positions=['center','left','right','left13','right13','left14','right14'];
 const controls=new Set(['changeScene','callScene','return','choose','chooseLabel','jumpLabel','getUserInput','if','setVar','showVars']);
 const hidden=new Set([...controls,'label','unlockCg','unlockBgm','wait','applyStyle','callSteam','end','bgm']);
 const animations=new Set(['setAnimation','setComplexAnimation','setTransform','setTempAnimation','setTransition']);
 const specials=new Set(['video','playVideo','intro','filmMode','setTextbox','miniAvatar']);
 const labels={changeBg:'切换背景',changeFigure:'立绘调整',playEffect:'效果声音',setAnimation:'调用动画',setComplexAnimation:'复杂动画',setTransform:'单段动画',setTempAnimation:'多段动画',setTransition:'进出场动画',pixi:'使用特效',pixiPerform:'使用特效',pixiInit:'清除特效',video:'播放视频',playVideo:'播放视频',intro:'全屏文字',filmMode:'电影模式',setTextbox:'文本显示',miniAvatar:'角落头像'};
 const fmt=value=>typeof value==='boolean'?(value?'是':'否'):typeof value==='number'?String(value):Array.isArray(value)?value.map(fmt).join('，'):typeof value==='object'?JSON.stringify(value):String(value??'');
 const fileName=value=>String(value||'').replace(/\\/g,'/').split('/').at(-1)||'未填写';
 const parse=value=>{try{if(value&&typeof value==='object')return value;return JSON.parse(String(value||'{}'));}catch{return null;}};
 const number=(value,fallback)=>value===undefined||value===''?fallback:Number.isFinite(Number(value))?Number(value):value;
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const ordinal=n=>n<=10?['零','一','二','三','四','五','六','七','八','九','十'][n]:n<20?'十'+ordinal(n-10):n<100?ordinal(Math.floor(n/10))+'十'+(n%10?ordinal(n%10):''):String(n);
 const part=(title,items=[],footer='')=>({title,items,footer});
 const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
 const animationCache=new Map();
 const resourceKey=(path,name)=>path.split('/game/scene/')[0]+'/game/animation/'+name+'.json';
 function loadAnimations(model,onUpdate){
  if(typeof root.fetch!=='function')return;const names=[...new Set(model.statements.filter(s=>s.command==='setAnimation').map(s=>s.content))];
  for(const name of names){if(!name||name.split(/[\\/]/).some(p=>p==='..'||p==='.')||/[:%]/.test(name))continue;const key=resourceKey(model.path,name),old=animationCache.get(key);if(old?.pending)continue;
   const entry={...old,pending:true,checkedAt:Date.now()};animationCache.set(key,entry);
   (async()=>{const controller=new root.AbortController(),timer=setTimeout(()=>controller.abort(),3000);let data=null;try{const response=await root.fetch('/'+key.split('/').map(encodeURIComponent).join('/'),{cache:'no-store',signal:controller.signal});if(response.ok&&Number(response.headers.get('content-length')||0)<=1048576){const text=await response.text();if(text.length<=1048576){const parsed=JSON.parse(text);data=Array.isArray(parsed)?parsed:Array.isArray(parsed.effects)?parsed.effects:null;}}}catch{}finally{clearTimeout(timer);}const changed=!old||!equal(old.data,data);animationCache.set(key,{data,pending:false,checkedAt:Date.now()});if(changed)onUpdate();})();
  }
 }
 function derive(path,source,parsed,types,animationData){
  const M=root.WebVideoNavigationMetadata,defaults=Object.fromEntries(Object.entries(M.fields).map(([k,v])=>[k,v.default]));
  const lines=source.split('\n'),offsets=[0];for(let i=0;i<lines.length;i++)offsets.push(offsets[i]+lines[i].length+(i<lines.length-1?1:0));
  const statements=[],rows=[],figures=new Map(),effects=new Map(),transitions=new Map(),sounds=new Map(),groups=new Map();
  let speaker='',section=null,previous=null,group=0,firstManualLine=null,firstBgmLine=null,pending=[];
  const idLabel=value=>{const id=String(value??''),names=root.WebVideoCharacterMap?root.WebVideoCharacterMap.names():M.characterNames,key=id.toLowerCase();return own(names,key)&&names[key]?names[key]:id;};
  const targetLabel=value=>value==='bg-main'?'背景':value?.startsWith('fig-')&&M.positions[value.slice(4)]?M.positions[value.slice(4)]+'人物':idLabel(value)||'未填写';
  const flatten=value=>{const result={};if(!value||typeof value!=='object')return result;for(const [key,spec] of Object.entries(M.fields)){const v=get(value,spec.path)??value[key];if(v!==undefined)result[key]=number(v,v);}return result;};
  const figureLabel=(args,id)=>String(args.id??'')?idLabel(id):targetLabel(id);
  const speakerSource=args=>{
   const characterNames=root.WebVideoCharacterMap?root.WebVideoCharacterMap.names():M.characterNames;
   const flags=positions.filter(key=>own(args,key)&&args[key]!==false),hasId=own(args,'figureId')&&args.figureId!==''&&args.figureId!==false&&args.figureId!==null&&args.figureId!==undefined,idMode=args.id===true;
   const invalid=()=>({label:'！参数无效',invalid:true,type:'invalid'});
   if(own(args,'figureId')&&!hasId)return invalid();
   if(flags.some(key=>args[key]!==true)||flags.length>1||(own(args,'id')&&args.id!==true&&args.id!==false))return invalid();
   if(hasId||idMode){
    if(flags.length||!hasId||!['string','number'].includes(typeof args.figureId))return invalid();
    const id=String(args.figureId);if(!id.trim()||id!==id.trim()||!figures.has(id))return invalid();
    return {label:idLabel(id),invalid:false,type:'id'};
   }
   return {label:flags.length?M.speakerPositions[flags[0]]:'画外音',invalid:false,type:flags.length?'position':'offscreen'};
  };
  const effectParts=(row,raw,frameIndex,base,last)=>{
   const input=parse(raw);if(!input||Array.isArray(input))return {parts:[part(labels[row.command],['参数无法解析'])],state:last};
   const reset=row.args.writeDefault===true&&!row.args.parallel&&!row.args.ignoreDefault;
   const current={...(reset?defaults:base),...flatten(input)};
   const duration=number(input.duration??row.args.duration,row.command==='setTransform'?500:0),ease=input.ease??row.args.ease??'';
   const footer=duration!==0?(M.eases[ease]||ease||'默认')+' · '+fmt(duration):'';
   const filterName=frameIndex===null?root.WebVideoFilterLibrary?.match(input,row.target):null;if(filterName)return {parts:[{...part('滤镜：'+filterName,[],footer),filterName,frameIndex:0}],state:current};
   const parts=[];for(const category of M.groups){const changed=category.keys.filter(key=>!equal(current[key],last[key]));if(changed.length)parts.push(part((frameIndex!==null?'第'+ordinal(frameIndex+1)+'帧 · ':'')+category.title,changed.map(key=>M.fields[key].label+'：'+fmt(current[key])),footer));}
   if(!parts.length&&duration!==0)parts.push(part(frameIndex!==null?'第'+ordinal(frameIndex+1)+'帧':labels[row.command],[],footer));
   return {parts:parts.map(p=>({...p,frameIndex:frameIndex??0})),state:current};
  };
  const moreParts=(args,old)=>{
   const next={general:{zIndex:-1,...(old?.general||{})},blink:{...(old?.blink||Object.fromEntries(Object.entries(M.blink).map(([k,v])=>[k,v.default])))},focus:{...(old?.focus||Object.fromEntries(Object.entries(M.focus).map(([k,v])=>[k,v.default])))}};
   const general={bounds:'自定义 Live2D 绘制范围',zIndex:'显示层级',skin:'皮肤',animationFlag:'图片差分',mouthOpen:'张开嘴',mouthHalfOpen:'半张嘴',mouthClose:'闭上嘴',eyesOpen:'睁开眼睛',eyesClose:'闭上眼睛'};
   const parts=[];const changed=[];for(const [key,label] of Object.entries(general))if(own(args,key)){const value=number(args[key],args[key]);if(!equal(value,next.general[key]??''))changed.push(label+'：'+fmt(value));next.general[key]=value;}
   if(changed.length)parts.push(part('通用',changed));
   for(const [key,title] of [['blink','眨眼'],['focus','注视']])if(own(args,key)){const input=parse(args[key]);if(input){const current={...Object.fromEntries(Object.entries(M[key]).map(([k,v])=>[k,v.default])),...input};const fields=Object.keys(M[key]).filter(k=>!equal(current[k],next[key][k]));if(fields.length)parts.push(part(title,fields.map(k=>M[key][k].label+'：'+fmt(current[k]))));next[key]=current;}}
   return {parts,state:next};
  };
  for(const sentence of parsed.sentenceList||[]){
   if(sentence.isLineBreakHolder)continue;const start=Number(sentence.startLine),end=Number(sentence.endLine);if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=lines.length)throw Error('Terre 解析器返回了无效行号');
   const args=Object.fromEntries((sentence.args||[]).map(a=>[a.key,a.value])),command=types[sentence.command]||sentence.commandRaw||'unknown',content=String(sentence.content||'');
   if(!previous||previous.args.next!==true)group++;
   const row={id:`${start}:${end}`,command,startLine:start+1,endLine:end+1,startOffset:offsets[start],endOffset:offsets[end+1],source:source.slice(offsets[start],offsets[end+1]),content,args,sectionId:section,kind:'technical',speaker:'',title:content,annotations:[],parts:[],groupId:group,parentId:null,attachment:null,main:false,special:false,target:null};
   statements.push(row);previous=row;
   const singleChoice=root.WebVideoTimelineCore.singleChooseInfo(row);row.singleLineHint=singleChoice.isHint;row.convertibleSingleChoose=singleChoice.convertible;row.ignoredInTiming=(controls.has(command)&&!singleChoice.isHint)||args.userForward===true||own(args,'when');if(row.ignoredInTiming){if(firstManualLine===null)firstManualLine=row.startLine;if(!row.convertibleSingleChoose)continue;}
   if(command==='bgm'&&firstBgmLine===null)firstBgmLine=row.startLine;
   if(hidden.has(command)&&!singleChoice.isHint&&!row.convertibleSingleChoose)continue;
   if(singleChoice.isHint){const seconds=singleChoice.duration/1000;row.kind='event';row.main=true;row.special=true;row.title='单行提示 · '+singleChoice.text;row.parts=[part('单行提示',[singleChoice.text,'持续：'+(Number.isInteger(seconds)?seconds:seconds.toFixed(1))+' 秒'])];row.annotations.push('自动继续');}
   else if(row.convertibleSingleChoose){row.kind='event';row.main=true;row.special=true;row.title='单选分支 · '+singleChoice.text;row.parts=[part('单选分支',[singleChoice.text,'原跳转：'+singleChoice.target])];row.annotations.push('可转为单行提示');}
   else if(command==='comment'){const marker=content.match(/(?:TODO|FIXME|待办|待修|完成|标记)[：:\s]*(.*)/i);if(marker)pending.push({text:marker[0],line:row.startLine});continue;}
   if(command==='say'){
    if(args.speaker!==undefined&&args.speaker!==null)speaker=String(args.speaker);if(sentence.commandRaw===''||args.clear===true)speaker='';
    row.kind='dialogue';row.main=true;row.speaker=speaker;row.narration=!speaker;if(!row.narration){const source=speakerSource(args);row.speakerSource=source.label;row.speakerSourceType=source.type;row.invalidSpeakerSource=source.invalid;}row.displaySpeaker=speaker||'旁白';row.title=content.replace(/\|/g,' / ');row.target=String(args.figureId??'')||(positions.find(p=>args[p]===true)?'fig-'+positions.find(p=>args[p]===true):null);row.parts=[part(row.title)];const activeFigure=row.target?figures.get(row.target):figures.size===1?[...figures.values()][0]:null;if(activeFigure?.motion)row.annotations.push('动 '+activeFigure.motion);if(activeFigure?.expression)row.annotations.push('表 '+activeFigure.expression);
   }else if(command==='changeBg'){
    row.kind='section';row.main=true;row.target='bg-main';row.title='切换背景 · '+(content&&content!=='none'?fileName(content):'清除');row.parts=[part(row.title)];section=row.id;row.sectionId=section;if(own(args,'transform'))row.embeddedEffects=effectParts(row,args.transform,null,defaults,effects.get('bg-main')||defaults).parts;effects.set('bg-main',{...defaults,...flatten(parse(args.transform))});
   }else if(command==='changeFigure'){
    const position=positions.find(p=>args[p]===true)||'center',id=String(args.id??'')||'fig-'+position,gone=!content||content==='none'||args.clear===true;
    let old=figures.get(id);if(!old||old.file!==content)old=[...figures.values()].find(item=>item.file===content&&item.position===position);
    row.target=id;
    if(gone){row.kind='figure';row.main=true;row.title='人物离场 · '+figureLabel(args,id);row.parts=[part(row.title)];figures.delete(id);effects.delete(id);}
    else if(!old||old.file!==content){old=null;const priorEffects=effects.get(id)||defaults;const more=moreParts(args,null);figures.set(id,{file:content,position,more:more.state,motion:own(args,'motion')?String(args.motion):old?.motion,expression:own(args,'expression')?String(args.expression):old?.expression});effects.set(id,{...defaults,...flatten(parse(args.transform))});row.kind='figure';row.main=true;row.figureEntering=true;if(own(args,'transform'))row.embeddedEffects=effectParts(row,args.transform,null,defaults,priorEffects).parts;row.title='人物登场 · '+figureLabel(args,id)+' · '+content;row.parts=[part(row.title)];}
    else {const more=moreParts(args,old.more);figures.set(id,{file:content,position,more:more.state,motion:own(args,'motion')?String(args.motion):old?.motion,expression:own(args,'expression')?String(args.expression):old?.expression});row.kind='event';row.title='立绘调整';row.parts=more.parts;row.attachRule='figure';if(!row.parts.length)continue;}
   }else if(command==='playEffect'){
    row.kind='event';row.title='效果声音';row.attachRule='sound';const id=String(args.id??''),old=id?sounds.get(id):null,on=!old?.active;const file=old?.active?old.file:fileName(content);
    if(id){row.parts=[part('效果声音',on?[file,'音量：'+fmt(number(args.volume,100)),'ID：'+idLabel(id),'启用']:[file,'ID：'+idLabel(id),'关闭'])];sounds.set(id,{active:on,file});}else row.parts=[part('效果声音',[fileName(content),'音量：'+fmt(number(args.volume,100))])];
   }else if(animations.has(command)){
    row.kind='event';row.target=String(args.target??'').trim()||null;row.attachRule='animation';row.title=labels[command];
    if(command==='setAnimation'){const flags={writeDefault:'补充默认值',keep:'跨语句动画',parallel:'并行动画',ignoreDefault:'默认变换和效果'};row.parts=[part(row.title,['动画文件：'+(content||'未填写'),...Object.entries(flags).filter(([key])=>args[key]===true).map(([,label])=>label+'：是')])];if(row.target){const frames=own(animationData,content)?animationData[content]:animationCache.get(resourceKey(path,content))?.data;if(frames===undefined)effects.set(row.target,{});else if(frames?.length){const before=effects.get(row.target)||defaults,reset=args.writeDefault===true&&!args.parallel&&!args.ignoreDefault;effects.set(row.target,{...(reset?defaults:before),...flatten(frames.at(-1))});}}}
    else if(command==='setComplexAnimation'){row.parts=[part(row.title,['动画名：'+content,'持续时间：'+fmt(number(args.duration,0))])];const endings={universalSoftIn:{alpha:1},universalSoftOff:{alpha:0},testblur:{alpha:1}};if(row.target&&endings[content])effects.set(row.target,{...(effects.get(row.target)||defaults),...endings[content]});}
    else if(command==='setTransition'){const old=transitions.get(row.target)||{},items=[];for(const [key,label] of [['enter','进场动画'],['exit','出场动画']])if(own(args,key)){if(!equal(args[key],old[key]??''))items.push(label+'：'+(args[key]||'无'));old[key]=args[key];}if(args.ignoreDefault===true)items.push('默认变换和效果：是');transitions.set(row.target,{...old});row.parts=[part(row.title,items)];}
    else {const prior=row.target&&effects.has(row.target)?effects.get(row.target):{...defaults};const raw=parse(content),frames=command==='setTempAnimation'?(Array.isArray(raw)?raw:[]):[raw];let last=prior;
     for(let frame=0;frame<frames.length;frame++){const result=effectParts(row,frames[frame],command==='setTempAnimation'?frame:null,prior,last);row.parts.push(...result.parts);last=result.state;}
     if(!row.parts.length)row.parts=[part(row.title)];if(row.target)effects.set(row.target,last);
    }
   }else if(['pixi','pixiPerform','pixiInit'].includes(command)){
    row.kind='event';row.title=labels[command];row.attachRule='effect';row.parts=[part(row.title,command==='pixiInit'?[]:[M.nativeEffects?.[content]||idLabel(content)])];
   }else if(specials.has(command)){
    row.kind='event';row.main=true;row.special=true;row.title=labels[command];
    if(command==='miniAvatar'){const enabled=!!content&&content!=='none';row.title=enabled?'开启角落头像':'关闭角落头像';row.parts=[part(row.title,enabled?[fileName(content)]:[])];}
    else if(command==='filmMode')row.parts=[part('电影模式：'+(content==='enable'?'开':'关'))];
    else if(command==='setTextbox')row.parts=[part('文本显示：'+(content==='hide'?'关':'开'))];
    else row.parts=[part(row.title,[command==='intro'?content.replace(/\|/g,' / '):fileName(content)])];
   }else continue;
   row.annotations.push(...pending.map(m=>m.text));row.annotationLines=pending.map(m=>m.line);pending=[];rows.push(row);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(row);
  }
  // Match within the native contiguous -next chain. The final, unflagged statement is included.
  for(const members of groups.values()){
   let background=null;for(const row of members){if(row.command==='changeBg')background=row;if(row.attachRule==='effect'){if(background){row.parentId=background.id;row.attachment='after';}else row.main=true;}}
   const nextFigure=new Map(),futureFigures=new Map();for(let index=members.length-1;index>=0;index--){const row=members[index];if(row.target)nextFigure.set(row.id,futureFigures.get(row.target));if(row.command==='changeFigure'&&row.main){if(row.figureEntering)futureFigures.set(row.target,row);else futureFigures.delete(row.target);}}
   const nextMain=new Map();let following=null;for(let index=members.length-1;index>=0;index--){const row=members[index];nextMain.set(row.id,following);if(row.main&&!row.special)following=row;}
   let preceding=null;const byTarget=new Map();for(const row of members){
    if(row.main){if(!row.special){preceding=row;if(row.target)byTarget.set(row.target,row);}continue;}
    if(row.parentId)continue;let owner;
    if(row.attachRule==='figure')owner=nextMain.get(row.id);
    else if(row.attachRule==='sound')owner=preceding;
    else if(row.attachRule==='animation'&&row.target)owner=byTarget.get(row.target)||(['setTransform','setTempAnimation'].includes(row.command)?nextFigure.get(row.id):null);
    if(owner){row.parentId=owner.id;row.attachment=row.attachRule==='figure'?'before':'after';row.displaySpeaker=owner.displaySpeaker||owner.speaker||'';}
    if(animations.has(row.command)&&!row.parentId)row.parts=row.parts.map(p=>({...p,items:['目标：'+targetLabel(row.target),...p.items]}));
   }
  }
  let followingMain=null;for(let index=statements.length-1;index>=0;index--){const row=statements[index];if(followingMain?.groupId!==row.groupId)followingMain=null;if(row.command==='changeFigure'&&!row.main&&!row.parts.length&&followingMain)row.navigationOwnerId=followingMain.id;if(row.main&&!row.special)followingMain=row;}
  root.WebVideoPresetLibrary?.decorate(rows,statements);
  if(pending.length&&rows.length)rows.at(-1).annotations.push(...pending.map(m=>m.text));
  return {path,revision:root.WebVideoTimelineCore.fingerprint(source),source,rows,statements,lineCount:lines.length,firstManualLine,firstBgmLine,navigationVersion:1};
 }
 root.WebVideoNavigation={derive,loadAnimations};
})(typeof window==='undefined'?globalThis:window);

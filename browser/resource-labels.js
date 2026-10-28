function WebVideoFormatFigureReference(value){
 if(typeof value!=='string')return value;
 try{
  let source,path;const legacy=/^(?:(?:figure|background|bgm|vocal|video)\/)?__shared\/([a-f0-9]+)\/(.+)$/i.exec(value);
  if(legacy){source=legacy[1];path=legacy[2];}
  else{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname))return value;const match=/^\/webvideo-shared\/([a-f0-9]{32})\/([a-f0-9]{32})\/(.+)$/i.exec(url.pathname);if(!match)return value;source=match[2];path=match[3];}
  const parts=path.split('/').map(part=>{try{return decodeURIComponent(part);}catch{return part;}}),name=parts.pop(),parents=parts;
  return name+' · 共享 '+source.slice(0,4)+'…'+source.slice(-4)+(parents.length?' / '+parents.join(' / '):'');
 }catch{return value;}
}
function WebVideoResourceAddress({value}){
 const label=WebVideoFormatFigureReference(value);
 return reactExports.createElement('span',{title:value,'data-wvp-resource-label':true,style:label===value?{display:'inline'}:{display:'inline-block',verticalAlign:'middle',minWidth:0,maxWidth:'min(34em,calc(100% - 64px))',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},label,'\u00a0\u00a0');
}
function WebVideoFormatResourceText(value){
 if(typeof value!=='string')return value;
 if(/^(?:(?:figure|background|bgm|vocal|video)\/)?__shared\//i.test(value))return WebVideoFormatFigureReference(value);
 return value.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]+)?\/webvideo-shared\/[a-f0-9]{32}\/[a-f0-9]{32}\/[^\s;"'<>]+|(?:(?:figure|background|bgm|vocal|video)\/)?__shared\/[a-f0-9]+\/[^;"'<>，]+?(?=\s+[·-]|[;"'<>，]|$)/gi,WebVideoFormatFigureReference);
}
function WebVideoResourceText({value}){
 const label=WebVideoFormatResourceText(value);if(label===value)return value;
 return reactExports.createElement('span',{title:value,style:{display:'inline-block',verticalAlign:'bottom',minWidth:0,maxWidth:'100%',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},label);
}
function WebVideoSharedDirectoryAddress({value,disabled}){
 const [focused,setFocused]=reactExports.useState(false),parts=String(value||'').split(/[\\/]/),short=parts.length>3?parts[0]+' / … / '+parts.slice(-2).join(' / '):value;
 return reactExports.createElement(Input,{value:focused?value:short,readOnly:true,disabled,placeholder:'跟随上方选择的游戏引擎','aria-label':'共享素材来源文件夹',title:value,onFocus:()=>setFocused(true),onBlur:()=>setFocused(false),style:{minWidth:0,flex:1}});
}
function WebVideoFigureAddress({value}){
 return reactExports.createElement('span',{title:value,'data-wvp-figure-label':true,style:{display:'block',flex:'1 1 auto',minWidth:0,maxWidth:'100%',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},WebVideoFormatFigureReference(value));
}
function WebVideoSharedLibraryNames(libraries){
 const counts=new Map(),labels=new Map();for(const item of libraries)counts.set(item.name,(counts.get(item.name)||0)+1);
 for(const item of libraries)labels.set(item.id,item.name+(counts.get(item.name)>1?' · '+item.id.slice(0,4)+'…'+item.id.slice(-4):''));
 return labels;
}

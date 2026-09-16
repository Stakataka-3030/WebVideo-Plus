/* This renderer groups display rows only; selection and editing still use original statement IDs. */
function webVideoRenderTree({h,all,visible,selector,row,collapsedGroups,toggleGroup}){
 if(!selector){const available=new Set(visible.map(item=>item.id));visible=visible.filter(item=>!item.presetContinuation||!available.has(item.presetContinuation));}
 const wanted=new Set(visible.map(item=>item.id)),byId=new Map(all.map(item=>[item.id,item]));
 const childrenByParent=new Map();for(const item of visible)if(item.parentId){if(!childrenByParent.has(item.parentId))childrenByParent.set(item.parentId,[]);childrenByParent.get(item.parentId).push(item);}
 const rootIds=new Set();for(const item of visible)rootIds.add(item.parentId&&byId.has(item.parentId)?item.parentId:item.id);
 const roots=all.filter(item=>rootIds.has(item.id)),linked=(key)=>h('div',{className:'wvp-simultaneous',role:'img',key,'aria-label':'同时',title:'连续执行 · 同时'},h(LinkOne,{theme:'outline',size:'16',strokeWidth:3,fill:'var(--primary)'}));
 const renderParts=(item,secondary=false,contextOnly=false,hasChildren=false)=>{
  const parts=item.parts?.length?item.parts:[{title:item.title,items:[],footer:''}];
  return parts.map((part,index)=>h(reactExports.Fragment,{key:item.id+':'+index},!secondary&&index>0&&part.frameIndex===parts[index-1].frameIndex&&linked(item.id+':part-link:'+index),row(item,selector,{part,index,secondary,contextOnly,hasChildren:index===0&&hasChildren,collapsed:collapsedGroups.has(item.id),toggle:()=>toggleGroup(item.id)})));
 };
 return roots.map((item,index)=>{
  const children=childrenByParent.get(item.id)||[],embedded=item.embeddedEffects||[],open=!collapsedGroups.has(item.id),previous=roots[index-1];
  return h(reactExports.Fragment,{key:item.id+':block'},previous&&previous.groupId===item.groupId&&linked(previous.id+':'+item.id),h('div',{className:'wvp-component-block'},open&&children.filter(child=>child.attachment==='before').flatMap(child=>renderParts(child,true)),...renderParts(item,false,!wanted.has(item.id),children.length>0||embedded.length>0),open&&embedded.map((part,index)=>h(reactExports.Fragment,{key:item.id+':embedded:'+index},row(item,selector,{part,index:index+1,secondary:true}))),!open&&(children.length>0||embedded.length>0)&&h('button',{type:'button',className:'wvp-collapsed-summary','aria-label':'展开附属组件',onClick:()=>toggleGroup(item.id)},[...embedded.map(part=>part.title),...children.flatMap(child=>(child.parts?.length?child.parts:[{title:child.title}]).map(part=>part.title))].join(' · ')),open&&children.filter(child=>child.attachment!=='before').flatMap(child=>renderParts(child,true))));
 });
}

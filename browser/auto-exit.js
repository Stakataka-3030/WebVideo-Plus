const WebVideoAutoExit=(()=>{
 const positions=['center','left','right','left13','right13','left14','right14'];
 const text=value=>typeof value==='string'||typeof value==='number'?String(value):'';
 const file=value=>String(value).replace(/\\/g,'/').toLowerCase();
 const label=actor=>{const names=window.WebVideoCharacterMap?.names()||{},name=names[actor.id.toLowerCase()];return name||(actor.explicit?actor.id:actor.file.replace(/\\/g,'/').split('/').pop());};
 function scan(model,selected=null){
  const stage=new Map(),items=[],patches=[],eol=model?.source.includes('\r\n')?'\r\n':'\n';let inserted=0;
  for(const row of model?.statements||[]){if(row.command!=='changeFigure')continue;const a=row.args,flags=positions.filter(p=>a[p]===true);if(flags.length>1)continue;const explicit=text(a.id),pos=flags[0]||'center',key=explicit||'fig-'+pos,gone=!row.content||row.content==='none'||a.clear===true;
   if(gone){if(explicit)stage.delete(key);else for(const [id,actor]of stage)if(actor.pos===pos)stage.delete(id);continue;}
   const actor={id:key,explicit:!!explicit,pos,file:row.content},previous=stage.get(key),entering=!previous||previous.pos!==pos||file(previous.file)!==file(actor.file);
   const victims=entering?[...stage.values()].filter(old=>old.pos===pos&&(old.id!==actor.id||file(old.file)!==file(actor.file))):[];
   if(victims.length){const item={row,actor,victims,eligible:true};items.push(item);if(selected===null||selected.has(row.id)){
     const lines=victims.map(old=>'changeFigure:none'+(old.explicit?' -id='+old.id:'')+' -'+old.pos+' -next'+(a.when!==undefined?' -when='+a.when:'')+';');
     if(lines.some(line=>/[\r\n]/.test(line))||victims.some(old=>old.explicit&&/[\s;|]/.test(old.id)))throw Error('第 '+row.startLine+' 行的角色 ID 无法安全写入，请先修正。');
     patches.push({startOffset:row.startOffset,endOffset:row.startOffset,before:'',after:lines.join(eol)+eol,line:row.startLine});inserted+=lines.length;for(const old of victims)stage.delete(old.id);
    }}
   stage.set(key,actor);
  }
  return {items,patches,inserted};
 }
 function plan(model,selected){const {patches,inserted}=scan(model,selected);let after=model.source;for(const patch of [...patches].reverse())after=after.slice(0,patch.startOffset)+patch.after+after.slice(patch.startOffset);WebVideoProject.parse(after);return {path:model.path,before:model.source,after,patches,changed:patches.length,inserted,operation:{type:'autoExit'}};}
 return {scan,plan,label};
})();
function WebVideoAutoExitPanel(){
 const R=reactExports,h=R.createElement,A=WebVideoAutoExit,model=WebVideoPlus.state().model,revision=(model?.path||'')+'\n'+(model?.source||''),[busy,setBusy]=R.useState(false),[message,setMessage]=R.useState('');
 const analysis=R.useMemo(()=>{try{return {...A.scan(model),error:''};}catch(e){return {items:[],error:e.message};}},[revision]),items=analysis.items,selection=useWebVideoInlineSelection(items,revision,busy),allSelected=items.length>0&&items.every(item=>selection.selected.has(item.row.id));
 R.useEffect(()=>{selection.setSelected(new Set(items.map(item=>item.row.id)));},[revision]);
 const effective=R.useMemo(()=>{try{return new Map(A.scan(model,selection.selected).items.map(item=>[item.row.id,item]));}catch{return new Map();}},[revision,selection.selected]);
 async function apply(){if(busy)return;selection.stop();setBusy(true);setMessage('');try{if(!model||WebVideoPlus.state().model?.path!==model.path||WebVideoPlus.state().model?.source!==model.source)throw Error('剧本已改变，请重新选择。');const plan=A.plan(model,selection.selected);if(!plan.changed){setMessage('没有需要补充离场的登场语句。');return;}await WebVideoProject.commit(plan,'自动离场');setMessage('已在 '+plan.changed+' 处登场前补充 '+plan.inserted+' 条离场语句，原文已自动备份。');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return h('div',{className:'wvp-expression-panel'},h('div',{className:'wvp-expression-actions'},h('button',{type:'button',disabled:busy||!items.length,onClick:()=>selection.setSelected(allSelected?new Set():new Set(items.map(item=>item.row.id)))},allSelected?'取消全选':'全选'),h('button',{type:'button',disabled:busy||!items.length,onClick:()=>selection.setSelected(new Set(items.filter(item=>!selection.selected.has(item.row.id)).map(item=>item.row.id)))},'反选'),h('span',null,'已选择 '+selection.selected.size+' 项')),analysis.error&&h('p',{role:'alert'},analysis.error),h('div',{className:'wvp-expression-list',ref:selection.list,role:'listbox','aria-label':'选择自动离场的角色登场','aria-multiselectable':true,onPointerMove:selection.move,onPointerUp:selection.stop,onPointerCancel:selection.stop,onLostPointerCapture:selection.stop},!items.length&&!analysis.error&&h('p',{className:'wvp-help'},'没有需要补充离场的角色登场。'),...items.map((original,index)=>{const item=effective.get(original.row.id)||original,victims=effective.get(original.row.id)?.victims||[],names=victims.map(A.label).join('、'),position=window.WebVideoNavigationMetadata.positions[item.actor.pos]||item.actor.pos;return h('div',{key:item.row.id,'data-filter-row':index,role:'option','aria-selected':selection.selected.has(item.row.id),tabIndex:0,className:'wvp-expression-row wvp-auto-exit-row'+(selection.selected.has(item.row.id)?' selected':''),title:item.row.source.trim(),onPointerDown:e=>selection.down(index,e),onKeyDown:e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();selection.choose(index,e);}}},h('span',{className:'wvp-expression-check'},selection.selected.has(item.row.id)?'✓':''),h('span',{className:'wvp-expression-line'},item.row.startLine),h('div',{className:'wvp-auto-exit-copy'},h('span',null,position+' · '+A.label(item.actor)+' 登场'),h('small',null,names?'将离场：'+names:'无需重复离场')));})),message&&h('p',{className:'wvp-expression-message',role:'status'},message),h('footer',null,h('span',null,'拖动连续选择 · Ctrl 多选 · Shift 选择头尾'),h('button',{type:'button',className:'primary',disabled:busy||!selection.selected.size||!!analysis.error,onClick:apply},busy?'处理中…':'确认')));
}
WebVideoTools.register('autoExit','自动离场',WebVideoAutoExitPanel);

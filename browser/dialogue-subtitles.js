// Read native compiler output at command boundaries; never scrape the animated DOM.
globalThis.__subtitleNodeText=value=>{
  if(Array.isArray(value))return value.map(__subtitleNodeText).join('');
  if(value==null||typeof value==='boolean')return '';
  if(typeof value!=='object')return String(value).replace(/\u00a0/g,' ');
  if(value.type==='br')return '\n';
  if(['style','script','rt','rp'].includes(value.type))return '';
  return __subtitleNodeText(value.props?.children??value.reactNode);
};
globalThis.__subtitleDialogueSnapshot=()=>{
  const w=__wgProbe,state=w.store.getState(),stage=w.stageManager.getCalculationStageState();
  const text=String(stage.showText??''),user=state.userData||{};
  const size=Number(stage.showTextSize??-1)===-1?Number(user.optionData?.textSize??0):Number(stage.showTextSize);
  const configured=Number(user.globalGameVar?.Max_line),lines=Number.isNaN(configured)?(size===0?3:2):configured;
  const compile=value=>w.compileText(String(value??''),lines,true);
  let rows;
  if(stage.enableFilm)rows=[text.split('')];
  else if(['4.6.5','4.6.6'].includes(w.adapter?.version)){
    const previous=String(stage.currentConcatDialogPrev??'');
    const segments=stage.currentDialogSegments?.join('')===text?stage.currentDialogSegments:previous&&text.startsWith(previous)?[previous,text.slice(previous.length)]:[text];
    rows=[];for(const segment of segments){const next=compile(segment);if(!rows.length){rows=next;continue;}const [first,...rest]=next;rows=[...rows.slice(0,-1),[...rows.at(-1),...first.slice(1)],...rest];}
  }else rows=compile(text);
  const plain=stage.enableFilm?text:rows.slice(0,lines).map(row=>row.map(item=>__subtitleNodeText(item.reactNode??item)).join('')).join('\n');
  const speaker=compile(stage.showName??'').map(row=>row.map(item=>__subtitleNodeText(item.reactNode??item)).join('')).join('\n');
  return {key:String(stage.currentDialogKey??''),text:plain,speaker,visible:!!state.GUI.showTextBox&&(!!stage.enableFilm||!stage.isDisableTextbox)};
};
globalThis.__subtitleCaptureGroup=(events,read=__subtitleDialogueSnapshot,schedule=queueMicrotask)=>{
  let pending=null;
  return (event,params)=>{
    if(!pending||pending.group!==event.forwardGroup){
      const group={group:event.forwardGroup,last:event,say:null};pending=group;
      schedule(()=>{const target=group.say||group.last;target.dialogue={...read(),append:!!group.append};if(pending===group)pending=null;});
    }
    pending.last=event;
    if(event.command==='say'){pending.say=event;pending.append=params.concat===true;}
  };
};

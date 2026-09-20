/* WebVideo+ timeline core. Native Terre parser owns syntax; this module owns derived views. */
(function(root){
  'use strict';
  const fingerprint = text => {let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16)+':'+text.length;};
  const ignoredCommands=new Set(['changeScene','callScene','return','choose','chooseLabel','jumpLabel','getUserInput','if','setVar','showVars']);
  const hiddenCommands=new Set([...ignoredCommands,'label','unlockCg','unlockBgm','wait','applyStyle','callSteam','end']);
  const majorLabels={bgm:'背景音乐',video:'播放视频',playVideo:'播放视频',playEffect:'效果声音',setAnimation:'调用动画',setComplexAnimation:'复杂动画',setTransform:'单段动画',setTempAnimation:'多段动画',setTransition:'进出场动画',pixi:'使用特效',pixiPerform:'使用特效',pixiInit:'清除特效',intro:'全屏文字',miniAvatar:'角落头像',setTextbox:'文本显示',filmMode:'电影模式'};
  const hintDuration=item=>{const args=item?.args||{},fromArgs=Number(args.wvpHint),match=String(item?.source||'').match(/(?:^|\\s)-wvpHint=([0-9]+(?:\\.[0-9]+)?)(?=\\s|;|$)/),fromSource=match?Number(match[1]):NaN,value=Number.isFinite(fromArgs)?fromArgs:fromSource;return Number.isFinite(value)&&value>=100&&value<=60000?value:1800;};
  const singleChooseInfo=item=>{if(item?.command!=='choose')return {isHint:false,convertible:false};const args=item.args||{},options=String(item.content||'').split(/(?<!\\)\|/),nodes=String(options[0]||'').split(/(?<!\\):/),text=(nodes[0]||'').trim(),target=(nodes[1]||'').trim(),reserved=/^__wvp_hint_[A-Za-z0-9_]+$/.test(target),isHint=options.length===1&&nodes.length===2&&reserved&&Number(args.defaultChoose)===1&&!args.next,hasHintArg=args.wvpHint!==undefined||/(?:^|\\s)-wvpHint(?:=|\\s|;|$)/.test(String(item.source||'')),unsafe=Object.keys(args).filter(key=>key!=='defaultChoose'&&key!=='wvpHint');return {isHint,convertible:!isHint&&!hasHintArg&&options.length===1&&nodes.length===2&&!String(options[0]).includes('->')&&!!text&&!!target&&unsafe.length===0,text,target,duration:isHint?hintDuration(item):0};};
  const singleLineHintDuration=item=>singleChooseInfo(item).duration||0;
  const isSingleLineHint=item=>singleChooseInfo(item).isHint;
  const ignoredInTiming=item=>(ignoredCommands.has(item.command)&&!isSingleLineHint(item))||item.args.userForward===true||Object.prototype.hasOwnProperty.call(item.args,'when');
  function derive(path,source,parsed,types){
    if(root.WebVideoNavigation)return root.WebVideoNavigation.derive(path,source,parsed,types);
    const lines=source.split('\n'),offsets=[0];for(let i=0;i<lines.length;i++)offsets.push(offsets[i]+lines[i].length+(i<lines.length-1?1:0));
    let speaker='',section=null,pending=[],figures=new Map();const rows=[],statements=[];let firstManualLine=null;
    for(const s of parsed.sentenceList||[]){
      if(s.isLineBreakHolder)continue;
      const start=Number(s.startLine),end=Number(s.endLine);
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=lines.length)throw Error('Terre 解析器返回了无效行号');
      const args=Object.fromEntries((s.args||[]).map(a=>[a.key,a.value]));
      const command=types[s.command]||s.commandRaw||'unknown',content=String(s.content||'');
      const item={id:`${start}:${end}`,command,startLine:start+1,endLine:end+1,startOffset:offsets[start],endOffset:offsets[end+1],source:source.slice(offsets[start],offsets[end+1]),content,args,sectionId:section,kind:'technical',speaker:'',title:content,annotations:[]};
      statements.push(item);
      const singleChoice=singleChooseInfo(item);item.convertibleSingleChoose=singleChoice.convertible;item.ignoredInTiming=ignoredInTiming(item);if(item.ignoredInTiming){if(firstManualLine===null)firstManualLine=item.startLine;if(!item.convertibleSingleChoose)continue;}if(hiddenCommands.has(command)&&!isSingleLineHint(item)&&!item.convertibleSingleChoose)continue;
      if(item.convertibleSingleChoose){item.kind='event';item.title='单选分支 · '+singleChoice.text;item.annotations.push('可转为单行提示');}
      else if(command==='changeBg'){item.kind='section';item.title=(command==='changeBg'?'背景 · ':'场景 · ')+(content||'清除');section=item.id;item.sectionId=section;}
      else if(command==='say'){
        if(args.speaker!==undefined&&args.speaker!==null)speaker=String(args.speaker);
        if(s.commandRaw===''||args.clear===true)speaker='';
        item.kind='dialogue';item.speaker=speaker;item.narration=speaker==='';item.displaySpeaker=speaker||'旁白';item.title=content.replace(/\|/g,' / ');
      }else if(command==='changeFigure'){
        const id=String(args.id||(['left','right','center','left13','right13','left14','right14'].find(k=>args[k])||'center'));
        const gone=content==='none'||content==='';if(args.clear===true)figures.clear();const previousState=figures.get(id),previous=previousState?.file,position=['left','right','center','left13','right13','left14','right14'].find(key=>args[key])||previousState?.position||'center';
        if(gone||!previous||previous!==content){item.kind='figure';item.title=(gone?'离场 · ':'入场 · ')+id+(gone?'':' · '+content);}
        if(!gone&&previous===content&&(position!==previousState?.position||['transform','enter','exit','bounds','zIndex','skin','blendMode','focus','blink','ignoreDefault'].some(key=>args[key]!==undefined))){item.kind='event';item.title='立绘调整 · '+id;}
        if(gone)figures.delete(id);else figures.set(id,{file:content,position});
        if(args.motion)item.annotations.push('动 '+args.motion);if(args.expression)item.annotations.push('表 '+args.expression);
      }else if(isSingleLineHint(item)){const option=content.split(/(?<!\\)\|/)[0].split(/(?<!\\):/)[0].replace(/\\([:|\\])/g,'$1'),seconds=singleLineHintDuration(item)/1000;item.kind='event';item.title='单行提示 · '+option;item.annotations.push((Number.isInteger(seconds)?seconds:seconds.toFixed(1))+' 秒');}
      else if(majorLabels[command]){item.kind='event';item.title=majorLabels[command]+(content?' · '+content:'');}
      else if(command==='comment'){
        const marker=content.match(/(?:TODO|FIXME|待办|待修|完成|标记)[：:\s]*(.*)/i);if(marker)pending.push({text:marker[0],line:item.startLine});
      }
      if(item.kind==='technical'){
        if(args.motion)pending.push({text:'动 '+args.motion,line:item.startLine});if(args.expression)pending.push({text:'表 '+args.expression,line:item.startLine});
        continue;
      }
      item.annotations.push(...pending.map(x=>x.text));item.annotationLines=pending.map(x=>x.line);pending=[];rows.push(item);
    }
    if(pending.length&&rows.length){rows[rows.length-1].annotations.push(...pending.map(x=>x.text));rows[rows.length-1].annotationLines.push(...pending.map(x=>x.line));}
    return {path,revision:fingerprint(source),source,rows,statements,lineCount:lines.length,firstManualLine};
  }
  class Selection {
    constructor(){this.model=null;this.mode='set';this.ids=new Set();this.anchor=null;this.range=null;}
    bind(model){const changed=!this.model||this.model.path!==model.path||this.model.source!==model.source;this.model=model;if(changed)this.clear();return changed;}
    clear(){this.ids.clear();this.anchor=null;this.range=null;}
    select(id,{shift=false,toggle=false,range=false,free=false}={}){
      const rows=this.model.rows,index=rows.findIndex(r=>r.id===id);if(index<0)return;
      if(free){this.mode='set';this.range=null;if(shift&&this.anchor){const other=rows.findIndex(r=>r.id===this.anchor);for(const row of rows.slice(Math.min(index,other),Math.max(index,other)+1))this.ids.add(row.id);}else{if(this.ids.has(id))this.ids.delete(id);else this.ids.add(id);this.anchor=id;}return;}
      if((range||shift)&&this.anchor&&rows.some(r=>r.id===this.anchor)){const other=rows.findIndex(r=>r.id===this.anchor),a=Math.min(index,other),b=Math.max(index,other);this.mode='range';this.range=[rows[a].startLine,rows[b].endLine];this.ids=new Set(rows.slice(a,b+1).map(r=>r.id));}
      else {this.range=null;this.mode=range?'range':'set';if(!toggle)this.ids.clear();if(toggle&&this.ids.has(id))this.ids.delete(id);else this.ids.add(id);this.anchor=id;if(range)this.range=[rows[index].startLine,rows[index].endLine];}
    }
    results(rows,invert=false){this.mode='set';this.range=null;for(const r of rows){if(invert&&this.ids.has(r.id))this.ids.delete(r.id);else this.ids.add(r.id);}}
    section(id,includeNext=false){const rows=this.model.rows,index=rows.findIndex(r=>r.id===id&&r.kind==='section');if(index<0)return;const next=rows.findIndex((r,i)=>i>index&&r.kind==='section');const end=next<0?this.model.lineCount:includeNext?rows[next].endLine:rows[next].startLine-1;this.mode='range';this.range=[rows[index].startLine,end];this.anchor=id;this.ids=new Set(rows.filter(r=>r.startLine>=this.range[0]&&r.startLine<=end).map(r=>r.id));}
    snapshot(){if(!this.model)return null;const m=this.model;const selected=this.mode==='range'&&this.range?m.statements.filter(s=>s.startLine>=this.range[0]&&s.endLine<=this.range[1]):m.statements.filter(s=>this.ids.has(s.id));let ranges=selected.map(s=>({startLine:s.startLine,endLine:s.endLine,startOffset:s.startOffset,endOffset:s.endOffset}));if(this.mode==='range'&&this.range){const lines=m.source.split('\n');const start=lines.slice(0,this.range[0]-1).reduce((n,l)=>n+l.length+1,0);let end=lines.slice(0,this.range[1]).reduce((n,l)=>n+l.length+1,0);ranges=[{startLine:this.range[0],endLine:this.range[1],startOffset:start,endOffset:Math.min(end,m.source.length)}];}return JSON.parse(JSON.stringify({schemaVersion:1,path:m.path,revision:m.revision,mode:this.mode,ids:[...this.ids],ranges,statements:selected,source:m.source}));}
  }
  function filter(rows,{text='',speaker='',kind=''}={}){text=text.trim().toLocaleLowerCase();return rows.filter(r=>(!speaker||(r.displaySpeaker||r.speaker)===speaker)&&(!kind||r.kind===kind)&&(!text||[r.title,r.displaySpeaker||r.speaker,r.speakerSource||'',...r.annotations,...(r.parts||[]).flatMap(p=>[p.title,...p.items,p.footer])].join(' ').toLocaleLowerCase().includes(text)));}
  root.WebVideoTimelineCore={derive,Selection,filter,fingerprint,ignoredInTiming,singleLineHintDuration,singleChooseInfo};
})(typeof window==='undefined'?globalThis:window);

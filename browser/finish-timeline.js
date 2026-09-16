globalThis.__finishNativeTimeline=({result,pre,settings,playlist,range})=>{
 if(Number(result.options.textSpeed)!==Number(settings.textSpeed)||Number(result.options.autoSpeed)!==Number(settings.autoSpeed))throw Error('引擎播放速度与导出设置不一致');
 const lineTimes=Array(pre.parsedStatements).fill(null);for(const e of result.events)if(e.index>=0&&e.index<lineTimes.length)lineTimes[e.index]=Math.round(e.atMs);
 let durationMs=result.durationMs,rangeStartMs=0;
 if(range){const start=range.startLine-1,end=range.endLine;const value=lineTimes.slice(start,end).find(Number.isFinite);if(value===undefined)throw Error('选区中没有实际执行的语句');rangeStartMs=value;}
 let windows=result.elastic,actualElastic=result.elastic;
 if(settings.mode==='bgm'){
  if(!playlist.length)throw Error('请至少导入一首 BGM');
  const selectedTarget=playlist.reduce((n,p)=>n+p.durationMs,0),target=rangeStartMs+selectedTarget;
  windows=range?result.elastic.filter(w=>w.startMs>=rangeStartMs&&w.line>=range.startLine-1&&w.line<range.endLine):result.elastic;
  const stretch=windows.reduce((n,w)=>n+w.endMs-w.startMs,0),minimum=durationMs-rangeStartMs-stretch;
  if(selectedTarget+1<minimum)throw Error('音乐总长 '+(selectedTarget/1000).toFixed(1)+' 秒，保留选区文字、配音和必要演出至少需要 '+(minimum/1000).toFixed(1)+' 秒；请增加音乐或缩短内容。');
  const synthetic=stretch<=0&&target>durationMs+1;if(synthetic)windows=[{startMs:durationMs,endMs:durationMs+1,line:lineTimes.length-1}];
  const total=windows.reduce((n,w)=>n+w.endMs-w.startMs,0),delta=target-durationMs;
  const map=t=>total>0?t+windows.reduce((n,w)=>n+Math.max(0,Math.min(t,w.endMs)-w.startMs)/total*delta,0):t;
  for(const event of result.controlEvents)event.atMs=Math.round(map(event.atMs));
  for(let i=0;i<lineTimes.length;i++)if(Number.isFinite(lineTimes[i]))lineTimes[i]=Math.round(map(lineTimes[i]));
  actualElastic=result.elastic.map(w=>({...w,startMs:map(w.startMs),endMs:map(w.endMs)}));if(synthetic)actualElastic.push({startMs:durationMs,endMs:target,line:lineTimes.length-1});durationMs=target;
 }
 return {schemaVersion:1,mode:settings.mode,durationSeconds:Math.ceil(durationMs*settings.fps/1000)/settings.fps,lineTimes,textSpeed:settings.textSpeed,autoSpeed:settings.autoSpeed,holdSeconds:settings.holdSeconds,playlist,playlistOffsetMs:rangeStartMs,range,controlEvents:result.controlEvents,sourceEvents:result.events,elasticWindows:actualElastic};
};

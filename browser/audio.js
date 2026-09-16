const volume=value=>Math.max(0,Math.min(100,Number(value??100)))/100;

function scheduleAudioCommand(tracks,{command,name,file,atMs,durationMs,params}) {
  const id=String(params.id??'');
  if(command==='bgm') {
    for(const old of tracks)if(old.kind==='bgm'&&(old.endMs===null||old.endMs>atMs)) {
      const fadeOutMs=!name||name==='none'?Math.max(0,Number(params.enter||0)):0;
      old.endMs=atMs+fadeOutMs;old.fadeOutMs=fadeOutMs;
    }
  } else {
    // The native command always stops the anonymous sound, then the matching named sound.
    for(const old of tracks)if(old.kind==='effect'&&(!old.id||(id&&old.id===id))&&(old.endMs===null||old.endMs>atMs))old.endMs=atMs;
  }
  if(!name||name==='none')return;
  const loop=command==='bgm'||!!id;
  tracks.push({kind:command==='bgm'?'bgm':'effect',id,path:file,atMs,endMs:loop?null:atMs+durationMs,volume:volume(params.volume),loop,fadeMs:command==='bgm'?Math.max(0,Number(params.enter||0)):0});
}

function audioMixArguments(tracks,durationSeconds,muteWindows=[]) {
  const input=[],filters=[],labels=[];
  const active=tracks.filter(a=>a.atMs<durationSeconds*1000&&Math.min(a.endMs??durationSeconds*1000,durationSeconds*1000)>a.atMs);
  active.forEach((a,i)=>{
    const length=(Math.min(a.endMs??durationSeconds*1000,durationSeconds*1000)-a.atMs)/1000;
    if(a.loop)input.push('-stream_loop','-1');if(a.sourceOffsetMs)input.push('-ss',String(a.sourceOffsetMs/1000));input.push('-t',String(length),'-i',a.path);
    let filter=`[${i}:a]atrim=duration=${length},asetpts=PTS-STARTPTS,volume=${a.volume}`;
    if(a.fadeMs)filter+=`,afade=t=in:d=${a.fadeMs/1000}`;
    if(a.fadeOutMs)filter+=`,afade=t=out:st=${Math.max(0,((a.endMs-a.fadeOutMs)-a.atMs)/1000)}:d=${a.fadeOutMs/1000}`;
    filter+=`,adelay=${Math.round(a.atMs)}|${Math.round(a.atMs)}`;
    if(a.kind==='bgm'||a.kind==='voice')for(const w of muteWindows)filter+=`,volume=0:enable='between(t,${w.start/1000},${w.end/1000})'`;
    filters.push(filter+`[a${i}]`);labels.push(`[a${i}]`);
  });
  if(!active.length)return null;
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0${active.some(a=>a.kind==='video-music')?',alimiter=limit=0.95:level=false':''},apad,atrim=duration=${durationSeconds}[out]`);
  return [...input,'-filter_complex',filters.join(';'),'-map','[out]','-ar','48000'];
}

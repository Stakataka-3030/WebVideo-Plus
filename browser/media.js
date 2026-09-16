// Runs inside the engine page. Audio is mixed offline; HTML video decodes the requested logical frame.
function installOfflineMediaClock() {
  const known=new Set(),records=new WeakMap();let cues=[];
  const nativePause=HTMLMediaElement.prototype.pause;
  const normalize=src=>{try{return decodeURIComponent(new URL(src,location.href).pathname);}catch{return src;}};
  HTMLMediaElement.prototype.play=function(){known.add(this);nativePause.call(this);return Promise.resolve();};
  document.addEventListener('play',e=>{if(e.target instanceof HTMLMediaElement){known.add(e.target);nativePause.call(e.target);}},true);
  function timedEvent(element,names,action,ready) {
    if(ready?.())return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let cancel=()=>{};
      const cleanup=()=>{cancel();for(const n of names)element.removeEventListener(n,done);element.removeEventListener('error',fail);};
      const done=()=>{if(!ready||ready()){cleanup();resolve();}};
      const fail=()=>{cleanup();reject(new Error('Media decode failed: '+(element.currentSrc||element.src)));};
      for(const n of names)element.addEventListener(n,done);element.addEventListener('error',fail);
      cancel=__pwClock.controller._embedder.setTimeout(()=>{cleanup();reject(new Error('Media decode timeout: '+(element.currentSrc||element.src)));},8000);
      try{action?.();done();}catch(e){cleanup();reject(e);}
    });
  }
  function activeVideos() {
    const active=new Map();
    for(const v of document.querySelectorAll('video'))active.set(v,{target:v.id==='playVideoElement'?'fullscreen':v.id,resources:[]});
    const stage=globalThis.__wgProbe?.core.gameplay.pixiStage;
    const scan=(node,target)=>{
      const resource=node?.texture?.baseTexture?.resource,source=resource?.source;
      if(source instanceof HTMLVideoElement){const entry=active.get(source)||{target,resources:[]};entry.resources.push(resource);active.set(source,entry);}
      for(const child of node?.children||[])scan(child,target);
    };
    for(const obj of [...(stage?.figureObjects||[]),...(stage?.backgroundObjects||[])])scan(obj.pixiContainer,obj.key);
    return active;
  }
  const api={lastSamples:[],history:[],setCues(value){cues=value;},async sync(t) {
    const samples=[];
    for(const [video,entry] of activeVideos()) {
      if(!video.currentSrc&&!video.getAttribute('src'))continue;
      known.add(video);nativePause.call(video);
      await timedEvent(video,['loadedmetadata','loadeddata','canplay'],()=>{video.preload='auto';if(video.networkState===0)video.load();},()=>video.readyState>=2);
      const src=normalize(video.currentSrc||video.src),matches=cues.filter(c=>c.path===src&&c.atMs<=t+.01&&(c.target===entry.target||entry.target?.startsWith(c.target)));
      const cue=matches.at(-1);let record=records.get(video);
      if(!record||record.src!==src||(cue&&record.cueAt!==cue.atMs)){record={src,cueAt:cue?.atMs??t,ended:false};records.set(video,record);}
      const elapsed=Math.max(0,(t-record.cueAt)/1000),length=Number.isFinite(video.duration)&&video.duration>0?video.duration:cue?.durationMs/1000;
      if(!Number.isFinite(length)||length<=0)throw new Error('Cannot determine media duration: '+src);
      const requested=video.loop?elapsed%length:Math.min(elapsed,Math.max(0,length-.00001));
      const target=Math.min(Math.max(0,length-.00001),requested+.000001);
      if(Math.abs(video.currentTime-target)>.00001||video.seeking)await timedEvent(video,['seeked','loadeddata'],()=>{video.currentTime=target;},()=>!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-target)<.002);
      for(const resource of entry.resources)resource.update();
      samples.push({target:entry.target,src,atMs:record.cueAt,time:video.currentTime,wanted:requested,loop:video.loop,duration:length});
      if(!video.loop&&elapsed>=length&&!record.ended){record.ended=true;video.dispatchEvent(new Event('ended'));}
    }
    api.lastSamples=samples;
    if(globalThis.__exportCollectMediaSamples)api.history.push({t,samples});
  },finishFullscreen(){const v=document.getElementById('playVideoElement');if(v){nativePause.call(v);v.dispatchEvent(new Event('ended'));}}};
  globalThis.__exportMedia=api;
}

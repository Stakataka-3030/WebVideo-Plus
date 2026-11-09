import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
test('limit is applied before shared resolution, scan, snapshot, preflight and native planning',()=>{
 const source=read('src/Planner.cs'),limit=source.indexOf('chain=SceneChain.LimitPlanningTail(chain,request,settings);');
 assert.ok(limit>source.indexOf('SceneChain.BuildTimeline('));
 for(const marker of ['assets.Scan(','assets.Snapshot()','__exportPreflightVideo(','__createNativeTimeline('])assert.ok(source.indexOf(marker)>limit,marker);
 if(source.includes('assets.Shared.ForHttpSource('))assert.ok(source.indexOf('assets.Shared.ForHttpSource(J.S(chain,"script"))')>limit);
 assert.match(read('src/JobRunner.cs'),/PipelineRevision="[^"]*expression-v1-scene-tail-v1"/);
 assert.match(read('src/SceneChain.cs'),/J\.S\(settings,"mode"\)=="bgm"/);
 assert.ok(source.indexOf('SceneChain.AlignPlanningTailDuration(result,chain)')<source.indexOf('__finishNativeTimeline('));
});
test('real finishing function preserves an integer-ms scene endpoint after fractional-frame padding',()=>{
 const context={};vm.createContext(context);vm.runInContext(read('browser/workload.js'),context);
 for(const fps of [24,30,60,120])for(const raw of [0,61*1000/fps,1016.4,1016.5,2037]){
  const boundary=Math.round(raw),result={durationMs:Math.max(raw,boundary),events:[{index:0,atMs:raw,command:'end'}],options:{textSpeed:100,autoSpeed:100},controlEvents:[],elastic:[]};
  const finished=context.__finishNativeTimeline({result,pre:{parsedStatements:1},settings:{mode:'auto',fps,textSpeed:100,autoSpeed:100},playlist:[],range:null});
  assert.equal(finished.lineTimes[0],boundary);
  assert.ok(Math.round(finished.durationSeconds*fps)>=Math.ceil(boundary*fps/1000-1e-7));
 }
});
function workload(rows,duration){
 const context={};vm.createContext(context);
 for(const name of ['audio','workload'])vm.runInContext(read('browser/'+name+'.js'),context);
 const parsed={sentenceList:rows.map(([command,content,params],i)=>({command:command==='say'?0:1,commandRaw:command,content,args:Object.entries(params).map(([key,value])=>({key,value})),startLine:i,endLine:i}))};
 const script=rows.map(([command,content,params])=>command+':'+content+Object.entries(params).map(([key,value])=>' -'+key+(value===true?'':'='+value)).join('')+';').join('\n');
 const timing={durationSeconds:duration,lineTimes:rows.map(row=>row[3]),sourceEvents:rows.map((row,index)=>({index,atMs:row[3],forwardGroup:index+1})),performWindows:[{command:'setAnimation',line:3,role:'primary',durationMs:2500,hold:false,startMs:500,stopMs:null}],stageExitWindows:[{target:'hero-softoff',startMs:1900,stopMs:2350}]};
 const plan=context.__buildNativeWorkload({script,parsed,media:{'/game/bgm/history.wav':{durationMs:5000,hasAudio:true},'/game/vocal/line.wav':{durationMs:1700,hasAudio:true},'/game/video/tail.mp4':{durationMs:2000,hasAudio:true}},animations:{move:[{duration:2500,alpha:.5}]},timing,root:'C:/fixture',project:'C:/fixture',sceneName:'middle.txt',fps:30});
 return {plan:plain(plan),mix:(tracks,seconds)=>plain(vm.runInContext('audioMixArguments',context)(tracks,seconds))};
}
const prefix=[
 ['bgm','history.wav',{},0],
 ['changeBg','history.png',{},0],
 ['changeFigure','hero.model3.json',{id:'hero',motion:'idle'},0],
 ['setAnimation','move',{target:'hero',next:true},500],
 ['say','target',{vocal:'line.wav',figureId:'hero',notend:true,next:true},1000],
 ['wait','900',{},1000],
 ['changeFigure','none',{id:'hero',exitDuration:450,next:true},1900],
 ['comment','flattened transfer',{next:true},2000]
];
const tail=[['changeBg','unrelated.png',{},2000],['bgm','none',{enter:500},3000],['playVideo','tail.mp4',{},3000]];
test('workload retains predecessor state, voice and target transition while dropping suffix events/media',()=>{
 const limited=workload([...prefix,['end','',{},2000]],2),full=workload([...prefix,...tail],5);
 assert.deepEqual(limited.plan.events,full.plan.events.filter(event=>event.sourceIndex<prefix.length));
 assert.ok(limited.plan.events.some(event=>event.script.includes('history.png')));
 assert.ok(limited.plan.events.some(event=>event.script.includes('hero.model3.json')));
 assert.ok(limited.plan.events.some(event=>event.mouthTarget==='hero'));
 assert.equal(limited.plan.videoCues.length,0);assert.equal(full.plan.videoCues.length,1);
 assert.equal(limited.plan.audio.length,2);assert.equal(limited.plan.audio[1].endMs,2700,'Voice lifetime must not be shortened in source scheduling');
 assert.equal(limited.plan.events.some(event=>event.command==='end'),false,'Boundary sentinel must not render');
 const crop=rows=>rows.map(row=>({...row,endMs:Math.min(row.endMs??2000,2000)}));
 assert.deepEqual(crop(limited.plan.live2dLifetimes),crop(full.plan.live2dLifetimes));
 assert.deepEqual(limited.plan.replayWindows,full.plan.replayWindows.map(window=>({...window,endMs:Math.min(window.endMs,2000)})).filter(window=>window.startMs<2000));
 // Future BGM stop/fade operations cannot change samples preceding the fence.
 const fullAudio=full.plan.audio.filter(track=>track.atMs<2000).map(track=>{const copy={...track};if((copy.endMs??Infinity)-(copy.fadeOutMs??0)>=2000)delete copy.fadeOutMs;return copy;});
 assert.deepEqual(limited.mix(limited.plan.audio,2),full.mix(fullAudio,2));
});
test('notend wait and visual tail helpers still see all target tail statements',()=>{
 const context={};vm.createContext(context);vm.runInContext(read('browser/timeline.js'),context);
 const sentences=[{command:0,args:[{key:'next',value:true},{key:'notend',value:true}]},{command:1,commandRaw:'comment',args:[]},{command:1,commandRaw:'wait',args:[]},{command:1,commandRaw:'end',args:[]}];
 assert.equal(context.__exportFindChainedWaitIndex(sentences,0),2);
 assert.equal(context.__exportNotendVisualDuration(500,200),600);
});
test('custom future music can change the entire mix, so the scope gate retains its full timeline',()=>{
 const context={};vm.createContext(context);vm.runInContext(read('browser/audio.js'),context);
 const tracks=[{kind:'effect',path:'effect.wav',atMs:0,endMs:5000,volume:1},{kind:'video-music',path:'future.wav',atMs:3000,endMs:5000,volume:1}];
 const mix=vm.runInContext('audioMixArguments',context);
 assert.match(mix(tracks,5).join(' '),/alimiter/);assert.doesNotMatch(mix(tracks,2).join(' '),/alimiter/);
 assert.match(read('src/SceneChain.cs'),/J\.A\(J\.Get\(J\.Get\(request,"musicTimeline"\),"tracks"\)\)\.Count>0\)return chain/);
});

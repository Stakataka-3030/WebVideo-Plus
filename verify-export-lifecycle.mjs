import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const context={console};
context.globalThis=context;
context.scheduleAudioCommand=()=>{};
vm.createContext(context);
for(const name of ['workload.js','timeline.js','render.js','finish-timeline.js']){
  const source=fs.readFileSync(path.join(root,'browser',name),'utf8');
  new vm.Script(source,{filename:name});
  if(name==='workload.js'||name==='timeline.js'||name==='render.js')vm.runInContext(source,context,{filename:name});
}
const build=context.__buildNativeWorkload,finish=context.__finishNativeTimeline;
assert.equal(typeof build,'function');
assert.equal(typeof finish,'function');
assert.equal(typeof context.__exportTextSettleApplies,'function');
assert.equal(typeof context.__exportInstallTextSettleGuard,'function');
assert.equal(typeof context.__exportBeginDialogueTransition,'function');
assert.equal(typeof context.__exportSetDialogueTarget,'function');
assert.equal(typeof context.__exportDialogueDomReady,'function');
assert.equal(typeof context.__exportWaitDialogueDom,'function');
assert.equal(typeof context.__exportNotendVisualDuration,'function');
assert.equal(typeof context.__exportFindChainedWaitIndex,'function');
assert.ok(Math.abs(context.__exportNotendVisualDuration(567.918,950)-1042.918)<1e-9);
{
  const chain=[
    {command:0,commandRaw:'',args:[{key:'notend',value:true},{key:'next',value:true}],isLineBreakHolder:false},
    {command:99,commandRaw:'changeFigure',args:[{key:'next',value:true}],isLineBreakHolder:false},
    {command:99,commandRaw:'wait',args:[],isLineBreakHolder:false},
    {command:0,commandRaw:'',args:[],isLineBreakHolder:false}
  ];
  assert.equal(context.__exportFindChainedWaitIndex(chain,0),2,'notend-next chain must find its terminal wait');
  const overwritten=[chain[0],{command:0,commandRaw:'',args:[{key:'next',value:true}],isLineBreakHolder:false},chain[2]];
  assert.equal(context.__exportFindChainedWaitIndex(overwritten,0),-1,'a later say must prevent applying the old line visual floor');
}
assert.equal(context.__exportTextSettleApplies('old','new',false),false);
assert.equal(context.__exportTextSettleApplies('same','same',false),true);
assert.equal(context.__exportTextSettleApplies(null,'same',false),false);
assert.equal(context.__exportTextSettleApplies(null,'same',true),true);

{
  const delivered=[],event={emit(message,id){delivered.push([message,id]);}};
  context.__exportInstallTextSettleGuard(event);
  context.__exportActiveSayToken=2;
  context.__exportTextSettleOwnerToken=1;
  context.__exportForceTextSettle=false;
  event.emit('stale');
  assert.equal(delivered.length,0,'stale say must not reach WebGAL textSettle listeners');
  context.__exportTextSettleOwnerToken=2;
  event.emit('current');
  assert.equal(delivered.length,1);
  assert.equal(delivered[0][0],'current');
  context.__exportTextSettleOwnerToken=1;
  context.__exportForceTextSettle=true;
  event.emit('prefix');
  assert.equal(delivered.length,2,'explicit prefix settle must bypass ownership');
  context.__exportForceTextSettle=false;
}

{
  const rendererSource=fs.readFileSync(path.join(root,'src','Renderer.cs'),'utf8');
  const domInstall=rendererSource.indexOf('__gpuDomInstall()');
  const prefixRestore=rendererSource.indexOf('globalThis.__exportPrefixRestore=true');
  const beginDialogue=rendererSource.indexOf('__exportBeginDialogueTransition()',prefixRestore);
  const syncScene=rendererSource.indexOf("preview.command.sync-scene",prefixRestore);
  const domReady=rendererSource.indexOf('__exportWaitDialogueDom()',prefixRestore);
  const forceSettle=rendererSource.indexOf('__exportForceTextSettle=true',prefixRestore);
  assert.ok(domInstall>=0&&prefixRestore>=0&&domInstall<prefixRestore,'GPU DOM tracking must exist before prefix restore');
  assert.ok(beginDialogue>prefixRestore&&syncScene>beginDialogue,'prefix restore must arm dialogue mutation tracking before sync-scene');
  assert.ok(domReady>syncScene&&forceSettle>domReady,'prefix restore must wait for actual dialogue DOM mutation before forced settle');
  const timelineSource=fs.readFileSync(path.join(root,'browser','timeline.js'),'utf8');
  const waitOverride=timelineSource.match(/if\(command==='wait'&&params\.next!==true\)\{([\s\S]*?)\n\s*\}/)?.[1]||'';
  assert.ok(waitOverride.includes('blockingAuto'),'planner must keep ordinary wait from being skipped by autoplay');
  assert.ok(timelineSource.includes("policy.notendVisualTail!==false&&command==='say'"),'notend visual tail must be controlled by an explicit default-on planner setting');
  assert.ok(!waitOverride.includes('blockingNext'),'planner must not turn ordinary wait into blockingNext; that creates stale goNextWhenOver retries');
  assert.ok(timelineSource.includes("policy.mode==='auto'&&pc.performList.some(p=>p.blockingAuto?.())"),'planner must reject autoplay next while dialogue still blocks auto');
  const renderSource=fs.readFileSync(path.join(root,'browser','render.js'),'utf8');
  assert.ok(renderSource.includes("timingMode==='auto'&&pc.performList.some(p=>p.blockingAuto?.())"),'renderer must ignore stale replayed auto-next while dialogue still blocks auto');
  const segmentSource=fs.readFileSync(path.join(root,'src','SegmentPlan.cs'),'utf8');
  const videoWorkflowSource=fs.readFileSync(path.join(root,'src','VideoWorkflow.cs'),'utf8');
  assert.ok(segmentSource.includes('var eventCuts=events.Select'),'segment planner must derive cuts from semantic events');
  assert.ok(!segmentSource.includes('new List<int>{snapCut(targetFrame),snapCut(minFrame),snapCut(maxFrame)}'),'segment planner must not inject arbitrary midpoint/min/max frame cuts');
  assert.ok(segmentSource.includes('public const double ReplayPenaltyWeight=.35d,MaxWeightedReplayOverheadRatio=1.50d'),'scope planning must share the canonical replay-cost policy');
  assert.ok(videoWorkflowSource.includes('weightedReplayFrames=warmup*SegmentPlan.ReplayPenaltyWeight'),'scope replay limits must use weighted warmup cost');
  assert.ok(videoWorkflowSource.includes('weightedReplayFrames>maxWeightedReplayFrames'),'scope replay rejection must use the weighted cap');
  assert.ok(!videoWorkflowSource.includes('warmup>selected*.60'),'legacy raw 60% replay cap must not return');
}


{
  const launcherSource=fs.readFileSync(path.join(root,'launcher','TerreLauncher.cs'),'utf8');
  assert.ok(launcherSource.includes('new ProcessStartInfo(native'),'Terre lifecycle must launch outside the export-worker kill-on-close job');
  assert.ok(!launcherSource.includes('process-guard.exe'),'Terre lifecycle must not inherit the export-worker process guard');
  const lifecycleSource=fs.readFileSync(path.join(root,'src','Lifecycle.cs'),'utf8');
  assert.ok(lifecycleSource.includes('wrapperPid>0&&!Commands.Alive(wrapperPid)'),'unguarded lifecycle must still stop when its wrapper disappears');
  assert.ok(!lifecycleSource.includes('/T /F'),'Terre shutdown must not recursively kill browser descendants');
  assert.ok(lifecycleSource.includes('await ReuseExisting(config,state,control,oldPid)'),'relaunch must verify the old lifecycle instead of blindly opening a stale Terre URL');
  assert.ok(lifecycleSource.includes('await ExistingReady(config)'),'existing lifecycle reuse must require both Terre identity and export-service health');
  assert.ok(lifecycleSource.includes('restart-takeover'),'an unhealthy old lifecycle must be asked to stop before a new owner takes the lock');
  assert.ok(lifecycleSource.includes('FileShare.Read'),'the lifecycle lock must remain open without delete sharing while its owner is alive');
  assert.ok(lifecycleSource.includes('FileMode.CreateNew'),'lifecycle ownership must be acquired atomically after stale-owner cleanup');
  assert.ok(lifecycleSource.includes('CleanupServiceFiles(terre,state,servicePid)'),'lifecycle shutdown must remove discovery owned by the service it killed');
  assert.ok(!lifecycleSource.includes('if(Commands.Alive((int)J.N(old,"pid"))){NativeDialogs.Open'),'the old PID-only reuse path must not return');
  const queueSource=fs.readFileSync(path.join(root,'src','QueueService.cs'),'utf8');
  assert.ok(queueSource.includes('"serviceId",serviceId'),'service discovery must carry an ownership generation');
  assert.ok(queueSource.includes('"pid",Process.GetCurrentProcess().Id'),'service discovery must identify its owning process');
  assert.ok(queueSource.includes('RemoveOwnedServiceFile'),'graceful service shutdown must not leave stale discovery');
  const exportSource=fs.readFileSync(path.join(root,'browser','export-component.js'),'utf8');
  assert.ok(exportSource.includes('无法连接本地导出服务'),'native connection failures must not surface as a bare Failed to fetch');
}


const say=(content,args=[],startLine=0,endLine=startLine)=>({command:0,commandRaw:'',content,args,startLine,endLine,isLineBreakHolder:false});
const cmd=(commandRaw,content,args=[],startLine=0,endLine=startLine)=>({command:99,commandRaw,content,args,startLine,endLine,isLineBreakHolder:false});
const holder=(line)=>({command:99,commandRaw:'comment',content:'',args:[],startLine:line,endLine:line,isLineBreakHolder:true});

{
  const script=[
    'setTransform:{"position":{"x":100}}',
    '  -duration=5000',
    '  -target=hero',
    '  -next',
    '  -keep;',
    'hero:hello;'
  ].join('\n');
  const parsed={sentenceList:[
    cmd('setTransform','{"position":{"x":100}}',[{key:'duration',value:5000},{key:'target',value:'hero'},{key:'next',value:true},{key:'keep',value:true}],0,4),
    holder(1),holder(2),holder(3),holder(4),
    say('hello',[{key:'speaker',value:'hero'}],5)
  ]};
  const timing={durationSeconds:8,lineTimes:[0,null,null,null,null,0],sourceEvents:[{index:0,forwardGroup:1},{index:5,forwardGroup:1}],controlEvents:[],performWindows:[
    {command:'setTransform',line:0,role:'primary',durationMs:5000,hold:true,startMs:0,stopMs:null},
    {command:'say',line:5,role:'primary',durationMs:1200,hold:false,startMs:0,stopMs:1200}
  ],stageExitWindows:[]};
  const plan=build({script,parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  const transform=plan.events.find(e=>e.command==='setTransform');
  assert.ok(transform.script.includes('-duration=5000'));
  assert.ok(transform.script.includes('-target=hero'));
  assert.ok(transform.script.includes('-keep'));
  assert.equal(transform.forwardGroup,1);
  const keepWindow=plan.replayWindows.find(w=>w.command==='setTransform');
  assert.equal(keepWindow.endMs,5000);
  assert.equal(keepWindow.dormantRestorable,true);
  assert.equal(keepWindow.noCut,false);
}

{
  const parsed={sentenceList:[
    cmd('wait','600',[{key:'next',value:true}],0),
    say('after-next',[],1)
  ]};
  const plan=build({script:'wait:600 -next;\nafter-next;',parsed,media:{},animations:{},timing:null,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(plan.events.find(e=>e.command==='say').atMs,0);

  const blocking={sentenceList:[cmd('wait','600',[],0),say('after',[],1)]};
  const blockingPlan=build({script:'wait:600;\nafter;',parsed:blocking,media:{},animations:{},timing:null,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(blockingPlan.events.find(e=>e.command==='say').atMs,600);
}

{
  const parsed={sentenceList:[say('new',[],0)]};
  const timing={durationSeconds:2,lineTimes:[600],sourceEvents:[{index:0,forwardGroup:2}],controlEvents:[{atMs:600,kind:'settle-nonhold',line:0}],performWindows:[{command:'say',line:0,role:'primary',durationMs:900,hold:false,startMs:600,stopMs:1500}],stageExitWindows:[]};
  const plan=build({script:'new;',parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.deepEqual(Array.from(plan.events.slice(0,2),e=>e.command),['__settleNonHold','say']);
  assert.equal(plan.replayWindows.find(w=>w.command==='say').noCut,true,'active dialogue animation must be a hard no-cut interval');
}

{
  const timing=finish({
    result:{
      options:{textSpeed:50,autoSpeed:50},
      events:[{index:0,atMs:0,command:'say'},{index:1,atMs:2000,command:'say'}],
      elastic:[{startMs:1000,endMs:2000,line:0}],
      controlEvents:[],
      performWindows:[
        {command:'say',line:0,role:'primary',durationMs:800,hold:false,startMs:0,stopMs:800},
        {command:'setTransform',line:0,role:'primary',durationMs:1500,hold:false,startMs:500,stopMs:2000},
        {command:'setTransform',line:0,role:'primary',durationMs:5000,hold:true,startMs:0,stopMs:3000}
      ],
      stageExitWindows:[{target:'hero-off',startMs:500,stopMs:2000}],
      visualNotendWaitFloors:[{sayLine:4,waitLine:6,originalSayMs:567.918,visualMs:1042.918}],
      durationMs:3000
    },
    pre:{parsedStatements:2},
    settings:{textSpeed:50,autoSpeed:50,mode:'bgm',fps:60,holdSeconds:1},
    playlist:[{durationMs:5000}],
    range:null
  });
  assert.equal(timing.durationSeconds,5);
  assert.equal(timing.performWindows[0].stopMs,800);
  assert.equal(timing.performWindows[1].stopMs,2000);
  assert.equal(timing.performWindows[2].stopMs,5000);
  assert.equal(timing.stageExitWindows[0].startMs,500);
  assert.equal(timing.stageExitWindows[0].stopMs,2000);
  assert.equal(timing.visualNotendWaitFloors.length,1);
  assert.ok(Math.abs(Number(timing.visualNotendWaitFloors[0].visualMs)-1042.918)<1e-9);
}

{
  const script=['changeFigure:model/model3.json -id=hero;','pixiPerform:rain;','pixiInit:;','changeFigure:none -id=hero;'].join('\n');
  const parsed={sentenceList:[
    cmd('changeFigure','model/model3.json',[{key:'id',value:'hero'}],0),
    cmd('pixiPerform','rain',[],1),
    cmd('pixiInit','',[],2),
    cmd('changeFigure','none',[{key:'id',value:'hero'}],3)
  ]};
  const timing={durationSeconds:6,lineTimes:[0,1000,3000,4000],sourceEvents:[{index:0,forwardGroup:1},{index:1,forwardGroup:2},{index:2,forwardGroup:3},{index:3,forwardGroup:4}],controlEvents:[],performWindows:[
    {command:'changeFigure',line:0,role:'primary',durationMs:300,hold:false,startMs:0,stopMs:300},
    {command:'pixiPerform',line:1,role:'primary',durationMs:0,hold:true,startMs:1000,stopMs:3000},
    {command:'changeFigure',line:3,role:'primary',durationMs:450,hold:false,startMs:4000,stopMs:4450}
  ],stageExitWindows:[{target:'hero123-off',startMs:4000,stopMs:4450}]};
  const plan=build({script,parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(plan.replayWindows.find(w=>w.command==='pixiPerform').noCut,true);
  assert.equal(plan.replayWindows.some(w=>w.command==='changeFigure-runtime'),false);
  const exit=plan.replayWindows.find(w=>w.command==='changeFigure-exit');
  assert.equal(exit.noCut,false);
  assert.equal(exit.startMs,4000);

  const relaxed=build({script,parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60,allowDecorativePixiCuts:true});
  assert.equal(relaxed.replayWindows.some(w=>w.command==='pixiPerform'),false);
  assert.equal(relaxed.relaxedDecorativePixi.length,1);
  assert.equal(relaxed.relaxedDecorativePixi[0].name,'rain');

  const customScript=script.replace('pixiPerform:rain;','pixiPerform:customStorm;');
  const customParsed={sentenceList:[parsed.sentenceList[0],cmd('pixiPerform','customStorm',[],1),parsed.sentenceList[2],parsed.sentenceList[3]]};
  const custom=build({script:customScript,parsed:customParsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60,allowDecorativePixiCuts:true});
  assert.equal(custom.replayWindows.find(w=>w.command==='pixiPerform').noCut,true);
  assert.equal(custom.relaxedDecorativePixi.length,0);
}

{
  // A Live2D/WMDL figure may stay on stage for most of a scene. Its motion/blink/focus
  // configuration is part of stage state and is restored by WebGAL syncLive2d, so the
  // figure's whole lifetime must not become a no-cut window.
  const script=['changeFigure:hero/model.json -id=hero;','hero:first;','hero:middle;','hero:last;'].join('\n');
  const parsed={sentenceList:[
    cmd('changeFigure','hero/model.json',[{key:'id',value:'hero'},{key:'motion',value:'idle'},{key:'blink',value:'{"blinkInterval":5000}'}],0),
    say('first',[],1),say('middle',[],2),say('last',[],3)
  ]};
  const timing={durationSeconds:60,lineTimes:[0,1000,20000,40000],sourceEvents:[{index:0,forwardGroup:1},{index:1,forwardGroup:2},{index:2,forwardGroup:3},{index:3,forwardGroup:4}],controlEvents:[],performWindows:[
    {command:'changeFigure',line:0,role:'primary',durationMs:300,hold:false,startMs:0,stopMs:300},
    {command:'say',line:1,role:'primary',durationMs:800,hold:false,startMs:1000,stopMs:1800},
    {command:'say',line:2,role:'primary',durationMs:800,hold:false,startMs:20000,stopMs:20800},
    {command:'say',line:3,role:'primary',durationMs:800,hold:false,startMs:40000,stopMs:40800}
  ],stageExitWindows:[]};
  const plan=build({script,parsed,media:{},animations:{},timing,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(plan.replayWindows.some(w=>w.noCut&&w.startMs===0&&w.endMs>=60000),false);
  assert.equal(plan.replayWindows.some(w=>w.command==='changeFigure-runtime'),false);
  const phase=plan.replayWindows.find(w=>w.command==='changeFigure-phase');
  assert.ok(phase,'persistent Live2D must carry a replay-only phase window');
  assert.equal(phase.startMs,0);
  assert.equal(phase.endMs,60000);
  assert.equal(phase.noCut,false,'normal mode must replay Live2D phase state without forbidding every cut');
  assert.equal(plan.softCutWindows.length,1);
  assert.equal(plan.softCutWindows[0].reason,'live2d-state-change');
  assert.equal(plan.softCutWindows[0].startMs,0);
  assert.equal(plan.softCutWindows[0].endMs,1000);
  assert.equal(plan.strictSegmentCuts,false);

  const switchedScript=['changeFigure:hero/model.json -id=hero -motion=idle;','hero:before;','changeFigure:hero/model.json -id=hero -motion=wave;','hero:after;'].join('\n');
  const switchedParsed={sentenceList:[
    cmd('changeFigure','hero/model.json',[{key:'id',value:'hero'},{key:'motion',value:'idle'}],0),
    say('before',[],1),
    cmd('changeFigure','hero/model.json',[{key:'id',value:'hero'},{key:'motion',value:'wave'}],2),
    say('after',[],3)
  ]};
  const switchedTiming={durationSeconds:30,lineTimes:[0,1000,10000,12000],sourceEvents:[{index:0,forwardGroup:1},{index:1,forwardGroup:2},{index:2,forwardGroup:3},{index:3,forwardGroup:4}],controlEvents:[],performWindows:[
    {command:'changeFigure',line:0,role:'primary',durationMs:300,hold:false,startMs:0,stopMs:300},
    {command:'say',line:1,role:'primary',durationMs:800,hold:false,startMs:1000,stopMs:1800},
    {command:'changeFigure',line:2,role:'primary',durationMs:300,hold:false,startMs:10000,stopMs:10300},
    {command:'say',line:3,role:'primary',durationMs:800,hold:false,startMs:12000,stopMs:12800}
  ],stageExitWindows:[]};
  const switched=build({script:switchedScript,parsed:switchedParsed,media:{},animations:{},timing:switchedTiming,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  const phases=switched.replayWindows.filter(w=>w.command==='changeFigure-phase');
  assert.equal(phases.length,2);
  assert.equal(phases[0].startMs,0);
  assert.equal(phases[0].endMs,10000);
  assert.equal(phases[1].startMs,10000);
  assert.equal(phases[1].endMs,30000);
  assert.ok(phases.every(w=>w.noCut===false),'normal mode phase windows must be replay-only, not hard no-cut');

  const strict=build({script:switchedScript,parsed:switchedParsed,media:{},animations:{},timing:switchedTiming,root:'C:/root',project:'P',sceneName:'start.txt',fps:60,strictSegmentCuts:true});
  assert.equal(strict.strictSegmentCuts,true);
  const strictPhases=strict.replayWindows.filter(w=>w.command==='changeFigure-phase');
  assert.equal(strictPhases.length,2);
  assert.ok(strictPhases.every(w=>w.noCut===true),'strict mode must hard-protect active Live2D phases');
}

{
  const renderSource=fs.readFileSync(path.join(root,'browser','render.js'),'utf8');
  const gpuRawSource=fs.readFileSync(path.join(root,'src','GpuRawExport.cs'),'utf8');
  const coreSource=fs.readFileSync(path.join(root,'src','Core.cs'),'utf8');
  const jobSource=fs.readFileSync(path.join(root,'src','JobRunner.cs'),'utf8');
  assert.ok(renderSource.includes('__webviewWarmupStep=async frame=>'),'GPU raw warmup must expose a stage-rendering step');
  assert.ok(renderSource.includes('currentApp.render();return value;'),'warmup step must actually render the Pixi stage so Live2D/WMDL advances');
  assert.ok(gpuRawSource.includes('domOverlay?"__webviewWarmupStep(":"__webviewStep("'),'GPU raw warmup must render the stage when DOM compositing suppresses normal per-step renders');
  assert.ok(gpuRawSource.includes('"warmupStageRenders",warmupStageRenders'),'GPU raw result must expose warmup stage-render diagnostics');
  assert.ok(renderSource.includes('__gpuDomCapturePlan=()=>'),'DOM compositor must classify refresh scope before capture');
  assert.ok(renderSource.includes('__gpuDomOverlayUpdateBase=async baseData=>'),'DOM compositor must support base-only texture refresh');
  assert.ok(renderSource.includes("return (position==='absolute'||position==='fixed'||(props.length>0&&props.every(p=>paintOnly.has(p))))?'base':'full'"),'only isolated/paint-only animations may use base-only refresh');
  assert.ok(gpuRawSource.includes('domCapturePlan=await browser.Eval("__gpuDomCapturePlan()")'),'GPU raw export must consume scoped DOM capture plans');
  assert.ok(gpuRawSource.includes('domBaseOnlyRefreshCount++'),'base-only animation frames must avoid full textbox/atlas recapture');
  assert.ok(gpuRawSource.includes('"domFullRefreshCount",domFullRefreshCount'),'DOM refresh scope diagnostics must be persisted');
  assert.ok(coreSource.includes('Probe(codec,codec=="x264rgb"?"lossless":"recommended",640,360,30)'),'hardware capability detection must not use the old tiny 64x64 probe');
  assert.ok(coreSource.includes('CheckConcurrentRequest(object request,int parallel)'),'hardware encoders must be checked at the planned worker concurrency');
  assert.ok(coreSource.includes('Enumerable.Range(0,count).Select(_=>Probe(codec,mode,width,height,fps,8,true))'),'concurrency preflight must overlap real target-size encoder sessions');
  assert.ok(jobSource.includes('"encoder-preflight"'),'jobs must expose hardware concurrency preflight before rendering');
  assert.ok(jobSource.includes('renderCancel.Cancel()'),'runtime hardware encoder failure must cancel sibling workers immediately');
  assert.ok(jobSource.includes('7200000,renderCancel.Token'),'worker processes must receive fail-fast cancellation');
  assert.ok(renderSource.includes("data-gpu-intro-text"),'intro fade text must be separable from the generic base DOM texture');
  assert.ok(renderSource.includes("handledIntroOpacitySamples"),'intro opacity animations must be handled without per-frame Page.captureScreenshot');
  assert.ok(renderSource.includes("state.introTextContainer=new PIXI.Container()"),'intro text must have a dedicated Pixi layer above the generic DOM base');
  assert.ok(renderSource.includes("state.container.setChildIndex(state.baseSprite"),'intro mode must restore DOM z-order so the full-screen intro overlays the dialogue box');
  assert.ok(renderSource.includes("introEntry?Math.max"),'intro atlas entries must follow their real CSS opacity even when dialogue text is settled');

  const uiSource=fs.readFileSync(path.join(root,'browser','export-component.js'),'utf8');
  assert.ok(coreSource.includes('"notendVisualTail",true'),'backend settings must default notend visual tail on');
  assert.ok(uiSource.includes("notendVisualTail:true"),'export UI fallback settings must default notend visual tail on');
  assert.ok(uiSource.includes('平滑自定义引擎 -notend 连续对白过渡（推荐）'),'advanced settings must expose the notend visual-tail toggle');
  assert.ok(uiSource.includes("settings.notendVisualTail!==false"),'advanced checkbox must render checked unless explicitly disabled');
  assert.ok(coreSource.includes('"strictSegmentCuts",false'),'backend settings must default strict segment cuts off');
  assert.ok(uiSource.includes("strictSegmentCuts:false"),'export UI fallback settings must default strict segment cuts off');
  assert.ok(uiSource.includes('严格切片模式（优先保证复杂演出连续性）'),'advanced settings must expose the strict seam mode');
  assert.ok(uiSource.includes("settings.strictSegmentCuts"),'strict seam checkbox must bind to persisted settings');
}

console.log('Export lifecycle regression checks passed.');

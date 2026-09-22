import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const context={console,queueMicrotask,setTimeout,clearTimeout};
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
assert.equal(typeof context.__exportDialogueDomSnapshot,'function');
assert.equal(typeof context.__exportLive2DLifetimeAt,'function');
assert.equal(typeof context.__exportResolveCubism2Idle,'function');
assert.equal(typeof context.__exportCubism2MotionEpoch,'function');
assert.equal(typeof context.__exportCubism2QueueTimingKeys,'function');
assert.equal(typeof context.__exportRebaseCubism2QueueEntry,'function');
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
  const entries=[{index:0,durationMs:1000,loop:false},{index:1,durationMs:1500,loop:false},{index:2,durationMs:800,loop:false}];
  const a=context.__exportResolveCubism2Idle(entries,0,'hero|0|model.json');
  const b=context.__exportResolveCubism2Idle(entries,4250,'hero|0|model.json');
  const b2=context.__exportResolveCubism2Idle(entries,4250,'hero|0|model.json');
  assert.ok(a&&b);
  assert.deepEqual(b,b2,'Cubism2 idle lookup must be deterministic for the same model age');
  assert.ok(b.offsetMs>=0&&b.offsetMs<b.durationMs,'Cubism2 idle seek must land inside the selected motion');
  const loop=context.__exportResolveCubism2Idle([{index:4,durationMs:1200,loop:true}],6100,'loop');
  assert.equal(loop.index,4);
  assert.equal(loop.offsetMs,100,'looping idle motion must seek by modulo without inventing a new random motion');
  const epochLifetime={motionEvents:[{atMs:0,group:'idle',index:0},{atMs:10000,group:'wave',index:0},{atMs:20000,group:'',index:0}]};
  assert.equal(context.__exportCubism2MotionEpoch(epochLifetime,9999)?.group,'idle');
  assert.equal(context.__exportCubism2MotionEpoch(epochLifetime,15000)?.group,'wave');
  assert.equal(context.__exportCubism2MotionEpoch(epochLifetime,25000)?.group,'');
  const fakeEntry={available:true,finished:false,a:-1,b:-1,c:-1,id:7};
  const fakeMotion={updateParam:function(model,entry){if(!entry.available||entry.finished)return;if(entry.a<0){entry.a=1;entry.b=1;if(entry.c<0)entry.c=2;}}};
  const keys=context.__exportCubism2QueueTimingKeys(fakeMotion,fakeEntry);
  assert.equal(keys?.start,'a','obfuscated Cubism2 start-time field must be inferred from updateParam access order');
  assert.equal(keys?.fade,'b','obfuscated Cubism2 fade-time field must be inferred from updateParam access order');
  assert.equal(keys?.end,'c','obfuscated Cubism2 end-time field must be inferred from updateParam access order');
  assert.equal(context.__exportRebaseCubism2QueueEntry(fakeMotion,fakeEntry,5000,{offsetMs:1250,durationMs:3000,loop:false}),true);
  assert.equal(fakeEntry.a,3750);
  assert.equal(fakeEntry.b,3750);
  assert.equal(fakeEntry.c,6750);
}

{
  const previousProbe=context.__wgProbe,previousDocument=context.document,previousPending=context.__exportDialoguePending,previousSerial=context.__exportDialogueMutationSerial;
  context.__wgProbe={stageManager:{getCalculationStageState:()=>({currentDialogKey:'dlg',showText:'abc'})}};
  context.document={getElementById:id=>id==='textBoxMain'?{querySelectorAll:()=>[{},{},{}]}:null};
  context.__exportDialoguePending={serial:7,targetKey:'dlg',targetText:'abc',targetCount:3};
  context.__exportDialogueMutationSerial=7;
  assert.equal(context.__exportDialogueDomReady(),false,'ordinary dialogue must still require a fresh TextBox mutation');
  assert.equal(context.__exportDialogueDomReady(true),true,'prefix restore may accept a fully matching stable DOM without a new mutation');
  const stableSnapshot=context.__exportDialogueDomSnapshot();
  assert.equal(stableSnapshot.readyStable,true);
  assert.equal(stableSnapshot.spanCount,3);
  assert.equal(stableSnapshot.targetCount,3);
  context.document={getElementById:()=>null};
  const missingSnapshot=context.__exportDialogueDomSnapshot();
  assert.equal(missingSnapshot.readyStable,false,'missing/alternate TextBox DOM must be diagnosable without being a hard restore failure');
  context.document={getElementById:id=>id==='textBoxMain'?{querySelectorAll:()=>[{},{},{}]}:null};
  context.__exportDialogueMutationSerial=8;
  assert.equal(context.__exportDialogueDomReady(),true,'ordinary dialogue becomes ready after the tracked mutation');
  context.__wgProbe=previousProbe;context.document=previousDocument;context.__exportDialoguePending=previousPending;context.__exportDialogueMutationSerial=previousSerial;
}

{
  const previousProbe=context.__wgProbe,previousDocument=context.document,previousPending=context.__exportDialoguePending,previousSerial=context.__exportDialogueMutationSerial,previousClock=context.__pwClock,previousMutationObserver=context.MutationObserver,previousDiagnostics=context.__exportDialogueWaitDiagnostics;
  context.MutationObserver=class{observe(){}disconnect(){}};
  context.__pwClock={controller:{_embedder:{setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);}}}};
  context.__wgProbe={stageManager:{getCalculationStageState:()=>({currentDialogKey:'dlg',showText:'a\u200bb'})}};
  context.document={body:{},getElementById:id=>id==='textBoxMain'?{querySelectorAll:()=>[{}],textContent:'ab'}:null};
  context.__exportDialoguePending={serial:10,targetKey:'dlg',targetText:'a\u200bb',targetCount:3};
  context.__exportDialogueMutationSerial=11;context.__exportDialogueWaitDiagnostics=[];context.__exportCurrentFrame=42;
  assert.equal(await context.__exportWaitDialogueDom({timeoutMs:5}),false,'matching stage plus a real TextBox mutation may fall back when special text makes span counting disagree');
  assert.equal(context.__exportDialogueWaitDiagnostics.length,1);
  assert.equal(context.__exportDialogueWaitDiagnostics[0].outcome,'fallback');
  assert.ok(context.__exportDialogueWaitDiagnostics[0].targetCodePoints.includes('U+200B'),'fallback diagnostics must expose zero-width code points');
  context.__wgProbe={stageManager:{getCalculationStageState:()=>({currentDialogKey:'other',showText:'other'})}};
  context.__exportDialoguePending={serial:20,targetKey:'dlg',targetText:'abc',targetCount:3};context.__exportDialogueMutationSerial=21;
  await assert.rejects(()=>context.__exportWaitDialogueDom({timeoutMs:5}),/对白 DOM 同步超时/,'stage mismatch must remain a hard failure');
  context.__wgProbe=previousProbe;context.document=previousDocument;context.__exportDialoguePending=previousPending;context.__exportDialogueMutationSerial=previousSerial;context.__pwClock=previousClock;context.MutationObserver=previousMutationObserver;context.__exportDialogueWaitDiagnostics=previousDiagnostics;
}

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
  const setTarget=rendererSource.indexOf('__exportSetDialogueTarget()',syncScene);
  const domReady=rendererSource.indexOf('__exportDialogueDomReady(true)',setTarget);
  const softTimeout=rendererSource.indexOf('catch(TimeoutException){}',domReady);
  const diagnostic=rendererSource.indexOf('__exportDialogueDomSnapshot()',softTimeout);
  const forceSettle=rendererSource.indexOf('__exportForceTextSettle=true',prefixRestore);
  assert.ok(domInstall>=0&&prefixRestore>=0&&domInstall<prefixRestore,'GPU DOM tracking must exist before prefix restore');
  assert.ok(beginDialogue>prefixRestore&&syncScene>beginDialogue,'prefix restore must arm dialogue mutation tracking before sync-scene');
  assert.ok(setTarget>syncScene&&domReady>setTarget&&softTimeout>domReady&&diagnostic>softTimeout&&forceSettle>diagnostic,'prefix restore must treat DOM readiness as a bounded diagnostic wait, then force-settle and continue');
  assert.ok(rendererSource.includes('restore-dialogue.json'),'prefix restore must persist its DOM mismatch diagnostics');
  const timelineSource=fs.readFileSync(path.join(root,'browser','timeline.js'),'utf8');
  const waitOverride=timelineSource.match(/if\(command==='wait'&&params\.next!==true\)\{([\s\S]*?)\n\s*\}/)?.[1]||'';
  assert.ok(waitOverride.includes('blockingAuto'),'planner must keep ordinary wait from being skipped by autoplay');
  assert.ok(timelineSource.includes("policy.notendVisualTail!==false&&command==='say'"),'notend visual tail must be controlled by an explicit default-on planner setting');
  assert.ok(!waitOverride.includes('blockingNext'),'planner must not turn ordinary wait into blockingNext; that creates stale goNextWhenOver retries');
  assert.ok(timelineSource.includes("policy.mode==='auto'&&pc.performList.some(p=>p.blockingAuto?.())"),'planner must reject autoplay next while dialogue still blocks auto');
  const renderSource=fs.readFileSync(path.join(root,'browser','render.js'),'utf8');
  assert.ok(renderSource.includes("timingMode==='auto'&&pc.performList.some(p=>p.blockingAuto?.())"),'renderer must ignore stale replayed auto-next while dialogue still blocks auto');
  assert.ok(renderSource.includes('__exportDialogueDomReady=(allowStable=false)=>'),'dialogue readiness must distinguish normal playback from prefix stable-state recovery');
  assert.ok(renderSource.includes('return !!allowStable||globalThis.__exportDialogueMutationSerial>pending.serial;'),'prefix stable-state recovery must not require a redundant DOM mutation');
  assert.ok(renderSource.includes('await globalThis.__exportWaitDialogueDom();'),'normal say rendering must retain strict mutation synchronization');
  assert.ok(renderSource.includes('timeoutMs=Number.isFinite(configured)?Math.max(0,configured):2500'),'normal dialogue synchronization must have a bounded 2.5s wall-clock wait');
  assert.ok(renderSource.includes("fallback=!allowStable&&mutationObserved&&stageMatches"),'dialogue wait fallback must require both the target stage and a real tracked TextBox mutation');
  assert.ok(renderSource.includes("new Error('对白 DOM 同步超时：'+JSON.stringify(diagnostic))"),'stage mismatches must remain fatal after the bounded wait');
  assert.ok(renderSource.includes('targetCodePoints:codePoints(targetText)'),'dialogue diagnostics must expose invisible/special code points');
  assert.ok(renderSource.includes('dialogueWaitDiagnostics:globalThis.__exportDialogueWaitDiagnostics||[]'),'GPU DOM results must retain dialogue wait fallback diagnostics');
  const browserHostSource=fs.readFileSync(path.join(root,'src','BrowserHost.cs'),'utf8');
  assert.ok(browserHostSource.includes('ScriptPreview(expression)'),'page-script timeouts must identify the expression that stalled');
  assert.ok(browserHostSource.includes('Math.Min(5000,remaining)'),'state waits must bound each CDP evaluation instead of silently overrunning their own timeout');
  const mainSource=fs.readFileSync(path.join(root,'src','Main.cs'),'utf8');
  assert.ok(mainSource.includes('Console.SetError(new StreamWriter(Console.OpenStandardError(),utf8){AutoFlush=true})'),'native stderr must be emitted as explicit UTF-8');
  const jobSource=fs.readFileSync(path.join(root,'src','JobRunner.cs'),'utf8');
  assert.ok(jobSource.includes('Exception terminalRenderFailure=null'),'terminal non-hardware worker failures must be preserved');
  assert.ok(jobSource.includes('if(terminalRenderFailure==null)terminalRenderFailure=e;renderCancel.Cancel();throw;'),'a worker that fails again after retry must cancel sibling workers immediately');
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
  assert.ok(lifecycleSource.includes('static async Task<int> CurrentTerreListenerPid(object config)'),'lifecycle must be able to rediscover the live Terre listener after a launcher PID handoff');
  assert.ok(lifecycleSource.includes('"phase","backend-adopted"'),'lifecycle must log when it adopts a replacement Terre backend PID');
  assert.ok(lifecycleSource.includes('backendMissing.Elapsed.TotalSeconds>=8'),'backend PID death must get a bounded handoff grace period before Terre is considered gone');
  assert.ok(!lifecycleSource.includes('while(Commands.Alive(backendPid))'),'lifecycle must not terminate solely because the original Process.Start PID exited');
  assert.ok(lifecycleSource.includes('backendPid=await CurrentTerreListenerPid(config)'),'attach mode must use the same instance-verified listener lookup');
  assert.ok(lifecycleSource.includes('J.S(current,"serviceId")==serviceId'),'forced service cleanup must use service ownership instead of comparing the process-guard PID with the real service PID');
  assert.ok(lifecycleSource.includes('string stoppingServiceId=ServiceIdFor(terre,state)'),'lifecycle shutdown must capture the real service generation before killing its guard');
  const lifecycleFinally=lifecycleSource.indexOf('   finally{');
  const shutdownOwned=lifecycleSource.indexOf('CleanupServiceFiles(terre,state,servicePid,stoppingServiceId)',lifecycleFinally);
  const shutdownSweep=lifecycleSource.indexOf('CleanupStaleServiceFiles(config,state)',shutdownOwned);
  assert.ok(lifecycleFinally>=0&&shutdownOwned>lifecycleFinally&&shutdownSweep>shutdownOwned,'lifecycle shutdown must remove owned discovery and then sweep stale service state');
  assert.ok(lifecycleSource.includes('"serviceGuardPid",servicePid'),'lifecycle diagnostics must distinguish the guard PID from the service discovery PID');
  assert.ok(!lifecycleSource.includes('if(Commands.Alive((int)J.N(old,"pid"))){NativeDialogs.Open'),'the old PID-only reuse path must not return');
  const queueSource=fs.readFileSync(path.join(root,'src','QueueService.cs'),'utf8');
  assert.ok(queueSource.includes('"serviceId",serviceId'),'service discovery must carry an ownership generation');
  assert.ok(queueSource.includes('"pid",Process.GetCurrentProcess().Id'),'service discovery must identify its owning process');
  assert.ok(queueSource.includes('RemoveOwnedServiceFile'),'graceful service shutdown must not leave stale discovery');
  const exportSource=fs.readFileSync(path.join(root,'browser','export-component.js'),'utf8');
  assert.ok(exportSource.includes('无法连接本地导出服务'),'native connection failures must not surface as a bare Failed to fetch');
  assert.ok(exportSource.includes('_stageClockAnchorMs'),'export stage timers must retain a client-side clock anchor independent of backend status cadence');
  assert.ok(exportSource.includes('setInterval(()=>setClockNow(Date.now()),500)'),'export UI must repaint its elapsed timer independently of /api/jobs polling');
  assert.ok(exportSource.includes('format(liveStageElapsed(job))'),'running job stage elapsed display must use the independent client-side clock');
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
  assert.equal(plan.replayWindows.some(w=>w.command==='changeFigure-phase'),false,'normal mode must not replay from a long-lived Live2D birth point');
  assert.equal(plan.live2dLifetimes.length,1);
  assert.equal(plan.live2dLifetimes[0].target,'hero');
  assert.equal(plan.live2dLifetimes[0].startMs,0);
  assert.equal(plan.live2dLifetimes[0].endMs,60000);
  assert.equal(plan.live2dLifetimes[0].motionEvents.length,1,'explicit -motion must be recorded as a seekable epoch inside the same model lifetime');
  assert.equal(plan.live2dLifetimes[0].motionEvents[0].group,'idle');
  assert.equal(plan.live2dLifetimes[0].motionEvents[0].atMs,0);
  assert.equal(context.__exportLive2DLifetimeAt(plan.live2dLifetimes,'hero',30000)?.startMs,0);
  assert.equal(context.__exportLive2DLifetimeAt(plan.live2dLifetimes,'hero',60000),null,'lifetime end is exclusive');
  assert.equal(plan.softCutWindows.length,1);
  assert.equal(plan.softCutWindows[0].reason,'live2d-state-change');
  assert.equal(plan.softCutWindows[0].startMs,0);
  assert.equal(plan.softCutWindows[0].endMs,1000);
  assert.equal(plan.strictSegmentCuts,false);

  const autoScript=['changeFigure:hero/model.json -id=autoHero;','autoHero:one;','autoHero:two;'].join('\n');
  const autoParsed={sentenceList:[cmd('changeFigure','hero/model.json',[{key:'id',value:'autoHero'}],0),say('one',[],1),say('two',[],2)]};
  const autoTiming={durationSeconds:20,lineTimes:[0,1000,10000],sourceEvents:[{index:0,forwardGroup:1},{index:1,forwardGroup:2},{index:2,forwardGroup:3}],controlEvents:[],performWindows:[
    {command:'changeFigure',line:0,role:'primary',durationMs:300,hold:false,startMs:0,stopMs:300},
    {command:'say',line:1,role:'primary',durationMs:800,hold:false,startMs:1000,stopMs:1800},
    {command:'say',line:2,role:'primary',durationMs:800,hold:false,startMs:10000,stopMs:10800}
  ],stageExitWindows:[]};
  const autoPlan=build({script:autoScript,parsed:autoParsed,media:{},animations:{},timing:autoTiming,root:'C:/root',project:'P',sceneName:'start.txt',fps:60});
  assert.equal(autoPlan.live2dLifetimes.length,1);
  assert.equal(autoPlan.live2dLifetimes[0].motionEvents.length,0,'plain Cubism2/Live2D figures start directly on the deterministic auto-idle timeline');

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
  assert.equal(switched.replayWindows.some(w=>w.command==='changeFigure-phase'),false);
  assert.equal(switched.live2dLifetimes.length,1,'motion changes must not restart the underlying Live2D model lifetime');
  assert.equal(switched.live2dLifetimes[0].startMs,0);
  assert.equal(switched.live2dLifetimes[0].endMs,30000);
  assert.equal(switched.live2dLifetimes[0].motionEvents.length,2,'motion changes must be retained as epochs without restarting the model lifetime');
  assert.equal(switched.live2dLifetimes[0].motionEvents[0].group,'idle');
  assert.equal(switched.live2dLifetimes[0].motionEvents[1].group,'wave');
  assert.equal(switched.live2dLifetimes[0].motionEvents[1].atMs,10000);

  const strict=build({script:switchedScript,parsed:switchedParsed,media:{},animations:{},timing:switchedTiming,root:'C:/root',project:'P',sceneName:'start.txt',fps:60,strictSegmentCuts:true});
  assert.equal(strict.strictSegmentCuts,true);
  assert.equal(strict.live2dLifetimes.length,1,'strict mode uses the same model lifetime metadata; SegmentPlan decides whether to hard-protect it');
}

{
  const renderSource=fs.readFileSync(path.join(root,'browser','render.js'),'utf8');
  const gpuRawSource=fs.readFileSync(path.join(root,'src','GpuRawExport.cs'),'utf8');
  const coreSource=fs.readFileSync(path.join(root,'src','Core.cs'),'utf8');
  const jobSource=fs.readFileSync(path.join(root,'src','JobRunner.cs'),'utf8');
  const segmentSource=fs.readFileSync(path.join(root,'src','SegmentPlan.cs'),'utf8');
  assert.ok(renderSource.includes('__webviewWarmupStep=async frame=>'),'GPU raw warmup must expose a stage-rendering step');
  assert.ok(renderSource.includes('breath.__webVideoAbsoluteModelAge=true'),'Cubism4 breath must be rebound to absolute model age for seam continuity');
  assert.ok(renderSource.includes('breath._currentTime=ageSeconds-delta;'),'breath phase compensation must allow the first tick to land exactly on model age');
  assert.ok(renderSource.includes('manager.__webVideoDeterministicIdle=true'),'Cubism2 auto-idle must use model-local deterministic seeking');
  assert.ok(renderSource.includes('manager.__webVideoMotionEntries||(manager.__webVideoMotionEntries=new Map())'),'Cubism2 motion metadata must be cached per group and model');
  assert.ok(renderSource.includes('globalThis.__exportSeekCubism2Current=seekCubism2State'),'Cubism2 restore must expose immediate current-motion seeking');
  assert.ok(renderSource.includes('if(lifetime)await seekCubism2State(manager,queue,target,lifetime,nowMs)'),'a newly bound/restored Cubism2 model must seek its current motion immediately, not wait for the next random-idle request');
  assert.ok(renderSource.includes('__exportRebaseCubism2QueueEntry'),'Cubism2 motion queue entries must be rebased so restored workers resume the same idle phase');
  assert.ok(renderSource.includes('entry[keys.start]=start;entry[keys.fade]=start;entry[keys.end]=end'),'obfuscated Cubism2 core timing fields must be rebased without hardcoding private field names');
  assert.ok(renderSource.includes('__exportCubism2MotionEpoch(lifetime,nowMs)'),'explicit user motions must be restored from their absolute motion epoch instead of opting out of seeking');
  assert.ok(renderSource.includes('__exportCurrentSimulationMs=Number(t)||0'),'every export frame must publish its absolute simulation time before Live2D advances');
  assert.ok(renderSource.includes('if(live2dBindingPending){await bindLive2DDeterminism();live2dBindingPending=false;}'),'Live2D hook discovery and immediate motion seek must complete once on the initial restored frame before rendering advances');
  assert.ok(renderSource.includes("if(batch.some(e=>e.loads)){await __exportWaitForStageAssets();await bindLive2DDeterminism();live2dBindingPending=false;}"),'Live2D hook discovery must rerun only after resource-loading events can create a model and must finish before the frame is captured');
  assert.ok(!renderSource.includes('__exportCurrentSimulationMs=Number(t)||0;\n  bindLive2DDeterminism();'),'the hot per-frame path must not rescan all Live2D stage objects');
  assert.ok(renderSource.includes('__exportLive2DLifetimeAt'),'renderer must resolve the active model lifetime without replaying from model birth');
  assert.ok(segmentSource.includes('Live2DPhysicsWarmupSeconds=1d'),'Live2D physics must use a bounded warmup instead of whole-lifetime replay');
  assert.ok(segmentSource.includes('live2dActive(cut)?live2dPhysicsWarmupFrames:minReplayWarmupFrames'),'only cuts inside an active Live2D lifetime need the longer physics warmup');
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


{
  const installerBase=fs.readFileSync(path.join(root,'installer','Installer.base.cs'),'utf8');
  const installerEnhancements=fs.readFileSync(path.join(root,'installer','installer-enhancements.mjs'),'utf8');
  assert.ok(installerBase.includes('public void CleanupStalePayloadArtifacts()'),'installer must garbage-collect payloads left by older versions');
  assert.ok(installerBase.includes('name.Length!=76'),'legacy payload ZIP cleanup must require the exact SHA-256 filename shape');
  assert.ok(installerBase.includes('IsPayloadHash(name,16)'),'legacy package cleanup must require a 16-hex package directory');
  assert.ok(installerBase.includes('Path.Combine(directory,"webgal-"+"native-exporter")'),'legacy package cleanup must recognize the pre-WebVideo+ payload root without configure-time rewriting');
  assert.ok(installerBase.includes('File.Exists(marker)||File.Exists(registry)'),'custom cache roots must have WebVideo+ ownership evidence before historical GC');
  assert.equal((installerBase.match(/engine\.CleanupStalePayloadArtifacts\(\);SetBusy\(false\)/g)||[]).length,2,'base installer install and uninstall finalizers must run historical payload GC');
  assert.ok(installerEnhancements.includes('void CleanupPayloadCaches()'),'enhanced installer must centralize current and historical payload cleanup');
  assert.ok(installerEnhancements.includes('new SetupEngine(defaultRoot,Report).CleanupStalePayloadArtifacts()'),'custom install-cache users must also clean the legacy default cache');
  assert.equal((installerEnhancements.match(/finally\{CleanupPayloadCaches\(\);SetBusy\(false\);\}/g)||[]).length,2,'enhanced install and uninstall finalizers must run payload cleanup');
}

console.log('Export lifecycle regression checks passed.');

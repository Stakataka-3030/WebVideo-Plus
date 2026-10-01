/* Tests only. Inject into an already verified Craft editor CDP context.
 * Use ONLY a caller-created disposable, saved project, with no concurrent editing.
 * No save command, direct scene-file write, AI request, installation or private store API.
 *
 * const probe = await WebVideoCraftAuthoringAcceptance({disposable:true,
 *   projectId: EXACT_ID, projectPath: EXACT_PROJECT_ROOT, path: EXACT_SCENE_PATH,
 *   source: EXACT_SAVED_SOURCE, hint:{line:EXACT_LINE,key:EXACT_RESERVED_KEY,duration:2000},
 *   navigationLine: EXACT_NON_HINT_LINE});
 * await probe.authoring(); // staged Anogo, undo, real backup restore, undo
 * await probe.startHint({previousTicket: LAST_PREVIEW_TICKET_OR_NULL}); // returns immediately
 * In the verified preview default context, read:
 *   (()=>{const r=window.__WebVideoCraftTimedHintV1;return r&&
 *     {ticket:r.ticket,state:r.state,clicked:r.clicked,elapsedMs:r.startedAt===null?0:
 *      performance.now()-r.startedAt}})()
 * Wait for showing; pass that object to probe.captureHint(evidence).
 * Completion: wait duration+250ms, reread and await probe.finishHint(evidence).
 * Cancel: start again, capture showing, await probe.interruptHint('cancel');
 *   wait duration+250ms, reread then finishHint(evidence).
 * Navigation: same using interruptHint('navigate'); actual bridge.preview is used.
 * Each case needs its OWN ticket. Supply final evidence from the SAME preview context.
 * Finally await probe.finish(); all three cases must pass; original buffer must remain.
 * This probe leaves owned JSON backup artifacts in the disposable project for inspection.
 */
(function(root){
  'use strict';
  root.WebVideoCraftAuthoringAcceptance = async function(expected){
    if(expected?.disposable!==true || !['projectId','projectPath','path','source'].every(k=>typeof expected[k]==='string'&& (k==='source'||expected[k])))
      throw Error('Exact disposable project and saved fixture source are required');
    const bridge=root.WebVideoCraftBridge, Script=root.WebVideoCraftScript;
    if(!bridge||!Script||!root.WebVideoCraftFeatures||!root.WebVideoCraftImports||!root.WebVideoCraftBackups)throw Error('Actual feature modules are required');
    const results=[], artifacts=[], completed=new Set();let active=null,authoringPassed=false;
    const check=(ok,name)=>{results.push({name,passed:!!ok});if(!ok)throw Error(name)};
    async function snapshot(source=expected.source){const s=await bridge.snapshot();check(['projectId','projectPath','path'].every(k=>s[k]===expected[k])&&s.source===source,'exact disposable scene/source');return s}
    const initial=await snapshot();
    const pair=Script.hintPairs(Script.parse(initial.source,{path:initial.path,capabilities:initial.runtimeCapabilities})).find(p=>p.valid&&p.choose.startLine===expected.hint?.line&&p.key===expected.hint?.key&&p.duration===expected.hint?.duration);
    check(!!pair&&pair.duration>=1000&&pair.duration<=10000,'saved hint fixture has bounded observable timer');
    check(Number.isInteger(expected.navigationLine)&&expected.navigationLine>0&&expected.navigationLine!==pair.choose.startLine,'explicit separate navigation line');
    const nav=root.WebVideoCraftFeatures.model(initial).statements.find(r=>r.startLine===expected.navigationLine);
    check(!!nav&&nav.command!=='choose','navigation target is a real non-choice statement');
    const backup=root.WebVideoCraftBackups.createController(bridge);
    // Capture is also the public bridge's saved-documents precondition check.
    const captured=await backup.captureStory();artifacts.push(captured.file);
    const listed=await backup.list(),descriptor=listed.find(x=>x.file===captured.file);
    check(!!descriptor,'captured backup appears in actual list');
    const saved=await backup.read(descriptor),relative='game/scene/'+initial.sceneRelativePath;
    check(saved.kind==='storySet'&&saved.files.some(f=>f.path===relative&&f.source===expected.source),'captured saved scene matches exact fixture');
    async function undoExact(current,target){await snapshot(current);await bridge.undo();await snapshot(target)}
    return Object.freeze({
      async authoring(){
        check(!active&&!authoringPassed,'authoring runs once without an active hint');
        const importer=root.WebVideoCraftImports.create({bridge,script:Script});
        let changedSource=null;const ownedUndo=[];
        try{
          const before=await snapshot();
          const preview=await importer.previewAnogo(JSON.stringify([{旁白:'WebVideo disposable native Anogo acceptance'}]));
          const staged=await snapshot();
          check(staged.revision===before.revision&&preview.statementCount===1,'Anogo preview leaves native buffer and revision untouched');
          await importer.apply();const applied=await bridge.snapshot();changedSource=applied.source;ownedUndo.push({from:expected.source,to:applied.source});
          check(applied.source.startsWith(expected.source)&&applied.source.includes('WebVideo disposable native Anogo acceptance')&&applied.revision!==before.revision,'staged Anogo applies through native transaction');
          await undoExact(changedSource,expected.source);ownedUndo.pop();changedSource=null;
          const edit=expected.source+'\n; WebVideo disposable backup restore probe\n';
          await bridge.commit({snapshot:await snapshot(),after:edit,label:'Disposable backup acceptance'});changedSource=edit;ownedUndo.push({from:expected.source,to:edit});
          const restore=await backup.restoreScene(descriptor,{scenePath:relative,confirmed:true});
          if(restore.changed===true)ownedUndo.push({from:edit,to:expected.source});
          check(restore.changed===true&&!!restore.safetyBackup,'actual backup restore creates safety backup');artifacts.push(restore.safetyBackup);
          await snapshot();
          const safety=await bridge.readBackup({file:restore.safetyBackup});
          check(safety.before===edit,'safety backup preserves unsaved target buffer');
          await undoExact(expected.source,edit);ownedUndo.pop();await undoExact(edit,expected.source);ownedUndo.pop();changedSource=null;
          authoringPassed=true;
          return {passed:true,results:[...results],artifacts:[...artifacts]};
        }finally{
          await importer.dispose();
          // Undo only transactions recorded as successful by this probe, after exact-source guards.
          // An uncertain commit or concurrent edit is left for inspected native undo, never overwritten.
          while(ownedUndo.length){const step=ownedUndo.at(-1);await undoExact(step.to,step.from);ownedUndo.pop();}
          if(changedSource!==null)await snapshot();
        }
      },
      async startHint({previousTicket}={}){
        check(previousTicket===null||typeof previousTicket==='string','explicit prior preview ticket observation required');
        check(!active,'previous hint case finalized');await snapshot();
        active={mode:'complete',ticket:null,previousTicket,started:Date.now(),settled:false,result:null,error:null};
        const run=active;
        run.promise=bridge.previewHint({...expected.hint}).then(value=>{run.result=value;run.settled=true},error=>{run.error=error.message||String(error);run.settled=true});
        return {started:true,observe:'Wait for the actual preview ticket to enter showing before captureHint'};
      },
      captureHint(evidence){
        check(!!active&&!active.ticket,'capture one showing ticket per run');
        check(typeof evidence?.ticket==='string'&&evidence.ticket!==active.previousTicket&&evidence.state==='showing'&&evidence.clicked===false&&Number.isFinite(evidence.elapsedMs)&&evidence.elapsedMs<expected.hint.duration,'independent preview shows pending exact ticket');
        active.ticket=evidence.ticket;return {ticket:active.ticket};
      },
      async interruptHint(mode){
        check(!!active?.ticket&&['cancel','navigate'].includes(mode),'captured ticket required before interruption');
        active.mode=mode;
        if(mode==='cancel')await bridge.cancelHintPreview();else await bridge.preview(expected.navigationLine);
        return {mode,ticket:active.ticket,waitMs:expected.hint.duration+250};
      },
      async finishHint(evidence){
        check(!!active?.ticket,'captured hint required');
        const run=active;
        check(evidence?.ticket===run.ticket,'final observation belongs to same hint ticket');
        check(Number.isFinite(evidence.elapsedMs)&&evidence.elapsedMs>=expected.hint.duration,'observation occurs beyond original click deadline');
        await run.promise;
        if(run.mode==='complete')check(!run.error&&run.result?.ticket===run.ticket&&run.result.state==='completed'&&run.result.clicked===true&&evidence.state==='completed'&&evidence.clicked===true,'normal hint completes once in actual runtime');
        else check(evidence.state==='cancelled'&&evidence.clicked===false&&run.result?.clicked!==true,'interrupted hint has no delayed click after deadline');
        await snapshot();completed.add(run.mode);active=null;
        return {mode:run.mode,passed:true,result:run.result,error:run.error};
      },
      async finish(){
        check(!active&&authoringPassed&&['complete','cancel','navigate'].every(x=>completed.has(x)),'all native authoring and hint cases completed');
        await bridge.cancelHintPreview();await snapshot();
        return {passed:true,results:[...results],artifacts:[...artifacts],sourceRestored:true,sceneFilesWritten:false};
      },
      status(){return {results:[...results],artifacts:[...artifacts],authoringPassed,hint:active?{mode:active.mode,ticket:active.ticket,settled:active.settled,result:active.result,error:active.error}:null}}
    });
  };
})(globalThis);

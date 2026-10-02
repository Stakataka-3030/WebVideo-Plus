import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url),source=fs.readFileSync(new URL('browser/export-component.js',root),'utf8');
function fixture(){
 const states=[],requests=[],selectionRequests=[];let cursor=0;
 const model={path:'games/demo/game/scene/start.txt',source:'A:test;\n;CutHere\nwait:100;\nB:next;',revision:'r1',statements:[{id:'0:0',command:'say',startLine:1,endLine:1,title:'test',source:'A:test;\n'},{id:'1:1',command:'comment',startLine:2,endLine:2,title:'CutHere',source:';CutHere\n'},{id:'2:2',command:'wait',startLine:3,endLine:3,title:'wait',source:'wait:100;\n'},{id:'3:3',command:'say',startLine:4,endLine:4,title:'next',source:'B:next;'}]};
 let selected={...model,statements:[model.statements[2],model.statements[3]]};
 const context={console,queueMicrotask,crypto:webcrypto,TextEncoder,setTimeout:callback=>{queueMicrotask(callback);return 1;},clearTimeout(){},localStorage:{getItem(){return null;}},useGameEditorContext:fn=>fn({currentTag:{name:'start.txt',path:'games/demo/game/scene/start.txt'}}),useEditorStore:{use:{subPage:()=> 'demo'}},reactExports:{Fragment:'fragment',useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef(value){const index=cursor++;if(!(index in states))states[index]={current:value};return states[index];},useEffect(){}},jsxRuntimeExports:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},WebVideoRuntime:{readGameSettings:async()=>({textSpeed:50,autoSpeed:50})},fetch:async(url,options)=>{requests.push({url,body:options.body&&JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/api/jobs')&&options.method==='GET'?[]:{}};}};
 for(const name of ['Button','Dialog','DialogSurface','DialogBody','DialogTitle','DialogContent','DialogActions','__CODEX_TOOLTIP__','IconWithTextItemSmall','RightSmallUp'])context[name]=name;
 context.window={WebVideoPlus:{modules:['timelineSelector'],state:()=>({model}),validateSelection:s=>!!s&&s.path===model.path&&s.source===model.source&&s.revision===model.revision,requestSelection:async options=>{selectionRequests.push(options);return selected;}},WebVideoTools:{modules:[]}};
 vm.createContext(context);vm.runInContext(source,context);
 const render=()=>{cursor=0;return context.CodexVideoExport();};
 return {context,states,requests,selectionRequests,model,setSelection(value){selected=value;},render,parse:(text,fps)=>Array.from(context.webVideoManualCutFrames(text,fps))};
}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flatMap(nodes)];}
const find=(tree,label)=>nodes(tree).find(node=>node.props?.['aria-label']===label);
const texts=tree=>nodes(tree).flatMap(node=>[node.props?.children].flat()).filter(value=>typeof value==='string').join('\n');
const button=(tree,label)=>nodes(tree).find(node=>node.type==='Button'&&node.props.children===label);
test('legacy numeric parser remains stable for compatibility',()=>{
 const {parse}=fixture();
 assert.deepEqual(parse('300,1s，30f 00:02 1.01s 300F',30),[30,31,60,300]);
 assert.deepEqual(parse('1.01s 01:02.5 01:02:03.5',60),[61,3750,223410]);
 assert.deepEqual(parse('0.1s 0.10000000001s',30),[3]);
 assert.deepEqual(parse('0.10001s 0.0001s',30),[1,4]);
 assert.deepEqual(parse(' ,， \n\t',30),[]);
 for(const value of ['0','0s','00:00','-1','1.5','1e3','NaNs','Infinitys','1:60','1:60:00','1:02:60','2147483648','999999999999999999999999999999s','1;2','1:2','1s junk'])assert.throws(()=>parse(value,30),value);
});
test('statement picker enables manual mode, shows source anchors and preserves cancellation',async()=>{
 const f=fixture();let tree=f.render();
 assert.equal(find(tree,'分段切点').props.value,'auto');assert.equal(find(tree,'手动切点'),undefined);
 assert.match(texts(tree),/本场景识别到 1 个 ;CutHere/);assert.match(texts(tree),/标记仅在/);
 await button(tree,'从时间线选择切点语句…').props.onClick();tree=f.render();
 assert.equal(find(tree,'分段切点').props.value,'manual');
 assert.equal(f.selectionRequests[0].mode,'set');assert.equal(f.selectionRequests[0].purpose,'cutPoints');
 assert.match(texts(tree),/临时切点：2 条语句/);assert.match(texts(tree),/第 3 行之前/);
 assert.match(texts(tree),/都没有有效切点时就是单段，不会退回自动/);
 assert.ok(nodes(tree).find(node=>node.type==='input'&&node.props.checked===false&&node.props.disabled===true));
 f.setSelection(null);await button(tree,'重新选择临时切点语句…').props.onClick();tree=f.render();
 assert.match(texts(tree),/临时切点：2 条语句/,'Cancel must retain existing picks');
 find(tree,'分段切点').props.onChange({target:{value:'auto'}});tree=f.render();
 find(tree,'分段切点').props.onChange({target:{value:'manual'}});tree=f.render();assert.match(texts(tree),/临时切点：2 条语句/);
 button(tree,'清除临时切点').props.onClick();tree=f.render();assert.doesNotMatch(texts(tree),/临时切点：2/);
 assert.equal(find(tree,'分段切点').props.value,'manual','Clearing must not silently fall back to auto');
});
test('repeated cut-picker clicks issue only one pending selection request',async()=>{
 const f=fixture();let tree=f.render(),release;f.setSelection(new Promise(resolve=>{release=resolve;}));
 const choose=button(tree,'从时间线选择切点语句…').props.onClick;
 const first=choose(),second=choose();assert.equal(f.selectionRequests.length,1);
 release({...f.model,statements:[f.model.statements[2]]});await Promise.all([first,second]);
 tree=f.render();assert.match(texts(tree),/临时切点：1 条语句/);
});
test('queued request snapshots statement anchors, excludes old numeric cuts and rejects stale picks',async()=>{
 const f=fixture();let tree=f.render();f.states[1]={baseUrl:'http://test',token:'fixture'};
 const settings=f.states.find(value=>value?.fps===30);settings.manualCutPoints='99,100';tree=f.render();
 assert.match(texts(tree),/旧版数字切点/);
 await button(tree,'从时间线选择切点语句…').props.onClick();tree=f.render();
 await button(tree,'加入导出队列').props.onClick();
 const queued=f.requests.find(request=>request.body?.settings).body;
 assert.equal(queued.settings.segmentCutMode,'manual');assert.equal(queued.settings.manualCutPoints,'');
 assert.deepEqual(queued.manualCutStatements.map(item=>[item.scene,item.line,item.endLine,item.occurrence]),[['start.txt',3,3,1],['start.txt',4,4,1]]);
 assert.match(queued.manualCutStatements[0].sourceHash,/^[a-f0-9]{64}$/);
 assert.equal(queued.sourceText,f.model.source);assert.equal(queued.storyScope,'full');
 f.model.source+='\nC:edited;';tree=f.render();assert.match(texts(tree),/临时切点已失效/);
 const before=f.requests.length;await button(tree,'加入导出队列').props.onClick();
 assert.equal(f.requests.length,before,'Stale picks must not silently shift or queue');
 assert.match(texts(f.render()),/请重新选择切点语句/);
});
test('missing editor model shows a neutral marker notice rather than a false zero',()=>{
 const f=fixture();f.context.window.WebVideoPlus.state=()=>({model:null});
 assert.match(texts(f.render()),/导出时会读取本次故事链中的 ;CutHere/);
 assert.doesNotMatch(texts(f.render()),/本场景识别到 0 个/);
});
test('marker availability counts only independent parsed comment lines',()=>{
 const f=fixture();const count=model=>f.context.webVideoCutMarkerCount(model);
 assert.equal(count(f.model),1);
 assert.equal(count({statements:[{command:'say',startLine:1,endLine:3,source:'A:text\\\n;CutHere\nmore;'}, {command:'comment',startLine:4,endLine:4,source:';CutHere trailing\n'}, {command:'comment',startLine:5,endLine:5,source:' ;CutHere \n'}]}),1);
});
test('native job and settings wiring includes statement sources in cache and diagnostics',()=>{
 const read=file=>fs.readFileSync(new URL(file,root),'utf8');const job=read('src/JobRunner.cs');
 assert.match(job,/VideoWorkflow\.Segments\(preparedPlan,bounds,fps,workers,settings\)/);
 assert.match(job,/signature=PipelineRevision[^\n]+J\.Text\(settings\)/);
 assert.ok(job.includes('"|manualCutStatements="+J.Text(J.Get(request,"manualCutStatements"))'));
 assert.match(job,/new SemaphoreSlim\(effectiveWorkers\)/);assert.match(job,/effectiveWorkers=Math\.Min\(workers,ranges\.Length\)/);
 assert.match(job,/"manualCutStatements",J\.Get\(request,"manualCutStatements"\)/);
 const planner=read('src/Planner.cs');assert.ok(planner.indexOf('StatementCuts.Collect')<planner.indexOf('SceneChain.AttachTimeline'));
 assert.ok(planner.includes('if(ManualCuts.Enabled(settings)&&!LayerExport.IsAudio(request)&&!J.B(request,"analysisOnly"))'));
 assert.match(planner,/J\.Get\(request,"manualCutStatements"\),parsed\)/,'Use final parsed index/time mapping');
 assert.match(read('src/QueueService.cs'),/StatementCuts\.ValidateSelections\(J\.Get\(d,"manualCutStatements"\)\)/);
 assert.match(read('src/QueueService.cs'),/settings=ManualCuts\.SavedPreferences\(s,settings,exportKind===?"audio"\)/);
 assert.match(read('build-product.ps1'),/src\/Core\.cs'\) \(Join-Path \$taskRoot 'src\/ManualCuts\.cs'/);
 assert.match(read('src/ExportCli.cs'),/App\.Arg\("--segment-cut-mode","auto"\)/);
});
test('audio ignores temporary statement cuts without losing video UI preference',async()=>{
 const f=fixture();let tree=f.render();f.states[1]={baseUrl:'http://test',token:'fixture'};
 await button(tree,'从时间线选择切点语句…').props.onClick();tree=f.render();
 const kindIndex=f.states.lastIndexOf('full');f.states[kindIndex]='audio';tree=f.render();
 assert.equal(find(tree,'分段切点'),undefined);await button(tree,'加入导出队列').props.onClick();
 const queued=f.requests.find(request=>request.body?.settings).body;
 assert.equal(queued.exportKind,'audio');assert.equal(queued.settings.segmentCutMode,'auto');assert.deepEqual(queued.manualCutStatements,[]);
 f.states[kindIndex]='full';tree=f.render();assert.equal(find(tree,'分段切点').props.value,'manual');assert.match(texts(tree),/临时切点：2 条语句/);
});

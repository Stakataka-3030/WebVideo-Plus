import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),source=fs.readFileSync(new URL('browser/export-component.js',root),'utf8');
function fixture(){
 const states=[],requests=[];let cursor=0;
 const context={console,queueMicrotask,setTimeout:callback=>{queueMicrotask(callback);return 1;},clearTimeout(){},localStorage:{getItem(){return null;}},useGameEditorContext:fn=>fn({currentTag:{name:'start.txt',path:'games/demo/game/scene/start.txt'}}),useEditorStore:{use:{subPage:()=> 'demo'}},reactExports:{Fragment:'fragment',useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef(value){const index=cursor++;if(!(index in states))states[index]={current:value};return states[index];},useEffect(){}},jsxRuntimeExports:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},WebVideoRuntime:{readGameSettings:async()=>({textSpeed:50,autoSpeed:50})},fetch:async(url,options)=>{requests.push({url,body:options.body&&JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/api/jobs')&&options.method==='GET'?[]:{}};}};
 for(const name of ['Button','Dialog','DialogSurface','DialogBody','DialogTitle','DialogContent','DialogActions','__CODEX_TOOLTIP__','IconWithTextItemSmall','RightSmallUp'])context[name]=name;
 context.window={WebVideoPlus:{modules:[],state:()=>({model:{path:'games/demo/game/scene/start.txt',source:'A:test;'}})},WebVideoTools:{modules:[]}};
 vm.createContext(context);vm.runInContext(source,context);
 const render=()=>{cursor=0;return context.CodexVideoExport();};
 return {context,states,requests,render,parse:(text,fps)=>Array.from(context.webVideoManualCutFrames(text,fps))};
}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flatMap(nodes)];}
const find=(tree,label)=>nodes(tree).find(node=>node.props?.['aria-label']===label);
const texts=tree=>nodes(tree).flatMap(node=>[node.props?.children].flat()).filter(value=>typeof value==='string').join('\n');
test('UI parser is explicit, stable across fps, ordered, and deduplicated',()=>{
 const {parse}=fixture();
 assert.deepEqual(parse('300,1s，30f 00:02 1.01s 300F',30),[30,31,60,300]);
 assert.deepEqual(parse('1.01s 01:02.5 01:02:03.5',60),[61,3750,223410]);
 assert.deepEqual(parse('0.1s 0.10000000001s',30),[3]);
 assert.deepEqual(parse('0.10001s 0.0001s',30),[1,4]);
 assert.deepEqual(parse(' ,， \n\t',30),[]);
 for(const value of ['0','0s','00:00','-1','1.5','1e3','NaNs','Infinitys','1:60','1:60:00','1:02:60','2147483648','999999999999999999999999999999s','1;2','1:2','1s junk'])assert.throws(()=>parse(value,30),value);
});
test('advanced controls expose exact cuts and preserve input when toggled or closed',()=>{
 const f=fixture();let tree=f.render();
 assert.equal(find(tree,'分段切点').props.value,'auto');assert.equal(find(tree,'手动切点'),undefined);
 find(tree,'分段切点').props.onChange({target:{value:'manual'}});tree=f.render();
 assert.match(texts(tree),/实际切点帧：无；共 1 段，最多 1 路并行/);
 assert.match(texts(tree),/留空就是单段，不会退回自动/);
 find(tree,'手动切点').props.onChange({target:{value:'2s,1,60,2'}});tree=f.render();
 assert.match(texts(tree),/实际切点帧：1, 2, 60；共 4 段/);
 find(tree,'帧率').props.onChange({target:{value:'60'}});tree=f.render();
 assert.match(texts(tree),/实际切点帧：1, 2, 60, 120；共 5 段，最多 4 路并行/);
 const strict=nodes(tree).find(node=>node.type==='input'&&node.props.checked===false&&node.props.disabled===true);
 assert.ok(strict,'Automatic policy controls must be disabled');
 find(tree,'分段切点').props.onChange({target:{value:'auto'}});tree=f.render();
 find(tree,'分段切点').props.onChange({target:{value:'manual'}});tree=f.render();
 assert.equal(find(tree,'手动切点').props.value,'2s,1,60,2');
 nodes(tree).find(node=>node.type==='Button'&&node.props.children==='关闭').props.onClick();tree=f.render();
 assert.equal(find(tree,'手动切点').props.value,'2s,1,60,2');
 const kindIndex=f.states.lastIndexOf('full');f.states[kindIndex]='audio';tree=f.render();
 assert.equal(find(tree,'分段切点'),undefined,'Audio export has no video partition controls');
});
test('queued request preserves exact manual configuration and validates malformed input',async()=>{
 const f=fixture();let tree=f.render();
 f.states[1]={baseUrl:'http://test',token:'fixture'}; // Existing service connection hook.
 find(tree,'分段切点').props.onChange({target:{value:'manual'}});tree=f.render();
 find(tree,'手动切点').props.onChange({target:{value:'1,2s,60'}});tree=f.render();
 await nodes(tree).find(node=>node.type==='Button'&&node.props.children==='加入导出队列').props.onClick();
 const queued=f.requests.find(request=>request.body?.settings);
 assert.equal(queued.body.settings.segmentCutMode,'manual');assert.equal(queued.body.settings.manualCutPoints,'1,2s,60');
 assert.equal(queued.body.storyScope,'full');
 tree=f.render();find(tree,'手动切点').props.onChange({target:{value:'oops'}});tree=f.render();
 const before=f.requests.length;
 await nodes(tree).find(node=>node.type==='Button'&&node.props.children==='加入导出队列').props.onClick();
 assert.equal(f.requests.length,before,'Malformed manual input must not queue');
 assert.match(texts(f.render()),/手动切点格式无效/);
});
test('native job and settings wiring includes manual config in cache and sidecar',()=>{
 const read=file=>fs.readFileSync(new URL(file,root),'utf8');
 const job=read('src/JobRunner.cs');
 assert.match(job,/PipelineRevision="manual-cuts-motion-epochs-1\.1\.5"/,'Seam/runtime fixes must invalidate old cached parts');
 assert.match(job,/VideoWorkflow\.Segments\(preparedPlan,bounds,fps,workers,settings\)/);
 assert.match(job,/signature=PipelineRevision[^\n]+J\.Text\(settings\)/);
 assert.match(job,/new SemaphoreSlim\(effectiveWorkers\)/);
 assert.match(job,/effectiveWorkers=Math\.Min\(workers,ranges\.Length\)/);
 assert.match(job,/"segmentCutMode",J\.S\(settings,"segmentCutMode","auto"\),"manualCutPoints",J\.S\(settings,"manualCutPoints"\)/);
 assert.match(read('src/ExportCli.cs'),/App\.Arg\("--segment-cut-mode","auto"\)/);
 assert.match(read('src/QueueService.cs'),/settings=ManualCuts\.SavedPreferences\(s,settings,exportKind===?"audio"\)/,'Audio preference save must preserve stored video cuts without mutating the request');
 assert.match(read('src/Core.cs'),/"segmentCutMode","auto","manualCutPoints",""/);
 assert.match(read('build-product.ps1'),/src\/Core\.cs'\) \(Join-Path \$taskRoot 'src\/ManualCuts\.cs'/,'Manager must compile Settings dependency');
});

test('audio export ignores hidden manual cuts without losing the video preference',async()=>{
 const f=fixture();let tree=f.render();f.states[1]={baseUrl:'http://test',token:'fixture'};
 find(tree,'分段切点').props.onChange({target:{value:'manual'}});tree=f.render();
 find(tree,'手动切点').props.onChange({target:{value:'invalid but hidden'}});
 const kindIndex=f.states.lastIndexOf('full');f.states[kindIndex]='audio';tree=f.render();
 await nodes(tree).find(node=>node.type==='Button'&&node.props.children==='加入导出队列').props.onClick();
 const queued=f.requests.find(request=>request.body?.settings);
 assert.equal(queued.body.exportKind,'audio');assert.equal(queued.body.settings.segmentCutMode,'auto');
 f.states[kindIndex]='full';tree=f.render();assert.equal(find(tree,'分段切点').props.value,'manual');
 assert.equal(find(tree,'手动切点').props.value,'invalid but hidden');
});

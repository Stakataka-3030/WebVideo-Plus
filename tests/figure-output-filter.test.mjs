import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8');
const source=read('browser/render.js'),filter=source.slice(source.indexOf('globalThis.__exportInstallFigureOutputFilter='),source.indexOf('globalThis.__exportTextSettleApplies='));
function fixture(includeFigures=false){
 const context={};vm.runInNewContext(filter,context);
 let target=null,color=[true,true,true,true],pending=[];const writes=[],updates=[];
 const gl={FRAMEBUFFER_BINDING:1,DRAW_FRAMEBUFFER_BINDING:2,COLOR_WRITEMASK:3,COLOR_BUFFER_BIT:0x4000,
  getParameter(key){return key===3?color.slice():target;},colorMask(...value){color=value;},getExtension(){return null;},
  drawElements(label){writes.push({label,target,color:color.slice()});},drawArrays(label){writes.push({label,target,color:color.slice()});},clear(bits){writes.push({bits,target,color:color.slice()});},blitFramebuffer(...args){writes.push({bits:args[8],target,color:color.slice()});}};
 const renderer={gl,batch:{flush(){for(const label of pending)gl.drawElements(label);pending=[];}},render(display){display.render(this);this.batch.flush();}};
 const figure=(label,{mask=false,throws=false}={})=>({label,render(r){updates.push(label);r.gl.colorMask(true,false,true,true);if(mask){target='mask';gl.clear(0x4000);target=null;}pending.push(label);if(throws)throw Error('render failed');}});
 const scene={children:[],render(r){for(const child of this.children)child.render(r);}},stage={currentApp:{renderer},figureObjects:[]};
 const state=context.__exportInstallFigureOutputFilter(stage,includeFigures);
 return {context,gl,renderer,figure,scene,stage,state,writes,updates,pending:label=>pending.push(label),target:value=>target=value,color:()=>color.slice()};
}
test('excludes only registered figure output; batching and updates preserve original order',()=>{
 const f=fixture(),a=f.figure('sprite'),b=f.figure('live2d'),effect=f.figure('rain');
 f.stage.figureObjects=[{pixiContainer:a},{pixiContainer:b}];f.scene.children=[{render(){f.pending('background');}},a,b,effect];
 f.renderer.render(f.scene);
 assert.deepEqual(f.updates,['sprite','live2d','rain']);
 assert.deepEqual(f.writes.map(x=>[x.label,x.color]),[['background',[true,true,true,true]],['sprite',[false,false,false,false]],['live2d',[false,false,false,false]],['rain',[true,false,true,true]]]);
 assert.equal(f.state.figureRenders,2);
 assert.deepEqual(f.color(),[true,false,true,true]);
});
test('auxiliary masks retain color writes even when models reset colorMask',()=>{
 const f=fixture(),model=f.figure('Cubism2',{mask:true});f.stage.figureObjects=[{pixiContainer:model}];f.scene.children=[model];f.renderer.render(f.scene);
 assert.deepEqual(f.writes.map(x=>[x.target,x.color]),[['mask',[true,false,true,true]],[null,[false,false,false,false]]]);
 assert.equal(f.updates.length,1);
});
test('parent filter targets are excluded while nested private filter targets survive',()=>{
 const f=fixture(),parent='parent-filter';f.target(parent);
 const figure={render(r){f.updates.push('model');r.gl.drawElements('on-parent');f.target('own-filter');r.gl.drawElements('own-filter');f.target(parent);r.gl.drawElements('figure-composite');}};
 f.stage.figureObjects=[{pixiContainer:figure}];f.scene.children=[figure,{render:r=>r.gl.drawElements('stage-effect')}];f.renderer.render(f.scene);
 assert.deepEqual(f.writes.map(x=>[x.label,x.color.every(Boolean)]),[['on-parent',false],['own-filter',true],['figure-composite',false],['stage-effect',true]]);
});
test('replacement, exit duplicates, changed render functions and opt-in restoration are dynamic',()=>{
 const f=fixture(),old=f.figure('outgoing'),incoming=f.figure('incoming');f.stage.figureObjects=[{pixiContainer:old}];f.scene.children=[old];f.renderer.render(f.scene);
 f.stage.figureObjects.push({pixiContainer:incoming});f.scene.children.push(incoming);f.renderer.render(f.scene);
 old.render=f.figure('custom-render').render;f.renderer.render(f.scene);
 f.stage.figureObjects=f.stage.figureObjects.filter(x=>x.pixiContainer!==old);f.renderer.render(f.scene);
 assert.equal(f.writes.at(-2).color.some(Boolean),true,'former figure membership must not keep excluding unrelated content');
 f.context.__exportInstallFigureOutputFilter(f.stage,true);f.renderer.render(f.scene);
 assert.equal(f.writes.at(-1).color.some(Boolean),true);
 assert.deepEqual(f.updates,['outgoing','outgoing','incoming','custom-render','incoming','custom-render','incoming','custom-render','incoming']);
});
test('exceptions unwind suppression and restore writes for later renders',()=>{
 const f=fixture(),broken=f.figure('broken',{throws:true});f.stage.figureObjects=[{pixiContainer:broken}];f.scene.children=[broken];assert.throws(()=>f.renderer.render(f.scene),/render failed/);
 f.scene.children=[{render:r=>r.gl.drawElements('next')}];f.renderer.render(f.scene);assert.equal(f.writes.at(-1).color.some(Boolean),true);
});
test('default true does not install any wrappers; false never changes alpha or visibility',()=>{
 const f=fixture(true);assert.equal(f.state,null);assert.equal(f.renderer.__webvideoFigureOutput,undefined);
 assert.doesNotMatch(filter,/\.(?:alpha|visible|renderable)\s*=/);
 assert.doesNotMatch(read('src/Planner.cs'),/includeFigures|SuppressFigure/,'figure setting must not change planning, source or timing');
 assert.match(source,/__installNativeRendering=\([^\n]*includeFigures=true/);
 assert.match(source,/__exportInstallFigureOutputFilter\(__wgProbe\.core\.gameplay\.pixiStage,includeFigures\)/);
});
test('request, worker, retry signature and result preserve stage-only figure selection',()=>{
 assert.match(read('src/LayerExport.cs'),/IncludeFigures\(object request\)\{return !IsStage\(request\)\|\|J\.B\(request,"includeFigures",true\);\}/);
 assert.match(read('src/QueueService.cs'),/includeFigures=exportKind!="stage"\|\|J\.B\(d,"includeFigures",true\)/);
 assert.match(read('src/QueueService.cs'),/"includeFigures",includeFigures/);
 assert.match(read('src/JobRunner.cs'),/new Dictionary<string,object>\(J\.D\(request\)\)/,'worker copies whole request');
 assert.match(read('src/JobRunner.cs'),/\|includeFigures="\+LayerExport\.IncludeFigures\(request\)/);
 assert.match(read('src/JobRunner.cs'),/"includeFigures",LayerExport\.IncludeFigures\(request\)/);
 assert.match(read('src/Renderer.cs'),/__installNativeRendering\([^\n]*"includeFigures",LayerExport\.IncludeFigures\(request\)/);
 assert.ok(read('src/Renderer.cs').indexOf('__installNativeRendering(')<read('src/Renderer.cs').indexOf('LayerExport.RenderTransparent('),'install once before transparent/raw/JPEG capture branches');
});

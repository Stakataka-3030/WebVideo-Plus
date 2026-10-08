// Execute the complete production frame scheduler plus the pinned Live2D plugin
// _render method with synthetic collaborators. No SDK/model or GPU is emulated:
// this is the command/clock/update/draw-count oracle, not a pixel test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const plugin=fs.readFileSync(process.argv[2]||path.join(root,'package/runtime/web/assets/index.es-erQsk_Nn.js'),'utf8');
const pluginHash=crypto.createHash('sha256').update(plugin).digest('hex'),versions={'46590e11b6fb9877524fbb27525734d5208b67b3d28b4afb226d849bc95d7505':'4.6.4','8b6c11ea8b4724dd8254d61a009c4d0e7cc7389f31f76570dac354c56b11a724':'4.6.5','1ad45bac171ff15a79b52e20c727d6201dc1f1bc228d10d01cdd4d6cfc3d3e08':'4.6.6'};
assert.ok(versions[pluginHash],'Only the exact official 4.6.4/4.6.5/4.6.6 plugins are supported');
const from=plugin.indexOf('onTickerUpdate(){this.update(G.shared.deltaMS)}'),to=plugin.indexOf('destroy(t){',from);assert.ok(from>=0&&to>from);
const render=fs.readFileSync(path.join(root,'browser/render.js'),'utf8');
async function run(includeFigures,fps,composite){
 const context=vm.createContext({});
 vm.runInContext(`
  const G={shared:{deltaMS:0}},Ze={copyFrom(){return this},append(){return this}};
  const ai=Ze;class Model {${plugin.slice(from,to)}};
  const trace={commands:[],ticks:[],updates:[],draws:[],media:[],frames:[],waits:0,visibleDraws:0};
  let color=[true,true,true,true];const gl={FRAMEBUFFER_BINDING:1,COLOR_WRITEMASK:2,COLOR_BUFFER_BIT:16384,getParameter:key=>key===2?color.slice():null,colorMask:(...c)=>color=c,drawElements(){if(color.some(Boolean))trace.visibleDraws++;},getExtension(){return null;}};
  const reset={reset(){}};
  const renderer={gl,plugins:{interaction:{}},batch:{reset(){},flush(){}},geometry:reset,shader:reset,state:reset,texture:reset,CONTEXT_UID:1,framebuffer:{viewport:{x:0,y:0,width:1920,height:1080}},globalUniforms:{uniforms:{projectionMatrix:{}}},render(scene){scene.render(this);}};
  const models=[];const scene={render(r){for(const object of stage.figureObjects)object.pixiContainer.render(r);r.gl.drawElements('effect');}};
  const app={renderer,render(){renderer.render(scene);}},stage={figureObjects:[],currentApp:app,getAllStageObj(){return this.figureObjects;}};
  const newModel=key=>{const model=new Model();Object.assign(model,{deltaTime:0,elapsedTime:0,glContextID:1,textures:[],checkAlphaChange(){},registerInteraction(){},internalModel:{update(delta,elapsed){trace.updates.push([key,delta,elapsed]);},updateTransform(){},draw(){trace.draws.push(key);gl.colorMask(true,true,true,true);gl.drawElements();}}});models.push(model);stage.figureObjects.push({key,sourceType:'live2d',pixiContainer:{children:[model],render:r=>model._render(r)}});};
  globalThis.document={getAnimations:()=>[]};globalThis.__exportAnimations=new WeakMap();
  globalThis.__wgProbe={core:{gameplay:{pixiStage:stage,performController:{arrangeNewPerform(){}}},events:{textSettle:{on(){},emit(){}}}},stageManager:{commit(){}}};
  globalThis.__pwClock={controller:{async runFor(elapsed){trace.ticks.push(elapsed);G.shared.deltaMS=elapsed;for(const m of models)m.onTickerUpdate();}}};
  globalThis.__probeCommands={'preview.command.run-snippet':({snippet})=>{trace.commands.push([globalThis.__exportCurrentFrame,snippet]);if(snippet==='changeFigure:actor.json;')newModel('actor');if(snippet==='changeFigure:replacement.json;'){stage.figureObjects[0].key='actor-off';newModel('replacement');}if(snippet==='changeFigure:none;')stage.figureObjects=[];}};
  globalThis.__exportWaitForStageAssets=async()=>{trace.waits++;};
  globalThis.__exportRefreshMouth=()=>{};globalThis.__exportRecordMouth=()=>{};globalThis.__exportMedia={async sync(time){trace.media.push(time);}};
  ${render}
  const events=[{atMs:0,command:'changeBg',script:'changeBg:room.png;'},{atMs:0,command:'changeFigure',script:'changeFigure:actor.json;',loads:true},{atMs:233,command:'wait',script:'wait:2000;'},{atMs:875,command:'changeFigure',script:'changeFigure:replacement.json;',loads:true},{atMs:1200,command:'setTransform',script:'setTransform:actor -duration=900;'},{atMs:1711,command:'changeFigure',script:'changeFigure:none;'}];
  __installNativeRendering({events,envelopes:[],fps:${fps},includeFigures:${includeFigures}});
  if(${composite})globalThis.__gpuDomState={};
  globalThis.run=async()=>{for(let frame=0;frame<${fps*3};frame++){trace.frames.push(frame);if(${composite}&&frame<${fps})await __webviewWarmupStep(frame);else{await __webviewStep(frame);if(${composite})app.render();}}return trace;};
 `,context);
 return JSON.parse(JSON.stringify(await context.run()));
}
const rows=[];
for(const fps of [30,60])for(const composite of [false,true]){
 const shown=await run(true,fps,composite),hidden=await run(false,fps,composite);
 assert.ok(shown.updates.length>fps&&shown.draws.length>fps,'models must actually update and draw');
 assert.ok(shown.visibleDraws>hidden.visibleDraws,'only figure color writes must disappear');
 assert.equal(hidden.visibleDraws,fps*3,'unrelated effect draws survive every frame');
 const {visibleDraws:a,...shownSimulation}=shown,{visibleDraws:b,...hiddenSimulation}=hidden;
 assert.deepEqual(hiddenSimulation,shownSimulation,'hiding figure output changed commands, ticks, updates, draw traversal, media, waits or frames');
 assert.equal(hidden.frames.length,fps*3);assert.equal(hidden.waits,2);assert.equal(hidden.commands.length,6);
 rows.push({fps,composite,frames:hidden.frames.length,commands:hidden.commands.length,waits:hidden.waits,updates:hidden.updates.length,draws:hidden.draws.length,shownVisibleDraws:a,hiddenVisibleDraws:b});
}
console.log('PASS '+versions[pluginHash]+' pinned Live2D plugin + production frame scheduler figure on/off parity: '+JSON.stringify(rows));

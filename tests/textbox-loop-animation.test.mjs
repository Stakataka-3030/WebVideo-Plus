import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const render=read('browser/render.js');
const capture=render.slice(render.indexOf('globalThis.__gpuDomAnimationProperties='),render.indexOf('\nglobalThis.__gpuDomPrepareTextAtlas='));
function fixture({precise=false,iterations=Infinity,where='child',properties=['transform','filter'],hidden=false,dirty=false}={}){
 class Element {constructor(name){this.name=name;this.classList={contains:()=>false};}contains(other){return this.name==='box'&&other.name==='child'||this.name==='ancestor';}hasAttribute(){return false;}getBoundingClientRect(){return {width:64,height:64};}tagName='DIV';id='';}
 const box=new Element('box'),target=new Element(where==='root'?'box':where);
 const actual=where==='root'?box:target;
 const animation={currentTime:0,effect:{target:actual,getKeyframes:()=>[Object.fromEntries(properties.map(p=>[p,'0'])),Object.fromEntries(properties.map(p=>[p,'1']))],getComputedTiming:()=>({iterations})}};
 const state={preciseTextboxLoopAnimations:precise,textboxRoot:box,getTextboxRoot:()=>box,markTextElements(){},excluded:()=>false,dirty,animationTimes:new WeakMap(),videoTimes:new WeakMap(),stats:{capturePlanSamples:0,ignoredInfiniteAnimations:0,ignoredTextboxInfiniteAnimations:0,infiniteAnimationSamples:0,animation:0,fullAnimationSamples:0,baseOnlyAnimationSamples:0,handledTextboxAnimationSamples:0,handledTextAnimationSamples:0}};
 const context={Element,__gpuDomState:state,document:{getAnimations:()=>[animation],querySelectorAll:()=>[]},getComputedStyle:()=>({position:'absolute',display:hidden?'none':'block',visibility:'visible',opacity:'1'})};vm.createContext(context);vm.runInContext(capture,context);
 return {state,context,animation,box,target:actual,plan:()=>{const plan=context.__gpuDomCapturePlan();if(plan.needed)context.__gpuDomCommitAnimations(plan.scope);return plan;}};
}
for(const where of ['child','root'])test('default ignores only infinite textbox '+where+' refresh requests',()=>{
 const f=fixture({where});assert.equal(f.plan().needed,false);f.animation.currentTime=250;assert.equal(f.plan().needed,false);assert.equal(f.state.stats.ignoredTextboxInfiniteAnimations,2);assert.equal(f.state.stats.fullAnimationSamples,0);
});
test('exact option captures textbox loop when time advances, not repeatedly at the same time',()=>{
 const f=fixture({precise:true});assert.equal(f.plan().scope,'full');assert.equal(f.plan().needed,false);f.animation.currentTime=250;assert.equal(f.plan().scope,'full');assert.equal(f.state.stats.ignoredInfiniteAnimations,0);
});
for(const where of ['child','root'])test('finite textbox '+where+' animation keeps full capture',()=>{
 const f=fixture({where,iterations:1});assert.equal(f.plan().scope,'full');assert.equal(f.plan().needed,false);f.animation.currentTime=50;assert.equal(f.plan().scope,'full');
});
for(const where of ['outside','ancestor'])test('infinite '+where+' animation keeps existing capture scope',()=>{
 const f=fixture({where});assert.equal(f.plan().scope,where==='ancestor'?'full':'base');assert.equal(f.state.stats.ignoredInfiniteAnimations,0);f.animation.currentTime=250;assert.equal(f.plan().needed,true);
});
test('textbox opacity remains handled by existing GPU path with either setting',()=>{
 for(const precise of [false,true]){const f=fixture({precise,where:'root',properties:['opacity']});assert.equal(f.plan().needed,false);assert.equal(f.state.stats.handledTextboxAnimationSamples,1);assert.equal(f.state.stats.ignoredInfiniteAnimations,0);}
});
test('text character opacity remains handled by existing GPU path',()=>{
 const f=fixture({properties:['opacity']});f.target.classList.contains=name=>name==='Textelement_start';assert.equal(f.plan().needed,false);assert.equal(f.state.stats.handledTextAnimationSamples,1);
});
test('other dirty work still refreshes entire textbox including the current loop phase',()=>{
 const f=fixture({dirty:true});assert.equal(f.plan().scope,'full');assert.equal(f.state.stats.ignoredTextboxInfiniteAnimations,1);
});
test('hidden loops do not trigger capture even with exact option',()=>{
 const f=fixture({precise:true,hidden:true});assert.equal(f.plan().needed,false);assert.equal(f.state.stats.fullAnimationSamples,0);
});
test('default cache policy keeps deterministic animation time moving',()=>{
 const f=fixture(),start=render.indexOf('  for(const a of document.getAnimations()){if(!__exportAnimations.has(a))');
 assert.ok(start>=0);const end=render.indexOf('\n',start);const step=render.slice(start,end);f.context.__exportAnimations=new Map([[f.animation,0]]);f.animation.pause=()=>{};f.context.t=250;vm.runInContext(step,f.context);assert.equal(f.animation.currentTime,250);assert.equal(f.plan().needed,false);
});
test('capture options reset per export and never enter engine option data',()=>{
 const optionData={textSpeed:1,autoSpeed:2,unrelated:7},listeners=new Set();const store={getState:()=>({userData:{optionData}}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},dispatch:a=>{optionData[a.payload.key]=a.payload.value;}};
 const context={__wgProbe:{store}};vm.createContext(context);vm.runInContext(read('browser/settings.js'),context);
 context.__lockExportSettings({textSpeed:3,autoSpeed:4,preciseTextboxLoopAnimations:true});assert.equal(context.__exportCaptureSettings.preciseTextboxLoopAnimations,true);assert.equal(Object.isFrozen(context.__exportCaptureSettings),true);
 context.__lockExportSettings({textSpeed:5,autoSpeed:6});assert.equal(context.__exportCaptureSettings.preciseTextboxLoopAnimations,false);assert.equal(listeners.size,1);assert.equal(optionData.unrelated,7);assert.equal('preciseTextboxLoopAnimations' in optionData,false);
 context.__lockExportSettings({textSpeed:5,autoSpeed:6,preciseTextboxLoopAnimations:'true'});assert.equal(context.__exportCaptureSettings.preciseTextboxLoopAnimations,false);
});
test('capture installation snapshots the job option',()=>{
 const start=render.indexOf('globalThis.__gpuDomInstall='),end=render.indexOf('\nglobalThis.__gpuDomAnimationProperties=',start);
 for(const precise of [undefined,false,true]){const context={__exportCaptureSettings:{preciseTextboxLoopAnimations:precise},MutationObserver:class{observe(){}},document:{body:{}}};vm.createContext(context);vm.runInContext(render.slice(start,end),context);context.__gpuDomInstall();assert.equal(context.__gpuDomState.preciseTextboxLoopAnimations,precise===true);}
});

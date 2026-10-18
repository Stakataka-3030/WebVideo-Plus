import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=process.env.RENDER_REPO||new URL('../',import.meta.url);
const read=name=>fs.readFileSync(typeof root==='string'?root+'/'+name:new URL(name,root),'utf8');
const source=read('browser/render.js');
const guards=source.slice(source.indexOf('globalThis.__exportDialogueMutationSerial='),source.indexOf('globalThis.__exportLive2DLifetimeAt='));
function fixture({hidden=false,gui=true,film='',required=true,text='test'}={}){
 const view={currentDialogKey:'previous',showText:'old',isDisableTextbox:hidden,enableFilm:film},calculation={...view},oldNodes=Array.from({length:4},()=>({}));
 const span=text=>({textContent:text,firstElementChild:{firstChild:{textContent:text}}});
 let nodes=oldNodes,box={querySelectorAll:()=>nodes,textContent:'old'};
 const context={queueMicrotask,setTimeout,clearTimeout,Element:class{},MutationObserver:class{observe(){}disconnect(){}},document:{body:{},getElementById:()=>box},__wgProbe:{stageManager:{getCalculationStageState:()=>calculation,getViewStageState:()=>view},store:{getState:()=>({GUI:{showTextBox:gui}})},compileText:value=>[[...value]]}};
 vm.createContext(context);vm.runInContext(guards,context);context.__exportDialogueDomRequired=required;
 context.__exportBeginDialogueTransition();Object.assign(calculation,{currentDialogKey:'next',showText:text});context.__exportSetDialogueTarget();
 return {context,view,calculation,commit(){Object.assign(view,calculation);},mount(count=text.length,value=text){nodes=Array.from({length:count},(_,i)=>span(value[i]||''));box={querySelectorAll:()=>nodes,textContent:value};},unmount(){box=null;},mutate(){context.__exportDialogueMutationSerial++;}};
}
for(const state of [{name:'hidden normal',hidden:true},{name:'GUI hidden',gui:false},{name:'GUI hidden film',gui:false,film:'on'},{name:'stage only',required:false},{name:'empty dialogue',text:''}])test(state.name+' waits for commit, then accepts absent textbox',()=>{
 const f=fixture(state);f.unmount();assert.equal(f.context.__exportDialogueDomReady(),false);f.commit();assert.equal(f.context.__exportDialogueDomReady(),true);
});
for(const state of [{name:'visible normal'},{name:'film even after script hide',film:'on',hidden:true},{name:'DOM only',required:true}])test(state.name+' requires new complete character nodes',()=>{
 const f=fixture(state);f.commit();f.mutate();assert.equal(f.context.__exportDialogueDomReady(),false);assert.equal(f.context.__exportDialogueDomReady(true),false);
 f.mount(1);assert.equal(f.context.__exportDialogueDomReady(),false);f.mount();assert.equal(f.context.__exportDialogueDomReady(),true);
});
test('timeout rejects incomplete DOM even after a mutation',async()=>{
 const f=fixture();f.commit();f.mount(1);f.mutate();await assert.rejects(f.context.__exportWaitDialogueDom({timeoutMs:1}),/对白 DOM 同步超时/);assert.ok(f.context.__exportDialoguePending);assert.equal(f.context.__exportDialogueWaitDiagnostics[0].outcome,'error');
});
test('hide and empty transitions wait for removal of the previous rendered line',()=>{
 for(const state of [{hidden:true},{gui:false},{text:''}]){const f=fixture(state);f.commit();assert.equal(f.context.__exportDialogueDomReady(),false);f.unmount();assert.equal(f.context.__exportDialogueDomReady(),true);}
});
test('same-sized fresh nodes containing a different line are rejected',()=>{
 const f=fixture();f.commit();f.mount(4,'OLD!');assert.equal(f.context.__exportDialogueDomReady(),false);
});
test('concat beyond native visible line budget can reuse correct existing nodes',()=>{
 const f=fixture();f.commit();f.mount();f.context.__exportBeginDialogueTransition();
 f.context.__wgProbe.compileText=text=>[[...text.slice(0,4)]];f.calculation.showText='testOFFSCREEN';f.commit();f.context.__exportSetDialogueTarget();assert.equal(f.context.__exportDialogueDomReady(),true);
});
test('normal to film requires native component remount even for equal character counts',()=>{
 const f=fixture();f.commit();f.mount();f.context.__exportBeginDialogueTransition();f.calculation.enableFilm='letterbox';f.commit();f.context.__exportSetDialogueTarget();assert.equal(f.context.__exportDialogueDomReady(),false);f.mount();assert.equal(f.context.__exportDialogueDomReady(),true);
});
test('same committed line is allowed during prefix restore',()=>{
 const f=fixture();f.commit();f.mount();f.context.__exportBeginDialogueTransition();f.context.__exportSetDialogueTarget();assert.equal(f.context.__exportDialogueDomReady(true),true);
});
test('film counts native UTF-16 spans, regular text uses native line budget and compiler nodes',()=>{
 const f=fixture();f.context.__wgProbe.store.getState=()=>({GUI:{showTextBox:true},userData:{optionData:{textSize:1},globalGameVar:{}}});
 f.context.__wgProbe.compileText=(text,lines,all)=>{const rows=String(text).split('|').map(row=>[{},...row.split(' ')]);return all?rows:rows.slice(0,lines);};
 assert.equal(f.context.__exportDialogueCharCount('ABC 😀',{enableFilm:'letterbox'}),6);
 assert.equal(f.context.__exportDialogueCharCount('ABC def|ghi|jkl',{showTextSize:-1}),5);
 f.context.__wgProbe.adapter={version:'4.6.6'};
 assert.equal(f.context.__exportDialogueCharCount('ABC def',{showTextSize:-1,currentDialogSegments:['ABC ','def']}),4);
});
test('zero/negative/nonfinite repeating delays advance time, zero timeout remains immediate',async()=>{
 const context={module:{exports:{}}};vm.createContext(context);vm.runInContext(read('browser/clock-source.js'),context);
 for(const delay of [0,-5,NaN,1]){
  const Clock=context.module.exports.ClockController(),clock=new Clock({setTimeout:fn=>{queueMicrotask(fn);return()=>{};},performanceNow:()=>0});clock.install(0);let calls=0;
  const id=clock.addTimer({type:'Interval',delay,func:()=>calls++});await clock.runFor(16);assert.equal(calls,16);assert.equal(clock.performanceNow(),16);clock.clearTimer(id,'Interval');
 }
 const Clock=context.module.exports.ClockController(),clock=new Clock({setTimeout:fn=>{queueMicrotask(fn);return()=>{};},performanceNow:()=>0});clock.install(0);let tick;clock.addTimer({type:'Timeout',delay:0,func:()=>tick=clock.performanceNow()});await clock.runFor(0);assert.equal(tick,0);
});
for(const iterations of [1,Infinity])test('CSS '+iterations+' animation is sampled only when time changes',()=>{
 class Element{getBoundingClientRect(){return {width:64,height:64};}hasAttribute(){return false;}classList={contains:()=>false};tagName='DIV';id='decoration';}
 const target=new Element(),animation={currentTime:0,effect:{target,getKeyframes:()=>[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],getComputedTiming:()=>({iterations})}},state={textboxRoot:null,getTextboxRoot:()=>null,markTextElements(){},excluded:()=>false,dirty:false,animationTimes:new WeakMap(),videoTimes:new WeakMap(),stats:{capturePlanSamples:0,ignoredInfiniteAnimations:0,animation:0,baseOnlyAnimationSamples:0}};
 const context={Element,__gpuDomState:state,document:{getAnimations:()=>[animation],querySelectorAll:()=>[]},getComputedStyle:()=>({position:'absolute',display:'block',visibility:'visible',opacity:'1'})};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('globalThis.__gpuDomAnimationProperties='),source.indexOf('\nglobalThis.__gpuDomPrepareTextAtlas=')),context);
 assert.equal(context.__gpuDomCapturePlan().needed,true);assert.equal(context.__gpuDomCapturePlan().needed,false);animation.currentTime=250;assert.equal(context.__gpuDomCapturePlan().needed,true);assert.equal(state.stats.ignoredInfiniteAnimations,0);
});

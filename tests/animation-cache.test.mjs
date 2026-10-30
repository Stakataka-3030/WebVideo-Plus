import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../browser/render.js',import.meta.url),'utf8');
const capture=source.slice(source.indexOf('globalThis.__gpuDomAnimationProperties='),source.indexOf('\nglobalThis.__gpuDomPrepareTextAtlas='));
function fixture(){
 class Element{constructor(name){this.name=name;this.isConnected=true;this.opacity='1';this.classList={contains:()=>false};}contains(e){return this.name==='box'&&e.name==='name'&&e.isConnected;}getBoundingClientRect(){return {width:64,height:64};}hasAttribute(){return false;}}
 const box=new Element('box'),target=new Element('name');let progress=0,iteration=0,listed=true,frames=[{opacity:0},{opacity:1}],timing={duration:250,fill:'forwards',iterations:1};
 const animation={currentTime:0,effect:{target,getComputedTiming:()=>({progress,currentIteration:iteration,iterations:timing.iterations}),getTiming:()=>timing,getKeyframes:()=>frames}};
 const state={dirty:false,textboxRoot:box,getTextboxRoot:()=>box,markTextElements(){},excluded:()=>false,videoTimes:new WeakMap(),stats:new Proxy({},{get:(o,k)=>o[k]||0,set:(o,k,v)=>(o[k]=v,true)})};
 const context={Element,__gpuDomState:state,document:{getAnimations:()=>listed?[animation]:[],querySelectorAll:()=>[]},getComputedStyle:e=>({position:'absolute',display:'block',visibility:'visible',opacity:e.opacity})};vm.createContext(context);vm.runInContext(capture,context);
 return {state,animation,target,plan:()=>context.__gpuDomCapturePlan(),commit:scope=>context.__gpuDomCommitAnimations(scope||'full'),set(p,t=p*250){progress=p;animation.currentTime=t;},list(v){listed=v;},timing(t){Object.assign(timing,t);},frames(f){frames=f;},second(){const a={...animation,effect:{...animation.effect,target:new Element('name')}};context.document.getAnimations=()=>[animation,a];return a;}};
}
test('terminal progress is captured once and acknowledged only after upload',()=>{const f=fixture();f.set(.996,249);assert.equal(f.plan().needed,true);assert.equal(f.plan().needed,true);f.commit();assert.equal(f.plan().needed,false);f.set(1,250);assert.equal(f.plan().needed,true);f.commit();f.set(1,900);assert.equal(f.plan().needed,false);});
test('base upload does not acknowledge textbox state',()=>{const f=fixture();f.plan();f.commit('base');assert.equal(f.plan().scope,'full');f.commit();assert.equal(f.plan().needed,false);});
test('none fill disappearance and cancel clear once',()=>{for(const last of [null,0]){const f=fixture();f.set(.996,249);f.plan();f.commit();f.list(false);f.set(last,250);assert.equal(f.plan().needed,true);f.commit();assert.equal(f.plan().needed,false);assert.equal(f.state.watchedAnimations.size,0);}});
test('fade out to zero and target removal cannot leave old pixels',()=>{for(const remove of [false,true]){const f=fixture();f.set(.996,249);f.plan();f.commit();if(remove)f.target.isConnected=false;else f.target.opacity='0';f.set(1,250);assert.equal(f.plan().scope,'full');f.commit();assert.equal(f.plan().needed,false);}});
test('backward seek and unresolved delay restore invalidation',()=>{const f=fixture();f.set(1,500);f.plan();f.commit();f.set(.5,125);assert.equal(f.plan().needed,true);f.commit();f.set(null,-20);assert.equal(f.plan().needed,true);f.commit();f.set(0,0);assert.equal(f.plan().needed,true);});
test('actual progress takes precedence over negative endDelay/endTime',()=>{const f=fixture();f.timing({endDelay:-100});f.set(.6,150);f.plan();f.commit();f.set(.8,200);assert.equal(f.plan().needed,true);f.commit();f.set(1,250);assert.equal(f.plan().needed,true);});
test('keyframe and timing edits invalidate an unchanged progress',()=>{const f=fixture();f.set(.5);f.plan();f.commit();f.frames([{opacity:0},{opacity:.7}]);assert.equal(f.plan().needed,true);f.commit();f.timing({easing:'ease-out'});assert.equal(f.plan().needed,true);f.commit();f.animation.effect.composite='add';assert.equal(f.plan().needed,true);});
test('one full image acknowledges both name layers, including dirty initial capture',()=>{const f=fixture();f.second();f.state.dirty=true;assert.equal(f.plan().scope,'full');f.commit();f.state.dirty=false;assert.equal(f.plan().needed,false);});
test('infinite precise policy is unchanged',()=>{for(const precise of [false,true]){const f=fixture();f.state.preciseTextboxLoopAnimations=precise;f.timing({iterations:Infinity});f.set(.2);assert.equal(f.plan().needed,precise);if(precise){f.commit();assert.equal(f.plan().needed,false);f.set(.3);assert.equal(f.plan().needed,true);}}});

test('removing an animation effect clears the cached contribution once',()=>{const f=fixture();f.set(.5);f.plan();f.commit();f.animation.effect=null;f.list(false);assert.equal(f.plan().scope,'full');f.commit();assert.equal(f.plan().needed,false);});

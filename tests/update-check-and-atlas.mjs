import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const releases=[{tag_name:'v1.1.4',body:'<!-- webvideo-compat: {"webgal":["4.6.4"]} -->'}];
let mode='next-release',baselineVersion='1.1.4',githubRequests=0;
const context={WebVideoUpdateContext:{productVersion:'1.1.3',engineId:'open-webgal.webgal',engineVersion:'4.6.4'},__INFO:{version:'4.6.4'},AbortController,AbortSignal,setTimeout,clearTimeout,URL,fetch:async(url,options={})=>{
 if(String(url).endsWith('video-export-service.json'))return {json:async()=>({baseUrl:'http://127.0.0.1:45200',token:'test'})};
 if(String(url).endsWith('/api/update-preferences')){
  if(options.method==='POST'){({mode,baselineVersion}=JSON.parse(options.body));}
  return {ok:true,json:async()=>({mode,baselineVersion})};
 }
 githubRequests++;return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(releases)};
}};
context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('browser/update-check.js',root),'utf8'),context);
const api=context.WebVideoUpdates;
assert.equal((await api.check()).visible,false);
assert.equal(githubRequests,1);
releases[0].tag_name='v1.1.5';
assert.equal((await api.check()).kind,'update');
assert.equal(mode,'on');
await api.snooze('never');
const before=githubRequests;assert.equal((await api.check()).visible,false);assert.equal(githubRequests,before);
await api.check(true);assert.equal(githubRequests,before+1);

const rootElement={parentElement:null,contains:()=>true,getBoundingClientRect:()=>({left:0,top:0,right:960,bottom:540})};
const chars=Array.from({length:43},(_,index)=>({parentElement:rootElement,attrs:{},getBoundingClientRect:()=>({left:20+(index%22)*40,top:index<22?380:420,width:34,height:44}),setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},hasAttribute(key){return key in this.attrs;}}));
const doc={querySelectorAll(selector){if(selector==='[data-gpu-text-char="1"]')return chars;if(selector==='[data-gpu-atlas-page]')return chars.filter(c=>c.hasAttribute('data-gpu-atlas-page'));return [];},documentElement:{clientWidth:960,clientHeight:540}};
const render={document:doc,window:{innerWidth:960,innerHeight:540},getComputedStyle:element=>element===rootElement?{overflowX:'visible',overflowY:'visible'}:{fontSize:'40px',textShadow:'2px 1px 3px #333',webkitTextStrokeWidth:'1px',display:'inline',visibility:'visible'}};
render.globalThis=render;render.__gpuDomState={getTextboxRoot:()=>rootElement,markTextElements:()=>{},stats:{}};
vm.createContext(render);
const renderSource=fs.readFileSync(new URL('browser/render.js',root),'utf8');
const begin=renderSource.indexOf('globalThis.__gpuDomPrepareTextAtlas=()=>{'),end=renderSource.indexOf('globalThis.__gpuDomPositionAtlasPage=',begin);
assert.ok(begin>0&&end>begin);
vm.runInContext(renderSource.slice(begin,end),render);
const plan=vm.runInContext('globalThis.__gpuDomPrepareTextAtlas()',render);
assert.equal(plan.supported,true);
assert.equal(plan.pages,1);
assert.equal(plan.entries,43);
for(let index=43;index<243;index++)chars.push({parentElement:rootElement,attrs:{},getBoundingClientRect:()=>({left:20+(index%22)*40,top:index%2?380:420,width:34,height:44}),setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},hasAttribute(key){return key in this.attrs;}});
assert.equal(vm.runInContext('globalThis.__gpuDomPrepareTextAtlas()',render).supported,false);
console.log('Update suppression and wrapped-text atlas checks passed.');

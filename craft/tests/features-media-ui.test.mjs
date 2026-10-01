import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../ui/media-panel.js',import.meta.url),'utf8');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.textContent='';this.value='';this.disabled=false;this.checked=false;this.hidden=false;}
 append(...items){for(const item of items){this.children.push(item);item.parent=this;if(this.tag==='select'&&this.children.length===1)this.value=item.value;}}
 setAttribute(k,v){this[k]=v;}
 removeAttribute(k){delete this[k];}
 addEventListener(k,fn){this.events[k]=fn;}
 removeEventListener(k){delete this.events[k];}
 replaceChildren(...items){this.children=[];this.append(...items);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function setup(overrides={}){
 const calls=[], document={createElement:t=>new Element(t),createTextNode:t=>Object.assign(new Element('#text'),{textContent:t})};
 const context={document,setInterval:()=>1,clearInterval:()=>{},confirm:()=>true};vm.createContext(context);vm.runInContext(source,context);
 const snap={projectId:'p',path:'start',sceneRelativePath:'start.txt',source:'A;\nB;',revision:1};
 const music={players:2,tracks:[{id:'a',name:'A',file:'a.ogg',volume:100,lane:0,startSeconds:0,durationSeconds:8}]};
 let state={loaded:true,music},caps={music:true,projectFiles:true,audioImport:true,previewSettings:true,timing:true,service:true,exportVideo:true};
 const timing={seconds:12,settings:{textSpeed:70,autoSpeed:60},timing:{storyTimeline:{scenes:[{}]}},snapshot:snap,sourceHash:'hash'};
 const controller={state:()=>state,loadMusic:async()=>music,addTracks:async(...v)=>calls.push(['import',...v]),moveTrack:async()=>{},updateTrack:async()=>{},removeTrack:async()=>{},removePlayer:async()=>{},addPlayer:async()=>{},saveMusic:async()=>{},readSpeeds:async()=>({textSpeed:50,autoSpeed:50}),writeSpeeds:async v=>({...v,persistence:'session'}),measure:async options=>{options.onProgress({progress:.5,message:'measured'});return timing},getTiming:async()=>timing,cancel:async()=>calls.push(['cancel']),fitToMusic:async()=>({...timing,errorSeconds:.2,matched:true}),selectSegments:async ranges=>({...snap,sourceHash:'hash',ranges:ranges.map(r=>({...r,startSeconds:0,durationSeconds:4}))})};
 const bridge={capabilities:()=>caps,snapshot:async()=>snap,service:async(ep)=>{calls.push([ep]);if(ep==='/api/config')return{settings:{}};if(ep==='/api/dialog/subtitle')return{path:'C:/captions.ass',name:'captions.ass'};if(ep==='/api/jobs')return[];return{}},exportVideo:async options=>{calls.push(['export',options]);return{id:'job'+calls.length}},cancelJob:async id=>calls.push(['cancelJob',id])};
 Object.assign(controller,overrides);
 const container=new Element('container'),errors=[],messages=[];
 const mounted=context.WebVideoCraftMediaUI.mount(container,{bridge,controller,run:async fn=>{try{return await fn()}catch(e){errors.push(e.message)}},notify:m=>messages.push(m),getSnapshot:()=>snap,getSelection:()=>[{startLine:1,endLine:1},{startLine:2,endLine:2}]});
 const nodes=()=>{const output=[];const walk=n=>{output.push(n);n.children.forEach(walk)};walk(container);return output};
 const button=text=>nodes().find(n=>n.tag==='button'&&n.textContent===text);
 const click=async text=>{button(text).events.click();for(let i=0;i<20;i++)await Promise.resolve();};
 return{container,calls,errors,messages,mounted,button,click,nodes,snap,setCaps:v=>caps=v};
}
test('native audio chooser is used without browser FileList, generated IDs visible',async()=>{
 const f=setup();await f.click('导入音频…');assert.equal(f.calls.find(c=>c[0]==='import')[1],undefined);
 assert.ok(f.nodes().some(n=>n.textContent.includes('ID: a')));assert.equal(f.errors.length,0);f.mounted.dispose();
});
test('speed change labels current preview session, not permanent persistence',async()=>{
 const f=setup();await f.click('应用预览速度');assert.ok(f.messages.some(m=>m.includes('本次预览会话')));assert.equal(f.errors.length,0);f.mounted.dispose();
});
test('selected disjoint ranges submit separately with source hash and actual API fields',async()=>{
 const f=setup();await f.click('从剧情勾选行锁定片段');await f.click('加入导出队列');
 const exports=f.calls.filter(c=>c[0]==='export');assert.equal(exports.length,2);assert.equal(exports[0][1].range.sourceHash,'hash');assert.equal(exports[1][1].range.startLine,2);assert.equal(exports[0][1].fileName,'video-1.mp4');assert.equal(exports[0][1].settings.width,1280);assert.equal(f.errors.length,0);f.mounted.dispose();
});
test('stale selection stops export instead of using changed source',async()=>{
 const f=setup();await f.click('从剧情勾选行锁定片段');f.snap.source+='changed';await f.click('加入导出队列');assert.ok(f.errors.some(e=>e.includes('已变化')));assert.equal(f.calls.filter(c=>c[0]==='export').length,0);f.mounted.dispose();
});
test('subtitle native chooser transfers exact chosen source and defaults soft/video anchor',async()=>{
 const f=setup();await f.click('选择 SRT / ASS / SSA…');await f.click('加入导出队列');const options=f.calls.find(c=>c[0]==='export')[1];assert.equal(options.subtitle.sourcePath,'C:/captions.ass');assert.equal(options.subtitle.mode,'soft');assert.equal(options.subtitle.anchor.type,'video');f.mounted.dispose();
});
test('missing capabilities disable controls and cancellation bypasses global busy',async()=>{
 const f=setup();f.setCaps({reason:'No active preview'});await f.click('清除片段');assert.equal(f.button('测量实际时间').disabled,true);assert.match(f.button('测量实际时间').title,/No active preview/);await f.click('取消测量/匹配');assert.ok(f.calls.some(c=>c[0]==='cancel'));f.mounted.dispose();assert.equal(f.container.children.length,0);
});

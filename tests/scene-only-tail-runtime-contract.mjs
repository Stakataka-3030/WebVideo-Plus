// Exact official 4.6.6 forward/preload functions, in Node only. No browser,
// canvas, Pixi renderer, proprietary SDK, or host executable is started.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const [runtime,fixtureFile]=process.argv.slice(2);
assert.ok(runtime&&fixtureFile,'Usage: node scene-only-tail-runtime-contract.mjs <official466root> <C# fixtures.json>');
const source=fs.readFileSync(path.join(runtime,'assets/index-Dcp3ZA1M.js'),'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'d2b34606a380b9575ce1e50ed2251cb5e38b3d6f9b00200b2b0f252a13d209c0');
const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8').replace(/^\uFEFF/,''));
function block(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);assert.equal(source.indexOf(start,a+start.length),-1,start+' must be unique');return source.slice(a,b);}
function parse(script){return script.split('\n').map(raw=>{
 const m=/^([^:;]+):([^;]*)/.exec(raw);const command=m?m[1]:'comment',content=m?m[2]:'';
 const next=command==='comment'||command==='bgm';
 return {command,content,args:next?[{key:'next',value:true}]:[],sentenceAssets:command==='changeBg'||command==='changeFigure'?[{url:content}]:[],subScene:[]};
});}
function oracle(sentences,{blocking=false}={}){
 const calls={texture:[],general:[],subscene:[],events:[]},data={currentSentenceId:0,currentScene:{sceneUrl:'fixture',sentenceList:sentences}},pc={hasPendingBlockingStateCalculationPerform:()=>blocking};
 let tick=0;
 const context={R:{sceneManager:{sceneData:data,lockSceneWrite:false},gameplay:{performController:pc,pixiStage:{assets:{preload:assets=>calls.texture.push(assets.map(a=>a.url))}}},readHistoryManager:{checkIsRead(){}},backlogManager:{saveCurrentStateToBacklog(){}}},q:{getCalculationStageState:()=>({})},Pe:{getState:()=>({userData:{globalGameVar:{}}})},Qe:Object.fromEntries(['say','changeFigure','changeFigureDiff','changeBg','jumpLabel'].map(name=>[name,name])),At:structuredClone,X:{debug(){},warn(){},error:message=>{throw Error(message);}},Ns:'none',wPe:1000,wU:url=>({url}),sTe:['mouthOpen','mouthClose'],qo:value=>value,Vn:{figure:'figure'},$U:assets=>calls.general.push(assets.map(a=>a.url)),aTe:scenes=>calls.subscene.push(scenes),Iy:value=>value,je:(s,key)=>s.args.find(arg=>arg.key===key)?.value,Vt:(s,key)=>s.args.find(arg=>arg.key===key)?.value,Xd:()=>true,K$:()=>false,t8(){},cO:s=>calls.events.push({command:s.command,content:s.content,index:data.currentSentenceId,at:tick})};
 vm.createContext(context);
 vm.runInContext(block('function uTe(','m0=')+'unused=0;const '+block('vm=(e=0,t={})',',w8=')+';globalThis.forward=vm;globalThis.preload=s8;',context);
 for(let steps=0;steps<100&&data.currentSentenceId<sentences.length;steps++){
  context.forward();if(calls.events.at(-1)?.command==='end')break;
  tick+=calls.events.at(-1)?.command==='wait'?Number(calls.events.at(-1).content)||0:100;
 }
 return calls;
}
const end=fixture.limited.planningTail.boundaryLine;
for(const blocking of [false,true]){
 const full=oracle(parse(fixture.full.script),{blocking}),limited=oracle(parse(fixture.limited.script),{blocking});
 assert.deepEqual(limited.events.slice(0,-1),full.events.filter(event=>event.index<end));
 assert.equal(limited.events.at(-1).command,'comment');
 assert.equal(limited.events.at(-1).at,full.events.find(event=>event.index===end).at,'Exact forwarding boundary changed');
 assert.ok(full.texture.flat().includes('missing-tail.png'),'Control did not cross scene boundary during lookahead');
 assert.ok(!limited.texture.flat().includes('missing-tail.png'),'Tail texture reached native preload');
 assert.ok(!limited.general.flat().includes('missing-tail.png'),'Tail general asset reached native preload');
 assert.ok(limited.texture.flat().includes('before.png'),'Predecessor preload was removed');
}
// All 21 statement slots (current + 20) stay native. The optimization limits
// source length, rather than changing the preload window or asset manager.
const list=Array.from({length:25},(_,i)=>({command:'changeBg',content:'image-'+i,args:[],sentenceAssets:[{url:'image-'+i}],subScene:['scene-'+i]}));
const all=oracle(list);
assert.equal(all.texture[0].length,21);assert.equal(all.general[0].length,21);assert.equal(all.subscene[0].length,25);
for(const suffix of [[],[{command:'wait',content:'0',args:[],sentenceAssets:[],subScene:[]}],[{command:'comment',content:'',args:[{key:'next',value:true}],sentenceAssets:[],subScene:[]}]]){
 const prefix=[{command:'changeBg',content:'inherited',args:[{key:'next',value:true}],sentenceAssets:[],subScene:[]},...suffix];
 const full=oracle([...prefix,{command:'changeBg',content:'tail',args:[],sentenceAssets:[],subScene:[]}]);
 const limited=oracle([...prefix,{command:'comment',content:'',args:[],sentenceAssets:[],subScene:[]}]);
 assert.equal(limited.events.at(-1).at,full.events.at(-1).at,'Zero-time/empty target boundary changed');
}
// Run the real comment handler, perform arrangement, forwarding and empty-stack
// EOF together. The only cO change is the observer hook used by EngineAdapter.
// A plain end would destroy these active performs; the comment must not.
{
 const counts={finish:0,eof:0,stops:0,restores:0};
 const sentence={command:1,commandRaw:'comment',content:'WebVideo+ scene-only boundary',args:[{key:'next',value:true}]};
 const data={currentSentenceId:0,currentScene:{sceneName:'fixture',sentenceList:[sentence]}},sceneStack=[];
 const pc={performList:[{performName:'animation',isHoldOn:true},{performName:'figure',isHoldOn:false}],pendingPerformList:[],hasPendingBlockingStateCalculationPerform:()=>false,stopStartedPerform:()=>counts.stops++,clearPerformTimeout:()=>counts.stops++};
 const context={R:{sceneManager:{sceneData:data,sceneStack,lockSceneWrite:false,popFrame(){counts.eof++;return sceneStack.pop();}},gameplay:{performController:pc},readHistoryManager:{checkIsRead(){}},backlogManager:{saveCurrentStateToBacklog(){}}},q:{getCalculationStageState:()=>({})},Pe:{getState:()=>({userData:{globalGameVar:{}}})},Qe:{say:0,jumpLabel:2},Ns:'none',z_e:{},At:structuredClone,wPe:1000,s8(){},Iy:value=>value,je:()=>null,Vt:(s,key)=>s.args.find(a=>a.key===key)?.value,X:{debug(){},warn(){},error:message=>{throw Error(message);}},Q5:()=>counts.restores++,DEe:()=>counts.restores++,__nativeObserve:()=>counts.finish++};
 vm.createContext(context);
 vm.runInContext(block('function mr(','var Vn=')+'const '+block('Nwe=e=>',',Dwe=')+';const b8={1:{scriptFunction:Nwe}};const '+block('t8=(e="")=>',',jAe=')+';const '+block('cO=e=>',';function SPe(').replace('cO=e=>{','cO=e=>{globalThis.__nativeObserve?.(e);')+';R.gameplay.performController.arrangeNewPerform=({'+block('arrangeNewPerform(t,r,n=!0){','commitPendingPerforms(){')+'}).arrangeNewPerform;const '+block('vm=(e=0,t={})',',w8=')+';vm();',context);
 assert.deepEqual(counts,{finish:1,eof:1,stops:0,restores:0});
 assert.equal(pc.performList.length,2,'Boundary comment removed an active perform');
 assert.equal(data.currentSentenceId,1);
}
console.log('PASS exact official 4.6.6 forward, lookahead and comment/perform/EOF contracts (Node only)');

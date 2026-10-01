import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {previewSettings} from '../session/preview.mjs';
test('preview reads actual Redux values in exact default frame context',async()=>{const url='http://127.0.0.1:8899/game/test/';const store={getState:()=>({userData:{optionData:{textSpeed:37,autoSpeed:61}}})};const element={'__reactContainer$x':{memoizedProps:{store}}};let evaluated=false;const cdp={async call(method,args){if(method==='Page.getFrameTree')return{frameTree:{frame:{id:'host',url:'http://tauri.localhost/'},childFrames:[{frame:{id:'preview',url}}]}};assert.equal(args.contextId,7);evaluated=true;return {result:{value:await vm.runInNewContext(args.expression,{location:new URL(url),document:{getElementById:()=>element},console})}}}};assert.deepEqual(JSON.parse(JSON.stringify(await previewSettings(cdp,new Map([[7,{id:7,origin:'http://127.0.0.1:8899',auxData:{isDefault:true,frameId:'preview'}}]]),{url}))),{textSpeed:37,autoSpeed:61});assert(evaluated);});
test('preview rejects foreign origin and never evaluates caller code',async()=>{await assert.rejects(previewSettings({},new Map(),{url:'https://example.org/game'}),/origin/);});

import {PreviewSessionManager} from '../session/preview.mjs';
test('OOPIF context IDs are scoped by session and iframe ownership is checked',async()=>{
 const url='http://127.0.0.1:8899/game/fixture/',listeners=new Set(),calls=[];
 const cdp={on(fn){listeners.add(fn);return()=>listeners.delete(fn);},async call(method,args={},sessionId){calls.push({method,args,sessionId});
  if(method==='Page.getFrameTree')return{frameTree:{frame:sessionId?{id:'child',url,loaderId:'loaded'}:{id:'main',url:'http://tauri.localhost/'}}};
  if(method==='Target.getTargets')return{targetInfos:[{targetId:'child',type:'iframe',url}]};
  if(method==='DOM.getFrameOwner')return{backendNodeId:42};
  if(method==='DOM.describeNode')return{node:{localName:'iframe',attributes:['src',url]}};
  if(method==='Target.attachToTarget')return{sessionId:'child-session'};
  if(method==='Runtime.enable'){for(const fn of listeners)fn({sessionId,method:'Runtime.executionContextCreated',params:{context:{id:7,origin:'http://127.0.0.1:8899',auxData:{isDefault:true,frameId:'child'}}}});return{};}
  if(method==='Runtime.evaluate'){assert.equal(sessionId,'child-session');assert.equal(args.contextId,7);return{result:{value:{textSpeed:31,autoSpeed:62}}};}return{};
 }};
 const rootContexts=new Map([[7,{id:7,origin:'http://tauri.localhost',auxData:{isDefault:true,frameId:'main'}}]]);
 const manager=new PreviewSessionManager(cdp,rootContexts,new Map());assert.deepEqual(await manager.settings({url}),{textSpeed:31,autoSpeed:62});assert(calls.find(x=>x.method==='DOM.getFrameOwner'));assert.equal(rootContexts.get(7).origin,'http://tauri.localhost');await manager.close();
});

function writablePreview({loaded=true,initial='safe',globalKey='safe',loader='load',configUrl,changeDuringDb=false,speedChangeDuringDb=false}={}){
 const url='http://127.0.0.1:8899/game/test/',state={userData:{optionData:{textSpeed:20,autoSpeed:30},gameConfigInit:{Game_key:initial},globalGameVar:{Game_key:globalKey}}};
 const records={safe:{optionData:{textSpeed:20,autoSpeed:30}},foreign:{optionData:{textSpeed:80,autoSpeed:90}}};let writes=0,dbCalls=0;
 const store={getState:()=>state,dispatch:({payload})=>{state.userData.optionData[payload.key]=payload.value;}};
 const indexedDB={async databases(){dbCalls++;if(changeDuringDb)state.userData.globalGameVar.Game_key='foreign';if(speedChangeDuringDb)state.userData.optionData.textSpeed=99;return[{name:'localforage'}];},open(){const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={objectStore(){return{get(key){const r={};queueMicrotask(()=>{r.result=records[key];r.onsuccess();queueMicrotask(()=>tx.oncomplete?.());});return r;},put(value,key){records[key]=value;writes++;}};},abort(){queueMicrotask(()=>tx.onabort?.());}};return tx;}};req.onsuccess();});return req;}};
 const element={'__reactContainer$x':{memoizedProps:{store}}};
 const cdp={async call(method,args){if(method==='Page.getFrameTree')return{frameTree:{frame:{id:'f',url,loaderId:'load'}}};try{return{result:{value:await vm.runInNewContext(args.expression,{location:new URL(url),document:{getElementById:()=>element},indexedDB})}};}catch(e){return{exceptionDetails:{exception:{description:e.message}}};}}};
 const contexts=new Map([[1,{id:1,origin:'http://127.0.0.1:8899',auxData:{isDefault:true,frameId:'f'}}]]),keys=new Map();if(loaded)keys.set('f',{loaderId:loader,key:'safe',url:configUrl||url+'game/config.txt'});
 return{run:()=>previewSettings(cdp,contexts,{url,values:{textSpeed:41},expected:{textSpeed:20,autoSpeed:30}},keys),state,records,writes:()=>writes,dbCalls:()=>dbCalls};
}
test('proven loaded key writes only its existing record',async()=>{const f=writablePreview();const r=await f.run();assert.equal(r.persistence,'stored');assert.equal(f.records.safe.optionData.textSpeed,41);assert.equal(f.records.foreign.optionData.textSpeed,80);assert.equal(f.writes(),1);});
for(const settings of [{loaded:false},{initial:'different'},{globalKey:'different'},{loader:'stale'},{configUrl:'http://127.0.0.1:8899/game/other/game/config.txt'}])test('unproven preview key stays session-only '+JSON.stringify(settings),async()=>{const f=writablePreview(settings);const r=await f.run();assert.equal(r.persistence,'session');assert.equal(f.writes(),0);assert.equal(f.dbCalls(),0);assert.equal(f.state.userData.optionData.textSpeed,41);});
test('runtime key change during asynchronous DB lookup stops write',async()=>{const f=writablePreview({changeDuringDb:true});await assert.rejects(f.run(),/preview-changed/);assert.equal(f.writes(),0);assert.equal(f.state.userData.optionData.textSpeed,20);});

test('speed change during asynchronous DB lookup cannot be overwritten',async()=>{const f=writablePreview({speedChangeDuringDb:true});await assert.rejects(f.run(),/preview-changed/);assert.equal(f.writes(),0);assert.equal(f.state.userData.optionData.textSpeed,99);});

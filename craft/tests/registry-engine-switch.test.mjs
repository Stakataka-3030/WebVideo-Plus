import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../project-registry.js',import.meta.url),'utf8');
test('authoritative Craft project binding overrides stale cached game engine across legacy, 4.6.6 and MyGO',async()=>{
 const game={id:'game',path:'C:/owned-game',engineId:'old-464'};
 const engine=(id,version,base=version)=>({id:version==='4.6.4'?'old-464':'registered-'+id+version,engineId:id,version,path:'C:/engines/'+id+'/'+version,status:'created',availability:'available',metadata:{webgalVersion:base}});
 const rows=[engine('open-webgal.webgal','4.6.4'),engine('open-webgal.webgal','4.6.5'),engine('open-webgal.webgal','4.6.6'),engine('webgal-mygo.mygo','3.2.1','4.6.4')];let config;
 const tables={games:[game],engines:rows,templates:[]};
 const db={close(){},transaction(table){return {objectStore(){return {getAll(){const request={};queueMicrotask(()=>{request.result=tables[table];request.onsuccess();});return request;}}}}}};
 const context=vm.createContext({indexedDB:{databases:async()=>[{name:'WebGALCraft'}],open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess();});return request;}}});vm.runInContext(source,context);
 for(const [id,version,base] of [['open-webgal.webgal','4.6.6','4.6.6'],['open-webgal.webgal','4.6.4','4.6.4'],['webgal-mygo.mygo','3.2.1','4.6.4'],['open-webgal.webgal','4.6.5','4.6.5']]){
  config={engine:{id,version}};const resolved=await context.WebVideoCraftResolveProject(game,async()=>config);
  assert.equal(resolved.engineVersion,version);assert.equal(resolved.runtimeVersion,base);assert.equal(resolved.runtimeId,id);
 }
 config={engine:{id:'open-webgal.webgal',version:'4.7.0'}};await assert.rejects(context.WebVideoCraftResolveProject(game,async()=>config),/未就绪/);
});

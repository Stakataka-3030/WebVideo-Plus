import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script=fs.readFileSync(path.join(root,'browser/update-check.js'),'utf8');
const sandbox={setTimeout,clearTimeout,AbortController,WebVideoUpdateContext:{productVersion:'1.1.0',engineId:'open-webgal.webgal',engineVersion:'4.6.4'},fetch:async()=>{throw Error('offline');}};
sandbox.globalThis=sandbox;
vm.runInNewContext(script,sandbox);
const updates=sandbox.WebVideoUpdates;
const release=(tag,engines)=>({tag_name:'v'+tag,draft:false,prerelease:false,body:engines?`<!-- webvideo-compat: {"webgal":${JSON.stringify(engines)}} -->`:''});
const releases=[release('1.2.0',['4.6.5']),release('1.1.0'),release('1.0.4')];
assert.equal(updates.classify(releases,'4.6.5','1.1.0').kind,'update');
assert.match(updates.classify(releases,'4.6.5','1.1.0').url,/v1\.2\.0$/);
assert.equal(updates.classify(releases,'4.6.4','1.0.4').kind,'update');
assert.match(updates.classify(releases,'4.6.4','1.0.4').url,/v1\.1\.0$/);
assert.equal(updates.classify(releases,'4.6.4','1.1.0').kind,'keep');
assert.equal(updates.classify([release('1.2.0'),release('1.1.0')],'4.6.4','1.1.0').kind,'unknown');
assert.equal(updates.classify(releases,'4.6.6','1.1.0').kind,'unsupported');
const uncertain=[release('2.3.0',['4.6.6']),release('2.2.0'),release('2.1.0',['4.6.4'])];
for(const engine of ['4.6.4','4.6.5']){
 const result=updates.classify(uncertain,engine,'2.0.0');
 assert.equal(result.kind,'unknown');
 assert.ok(result.url.endsWith('/v2.2.0'),'link to the release whose compatibility is missing');
}
assert.equal(updates.classify(uncertain,'4.6.6','2.0.0').kind,'update');
await updates.check(true);
assert.equal(updates.state().phase,'failed');
assert.match(updates.state().message,/检查更新失败/);
sandbox.WebVideoUpdateContext.engineId='webgal-mygo.mygo';
await updates.check(true);
assert.equal(updates.state().kind,'unknown');
assert.match(updates.state().message,/无法确认/);
console.log('Update compatibility and offline checks passed.');
sandbox.WebVideoUpdateContext.engineId='open-webgal.webgal';
sandbox.URL=URL;
sandbox.AbortSignal=AbortSignal;
let reads=0;
const writes=[];
sandbox.fetch=async(url,options)=>{
 if(url==='/assets/video-export-service.json')return {json:async()=>({baseUrl:'http://localhost:3000',token:'fixture'})};
 if(url.endsWith('/api/update-preferences')){
  if(options.method==='POST')writes.push(JSON.parse(options.body));
  return {ok:true,json:async()=>({mode:'never'})};
 }
 reads++;
 return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(releases)};
};
await updates.check(true);
assert.equal(updates.state().phase,'done');
assert.equal(updates.state().preference,'never');
await updates.check(false);
assert.equal(updates.state().phase,'suppressed');
assert.equal(reads,1);
assert.deepEqual(writes,[],'a manual check must preserve the reminder preference');
for(const action of ['dismiss','snooze']){
 let releaseResponse,started;
 const fetching=new Promise(resolve=>{started=resolve;});
 sandbox.fetch=async(url,options)=>{
  if(url==='/assets/video-export-service.json')return {json:async()=>({baseUrl:'http://localhost:3000',token:'fixture'})};
  if(url.endsWith('/api/update-preferences'))return {ok:true,json:async()=>({mode:'on'})};
  started();
  return new Promise(resolve=>{releaseResponse=resolve;});
 };
 const pending=updates.check(true);
 await fetching;
 if(action==='dismiss')updates.dismiss();
 else await updates.snooze('never');
 releaseResponse({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(releases)});
 await pending;
 assert.equal(updates.state().visible,false,action+' must survive a late release response');
}

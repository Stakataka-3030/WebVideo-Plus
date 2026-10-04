import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {KernelSession} from '../session/kernel.mjs';
test('Craft queue derives engine identity only from the verified snapshot',async t=>{
 const received=[];
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push(JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'});res.end('{"id":"test"}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const snapshot={id:'owned-project',runtimeId:'open-webgal.webgal',engineVersion:'4.6.4'};
 const kernel=new KernelSession({root:'/unused',kernel:'/unused',storage:{get:()=>snapshot}});
 kernel.discovery={baseUrl:'http://127.0.0.1:'+server.address().port,token:'test'};
 for(const endpoint of ['/api/jobs','/api/timing'])await kernel.request({endpoint,snapshotId:'owned',data:{project:'foreign',expectedRuntimeVersion:'3.2.1',runtimeStartup:{language:7,source:'forged'},settings:{engine:'mygo',textSpeed:42}}});
 for(const body of received){assert.equal(body.project,'owned-project');assert.equal(body.expectedRuntimeVersion,'4.6.4');assert.equal(body.expectedRuntimeId,'open-webgal.webgal');assert.equal(body.settings.engine,'webgal');assert.equal(body.settings.textSpeed,42);assert.equal(body.runtimeStartup,undefined);}
 kernel.readRuntimeStartup=async()=>({language:2,source:'preview'});await kernel.request({endpoint:'/api/jobs',snapshotId:'owned',data:{runtimeStartup:{language:7,source:'forged'}}});assert.deepEqual(received[2].runtimeStartup,{language:2,source:'preview'});snapshot.runtimeId='webgal-mygo.mygo';await assert.rejects(kernel.request({endpoint:'/api/jobs',snapshotId:'owned',data:{}}),/精确档位/);assert.equal(received.length,3);
});

test('normal entry accepts only the two native-validated runtime versions',async t=>{
 let snapshot={id:'owned',runtimeId:'open-webgal.webgal',engineVersion:'4.6.5'},count=0;
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;assert.equal(JSON.parse(body).expectedRuntimeVersion,'4.6.5');count++;res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const kernel=new KernelSession({root:'/unused',kernel:'/unused',storage:{get:()=>snapshot}});kernel.discovery={baseUrl:'http://127.0.0.1:'+server.address().port,token:'test'};
 await kernel.request({endpoint:'/api/jobs',snapshotId:'owned',data:{}});
 for(const version of ['4.6.6','4.7.0','4.6.5-custom','3.2.1']){snapshot.engineVersion=version;await assert.rejects(kernel.request({endpoint:'/api/jobs',snapshotId:'owned',data:{}}),/精确档位/);}
 assert.equal(count,1);
});

test('MyGO binding keeps its own and base versions and never inherits a stale selector',async t=>{
 const received=[];const snapshot={id:'owned-mygo',runtimeId:'webgal-mygo.mygo',engineVersion:'3.2.1',runtimeVersion:'4.6.4'};
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push(JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const kernel=new KernelSession({root:'/unused',kernel:'/unused',storage:{get:()=>snapshot},readRuntimeStartup:async()=>({language:2,source:'preview'})});kernel.discovery={baseUrl:'http://127.0.0.1:'+server.address().port,token:'test'};
 for(const endpoint of ['/api/jobs','/api/timing'])await kernel.request({endpoint,snapshotId:'owned',data:{expectedRuntimeId:'open-webgal.webgal',expectedRuntimeVersion:'4.6.5',expectedWebgalVersion:'4.6.5',settings:{engine:'webgal'}}});
 for(const body of received){assert.equal(body.expectedRuntimeId,'webgal-mygo.mygo');assert.equal(body.expectedRuntimeVersion,'3.2.1');assert.equal(body.expectedWebgalVersion,'4.6.4');assert.equal(body.settings.engine,'mygo');assert.deepEqual(body.runtimeStartup,{language:2,source:'preview'});}
 for(const change of [{engineVersion:'4.6.4'},{engineVersion:'3.2.2'},{runtimeVersion:undefined},{runtimeVersion:'4.6.5'},{runtimeId:'other.engine'}]){
  Object.assign(snapshot,{runtimeId:'webgal-mygo.mygo',engineVersion:'3.2.1',runtimeVersion:'4.6.4'},change);
  await assert.rejects(kernel.request({endpoint:'/api/timing',snapshotId:'owned',data:{}}),e=>e.message.includes(snapshot.runtimeId)&&e.message.includes(snapshot.engineVersion)&&e.message.includes('MyGO 3.2.1'));
 }
 assert.equal(received.length,2);
});

test('official profiles reject contradictory base metadata and prefixed/custom versions',async()=>{
 const snapshot={id:'owned',runtimeId:'open-webgal.webgal',engineVersion:'4.6.5',runtimeVersion:'4.6.4'};
 const kernel=new KernelSession({root:'/unused',kernel:'/unused',storage:{get:()=>snapshot}});
 kernel.start=()=>{throw Error('invalid identity reached native startup');};
 for(const engineVersion of ['4.6.5','v4.6.5','4.6.5-custom',' 4.6.5 ']){snapshot.engineVersion=engineVersion;await assert.rejects(kernel.request({endpoint:'/api/jobs',snapshotId:'owned',data:{}}),/精确档位/);}
});

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
 kernel.readRuntimeStartup=async()=>({language:2,source:'preview'});await kernel.request({endpoint:'/api/jobs',snapshotId:'owned',data:{runtimeStartup:{language:7,source:'forged'}}});assert.deepEqual(received[2].runtimeStartup,{language:2,source:'preview'});snapshot.runtimeId='webgal-mygo.mygo';await assert.rejects(kernel.request({endpoint:'/api/jobs',snapshotId:'owned',data:{}}),/精确导出档位/);assert.equal(received.length,3);
});

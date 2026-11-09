import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {verifySessionListener} from '../session/listener.mjs';

const valid={schemaVersion:1,verified:true,source:'native-listener-table',port:54321,hostPid:123,ownerPid:456,addresses:['127.0.0.1','::1']};
test('listener query is bounded and hidden and requires matching native proof',async()=>{
 const result=await verifySessionListener('verified-wrapper.exe',54321,123,async(exe,args,options)=>{
  assert.equal(exe,'verified-wrapper.exe');assert.deepEqual(args,['--verify-listener','54321','123']);assert.deepEqual(options,{timeout:15000,windowsHide:true,maxBuffer:16384});return {stdout:JSON.stringify(valid)};
 });assert.deepEqual(result,valid);
});
test('listener proof rejects errors, truncation, mismatched scope and ambiguous results',async()=>{
 for(const value of ['',JSON.stringify({}),JSON.stringify({...valid,verified:false}),JSON.stringify({...valid,source:'cim'}),JSON.stringify({...valid,port:54322}),JSON.stringify({...valid,hostPid:124}),JSON.stringify({...valid,ownerPid:0}),JSON.stringify({...valid,addresses:[]}),JSON.stringify({...valid,addresses:['0.0.0.0']}),JSON.stringify({...valid,addresses:['127.0.0.1','127.0.0.1']})])await assert.rejects(verifySessionListener('wrapper',54321,123,async()=>({stdout:value})));
 await assert.rejects(verifySessionListener('wrapper',54321,123,async()=>{throw Error('native failure');}),/native failure/);
 for(const port of [0,65536,1.2])await assert.rejects(verifySessionListener('wrapper',port,123));
 await assert.rejects(verifySessionListener('wrapper',54321,0));
});
test('launch retains unique page and loopback websocket guards before injection',()=>{
 const source=fs.readFileSync(new URL('../launch-injected.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/Get-NetTCPConnection/);assert.match(source,/candidates\.length===1/);assert.match(source,/u\.origin==='http:\/\/tauri\.localhost'/);
 assert.match(source,/verifySessionListener\(path\.resolve\(config\.adapterRoot,manifest\.wrapper\),port,app\.pid\)/);
 assert(source.indexOf('await verifySessionListener')<source.indexOf('new WebSocket'));
 assert.match(source,/wsUrl\.hostname!=='127\.0\.0\.1'.*Number\(wsUrl\.port\)!==port/);
 const native=fs.readFileSync(new URL('../CraftStarter.cs',import.meta.url),'utf8');
 assert(native.indexOf('return CraftListenerVerifier.Run(args)')<native.indexOf('Application.EnableVisualStyles()'));
});
test('Windows native listener policy, CLI and real owned sockets without GUI',{skip:process.platform!=='win32',timeout:60000},async t=>{
 const root=fileURLToPath(new URL('../../',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'craft-listener-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100}));
 const compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 const common=['/nologo','/platform:x64','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',path.join(root,'craft','CraftStarter.cs'),path.join(root,'craft','installer','ManifestVerifier.cs')];
 const launcher=path.join(dir,'WebVideoCraft.Launcher.exe'),checks=path.join(dir,'ListenerChecks.exe');
 for(const args of [['/target:winexe','/out:'+launcher,...common],['/target:exe','/main:ListenerChecks','/out:'+checks,...common,path.join(root,'craft','tests','ListenerChecks.cs')]]){
  const compiled=spawnSync(compiler,args,{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
 }
 const checked=spawnSync(checks,[],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(checked.status,0,checked.stdout+checked.stderr);t.diagnostic(checked.stdout.trim());
 const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const port=server.address().port;
 assert.equal((await verifySessionListener(launcher,port,process.pid)).ownerPid,process.pid);
 const child=spawn(process.execPath,['--input-type=module','-e',"import net from 'node:net';const s=net.createServer();s.listen(0,'127.0.0.1',()=>console.log(s.address().port));process.stdin.resume();process.stdin.on('end',()=>s.close());"],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 const exited=once(child,'exit');t.after(async()=>{child.stdin.end();await exited;});
 const [data]=await once(child.stdout,'data');const childPort=Number(String(data).trim());
 assert.equal((await verifySessionListener(launcher,childPort,process.pid)).ownerPid,child.pid,'descendant owner is verified against real process snapshot');
 await assert.rejects(verifySessionListener(launcher,port,child.pid),/not owned/,'parent listener is not owned by child');
 await new Promise(resolve=>server.close(resolve));await assert.rejects(verifySessionListener(launcher,port,process.pid),/No native listener/);
 for(const args of [['--verify-listener'],['--verify-listener','0','1'],['--verify-listener','9','+1'],['--verify-listener','9','1','extra']]){const rejected=spawnSync(launcher,args,{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(rejected.status,1);assert.match(rejected.stderr,/verification failed/);}
});

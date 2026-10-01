// Portable launch contracts. Windows GUI/mutex checks run separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {verifyPackage} from '../craft/installer/transaction.mjs';
const source=fs.readFileSync(new URL('../craft/CraftStarter.cs',import.meta.url),'utf8');
const session=fs.readFileSync(new URL('../craft/launch-injected.mjs',import.meta.url),'utf8');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function fixture(body){const root=fs.mkdtempSync(path.join(os.tmpdir(),'craft-launch-check-'));try{
 const files=[];for(let i=0;i<500;i++){const name=`ai-runtime/node_modules/scope/pkg${Math.floor(i/10)}/dist/deep/module${i}.js`,file=path.join(root,name),bytes=Buffer.from('inert '+i);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});}
 const manifest={schemaVersion:1,product:'WebVideo+ Craft',supportedHosts:[{version:'fixture',sha256:'a'.repeat(64)}],entry:files[0].path,wrapper:files[1].path,node:files[2].path,kernel:files[3].path,files};
 fs.writeFileSync(path.join(root,'MANIFEST.json'),JSON.stringify(manifest));body(root,manifest);
}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('launcher shows responsive startup UI before verification and holds early cross-entry mutex',()=>{
 assert.match(source,/Application\.Run\(form\)/);assert.match(source,/worker\.DoWork\+=/);assert.match(source,/worker\.ProgressChanged\+=/);
 assert.ok(source.indexOf('launchMutex=AcquireLaunchMutex(adapter)')<source.indexOf('var state=CraftManifestVerifier.VerifyLaunch'));
 assert.match(source,/WaitOne\(0\)/);assert.match(source,/ToUpperInvariant\(\)/);assert.match(source,/finally\{if\(launchMutex!=null\)\{launchMutex\.ReleaseMutex\(\);launchMutex\.Dispose\(\)/);
 assert.match(source,/if\(started\)return;started=true/);assert.match(source,/form\.FormClosing\+=.*e\.Cancel=true/);
 assert.match(source,/if\(e\.ProgressPercentage==1\).*form\.Hide\(\)/);assert.match(source,/process\.WaitForExit\(\)/);
 assert.match(source,/Path\.GetTempPath\(\),"WebVideoCraft-Launcher-/);assert.doesNotMatch(source,/\.Kill\(|Application\.DoEvents\(/);
 assert.match(session,/launchStatus\('verifying'/);assert.match(session,/launchStatus\('connecting'/);assert.match(session,/launchStatus\('ready'/);assert.match(session,/launchStatus\('failed'/);
 assert.ok(session.indexOf("launchStatus('ready'")>session.indexOf("event:'injected'"));
});
test('redirected output contains logging failures and retains fallback diagnostics',()=>{
 const handler=source.slice(source.indexOf('internal static void HandleSessionOutput'),source.indexOf(' static int Run('));
 const log=source.slice(source.indexOf('internal sealed class LaunchLog'),source.indexOf('internal static void HandleSessionOutput'));
 assert.match(source,/DataReceivedEventHandler append=\(sender,e\)=>HandleSessionOutput\(e.Data,log,report\)/);
 assert.doesNotMatch(handler,/File\.AppendAllText/);assert.match(handler,/log\.Write\(line\)/);assert.match(handler,/report\(message,stage=="ready"\)/);assert.match(handler,/catch\(Exception error\)/);
 assert.match(log,/try\{append\(target,line\).*catch\(Exception error\)/);assert.match(log,/target=fallback/);assert.match(log,/try\{append\(target,notice\+line\).*catch\(Exception error\)/);
 assert.match(log,/lock\(gate\)/);assert.match(log,/recentChars>16384/);assert.match(log,/line.Length>8192/);assert.match(log,/internal string Diagnostic/);
 assert.match(source,/throw new IOException\(error.Message\+"\\n"\+log.Diagnostic,error\)/);
});
test('package verification has linear filesystem checks and still hashes every declared file',()=>fixture((root,manifest)=>{
 const methods=['existsSync','lstatSync','statSync','readFileSync'];const original=Object.fromEntries(methods.map(k=>[k,fs[k]])),counts=Object.fromEntries(methods.map(k=>[k,0]));let progress=[];
 try{for(const key of methods)fs[key]=(...args)=>{counts[key]++;return original[key](...args);};verifyPackage(root,{onProgress:p=>progress.push(p)});}finally{for(const key of methods)fs[key]=original[key];}
 assert.ok(counts.existsSync<30,JSON.stringify(counts));assert.equal(counts.statSync,0);assert.ok(counts.lstatSync<manifest.files.length+200,JSON.stringify(counts));
 assert.equal(counts.readFileSync,manifest.files.length+2,'all declared bytes + manifest read/hash must be read');
 assert.deepEqual(progress.at(-1),{stage:'verified',checked:manifest.files.length,total:manifest.files.length});
 // A new call must not trust the prior inventory or verified bytes.
 fs.appendFileSync(path.join(root,manifest.files[440].path),'tamper');assert.throws(()=>verifyPackage(root),/integrity mismatch/);
}));
test('optimized traversal rejects nested file and directory links including mutable state',()=>fixture((root,manifest)=>{
 const file=path.join(root,manifest.files[400].path),backup=file+'.source';fs.renameSync(file,backup);fs.symlinkSync(backup,file);assert.throws(()=>verifyPackage(root),/Linked/);fs.unlinkSync(file);fs.renameSync(backup,file);
 const dir=path.join(root,'ai-runtime','node_modules','scope','pkg40'),other=dir+'.source';fs.renameSync(dir,other);fs.symlinkSync(other,dir,'dir');assert.throws(()=>verifyPackage(root),/Linked/);fs.unlinkSync(dir);fs.renameSync(other,dir);
 fs.mkdirSync(path.join(root,'state'));fs.symlinkSync(path.dirname(root),path.join(root,'state','linked'),'dir');assert.throws(()=>verifyPackage(root,{allowMutable:true}),/Linked/);
}));

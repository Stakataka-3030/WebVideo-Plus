import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const inputRoot=path.resolve(process.argv[2]??path.join(root,'package'));
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const lock=read('build/dependencies.lock.json');
const runtime=read('build/runtime-patches.json');
const versions=read('version.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const entry of runtime.files){
 const file=path.join(inputRoot,'runtime/web',entry.path),bytes=fs.readFileSync(file);
 assert.equal(bytes.length,entry.outputSize,`Wrong runtime size: ${entry.path}`);
 assert.equal(hash(bytes),entry.outputSha256,`Wrong runtime bytes: ${entry.path}`);
}
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.relative(path.join(inputRoot,'runtime/web'),path.join(directory,entry.name)).replaceAll('\\','/')]);}
assert.deepEqual(files(path.join(inputRoot,'runtime/web')).sort(),runtime.files.map(entry=>entry.path).sort(),'Unexpected or missing runtime files');
for(const [file,expected] of Object.entries(lock.stagedFiles)){
 const bytes=fs.readFileSync(path.join(inputRoot,file));
 assert.equal(hash(bytes),expected,`Prepared input hash mismatch: ${file}`);
}
assert.equal(hash(fs.readFileSync(path.join(inputRoot,'bin/MicrosoftEdgeWebview2Setup.exe'))),lock.webview2Bootstrap.sha256);
assert.equal(JSON.parse(fs.readFileSync(path.join(inputRoot,'component.json'),'utf8')).version,versions.kernelVersion);
assert.equal(fs.readFileSync(path.join(inputRoot,'WebGAL.Video.exe.config'),'utf8'),fs.readFileSync(path.join(root,'build/templates/WebGAL.Video.exe.config'),'utf8'));
for(const file of ['README.md','LICENSE','LICENSES.md','NOTICE.md','licenses/WebView2-SDK-LICENSE.txt','ai-runtime/LICENSE-Node.txt','docs/USER_GUIDE.md'])assert.ok(fs.statSync(path.join(inputRoot,file)).size>0,`Required document missing: ${file}`);
console.log(`Build inputs verified: ${runtime.files.length} exact runtime files, pinned SDK/bootstrap/Node, metadata and notices.`);

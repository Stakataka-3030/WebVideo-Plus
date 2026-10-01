// Staging-only fixtures: inert binary text and a test-local lock, never executed.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url))),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function put(root,name,value='fixture'){const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,value);}
function prepared(body){const root=fs.mkdtempSync(path.join(os.tmpdir(),'craft-package-check-'));try{
 for(const name of ['craft/build-craft-kernel.mjs','craft/installer/transaction.mjs','craft/installer/build-receipt.mjs'])put(root,name,fs.readFileSync(path.join(repo,name)));
 const versions=JSON.parse(fs.readFileSync(path.join(repo,'craft/version.json')));versions.nodeSha256=hash('inert test Node');put(root,'craft/version.json',JSON.stringify(versions));
 put(root,'version.json',JSON.stringify({productVersion:versions.baseProductVersion,kernelVersion:versions.baseKernelVersion}));
 put(root,'build.ps1','fixture build');put(root,'native.manifest','fixture PE manifest');put(root,'src/Fixture.cs','// inert compilation fixture');
 for(const name of ['character-map.factory.json','preset-effects.factory.json','ai-providers.factory.json','anogo-actions.factory.json','filter-presets.factory.json'])put(root,name,'{}');
 for(const name of ['WebGAL.Video.exe','WebGAL.Video.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','process-guard.exe','CraftInstallerObserver.exe','WebVideoCraft.Launcher.exe','LICENSE','LICENSES.md','NOTICE.md'])put(root,'package/'+name,'inert '+name);
 for(const name of ['browser/novel-core.js','runtime/web/index.html','licenses/third-party.txt'])put(root,'package/'+name);
 put(root,'package/ai-runtime/node.exe','inert test Node');put(root,'craft/LICENSE-Node-22.20.0.txt','test notice');
 for(const name of ['worker.mjs','novel-prompt.txt','stage-prompt.txt','package.json','package-lock.json','providers.json','novel-core.mjs','node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json'])put(root,'package/ai-runtime/'+name);

 for(const name of ['craft/launch-injected.mjs','craft/host-bridge.js','craft/session/api.mjs','craft/update/observe-installer.ps1','craft/features/editor.js','craft/features/vendor/LICENSE.txt','craft/features/vendor/parser.ts','craft/ui/styles.css','craft/tests/not-shipped.test.mjs','vendor/js-yaml-4.1.1.min.js','vendor/js-yaml-LICENSE'])put(root,name);
 const receipt=spawnSync(process.execPath,[path.join(root,'craft/installer/build-receipt.mjs'),'--write'],{encoding:'utf8'});assert.equal(receipt.status,0,receipt.stderr);
 body(root,versions);
 }finally{fs.rmSync(root,{recursive:true,force:true});}}
const run=root=>spawnSync(process.execPath,[path.join(root,'craft/build-craft-kernel.mjs')],{encoding:'utf8'});
test('Craft package preserves runtime tree, observer and vendor licenses but omits tests',()=>prepared((root,v)=>{
 const result=run(root);assert.equal(result.status,0,result.stderr);const out=path.join(root,'dist','WebVideoCraft-Setup-'+v.installerVersion),manifest=JSON.parse(fs.readFileSync(path.join(out,'MANIFEST.json')));
 assert.equal(manifest.entry,'craft/launch-injected.mjs');assert.equal(manifest.updateObserverValidated,false);assert.equal(manifest.sameNameUpdateValidated,false);
 for(const name of ['CraftInstallerObserver.exe','craft/host-bridge.js','craft/session/api.mjs','craft/update/observe-installer.ps1','craft/features/editor.js','craft/features/vendor/LICENSE.txt','craft/features/vendor/parser.ts','craft/ui/styles.css','vendor/js-yaml-4.1.1.min.js','vendor/js-yaml-LICENSE','licenses/third-party.txt','ai-runtime/worker.mjs','ai-runtime/node.exe','ai-runtime/novel-core.mjs','ai-runtime/LICENSE-Node.txt','ai-runtime/node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json'])assert.ok(manifest.files.some(f=>f.path===name),name);
 assert.ok(!manifest.files.some(f=>f.path.startsWith('craft/tests/')||f.path.includes('build-craft')));
 assert.equal(run(root).status,0);
 fs.appendFileSync(path.join(out,'node.exe'),'foreign modification');const before=fs.readFileSync(path.join(out,'node.exe'));assert.notEqual(run(root).status,0);assert.deepEqual(fs.readFileSync(path.join(out,'node.exe')),before);
}));
test('Craft packaging rejects wrong Node/base versions without publishing a partial output',()=>prepared((root,v)=>{
 put(root,'package/ai-runtime/node.exe','unverified Node');assert.notEqual(run(root).status,0);assert.equal(fs.existsSync(path.join(root,'dist','WebVideoCraft-Setup-'+v.installerVersion)),false);
 put(root,'package/ai-runtime/node.exe','inert test Node');put(root,'version.json',JSON.stringify({productVersion:'other',kernelVersion:v.baseKernelVersion}));assert.notEqual(run(root).status,0);
}));

test('Craft packaging rejects a stale native executable after source edits',()=>prepared((root,v)=>{
 put(root,'src/Fixture.cs','// newer source not yet compiled');const result=run(root);assert.notEqual(result.status,0);assert.match(result.stderr,/compiled inputs changed/);assert.equal(fs.existsSync(path.join(root,'dist','WebVideoCraft-Setup-'+v.installerVersion)),false);
}));

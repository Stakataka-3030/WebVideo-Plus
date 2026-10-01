import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const lock=JSON.parse(read('build/dependencies.lock.json'));
test('every direct build dependency is versioned, HTTPS and SHA-256 pinned',()=>{
 assert.equal(lock.schemaVersion,1);
 for(const name of ['webgal','webview2Sdk','webview2Bootstrap','node']){
  assert.match(lock[name].url,/^https:\/\//);
  assert.match(lock[name].sha256,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(lock[name].url,/\/latest\//);
  assert.doesNotMatch(lock[name].file,/[/\\:]/);
 }
 const runtime=JSON.parse(read('build/runtime-patches.json'));
 assert.equal(lock.webgal.sha256,runtime.source.sha256);
 assert.equal(lock.webgal.url,runtime.source.url);
});
test('default preparation and CI do not require a legacy installer',()=>{
 assert.doesNotMatch(read('prepare-build.ps1'),/Mandatory\s*=\s*\$true|0\.4\.10\.2/);
 assert.doesNotMatch(read('.github/workflows/native-smoke.yml'),/0\.4\.10\.2|InstallerPath|bootstrap\.exe/);
 assert.ok(read('scripts/prepare-build-inputs.ps1').includes('prepare-webgal-runtime.mjs'));
 assert.ok(read('scripts/configure-installer.mjs').includes('inputs.webview2Bootstrap.sha256'));
 assert.doesNotMatch(read('scripts/build-ai.ps1'),/Get-Command node/);
});

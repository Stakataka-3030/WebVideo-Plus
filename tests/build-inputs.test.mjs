import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const lock=JSON.parse(read('build/dependencies.lock.json'));
test('every direct build dependency is versioned, HTTPS and SHA-256 pinned',()=>{
 assert.equal(lock.schemaVersion,1);
 for(const name of ['webgal','webview2Sdk','webview2Bootstrap','node','sourceHanSans','ffmpegTest']){
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

test('bundled UI font is pinned OFL Source Han Sans with no OPPO output path',()=>{
 const runtime=JSON.parse(read('build/runtime-patches.json'));
 const font=runtime.files.find(file=>file.external==='sourceHanSans');
 assert.equal(font.sourceSha256,lock.sourceHanSans.sha256);
 assert.equal(font.outputSha256,font.sourceSha256);
 assert.equal(lock.stagedFiles['licenses/LICENSE-SourceHanSans-OFL-1.1.txt'],lock.sourceHanSans.licenseSha256);
 assert.ok(!runtime.files.some(file=>/OPPO/i.test(file.path)));
 assert.match(runtime.styles.patches[0].replace,/SourceHanSansSC-Regular\.otf.*opentype/);
 assert.match(read('licenses/LICENSE-SourceHanSans-OFL-1.1.txt'),/SIL OPEN FONT LICENSE Version 1.1/);
});

test('CI media encoder pin matches the installer runtime pin',()=>{
 const installer=read('installer/Installer.base.cs');
 assert.ok(installer.includes(`FFVersion="${lock.ffmpegTest.version}"`));
 assert.ok(installer.includes(lock.ffmpegTest.sha256));
});

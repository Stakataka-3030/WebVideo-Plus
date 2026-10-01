import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const lock=JSON.parse(read('build/dependencies.lock.json'));
test('every direct build dependency is versioned, HTTPS and SHA-256 pinned',()=>{
 assert.equal(lock.schemaVersion,1);
 for(const name of ['webgal','webview2Sdk','webview2Bootstrap','node','ffmpegTest']){
  assert.match(lock[name].url,/^https:\/\//);
  assert.match(lock[name].sha256,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(lock[name].url,/\/latest\//);
  assert.doesNotMatch(lock[name].file,/[/\\:]/);
 }
 const runtime=JSON.parse(read('build/runtime-patches.json'));
 assert.equal(lock.webgal.sha256,runtime.source.sha256);
 assert.equal(lock.webgal.url,runtime.source.url);
});
test('Craft preparation reconstructs pinned inputs without a mandatory legacy installer',()=>{
 assert.doesNotMatch(read('prepare-build.ps1'),/Mandatory\s*=\s*\$true|0\.4\.10\.2/);
 assert.ok(read('scripts/prepare-build-inputs.ps1').includes('prepare-webgal-runtime.mjs'));
 assert.ok(read('craft/build-craft-kernel.mjs').includes('nodeSha256'));
 assert.ok(read('craft/version.json').includes('supportedHosts'));
});

test('bundled UI font and CSS preserve the original WebGAL bytes',()=>{
 const runtime=JSON.parse(read('build/runtime-patches.json'));
 const font=runtime.files.find(file=>file.path==='assets/OPPOSans-R-tAcFw8I3.ttf');
 assert.equal(font.outputSha256,'ea92535935f8b5da18b64bb23e5ffbfef1417b7ae4ff3fc15372a65ee95a9580');
 assert.equal(font.sourceSha256,font.outputSha256);
 const css=runtime.files.find(file=>file.path.endsWith('.css'));
 assert.equal(css.sourceSha256,css.outputSha256);
 assert.equal(runtime.styles,undefined);
 assert.equal(lock.sourceHanSans,undefined);
 assert.ok(!runtime.files.some(file=>/SourceHanSansSC/.test(file.path)));
});

test('CI media encoder pin matches the installer runtime pin',()=>{
 const installer=read('installer/Installer.base.cs');
 assert.ok(installer.includes(`FFVersion="${lock.ffmpegTest.version}"`));
 assert.ok(installer.includes(lock.ffmpegTest.sha256));
});

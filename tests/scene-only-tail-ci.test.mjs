import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const workflow=read('.github/workflows/native-smoke.yml');
const lock=JSON.parse(read('build/dependencies.lock.json'));
const craft=fs.existsSync(new URL('../craft/version.json',import.meta.url));
const nativeStep=workflow.split('- name: Compare scene-only tail planning with the full-story native crop')[1]?.split('\n      - name:')[0];
test('scene-tail pure C# suite has an existing serializer and runs before exact-engine oracle',()=>{
 const harness=read('tests/scene-only-tail.test.ps1');
 const serializer=harness.match(/'([^']+portable-json.cs)'/)[1];
 assert.ok(fs.existsSync(new URL(serializer,import.meta.url)));
 assert.match(workflow,/scene-only-tail.test.ps1 -Fixtures .build\/scene-only-tail-fixtures.json/);
 if(lock.webgal466Test)assert.ok(workflow.indexOf('scene-only-tail.test.ps1')<workflow.indexOf('node tests/scene-only-tail-runtime-contract.mjs .build/webgal-4.6.6'));
 else assert.doesNotMatch(workflow,/scene-only-tail-runtime-contract.mjs/,'4.6.6 oracle must not stand in for 4.6.4');
});
test('native scene-tail gate consumes this branch complete package and pinned media layout',()=>{
 assert.ok(nativeStep,'Native scene-tail workflow step is required');
 assert.match(nativeStep,/scene-only-tail-native.ps1 -EngineRoot/);
 assert.match(nativeStep,/-PackageRoot (?:package|\$package) -MediaToolDirectory \$media -OutputRoot/);
 assert.match(nativeStep,/runtime\/web/);
 if(craft){
  assert.match(nativeStep,/dist\/WebVideoCraft-Setup-/);
  assert.match(nativeStep,/webvideo-craft-ci-tools\/ffmpeg\/ffmpeg-/);
  assert.match(nativeStep,/-essentials_build\/bin/);
  assert.match(lock.ffmpegTest.url,/github.com\/GyanD\/codexffmpeg\//);
  assert.match(workflow,/Verify real Craft host startup and normal-close lifecycle/);
  assert.match(workflow,/craft\/tests\/ci-host-smoke.mjs/);
 }else{
  assert.match(nativeStep,/ffmpeg-test\/' \+ \$lock.ffmpegTest.archiveRoot \+ '\/bin/);
  assert.match(lock.ffmpegTest.url,/github.com\/BtbN\/FFmpeg-Builds\//);
 }
 for(const version of ['4.6.5','4.6.6']){
  const key=version==='4.6.5'?'webgal465Test':'webgal466Test';
  if(lock[key])assert.ok(nativeStep.includes('.build/webgal-'+version),'Each already pinned full fixture needs its own native run');
  else assert.ok(!nativeStep.includes('.build/webgal-'+version),'Do not silently depend on an unlocked full fixture');
 }
 assert.doesNotMatch(nativeStep,/-Engine mygo/,'MyGO has no pinned full fixture in this workflow');
});
test('native scene-tail guard precedes mutation or host execution and keeps root-replay scope honest',()=>{
 const gate=read('tests/scene-only-tail-native.ps1');
 const guard=gate.indexOf("$env:GITHUB_ACTIONS -ne 'true'");
 assert.ok(guard>=0&&guard<gate.indexOf('New-Item'));
 assert.match(gate,/RUNNER_ENVIRONMENT -ne 'github-hosted'/);
 assert.match(gate,/OS -ne 'Windows_NT'/);
 assert.match(gate,/firstSimulationFrame=0/);
 assert.match(gate,/no automatic-anchor, GPU-memory or Live2D SDK pixel assertion/);
 const reconstructed=JSON.parse(read('build/runtime-patches.json')).files.find(file=>/assets\/index-[^/]+\.js$/.test(file.path));
 assert.ok(gate.includes(reconstructed.outputSha256),'Prepared 4.6.4 bytes need their exact recognized identity');
 assert.match(gate,/\$plan.engine.version -ne \$profile.version/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertHosted,selectFormalPayload,prepare} from './prepare-scene-tail-package.mjs';
const versions={productVersion:'1.2.3',kernelVersion:'0.6.66'};
function fixture(change={},grouped=true){const manifest={version:'1.2.3',kernelVersion:'0.6.66',files:[{path:'WebGAL.Video.exe',bytes:4,sha256:'fixture'}],...change};const entries=new Map([['webvideo-plus/manifest.json',{name:'webvideo-plus/MANIFEST.json',data:Buffer.from(JSON.stringify(manifest))}]]);if(grouped)entries.set('webvideo-plus/groups.json',{name:'webvideo-plus/GROUPS.json',data:Buffer.from('{}')});return entries;}
test('formal fixture refuses local and self-hosted preparation before filesystem reads',()=>{
 for(const env of [{},{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'self-hosted',OS:'Windows_NT'},{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',OS:'Linux'}])assert.throws(()=>prepare('missing-installer','missing-destination','missing-evidence',env),/GitHub-hosted Windows/);
 assert.doesNotThrow(()=>assertHosted({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',OS:'Windows_NT'}));
});
test('formal fixture accepts only grouped payload with matching product, kernel and exact root',()=>{
 assert.equal(selectFormalPayload(fixture(),versions).manifest.version,'1.2.3');
 assert.throws(()=>selectFormalPayload(fixture({},false),versions),/never a Fast/);
 for(const change of [{version:'0.0.0'},{kernelVersion:'0.0.0'},{files:[]}])assert.throws(()=>selectFormalPayload(fixture(change),versions));
 const entries=fixture();entries.set('other/manifest.json',{name:'other/MANIFEST.json',data:Buffer.from('{}')});assert.throws(()=>selectFormalPayload(entries,versions),/one formal/);
});
test('scene-tail workflow extracts the retained formal EXE after keeping Fast rebuild coverage',()=>{
 const w=fs.readFileSync(new URL('../.github/workflows/native-smoke.yml',import.meta.url),'utf8');
 const step=w.split('- name: Compare scene-only tail planning with the full-story native crop')[1].split('\n      - name:')[0];
 assert.match(w,/Copy-Item -LiteralPath "dist\/WebVideo\+-Setup-\$version.exe" -Destination .build\/ci-installer/);
 assert.match(w,/build-product.ps1 -Fast/);
 assert.ok(w.indexOf('build-product.ps1 -Fast')<w.indexOf('node tests/prepare-scene-tail-package.mjs'));
 assert.match(step,/node tests\/prepare-scene-tail-package.mjs \$installer .build\/ci-native-fixtures\/scene-tail-formal \$identity/);
 assert.match(step,/\$package = \$payload.packageRoot/);
 assert.match(step,/-PackageRoot \$package/);
 assert.match(step,/\$payload.status -ne 'PASS'/);
});

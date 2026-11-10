import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {verify,verifyCraftPayload} from './verify-scene-tail-craft-package.mjs';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const versions={productVersion:'1.2.3c',installerVersion:'1.2.3.0c',kernelVersion:'0.6.66'};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'craft-scene-tail-identity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const files={'main.mjs':Buffer.from('inert script fixture'),'wrapper.exe':Buffer.from('inert wrapper fixture'),'node.exe':Buffer.from('inert node fixture'),'WebGAL.Video.exe':Buffer.from('inert kernel fixture')};
 const manifest={schemaVersion:1,product:'WebVideo+ Craft',version:versions.productVersion,installerVersion:versions.installerVersion,kernelVersion:versions.kernelVersion,supportedHosts:[{version:'fixture',sha256:hash('inert host')}],entry:'main.mjs',wrapper:'wrapper.exe',node:'node.exe',kernel:'WebGAL.Video.exe',files:Object.entries(files).map(([name,data])=>({path:name,bytes:data.length,sha256:hash(data)}))};
 const prefix='WebVideoCraft-Setup-'+versions.installerVersion+'/';const entries=new Map();
 for(const [name,data]of Object.entries({...files,'MANIFEST.json':Buffer.from(JSON.stringify(manifest))})){fs.writeFileSync(path.join(root,name),data);entries.set((prefix+name).toLowerCase(),{name:prefix+name,data});}
 return {root,entries,prefix};
}
test('Craft identity guard rejects local/self-hosted work before reading package paths',()=>{
 for(const env of [{},{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'self-hosted',OS:'Windows_NT'}])assert.throws(()=>verify('missing','missing','missing',env),/GitHub-hosted Windows/);
});
test('Craft identity binds raw manifest, exact EXE payload and full production package closure',t=>{
 const f=fixture(t),result=verifyCraftPayload(f.entries,f.root,versions);
 assert.equal(result.fullManifestVerified,true);assert.equal(result.installerPayloadVerified,true);assert.equal(result.verifiedPayloadFiles,5);
 assert.equal(result.kernelSha256,hash(fs.readFileSync(path.join(f.root,'WebGAL.Video.exe'))));
});
test('Craft identity rejects semantically equal but different raw manifest bytes',t=>{
 const f=fixture(t);fs.appendFileSync(path.join(f.root,'MANIFEST.json'),'\n');assert.throws(()=>verifyCraftPayload(f.entries,f.root,versions),/manifest bytes differ/);
});
for(const kind of ['modified','missing','unlisted'])test('Craft identity rejects '+kind+' current package file',t=>{
 const f=fixture(t);if(kind==='modified')fs.writeFileSync(path.join(f.root,'WebGAL.Video.exe'),'changed');else if(kind==='missing')fs.unlinkSync(path.join(f.root,'node.exe'));else fs.writeFileSync(path.join(f.root,'other.txt'),'extra');
 assert.throws(()=>verifyCraftPayload(f.entries,f.root,versions),/Package integrity|Unlisted package/);
});
test('Craft identity rejects wrong version, duplicate manifest, missing or modified EXE member',t=>{
 const f=fixture(t);assert.throws(()=>verifyCraftPayload(f.entries,f.root,{...versions,productVersion:'0'}),/version/);
 const duplicate=new Map(f.entries);duplicate.set('other/manifest.json',{name:'other/MANIFEST.json',data:Buffer.from('{}')});assert.throws(()=>verifyCraftPayload(duplicate,f.root,versions),/one current/);
 const missing=new Map(f.entries);missing.delete((f.prefix+'node.exe').toLowerCase());assert.throws(()=>verifyCraftPayload(missing,f.root,versions),/closure/);
 const changed=new Map(f.entries),key=(f.prefix+'node.exe').toLowerCase();changed.set(key,{...changed.get(key),data:Buffer.from('changed')});assert.throws(()=>verifyCraftPayload(changed,f.root,versions),/payload bytes/);
});
test('Craft scene-tail gate verifies exact current installer/package identity before native invocation',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/native-smoke.yml',import.meta.url),'utf8');
 const step=workflow.split('- name: Compare scene-only tail planning with the full-story native crop')[1].split('\n      - name:')[0];
 assert.ok(step.indexOf('node tests/verify-scene-tail-craft-package.mjs')<step.indexOf('./tests/scene-only-tail-native.ps1'));
 assert.match(step,/verify-scene-tail-craft-package.mjs \$installer \$package \$identity/);
 assert.match(step,/\$payload.status -ne 'PASS'/);assert.match(step,/\$LASTEXITCODE -ne 0/);
 assert.ok(workflow.indexOf('node craft/tests/write-ci-candidate.mjs')>workflow.indexOf('./tests/scene-only-tail-native.ps1'));
 assert.doesNotMatch(workflow,/craft\/tests\/ci-host-smoke.mjs/);
});

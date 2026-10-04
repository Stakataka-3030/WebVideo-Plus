import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifyRuntimeOutput} from './prepare-webgal-runtime.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),pkg=path.join(root,'package');
const read=file=>JSON.parse(fs.readFileSync(path.join(pkg,file),'utf8'));
const versions=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
const manifest=read('MANIFEST.json'),product=read('product.json');
assert.equal(verifyRuntimeOutput(path.join(pkg,'runtime/web')),16,'Packaged WebGAL runtime must retain exact original font/CSS and pinned instrumentation');
assert.equal(manifest.version,versions.productVersion);
assert.equal(manifest.kernelVersion,versions.kernelVersion);
assert.equal(product.version,manifest.version);
assert.equal(product.kernelVersion,manifest.kernelVersion);
assert.deepEqual(product.supportedTerreVersions,['4.6.4','4.6.5'],'Both supported Terre host profiles must be packaged');
for(const version of product.supportedTerreVersions){
 const baseline=JSON.parse(fs.readFileSync(path.join(root,version==='4.6.4'?'baseline/local-baseline.json':'baseline/terre-'+version+'.json'),'utf8'));
 assert.equal(product.hostProfiles[version].baseHash,baseline.baseHash);
 assert.equal(product.hostProfiles[version].patchRoot,'hosts/'+version);
 for(const file of ['product-ui/menu-patches.json','product-ui/character-map-patches.json','product-ui/game-patches.json','timeline/patches.json']){
  const patches=read('hosts/'+version+'/'+file);assert.ok(Array.isArray(patches)&&patches.length>0,'Missing host patch '+version+'/'+file);
 }
}

assert.equal(read('component.json').version,manifest.kernelVersion);
assert.equal(read('ai-runtime/package.json').version,manifest.version);
assert.equal(read('ai-runtime/package-lock.json').version,manifest.version);
assert.equal(read('ai-runtime/package-lock.json').packages[''].version,manifest.version);
for(const name of ['WebGAL.Video.exe','TerreLauncher.exe','process-guard.exe','WebVideoPlus.Manager.exe','ai-runtime/node.exe'])assert.ok(fs.statSync(path.join(pkg,name)).size>0,`Missing native binary ${name}`);
const inventory=new Set();
for(const entry of manifest.files){
 assert.ok(!inventory.has(entry.path),`Duplicate manifest entry ${entry.path}`);
 inventory.add(entry.path);
 const target=path.resolve(pkg,entry.path);
 assert.ok(target.startsWith(pkg+path.sep),`Unsafe manifest path ${entry.path}`);
 const bytes=fs.readFileSync(target);
 assert.equal(bytes.length,entry.bytes,`Manifest size mismatch ${entry.path}`);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,`Manifest hash mismatch ${entry.path}`);
}
function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.relative(pkg,path.join(directory,entry.name)).replaceAll('\\','/')]);}
assert.deepEqual(walk(pkg).filter(file=>file!=='MANIFEST.json').sort(),[...inventory].sort(),'Unlisted or missing package files');
console.log(`Full package verified: ${manifest.files.length} manifest entries, binaries and synchronized version metadata.`);

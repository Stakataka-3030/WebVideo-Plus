import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
function markdownFiles(directory){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  return entry.isDirectory()?markdownFiles(file):entry.name.endsWith('.md')?[file]:[];
 });
}
test('repository documentation links point to existing files',()=>{
 const files=['README.md','LICENSES.md','NOTICE.md','CHANGELOG.md'].map(file=>path.join(root,file)).concat(markdownFiles(path.join(root,'docs')));
 for(const file of files){
  for(const match of fs.readFileSync(file,'utf8').matchAll(/\]\(([^)]+)\)/g)){
   const target=match[1].split('#')[0];
   if(!target||/^[a-z]+:/i.test(target))continue;
   assert.ok(fs.existsSync(path.resolve(path.dirname(file),decodeURI(target))),`${path.relative(root,file)}: broken link ${target}`);
  }
 }
});
test('current documentation matches the canonical version fields',()=>{
 const versions=JSON.parse(read('version.json'));
 const ai=JSON.parse(read('ai-runtime/package.json')),lock=JSON.parse(read('ai-runtime/package-lock.json'));
 assert.equal(ai.version,versions.productVersion);assert.equal(lock.version,versions.productVersion);assert.equal(lock.packages[''].version,versions.productVersion);
 for(const file of ['README.md','docs/USER_GUIDE.md','docs/BUILDING.md']){
  for(const value of Object.values(versions))assert.ok(read(file).includes(value),`${file}: missing current version ${value}`);
 }
 const release=`RELEASE_NOTES_${versions.productVersion}.md`;
 assert.ok(read('README.md').includes(`docs/releases/${release}`));
 assert.ok(read('docs/releases/README.md').includes(`](${release})`));
});
test('build entrypoints resolve relocated helpers and fixed inputs',()=>{
 for(const file of ['build.ps1','build-product.ps1','prepare-build.ps1','scripts/build-ai.ps1']){
  for(const match of read(file).matchAll(/Join-Path \$taskRoot '([^']+\.(?:ps1|mjs|json|ico|manifest))'/g)){
   if(/^(?:package|dist|\.build)\//.test(match[1]))continue;
   assert.ok(fs.existsSync(path.join(root,match[1])),`${file}: missing input ${match[1]}`);
  }
 }
 assert.ok(read('.github/workflows/native-smoke.yml').includes('build-product.ps1'));
 assert.ok(read('build-product.ps1').includes('scripts/build-timeline.mjs'));
 assert.ok(read('scripts/build-feature-assets.mjs').includes("fs.cpSync(path.join(root,'docs'),path.join(pkg,'docs'),{recursive:true})"));
});

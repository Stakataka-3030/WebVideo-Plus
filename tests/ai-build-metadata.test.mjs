import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {stageAiMetadata} from '../scripts/build-ai-metadata.mjs';
test('AI staging updates root versions and preserves the empty-key dependency lock',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'webvideo-ai-metadata-'));
 try{
  const source=path.join(temporary,'source'),destination=path.join(temporary,'staged');fs.mkdirSync(source);
  const pkg={name:'test',version:'0.4.10',dependencies:{dependency:'1.2.3'}};
  const lock={name:'test',version:'0.4.10',lockfileVersion:3,packages:{'':{...pkg},'node_modules/dependency':{version:'1.2.3',integrity:'sha512-example',resolved:'https://registry.npmjs.org/dependency/-/dependency-1.2.3.tgz'}}};
  fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(pkg));fs.writeFileSync(path.join(source,'package-lock.json'),JSON.stringify(lock));
  stageAiMetadata(source,destination,'1.1.4');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination,'package.json'))),{...pkg,version:'1.1.4'});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination,'package-lock.json'))),{...lock,version:'1.1.4',packages:{...lock.packages,'':{...pkg,version:'1.1.4'}}});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(source,'package-lock.json'))),lock);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});

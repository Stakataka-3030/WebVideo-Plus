import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareRuntime,runtimeManifest,sha256,transformBundle,validateRuntimeSource,verifyRuntimeOutput} from '../scripts/prepare-webgal-runtime.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'webvideo-runtime-check-'));
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;
function check(name,body){body();checks++;console.log('PASS '+name);}

try{
  const source=path.join(temporary,'source'),output=path.join(temporary,'output');
  const original=Buffer.from('const marker="原版";\n'),replacement=Buffer.from('const marker="导出";\nglobalThis.probe=true;\n');
  const other=Buffer.from('<html>runtime</html>');
  fs.mkdirSync(path.join(source,'assets'),{recursive:true});
  fs.writeFileSync(path.join(source,'assets/index.js'),original);
  fs.writeFileSync(path.join(source,'index.html'),other);
  fs.writeFileSync(path.join(source,'unused-demo.txt'),'Must not be bundled');
  const record=(name,input,result=input)=>({path:name,sourceSize:input.length,sourceSha256:sha256(input),outputSize:result.length,outputSha256:sha256(result)});
  const manifest={schemaVersion:1,files:[record('assets/index.js',original,replacement),record('index.html',other)],bundle:{path:'assets/index.js',patches:[{id:'fixture',find:'const marker="原版";',replace:'const marker="导出";'}],append:'globalThis.probe=true;\n'}};

  check('pinned official archive and 16-file snapshot are specified',()=>{
    assert.equal(runtimeManifest.version,'4.6.4');
    assert.equal(runtimeManifest.source.sha256,'f7dbb153c0372044055ad167eeddc7202c5978bf661983328490ecd8d0a391ae');
    assert.equal(runtimeManifest.files.length,16);
    assert.equal(runtimeManifest.bundle.patches.length,11);
    assert.equal(runtimeManifest.bundle.path,'assets/index-R1tKotR6.js');
    assert.equal(runtimeManifest.bundle.bodyNewlines,'crlf');
    const bundle=runtimeManifest.files.find(file=>file.path===runtimeManifest.bundle.path);
    assert.equal(bundle.sourceSha256,'e49e15f0db25c95556b6b1eccad89d6e77a32e284cd4e4852fad7dc9a3019902');
    assert.equal(bundle.outputSha256,'d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10');
    assert.equal(runtimeManifest.files.filter(file=>file.sourceSha256!==file.outputSha256).length,1);
  });
  check('stages only selected files with exact UTF-8 output bytes',()=>{
    assert.deepEqual(prepareRuntime(source,output,manifest),{files:2,reused:false});
    assert.equal(verifyRuntimeOutput(output,manifest),2);
    assert.deepEqual(fs.readFileSync(path.join(output,'assets/index.js')),replacement);
    assert.equal(fs.existsSync(path.join(output,'unused-demo.txt')),false);
  });
  check('a second build verifies and reuses the identical snapshot',()=>{
    assert.deepEqual(prepareRuntime(source,output,manifest),{files:2,reused:true});
  });
  check('missing and duplicate patch anchors are rejected',()=>{
    assert.throws(()=>transformBundle('missing',manifest.bundle),/exactly once/);
    assert.throws(()=>transformBundle(original.toString().repeat(2),manifest.bundle),/exactly once/);
    assert.throws(()=>transformBundle(replacement.toString(),manifest.bundle),/exactly once/);
  });
  check('CRLF bundle body and mixed-EOL probe suffix stay byte-exact',()=>{
    const bundle={patches:[],bodyNewlines:'crlf',append:'\r\nprobeOne();\r\n\nprobeTwo();\n'};
    assert.equal(transformBundle('original();\n',bundle),'original();\r\n\r\nprobeOne();\r\n\nprobeTwo();\n');
    assert.throws(()=>transformBundle('body',{...bundle,bodyNewlines:'unsupported'}),/Unsupported/);
  });
  check('source hash failures leave the destination absent',()=>{
    const target=path.join(temporary,'bad-source-output');
    fs.writeFileSync(path.join(source,'assets/index.js'),'tampered');
    assert.throws(()=>prepareRuntime(source,target,manifest),/source integrity/);
    assert.equal(fs.existsSync(target),false);
    fs.writeFileSync(path.join(source,'assets/index.js'),original);
  });
  check('wrong output hashes reject transformations before staging',()=>{
    const wrong=clone(manifest),target=path.join(temporary,'bad-result-output');
    wrong.bundle.append+='extra';
    assert.throws(()=>prepareRuntime(source,target,wrong),/output integrity/);
    assert.equal(fs.existsSync(target),false);
  });
  check('unexpected output files are preserved and reported',()=>{
    const file=path.join(output,'do-not-delete.txt');fs.writeFileSync(file,'retained');
    assert.throws(()=>prepareRuntime(source,output,manifest),/clean the staging directory/);
    assert.equal(fs.readFileSync(file,'utf8'),'retained');fs.unlinkSync(file);
  });
  check('corrupt existing snapshots are never silently reused',()=>{
    fs.writeFileSync(path.join(output,'assets/index.js'),'tampered');
    assert.throws(()=>prepareRuntime(source,output,manifest),/output integrity/);
    assert.equal(fs.readFileSync(path.join(output,'assets/index.js'),'utf8'),'tampered');
    fs.writeFileSync(path.join(output,'assets/index.js'),replacement);
  });
  check('overlapping source and destination paths are rejected',()=>{
    assert.throws(()=>prepareRuntime(source,source,manifest),/overlap/);
    assert.throws(()=>prepareRuntime(source,path.join(source,'output'),manifest),/overlap/);
    assert.throws(()=>prepareRuntime(source,temporary,manifest),/overlap/);
  });
  check('traversal, duplicate, and missing runtime files are rejected',()=>{
    const unsafe=clone(manifest);unsafe.files[0].path='../outside';
    assert.throws(()=>validateRuntimeSource(source,unsafe),/Invalid or duplicate/);
    const duplicate=clone(manifest);duplicate.files.push(duplicate.files[0]);
    assert.throws(()=>validateRuntimeSource(source,duplicate),/Invalid or duplicate/);
    fs.renameSync(path.join(source,'index.html'),path.join(source,'saved.html'));
    assert.throws(()=>validateRuntimeSource(source,manifest),/ENOENT/);
    fs.renameSync(path.join(source,'saved.html'),path.join(source,'index.html'));
  });
  check('an explicitly empty destination is supported',()=>{
    const empty=path.join(temporary,'empty');fs.mkdirSync(empty);
    assert.equal(prepareRuntime(source,empty,manifest).reused,false);
    assert.equal(verifyRuntimeOutput(empty,manifest),2);
  });
  if(process.platform!=='win32')check('source and destination symlinks are rejected',()=>{
    const link=path.join(temporary,'source-link');fs.symlinkSync(source,link,'dir');
    assert.throws(()=>validateRuntimeSource(link,manifest),/regular directory/);
    const outputLink=path.join(temporary,'output-link');fs.symlinkSync(output,outputLink,'dir');
    assert.throws(()=>prepareRuntime(source,outputLink,manifest),/regular directory/);
    fs.renameSync(path.join(source,'index.html'),path.join(source,'saved.html'));
    fs.symlinkSync(path.join(source,'saved.html'),path.join(source,'index.html'));
    assert.throws(()=>validateRuntimeSource(source,manifest),/regular file/);
    fs.unlinkSync(path.join(source,'index.html'));
    fs.renameSync(path.join(source,'saved.html'),path.join(source,'index.html'));
  });
  check('CLI requires source and destination arguments',()=>{
    const result=spawnSync(process.execPath,[path.join(root,'scripts/prepare-webgal-runtime.mjs')],{encoding:'utf8'});
    assert.equal(result.status,1);assert.match(result.stderr,/Usage:/);
  });
  // Optional integration inputs keep CI offline and avoid committing third-party binaries.
  // node tests/verify-webgal-runtime.mjs <official-extracted-root> [legacy-runtime-root]
  if(process.argv[2])check('official WebGAL release reproduces the pinned runtime',()=>{
    const actual=path.join(temporary,'official-output');
    assert.equal(prepareRuntime(process.argv[2],actual).files,16);
    assert.equal(verifyRuntimeOutput(actual),16);
    if(process.argv[3])for(const file of runtimeManifest.files)assert.deepEqual(fs.readFileSync(path.join(actual,file.path)),fs.readFileSync(path.join(process.argv[3],file.path)),file.path);
    assert.equal(prepareRuntime(process.argv[2],actual).reused,true);
  });
  console.log('WebGAL runtime checks passed: '+checks);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}

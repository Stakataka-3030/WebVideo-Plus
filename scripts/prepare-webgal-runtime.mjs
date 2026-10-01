import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const runtimeManifest=JSON.parse(fs.readFileSync(path.join(root,'build/runtime-patches.json'),'utf8'));
export const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');

function entries(manifest){
  if(![1,2].includes(manifest.schemaVersion)||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Invalid WebGAL runtime manifest');
  const names=new Set();
  for(const file of manifest.files){
    if(typeof file.path!=='string'||!file.path.split('/').every(part=>/^[A-Za-z0-9_.-]+$/.test(part)&&part!=='.'&&part!=='..')||names.has(file.path))throw Error('Invalid or duplicate runtime path: '+file.path);
    names.add(file.path);
    if(file.external!==undefined&&!/^[A-Za-z][A-Za-z0-9]*$/.test(file.external))throw Error('Invalid external runtime input: '+file.path);
    for(const phase of ['source','output']){
      if(!/^[0-9a-f]{64}$/.test(file[phase+'Sha256'])||!Number.isSafeInteger(file[phase+'Size'])||file[phase+'Size']<0)throw Error('Invalid runtime integrity record: '+file.path);
    }
  }
  if(!manifest.bundle||!names.has(manifest.bundle.path)||!Array.isArray(manifest.bundle.patches)||typeof manifest.bundle.append!=='string')throw Error('Invalid WebGAL bundle patch manifest');
  if(manifest.styles&&(!names.has(manifest.styles.path)||!Array.isArray(manifest.styles.patches)||typeof manifest.styles.append!=='string'))throw Error('Invalid runtime CSS patch manifest');
  return manifest.files;
}

function plainFile(base,relative){
  let current=base;
  const parts=relative.split('/');
  for(let index=0;index<parts.length;index++){
    current=path.join(current,parts[index]);
    const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()||(index===parts.length-1?!stat.isFile():!stat.isDirectory()))throw Error('Runtime input must be a regular file beneath its source directory: '+relative);
  }
  return current;
}

function checkBytes(bytes,file,phase){
  if(bytes.length!==file[phase+'Size']||sha256(bytes)!==file[phase+'Sha256'])throw Error('WebGAL '+phase+' integrity mismatch: '+file.path);
}

export function transformBundle(text,bundle=runtimeManifest.bundle){
  for(const patch of bundle.patches){
    if(typeof patch.find!=='string'||patch.find.length===0||typeof patch.replace!=='string')throw Error('Invalid bundle patch: '+patch.id);
    const at=text.indexOf(patch.find);
    if(at<0||text.indexOf(patch.find,at+1)>=0)throw Error('WebGAL patch anchor must occur exactly once: '+patch.id);
    text=text.slice(0,at)+patch.replace+text.slice(at+patch.find.length);
  }
  // Preserve the published runtime byte-for-byte: its original bundle body
  // was written with CRLF, while the final probe additions contain mixed EOLs.
  if(bundle.bodyNewlines==='crlf')text=text.replace(/\r?\n/g,'\r\n');
  else if(bundle.bodyNewlines!==undefined)throw Error('Unsupported bundle newline mode');
  return text+bundle.append;
}

export function validateRuntimeSource(sourceDirectory,manifest=runtimeManifest,options={}){
  const source=path.resolve(sourceDirectory);
  if(!fs.lstatSync(source).isDirectory()||fs.lstatSync(source).isSymbolicLink())throw Error('WebGAL source must be a regular directory');
  return entries(manifest).map(file=>{
    const external=file.external?options.externalFiles?.[file.external]:null;
    if(file.external&&!external)throw Error('Missing pinned external runtime input: '+file.external);
    const original=fs.readFileSync(external?plainFile(path.dirname(path.resolve(external)),path.basename(external)):plainFile(source,file.path));
    const legacyBundle=options.legacy&&file.path===manifest.bundle.path;
    checkBytes(original,file,legacyBundle?'output':'source');
    const transform=file.path===manifest.bundle.path&&!legacyBundle?manifest.bundle:file.path===manifest.styles?.path?manifest.styles:null;
    const output=transform?Buffer.from(transformBundle(original.toString('utf8'),transform),'utf8'):original;
    checkBytes(output,file,'output');
    return {file,output};
  });
}

function walkFiles(directory,prefix=''){
  const found=[];
  for(const name of fs.readdirSync(directory)){
    const relative=prefix?prefix+'/'+name:name,full=path.join(directory,name),stat=fs.lstatSync(full);
    if(stat.isSymbolicLink())throw Error('Symbolic link in runtime output: '+relative);
    if(stat.isDirectory())found.push(...walkFiles(full,relative));
    else if(stat.isFile())found.push(relative);
    else throw Error('Non-regular runtime output: '+relative);
  }
  return found.sort();
}

export function verifyRuntimeOutput(outputDirectory,manifest=runtimeManifest){
  const files=entries(manifest),output=path.resolve(outputDirectory),stat=fs.lstatSync(output);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Runtime output must be a regular directory');
  const expected=files.map(file=>file.path).sort(),actual=walkFiles(output);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('WebGAL output file set differs from the pinned runtime');
  for(const file of files)checkBytes(fs.readFileSync(plainFile(output,file.path)),file,'output');
  return files.length;
}

function nested(parent,child){
  const relative=path.relative(parent,child);
  return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
}

export function prepareRuntime(sourceDirectory,outputDirectory,manifest=runtimeManifest,options={}){
  const source=path.resolve(sourceDirectory),output=path.resolve(outputDirectory);
  if(nested(source,output)||nested(output,source))throw Error('WebGAL source and output directories must not overlap');
  // Validate every input and output byte before touching the destination.
  const prepared=validateRuntimeSource(source,manifest,options);
  if(fs.existsSync(output)){
    const stat=fs.lstatSync(output);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Runtime output must be a regular directory');
    if(fs.readdirSync(output).length){
      try{verifyRuntimeOutput(output,manifest);return {files:prepared.length,reused:true};}
      catch(error){throw Error('Runtime output is not empty and does not match the pinned snapshot; clean the staging directory first. '+error.message);}
    }
  }
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const temporary=fs.mkdtempSync(path.join(path.dirname(output),'.webgal-runtime-'));
  try{
    for(const {file,output:bytes} of prepared){
      const target=path.join(temporary,file.path);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,bytes);
    }
    verifyRuntimeOutput(temporary,manifest);
    if(fs.existsSync(output))fs.rmdirSync(output); // Only an empty destination can be removed.
    fs.renameSync(temporary,output);
  }finally{
    if(fs.existsSync(temporary))fs.rmSync(temporary,{recursive:true,force:true});
  }
  return {files:prepared.length,reused:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length<5||process.argv.length>6||(process.argv[5]!==undefined&&process.argv[5]!=='--legacy')){
    console.error('Usage: node scripts/prepare-webgal-runtime.mjs <extracted-upstream-root> <output-runtime-directory> <pinned-font-file> [--legacy]');
    process.exitCode=1;
  }else{
    try{
      const result=prepareRuntime(process.argv[2],process.argv[3],runtimeManifest,{externalFiles:{sourceHanSans:process.argv[4]},legacy:process.argv[5]==='--legacy'});
      console.log('WebGAL '+runtimeManifest.version+': '+result.files+' pinned runtime files '+(result.reused?'verified':'prepared')+'; export instrumentation preserved; licensed UI font staged.');
    }catch(error){console.error(error.message);process.exitCode=1;}
  }
}

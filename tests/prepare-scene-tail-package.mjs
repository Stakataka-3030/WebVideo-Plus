// CI-only static extraction of the retained compressed release installer.
// The installer entry point is never executed. The existing pinned decoder and
// grouped manifest verifier establish every extracted file's exact identity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readEmbeddedZip} from '../scripts/verify-installer-materials.mjs';
import {expandGroupedEntries} from '../scripts/grouped-payload.mjs';
import {verifyPackageMaterials} from '../scripts/verify-materials.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function assertHosted(env){
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.OS!=='Windows_NT')throw Error('Formal scene-tail payload preparation requires GitHub-hosted Windows. Do not run locally.');
}
export function selectFormalPayload(entries,versions){
 const candidates=[...entries.values()].filter(entry=>/^[^/]+\/MANIFEST\.json$/.test(entry.name));
 if(candidates.length!==1||candidates[0].name!=='webvideo-plus/MANIFEST.json')throw Error('Expected one formal Terre payload manifest');
 const entry=candidates[0],prefix='webvideo-plus/',manifest=JSON.parse(entry.data.toString('utf8').replace(/^\uFEFF/,''));
 if(!entries.has(prefix+'groups.json'))throw Error('The formal scene-tail gate requires the compressed grouped installer, never a Fast development payload');
 if(manifest.version!==versions.productVersion||manifest.kernelVersion!==versions.kernelVersion)throw Error('Formal payload version does not match this source');
 if(!Array.isArray(manifest.files)||!manifest.files.some(file=>file.path==='WebGAL.Video.exe'))throw Error('Formal payload has no kernel record');
 return {prefix,manifest,manifestBytes:entry.data};
}
function inside(target,directory){const relative=path.relative(directory,target);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
export function prepare(installer,destination,evidence,env=process.env){
 assertHosted(env); // Must precede source reads, directory creation or decoder invocation.
 const versions=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
 installer=path.resolve(installer);destination=path.resolve(destination);evidence=path.resolve(evidence);
 const expected=path.join(root,'.build/ci-installer','WebVideo+-Setup-'+versions.productVersion+'.exe');
 if(installer.toLowerCase()!==expected.toLowerCase()||!fs.lstatSync(installer).isFile()||fs.lstatSync(installer).isSymbolicLink())throw Error('Only the retained normal-build installer is accepted');
 if(!inside(destination,path.join(root,'.build/ci-native-fixtures'))||!inside(evidence,path.join(root,'.build/ci-native-tests/scene-tail')))throw Error('Formal scene-tail evidence paths escaped CI directories');
 if(fs.existsSync(destination))throw Error('Formal scene-tail extraction must use a new directory');
 const bytes=fs.readFileSync(installer),entries=readEmbeddedZip(bytes),{prefix,manifest,manifestBytes}=selectFormalPayload(entries,versions);
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.mkdirSync(destination);
 fs.mkdirSync(path.dirname(evidence),{recursive:true});
 const record={status:'RUNNING',source:'retained-formal-installer-payload',installer,installerSha256:hash(bytes),manifestSha256:hash(manifestBytes),packageVersion:manifest.version,kernelVersion:manifest.kernelVersion,installerExecuted:false,sourceCommit:env.GITHUB_SHA||null};
 const save=()=>fs.writeFileSync(evidence,JSON.stringify(record,null,2)+'\n');save();
 try{
  const packageRoot=expandGroupedEntries(entries,prefix,manifest,root,destination);
  verifyPackageMaterials(packageRoot,root);
  const kernelSha256=hash(fs.readFileSync(path.join(packageRoot,'WebGAL.Video.exe')));
  if(kernelSha256!==manifest.files.find(file=>file.path==='WebGAL.Video.exe').sha256)throw Error('Extracted formal kernel identity changed');
  Object.assign(record,{status:'PASS',packageRoot,kernelSha256,verifiedPayloadFiles:manifest.files.length+1,fullManifestVerified:true});save();return record;
 }catch(error){record.status='FAIL';record.error=error.message;save();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==3)throw Error('Usage: node tests/prepare-scene-tail-package.mjs <retained-installer> <new-fixture-directory> <evidence-json>');
 console.log(JSON.stringify(prepare(...args)));
}

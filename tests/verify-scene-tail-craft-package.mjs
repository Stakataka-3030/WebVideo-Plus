// Read-only CI identity check: never executes the Craft installer or host.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readEmbeddedZip} from '../scripts/verify-installer-materials.mjs';
import {assertNoLinks,verifyPackage} from '../craft/installer/transaction.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function assertHosted(env){
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.OS!=='Windows_NT')throw Error('Craft scene-tail identity gate requires GitHub-hosted Windows. Do not run against local packages.');
}
export function verifyCraftPayload(entries,packageRoot,versions){
 const prefix='WebVideoCraft-Setup-'+versions.installerVersion+'/',candidates=[...entries.values()].filter(entry=>/^[^/]+\/MANIFEST\.json$/.test(entry.name));
 if(candidates.length!==1||candidates[0].name!==prefix+'MANIFEST.json')throw Error('Expected one current Craft installer manifest');
 assertNoLinks(packageRoot);
 const manifestPath=path.join(packageRoot,'MANIFEST.json');assertNoLinks(manifestPath);
 const embedded=candidates[0].data,actual=fs.readFileSync(manifestPath);
 if(!embedded.equals(actual))throw Error('Craft package manifest bytes differ from the current installer');
 const manifest=verifyPackage(packageRoot); // Production full-file closure, with no mutable-file exemption.
 if(manifest.version!==versions.productVersion||manifest.installerVersion!==versions.installerVersion||manifest.kernelVersion!==versions.kernelVersion||manifest.kernel!=='WebGAL.Video.exe')throw Error('Craft installer identity/version does not match this source');
 // The production packaging step already verifies this closure. Recheck the
 // current bytes here so the evidence also rejects a later modified EXE.
 const expected=new Map(manifest.files.map(file=>[file.path,file]));
 if(entries.size!==expected.size+1)throw Error('Craft installer payload closure differs from its manifest');
 for(const entry of entries.values()){
  if(!entry.name.startsWith(prefix))throw Error('Unexpected Craft installer payload root');
  const relative=entry.name.slice(prefix.length);if(relative==='MANIFEST.json')continue;
  const file=expected.get(relative);
  if(!file||file.bytes!==entry.data.length||file.sha256!==hash(entry.data))throw Error('Craft installer payload bytes differ from manifest: '+relative);
 }
 const kernelSha256=hash(fs.readFileSync(path.join(packageRoot,manifest.kernel)));
 if(kernelSha256!==expected.get(manifest.kernel).sha256)throw Error('Craft kernel changed during identity verification');
 return {packageRoot:path.resolve(packageRoot),manifestSha256:hash(embedded),kernelSha256,packageVersion:manifest.version,installerVersion:manifest.installerVersion,kernelVersion:manifest.kernelVersion,verifiedPayloadFiles:manifest.files.length+1,fullManifestVerified:true,installerPayloadVerified:true};
}
export function verify(installer,packageRoot,evidence,env=process.env){
 assertHosted(env); // Precedes source/package reads and evidence writes.
 const versions=JSON.parse(fs.readFileSync(path.join(root,'craft/version.json'),'utf8'));
 installer=path.resolve(installer);packageRoot=path.resolve(packageRoot);evidence=path.resolve(evidence);
 const expected=path.join(root,'dist','WebVideoCraft-Setup-'+versions.installerVersion);
 if(packageRoot.toLowerCase()!==expected.toLowerCase()||installer.toLowerCase()!==(expected+'.exe').toLowerCase())throw Error('Only the current complete Craft package and installer are accepted');
 const relative=path.relative(path.join(root,'.build/ci-native-tests/scene-tail'),evidence);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Craft identity evidence escaped CI directory');
 assertNoLinks(installer);assertNoLinks(evidence);
 fs.mkdirSync(path.dirname(evidence),{recursive:true});
 const record={status:'RUNNING',source:'current-craft-installer-payload',installer,installerExecuted:false,sourceCommit:env.GITHUB_SHA||null};
 const save=()=>fs.writeFileSync(evidence,JSON.stringify(record,null,2)+'\n');save();
 try{
  const bytes=fs.readFileSync(installer);record.installerSha256=hash(bytes);
  Object.assign(record,verifyCraftPayload(readEmbeddedZip(bytes),packageRoot,versions),{status:'PASS'});save();return record;
 }catch(error){record.status='FAIL';record.error=error.message;save();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==3)throw Error('Usage: node tests/verify-scene-tail-craft-package.mjs <installer> <package> <evidence-json>');
 console.log(JSON.stringify(verify(...args)));
}

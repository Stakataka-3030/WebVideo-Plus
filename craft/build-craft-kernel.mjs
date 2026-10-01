import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyPackage} from './installer/transaction.mjs';
import {verifyBuildReceipt} from './installer/build-receipt.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),source=path.join(root,'package');
const versions=JSON.parse(fs.readFileSync(path.join(here,'version.json'),'utf8'));
const output=path.join(root,'dist',`WebVideoCraft-Setup-${versions.installerVersion}`),stage=output+'.stage-'+crypto.randomUUID();
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
verifyBuildReceipt(root);
const base=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
fs.copyFileSync(path.join(root,'version.json'),path.join(source,'version.json'));
if(base.productVersion!==versions.baseProductVersion||base.kernelVersion!==versions.baseKernelVersion)throw Error('Craft package requires its declared base product/kernel versions');
const node=path.join(source,'ai-runtime/node.exe');if(digest(node)!==versions.nodeSha256)throw Error('Craft requires the pinned official Node '+versions.nodeVersion+' executable');
fs.mkdirSync(stage,{recursive:true});
try{
 for(const name of ['WebGAL.Video.exe','WebGAL.Video.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','process-guard.exe','CraftInstallerObserver.exe','WebVideoCraft.Launcher.exe','browser','runtime','LICENSE','LICENSES.md','NOTICE.md','licenses','native-source-build.json'])fs.cpSync(path.join(source,name),path.join(stage,name),{recursive:true});
 fs.cpSync(path.join(root,'vendor'),path.join(stage,'vendor'),{recursive:true});
 if(fs.existsSync(path.join(source,'bin')))fs.cpSync(path.join(source,'bin'),path.join(stage,'bin'),{recursive:true});
 fs.copyFileSync(node,path.join(stage,'node.exe'));fs.copyFileSync(path.join(here,'LICENSE-Node-22.20.0.txt'),path.join(stage,'LICENSE-Node.txt'));
 const ai=path.join(stage,'ai-runtime');fs.mkdirSync(ai);
 for(const name of ['worker.mjs','novel-prompt.txt','stage-prompt.txt','package.json','package-lock.json','providers.json','novel-core.mjs','node.exe','node_modules'])fs.cpSync(path.join(source,'ai-runtime',name),path.join(ai,name),{recursive:true});
 fs.copyFileSync(path.join(here,'LICENSE-Node-22.20.0.txt'),path.join(ai,'LICENSE-Node.txt'));
 if(!fs.existsSync(path.join(ai,'node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json')))throw Error('Craft AI feature dependencies are incomplete');
 function copyRuntime(directory,relative=''){
  for(const item of fs.readdirSync(directory,{withFileTypes:true})){const from=path.join(directory,item.name),name=path.posix.join(relative,item.name);if(item.isSymbolicLink())throw Error('Linked Craft source is not allowed');if(item.isDirectory()){if(name==='tests'||name.startsWith('tests/'))continue;copyRuntime(from,name);continue;}if(!/\.(?:mjs|js|json|css|md|ps1|txt|ts)$/.test(item.name)||item.name.startsWith('build-')||item.name==='verify-craft-package.ps1')continue;const to=path.join(stage,'craft',...name.split('/'));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
 }
 copyRuntime(here);fs.writeFileSync(path.join(stage,'version.json'),JSON.stringify(versions,null,2)+'\n');
 const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Linked package input');if(entry.isDirectory())walk(file);else files.push({path:path.relative(stage,file).split(path.sep).join('/'),bytes:fs.statSync(file).size,sha256:digest(file)});}}walk(stage);files.sort((a,b)=>a.path.localeCompare(b.path));
 fs.writeFileSync(path.join(stage,'MANIFEST.json'),JSON.stringify({schemaVersion:1,product:'WebVideo+ Craft',version:versions.productVersion,installerVersion:versions.installerVersion,kernelVersion:versions.kernelVersion,baseProductVersion:versions.baseProductVersion,baseKernelVersion:versions.baseKernelVersion,supportedHosts:versions.supportedHosts,updateObserverValidated:versions.updateObserverValidated===true,sameNameUpdateValidated:versions.sameNameUpdateValidated===true,entry:'craft/launch-injected.mjs',wrapper:'WebVideoCraft.Launcher.exe',node:'node.exe',kernel:'WebGAL.Video.exe',files},null,2)+'\n');verifyPackage(stage);
 // Replace only a previous package whose manifest still proves ownership.
 if(fs.existsSync(output)){verifyPackage(output);const old=output+'.previous-'+crypto.randomUUID();fs.renameSync(output,old);try{fs.renameSync(stage,output);}catch(error){fs.renameSync(old,output);throw error;}fs.rmSync(old,{recursive:true});}else fs.renameSync(stage,output);
 console.log(`${output}\n${files.length} verified files`);
}finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true});}

// Build-time provenance, not a signature or a claim about arbitrary binaries.
// Root build.ps1 writes this immediately after successfully compiling its inputs.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inputs(root){
 const files=['build.ps1','version.json','native.manifest',...(fs.existsSync(path.join(root,'WebVideo+_icon.ico'))?['WebVideo+_icon.ico']:[]),'character-map.factory.json','preset-effects.factory.json','ai-providers.factory.json','anogo-actions.factory.json','filter-presets.factory.json',...fs.readdirSync(path.join(root,'src')).filter(n=>n.endsWith('.cs')).map(n=>'src/'+n)].sort();
 return Object.fromEntries(files.map(name=>[name,digest(path.join(root,name))]));
}
function references(root){return Object.fromEntries(['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll'].map(name=>[name,digest(path.join(root,'package',name))]));}
export function writeBuildReceipt(root=sourceRoot){const pkg=path.join(root,'package'),receipt={schemaVersion:1,kernelSha256:digest(path.join(pkg,'WebGAL.Video.exe')),sources:inputs(root),references:references(root),versions:JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'))};fs.copyFileSync(path.join(root,'version.json'),path.join(pkg,'version.json'));fs.writeFileSync(path.join(pkg,'native-source-build.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;}
export function verifyBuildReceipt(root=sourceRoot){
 const receipt=JSON.parse(fs.readFileSync(path.join(root,'package/native-source-build.json'),'utf8'));
 if(receipt.schemaVersion!==1||receipt.kernelSha256!==digest(path.join(root,'package/WebGAL.Video.exe'))||JSON.stringify(receipt.sources)!==JSON.stringify(inputs(root))||JSON.stringify(receipt.references)!==JSON.stringify(references(root)))throw Error('Native kernel or compiled inputs changed; run root build.ps1 successfully before Craft packaging');
 const current=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));if(JSON.stringify(receipt.versions)!==JSON.stringify(current))throw Error('Native version metadata changed after build');return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv[2]!=='--write')throw Error('Build receipt writer requires --write after successful native compile');writeBuildReceipt();console.log('Recorded native executable and exact compiled source/reference hashes.');}

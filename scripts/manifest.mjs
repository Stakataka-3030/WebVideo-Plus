import {hashFile,verifyPackageMaterials} from './verify-materials.mjs';
import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(path.dirname(fileURLToPath(import.meta.url))),root=path.join(here,'package'),files=[];
const versions=JSON.parse(fs.readFileSync(path.join(here,'version.json'),'utf8'));const internalAt=process.argv.indexOf('--internal-version'),internalVersion=internalAt>=0?process.argv[internalAt+1]:'';if(internalAt>=0&&!internalVersion)throw Error('--internal-version requires a value');
const stagedVersions={...versions};if(internalVersion)stagedVersions.productInternalVersion=internalVersion;else delete stagedVersions.productInternalVersion;fs.writeFileSync(path.join(root,'version.json'),JSON.stringify(stagedVersions,null,2)+'\n');
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file!==path.join(root,'MANIFEST.json')){files.push({path:path.relative(root,file).replaceAll('\\','/'),...hashFile(file)});}}}
verifyPackageMaterials(root,here);walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
const manifest={product:'WebVideo+',version:versions.productVersion,kernelVersion:versions.kernelVersion,files};if(internalVersion){manifest.internalVersion=internalVersion;manifest.buildChannel='internal';}fs.writeFileSync(path.join(root,'MANIFEST.json'),JSON.stringify(manifest,null,2));console.log('Package manifest: '+files.length+' files'+(internalVersion?' · internal '+internalVersion:''));

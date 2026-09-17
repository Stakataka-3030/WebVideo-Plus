import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'package'),files=[];
const versions=JSON.parse(fs.readFileSync(path.join(here,'version.json'),'utf8'));
fs.copyFileSync(path.join(here,'version.json'),path.join(root,'version.json'));
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file!==path.join(root,'MANIFEST.json')){const bytes=fs.readFileSync(file);files.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(root,'MANIFEST.json'),JSON.stringify({product:'WebVideo+',version:versions.productVersion,kernelVersion:versions.kernelVersion,files},null,2));console.log('Package manifest: '+files.length+' files');

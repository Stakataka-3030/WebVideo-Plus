import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'package'),files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file!==path.join(root,'MANIFEST.json')){const bytes=fs.readFileSync(file);files.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(root,'MANIFEST.json'),JSON.stringify({product:'WebVideo+',version:'0.4.11',kernelVersion:'0.3.15-internal',files},null,2));console.log('Package manifest: '+files.length+' files');

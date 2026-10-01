// Inert native-verifier fixtures: no executable is run.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {install} from '../craft/installer/transaction.mjs';
const home=path.resolve(process.argv[2]),source=path.join(home,'payload');
const files={'node.exe':'inert node','WebGAL.Video.exe':'inert kernel','WebVideoCraft.Launcher.exe':'inert wrapper','craft/launch-injected.mjs':'// inert session'};
for(const [name,data]of Object.entries(files)){const target=path.join(source,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
fs.writeFileSync(path.join(source,'MANIFEST.json'),JSON.stringify({schemaVersion:1,product:'WebVideo+ Craft',version:'test',supportedHosts:[{version:'test-host',sha256:crypto.createHash('sha256').update('inert official host').digest('hex')}],updateObserverValidated:false,sameNameUpdateValidated:false,entry:'craft/launch-injected.mjs',wrapper:'WebVideoCraft.Launcher.exe',node:'node.exe',kernel:'WebGAL.Video.exe',files:Object.entries(files).map(([name,data])=>({path:name,bytes:Buffer.byteLength(data),sha256:crypto.createHash('sha256').update(data).digest('hex')}))}));
const craftExe=path.join(home,'host/webgal-craft.exe');fs.mkdirSync(path.dirname(craftExe));fs.writeFileSync(craftExe,'inert official host');install({packageRoot:source,adapterRoot:path.join(home,'adapter'),craftExe,mode:'same-name',processCheck:()=>false});

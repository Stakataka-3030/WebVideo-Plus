import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
export function safeRelative(value){
 if(typeof value!=='string'||!value||/^[\\/]|[:\x00-\x1f]/.test(value))throw Error('Unsafe grouped payload path');
 const name=value.replaceAll('\\','/');
 if(name.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$|[<>"|?*]/.test(p)))throw Error('Unsafe grouped payload path');
 return name;
}
export function validateGroupListing(text,expected){
 if(text.length>32*1024*1024)throw Error('Group listing is too large');
 const wanted=new Map([...expected].map(([p,n])=>[safeRelative(p).toLowerCase(),n])),seen=new Set();let row={};
 function finish(){
  if(!Object.keys(row).length)return;
  const name=safeRelative(row.Path).toLowerCase();
  if(seen.has(name)||!wanted.has(name)||!/^\d+$/.test(row.Size)||Number(row.Size)!==wanted.get(name))throw Error('Group listing differs from manifest');
  if(row.Attributes!==undefined&&!/^[RAHS]*$/.test(row.Attributes)||row.Folder!==undefined&&row.Folder!=='-'||row.Encrypted!==undefined&&row.Encrypted!=='-'||Object.keys(row).some(k=>/link|reparse/i.test(k)))throw Error('Group contains non-regular or encrypted entries');
  seen.add(name);row={};
 }
 for(const line of text.replaceAll('\r\n','\n').split('\n')){if(!line){finish();continue;}const i=line.indexOf(' = ');if(i<1||Object.hasOwn(row,line.slice(0,i)))throw Error('Invalid group listing');row[line.slice(0,i)]=line.slice(i+3);}finish();
 if(seen.size!==wanted.size)throw Error('Group files missing');
}
export function expandGroupedEntries(entries,prefix,manifest,sourceRoot,temporary){
 const pin=JSON.parse(fs.readFileSync(path.join(sourceRoot,'build/dependencies.lock.json'),'utf8')).installerDecoder;
 const files=['MANIFEST.json','GROUPS.json','installer-support/7z.exe','installer-support/7z.dll','installer-support/License.txt','groups/components.7z','groups/ffmpeg.7z'];
 if(entries.size!==files.length||files.some(p=>!entries.has((prefix+p).toLowerCase())))throw Error('Grouped installer envelope differs from whitelist');
 const get=p=>entries.get((prefix+p).toLowerCase()).data,indexBytes=get('GROUPS.json');
 if(indexBytes.length>65536)throw Error('Group index is too large');
 const index=JSON.parse(indexBytes.toString('utf8').replace(/^\uFEFF/,''));
 if(index.schemaVersion!==1||index.decoderVersion!==pin.version||index.groups?.length!==2||new Set(index.groups.map(g=>g.id)).size!==2)throw Error('Invalid grouped installer version/index');
 const support=path.join(temporary,'decoder'),expanded=path.join(temporary,'expanded');fs.mkdirSync(support);fs.mkdirSync(expanded);
 for(const name of ['7z.exe','7z.dll','License.txt']){const bytes=get('installer-support/'+name);if(hash(bytes)!==pin.files[name])throw Error('Pinned decoder mismatch');fs.writeFileSync(path.join(support,name),bytes);}
 const exe=path.join(support,'7z.exe');
 const media=p=>['bin/ffmpeg.exe','bin/ffprobe.exe'].includes(p.toLowerCase());
 const all=new Map();for(const row of manifest.files){const name=safeRelative(row.path);if(all.has(name.toLowerCase())||!Number.isSafeInteger(row.bytes)||row.bytes<0)throw Error('Invalid expanded manifest');all.set(name.toLowerCase(),row.bytes);}
 for(const id of ['components','ffmpeg']){
  const group=index.groups.find(g=>g.id===id);if(!group||group.path!=='groups/'+id+'.7z')throw Error('Unexpected group path');
  const bytes=get(group.path);if(bytes.length!==group.bytes||hash(bytes)!==group.sha256)throw Error('Group hash mismatch');
  const archive=path.join(temporary,id+'.7z');fs.writeFileSync(archive,bytes);
  const subset=new Map([...all].filter(([name])=>media(name)===(id==='ffmpeg')));
  if(!subset.size||id==='ffmpeg'&&subset.size!==2)throw Error('Unexpected group membership');
  const listing=execFileSync(exe,['l','-slt','-ba','-sccUTF-8','--',archive],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,cwd:support});validateGroupListing(listing,subset);
  execFileSync(exe,['x','-y','-bd','-sccUTF-8','-o'+expanded,'--',archive],{stdio:'pipe',windowsHide:true,maxBuffer:4*1024*1024,cwd:support});
 }
 fs.writeFileSync(path.join(expanded,'MANIFEST.json'),get('MANIFEST.json'));
 function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const p=path.join(directory,entry.name);if(fs.lstatSync(p).isSymbolicLink())throw Error('Expanded payload contains a link');return entry.isDirectory()?walk(p):[p];});}
 const expandedFiles=walk(expanded);if(expandedFiles.length!==manifest.files.length+1)throw Error('Expanded manifest closure mismatch');
 for(const row of manifest.files){const name=safeRelative(row.path),bytes=fs.readFileSync(path.join(expanded,...name.split('/')));if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('Expanded payload hash mismatch: '+name);}
 return expanded;
}

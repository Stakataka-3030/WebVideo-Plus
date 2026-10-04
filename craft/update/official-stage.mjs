import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertNoLinks,readState} from '../installer/transaction.mjs';
import {verifyMinisign} from './minisign.mjs';
// From immutable official Craft v1.0.0-beta.2 tauri.conf.json, blob
// a9d7780bc9ca360b73b0a48396c485cc3a0abbf5. Never accepted from IPC/config/cache.
export const OFFICIAL_ENDPOINT='https://github.com/A-kirami/webgal-craft/releases/latest/download/latest.json';
export const OFFICIAL_PUBLIC_KEY='dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDI1MkFCMjQ3NkI0ODZGNTYKUldSV2IwaHJSN0lxSmRkQUdpSnF3RXZRM1ZRYVdJdjhsTm5tU3FKZWg5VVlrQWNQMXV1aytENFEK';
export const OFFICIAL_HOST_VERSION='1.0.0-beta.2';
export const OFFICIAL_HOST_SHA256='3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d';
export function assertSignedInstallerIdentity(signature,version){
 const files=signature.trustedComment.split('\t').filter(part=>part.startsWith('file:'));
 if(files.length!==1||files[0]!==`file:WebGAL Craft_${version}_x64-setup.exe`)throw Error('Official signed installer product/version/architecture mismatch');
}
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export function compareOfficialVersions(a,b){
 const parse=value=>{if(typeof value!=='string'||value.length>128)throw Error('Invalid official version length');const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value||'');if(!m)throw Error('Invalid official semantic version');const pre=m[4]?.split('.')||[];if(pre.some(x=>/^\d+$/.test(x)&&x.length>1&&x[0]==='0'))throw Error('Invalid official prerelease version');return {core:m.slice(1,4).map(BigInt),pre};};
 const x=parse(a),y=parse(b);for(let i=0;i<3;i++)if(x.core[i]!==y.core[i])return x.core[i]>y.core[i]?1:-1;
 if(!x.pre.length||!y.pre.length)return x.pre.length===y.pre.length?0:x.pre.length?-1:1;
 for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){const l=x.pre[i],r=y.pre[i];if(l===r)continue;if(l===undefined||r===undefined)return l===undefined?-1:1;const ln=/^\d+$/.test(l),rn=/^\d+$/.test(r);if(ln&&rn)return BigInt(l)>BigInt(r)?1:-1;if(ln!==rn)return ln?-1:1;return l>r?1:-1;}return 0;
}
export function officialPlatform(metadata){
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||typeof metadata.version!=='string'||metadata.version.length>128)throw Error('Official update metadata is missing');
 const item=metadata.platforms?.['windows-x86_64-nsis']||metadata.platforms?.['windows-x86_64'];
 if(!item||typeof item.url!=='string'||item.url.length>4096||typeof item.signature!=='string'||item.signature.length>16384)throw Error('Official Windows x86_64 NSIS update is missing');
 assertOfficialUrl(item.url,'asset');return {version:metadata.version.replace(/^v/,''),url:item.url,signature:item.signature,target:'windows-x86_64-nsis'};
}
export function assertOfficialUrl(value,kind,{redirect=false}={}){
 if(typeof value!=='string'||value.length>8192)throw Error('Official URL exceeds limit');const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port)throw Error('Unsafe official update URL');
 const github=u.hostname==='github.com'&&/^\/A-kirami\/webgal-craft\/releases\/(?:latest\/download|download\/[^/]+)\/[^/]+$/.test(u.pathname);
 const api=u.hostname==='api.github.com'&&/^\/repos\/A-kirami\/webgal-craft\/releases\/assets\/[1-9]\d*$/.test(u.pathname);
 if((github&&(kind==='metadata'?u.pathname.endsWith('/latest.json'):/\.exe$/i.test(u.pathname)))||(kind==='asset'&&api)){if(u.search)throw Error('Unexpected official URL query');return u;}
 if(redirect&&u.hostname==='release-assets.githubusercontent.com'&&u.pathname.startsWith('/github-production-release-asset/'))return u;
 throw Error('Official update URL is outside the pinned provider');
}
export async function fetchOfficialBytes(url,{kind='asset',fetchImpl=fetch,signal,maxBytes=128*1024*1024}={}){
 let current=url;
 for(let redirect=0;redirect<=5;redirect++){
  assertOfficialUrl(current,kind,{redirect:redirect>0});const response=await fetchImpl(current,{redirect:'manual',signal,headers:{Accept:kind==='metadata'?'application/json':'application/octet-stream'}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location||redirect===5)throw Error('Official update redirect limit exceeded');current=new URL(location,current).href;continue;}
  if(!response.ok)throw Error('Official update endpoint returned HTTP '+response.status);
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes)){await response.body?.cancel();throw Error('Official update exceeds download limit');}
  const chunks=[];let size=0;if(!response.body)throw Error('Official update body missing');
  for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw Error('Official update exceeds download limit');chunks.push(Buffer.from(chunk));}
  if(!size)throw Error('Official update body is empty');return Buffer.concat(chunks,size);
 }
 throw Error('Official update redirect limit exceeded');
}
export async function stageOfficialUpdate({statePath,version,currentVersion,metadata,signal,fetchImpl=fetch}){
 const state=readState(statePath);
 if(state.ownership.originalSha256!==OFFICIAL_HOST_SHA256||state.host.sha256!==OFFICIAL_HOST_SHA256||state.host.version!==OFFICIAL_HOST_VERSION||currentVersion!==state.host.version)throw Error('Official updater source contract does not match the exact running host');
 const expected=officialPlatform(metadata);if(expected.version!==version||compareOfficialVersions(version,currentVersion)<=0)throw Error('Official update downgrade or version mismatch');
 const deadline=AbortSignal.timeout(90000),bounded=signal?AbortSignal.any([signal,deadline]):deadline;
 const latest=officialPlatform(JSON.parse((await fetchOfficialBytes(OFFICIAL_ENDPOINT,{kind:'metadata',fetchImpl,signal:bounded,maxBytes:1024*1024})).toString('utf8')));
 if(JSON.stringify(latest)!==JSON.stringify(expected))throw Error('Official metadata changed; check and download the update again');
 const bytes=await fetchOfficialBytes(latest.url,{fetchImpl,signal:bounded});if(bytes.length<64||bytes[0]!==0x4d||bytes[1]!==0x5a)throw Error('Official update is not a Windows installer');
 const signature=verifyMinisign(bytes,latest.signature,OFFICIAL_PUBLIC_KEY);assertSignedInstallerIdentity(signature,version);
 const parent=path.join(state.stateDir,'official-update');assertNoLinks(parent);await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'staged-'));assertNoLinks(directory);
 const record={schemaVersion:1,type:'official-craft-installer',installId:state.installId,packageManifestSha256:state.package.manifestSha256,source:OFFICIAL_ENDPOINT,...latest,hostSha256:state.ownership.originalSha256,currentVersion,sha256:sha256(bytes),bytes:bytes.length,algorithm:signature.algorithm,createdAt:new Date().toISOString()};
 try{await fs.writeFile(path.join(directory,'installer.exe.partial'),bytes,{flag:'wx'});await fs.rename(path.join(directory,'installer.exe.partial'),path.join(directory,'installer.exe'));await fs.writeFile(path.join(directory,'receipt.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});if(bounded.aborted)throw bounded.reason;return {directory,record};}
 catch(error){await fs.rm(directory,{recursive:true,force:true});throw error;}
}
export async function verifyOfficialStage(state,directory){
 const parent=path.join(state.stateDir,'official-update');if(path.dirname(path.resolve(directory))!==path.resolve(parent)||!/^staged-[a-zA-Z0-9]+$/.test(path.basename(directory)))throw Error('Official staging directory is outside its owner');assertNoLinks(directory);
 const receipt=path.join(directory,'receipt.json'),installer=path.join(directory,'installer.exe');assertNoLinks(receipt);assertNoLinks(installer);
 const record=JSON.parse(await fs.readFile(receipt,'utf8'));if(record.schemaVersion!==1||record.type!=='official-craft-installer'||record.installId!==state.installId||record.packageManifestSha256!==state.package.manifestSha256||record.source!==OFFICIAL_ENDPOINT||record.hostSha256!==state.ownership.originalSha256||record.hostSha256!==OFFICIAL_HOST_SHA256||record.currentVersion!==OFFICIAL_HOST_VERSION||state.host.version!==OFFICIAL_HOST_VERSION||state.host.sha256!==OFFICIAL_HOST_SHA256||record.target!=='windows-x86_64-nsis'||compareOfficialVersions(record.version,record.currentVersion)<=0)throw Error('Official staging ownership changed');
 assertOfficialUrl(record.url,'asset');const info=await fs.lstat(installer);if(!info.isFile()||!Number.isSafeInteger(record.bytes)||record.bytes<64||record.bytes>128*1024*1024||info.size!==record.bytes||! /^[a-f0-9]{64}$/.test(record.sha256||''))throw Error('Invalid staged official installer size/hash');const bytes=await fs.readFile(installer);if(bytes.length!==record.bytes||sha256(bytes)!==record.sha256)throw Error('Staged official installer changed');assertSignedInstallerIdentity(verifyMinisign(bytes,record.signature,OFFICIAL_PUBLIC_KEY),record.version);return {record,installer};
}
export function cleanOfficialEnvironment(environment){const result={...environment};for(const key of Object.keys(result))if(['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','WEBVIEW2_USER_DATA_FOLDER','WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER'].includes(key.toUpperCase()))delete result[key];return result;}

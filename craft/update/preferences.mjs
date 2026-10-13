import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseCraftVersion,compareCraftVersions} from './own-updates.mjs';
const modes=new Set(['on','next-release','next-major','never']);
const defaults=()=>({schemaVersion:1,product:'craft',mode:'on',baselineVersion:''});
export function validatePreferences(value){
 if(value?.schemaVersion!==1||value.product!=='craft'||!modes.has(value.mode))throw Error('Craft 更新提醒设置无效');
 const baseline=value.mode==='on'?'':String(value.baselineVersion||'');
 if(value.mode==='next-release'||value.mode==='next-major')parseCraftVersion(baseline);
 return {...defaults(),mode:value.mode,baselineVersion:baseline};
}
export function suppressed(preference,latest){
 const p=validatePreferences(preference);if(p.mode==='never')return true;if(p.mode==='on')return false;
 const available=parseCraftVersion(latest),baseline=parseCraftVersion(p.baselineVersion);
 return p.mode==='next-release'?compareCraftVersions(latest,p.baselineVersion)<=0:available[0]<=baseline[0];
}
async function noLinks(file){for(let current=path.resolve(file);;current=path.dirname(current)){try{const item=await fs.lstat(current);if(item.isSymbolicLink()||item.isFile()&&item.nlink!==1)throw Error('Craft 更新提醒路径包含链接');}catch(error){if(error.code!=='ENOENT')throw error;}if(path.dirname(current)===current)return;}}
export class CraftUpdatePreferences {
 constructor(adapterRoot){if(!path.isAbsolute(adapterRoot))throw Error('Craft 偏好目录必须为绝对路径');this.file=path.join(adapterRoot,'state','update-preferences.json');}
 async read(){await noLinks(this.file);try{if((await fs.stat(this.file)).size>4096)throw Error('Craft 更新提醒设置超过大小限制');return validatePreferences(JSON.parse(await fs.readFile(this.file,'utf8')));}catch(error){if(error.code==='ENOENT')return defaults();throw error;}}
 async save({mode,baselineVersion}){const value=validatePreferences({...defaults(),mode,baselineVersion});await noLinks(this.file);await fs.mkdir(path.dirname(this.file),{recursive:true});await noLinks(this.file);const temp=this.file+'.tmp-'+crypto.randomUUID();try{await fs.writeFile(temp,JSON.stringify(value)+'\n',{flag:'wx'});await fs.rename(temp,this.file);}finally{await fs.rm(temp,{force:true});}return value;}
}

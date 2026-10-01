import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
export function stageAiMetadata(source,destination,version){
 const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
 const lock=JSON.parse(fs.readFileSync(path.join(source,'package-lock.json'),'utf8'));
 assert.ok(lock.packages?.[''],'AI lockfile is missing its root package');
 pkg.version=version;
 lock.version=version;
 lock.packages[''].version=version;
 fs.mkdirSync(destination,{recursive:true});
 for(const [name,data] of [['package.json',pkg],['package-lock.json',lock]])fs.writeFileSync(path.join(destination,name),JSON.stringify(data,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const version=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).productVersion;
 assert.ok(version,'version.json is missing productVersion');
 stageAiMetadata(path.join(root,'ai-runtime'),path.join(root,'package/ai-runtime'),version);
}

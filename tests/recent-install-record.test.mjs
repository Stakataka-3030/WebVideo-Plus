import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=fs.readFileSync(path.join(root,'manager/ProductIntegration.cs'),'utf8');
test('manager recent record reads/writes/deletes share the no-recent guard',()=>{
 assert.equal((source.match(/last-install\.json/g)||[]).length,1,'all shared recent path uses stay centralized');
 assert.match(source,/static object ReadRecentInstall\(Func<string> path\)\{if\(App.Arg\("--no-recent"\)=="true"\)return null;return J.TryRead\(path\(\)\);\}/);
 assert.match(source,/static void UpdateRecentInstall\(object config,bool delete,Func<string> path\)\{if\(App.Arg\("--no-recent"\)=="true"\)return;string recent=path\(\);/);
 assert.ok(source.includes('var last=ReadRecentInstall(RecentInstallFile);'));
 assert.ok(source.includes('UpdateRecentInstall(currentConfig,deleteData,RecentInstallFile);'));
 assert.ok(source.includes('else if(App.Arg("--no-recent")!="true")UpdateRecentInstall(J.Read(configFile),false,RecentInstallFile);')); 
});

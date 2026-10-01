// Source guard for the existing opt-out; isolated Windows install/uninstall
// tests additionally hash the actual recent-install record before/after.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../manager/ProductIntegration.cs',import.meta.url),'utf8');
test('keep-data uninstall honors the same no-recent opt-out as install',()=>{
 assert.match(source,/else if\(currentConfig!=null&&App\.Arg\("--no-recent"\)!="true"\)J\.Write\(recent,currentConfig\)/);
 assert.match(source,/else if\(App\.Arg\("--no-recent"\)!="true"\)J\.Write/);
});

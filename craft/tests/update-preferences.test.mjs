import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {CraftUpdatePreferences,suppressed,validatePreferences} from '../update/preferences.mjs';
test('Craft reminder modes compare strict Craft versions without mixing Terre preferences',()=>{
 const p=mode=>({schemaVersion:1,product:'craft',mode,baselineVersion:'1.1.14.0c'});
 assert.equal(suppressed(p('on'),'1.1.14.0c'),false);assert.equal(suppressed(p('never'),'2.0.0.0c'),true);
 assert.equal(suppressed(p('next-release'),'1.1.14.0c'),true);assert.equal(suppressed(p('next-release'),'1.1.15.0c'),false);
 assert.equal(suppressed(p('next-major'),'1.2.0.0c'),true);assert.equal(suppressed(p('next-major'),'2.0.0.0c'),false);
 assert.throws(()=>validatePreferences({...p('next-release'),baselineVersion:'1.3.1'}));assert.throws(()=>validatePreferences({...p('on'),product:'terre'}));
});
test('Craft installer/application share an atomic owned preference file, invalid files fail visibly',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'craft-prefs-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new CraftUpdatePreferences(root);
 assert.equal((await store.read()).mode,'on');await store.save({mode:'next-release',baselineVersion:'1.1.14.0c'});
 assert.equal((await new CraftUpdatePreferences(root).read()).baselineVersion,'1.1.14.0c');
 assert.equal(JSON.parse(await fs.readFile(store.file,'utf8')).product,'craft');
 await fs.writeFile(store.file,'{');await assert.rejects(store.read());assert.equal((await fs.readdir(path.dirname(store.file))).length,1);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const legacy=fs.readFileSync(path.join(root,'tests/fixtures/update-channel/terre-1.1.6-update-check.js'),'utf8');
const modern=fs.readFileSync(path.join(root,'browser/update-check.js'),'utf8');
const stable=fs.readFileSync(path.join(root,'docs/releases/RELEASE_NOTES_1.1.7.md'),'utf8');
const next='<!-- webvideo-compat: {"product":"terre","webgal":["4.6.5"]} -->';
const firstLine=text=>text.split(/\r?\n/)[0];
// Git may materialize text files with CRLF on Windows; compare canonical Git-source text.
const sourceHash=text=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const legacyHash='3217652adbe928a7356021bf0990a2a353ab2719acb1135d72a96c4fe40d561e';
const nextNotes=path.join(root,'docs/releases/RELEASE_NOTES_1.2.0.md');
if(fs.existsSync(nextNotes))assert.equal(firstLine(fs.readFileSync(nextNotes,'utf8')),next);
const craft='<!-- webvideo-compat: {"product":"craft","webgal":["4.6.4","4.6.5"]} -->';
const rows=[{tag_name:'craft-v1.1.8.0c',body:craft},{tag_name:'v1.2.0',body:next},{tag_name:'v1.1.7',body:stable}].map(row=>({...row,draft:false,prerelease:false}));
function load(source){const context={setTimeout,clearTimeout,AbortController,WebVideoUpdateContext:{productVersion:'1.1.6',engineId:'open-webgal.webgal',engineVersion:'4.6.4'},fetch:async()=>{throw Error('offline');}};context.globalThis=context;vm.runInNewContext(source,context);return context.WebVideoUpdates;}
test('archived 1.1.6 browser updater retains canonical published source bytes',()=>{
 assert.equal(sourceHash(legacy),legacyHash);
});
test('release-note headers accept LF and CRLF checkout lines',()=>{
 for(const newline of ['\n','\r\n'])assert.equal(firstLine(next+newline+'# Release'),next);
});
test('archived updater identity accepts CRLF checkout without ignoring source changes',()=>{
 const lf=legacy.replace(/\r\n/g,'\n');
 assert.equal(sourceHash(lf.replace(/\n/g,'\r\n')),legacyHash);
 assert.notEqual(sourceHash(lf+'// changed source\n'),legacyHash);
});
for(const [label,source] of [['published 1.1.6',legacy],['current',modern]]){
 test(`${label} updater keeps legacy464 on1.1.7 and routes465 to1.2.0`,()=>{const updates=load(source);const old=updates.classify(rows,'4.6.4','1.1.6');assert.equal(old.kind,'update');assert.match(old.url,/\/v1\.1\.7$/);assert.equal(updates.classify(rows,'4.6.4','1.1.7').kind,'keep');assert.match(updates.classify(rows,'4.6.5','1.1.6').url,/\/v1\.2\.0$/);assert.ok(!old.url.includes('craft'));});
 test(`${label} updater remains usable offline without advertising a download`,async()=>{const updates=load(source);await updates.check(true);assert.equal(updates.state().phase,'failed');assert.equal(updates.state().url,'');});
 test(`${label} updater ignores draft/prerelease channels`,()=>{const updates=load(source);const data=[...rows,{tag_name:'v99.0.0',body:stable,prerelease:true},{tag_name:'v98.0.0',body:stable,draft:true}];assert.match(updates.classify(data,'4.6.4','1.1.6').url,/\/v1\.1\.7$/);});
}
test('current 4.6.4 documentation never uses repository-wide latest',()=>{for(const file of ['README.md','docs/BUILDING.md','docs/USER_GUIDE.md'])assert.ok(!fs.readFileSync(path.join(root,file),'utf8').includes('/releases/latest'));});
test('generated installer wires pre-action blocking and bounded/stale routing safeguards',()=>{
 const base=fs.readFileSync(path.join(root,'installer/Installer.base.cs'),'utf8'),updates=fs.readFileSync(path.join(root,'installer/Installer.update.cs'),'utf8'),enhancements=fs.readFileSync(path.join(root,'installer/installer-enhancements.mjs'),'utf8');
 assert.ok(base.includes('selectionTicket!=hostSelectionTicket'));assert.ok(base.includes('hostSelectionTicket++;install.Enabled=remove.Enabled=false'));assert.ok(base.includes('if(!busy)RefreshInstallation(true)')); assert.ok(!base.includes('return String.IsNullOrWhiteSpace(target)?null:ResolveTerreSelection(target)'));
 assert.match(updates,/terre.TextChanged[^\n]+updateUrl="";updateAction.Visible=false/);
 assert.match(updates,/if\(ticket!=updateTicket\|\|IsDisposed\)return;updateStatus.Text=host.TerreGuidance/);
 assert.ok(enhancements.includes('InstallerProductRouting.RequireTerre(terre)'));assert.ok(enhancements.includes('InstallerProductRouting.RequireTerre(target)'));
});

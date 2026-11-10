import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
// Run scripts/configure-installer.mjs before this read-only generated-source check.
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('installer/Installer.cs');
test('portable choice is an advanced child, collapsed and unchecked on initial construction',()=>{
 assert.match(source,/advanced\.Controls\.Add\(portableInstall\)/);
 assert.doesNotMatch(source,/(?<!advanced\.)Controls\.Add\(portableInstall\)/);
 assert.match(source,/advanced=new Panel\{[^}]*Visible=false/);
 assert.match(source,/advancedToggle=new CheckBox\{[^}]*\}/);
 assert.doesNotMatch(source,/advancedToggle=new CheckBox\{[^}]*Checked=true/);
 assert.doesNotMatch(source,/portableInstall=new CheckBox\{[^}]*Checked=true/);
 assert.match(source,/if\(advancedToggle.Checked\)\{[\s\S]*?ay=PlaceCheck\(portableInstall,gap,ay,innerWidth,scale\)/);
 assert.doesNotMatch(source,/y=PlaceCheck\(portableInstall,pad,y,width,scale\)/);
});
test('portable settings lock the installation mode and avoid global cleanup',()=>{
 assert.match(source,/canChoosePortableInstall=current.ValidTerre&&!current.Mounted/);
 assert.match(source,/portable=updating\?mounted.Portable:portableInstall.Checked/);
 assert.match(source,/CleanupPayloadCaches\(bool portable\)[\s\S]*?if\(portable\)return/);
 assert.match(source,/new SetupEngine\(ic,Report,!portable\)/);
});
test('FFmpeg commit retry is bounded and preserves a failed rollback location',()=>{
 assert.match(source,/static void MoveMediaDirectory/);
 assert.match(source,/attempt==11/);
 assert.match(source,/MoveMediaDirectory\(backup,target,/);
 assert.match(source,/旧工具目录："\+backup/);
});
test('both runtime modes write session while moved portable plans are invalidated',()=>{
 const lifecycle=read('src/Lifecycle.cs');
 assert.match(lifecycle,/WriteRuntimeSession\(config,terre,session\)/);
 assert.match(lifecycle,/Both installation modes[\s\S]*?J.Write\(session,config\)/);
 const runner=read('src/JobRunner.cs');
 assert.match(runner,/!J.B\(request,"portable"\)\|\|J.S\(planVersion,"workDirectory"\)==dir/);
 assert.match(runner,/EngineAdapter.ValidateRuntimeContract/);
});

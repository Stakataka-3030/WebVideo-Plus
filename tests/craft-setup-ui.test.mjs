// Source wiring checks complement actual C# portable contracts and the native
// inert WinForms harness; they do not claim that Windows layout was exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=read('craft/CraftSetup.cs'),contracts=read('craft/installer/SetupContracts.cs'),paths=read('craft/installer/SetupPaths.cs');
test('Setup captures a request for the background worker and guards repeats and close',()=>{
 assert.match(source,/worker\.DoWork\+=.*operation\(\(CraftSetupRequest\)e\.Argument/);
 const start=source.slice(source.indexOf('Action<string> start='),source.indexOf('install.Click+='));
 assert.match(start,/if\(busy\|\|locating\|\|launching\)return/);
 for(const name of ['Destination=target.Text','Craft=craft.Text','Cache=cache.Text','Mode="same-name"','DesktopShortcut=shortcut.Checked'])assert.ok(start.includes(name),name);
 assert.match(start,/worker\.RunWorkerAsync\(active\)/);assert.doesNotMatch(start,/\bRun\(/);
 assert.match(source,/form\.FormClosing\+=.*if\(busy\|\|launching\).*e\.Cancel=true/);
 const completion=source.slice(source.indexOf('worker.RunWorkerCompleted+='),source.indexOf('Action<string> start='));
 assert.match(completion,/busy=false/);assert.match(completion,/refreshInfo\(\);updateButtons\(\)/);assert.doesNotMatch(completion,/form\.Close\(/);
 assert.match(source,/ProgressBarStyle\.Marquee/);assert.match(source,/elapsed\.Elapsed\.TotalSeconds/);
 assert.doesNotMatch(source,/Application\.DoEvents\s*\(|\.Kill\s*\(|CancelAsync\s*\(/);
});
test('Preparation cancel has an atomic cutover and never kills an installation transaction',()=>{
 assert.match(contracts,/RequestCancel\(\).*lock\(gate\).*if\(mutationStarted\)return false/);
 assert.match(contracts,/BeginMutation\(\).*lock\(gate\).*ThrowIfCancelled\(\);mutationStarted=true/);
 assert.match(source,/request\.BeginMutation\(\);phase/);
 assert.ok(source.indexOf('request.BeginMutation();')<source.indexOf('process.Start();'));
 assert.match(source,/while\(\(count=input\.Read.*request\.ThrowIfCancelled\(\)/);
 assert.match(source,/Verify\(temp,false,message=>\{request\.ThrowIfCancelled\(\)/);
 assert.match(source,/catch\(OperationCanceledException\)/);
 assert.match(source,/Directory\.Delete\(temp,true\).*outcome\.Status="warning"/);
});
test('Setup drains both coordinator pipes and validates typed completion including warning exit',()=>{
 assert.match(source,/StandardOutput\.ReadToEndAsync\(\);process\.BeginErrorReadLine\(\);process\.WaitForExit\(\)/);
 assert.match(source,/CraftSetupProtocol\.ParseResult\(output,process\.ExitCode,request\.Action\)/);
 assert.match(contracts,/status=="warning"&&exitCode==2/);assert.match(contracts,/status=="completed"\|\|status=="unchanged"/);
 assert.match(contracts,/stateStatus=="host-changed"&&warning/);assert.match(contracts,/未完成卸载/);
 assert.match(source,/Guid\.NewGuid\(\).*\.log/);assert.match(source,/failure.Data\["SetupLog"\]=log/);
});
test('Discovery and installed actions do not silently adopt a target or stale selection',()=>{
 assert.match(source,/choices.Length>1.*ChooseCandidate/);assert.match(source,/list.SelectedIndex>=0/);
 assert.match(source,/target.TextChanged\+=.*info=null;updateButtons\(\)/);assert.match(source,/craft.TextChanged\+=.*info=null;updateButtons\(\)/);
 assert.match(source,/finder.RunWorkerCompleted\+=.*\n.*if\(form.IsDisposed\|\|form.Disposing\)return/);
 assert.match(source,/repair.Enabled=.*info.Mode=="same-name"&&info.Status=="installed"&&File.Exists\(info.CraftExe\)/);
 assert.match(source,/matchesRecordedPath=CraftManifestVerifier.Same\(CraftSetupPaths.NormalizeFolder\(craft.Text\),info.CraftExe\)/);
 assert.match(source,/ResolveCraftSelection/);assert.match(paths,/MaxShortcutHops=8/);assert.match(paths,/MaxDiscoveryDirectories=160/);assert.doesNotMatch(paths,/GetLogicalDrives|GetDrives\(/);
});
test('Main layout is scrollable and advanced controls are opt-in without fake data relocation',()=>{
 assert.match(source,/AutoScaleMode=AutoScaleMode.Font,AutoScroll=true/);assert.match(source,/advanced.*Visible=false/);
 assert.match(source,/desktopShortcut.*Checked=false/);assert.match(source,/content.MaximumSize=new Size/);assert.match(source,/control.MaximumSize=new Size/);
 assert.match(source,/action=="uninstall"&&!confirm/);assert.match(source,/不会删除已导出视频或游戏工程/);
 assert.match(source,/不会改变导出工作缓存/);assert.match(source,/CreateDesktopShortcut/);
 assert.match(source,/Hash\(info.LauncherPath\).*wrapperSha256/);assert.match(source,/WorkingDirectory=Path.GetDirectoryName\(info.CraftExe\)/);
});
test('Native helper inputs are present in packaging, native harness and source preflight',()=>{
 for(const file of ['craft/build-craft-package.ps1','craft/tests/setup-gui.test.ps1','craft/installer/check-source-inputs.mjs'])for(const helper of ['SetupPaths.cs','SetupContracts.cs'])assert.ok(read(file).includes(helper),`${file}: ${helper}`);
});
test('Craft adapter native metadata stays aligned with its version source',()=>{
 const versions=JSON.parse(read('craft/version.json'));
 for(const name of ['CraftSetup.cs','CraftStarter.cs']){
  const native=read('craft/'+name);
  for(const attr of ['AssemblyVersion','AssemblyFileVersion'])assert.ok(native.includes(attr+'("'+versions.fileVersion+'")'));
  assert.ok(native.includes('AssemblyInformationalVersion("'+versions.installerVersion+'")'));
 }
});

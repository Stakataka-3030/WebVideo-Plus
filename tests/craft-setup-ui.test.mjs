// Portable contracts complement (not replace) craft/tests/setup-gui.test.ps1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../craft/CraftSetup.cs',import.meta.url),'utf8');
test('Craft Setup dispatches captured inputs to a background worker and guards close/repeat',()=>{
 assert.match(source,/worker\.DoWork\+=.*operation\(request\[0\],request\[1\],request\[2\],request\[3\]/);
 const start=source.slice(source.indexOf('Action<string> start='),source.indexOf('// Closing an active installer'));
 assert.match(start,/if\(busy\)return/);assert.match(start,/var request=new\[\]\{action,target\.Text,craft\.Text,sameName\.Checked/);
 assert.match(start,/worker\.RunWorkerAsync\(request\)/);assert.doesNotMatch(start,/\bRun\(/);
 assert.match(source,/form\.FormClosing\+=.*if\(busy\).*e\.Cancel=true/);
 for(const control of ['craft','target','browseCraft','browseTarget','sameName','recover','install','remove'])assert.ok(source.match(/var inputs=new Control\[\]\{([^}]+)\}/)[1].split(',').includes(control));
 assert.match(source,/worker\.ProgressChanged\+=/);assert.match(source,/worker\.RunWorkerCompleted\+=/);
 assert.match(source,/finally\{busy=false;foreach\(var input in inputs\)input\.Enabled=true/);
 assert.match(source,/finally\{busy=false;form\.Close\(\)/);
 assert.match(source,/ProgressBarStyle\.Marquee/);assert.match(source,/elapsed\.Elapsed\.TotalSeconds/);
 assert.doesNotMatch(source,/\bApplication\.DoEvents\s*\(|\.Kill\s*\(|CancelAsync\s*\(/);
});
test('Craft Setup retains verified temporary coordinator, simultaneous pipe draining and CLI failure exit',()=>{
 assert.match(source,/Extract\(temp\)/);assert.match(source,/CraftManifestVerifier\.Verify\(temp\)/);
 assert.match(source,/StandardOutput\.ReadToEndAsync\(\);var stderr=process\.StandardError\.ReadToEndAsync\(\);process\.WaitForExit\(\)/);
 assert.match(source,/Task\.WaitAll\(stdout,stderr\)/);assert.match(source,/process\.ExitCode!=0/);
 assert.match(source,/args\.Contains\("--dest"\).*catch\(Exception e\)\{WriteError\(e\);return 1;/);
 assert.match(source,/finally\{report\("正在清理临时安装文件…"\);try\{Directory\.Delete\(temp,true\)/);
});
test('Craft adapter native metadata stays aligned with its version source',()=>{
 const versions=JSON.parse(fs.readFileSync(new URL('../craft/version.json',import.meta.url)));
 for(const name of ['CraftSetup.cs','CraftStarter.cs']){
  const native=fs.readFileSync(new URL('../craft/'+name,import.meta.url),'utf8');
  for(const attr of ['AssemblyVersion','AssemblyFileVersion'])assert.ok(native.includes(attr+'("'+versions.fileVersion+'")'));
  assert.ok(native.includes('AssemblyInformationalVersion("'+versions.installerVersion+'")'));
 }
});

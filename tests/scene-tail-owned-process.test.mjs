import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('owned process lifecycle uses real hidden concurrent console processes, never a graphical host',{skip:process.platform!=='win32',timeout:45000},()=>{
 const result=spawnSync('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./scene-tail-owned-process.test.ps1',import.meta.url)),'-NodePath',process.execPath],{encoding:'utf8',windowsHide:true,timeout:40000,maxBuffer:1024*1024});
 assert.ifError(result.error);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 const row=result.stdout.trim().split(/\r?\n/).find(line=>line.startsWith('{'));assert.ok(row,result.stdout);
 const report=JSON.parse(row);assert.equal(report.status,'PASS');assert.equal(report.checks,20);assert.equal(report.graphicsExecuted,false);
});
test('native gate has no PID-based cleanup or swallowed cleanup exceptions and exits only after assertions',()=>{
 const native=fs.readFileSync(new URL('./scene-only-tail-native.ps1',import.meta.url),'utf8');
 const helper=fs.readFileSync(new URL('./scene-tail-owned-process.ps1',import.meta.url),'utf8');
 assert.doesNotMatch(native+'\n'+helper,/taskkill|catch\s*\{\s*\}/i);
 assert.match(native,/Complete-SceneTailOwnedProcesses \$renderProcesses \$renderFailure/);
 assert.match(helper,/\$process.Kill\(\$true\)/);assert.match(helper,/WindowStyle Hidden/);
 assert.match(native,/PASS hosted native scene-tail parity[\s\S]+exit 0[\s\S]+Write-Error -ErrorRecord \$_ -ErrorAction Continue[\s\S]+exit 1/);
 assert.match(native,/if\(\$max -gt 4\)/);assert.match(native,/\(Get-FileHash \$pcmFull\).Hash -ne \(Get-FileHash \$pcmShort\).Hash/);
});

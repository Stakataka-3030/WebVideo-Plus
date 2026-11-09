# Real hidden console-process regressions only. No browser, drawing or native gate execution.
param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$run=Join-Path ([IO.Path]::GetTempPath()) ('scene-tail-process-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run|Out-Null
. (Join-Path $PSScriptRoot 'scene-tail-owned-process.ps1')
$checks=0;$all=@();$rescues=@();$testFailure=$null
function Check($Condition,[string]$Message){$script:checks++;if(-not $Condition){throw $Message}}
function Q($Value){return '"'+$Value+'"'}
function Put([string]$Name,[string]$Text){[IO.File]::WriteAllText((Join-Path $run $Name),$Text,[Text.UTF8Encoding]::new($false))}
function Start-Fixture([string]$Name,[string]$Script){$owned=Start-SceneTailOwnedProcess $NodePath @((Q (Join-Path $run $Script))) $Name $run;$script:all+=$owned;return $owned}
Put 'success.js' 'setTimeout(()=>process.exit(0),60);'
Put 'parallel.js' "const fs=require('fs'),path=require('path');const timer=setInterval(()=>{if(fs.existsSync(path.join(__dirname,'parallel-release.txt'))){clearInterval(timer);process.exit(0);}},10);"
Put 'failure.js' 'setTimeout(()=>process.exit(7),60);'
Put 'wait.js' 'setInterval(()=>{},1000);'
Put 'tree.js' "const fs=require('fs'),path=require('path'),cp=require('child_process');const p=cp.spawn(process.execPath,[path.join(__dirname,'wait.js')],{windowsHide:true,stdio:'ignore'});fs.writeFileSync(path.join(__dirname,'child-pid.txt'),String(p.pid));setInterval(()=>{},1000);"
try{
 $one=Start-Fixture 'parallel-one' 'parallel.js';$two=Start-Fixture 'parallel-two' 'parallel.js'
 Check ($one.ProcessId-gt0-and$two.ProcessId-gt0-and$one.ProcessId-ne$two.ProcessId-and-not$one.Process.WaitForExit(0)-and-not$two.Process.WaitForExit(0)) 'Concurrent fixtures need distinct valid owned IDs and must both be alive before release'
 Put 'parallel-release.txt' 'release both owned console workers'
 Wait-SceneTailOwnedProcess $one 5000;Wait-SceneTailOwnedProcess $two 5000
 Check ($one.ExitObserved-and$two.ExitObserved-and-not$one.Disposed-and-not$two.Disposed) 'Wait must retain handles until group cleanup'
 Complete-SceneTailOwnedProcesses @($one,$two)
 Check ($one.Disposed-and$two.Disposed-and-not$one.KillAttempted-and-not$two.KillAttempted) 'Successful completed workers must never be killed'
 Complete-SceneTailOwnedProcesses @($one,$two)
 Check ($null-eq$one.Process-and$null-eq$two.Process) 'Repeated cleanup must not access disposed objects'
 $failed=Start-Fixture 'failure' 'failure.js';$sibling=Start-Fixture 'failure-sibling' 'wait.js';$failure=$null
 try{Wait-SceneTailOwnedProcess $failed 5000}catch{$failure=$_}
 Check ($null-ne$failure-and$failed.ExitCode-eq7) 'Nonzero actual console exit must fail the wait'
 $message='';try{Complete-SceneTailOwnedProcesses @($failed,$sibling) $failure}catch{$message=$_.Exception.Message}
 Check ($message-match'exit=7'-and$failed.Disposed-and-not$failed.KillAttempted) 'Original nonzero exit must survive cleanup without killing the finished worker'
 Check ($sibling.Disposed-and$sibling.ExitObserved-and$sibling.KillAttempted) 'A still-running owned sibling must be stopped and disposed'
 $started=Start-Fixture 'before-start-failure' 'wait.js';$failure=$null
 try{Start-SceneTailOwnedProcess (Join-Path $run 'does-not-exist.exe') @('unused') 'start-failure' $run}catch{$failure=$_}
 Check ($null-ne$failure) 'Missing second executable must exercise a real start failure'
 $message='';try{Complete-SceneTailOwnedProcesses @($started) $failure}catch{$message=$_.Exception.Message}
 Check ($message-and$started.Disposed-and$started.KillAttempted) 'A second start failure must not leak the already-running owned process'
 $tree=Start-Fixture 'timeout-tree' 'tree.js';$watch=[Diagnostics.Stopwatch]::StartNew();$pidFile=Join-Path $run 'child-pid.txt'
 $childId=0
 while($childId-le0){if($watch.ElapsedMilliseconds-gt5000){throw 'Console child fixture did not become ready'};if(Test-Path -LiteralPath $pidFile){$raw=[IO.File]::ReadAllText($pidFile);if($raw-match'^[1-9][0-9]*$'){$childId=[int]$raw}};if($childId-le0){Start-Sleep -Milliseconds 10}}
 $child=[Diagnostics.Process]::GetProcessById($childId);$null=$child.Handle;$rescues+=$child
 $failure=$null;try{Wait-SceneTailOwnedProcess $tree 50}catch{$failure=$_}
 Check ($null-ne$failure-and$failure.Exception.Message-match'timed out') 'Actual running console process must exercise timeout'
 $message='';try{Complete-SceneTailOwnedProcesses @($tree) $failure}catch{$message=$_.Exception.Message}
 Check ($message-match'timed out'-and$tree.KillAttempted-and$tree.Disposed) 'Timeout remains a failure after successful exact owned-tree cleanup'
 Check ($child.WaitForExit(5000)) 'Owned child process must also exit after tree cleanup'
 # Deliberately break one real owned handle to ensure cleanup cannot swallow
 # an invalid lifecycle. The separately held handle is for this fixture only.
 $broken=Start-Fixture 'broken-owned-handle' 'wait.js';$rescue=[Diagnostics.Process]::GetProcessById($broken.ProcessId);$null=$rescue.Handle;$rescues+=$rescue
 $peer=Start-Fixture 'cleanup-peer' 'wait.js';$broken.Process.Dispose()
 $message='';try{Complete-SceneTailOwnedProcesses @($broken,$peer) $failure}catch{$message=$_.Exception.Message}
 Check ($message-match'timed out'-and$message-match'Cleanup failed for owned broken-owned-handle pid=\d+') 'Primary and cleanup failures must both be reported with owned identity'
 Check ($broken.CleanupError-and-not$broken.Disposed) 'A cleanup failure must not be reported as disposed success'
 Check ($peer.Disposed-and$peer.KillAttempted) 'Cleanup must still visit remaining owned processes after another cleanup fails'
 if(-not$rescue.WaitForExit(0)){$rescue.Kill($true)};Check ($rescue.WaitForExit(5000)) 'Explicitly retained test-only rescue handle must finish cleanup'
 # Test PowerShell caller exit-code semantics with the same checked lifecycle,
 # not the graphical script. The native gate itself is parsed, never executed.
 $helper=(Join-Path $PSScriptRoot 'scene-tail-owned-process.ps1').Replace("'","''")
 $driver=@'
param([string]$Node,[string]$Script,[string]$Directory,[string]$Name)
$ErrorActionPreference='Stop'
. 'HELPER'
try{Invoke-SceneTailCheckedProcess $Node @('"'+$Script+'"') $Name $Directory 5000;exit 0}catch{Write-Error -ErrorRecord $_ -ErrorAction Continue;exit 1}
'@
 Put 'driver.ps1' ($driver.Replace('HELPER',$helper))
 $global:LASTEXITCODE=91
 & (Join-Path $run 'driver.ps1') $NodePath (Join-Path $run 'success.js') $run 'exit-success'
 Check ($LASTEXITCODE-eq0) 'Successful complete script must replace stale caller exit code with zero'
 & (Join-Path $run 'driver.ps1') $NodePath (Join-Path $run 'failure.js') $run 'exit-failure' 2> (Join-Path $run 'expected-failure.log')
 Check ($LASTEXITCODE-eq1) 'Failed checked script must publish a nonzero caller exit code'
 $tokens=$null;$errors=$null;$native=Join-Path $PSScriptRoot 'scene-only-tail-native.ps1'
 $ast=[Management.Automation.Language.Parser]::ParseFile($native,[ref]$tokens,[ref]$errors)
 Check ($errors.Count-eq0) 'Native gate AST must parse without running it'
 $exits=@($ast.FindAll({param($n)$n-is[Management.Automation.Language.ExitStatementAst]},$true)|ForEach-Object {$_.Pipeline.Extent.Text})
 Check ($exits-contains'0'-and$exits-contains'1') 'Native gate needs explicit success and failure exit contracts'
}catch{$testFailure=$_}
finally{
 $cleanup=@()
 foreach($owned in $all){if(-not$owned.Disposed-and-not$owned.CleanupError){try{Close-SceneTailOwnedProcess $owned}catch{$cleanup+=$_.Exception.Message}}}
 foreach($process in $rescues){try{if(-not$process.WaitForExit(0)){$process.Kill($true)};if(-not$process.WaitForExit(5000)){throw 'Fixture rescue did not exit'};$process.Dispose()}catch{$cleanup+=$_.Exception.Message}}
 if($cleanup.Count){throw ('Console regression cleanup failed: '+($cleanup-join'; '))}
}
if($testFailure){Write-Error -ErrorRecord $testFailure -ErrorAction Continue;exit 1}
[pscustomobject]@{status='PASS';checks=$checks;graphicsExecuted=$false;evidence=$run}|ConvertTo-Json -Compress
exit 0

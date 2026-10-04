param([string]$EvidenceRoot)
$ErrorActionPreference='Stop'
# Windows-only inert fixtures. No Craft/NSIS installer, real registry value,
# production process, credentials or existing project is touched.
if(!$EvidenceRoot){$EvidenceRoot=Join-Path ([IO.Path]::GetTempPath()) ('WebVideoCraft-clean-handoff-'+[Guid]::NewGuid().ToString('N'))}
if(Test-Path -LiteralPath $EvidenceRoot){throw 'Evidence root must be new'}
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path $compiler)){throw '64-bit .NET Framework compiler is required'}
$fixtures=@'
using System;using System.IO;using System.Diagnostics;using System.Threading;using System.Web.Script.Serialization;
class FixtureHost {static int Main(string[] a){for(int i=0;i<2400&&!File.Exists(a[0]);i++)Thread.Sleep(25);return 0;}}
class FixtureWrapper {static int Main(string[] a){using(var host=Process.Start(new ProcessStartInfo(a[0],"\""+a[1]+"\""){UseShellExecute=false,CreateNoWindow=true})){File.WriteAllText(a[2],host.Id.ToString());for(int i=0;i<800&&!File.Exists(a[3]);i++)Thread.Sleep(25);return 0;}}}
class FixtureInstaller {static int Main(string[] a){if((a.Length!=6&&a.Length!=7)||a[0]!="/P"||a[1]!="/R"||a[2]!="/UPDATE"||a[3]!="/ARGS")return 8;var json=new JavaScriptSerializer();File.WriteAllText(a[4],json.Serialize(new{args=a,debug=Environment.GetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"),profile=Environment.GetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER"),pipe=Environment.GetEnvironmentVariable("WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER"),at=DateTime.UtcNow.ToString("o")}));Thread.Sleep(a.Length==7?Int32.Parse(a[6]):600);File.WriteAllText(a[4]+".finished","normal fixture completion");return Int32.Parse(a[5]);}}
class FixtureLauncher {static int Main(string[] a){int checks=0;return OfficialInstallerLauncher.Run(a,(craft,version)=>{string root=Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);if(!Path.GetFullPath(craft).StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Test-only target outside evidence root");if(++checks==2&&Path.GetFileName(Path.GetDirectoryName(a[4]))=="cancel-during-final-preflight"){File.WriteAllText(Path.Combine(Path.GetDirectoryName(a[4]),"preflight.entered"),"fixture only");Thread.Sleep(1500);}});}}
'@
$fixtureSource=Join-Path $EvidenceRoot 'Fixtures.cs';[IO.File]::WriteAllText($fixtureSource,$fixtures,[Text.UTF8Encoding]::new($false))
$source=Join-Path $PSScriptRoot '../update/OfficialInstallerLauncher.cs'
foreach($name in @('FixtureHost','FixtureWrapper','FixtureInstaller','FixtureLauncher')){
 $out=Join-Path $EvidenceRoot ($name+'.exe');& $compiler /nologo /target:exe /platform:x64 /optimize+ ('/main:'+$name) ('/out:'+$out) /r:System.Web.Extensions.dll $source $fixtureSource
 if($LASTEXITCODE-ne 0){throw ('Cannot compile '+$name)}
}
function Q([string]$value){return '"'+[regex]::Replace([regex]::Replace($value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'}
$results=@()
foreach($case in @(@{name='success';code=0},@{name='installer-failure';code=5},@{name='tampered-installer';code=0;tamper=$true},@{name='host-still-running';code=0;holdHost=$true},@{name='cancel-after-commit';code=0;cancelBeforeClose=$true},@{name='host-close-grace';code=0;holdHost=$true;closeGrace=$true;seconds=40;waitMs=45000},@{name='cancel-after-observed';code=0;cancelObserved=$true;installerDelay=2000},@{name='cancel-during-final-preflight';code=0;cancelPreflight=$true})){
 $directory=Join-Path $EvidenceRoot $case.name;New-Item -ItemType Directory -Path $directory|Out-Null
 $hostExit=Join-Path $directory 'host.exit';$release=Join-Path $directory 'wrapper.release';$pidFile=Join-Path $directory 'host.pid';$marker=Join-Path $directory 'installer-result.json'
 $installer=Join-Path $directory 'fixture-installer.exe';Copy-Item (Join-Path $EvidenceRoot 'FixtureInstaller.exe') $installer
 $hash=(Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant();if($case.tamper){[IO.File]::AppendAllText($installer,'changed')}
 $wrapper=$null;$hostProcess=$null;$helper=$null
 try{
  $wrapper=Start-Process (Join-Path $EvidenceRoot 'FixtureWrapper.exe') -ArgumentList @((Q (Join-Path $EvidenceRoot 'FixtureHost.exe')),(Q $hostExit),(Q $pidFile),(Q $release)) -PassThru
  $until=(Get-Date).AddSeconds(5);while(!(Test-Path $pidFile)-and (Get-Date)-lt $until){Start-Sleep -Milliseconds 25};if(!(Test-Path $pidFile)){throw 'Fixture host failed to start'}
  $hostProcess=Get-Process -Id ([int](Get-Content $pidFile -Raw))
  $seconds=if($case.seconds){[string]$case.seconds}else{'7'};$waitMs=if($case.waitMs){[int]$case.waitMs}else{10000};$forwarded=@($marker,[string]$case.code);if($case.installerDelay){$forwarded+=,[string]$case.installerDelay}
  $arguments=@($hostProcess.Id,$wrapper.Id,(Join-Path $EvidenceRoot 'FixtureHost.exe'),(Join-Path $EvidenceRoot 'FixtureWrapper.exe'),$installer,$hash,'1.0.0-beta.2','1.0.1',$seconds,($forwarded|ConvertTo-Json -Compress))
  $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=Join-Path $EvidenceRoot 'FixtureLauncher.exe';$start.Arguments=($arguments|ForEach-Object {Q ([string]$_)})-join ' ';$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']='synthetic-debug-value';$start.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER']='synthetic-profile-value';$start.EnvironmentVariables['WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER']='synthetic-pipe-value'
  $helper=New-Object Diagnostics.Process;$helper.StartInfo=$start;[void]$helper.Start();$events=@()
  $first=$helper.StandardOutput.ReadLine()|ConvertFrom-Json;$events+=,$first;if($first.state-ne 'armed'){throw ('Helper did not arm: '+($first|ConvertTo-Json -Compress))}
  if(Test-Path $marker){throw 'Installer started before commit'}
  [IO.File]::WriteAllText($release,'release');$released=$helper.StandardOutput.ReadLine()|ConvertFrom-Json;$events+=,$released;if($released.state-ne 'wrapper-exited'){throw 'Owned wrapper exit not confirmed'}
  $commitWatch=[Diagnostics.Stopwatch]::StartNew();$helper.StandardInput.WriteLine('commit');$helper.StandardInput.Flush();$committed=$helper.StandardOutput.ReadLine()|ConvertFrom-Json;$events+=,$committed;if($committed.state-ne 'committed'){throw 'Native commit acknowledgement missing'}
  if(Test-Path $marker){throw 'Installer started while owned host is alive'}
  if($case.cancelBeforeClose){$helper.StandardInput.WriteLine('cancel');$helper.StandardInput.Flush();$cancelled=$helper.StandardOutput.ReadLine()|ConvertFrom-Json;$events+=,$cancelled;if($cancelled.state-ne 'not-started'-or $cancelled.launchAttempted-ne $false){throw 'Prelaunch cancellation was not confirmed'}}
  if(!$case.holdHost){[IO.File]::WriteAllText($hostExit,'close normally')}
  if($case.cancelPreflight){$entered=Join-Path $directory 'preflight.entered';$until=(Get-Date).AddSeconds(5);while(!(Test-Path $entered)-and (Get-Date)-lt $until){Start-Sleep -Milliseconds 10};if(!(Test-Path $entered)){throw 'Final test preflight did not run'};$helper.StandardInput.WriteLine('cancel');$helper.StandardInput.Flush()}
  if($case.cancelObserved){$observed=$helper.StandardOutput.ReadLine()|ConvertFrom-Json;$events+=,$observed;if($observed.state-ne 'observed'){throw 'Expected actual inert installer observation before cancellation'};$helper.StandardInput.WriteLine('cancel');$helper.StandardInput.Flush()}
  if(!$helper.WaitForExit($waitMs)){throw 'Clean helper exceeded bounded lifetime'}
  foreach($line in ($helper.StandardOutput.ReadToEnd()-split "`r?`n")){if($line){$events+=,($line|ConvertFrom-Json)}}
  $commitWatch.Stop();$last=$events[-1];$result=if(Test-Path $marker){Get-Content $marker -Raw|ConvertFrom-Json}else{$null}
  $passed=if($case.tamper-or $case.holdHost-or $case.cancelBeforeClose-or $case.cancelPreflight){$last.state-eq 'not-started'-and $last.launchAttempted-eq $false-and $null-eq $result}else{$last.state-eq 'exited'-and $last.exitCode-eq $case.code-and $null-ne $result-and $null-eq $result.debug-and $null-eq $result.profile-and $null-eq $result.pipe}
  if($case.closeGrace){$passed = $passed -and $last.reason -match '30 seconds' -and $commitWatch.ElapsedMilliseconds -ge 30000 -and $commitWatch.ElapsedMilliseconds -lt 45000}
  if($case.cancelObserved){$passed = $passed -and (Test-Path ($marker+'.finished')) -and $last.exitCode -eq 0}
  $results+=@{elapsedAfterCommitMs=$commitWatch.ElapsedMilliseconds;name=$case.name;passed=$passed;events=$events;installer=$result;stderr=$helper.StandardError.ReadToEnd()}
 }finally{
  # These exact Process objects were created by this fixture; never discover or
  # terminate production Craft or any name-matched external process.
  foreach($process in @($helper,$hostProcess,$wrapper)){if($process-and !$process.HasExited){$process.Kill();$process.WaitForExit()}}
 }
}
$result=@{syntheticOnly=$true;productionRegistryPreflightExecuted=$false;officialNsisValidated=$false;historicalAcceptanceValidated=$false;runtimePolicyNotExecuted=$true;sourceSha256=(Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant();passed=(@($results|Where-Object {!$_.passed}).Count-eq 0);tests=$results}
$result|ConvertTo-Json -Depth 12|Set-Content (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
$result|ConvertTo-Json -Depth 12
if(!$result.passed){exit 1}

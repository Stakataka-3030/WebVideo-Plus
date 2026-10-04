param([string]$EvidenceRoot)
$ErrorActionPreference='Stop'
# Synthetic only. Never executes Craft, NSIS, a registered uninstaller, or any
# real update. A copied EXE/profile alone would NOT isolate official NSIS updates.
if(!$EvidenceRoot){$EvidenceRoot=Join-Path ([IO.Path]::GetTempPath()) ('WebVideoCraft-observer-test-'+[Guid]::NewGuid().ToString('N'))}
if(Test-Path -LiteralPath $EvidenceRoot){throw 'Evidence root must be new'}
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
$hostCode=@'
using System;using System.IO;using System.Threading;using System.Runtime.InteropServices;
class TestHost {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern IntPtr ShellExecuteW(IntPtr w,string op,string file,string args,string dir,int show);
 static int Main(string[] a){if(a.Length!=4)return 9;for(int i=0;i<800&&!File.Exists(a[1]);i++)Thread.Sleep(25);if(!File.Exists(a[1]))return 8;var result=ShellExecuteW(IntPtr.Zero,"open",a[0],"/UPDATE \""+a[2]+"\" "+a[3],null,0);return result.ToInt64()>32?0:7;}
}
'@
$installerCode=@'
using System;using System.IO;using System.Threading;
class TestInstaller {static int Main(string[] a){if(a.Length!=3||a[0]!="/UPDATE")return 9;Thread.Sleep(600);File.WriteAllText(a[1],"synthetic fixture only");return Int32.Parse(a[2]);}}
'@
$wrapperCode=@'
using System;using System.IO;using System.Diagnostics;using System.Threading;
class TestWrapper {
 static string Q(string s){return "\""+s+"\"";}
 static int Main(string[] a){if(a.Length!=7)return 9;using(var child=Process.Start(new ProcessStartInfo(a[0],Q(a[1])+" "+Q(a[2])+" "+Q(a[3])+" "+a[4]){UseShellExecute=false,CreateNoWindow=true})){File.WriteAllText(a[5],child.Id.ToString());for(int i=0;i<800&&!File.Exists(a[6]);i++)Thread.Sleep(25);return File.Exists(a[6])?0:8;}}
}
'@
$hostExe=Join-Path $EvidenceRoot 'SyntheticHost.exe';Add-Type -TypeDefinition $hostCode -OutputAssembly $hostExe -OutputType ConsoleApplication
$template=Join-Path $EvidenceRoot 'SyntheticInstaller.exe';Add-Type -TypeDefinition $installerCode -OutputAssembly $template -OutputType ConsoleApplication
$wrapperExe=Join-Path $EvidenceRoot 'SyntheticWrapper.exe';Add-Type -TypeDefinition $wrapperCode -OutputAssembly $wrapperExe -OutputType ConsoleApplication
$observerSource=Join-Path (Split-Path $PSScriptRoot -Parent) 'update/InstallerObserver.cs'
$observerExe=Join-Path $EvidenceRoot 'CraftInstallerObserver.exe'
Add-Type -Path $observerSource -ReferencedAssemblies @('System.dll','System.Web.Extensions.dll') -OutputAssembly $observerExe -OutputType ConsoleApplication
function Wait-Event([string]$File,[string]$State,[int]$Seconds=6){$deadline=(Get-Date).AddSeconds($Seconds);while((Get-Date)-lt $deadline){if(Test-Path $File){$text=Get-Content -LiteralPath $File -Raw -ErrorAction SilentlyContinue;if($text -match ('"state":"'+$State+'"')){return $true}};Start-Sleep -Milliseconds 25};return $false}
$results=@()
foreach($case in @(@{name='success';code=0;prefix='webgal-craft'},@{name='failure';code=5;prefix='webgal-craft'},@{name='foreign-path';code=0;prefix='not-webgal-craft'},@{name='wrapper-release';code=0;prefix='webgal-craft';wrapper=$true},@{name='wrong-wrapper-path';code=0;prefix='webgal-craft';wrapper=$true;wrongPath=$true})){
 $temp=Join-Path ([IO.Path]::GetTempPath()) ($case.prefix+'-1.0.1-updater-'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $temp | Out-Null
 $setup=Join-Path $temp 'setup.exe';Copy-Item -LiteralPath $template -Destination $setup
 $go=Join-Path $EvidenceRoot ($case.name+'.go');$marker=Join-Path $EvidenceRoot ($case.name+'.marker');$release=Join-Path $EvidenceRoot ($case.name+'.release');$pidFile=Join-Path $EvidenceRoot ($case.name+'.hostpid');$wrapper=$null;$fixtureHost=$null;$watch=$null
 try{
  if($case.wrapper){
   $wrapper=Start-Process -FilePath $wrapperExe -ArgumentList @(('"'+$hostExe+'"'),('"'+$setup+'"'),('"'+$go+'"'),('"'+$marker+'"'),$case.code,('"'+$pidFile+'"'),('"'+$release+'"')) -PassThru
   $deadline=(Get-Date).AddSeconds(6);while(!(Test-Path $pidFile)-and (Get-Date)-lt $deadline){Start-Sleep -Milliseconds 25};if(!(Test-Path $pidFile)){throw 'wrapper did not start host'}
   $fixtureHost=Get-Process -Id ([int](Get-Content $pidFile -Raw))
  }else{$fixtureHost=Start-Process -FilePath $hostExe -ArgumentList @(('"'+$setup+'"'),('"'+$go+'"'),('"'+$marker+'"'),$case.code) -PassThru}
  $stdout=Join-Path $EvidenceRoot ($case.name+'.jsonl');$stderr=Join-Path $EvidenceRoot ($case.name+'.stderr')
  $observerArgs=@($fixtureHost.Id,'1.0.1','webgal-craft','6');if($case.wrapper){$expectedWrapper=if($case.wrongPath){$hostExe}else{$wrapperExe};$observerArgs+=@($wrapper.Id,('"'+$expectedWrapper+'"'),('"'+$hostExe+'"'))}
  $watch=Start-Process -FilePath $observerExe -ArgumentList $observerArgs -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
  if(!$case.wrongPath){
   if(!(Wait-Event $stdout 'armed')){throw 'observer did not arm'}
   if($case.wrapper){if(Wait-Event $stdout 'wrapper-exited' 1){throw 'observer reported live wrapper exited'};[IO.File]::WriteAllText($release,'release');if(!(Wait-Event $stdout 'wrapper-exited')){throw 'wrapper release was not observed'};if(!$wrapper.WaitForExit(1000)){throw 'wrapper still alive'}}
   [IO.File]::WriteAllText($go,'go')
  }
  if(!$watch.WaitForExit(10000)){throw 'observer exceeded bounded lifetime'}
  $events=@(Get-Content -LiteralPath $stdout | Where-Object {$_} | ForEach-Object {ConvertFrom-Json $_});$last=$events[-1]
  $passed=if($case.name-eq 'foreign-path'){$last.state-eq 'indeterminate'}elseif($case.wrongPath){$last.state-eq 'indeterminate'-and !(Test-Path $marker)-and !(@($events|Where-Object {$_.state-eq 'armed'}).Count)}else{$last.state-eq 'exited'-and $last.exitCode-eq $case.code -and (Test-Path $marker)}
  $results+=@{name=$case.name;passed=$passed;events=$events;observerExited=$watch.HasExited}
 }finally{foreach($process in @($fixtureHost,$wrapper,$watch)){if($process-and !$process.HasExited){$process.Kill();$process.WaitForExit()}};Remove-Item -LiteralPath $temp -Recurse -Force}
}
$result=@{syntheticOnly=$true;officialNsisValidated=$false;productionGateEnabled=$false;observerSourceSha256=(Get-FileHash $observerSource -Algorithm SHA256).Hash.ToLowerInvariant();observerExeSha256=(Get-FileHash $observerExe -Algorithm SHA256).Hash.ToLowerInvariant();passed=(@($results|Where-Object {!$_.passed}).Count-eq 0);tests=$results}
$result|ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
$result|ConvertTo-Json -Depth 10
if(!$result.passed){exit 1}

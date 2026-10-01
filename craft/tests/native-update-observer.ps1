param([string]$EvidenceRoot)
$ErrorActionPreference='Stop'
# Test-only synthetic process fixtures. Never executes Craft or a real installer.
if(!$EvidenceRoot){$EvidenceRoot=Join-Path ([IO.Path]::GetTempPath()) ('WebVideoCraft-observer-test-'+[Guid]::NewGuid().ToString('N'))}
if(Test-Path -LiteralPath $EvidenceRoot){throw 'Evidence root must be new'}
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
$hostCode=@'
using System;using System.IO;using System.Threading;using System.Runtime.InteropServices;
class TestHost {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern IntPtr ShellExecuteW(IntPtr w,string op,string file,string args,string dir,int show);
 static int Main(string[] a){if(a.Length!=4)return 9;for(int i=0;i<400&&!File.Exists(a[1]);i++)Thread.Sleep(25);if(!File.Exists(a[1]))return 8;var result=ShellExecuteW(IntPtr.Zero,"open",a[0],"/UPDATE \""+a[2]+"\" "+a[3],null,0);return result.ToInt64()>32?0:7;}
}
'@
$installerCode=@'
using System;using System.IO;using System.Threading;
class TestInstaller {static int Main(string[] a){if(a.Length!=3||a[0]!="/UPDATE")return 9;Thread.Sleep(600);File.WriteAllText(a[1],"synthetic fixture only");return Int32.Parse(a[2]);}}
'@
$hostExe=Join-Path $EvidenceRoot 'SyntheticHost.exe'
Add-Type -TypeDefinition $hostCode -OutputAssembly $hostExe -OutputType ConsoleApplication
$template=Join-Path $EvidenceRoot 'SyntheticInstaller.exe'
Add-Type -TypeDefinition $installerCode -OutputAssembly $template -OutputType ConsoleApplication
$observer=Join-Path (Split-Path $PSScriptRoot -Parent) 'update/observe-installer.ps1'
$results=@()
foreach($case in @(@{name='success';code=0;prefix='webgal-craft'},@{name='failure';code=5;prefix='webgal-craft'},@{name='foreign-path';code=0;prefix='not-webgal-craft'})){
 $temp=Join-Path ([IO.Path]::GetTempPath()) ($case.prefix+'-1.0.1-updater-'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $temp | Out-Null
 $setup=Join-Path $temp 'setup.exe';Copy-Item -LiteralPath $template -Destination $setup
 $go=Join-Path $EvidenceRoot ($case.name+'.go');$marker=Join-Path $EvidenceRoot ($case.name+'.marker')
 $fixtureHost=Start-Process -FilePath $hostExe -ArgumentList @(('"'+$setup+'"'),('"'+$go+'"'),('"'+$marker+'"'),$case.code) -PassThru
 $stdout=Join-Path $EvidenceRoot ($case.name+'.jsonl');$stderr=Join-Path $EvidenceRoot ($case.name+'.stderr')
 $watch=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-File',('"'+$observer+'"'),'-HostPid',$fixtureHost.Id,'-Version','1.0.1','-AppName','webgal-craft','-TimeoutSeconds','6') -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
 try{
  $deadline=(Get-Date).AddSeconds(5);$armed=$false
  while((Get-Date)-lt $deadline){if(Test-Path $stdout){$text=Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue;if($text -match '"armed"'){$armed=$true;break}};Start-Sleep -Milliseconds 30}
  if(!$armed){throw 'observer did not arm'}
  [IO.File]::WriteAllText($go,'go')
  if(!$watch.WaitForExit(12000)){throw 'observer timeout'}
  $events=@(Get-Content -LiteralPath $stdout | Where-Object {$_} | ForEach-Object {ConvertFrom-Json $_})
  $last=$events[-1]
  $passed=if($case.name-eq 'foreign-path'){$last.state-eq 'indeterminate'}else{$last.state-eq 'exited'-and $last.exitCode-eq $case.code -and (Test-Path $marker)}
  $results+=@{name=$case.name;passed=$passed;events=$events}
 }finally{if(!$fixtureHost.HasExited){$fixtureHost.Kill()};if(!$watch.HasExited){$watch.Kill()};Remove-Item -LiteralPath $temp -Recurse -Force}
}
$result=@{syntheticOnly=$true;officialNsisValidated=$false;productionGateEnabled=$false;passed=(@($results|Where-Object {!$_.passed}).Count-eq 0);tests=$results}
$result|ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
$result|ConvertTo-Json -Depth 10
if(!$result.passed){exit 1}

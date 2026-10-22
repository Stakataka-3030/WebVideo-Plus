param([string]$EvidenceDirectory='')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$temporary=[string]::IsNullOrWhiteSpace($EvidenceDirectory)
$testRoot=if($temporary){Join-Path ([IO.Path]::GetTempPath()) ('webvideo-lifecycle-'+[Guid]::NewGuid().ToString('N'))}else{[IO.Path]::GetFullPath($EvidenceDirectory)}
New-Item -ItemType Directory -Path $testRoot -Force|Out-Null
try {
 $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 $exe=Join-Path $testRoot 'reliability-checks.exe'
 $sources=@('src/Core.cs','src/ManualCuts.cs','src/Integration.cs','src/Lifecycle.cs','src/AutomaticBackups.cs','manager/ManagerMain.cs','manager/ProductIntegration.cs','manager/TerreHostCompatibility.cs','manager/ModuleCatalog.cs','tests/LifecycleReliabilityChecks.cs')|ForEach-Object{Join-Path $repo $_}
 & $compiler /nologo /target:exe /define:LIFECYCLE_TESTS /main:LifecycleReliabilityChecks ('/out:'+$exe) /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll $sources
 if($LASTEXITCODE -ne 0){throw 'Lifecycle checks compilation failed'}
 & $exe (Join-Path $testRoot ('fixture-'+[Guid]::NewGuid().ToString('N'))) | Tee-Object -FilePath (Join-Path $testRoot 'native-results.log')
 if($LASTEXITCODE -ne 0){throw 'Lifecycle production-path checks failed'}
 $release=Join-Path $testRoot 'release-manager.exe'
 $releaseSources=@('src/Core.cs','src/ManualCuts.cs','src/Integration.cs','manager/ManagerMain.cs','manager/ProductIntegration.cs','manager/TerreHostCompatibility.cs','manager/ModuleCatalog.cs')|ForEach-Object{Join-Path $repo $_}
 & $compiler /nologo /target:exe /main:NativeVideo.App ('/out:'+$release) /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll $releaseSources
 if($LASTEXITCODE -ne 0){throw 'Release Manager compilation failed'}
 & $exe --inspect-release $release | Tee-Object -FilePath (Join-Path $testRoot 'release-hook-results.log')
 if($LASTEXITCODE -ne 0){throw 'Release test hook isolation failed'}
 $source=[IO.File]::ReadAllText((Join-Path $repo 'installer/Installer.base.cs'))
 $begin=$source.IndexOf('public void Run(string exe,IEnumerable<string> arguments,string runtimePath,string cwd){');$end=$source.IndexOf('void AppendProcessLog(string line)',$begin)
 if($begin -lt 0 -or $end -lt 0){throw 'Installer method extraction failed'}
 $method=$source.Substring($begin,$end-$begin)
 $kill='using(var kill=Process.Start(new ProcessStartInfo("taskkill.exe","/PID "+p.Id+" /T /F"){UseShellExecute=false,CreateNoWindow=true}))kill.WaitForExit(5000);'
 if(-not $method.Contains($kill)){throw 'Taskkill interception anchor missing'}
 $method=$method.Replace($kill,'InstallerCancelChecks.RecordKill(p.Id);')
 $probe=@'
using System;using System.IO;using System.Diagnostics;using System.Collections.Generic;using System.Linq;using System.Threading;using System.Threading.Tasks;
class Engine {
 public volatile bool Canceled;public string Root;
 void Check(){if(Canceled)throw new OperationCanceledException();}
 public static string Quote(string value){return "\""+value.Replace("\"","\\\"")+"\"";}
 void AppendProcessLog(string text){}
__METHOD__
}
class InstallerCancelChecks {
 static bool kill;public static void RecordKill(int pid){kill=true;}
 public static int Main(string[] args){if(args.Length>0&&args[0]=="child"){File.WriteAllText(args[1],"active");Thread.Sleep(1300);File.WriteAllText(args[1],"ended");return 0;}
 string root=Path.GetDirectoryName(typeof(InstallerCancelChecks).Assembly.Location),marker=Path.Combine(root,"inert-child.txt");var engine=new Engine{Root=root};var task=Task.Run(()=>engine.Run(typeof(InstallerCancelChecks).Assembly.Location,new[]{"child",marker},"",root));for(int i=0;i<100&&!File.Exists(marker);i++)Thread.Sleep(20);if(!File.Exists(marker))throw new Exception("Child failed to start");engine.Canceled=true;task.GetAwaiter().GetResult();if(kill||File.ReadAllText(marker)!="ended")throw new Exception("Transaction manager was interrupted");Console.WriteLine("PASS installer-cancel-waits-for-manager-safe-completion; no taskkill executed");return 0;
 }
}
'@
 $path=Join-Path $testRoot 'InstallerCancelChecks.cs';[IO.File]::WriteAllText($path,$probe.Replace('__METHOD__',$method),[Text.UTF8Encoding]::new($false))
 $cancelExe=Join-Path $testRoot 'WebVideoPlus.Manager.exe'
 & $compiler /nologo /target:exe /main:InstallerCancelChecks ('/out:'+$cancelExe) $path
 if($LASTEXITCODE -ne 0){throw 'Installer cancellation checks compilation failed'}
 & $cancelExe | Tee-Object -FilePath (Join-Path $testRoot 'installer-cancel-results.log')
 if($LASTEXITCODE -ne 0){throw 'Installer transaction cancellation check failed'}
 & node --test (Join-Path $repo 'tests/lifecycle-browser.test.mjs') | Tee-Object -FilePath (Join-Path $testRoot 'browser-results.log')
 if($LASTEXITCODE -ne 0){throw 'Lifecycle browser checks failed'}
} finally {
 if($temporary -and (Test-Path -LiteralPath $testRoot)){
  $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
  $resolved=[IO.Path]::GetFullPath($testRoot)
  if(-not $resolved.StartsWith($tempRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe test cleanup path'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
 }
}

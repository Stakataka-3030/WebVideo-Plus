param([string]$EvidenceDirectory='')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$temporary=[string]::IsNullOrWhiteSpace($EvidenceDirectory)
$testRoot=if($temporary){Join-Path ([IO.Path]::GetTempPath()) ('webvideo-settings-'+[Guid]::NewGuid().ToString('N'))}else{[IO.Path]::GetFullPath($EvidenceDirectory)}
New-Item -ItemType Directory -Path $testRoot -Force|Out-Null
try {
 $code=@'
using System;using System.IO;using NativeVideo;
class SettingsChecks {
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 static int Main(string[] args){string folder=Path.Combine(args[0],Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);string file=Path.Combine(folder,"settings.json");J.Write(file,J.O("workers",0,"textSpeed",12,"width",2560,"height",1440,"cubismCoreInitialMemoryMiB",128));var settings=RecoverableSettings.Load(file);Check(J.N(settings,"workers")>=1,"Invalid worker count retained");Check(J.N(settings,"textSpeed")==12&&J.N(settings,"width")==2560&&J.N(settings,"height")==1440&&J.N(settings,"cubismCoreInitialMemoryMiB")==128,"Valid explicit values lost during recovery");Check(Directory.GetFiles(folder,"settings.json.invalid-*.json").Length==1,"Original invalid document missing");J.Write(file,J.O("workers",7,"gpuRawMode","traditional","cubismCoreInitialMemoryMiB",0));settings=RecoverableSettings.Load(file);Check(J.N(settings,"workers")==7&&J.S(settings,"gpuRawMode")=="traditional"&&J.N(settings,"cubismCoreInitialMemoryMiB")==0,"Valid explicit settings changed");File.WriteAllText(file,"{invalid");settings=RecoverableSettings.Load(file);Check(J.N(settings,"workers")>=1&&File.ReadAllText(file)=="{invalid","Syntax-corrupt original was overwritten");Console.WriteLine("PASS recover invalid preferences, preserve valid fields and explicit defaults, retain original bytes");return 0;}
}
'@
 $source=Join-Path $testRoot 'SettingsChecks.cs';[IO.File]::WriteAllText($source,$code,[Text.UTF8Encoding]::new($false))
 $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 $exe=Join-Path $testRoot 'settings-checks.exe'
 & $compiler /nologo /target:exe /main:SettingsChecks ('/out:'+$exe) /r:System.Web.Extensions.dll (Join-Path $repo 'src/Core.cs') (Join-Path $repo 'src/ManualCuts.cs') $source
 if($LASTEXITCODE -ne 0){throw 'Settings checks compilation failed'}
 & $exe $testRoot | Tee-Object -FilePath (Join-Path $testRoot 'settings-results.log')
 if($LASTEXITCODE -ne 0){throw 'Recoverable settings checks failed'}
} finally {
 if($temporary -and (Test-Path -LiteralPath $testRoot)){
  $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
  $resolved=[IO.Path]::GetFullPath($testRoot)
  if(-not $resolved.StartsWith($tempRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe test cleanup path'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
 }
}

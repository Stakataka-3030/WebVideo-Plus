param([string]$SourceRoot=(Split-Path $PSScriptRoot -Parent),[string]$OutputRoot)
$ErrorActionPreference='Stop'
if(!$OutputRoot){$OutputRoot=Join-Path ([IO.Path]::GetTempPath()) ('wvp-authoring-read-'+[Guid]::NewGuid().ToString('N'))}
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$core=[IO.File]::ReadAllText((Join-Path $SourceRoot 'src/Core.cs'))
$end=$core.IndexOf(' public static class WorkCache {')
if($end -lt 0){throw 'Production core boundary changed'}
$core=$core.Substring(0,$end)+" public static partial class App {public static readonly object LogLock=new object();}`n}`n"
$coreFile=Join-Path $OutputRoot 'Core.cs'
[IO.File]::WriteAllText($coreFile,$core,[Text.UTF8Encoding]::new($false))
$exe=Join-Path $OutputRoot 'authoring-files-checks.exe'
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe ('/out:'+$exe) /r:System.Web.Extensions.dll $coreFile (Join-Path $SourceRoot 'src/AuthoringFiles.cs') (Join-Path $PSScriptRoot 'AuthoringFilesChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Authoring files regression compile failed'}
& $exe (Join-Path $OutputRoot 'games')
if($LASTEXITCODE -ne 0){throw 'Authoring files regression failed'}

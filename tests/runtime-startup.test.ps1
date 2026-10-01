param([switch]$Portable,[string]$PackageRoot=(Join-Path $PSScriptRoot '../package'))
$ErrorActionPreference='Stop'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-startup-checks-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 if($Portable){
  if($PSVersionTable.PSVersion.Major -lt 7){throw 'Portable checks require PowerShell 7'}
  $core=Get-Content (Join-Path $PSScriptRoot '../src/Core.cs') -Raw -Encoding UTF8
  $end=$core.IndexOf(' public static class WorkCache {');if($end -lt 0){throw 'Production core extraction boundary changed'}
  $core=$core.Substring(0,$end)+" public static partial class App {public static readonly object LogLock=new object();}`n}`n"
  $corePath=Join-Path $temp 'Core.cs';[IO.File]::WriteAllText($corePath,$core,[Text.UTF8Encoding]::new($false))
  Add-Type -Path @($corePath,(Join-Path $PSScriptRoot '../src/EngineAdapter.cs'),(Join-Path $PSScriptRoot '../src/RuntimeStartup.cs'),(Join-Path $PSScriptRoot 'engine-adapter-465-portable-json.cs'),(Join-Path $PSScriptRoot 'runtime-startup-checks.cs'))
  [RuntimeStartupChecks]::Run()
 }else{
  if($env:OS -ne 'Windows_NT'){throw 'Actual product assembly checks require Windows'}
  $native=Join-Path $PackageRoot 'WebGAL.Video.exe';$checks=Join-Path $temp 'RuntimeStartupChecks.exe';$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  & $compiler /nologo /target:exe /main:RuntimeStartupChecks /platform:x64 ('/out:'+$checks) ('/r:'+$native) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'runtime-startup-checks.cs')
  if($LASTEXITCODE -ne 0){throw 'Startup checks compilation failed'}
  Copy-Item -LiteralPath $native -Destination $temp
  Get-ChildItem -LiteralPath $PackageRoot -Filter '*.dll' -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $temp}
  & $checks
  if($LASTEXITCODE -ne 0){throw 'Startup checks failed'}
 }
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

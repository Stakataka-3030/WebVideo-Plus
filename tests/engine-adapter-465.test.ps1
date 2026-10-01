param([string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),[switch]$Portable)
$ErrorActionPreference='Stop'
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-adapter-tests-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 if($Portable){
  if($PSVersionTable.PSVersion.Major -lt 7){throw 'Portable compiler requires PowerShell 7.'}
  # Keep the real production JSON helpers, path operations and source selection.
  # Only replace .NET Framework JavaScriptSerializer at this test boundary.
  $core=Get-Content (Join-Path $PSScriptRoot '../src/Core.cs') -Raw -Encoding UTF8
  $end=$core.IndexOf(' public static class WorkCache {')
  if($end -lt 0){throw 'Production core extraction boundary changed'}
  $core=$core.Substring(0,$end)+" public static partial class App {public static readonly object LogLock=new object();}`n}`n"
  $corePath=Join-Path $temp 'Core.cs'
  [IO.File]::WriteAllText($corePath,$core,[Text.UTF8Encoding]::new($false))
  Add-Type -Path @($corePath,(Join-Path $PSScriptRoot '../src/EngineAdapter.cs'),(Join-Path $PSScriptRoot 'engine-adapter-465-portable-json.cs'),(Join-Path $PSScriptRoot 'engine-adapter-465-checks.cs'))
  [EngineAdapter465Checks]::Run($PackageRoot)
 }else{
  if($env:OS -ne 'Windows_NT'){throw 'Use -Portable for source-level checks; real product-assembly checks require Windows.'}
  $native=Join-Path $PackageRoot 'WebGAL.Video.exe'
  if(-not(Test-Path -LiteralPath $native)){throw 'Build the native exporter first.'}
  $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  $checks=Join-Path $temp 'EngineAdapter465Checks.exe'
  & $compiler /nologo /target:exe /main:EngineAdapter465Checks /platform:x64 ('/out:'+$checks) ('/r:'+$native) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'engine-adapter-465-checks.cs')
  if($LASTEXITCODE -ne 0){throw 'Adapter test compilation failed'}
  Copy-Item -LiteralPath $native -Destination $temp
  Get-ChildItem -LiteralPath $PackageRoot -Filter '*.dll' -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $temp}
  if(Test-Path ($native+'.config')){Copy-Item -LiteralPath ($native+'.config') -Destination ($checks+'.config')}
  & $checks $PackageRoot
  if($LASTEXITCODE -ne 0){throw 'Real product adapter checks failed'}
 }
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

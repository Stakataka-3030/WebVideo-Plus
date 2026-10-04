param(
 [Parameter(Mandatory=$true)][string]$Mygo321Root,
 [string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),
 [switch]$Portable
)
$ErrorActionPreference='Stop'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-mygo-profile-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $output=Join-Path $temp 'fixtures'
 if($Portable){
  $core=Get-Content (Join-Path $PSScriptRoot '../src/Core.cs') -Raw -Encoding UTF8
  $end=$core.IndexOf(' public static class WorkCache {');if($end -lt 0){throw 'Production core extraction boundary changed'}
  $core=$core.Substring(0,$end)+" public static partial class App {public static readonly object LogLock=new object();}`n}`n"
  $corePath=Join-Path $temp 'Core.cs';[IO.File]::WriteAllText($corePath,$core,[Text.UTF8Encoding]::new($false))
  Add-Type -Path @($corePath,(Join-Path $PSScriptRoot '../src/WebgalEngineProfile.cs'),(Join-Path $PSScriptRoot '../src/RuntimeStartup.cs'),(Join-Path $PSScriptRoot '../src/EngineAdapter.cs'),(Join-Path $PSScriptRoot 'engine-adapter-dual-profile.portable-json.cs'),(Join-Path $PSScriptRoot 'engine-adapter-mygo-profile-checks.cs'))
  [EngineAdapterMygoProfileChecks]::Run([IO.Path]::GetFullPath($Mygo321Root),$output)
 }else{
  if($env:OS -ne 'Windows_NT'){throw 'Use -Portable for source-level checks; product-assembly checks require Windows.'}
  $native=Join-Path $PackageRoot 'WebGAL.Video.exe';$test=Join-Path $temp 'EngineAdapterMygoProfileChecks.exe'
  & (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe /platform:x64 ('/out:'+$test) ('/r:'+$native) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'engine-adapter-mygo-profile-checks.cs')
  if($LASTEXITCODE -ne 0){throw 'MyGO profile test compilation failed'}
  Copy-Item -LiteralPath $native -Destination $temp;Get-ChildItem -LiteralPath $PackageRoot -Filter '*.dll' -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $temp}
  if(Test-Path -LiteralPath ($native+'.config')){Copy-Item -LiteralPath ($native+'.config') -Destination ($test+'.config')}
  & $test ([IO.Path]::GetFullPath($Mygo321Root)) $output
  if($LASTEXITCODE -ne 0){throw 'MyGO real-runtime checks failed'}
 }
 & node --check (Join-Path $output 'patched-mygo.mjs');if($LASTEXITCODE -ne 0){throw 'Patched MyGO syntax check failed'}
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

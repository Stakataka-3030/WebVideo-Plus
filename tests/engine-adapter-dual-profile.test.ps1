param(
  [Parameter(Mandatory=$true)][string]$Webgal464Root,
  [Parameter(Mandatory=$true)][string]$Webgal465Root,
  [string]$Webgal464Manifest=(Join-Path $PSScriptRoot '../build/runtime-patches.json'),
  [string]$Webgal466Root,
  [string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),
  [switch]$Portable
)
# Both roots must contain the actual official raw engine shell (index.html,
# descriptor and assets). The suite writes only its own temporary fixtures.
# -Portable compiles production source on PowerShell 7 with a JSON bridge; omit
# it on Windows to test the built .NET Framework product assembly instead.
$ErrorActionPreference='Stop'
$Webgal464Root=[IO.Path]::GetFullPath($Webgal464Root)
$Webgal465Root=[IO.Path]::GetFullPath($Webgal465Root)
if($Webgal466Root){$Webgal466Root=[IO.Path]::GetFullPath($Webgal466Root)}
$Webgal464Manifest=[IO.Path]::GetFullPath($Webgal464Manifest)
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-dual-profile-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $output=Join-Path $temp 'fixtures'
 if($Portable){
  if($PSVersionTable.PSVersion.Major -lt 7){throw 'Portable source tests require PowerShell 7.'}
  $core=Get-Content (Join-Path $PSScriptRoot '../src/Core.cs') -Raw -Encoding UTF8
  $end=$core.IndexOf(' public static class WorkCache {')
  if($end -lt 0){throw 'Production core extraction boundary changed'}
  $core=$core.Substring(0,$end)+" public static partial class App {public static readonly object LogLock=new object();}`n}`n"
  $corePath=Join-Path $temp 'Core.cs'
  [IO.File]::WriteAllText($corePath,$core,[Text.UTF8Encoding]::new($false))
  Add-Type -Path @($corePath,(Join-Path $PSScriptRoot '../src/WebgalEngineProfile.cs'),(Join-Path $PSScriptRoot '../src/RuntimeStartup.cs'),(Join-Path $PSScriptRoot '../src/EngineAdapter.cs'),(Join-Path $PSScriptRoot 'engine-adapter-dual-profile.portable-json.cs'),(Join-Path $PSScriptRoot 'engine-adapter-dual-profile-checks.cs'))
  [EngineAdapterDualProfileChecks]::Run($Webgal464Root,$Webgal465Root,$Webgal464Manifest,$output,$Webgal466Root)
 }else{
  if($env:OS -ne 'Windows_NT'){throw 'Use -Portable for source-level checks; product-assembly checks require Windows.'}
  $native=Join-Path $PackageRoot 'WebGAL.Video.exe'
  if(-not(Test-Path -LiteralPath $native)){throw "Build the product first: $native"}
  $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  $checks=Join-Path $temp 'EngineAdapterDualProfileChecks.exe'
  & $compiler /nologo /target:exe /main:EngineAdapterDualProfileChecks /platform:x64 ('/out:'+$checks) ('/r:'+$native) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'engine-adapter-dual-profile-checks.cs')
  if($LASTEXITCODE -ne 0){throw 'Dual-profile product-assembly test compilation failed'}
  Copy-Item -LiteralPath $native -Destination $temp
  Get-ChildItem -LiteralPath $PackageRoot -Filter '*.dll' -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $temp}
  if(Test-Path -LiteralPath ($native+'.config')){Copy-Item -LiteralPath ($native+'.config') -Destination ($checks+'.config')}
  if($Webgal466Root){& $checks $Webgal464Root $Webgal465Root $Webgal464Manifest $output $Webgal466Root}else{& $checks $Webgal464Root $Webgal465Root $Webgal464Manifest $output}
  if($LASTEXITCODE -ne 0){throw 'Dual-profile product-assembly checks failed'}
 }
 $outputs=@('patched-4.6.4.mjs','patched-4.6.4-canonical.mjs','patched-4.6.5.mjs')
 if($Webgal466Root){$outputs+='patched-4.6.6.mjs'}
 foreach($name in $outputs){
  & node --check (Join-Path $output $name)
  if($LASTEXITCODE -ne 0){throw "Patched engine JavaScript syntax check failed: $name"}
 }
 Write-Output 'All selected exact profile representations produce valid JavaScript. Native WebView2/rendering validation remains separate.'
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

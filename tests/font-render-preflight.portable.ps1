# Source-level scanner checks on PowerShell 7. Does not run WebView2/media.
param([string]$PackageRoot=(Join-Path $PSScriptRoot '../package'))
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 is required.'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-preflight-source-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $core=Get-Content (Join-Path $PSScriptRoot '../src/Core.cs') -Raw -Encoding UTF8
 $end=$core.IndexOf(' public static class WorkCache {')
 if($end -lt 0){throw 'Production core extraction boundary changed'}
 $canonical=@(Get-Content (Join-Path $PSScriptRoot '../src/VideoWorkflow.cs') -Encoding UTF8 | Where-Object {$_ -match '^  public static string CanonicalSource\('})
 if($canonical.Count -ne 1){throw 'Production scene canonicalization boundary changed'}
 # Media probing is not part of these scanner fixtures. Any unexpected call
 # fails explicitly rather than replacing FFmpeg behavior with a fake result.
 $core=$core.Substring(0,$end)+" public static class VideoWorkflow {$($canonical[0])}`n public static partial class App {public static readonly object LogLock=new object();}`n public static class Commands {public static Task<object> Probe(string file){throw new InvalidOperationException(`"Media probe is outside portable scanner tests`" );}}`n}`n"
 $corePath=Join-Path $temp 'Core.cs'
 [IO.File]::WriteAllText($corePath,$core,[Text.UTF8Encoding]::new($false))
 $resource=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../src/SharedResourceServer.cs'))
 $resourceEnd=$resource.IndexOf(' public sealed class SharedResourceServer:')
 if($resourceEnd -lt 0){throw 'Shared resource helper extraction boundary changed'}
 $resourcePath=Join-Path $temp 'SharedResourceHelpers.cs'
 [IO.File]::WriteAllText($resourcePath,$resource.Substring(0,$resourceEnd)+"}`n",[Text.UTF8Encoding]::new($false))
 Add-Type -Path @($corePath,(Join-Path $PSScriptRoot '../src/EngineAdapter.cs'),(Join-Path $PSScriptRoot '../src/WebgalEngineProfile.cs'),(Join-Path $PSScriptRoot '../src/ProjectAssets.cs'),(Join-Path $PSScriptRoot '../src/SharedAssets.cs'),$resourcePath,(Join-Path $PSScriptRoot '../src/SceneChain.cs'),(Join-Path $PSScriptRoot 'engine-adapter-dual-profile.portable-json.cs'),(Join-Path $PSScriptRoot 'font-render-preflight-checks.cs'))
 $passed=[FontPreflightChecks]::Run([IO.Path]::GetFullPath($PackageRoot))
 Write-Output "Portable production-source scanner checks passed: $passed (real Windows product test remains separate)."
}finally{if(-not([IO.Path]::GetFullPath($temp).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase))){throw 'Unexpected preflight test cleanup path'};Remove-Item -LiteralPath $temp -Recurse -Force}

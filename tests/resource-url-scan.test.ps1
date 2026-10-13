# Compile and execute actual C# scanner/path resolution, without WebView2/FFmpeg.
param([string]$SourceRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-resource-scan-source-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $core=[IO.File]::ReadAllText((Join-Path $SourceRoot 'src/Core.cs'))
 $end=$core.IndexOf(' public static class WorkCache {')
 if($end -lt 0){throw 'Production core extraction boundary changed'}
 $canonical=@([IO.File]::ReadAllLines((Join-Path $SourceRoot 'src/VideoWorkflow.cs')) | Where-Object {$_ -match '^  public static string CanonicalSource\('})
 if($canonical.Count -ne 1){throw 'Production canonical source extraction boundary changed'}
 # Any accidental attempt to probe the synthetic resource must fail explicitly.
 $core=$core.Substring(0,$end)+" public static class VideoWorkflow {$($canonical[0])}`n public static partial class App {public static readonly object LogLock=new object();}`n public static class Commands {public static Task<object> Probe(string file){throw new InvalidOperationException(`"Media probe is outside scanner/path resolution tests`");}}`n}`n"
 $corePath=Join-Path $temp 'Core.cs'
 [IO.File]::WriteAllText($corePath,$core,[Text.UTF8Encoding]::new($false))
 $sources=@($corePath,(Join-Path $SourceRoot 'src/EngineAdapter.cs'),(Join-Path $SourceRoot 'src/WebgalEngineProfile.cs'),(Join-Path $SourceRoot 'src/ProjectAssets.cs'),(Join-Path $SourceRoot 'src/SceneChain.cs'),(Join-Path $SourceRoot 'tests/engine-adapter-dual-profile.portable-json.cs'),(Join-Path $PSScriptRoot 'ResourceUrlScanChecks.cs'))
 Add-Type -Path $sources
 $count=[ResourceUrlScanChecks]::Run()
 Write-Output "PASS $count production C# resource Scan/Resolve checks"
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

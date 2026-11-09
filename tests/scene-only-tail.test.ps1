# Pure production-source C# checks. Never starts WebView2 or a render host.
param([string]$Fixtures='', [string]$CompatibilitySourceRoot='')
$ErrorActionPreference='Stop'
$currentRoot=Split-Path $PSScriptRoot -Parent
$root=if($CompatibilitySourceRoot){[IO.Path]::GetFullPath($CompatibilitySourceRoot)}else{$currentRoot}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-scene-tail-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $core=[IO.File]::ReadAllText((Join-Path $root 'src/Core.cs'))
 $end=$core.IndexOf(' public static class WorkCache {')
 if($end -lt 0){throw 'Production core extraction boundary changed'}
 $core=$core.Substring(0,$end)+@'
 public static partial class App {public static readonly object LogLock=new object();}
 public static class Commands {
  public static Task<object> Probe(string file){throw new InvalidOperationException("Unexpected media probe: "+file);}
  public static Task<double> Duration(string file){throw new InvalidOperationException("Unexpected duration probe: "+file);}
 }
}
'@
 $corePath=Join-Path $temp 'Core.cs';[IO.File]::WriteAllText($corePath,$core,[Text.UTF8Encoding]::new($false))
 $sources=@($corePath,(Join-Path $currentRoot 'src/SceneChain.cs'),(Join-Path $PSScriptRoot 'engine-adapter-dual-profile.portable-json.cs'),(Join-Path $PSScriptRoot 'SceneOnlyTailChecks.cs'))
 if(Test-Path (Join-Path $root 'src/SharedResourceServer.cs')){
  $resource=[IO.File]::ReadAllText((Join-Path $root 'src/SharedResourceServer.cs'))
  $resourceEnd=$resource.IndexOf(' public sealed class SharedResourceServer:')
  if($resourceEnd -lt 0){throw 'Shared resource extraction boundary changed'}
  $resourcePath=Join-Path $temp 'SharedResourceHelpers.cs';[IO.File]::WriteAllText($resourcePath,$resource.Substring(0,$resourceEnd)+"}`n",[Text.UTF8Encoding]::new($false));$sources+=$resourcePath
 }
 foreach($name in @('EngineAdapter','WebgalEngineProfile','ProjectAssets','SharedAssets','VideoWorkflow','SegmentPlan','ManualCuts','StatementCuts')){if(Test-Path (Join-Path $root "src/$name.cs")){$sources+=Join-Path $root "src/$name.cs"}}
 Add-Type -Path $sources
 $count=[NativeVideo.SceneOnlyTailChecks]::Run($temp,$Fixtures)
 Write-Output "PASS $count production C# scene-only tail checks (no graphics host)"
}finally{
 if(-not([IO.Path]::GetFullPath($temp).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase))){throw 'Unexpected test cleanup path'}
 Remove-Item -LiteralPath $temp -Recurse -Force
}

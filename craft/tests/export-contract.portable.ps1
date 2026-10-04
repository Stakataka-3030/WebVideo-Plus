# Production-source request validation only. Does not render or start a native queue.
param([string]$Node='node')
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 is required.'}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-export-contract-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $inputs=Join-Path $temp 'payloads.json'
 & $Node (Join-Path $PSScriptRoot 'export-contract-payloads.mjs') $inputs
 if($LASTEXITCODE -ne 0){throw 'Full production browser-payload contract fixture failed'}
 $core=Get-Content (Join-Path $repo 'src/Core.cs') -Raw -Encoding UTF8
 $workflow=Get-Content (Join-Path $repo 'src/VideoWorkflow.cs') -Raw -Encoding UTF8
 $layer=Get-Content (Join-Path $repo 'src/LayerExport.cs') -Raw -Encoding UTF8
 $queue=Get-Content (Join-Path $repo 'src/QueueService.cs') -Raw -Encoding UTF8
 function ExactLine([string]$source,[string]$prefix) {
  $matches=@($source -split "`n" | Where-Object {$_.StartsWith($prefix)})
  if($matches.Count -ne 1){throw "Production validation extraction boundary changed: $prefix"}
  return $matches[0]
 }
 function Section([string]$source,[string]$start,[string]$end) {
  $first=$source.IndexOf($start);$last=$source.IndexOf($end)
  if($first -lt 0 -or $last -le $first){throw 'Production validation extraction section changed'}
  return $source.Substring($first,$last-$first)
 }
 $base=Section $core 'using System;' ' public static class WorkCache {'
 $settings=Section $core ' public static class Settings {' ' public static partial class App {'
 $normal=ExactLine $core '  public static string NormalizeMode('
 $ranges=Section $workflow '  public static string CanonicalSource(' '  public static string PlanningSource('
 $extension=ExactLine $layer '  public static string RequiredExtension('
 $header=ExactLine $queue '    bool analysisOnly=r.Path=="/api/timing";'
 $filename=ExactLine $queue '    string expectedExtension=LayerExport.RequiredExtension('
 # Bind the unchanged queue validation lines to inert /api/jobs context. Native
 # filesystem snapshotting, engine loading, encoder probes and Pump stay unrun.
 $fixture=@"
 public static class GpuEncoding { $normal }
 $settings
 public static class VideoWorkflow { $ranges }
 public static class LayerExport { $extension }
 public static partial class App {public static readonly object LogLock=new object();}
 public static class ExportContractChecks {
  sealed class Request {public string Path="/api/jobs";}
  public static int Run(string json){int count=0;foreach(var item in J.A(J.Parse(json))){
   var d=J.Get(item,"body");bool accepted=false;string error="";
   try{var r=new Request();string scene=J.S(d,"scene","start.txt"),preferredOutput=System.IO.Path.GetTempPath();
    $header
    Settings.Validate(J.Get(d,"settings"));
    VideoWorkflow.ValidateRange(J.Get(d,"range"),J.S(d,"sourceText"));
    $filename
    accepted=true;
   }catch(ArgumentException ex){error=ex.Message;}
   if(accepted!=J.B(item,"accepted")||!accepted&&error!=J.S(item,"error"))throw new Exception("Export contract failed: "+J.S(item,"name")+"; accepted="+accepted+"; error="+error);
   count++;
  }return count;}
 }
}
"@
 $cs=Join-Path $temp 'ProductionExportValidation.cs'
 [IO.File]::WriteAllText($cs,$base+$fixture,[Text.UTF8Encoding]::new($false))
 Add-Type -Path @($cs,(Join-Path $repo 'tests/engine-adapter-dual-profile.portable-json.cs'))
 $passed=[NativeVideo.ExportContractChecks]::Run([IO.File]::ReadAllText($inputs))
 if($passed -ne 48){throw "Unexpected contract case count: $passed"}
 Write-Output "Portable production export validation passed: $passed (40 full-payload requests, 8 negative controls; native rendering remains separate)."
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

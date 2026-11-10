# Compile the actual production metadata parser without WebView2 or media tools.
param([string]$SourceRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$assets=[IO.File]::ReadAllText((Join-Path $SourceRoot 'src/ProjectAssets.cs'))
$start=$assets.IndexOf('  public static object AudioLoopPoints(')
if($start -lt 0){throw 'Audio loop parser extraction boundary missing'}
$end=$assets.IndexOf("`n  }",$start)
if($end -lt 0){throw 'Audio loop parser closing boundary missing'}
$method=$assets.Substring($start,$end+4-$start)
$core=[IO.File]::ReadAllText((Join-Path $SourceRoot 'src/Core.cs'))
$end=$core.IndexOf(' public static class WorkCache {')
if($end -lt 0){throw 'Core extraction boundary missing'}
$core=$core.Substring(0,$end)+" public static class ProjectAssets {`n$method`n}"
$checks=@'
public static class App { public static readonly object LogLock=new object(); }
public static class AudioLoopMetadataChecks {
 static int count;
 static void Check(bool value,string message){count++;if(!value)throw new Exception(message);}
 static object Probe(string codec,object tags,object streamTags=null,string rate="44100") {return J.O("format",J.O("tags",tags),"streams",new object[]{J.O("codec_type","video"),J.O("codec_type","audio","codec_name",codec,"sample_rate",rate,"tags",streamTags)});}
 public static int Run(){
  var points=ProjectAssets.AudioLoopPoints(Probe("opus",J.O("loop_start","6240","loop_end","20640")),1000);
  Check(Math.Abs(J.N(points,"start")-.13)<1e-9&&Math.Abs(J.N(points,"end")-.43)<1e-9,"Opus must use decoded 48000 Hz rather than input rate");
  points=ProjectAssets.AudioLoopPoints(Probe("vorbis",J.O("LOOPSTART","4410","LOOPLENGTH","8820")),1000);
  Check(Math.Abs(J.N(points,"start")-.1)<1e-9&&Math.Abs(J.N(points,"end")-.3)<1e-9,"Vorbis rate/length");
  points=ProjectAssets.AudioLoopPoints(Probe("opus",J.O("LOOPSTART","100","LOOPEND","400","LOOPSAMPLERATE","1000"),J.O("loop_start","200")),1000);
  Check(J.N(points,"start")==.2&&J.N(points,"end")==.4,"Stream tags override format tags and explicit rate");
  foreach(string bad in new[]{"-1","1.5","NaN","Infinity","9007199254740992",""})Check(ProjectAssets.AudioLoopPoints(Probe("opus",J.O("LOOPSTART",bad,"LOOPEND","20000")),1000)==null,"Invalid start accepted: "+bad);
  foreach(object tags in new[]{J.O("LOOPSTART","100","LOOPEND","100"),J.O("LOOPSTART","200","LOOPEND","100"),J.O("LOOPSTART","0","LOOPEND","48001"),J.O("LOOPSTART","0","LOOPEND","100","LOOPSAMPLERATE","0"),J.O("LOOPSTART","0")})Check(ProjectAssets.AudioLoopPoints(Probe("opus",tags),1000)==null,"Invalid loop bounds accepted");
  Check(ProjectAssets.AudioLoopPoints(Probe("mp3",J.O("LOOPSTART","0","LOOPEND","100")),1000)==null,"Unsupported codec accepted");
  Check(ProjectAssets.AudioLoopPoints(J.O(),1000)==null,"Absent audio stream accepted");
  return count;
 }
}
'@
# The scanner harness already supplies a portable serializer for PowerShell 7.
$serializer=[IO.File]::ReadAllText((Join-Path $SourceRoot 'tests/engine-adapter-dual-profile.portable-json.cs'))
$serializer=[regex]::Replace($serializer,'(?m)^using [^;]+;\r?\n','')
Add-Type -TypeDefinition ("using System.Text.Json;using System.Text.RegularExpressions;`n"+$core+"`n"+$checks+"`n}"+"`n"+$serializer)
$count=[NativeVideo.AudioLoopMetadataChecks]::Run()
Write-Output "PASS $count production audio loop metadata checks"

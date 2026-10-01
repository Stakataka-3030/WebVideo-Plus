# Compile the actual production parser, settings and segment planners on .NET.
# Only unrelated filesystem/audio dependencies are stubbed; none are invoked.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$core=[IO.File]::ReadAllText((Join-Path $root 'src/Core.cs'))
function SourceClass([string]$name){
 $start=$core.IndexOf(' public static class '+$name+' {')
 if($start -lt 0){throw "Missing production class $name"}
 # Production class members use two spaces, while top-level classes use one.
 $match=[regex]::Match($core.Substring($start+1),'(?m)^ public (?:static |sealed )?class ')
 $end=if($match.Success){$start+1+$match.Index}else{$core.LastIndexOf('}')}
 return $core.Substring($start,$end-$start)
}
$shim=@'
using System;using System.IO;using System.Linq;using System.Text;using System.Collections;using System.Collections.Generic;using System.Globalization;using System.Threading;using System.Threading.Tasks;using System.Text.Json;using System.Web.Script.Serialization;
namespace System.Web.Script.Serialization {
 public sealed class JavaScriptSerializer {
  public int MaxJsonLength{get;set;} public int RecursionLimit{get;set;}
  static object ConvertValue(JsonElement value){switch(value.ValueKind){case JsonValueKind.Object:return value.EnumerateObject().ToDictionary(p=>p.Name,p=>ConvertValue(p.Value));case JsonValueKind.Array:return value.EnumerateArray().Select(ConvertValue).ToArray();case JsonValueKind.String:return value.GetString();case JsonValueKind.Number:return value.GetDouble();case JsonValueKind.True:return true;case JsonValueKind.False:return false;default:return null;}}
  public object DeserializeObject(string text){using(var document=JsonDocument.Parse(text))return ConvertValue(document.RootElement);}
  public string Serialize(object value){return JsonSerializer.Serialize(value);}
 }
}
namespace NativeVideo {
 public static class Files {public static string HashText(string value){return value;}public static string Under(string root,string file){return Path.Combine(root,file);}public static void CopyFile(string from,string to){throw new NotSupportedException();}public static void Atomic(string file,string value){throw new NotSupportedException();}}
 public static class Commands {public static Task<double> Duration(string value){throw new NotSupportedException();}}
 public static class ProjectAssets {public static bool SingleLineHint(string command,object sentence,object args){return false;}}
 public static class GpuEncoding {public static string NormalizeMode(string mode){return mode;}}
'@
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-manual-cuts-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $source=$shim+(SourceClass 'J')+(SourceClass 'Settings')+"`n}"
 $shimPath=Join-Path $temp 'Shim.cs';[IO.File]::WriteAllText($shimPath,$source,[Text.UTF8Encoding]::new($false))
 Add-Type -Path @($shimPath,(Join-Path $root 'src/ManualCuts.cs'),(Join-Path $root 'src/SegmentPlan.cs'),(Join-Path $root 'src/VideoWorkflow.cs'),(Join-Path $PSScriptRoot 'ManualCutChecks.cs'))
 $count=[NativeVideo.ManualCutChecks]::Run()
 Write-Output "PASS $count production C# manual-cut checks"
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

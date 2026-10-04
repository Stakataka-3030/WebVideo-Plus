param([string]$OutputRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 required for portable source checks'}
$root=Split-Path $PSScriptRoot -Parent
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-routing-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $shim=@'
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
namespace System.Web.Script.Serialization {
 public class JavaScriptSerializer {
  public int MaxJsonLength {get;set;}
  public T Deserialize<T>(string json){using(var doc=JsonDocument.Parse(json))return (T)Read(doc.RootElement);}
  static object Read(JsonElement value){switch(value.ValueKind){case JsonValueKind.Object:return value.EnumerateObject().ToDictionary(p=>p.Name,p=>Read(p.Value));case JsonValueKind.Array:return value.EnumerateArray().Select(Read).ToArray();case JsonValueKind.String:return value.GetString();case JsonValueKind.True:return true;case JsonValueKind.False:return false;case JsonValueKind.Number:return value.GetDouble();default:return null;}}
 }
}
'@
 $shimPath=Join-Path $temp 'Json.cs';[IO.File]::WriteAllText($shimPath,$shim)
 Add-Type -Path @((Join-Path $root 'craft/installer/ProductRouting.cs'),(Join-Path $PSScriptRoot 'InstallerProductRoutingChecks.cs'),(Join-Path $PSScriptRoot 'fixtures/update-channel/terre-1.1.6-release-evaluator.cs'),$shimPath) -IgnoreWarnings -WarningAction SilentlyContinue
 [InstallerProductRoutingChecks]::Run($temp)
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

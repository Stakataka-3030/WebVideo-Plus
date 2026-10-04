# Compile the actual installer helper with a test-only serializer bridge.
# All executables and shortcuts are inert fixtures; no Windows host is launched.
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 is required for this portable test.'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-setup-contracts-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $shim=@'
using System;using System.Linq;using System.Text.Json;
namespace System.Web.Script.Serialization {
 public sealed class JavaScriptSerializer {
  public int MaxJsonLength{get;set;}
  static object ConvertValue(JsonElement value){switch(value.ValueKind){case JsonValueKind.Object:return value.EnumerateObject().ToDictionary(p=>p.Name,p=>ConvertValue(p.Value));case JsonValueKind.Array:return value.EnumerateArray().Select(ConvertValue).ToArray();case JsonValueKind.String:return value.GetString();case JsonValueKind.Number:return value.GetDouble();case JsonValueKind.True:return true;case JsonValueKind.False:return false;default:return null;}}
  public T Deserialize<T>(string text){using(var document=JsonDocument.Parse(text))return (T)ConvertValue(document.RootElement);}
  public string Serialize(object value){return JsonSerializer.Serialize(value);}
 }
}
'@
 $shimPath=Join-Path $temp 'Shim.cs';[IO.File]::WriteAllText($shimPath,$shim,[Text.UTF8Encoding]::new($false))
 Add-Type -IgnoreWarnings -WarningAction SilentlyContinue -Path @((Join-Path $PSScriptRoot '../craft/installer/ManifestVerifier.cs'),(Join-Path $PSScriptRoot '../craft/installer/SetupContracts.cs'),(Join-Path $PSScriptRoot '../craft/tests/SetupContractChecks.cs'),$shimPath)
 [SetupContractChecks]::Run()
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }

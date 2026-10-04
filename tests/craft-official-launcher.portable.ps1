# Actual C# launcher pure methods; no registry access or native process execution.
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 required for portable source checks'}
$root=Split-Path $PSScriptRoot -Parent
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-official-contract-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $shim=@'
using System.Web;using System.Text.Json;
namespace System.Web.Script.Serialization {
 public class JavaScriptSerializer {
  public T Deserialize<T>(string json){return JsonSerializer.Deserialize<T>(json);}
  public string Serialize(object value){return JsonSerializer.Serialize(value);}
 }
}
'@
 $shimPath=Join-Path $temp 'Json.cs';[IO.File]::WriteAllText($shimPath,$shim)
 Add-Type -Path @((Join-Path $root 'craft/update/OfficialInstallerLauncher.cs'),(Join-Path $root 'craft/tests/OfficialInstallerContractChecks.cs'),$shimPath) -IgnoreWarnings -WarningAction SilentlyContinue
 [OfficialInstallerContractChecks]::Run()
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

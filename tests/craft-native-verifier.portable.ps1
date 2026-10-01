# Compile the actual native manifest/path verifier on PowerShell 7. Test payload
# executables are inert text fixtures and are never executed.
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 is required for this portable test.'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-native-verifier-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $shim=@'
using System;using System.Linq;using System.Text.Json;
namespace System.Web.Script.Serialization {
 public sealed class JavaScriptSerializer {
  public int MaxJsonLength{get;set;}
  static object ConvertValue(JsonElement value){switch(value.ValueKind){case JsonValueKind.Object:return value.EnumerateObject().ToDictionary(p=>p.Name,p=>ConvertValue(p.Value));case JsonValueKind.Array:return value.EnumerateArray().Select(ConvertValue).ToArray();case JsonValueKind.String:return value.GetString();case JsonValueKind.Number:return value.GetDouble();case JsonValueKind.True:return true;case JsonValueKind.False:return false;default:return null;}}
  public T Deserialize<T>(string text){using(var document=JsonDocument.Parse(text))return (T)ConvertValue(document.RootElement);}
 }
}
public static class CraftVerifierTest {
 public static object Verify(string root){return CraftManifestVerifier.Verify(root,true);}
 public static object Launch(string state,string launcher){return CraftManifestVerifier.VerifyLaunch(state,launcher);}
}
'@
 $shimPath=Join-Path $temp 'Shim.cs';[IO.File]::WriteAllText($shimPath,$shim,[Text.UTF8Encoding]::new($false))
 Add-Type -Path @((Join-Path $PSScriptRoot '../craft/installer/ManifestVerifier.cs'),$shimPath)
 $fixture=Join-Path $temp 'fixture'
 & node (Join-Path $PSScriptRoot 'craft-native-verifier-fixture.mjs') $fixture
 if($LASTEXITCODE -ne 0){throw 'Fixture preparation failed.'}
 $config=Join-Path $fixture 'adapter/config.json';$hostExe=Join-Path $fixture 'host/webgal-craft.exe';$original=Join-Path $fixture 'host/webgal-craft.webvideo-original.exe';$adapter=Join-Path $fixture 'adapter'
 [void][CraftVerifierTest]::Verify($adapter);[void][CraftVerifierTest]::Launch($config,$hostExe);[void][CraftVerifierTest]::Launch($config,(Join-Path $adapter 'WebVideoCraft.Launcher.exe'));Write-Output 'PASS native verifier accepts owned external launcher and same-name wrapper'
 function Reject([scriptblock]$action,[string]$name){$failed=$false;try{& $action}catch{$failed=$true};if(-not $failed){throw "Native verifier accepted $name"};Write-Output "PASS native verifier rejects $name"}
 foreach($file in @($original,(Join-Path $adapter 'craft/launch-injected.mjs'),$hostExe)){$before=[IO.File]::ReadAllBytes($file);try{[IO.File]::AppendAllText($file,'tampered');Reject {[void][CraftVerifierTest]::Launch($config,$hostExe)} ([IO.Path]::GetFileName($file))}finally{[IO.File]::WriteAllBytes($file,$before)}}
 [IO.File]::WriteAllText((Join-Path $adapter 'unlisted.txt'),'unexpected');Reject {[void][CraftVerifierTest]::Verify($adapter)} 'unlisted package entry';Remove-Item (Join-Path $adapter 'unlisted.txt')
 $before=[IO.File]::ReadAllBytes($config);try{$state=Get-Content $config -Raw|ConvertFrom-Json;$state.originalExe=Join-Path $fixture 'foreign.exe';$state|ConvertTo-Json -Depth 10|Set-Content $config;Reject {[void][CraftVerifierTest]::Launch($config,$hostExe)} 'foreign original path'}finally{[IO.File]::WriteAllBytes($config,$before)}
 Write-Output 'Native manifest/path source checks passed: 6 rejection/acceptance groups. Windows wrapper execution remains separate.'
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

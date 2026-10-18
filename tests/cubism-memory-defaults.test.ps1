# Execute the production settings validator on Windows .NET Framework.
param([string]$OutputRoot = (Join-Path $PSScriptRoot '../.build/memory-defaults'))
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$core=[IO.File]::ReadAllText((Join-Path $repo 'src/Core.cs'))
function SourceClass([string]$name){
 $start=$core.IndexOf(' public static class '+$name+' {')
 if($start -lt 0){throw "Missing production class $name"}
 $match=[regex]::Match($core.Substring($start+1),'(?m)^ public (?:static |sealed )?class ')
 $end=if($match.Success){$start+1+$match.Index}else{$core.LastIndexOf('}')}
 $core.Substring($start,$end-$start)
}
$code=@'
using System;using System.IO;using System.Linq;using System.Text;using System.Collections;using System.Collections.Generic;using System.Diagnostics;using System.Globalization;using System.Security.Cryptography;using System.Threading;using System.Threading.Tasks;using System.Web.Script.Serialization;
namespace NativeVideo {
 public static class Files {public static void Atomic(string path,string text){throw new NotSupportedException();}}
 public static class ManualCuts {public static bool Enabled(object settings){return false;}public static object Parse(string value,int fps){throw new NotSupportedException();}}
 public static class GpuEncoding {public static string NormalizeMode(string mode){return mode;}}
 public static class MemoryDefaultChecks {
  static int checks;
  static void Check(object supplied,int expected){var value=Settings.Validate(supplied);if(J.N(value,"cubismCoreInitialMemoryMiB")!=expected)throw new Exception("memory mismatch: "+J.Text(value));var roundTrip=Settings.Validate(J.Parse(J.Text(value)));if(J.N(roundTrip,"cubismCoreInitialMemoryMiB")!=expected)throw new Exception("persisted override changed");checks+=2;}
  public static int Main(){Check(null,128);Check(J.O(),128);Check(J.O("workers",8),128);foreach(var memory in new[]{0,16,64,128,256,1024})Check(J.O("cubismCoreInitialMemoryMiB",memory),memory);foreach(var memory in new[]{-1d,1d,15d,128.5d,1025d}){bool rejected=false;try{Settings.Validate(J.O("cubismCoreInitialMemoryMiB",memory));}catch(ArgumentException){rejected=true;}if(!rejected)throw new Exception("invalid value accepted: "+memory);checks++;}Console.WriteLine("PASS "+checks+" production settings/default/persistence checks");return 0;}
 }
'@
$compatibility=if($core.Contains(' public static class CompatibilityCapture {')){SourceClass 'CompatibilityCapture'}else{''}
$code+=(SourceClass 'J')+$compatibility+(SourceClass 'Settings')+"`n}"
$run=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$source=Join-Path $run 'MemoryDefaults.cs';[IO.File]::WriteAllText($source,$code,[Text.UTF8Encoding]::new($false))
$exe=Join-Path $run 'MemoryDefaults.exe'
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe /main:NativeVideo.MemoryDefaultChecks ('/out:'+$exe) /r:System.Web.Extensions.dll $source
if($LASTEXITCODE -ne 0){throw 'Production memory settings compile failed'}
& $exe
if($LASTEXITCODE -ne 0){throw 'Production memory settings assertions failed'}

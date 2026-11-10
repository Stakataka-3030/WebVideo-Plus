param([string]$PackageRoot=(Join-Path (Split-Path $PSScriptRoot -Parent) 'package'))
$ErrorActionPreference='Stop'
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-timing-hash-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp|Out-Null
try {
 $code=@'
using System;using System.IO;using System.Reflection;using NativeVideo;
class TimingHashChecks {
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 static int Main(string[] args){
  var method=typeof(NativeVideo.QueueService).GetMethod("TimingSourceHash",BindingFlags.Static|BindingFlags.NonPublic);
  if(method==null)throw new Exception("Missing production TimingSourceHash");
  Func<object,string> hash=r=>(string)method.Invoke(null,new[]{r});
  string file=Path.Combine(args[0],"source.txt"),text="\uFEFF:hello;\r\n",expected=Files.HashText(VideoWorkflow.CanonicalSource(text));
  File.WriteAllText(file,text);
  Check(hash(J.O("sourceSnapshot",file))==expected,"Legacy source hash must canonicalize snapshot");
  var request=J.O("sourceSnapshot",file,"sourceHash",expected);
  File.WriteAllText(file,":changed;");
  Check(hash(request)==expected,"Stored source hash must describe original queued source");
  File.Delete(file);
  Check(hash(request)==expected,"Hash must survive cleanup");
  Check(hash(J.O("sourceSnapshot",file))=="","Legacy missing snapshot must return empty without failing");
  Console.WriteLine("PASS 4 actual kernel timing source hash checks");return 0;
 }
}
'@
 $source=Join-Path $temp 'TimingHashChecks.cs';[IO.File]::WriteAllText($source,$code)
 $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 $exe=Join-Path $temp 'TimingHashChecks.exe'
 & $compiler /nologo /target:exe /r:System.Web.Extensions.dll ('/r:'+(Join-Path $PackageRoot 'WebGAL.Video.exe')) ('/out:'+$exe) $source
 if($LASTEXITCODE -ne 0){throw 'Timing hash checks compilation failed'}
 Copy-Item -LiteralPath (Join-Path $PackageRoot 'WebGAL.Video.exe') -Destination $temp
 & $exe $temp
 if($LASTEXITCODE -ne 0){throw 'Timing hash checks failed'}
} finally {
 $resolved=[IO.Path]::GetFullPath($temp);$root=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
 if(-not $resolved.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe cleanup'}
 Remove-Item -LiteralPath $resolved -Force -Recurse
}

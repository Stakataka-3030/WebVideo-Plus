param([string]$Repo=(Join-Path $PSScriptRoot '..'),[string]$Output=(Join-Path $PSScriptRoot '../.build/render-eta'))
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$source=[IO.File]::ReadAllText((Join-Path $Repo 'src\JobRunner.cs'))
$begin=$source.IndexOf(' public sealed class RenderEtaEstimator');$end=$source.IndexOf(' public sealed class JobRunner',$begin)
$checks=@'
class Checks {
 static void Need(bool v,string m){if(!v)throw new System.Exception(m);}
 static void Main(){
  foreach(double speed in new[]{.2,1d,5d,60d,240d}){
   var e=new NativeVideo.RenderEtaEstimator(200000,60);double eta=0;int updates=0;
   for(int t=0;t<=80;t++){var v=e.Update(t,(int)(1+t*speed));if(v!=null){eta=(double)v;updates++;}}
   Need(updates>=60,"too few updates at "+speed);Need(System.Math.Abs(e.Rate-speed)/speed<.2,"rate stale "+speed+" got "+e.Rate);Need(eta>0,"ETA missing");
   System.Console.WriteLine("speed="+speed+" rate="+e.Rate+" updates="+updates);
   for(int t=81;t<=100;t++)e.Update(t,(int)(1+80*speed));Need(e.Rate==0,"stall not cleared");
  }
  var done=new NativeVideo.RenderEtaEstimator(10,60);Need((double)done.Update(1,10)==0,"completion");System.Console.WriteLine("PASS");
 }
}
'@
$code='using System;using System.Linq;using System.Collections.Generic;namespace NativeVideo {'+$source.Substring($begin,$end-$begin)+'}'+$checks
$file=Join-Path $Output 'eta-checks.cs';$exe=Join-Path $Output 'eta-checks.exe';[IO.File]::WriteAllText($file,$code)
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe ('/out:'+$exe) $file
if($LASTEXITCODE -ne 0){throw 'ETA checks build failed'}
& $exe
if($LASTEXITCODE -ne 0){throw 'ETA checks failed'}

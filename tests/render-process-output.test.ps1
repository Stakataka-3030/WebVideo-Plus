param([string]$RepositoryRoot=(Join-Path $PSScriptRoot '..'),[string]$OutputRoot=(Join-Path $env:TEMP 'webvideo-output-contract'))
$ErrorActionPreference='Stop'
$RepositoryRoot=[IO.Path]::GetFullPath($RepositoryRoot)
$run=Join-Path $OutputRoot ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$core=[IO.File]::ReadAllText((Join-Path $RepositoryRoot 'src/Core.cs'))
$begin=$core.IndexOf(' public static class Commands {')
$end=$core.IndexOf(' public static class GpuEncoding {',$begin)
if($begin -lt 0 -or $end -le $begin){throw 'Commands source boundary changed'}
$commands=$core.Substring($begin,$end-$begin)
$renderer=[IO.File]::ReadAllText((Join-Path $RepositoryRoot 'src/Renderer.cs'))
$domContract=[regex]::Match($renderer,'public static bool DialogueDomRequired\(object request\)\{[^\r\n]+').Value
if(-not $domContract){throw 'Production DOM contract missing'}
$preamble=@'
using System;using System.IO;using System.Linq;using System.Text;using System.Collections.Generic;using System.Diagnostics;using System.Threading;using System.Threading.Tasks;
namespace NativeVideo {
public static class Files {public static string Root=AppDomain.CurrentDomain.BaseDirectory;public static void Atomic(string path,string text){File.WriteAllText(path,text);}}
public sealed class CommandResult {public int Code;public string Text,Error;public byte[] Bytes;}
public static class J {public static object Parse(string value){return value;}public static double N(object value,string key){return 0;}public static object Get(object value,string key){object result;return value is Dictionary<string,object>&&((Dictionary<string,object>)value).TryGetValue(key,out result)?result:null;}public static bool B(object value,string key,bool fallback=false){var result=Get(value,key);return result==null?fallback:Convert.ToBoolean(result);}public static string S(object value,string key,string fallback=""){return Convert.ToString(Get(value,key)??fallback);}}
public static class LayerExport {public static bool IsStage(object request){return J.S(request,"exportKind")=="stage";}public static bool IsDialog(object request){return J.S(request,"exportKind")=="dialog";}}
'@
$checks=@'
public static class OutputChecks {
 static int checks;static void Check(bool value,string name){if(!value)throw new Exception(name);checks++;Console.WriteLine("PASS "+name);}
 static async Task Timeout(Task task,string name){var watch=Stopwatch.StartNew();try{await task;throw new Exception("No timeout: "+name);}catch(TimeoutException){Check(watch.ElapsedMilliseconds<2000,name);}}
 static Process Child(string mode){return Commands.Start(Path.Combine(Files.Root,"output-checks.exe"),new[]{mode},false,true);}
 static async Task Run(){
  var flags=new Dictionary<string,object>();Check(Renderer.DialogueDomRequired(flags),"full capture requires DOM");flags["exportKind"]="stage";Check(!Renderer.DialogueDomRequired(flags),"stage capture skips DOM");flags["exportKind"]="full";flags["gpuRawExport"]=true;flags["gpuRawDom"]=false;Check(!Renderer.DialogueDomRequired(flags),"raw stage-only pixels skip DOM");flags["exportKind"]="dialog";Check(Renderer.DialogueDomRequired(flags),"transparent dialog always requires DOM");flags.Clear();flags["gpuReadbackBenchmark"]=true;Check(!Renderer.DialogueDomRequired(flags),"readback benchmark skips DOM");flags.Clear();flags["gpuEncodeBenchmark"]=true;Check(!Renderer.DialogueDomRequired(flags),"encode benchmark without DOM skips DOM");flags["gpuEncodeDom"]=true;Check(Renderer.DialogueDomRequired(flags),"encode benchmark with DOM requires DOM");
  await Timeout(Commands.Await(new TaskCompletionSource<bool>().Task,50,"test"),"incomplete output task deadline");
  using(var cancel=new CancellationTokenSource(50)){try{await Commands.Await(new TaskCompletionSource<bool>().Task,5000,"test",cancel.Token);throw new Exception("Missing cancellation");}catch(OperationCanceledException){Check(true,"output task observes cancellation");}}
  using(var p=Child("stall")){var error=p.StandardError.ReadToEndAsync();await Timeout(Commands.WriteInput(p,error,new byte[8*1024*1024],100),"real pipe backpressure deadline");p.WaitForExit(2000);Check(p.HasExited,"backpressure stops owned child");}
  using(var p=Child("stall")){var error=p.StandardError.ReadToEndAsync();var stdout=p.StandardOutput.ReadToEndAsync();await Timeout(Commands.FinishInput(p,stdout,error,100,50),"real encoder exit deadline");p.WaitForExit(2000);Check(p.HasExited,"finalize timeout stops owned child");}
  using(var p=Child("exit")){var error=p.StandardError.ReadToEndAsync();p.WaitForExit(2000);await Timeout(Commands.FinishInput(p,new TaskCompletionSource<bool>().Task,error,100,50),"exited encoder output drain deadline");}
  using(var p=Child("exit")){var stdout=p.StandardOutput.ReadToEndAsync();p.WaitForExit(2000);await Timeout(Commands.FinishInput(p,stdout,new TaskCompletionSource<string>().Task,100,50),"exited encoder stderr drain deadline");}
  using(var p=Child("echo")){var error=p.StandardError.ReadToEndAsync();var stdout=p.StandardOutput.ReadToEndAsync();await Commands.WriteInput(p,error,Encoding.UTF8.GetBytes("frame"));var message=await Commands.FinishInput(p,stdout,error,2000,1000);Check(await stdout=="frame"&&message=="diagnostic"&&p.ExitCode==0,"successful real pipe write close and drain");}
  var result=await Commands.Run(Path.Combine(Files.Root,"output-checks.exe"),new[]{"exit"},null,2000);Check(result.Code==0,"Commands.Run successful child");
  await Timeout(Commands.Run(Path.Combine(Files.Root,"output-checks.exe"),new[]{"stall"},null,100),"Commands.Run real process deadline");
  Console.WriteLine("CHECKS="+checks);
 }
 public static int Main(string[] args){try{if(args.Length>0){if(args[0]=="stall"){Thread.Sleep(10000);return 0;}if(args[0]=="echo"){Console.Write(Console.In.ReadToEnd());Console.Error.Write("diagnostic");}return 0;}Run().GetAwaiter().GetResult();return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}}
'@
$utf8=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $run 'output-checks.cs'),$preamble+$commands+"public static class Renderer {"+$domContract+"}"+$checks,$utf8)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $run 'output-checks.exe')) (Join-Path $run 'output-checks.cs')
if($LASTEXITCODE -ne 0){throw 'Production Commands compile failed'}
& $compiler /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $run 'process-guard.exe')) (Join-Path $RepositoryRoot 'bootstrap/process-guard.cs')
if($LASTEXITCODE -ne 0){throw 'Process guard fixture compile failed'}
& (Join-Path $run 'output-checks.exe') | Tee-Object -FilePath (Join-Path $run 'checks.log')
if($LASTEXITCODE -ne 0){throw "Output contract failed: $run"}
Write-Output "Evidence: $run"

using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Diagnostics;using System.Threading;using System.Threading.Tasks;
namespace NativeVideo {
 public static class GpuBenchmark {
  public static async Task Run(object request){
   string dir=J.S(request,"jobDir"),output=Files.Full(J.S(request,"output")),planning=Path.Combine(dir,"planning");Directory.CreateDirectory(dir);string errorFile=Path.Combine(dir,"benchmark-error.txt");if(File.Exists(errorFile))File.Delete(errorFile);try{
   var settings=Settings.Validate(J.Get(request,"settings"));int fps=(int)J.N(settings,"fps"),workers=(int)J.N(settings,"workers"),requested=(int)J.N(request,"gpuBenchmarkFrames",300);if(requested<30||requested>3000)throw new ArgumentException("GPU benchmark 帧数需要在 30–3000 之间");
   var began=Stopwatch.StartNew();await Planner.Create(request,o=>Files.Append(Path.Combine(dir,"benchmark-progress.jsonl"),o));var timing=J.Read(Path.Combine(planning,"timing-plan.json"));var bounds=VideoWorkflow.Bounds(timing,J.Get(request,"range"),fps);int start=(int)J.N(bounds,"startFrame"),available=(int)J.N(bounds,"totalFrames"),frames=Math.Min(requested,available);if(frames<1)throw new IOException("场景没有可 benchmark 的帧");
   var plan=J.Read(Path.Combine(planning,"prepared/plan.json"));var parts=Enumerable.Range(0,workers).Select(i=>{string part=Path.Combine(dir,"benchmark-parts",i.ToString("D3"));Directory.CreateDirectory(part);var render=new Dictionary<string,object>(J.D(request));render["partDir"]=part;render["startFrame"]=start;render["endFrame"]=start+frames;render["firstSimulationFrame"]=0;render["gpuBenchmark"]=true;render["gpuBenchmarkFrames"]=frames;J.Write(Path.Combine(part,"request.json"),render);return new{Index=i,Part=part,Request=Path.Combine(part,"request.json")};}).ToArray();
   Exception failed=null;try{await Task.WhenAll(parts.Select(async p=>{try{await Commands.Run(Files.Exe,new[]{"render","--request",p.Request,"--error-log",Path.Combine(p.Part,"error.log")},Path.Combine(p.Part,"runner.log"),600000);}catch(Exception e){throw new IOException("GPU benchmark worker "+p.Index+" 失败："+e.Message,e);}}));}catch(Exception e){failed=e;}if(failed!=null)throw failed;
   var results=parts.Select(p=>J.Read(Path.Combine(p.Part,"result.json"))).ToArray();var result=J.O("productVersion",VersionInfo.Product,"kernelVersion",VersionInfo.Kernel,"mode","gpu-capture-benchmark","requestedFrames",requested,"framesPerWorker",frames,"workers",workers,"fps",fps,"width",J.N(settings,"width"),"height",J.N(settings,"height"),"totalSeconds",began.Elapsed.TotalSeconds,"results",results);
   Files.EnsureParent(output);J.Write(output,result);Console.WriteLine(J.Text(result));}catch(Exception e){Files.Atomic(errorFile,e.ToString());throw;}
  }
 }
}

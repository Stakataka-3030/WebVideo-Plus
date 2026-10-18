using System;
using System.IO;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using NativeVideo;

class CraftQueueRealCancellationChecks {
 static readonly BindingFlags Private=BindingFlags.NonPublic|BindingFlags.Instance;
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static Task<HttpResponse> Action(QueueService queue,string id,string action){return (Task<HttpResponse>)typeof(QueueService).GetMethod("Authorized",Private).Invoke(queue,new object[]{new HttpRequest{Method="POST",Path="/api/jobs/"+id+"/"+action,Body=new byte[0]}});}
 static bool Alive(int pid){try{using(var p=Process.GetProcessById(pid))return !p.HasExited;}catch(ArgumentException){return false;}}
 static int Main(string[] args){
  string root=Path.GetFullPath(args[0]),state=Path.Combine(root,"state"),cache=Path.Combine(root,"work"),id=Guid.NewGuid().ToString(),record=Path.Combine(state,"jobs",id),work=Path.Combine(cache,id),output=Path.Combine(root,"output","completed.mp4"),marker=Path.Combine(root,"controlled-pids.json");
  var config=J.O("stateDir",state,"gamesRoot",Path.Combine(root,"games"),"terreDir",Path.Combine(root,"host"),"workDir",cache,"outputDir",Path.GetDirectoryName(output),"importLegacyUserData",false,"autoRefreshAiModels",false,"automaticBackups",false,"requireRuntimeParity",true);
  var queue=new QueueService(config);Directory.CreateDirectory(record);Directory.CreateDirectory(work);Directory.CreateDirectory(Path.GetDirectoryName(output));
  string project=Path.Combine(root,"game"),source=Path.Combine(record,"source.txt");Directory.CreateDirectory(Path.Combine(project,"game","scene"));File.WriteAllText(Path.Combine(project,"game","scene","start.txt"),"A:test;");File.WriteAllText(source,"A:test;");
  var request=J.O("id",id,"project",project,"recordDir",record,"jobDir",work,"cacheRoot",cache,"output",output,"scene","start.txt","sourceSnapshot",source,"sourceWasProvided",true);J.Write(Path.Combine(record,"request.json"),request);J.Write(Path.Combine(record,"status.json"),J.O("state","running","phase","encoding"));
  var jobs=(Dictionary<string,object>)typeof(QueueService).GetField("jobs",Private).GetValue(queue);jobs.Add(id,request);
  string partial=OwnedTemporaryOutput.Create(request,".webvideo-",".mp4");File.WriteAllText(partial,"owned partial");File.WriteAllText(output,"completed neighbor");
  var process=Commands.Start(Path.Combine(root,"node.exe"),new[]{Path.Combine(root,"controlled-runner.mjs"),marker});int child=0,grandchild=0;
  try{
   var deadline=DateTime.UtcNow.AddSeconds(10);while(!File.Exists(marker)&&DateTime.UtcNow<deadline)Thread.Sleep(25);Check(File.Exists(marker),"Controlled runner did not start");var pids=J.Read(marker);child=(int)J.N(pids,"runner");grandchild=(int)J.N(pids,"descendant");Check(Alive(child)&&Alive(grandchild),"Controlled tree was not live");
   typeof(QueueService).GetField("active",Private).SetValue(queue,process);typeof(QueueService).GetField("activeId",Private).SetValue(queue,id);
   Check(Action(queue,id,"cancel").GetAwaiter().GetResult().Status==200,"Cancel did not acknowledge");var pending=J.Read(Path.Combine(record,"status.json"));Check(J.S(pending,"phase")=="canceling"&&!J.B(pending,"cleanupComplete"),"Cancel acknowledged before cleanup state");Check(File.Exists(partial),"Cancel cleaned source before process observation");Check(typeof(QueueService).GetField("active",Private).GetValue(queue)!=null,"Cancel released the active slot early");
   Check(Action(queue,id,"cancel").GetAwaiter().GetResult().Status==200,"Repeated cancel was not idempotent");bool retryBlocked=false;try{Action(queue,id,"retry").GetAwaiter().GetResult();}catch(ArgumentException){retryBlocked=true;}Check(retryBlocked,"Retry bypassed the active cancellation slot");
   var observed=(Task)typeof(QueueService).GetMethod("ObserveProcess",Private).Invoke(queue,new object[]{id,process});Check(observed.Wait(15000),"Process observation did not converge");
   deadline=DateTime.UtcNow.AddSeconds(5);while((Alive(child)||Alive(grandchild))&&DateTime.UtcNow<deadline)Thread.Sleep(25);Check(!Alive(child)&&!Alive(grandchild),"Owned runner descendants survived guard cancellation");
   var final=J.Read(Path.Combine(record,"status.json"));Check(J.S(final,"state")=="canceled"&&J.S(final,"phase")=="canceled"&&J.B(final,"cleanupComplete"),"Cancellation did not reach terminal cleanup");Check(!File.Exists(partial),"Exact owned partial was retained");Check(File.ReadAllText(output)=="completed neighbor","Completed output changed");Check(typeof(QueueService).GetField("active",Private).GetValue(queue)==null,"Stopped process retained the active slot");
   queue.Stop();J.Write(Path.Combine(record,"status.json"),J.O("state","failed","phase","failed"));var fresh=new QueueService(config);fresh.Stop();Check(Action(fresh,id,"retry").GetAwaiter().GetResult().Status==200,"Cross-session retry failed");Check(J.S(J.Read(Path.Combine(record,"status.json")),"state")=="queued","Cross-session retry did not requeue");Check(File.ReadAllText(source)=="A:test;","Retry source changed");Console.WriteLine("PASS fresh QueueService reads persisted failed job and executes actual retry preparation from preserved source");
   Console.WriteLine("PASS actual QueueService cancel -> canceling -> guarded process tree exit -> ObserveProcess -> exact owned cleanup; double cancel/retry barrier/completed output preserved");return 0;
  }finally{try{if(!process.HasExited)process.Kill();}catch{}queue.Stop();}
 }
}

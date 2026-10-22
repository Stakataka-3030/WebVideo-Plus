using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Reflection;
using System.Collections.Generic;
using System.Threading.Tasks;
using NativeVideo;

class OutputReservationChecks {
 const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
 static int checks;
 static void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
 static void Put(string file,string text){Directory.CreateDirectory(Path.GetDirectoryName(file));File.WriteAllText(file,text,Files.Utf8);}
 static object Send(QueueService queue,object body){
  return ((Task<HttpResponse>)typeof(QueueService).GetMethod("Authorized",Private).Invoke(queue,new object[]{new HttpRequest{Method="POST",Path="/api/jobs",Body=Encoding.UTF8.GetBytes(J.Text(body))}})).GetAwaiter().GetResult().Json;
 }
 static object Body(string name,string output=null){return J.O("project","demo","scene","start.txt","fileName",name,"outputDir",output,"useMusicTimeline",false,"settings",J.O("gpuRawMode","traditional","engine","webgal"),"requestId",Guid.NewGuid().ToString());}
 static object Request(QueueService queue,object response){return ((Dictionary<string,object>)typeof(QueueService).GetField("jobs",Private).GetValue(queue))[J.S(response,"id")];}
 static string Enqueue(QueueService queue,string name,string output=null){return J.S(Request(queue,Send(queue,Body(name,output))),"output");}
 public static int Main(string[] args){try{return Run(Path.GetFullPath(args[0]));}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
 static int Run(string root){
  AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);
  string terre=Path.Combine(root,"terre"),state=Path.Combine(root,"state"),output=Path.Combine(root,"output"),scene=Path.Combine(terre,"data/games/demo/game/scene/start.txt");
  Put(scene,":fixture;");Put(Path.Combine(state,"user-data/sentinel.txt"),"isolated test state");
  var queue=new QueueService(J.O("stateDir",state,"gamesRoot",Path.Combine(terre,"data/games"),"terreDir",terre,"workDir",Path.Combine(root,"work"),"outputDir",output));
  // Keep jobs queued; this fixture checks reservation without starting render workers.
  typeof(QueueService).GetField("stopping",Private).SetValue(queue,true);
  try{
   var firstBody=Body("Result.mp4");var firstResponse=Send(queue,firstBody);string first=J.S(Request(queue,firstResponse),"output");
   Check(J.S(Send(queue,firstBody),"id")==J.S(firstResponse,"id"),"repeated request id returns the original job");
   string second=Enqueue(queue,"result.mp4");
   Check(Path.GetFileName(second)=="result (2).mp4","case-only filename must reserve result (2).mp4; actual "+Path.GetFileName(second));
   Put(first,"first output");string partial=Path.Combine(root,"second.partial");Put(partial,"second output");File.Move(partial,second);
   Check(File.ReadAllText(first)=="first output"&&File.ReadAllText(second)=="second output","both reserved outputs can be written without replacing the first");
   string third=Enqueue(queue,"result.mp4");
   Check(Path.GetFileName(third)=="result (3).mp4","same-name suffix skips both prior reservations");
   string fourth=Enqueue(queue,"result.mp4",output.ToUpperInvariant());
   Check(Path.GetFileName(fourth)=="result (4).mp4","directory casing shares the same reservation namespace");
   Put(Path.Combine(output,"OnDisk.mp4"),"existing output");string onDisk=Enqueue(queue,"ondisk.mp4");
   Check(Path.GetFileName(onDisk)=="ondisk (2).mp4"&&File.ReadAllText(Path.Combine(output,"OnDisk.mp4"))=="existing output","existing disk file remains protected");
   string elsewhere=Enqueue(queue,"Result.mp4",Path.Combine(root,"other-output"));
   Check(Path.GetFileName(elsewhere)=="Result.mp4","different output directory keeps the requested filename");
   var a=Task.Run(()=>Enqueue(queue,"Race.mp4"));var b=Task.Run(()=>Enqueue(queue,"race.mp4"));Task.WaitAll(a,b);
   Check(new[]{Path.GetFileName(a.Result),Path.GetFileName(b.Result)}.Count(n=>n.IndexOf(" (2)",StringComparison.Ordinal)>=0)==1,"concurrent case variants allocate exactly one suffix");
   Put(a.Result,"parallel first");string otherPartial=Path.Combine(root,"parallel.partial");Put(otherPartial,"parallel second");File.Move(otherPartial,b.Result);
   Check(File.ReadAllText(a.Result)=="parallel first"&&File.ReadAllText(b.Result)=="parallel second","concurrent reservations produce independent Windows files");
   J.Write(Path.Combine(root,"results.json"),J.O("passed",true,"checks",checks,"first",first,"second",second,"third",third,"fourth",fourth,"onDisk",onDisk,"elsewhere",elsewhere,"parallel",new[]{a.Result,b.Result}));
   Console.WriteLine("PASS "+checks+" production output reservation checks");return 0;
  }finally{queue.Stop();}
 }
}

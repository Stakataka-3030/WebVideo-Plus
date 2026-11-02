using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using NativeVideo;

public static class ExportDiagnosticsChecks {
 static int checks;static string root;
 static void Check(bool condition,string name){if(!condition)throw new Exception(name);checks++;Console.WriteLine("PASS "+name);}
 static bool Ready(object state){return J.S(state,"scene")=="prefix"&&J.N(state,"sentenceId")>=2751&&!J.B(state,"fastPreview");}
 static object State(string scene,int target,bool fast){return J.O("scene",scene,"sentenceId",target,"fastPreview",fast);}
 static async Task WaitChecks(){
  int calls=0;var budgets=new List<int>();
  var late=await StateWait.Run(async remaining=>{calls++;budgets.Add(remaining);await Task.Delay(80);return State("prefix",2751,false);},Ready,300);
  Check(Ready(late)&&calls==1&&budgets[0]>250,"late ready response uses overall deadline and one query");
  calls=0;var pending=new TaskCompletionSource<object>();var watch=Stopwatch.StartNew();
  try{await StateWait.Run(ms=>{calls++;return pending.Task;},Ready,60);throw new Exception("missing timeout");}
  catch(StateWaitTimeoutException error){Check(error.QueryPending&&calls==1&&watch.ElapsedMilliseconds<600,"unresponsive query has bounded deadline without replacement query");}
  pending.SetException(new IOException("late CDP failure"));
  calls=0;await StateWait.Run(ms=>{calls++;return Task.FromResult(calls==1?State("other",2751,false):calls==2?State("prefix",2750,false):calls==3?State("prefix",2751,true):State("prefix",2751,false));},Ready,300);
  Check(calls==4,"wrong scene unfinished target and fast preview cannot report ready");
  try{await StateWait.Run(ms=>Task.FromResult(State("other",2751,false)),Ready,65);throw new Exception("missing state timeout");}
  catch(StateWaitTimeoutException error){Check(J.S(error.LastState,"scene")=="other","deadline retains last wrong-scene observation");}
  calls=0;var canceled=new TaskCompletionSource<object>();
  using(var cancel=new CancellationTokenSource(30))try{await StateWait.Run(ms=>{calls++;return canceled.Task;},Ready,1000,cancel.Token);throw new Exception("missing cancellation");}
  catch(OperationCanceledException){Check(calls==1,"cancellation stops wait without issuing another CDP query");}
  canceled.SetResult(State("prefix",2751,false));
  try{await StateWait.Run(ms=>{throw new InvalidOperationException("engine fault");},Ready,100);throw new Exception("missing engine exception");}
  catch(InvalidOperationException error){Check(error.Message=="engine fault","engine error is not hidden by readiness polling");}
  try{await StateWait.Run(ms=>{Thread.Sleep(70);return Task.FromResult(State("prefix",2751,false));},Ready,20);throw new Exception("accepted past deadline");}
  catch(StateWaitTimeoutException){Check(true,"synchronous late completion cannot bypass overall deadline");}
 }
 static void Put(string file,string text){Files.Atomic(file,text);}
 static Dictionary<string,object> Request(string name){
  string cache=Path.Combine(root,name,"cache"),record=Path.Combine(root,name,"records","job"),work=Path.Combine(cache,"job");
  Directory.CreateDirectory(work);Directory.CreateDirectory(record);
  return J.O("id","job","jobDir",work,"recordDir",record,"cacheRoot",cache,"output",Path.Combine(root,"formal.mp4"));
 }
 static string RunFolder(object request){string record=J.S(request,"recordDir");return Path.Combine(record,"diagnostics",J.S(J.Read(Path.Combine(record,"diagnostics/current.json")),"run"));}
 static void Heavy(object request){string work=J.S(request,"jobDir");Put(Path.Combine(work,"parts/003/video.mp4"),"video");Put(Path.Combine(work,"parts/003/frame.png"),"frame");Put(Path.Combine(work,"parts/003/profile/Cookies"),"private");Put(Path.Combine(work,"planning/prepared/web/game/figure/model.model3.json"),"model");Put(Path.Combine(work,"planning/prepared/web/assets/runtime.js"),"runtime");Put(Path.Combine(work,"audio.wav"),"audio");}
 static void DiagnosticsChecks(){
  Put(Path.Combine(root,"formal.mp4"),"formal product");Put(Path.Combine(root,"original/scene.txt"),"original source");
  var request=Request("failed then success");string work=J.S(request,"jobDir"),record=J.S(request,"recordDir"),part=Path.Combine(work,"parts/003");Heavy(request);
  Put(Path.Combine(record,"source-at-queue.txt"),"source");Put(Path.Combine(record,"scene-at-queue/start.txt"),"source");Put(Path.Combine(record,"cubism-memory/planning.json"),"{}");
  Put(Path.Combine(work,"segment-plan.json"),"{}");J.Write(Path.Combine(work,"planning/scene-chain.json"),J.O("originMap",new[]{J.O("scene","chapter.txt","line",82),J.O("scene","chapter.txt","line",83),J.O("scene","chapter.txt","line",84)}));
  ExportDiagnostics.Begin(request);if(J.Get(request,"diagnosticInitError")!=null)throw new Exception(J.S(request,"diagnosticInitError"));var render=new Dictionary<string,object>(request);ExportDiagnostics.BeginAttempt(request,render,part,1);
  Put(Path.Combine(part,"request.json"),J.Text(render));Put(Path.Combine(part,"runner.log"),"first failure");
  ExportDiagnostics.Prefix(render,"export-prefix-003.txt","first\nsecond\nhello;\n",new[]{J.O("line",1,"script","first\nsecond","command","setTransform","atMs",2473833),J.O("line",3,"script","hello;","command","say","atMs",2473833)},2751,148430,148694);
  ExportDiagnostics.EndAttempt(request,part,1,new TimeoutException("first original exception"));
  ExportDiagnostics.BeginAttempt(request,render,part,2);Put(Path.Combine(part,"runner.log"),"second failure");ExportDiagnostics.EndAttempt(request,part,2,new TimeoutException("second original exception"));
  string run=RunFolder(request);
  Check(File.ReadAllText(Path.Combine(run,"parts/003/attempt-001/runner.log"))=="first failure"&&File.ReadAllText(Path.Combine(run,"parts/003/attempt-002/runner.log"))=="second failure","attempts preserve distinct original process logs");
  Check(J.N(J.A(J.Get(J.Read(Path.Combine(run,"parts/003/attempt-001/prefix-map.json")),"rows"))[0],"prefixLine")==1,"prefix and original source map written before restore");
  Check(J.N(J.A(J.Get(J.Read(Path.Combine(run,"parts/003/attempt-001/prefix-map.json")),"rows"))[1],"prefixLine")==3,"multiline statements map following commands to physical prefix lines");
  ExportDiagnostics.BeginAttempt(request,render,part,3);ExportDiagnostics.EndAttempt(request,part,3,new IOException("process could not start"));
  Check(!File.Exists(Path.Combine(run,"parts/003/attempt-003/runner.log")),"failed process start cannot inherit a previous attempt log");
  var archive=ExportDiagnostics.Failure(request,new TimeoutException("terminal original exception"));
  Check(J.S(archive,"status")=="complete"&&!Directory.Exists(work),"final failure archives text before deleting entire heavy cache");
  Check(File.ReadAllText(Path.Combine(run,"exception.json")).Contains("terminal original exception"),"original terminal exception retained");
  Check(Directory.GetFiles(Path.Combine(record,"diagnostics"),"*",SearchOption.AllDirectories).All(p=>new[]{".txt",".log",".json",".jsonl"}.Contains(Path.GetExtension(p))),"failed archive excludes frames media models runtime and browser data");
  Heavy(request);ExportDiagnostics.Begin(request);Put(Path.Combine(record,"runner.log"),"success after retry");Put(Path.Combine(record,"error.log"),"old failure");J.Write(Path.Combine(record,"status.json"),J.O("state","completed","phase","completed"));ExportDiagnostics.Reconcile(request);
  Check(!Directory.Exists(work)&&!Directory.Exists(Path.Combine(record,"diagnostics"))&&!Directory.Exists(Path.Combine(record,"scene-at-queue"))&&!File.Exists(Path.Combine(record,"runner.log"))&&!File.Exists(Path.Combine(record,"error.log")),"success after retry removes all attempts source diagnostics and work cache");
  Check(File.Exists(Path.Combine(record,"request.json"))&&File.Exists(Path.Combine(record,"status.json")),"minimal task history remains available");
  Check(File.ReadAllText(Path.Combine(root,"formal.mp4"))=="formal product"&&File.ReadAllText(Path.Combine(root,"original/scene.txt"))=="original source","formal product and original project remain untouched");
  var partial=Request("locked text");Heavy(partial);ExportDiagnostics.Begin(partial);string locked=Path.Combine(J.S(partial,"jobDir"),"parts/003/runner.log");Put(locked,"locked diagnostic");
  using(var handle=new FileStream(locked,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){
   var result=ExportDiagnostics.Failure(partial,new IOException("original failure despite collection error"));
   Check(J.S(result,"status")=="partial"&&J.B(result,"heavyCacheCleaned"),"collection failure is explicit partial without hiding original failure");
   Check(File.Exists(locked)&&!File.Exists(Path.Combine(J.S(partial,"jobDir"),"parts/003/video.mp4"))&&!File.Exists(Path.Combine(J.S(partial,"jobDir"),"planning/prepared/web/game/figure/model.model3.json")),"partial collection retains only selected fallback text not heavy cache");
  }
  var cli=Request("CLI same directory");cli["recordDir"]=cli["jobDir"];Heavy(cli);ExportDiagnostics.Begin(cli);string cliPlan=Path.Combine(J.S(cli,"jobDir"),"planning/prepared/plan.json");Put(cliPlan,"{}");
  using(var handle=new FileStream(cliPlan,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){
   var result=ExportDiagnostics.Failure(cli,new IOException("CLI failure"));Check(J.S(result,"status")=="partial"&&J.B(result,"heavyCacheCleaned")&&!File.Exists(Path.Combine(J.S(cli,"jobDir"),"audio.wav")),"CLI partial collection removes root audio and heavy subdirectories");
  }
  var cliComplete=Request("CLI complete cleanup");cliComplete["recordDir"]=cliComplete["jobDir"];Heavy(cliComplete);string cliRoot=J.S(cliComplete,"jobDir");Put(Path.Combine(cliRoot,"webgal-audio-full.wav"),"full mix");Put(Path.Combine(cliRoot,"imported-music/input.mp3"),"imported audio");Put(Path.Combine(cliRoot,"audio-export.log"),"original audio encoder failure");ExportDiagnostics.Begin(cliComplete);
  var cliArchive=ExportDiagnostics.Failure(cliComplete,new IOException("audio export failure"));
  Check(J.S(cliArchive,"status")=="complete"&&!File.Exists(Path.Combine(cliRoot,"webgal-audio-full.wav"))&&!Directory.Exists(Path.Combine(cliRoot,"imported-music"))&&File.ReadAllText(Path.Combine(RunFolder(cliComplete),"final/audio-export.log"))=="original audio encoder failure","CLI complete failure archives audio log and removes full mix and imported audio");
  Put(Path.Combine(cliRoot,"segment-plan.json"),"{}");Put(Path.Combine(cliRoot,"merge.log"),"merge diagnostic");J.Write(Path.Combine(cliRoot,"status.json"),J.O("state","completed"));ExportDiagnostics.Reconcile(cliComplete);
  Check(!File.Exists(Path.Combine(cliRoot,"segment-plan.json"))&&!File.Exists(Path.Combine(cliRoot,"merge.log"))&&!File.Exists(Path.Combine(cliRoot,"audio-export.log"))&&!Directory.Exists(Path.Combine(cliRoot,"diagnostics"))&&File.Exists(Path.Combine(cliRoot,"status.json")),"CLI success removes root diagnostic logs and plans while retaining minimal history");
  var blocked=Request("blocked diagnostics");Heavy(blocked);Put(Path.Combine(J.S(blocked,"recordDir"),"diagnostics"),"not a directory");string cwd=Environment.CurrentDirectory,sentinel=Path.Combine(root,"cwd");Directory.CreateDirectory(sentinel);Put(Path.Combine(sentinel,"MANIFEST.json"),"package manifest sentinel");
  try{Environment.CurrentDirectory=sentinel;var result=ExportDiagnostics.Failure(blocked,new IOException("collection cannot initialize"));Check(J.S(result,"status")=="partial"&&File.ReadAllText(Path.Combine(sentinel,"MANIFEST.json"))=="package manifest sentinel"&&!File.Exists(Path.Combine(sentinel,"summary.txt")),"diagnostic initialization failure never writes relative manifest or summary");}finally{Environment.CurrentDirectory=cwd;}
  var interrupted=Request("interrupted current policy");Heavy(interrupted);ExportDiagnostics.Begin(interrupted);J.Write(Path.Combine(J.S(interrupted,"recordDir"),"status.json"),J.O("state","failed","message","service restarted","runnerPid",int.MaxValue));ExportDiagnostics.Reconcile(interrupted);
  Check(!Directory.Exists(J.S(interrupted,"jobDir"))&&J.Get(J.Read(Path.Combine(J.S(interrupted,"recordDir"),"status.json")),"diagnosticArchive")!=null&&J.B(J.Read(Path.Combine(J.S(interrupted,"recordDir"),"status.json")),"requiresNewExport"),"exited interrupted new-policy job is archived and pruned on reconciliation");
  var rootLink=Request("root junction");ExportDiagnostics.Begin(rootLink);var rootResult=ExportDiagnostics.Failure(rootLink,new IOException("linked root"));
  Check(J.S(rootResult,"status")=="partial"&&!J.B(rootResult,"heavyCacheCleaned")&&File.ReadAllText(Path.Combine(root,"root junction/external/sentinel.txt"))=="external root sentinel","root junction is refused without touching external content");
  var childLink=Request("child junction");ExportDiagnostics.Begin(childLink);var childResult=ExportDiagnostics.Failure(childLink,new IOException("linked child"));
  Check(J.S(childResult,"status")=="partial"&&File.ReadAllText(Path.Combine(root,"child junction/external/sentinel.txt"))=="external child sentinel","child junction cleanup removes only link and preserves external content");
  var cliLink=Request("cli junction");cliLink["recordDir"]=cliLink["jobDir"];ExportDiagnostics.Begin(cliLink);string cliLocked=Path.Combine(J.S(cliLink,"jobDir"),"parts/003/runner.log");Put(cliLocked,"fallback log");Put(Path.Combine(J.S(cliLink,"jobDir"),"audio.wav"),"audio");
  using(var handle=new FileStream(cliLocked,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){
   var result=ExportDiagnostics.Failure(cliLink,new IOException("CLI linked planning"));Check(J.S(result,"status")=="partial"&&J.B(result,"heavyCacheCleaned")&&File.ReadAllText(Path.Combine(root,"cli junction/external/sentinel.txt"))=="external cli sentinel"&&!Directory.Exists(Path.Combine(J.S(cliLink,"jobDir"),"planning")),"CLI partial cleanup never traverses a planning junction");
  }
  var overlap=Request("formal output overlap");overlap["recordDir"]=overlap["jobDir"];string existing=Path.Combine(J.S(overlap,"jobDir"),"planning/keep.mp4");overlap["output"]=existing;Put(existing,"existing formal output");
  try{new JobRunner(overlap).Run().GetAwaiter().GetResult();throw new Exception("overlapping output accepted");}catch(IOException){Check(!Directory.Exists(Path.Combine(J.S(overlap,"jobDir"),"diagnostics")),"overlapping output is rejected before job setup or failure cleanup");}
  var overlapResult=ExportDiagnostics.Failure(overlap,new IOException("existing output"));Check(!J.B(overlapResult,"heavyCacheCleaned")&&File.ReadAllText(existing)=="existing formal output","even fallback cleanup refuses to delete an overlapping formal product");
  var legacy=Request("legacy");Heavy(legacy);J.Write(Path.Combine(J.S(legacy,"recordDir"),"status.json"),J.O("state","failed","message","old task"));ExportDiagnostics.Reconcile(legacy);
  Check(Directory.Exists(J.S(legacy,"jobDir")),"new cleanup does not retrospectively delete legacy history caches");
  var canceled=Request("canceled");Heavy(canceled);ExportDiagnostics.Begin(canceled);J.Write(Path.Combine(J.S(canceled,"recordDir"),"status.json"),J.O("state","canceled"));ExportDiagnostics.Reconcile(canceled);
  Check(File.Exists(Path.Combine(J.S(canceled,"jobDir"),"parts/003/video.mp4")),"cancel keeps the existing continuation convention");
  var analysis=Request("analysis");analysis["analysisOnly"]=true;ExportDiagnostics.Begin(analysis);Put(Path.Combine(J.S(analysis,"recordDir"),"timing-plan.json"),"functional analysis result");J.Write(Path.Combine(J.S(analysis,"recordDir"),"status.json"),J.O("state","completed"));ExportDiagnostics.Reconcile(analysis);
  Check(File.Exists(Path.Combine(J.S(analysis,"recordDir"),"timing-plan.json")),"successful analysis preserves its functional result");
#if CRAFT
  var subtitleLease=Request("owned SRT temporary output");subtitleLease["output"]=Path.Combine(root,"formal-subtitles.srt");string temporary=OwnedTemporaryOutput.Create(subtitleLease,".webvideo-subtitle-",".srt");Put(temporary,"interrupted SRT write");OwnedTemporaryOutput.Cleanup(subtitleLease);
  Check(!File.Exists(temporary)&&Directory.GetFiles(J.S(subtitleLease,"recordDir"),"temporary-output-*.json").Length==0,"Craft cancellation can reclaim an owned interrupted SRT output");
#endif
 }
 public static int Main(string[] args){try{AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);Files.Root=root;J.Write(Path.Combine(root,"product.json"),J.O("version","test","kernelVersion","test"));WaitChecks().GetAwaiter().GetResult();DiagnosticsChecks();Console.WriteLine("CHECKS="+checks);return 0;}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}

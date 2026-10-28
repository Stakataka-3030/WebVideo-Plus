using System;using System.IO;using System.Linq;using NativeVideo;
class DialogueSubtitlesChecks {
 static int checks;static void Check(bool value,string label){checks++;if(!value)throw new Exception(label);}
 static object E(double at,string key,string text,bool append=false,string speaker="甲",bool visible=true){return J.O("atMs",at,"dialogue",J.O("key",key,"text",text,"append",append,"speaker",speaker,"visible",visible));}
 static object T(params object[] events){return J.O("dialogueSchemaVersion",1,"durationSeconds",6,"sourceEvents",events);}
 static object B(double start=0,double duration=6){return J.O("startSeconds",start,"durationSeconds",duration,"storyScope","full");}
 static string S(object t,bool speaker=false,object bounds=null){int count;return DialogueSubtitles.Build(t,bounds??B(),speaker,out count);}
 static int Main(string[] args){try{Run(args);return 0;}catch(Exception e){Console.WriteLine("After "+checks+" checks: "+e.GetType().FullName+": "+e.Message+"\n"+e.StackTrace);return 1;}}
 static void Run(string[] args){
  var timeline=T(E(0,"a","前句"),E(1000,"b","后句"),E(2000,"b","后句",true),E(3000,"b","后句追加",true),E(4500,"c","结尾"));
  string s=S(timeline);Check(s.Contains("00:00:01,000 --> 00:00:03,000\r\n后句"),"empty concat holds prior cue");Check(s.Contains("00:00:03,000 --> 00:00:04,500\r\n追加"),"concat emits only tail");Check(!s.Contains("后句追加"),"no repeated concat prefix");Check(s.Contains("00:00:04,500 --> 00:00:06,000"),"last cue final plan end");
  s=S(timeline,false,B(2.5,2));Check(s.StartsWith("1\r\n00:00:00,000 --> 00:00:00,500\r\n后句"),"range carries active cue and zero origin");Check(s.Contains("00:00:00,500 --> 00:00:02,000\r\n追加"),"range clips end");
  s=S(T(E(0,"a","相同"),E(1000,"b","相同")));Check(s.Contains("2\r\n00:00:01,000"),"same text new native key repeats");
  s=S(T(E(0,"a","文字"),E(1000,"a","文字",true,"乙")),true);Check(s.Contains("甲：文字")&&s.Contains("乙：文字"),"speaker changes split when included");
  s=S(T(E(0,"a","文字"),E(1000,"a","文字",true,"乙")));Check(!s.Contains("2\r\n"),"speaker excluded coalesces same body");
  s=S(T(E(0,"a","文字"),E(1000,"b",""),E(2000,"c","恢复"),E(3000,"c","恢复",false,"甲",false)));Check(s.Contains("00:00:00,000 --> 00:00:01,000")&&s.Contains("00:00:02,000 --> 00:00:03,000"),"empty say and textbox hide end cue");
  s=S(T(E(0,"a","首行\n次行 & <literal>")));Check(s.Contains("首行\r\n次行 &amp; &lt;literal&gt;"),"plain text escaping and newlines");
  s=S(T(E(0,"a","甲"),E(0,"a","甲乙",true)));Check(s.Contains("甲乙")&&!s.Contains("2\r\n"),"same timestamp append merges");
  s=S(T(E(0,"a","Hello"),E(0,"a","Hello world",true)));Check(s.Contains("Hello world"),"same timestamp concat preserves separating space");
  s=S(T(E(0,"a","第一行\n\n\n末行")));Check(!s.Contains("第一行\r\n\r\n"),"blank text lines do not terminate SRT cue");
  s=S(T(E(0,"a","甲"),E(0,"b","乙")));Check(!s.Contains("\r\n甲\r\n")&&s.Contains("\r\n乙\r\n"),"zero duration cue skipped");
  s=S(T(E(0,"a","甲")),false,B(8,2));Check(s=="","no cue outside bounds");
  bool failed=false;try{S(J.O("durationSeconds",6));}catch(IOException){failed=true;}Check(failed,"old timing rejected without guessing");
  string folder=Path.GetFullPath(args[0]);Directory.CreateDirectory(folder);string file=Path.Combine(folder,"字幕 中文.srt");var request=J.O("exportKind","subtitles","includeSpeaker",true);DialogueSubtitles.Write(timeline,B(),request,file);byte[] bytes=File.ReadAllBytes(file);Check(bytes.Length>0&&!(bytes[0]==239&&bytes[1]==187&&bytes[2]==191),"UTF8 without BOM");
  failed=false;try{DialogueSubtitles.Write(timeline,B(),request,file);}catch(IOException){failed=true;}Check(failed,"existing output not replaced");Check(Directory.GetFiles(folder,"*.partial.srt").Length==0,"owned partial cleaned");
  Check(LayerExport.RequiredExtension("subtitles",true)==".srt"&&LayerExport.Kind(request)=="subtitles","queue output kind");
  var scoped=T(E(0,"a","前场景"),E(2500,"b","当前场景"));J.D(scoped)["storyTimeline"]=J.O("currentStartSeconds",2,"currentEndSeconds",4);J.D(scoped)["lineTimes"]=new object[]{0,2500,4000};
  s=S(scoped,false,VideoWorkflow.Bounds(scoped,null,30,"sceneOnly"));Check(s.Contains("00:00:00,000 --> 00:00:00,500\r\n前场景")&&s.Contains("00:00:00,500 --> 00:00:02,000\r\n当前场景"),"native scene scope clips and carries active dialogue");
  s=S(scoped,false,VideoWorkflow.Bounds(scoped,J.O("startLine",2,"endLine",2),30));Check(s.Contains("00:00:00,000 --> 00:00:01,500\r\n当前场景"),"native line selection bounds");
  // A cached final plan can export subtitles without envelopes, render plan,
  // FFmpeg, audio arguments or a browser. Engine/startup metadata remains valid.
  string work=Path.Combine(folder,"job"),planning=Path.Combine(work,"planning"),record=Path.Combine(folder,"record"),cachedOutput=Path.Combine(folder,"cached.srt");Directory.CreateDirectory(planning);
  J.Write(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"product.json"),J.O("version","fixture","kernelVersion","fixture"));
  string revision=(string)typeof(JobRunner).GetField("PipelineRevision",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic).GetRawConstantValue();
  J.Write(Path.Combine(planning,"native-version.json"),J.O("version","fixture","pipelineRevision",revision));J.Write(Path.Combine(planning,"timing-plan.json"),timeline);J.Write(Path.Combine(planning,"prepared/plan.json"),J.O("engine",J.O("id","webgal"),"runtimeStartup",J.O("language",0,"code","zh_CN","source","project-default")));
  var cached=J.O("exportKind","subtitles","includeSpeaker",true,"retry",true,"jobDir",work,"recordDir",record,"cacheRoot",folder,"output",cachedOutput,"settings",J.O("fps",30,"workers",1),"gpuRawExport",true,"gpuRawCodec","nvenc");
  new JobRunner(cached).Run().GetAwaiter().GetResult();
  Check(File.ReadAllText(cachedOutput).Contains("甲：后句"),"runner uses final saved plan and speaker option");var status=J.Read(Path.Combine(record,"status.json"));Check(J.S(status,"state")=="completed"&&J.N(J.Get(status,"result"),"cueCount")==4,"runner completed subtitle result");Check(!Directory.Exists(work),"runner cleans only owned work cache");Check(File.Exists(Path.Combine(record,"timing-plan.json")),"final timing retained as evidence");
  // Invoke the production request handler directly: no HTTP listener or worker.
  string queueRoot=Path.Combine(folder,"queue"),terre=Path.Combine(queueRoot,"terre"),games=Path.Combine(terre,"data/games"),queueState=Path.Combine(queueRoot,"state");
  Files.Atomic(Path.Combine(games,"demo/game/scene/start.txt"),":正文;");Files.Atomic(Path.Combine(queueState,"user-data/sentinel.txt"),"owned fixture");
  var cfg=J.O("terreDir",terre,"gamesRoot",games,"stateDir",queueState,"workDir",Path.Combine(queueRoot,"work"),"outputDir",Path.Combine(queueRoot,"output"),"modules",new string[0]);
  var queue=new QueueService(cfg);var flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;
  typeof(QueueService).GetField("stopping",flags).SetValue(queue,true);
  try{
   Func<object,object> send=dto=>((System.Threading.Tasks.Task<HttpResponse>)typeof(QueueService).GetMethod("Authorized",flags).Invoke(queue,new object[]{new HttpRequest{Method="POST",Path="/api/jobs",Body=System.Text.Encoding.UTF8.GetBytes(J.Text(dto))}})).GetAwaiter().GetResult().Json;
   Func<bool,object> body=speaker=>J.O("project","demo","scene","start.txt","exportKind","subtitles","fileName","对白.srt","includeSpeaker",speaker,"requestId",Guid.NewGuid().ToString(),"settings",J.O("mode","manual","holdSeconds",1,"gpuRawMode","traditional","engine","webgal"));
   bool rejected=false;try{send(body(true));}catch(IOException error){rejected=error.Message.Contains("字幕导出组件尚未安装");}Check(rejected,"production handler rejects SRT while module is disabled");
   J.D(cfg)["modules"]=new[]{"exporter","subtitles"};string prefs=Path.Combine(queueState,"settings.json"),beforePrefs=File.Exists(prefs)?File.ReadAllText(prefs):null;
   var firstBody=body(true);var firstReply=send(firstBody);var all=(System.Collections.Generic.Dictionary<string,object>)typeof(QueueService).GetField("jobs",flags).GetValue(queue);var firstRequest=all[J.S(firstReply,"id")];
   Check(J.B(firstRequest,"includeSpeaker")&&J.S(firstRequest,"exportKind")=="subtitles"&&J.S(firstRequest,"output").EndsWith("对白.srt"),"queue retains subtitle kind, speaker and extension");
   Check(J.B(J.Read(Path.Combine(J.S(firstRequest,"recordDir"),"request.json")),"includeSpeaker"),"speaker option persists to the owned task record");
   var secondReply=send(body(false));var secondRequest=all[J.S(secondReply,"id")];Check(!J.B(secondRequest,"includeSpeaker")&&J.S(secondRequest,"output").EndsWith("对白 (2).srt"),"separate task keeps its speaker choice and output reservation");
   Check(J.S(send(firstBody),"id")==J.S(firstReply,"id")&&all.Count==2,"duplicate request returns the same subtitle task");
   Check((File.Exists(prefs)?File.ReadAllText(prefs):null)==beforePrefs,"subtitle enqueue does not overwrite saved video preferences");
  }finally{queue.Stop();}
  if(args.Length>1){Directory.CreateDirectory(args[1]);DialogueSubtitles.Write(timeline,B(),J.O("includeSpeaker",false),Path.Combine(args[1],"example.srt"));DialogueSubtitles.Write(timeline,B(),request,Path.Combine(args[1],"example-with-speaker.srt"));J.Write(Path.Combine(args[1],"synthetic-final-plan.json"),timeline);}
  Console.WriteLine("Dialogue subtitle checks passed: "+checks);
 }
}

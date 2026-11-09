using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Threading.Tasks;
namespace NativeVideo {
 public static class SceneChain {
  const int MaxScenes=256,MaxSceneFiles=4096;const long MaxSceneBytes=8L*1024*1024,MaxSnapshotBytes=128L*1024*1024;
  static void Collect(string dir,List<string> files){
   foreach(var child in Directory.GetDirectories(dir)){if((File.GetAttributes(child)&FileAttributes.ReparsePoint)!=0)throw new IOException("场景目录不能包含目录链接："+child);Collect(child,files);}
   foreach(var file in Directory.GetFiles(dir,"*.txt")){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new IOException("场景文件不能是链接："+file);files.Add(file);}
  }
  static List<string> SceneNames(string root){
   var files=new List<string>();Collect(root,files);if(files.Count>MaxSceneFiles)throw new IOException("场景文件过多，最多支持 "+MaxSceneFiles+" 个 .txt 文件");string prefix=Files.Full(root).TrimEnd('\\','/')+Path.DirectorySeparatorChar;
   return files.Select(file=>Files.Full(file).Substring(prefix.Length).Replace('\\','/')).OrderBy(x=>x,StringComparer.OrdinalIgnoreCase).ToList();
  }
  public static void SnapshotScenes(string project,string target){
   string root=Files.Full(Path.Combine(project,"game/scene")),copy=Files.Full(target);if(!Directory.Exists(root))throw new DirectoryNotFoundException("项目缺少 game/scene 目录");
   if(Directory.Exists(copy))Files.DeleteTree(Path.GetDirectoryName(copy),copy);Directory.CreateDirectory(copy);var files=new List<string>();Collect(root,files);if(files.Count>MaxSceneFiles)throw new IOException("场景文件过多，最多支持 "+MaxSceneFiles+" 个 .txt 文件");
   long bytes=0;string prefix=root.TrimEnd('\\','/')+Path.DirectorySeparatorChar;foreach(var file in files){var info=new FileInfo(file);if(info.Length>MaxSceneBytes)throw new IOException("单个场景超过 8 MB："+Path.GetFileName(file));bytes+=info.Length;if(bytes>MaxSnapshotBytes)throw new IOException("场景文本总大小超过 128 MB");string relative=Files.Full(file).Substring(prefix.Length);Files.CopyFile(file,Files.Under(copy,relative));}
  }
  public static string NormalizeScene(string value){
   value=(value??"").Trim().Replace('\\','/');if(value.StartsWith("./game/scene/",StringComparison.OrdinalIgnoreCase))value=value.Substring(13);else if(value.StartsWith("game/scene/",StringComparison.OrdinalIgnoreCase))value=value.Substring(11);else if(value.StartsWith("./"))value=value.Substring(2);
   if(string.IsNullOrWhiteSpace(value)||value.StartsWith("/")||value.IndexOf(':')>=0||value.IndexOf('?')>=0||value.IndexOf('#')>=0||value.IndexOf('$')>=0||value.IndexOf('{')>=0||value.IndexOf('}')>=0||value.Split('/').Any(x=>x==""||x=="."||x=="..")||!value.EndsWith(".txt",StringComparison.OrdinalIgnoreCase))return null;return value;
  }
  static string Fingerprint(string text){unchecked{uint h=2166136261;foreach(char c in text)h=(h^(uint)c)*16777619;return h.ToString("x")+":"+text.Length;}}
  static Dictionary<string,object> Params(object sentence){return ProjectAssets.Params(sentence);}
  static string StaticSuccessor(object parsed){
   var blockers=new HashSet<string>(new[]{"callScene","return","choose","chooseLabel","jumpLabel","getUserInput","if","setVar","showVars"});
   foreach(var sentence in J.A(J.Get(parsed,"sentenceList"))){
    if(J.B(sentence,"isLineBreakHolder"))continue;string command=J.N(sentence,"command",-1)==0?"say":J.S(sentence,"commandRaw");var args=Params(sentence);
    if(command=="end")return null;
    if(command=="changeScene")return args.Count==0?NormalizeScene(J.S(sentence,"content")):null;
    if(blockers.Contains(command)&&!(command=="choose"&&ProjectAssets.SingleLineHint(command,sentence,args)))return null;
   }return null;
  }
  static void Append(List<string> output,List<object> origins,string[] lines,string scene){
   for(int i=0;i<lines.Length;i++){output.Add(lines[i]);origins.Add(J.O("scene",scene,"line",i+1));}
  }
  public static async Task<object> Expand(string entryScene,string entrySource,string snapshotRoot,Func<string,string,Task<object>> parse){
   entryScene=NormalizeScene(entryScene)??entryScene.Replace('\\','/');var output=new List<string>();var origins=new List<object>();var scenes=new List<object>();var flattened=new List<object>();var chain=new List<string>();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);string current=entryScene,currentSource=VideoWorkflow.CanonicalSource(entrySource);
   var blockers=new HashSet<string>(new[]{"callScene","return","choose","chooseLabel","jumpLabel","getUserInput","if","setVar","showVars"});
   for(int depth=0;;depth++){
    if(depth>=MaxScenes)throw new IOException("场景跳转链过长，最多支持 "+MaxScenes+" 个场景");
    if(!seen.Add(current))throw new IOException("检测到循环场景跳转："+string.Join(" → ",chain.Concat(new[]{current})));chain.Add(current);
    string source=depth==0?currentSource:VideoWorkflow.CanonicalSource(File.ReadAllText(Files.Under(snapshotRoot,current)));scenes.Add(J.O("scene",current,"hash",Files.HashText(source),"fingerprint",Fingerprint(source),"lines",source.Split('\n').Length));
    var parsed=await parse(source,current);object candidate=null;Dictionary<string,object> candidateArgs=null;
    foreach(var sentence in J.A(J.Get(parsed,"sentenceList"))){
     if(J.B(sentence,"isLineBreakHolder"))continue;string command=J.N(sentence,"command",-1)==0?"say":J.S(sentence,"commandRaw");var args=Params(sentence);
     if(command=="end")break;
     if(command=="changeScene"){candidate=sentence;candidateArgs=args;break;}
     if(blockers.Contains(command)&&!(command=="choose"&&ProjectAssets.SingleLineHint(command,sentence,args)))break;
    }
    var lines=source.Split('\n');if(candidate==null){Append(output,origins,lines,current);break;}
    string target=candidateArgs.Count==0?NormalizeScene(J.S(candidate,"content")):null;if(target==null){Append(output,origins,lines,current);break;}
    int first=(int)J.N(candidate,"startLine",-1),last=(int)J.N(candidate,"endLine",first);if(first<0||last<first||last>=lines.Length)throw new IOException("场景跳转语句边界无效："+current);
    string targetFile;try{targetFile=Files.Under(snapshotRoot,target);}catch{Append(output,origins,lines,current);break;}if(!File.Exists(targetFile))throw new FileNotFoundException("场景跳转目标不存在："+target);
    var flattenedLines=(string[])lines.Clone();for(int i=first;i<=last;i++)flattenedLines[i]=i==first?"; WebVideo+ flattened changeScene -> "+target:"; WebVideo+ flattened changeScene";for(int i=last+1;i<flattenedLines.Length;i++)flattenedLines[i]="; WebVideo+ unreachable after changeScene";
    Append(output,origins,flattenedLines,current);flattened.Add(J.O("from",current,"to",target,"line",first+1,"endLine",last+1));current=target;
   }
   string signature=string.Join("\n",scenes.Select(x=>J.S(x,"scene")+":"+J.S(x,"hash")));return J.O("schemaVersion",2,"entryScene",entryScene,"script",string.Join("\n",output),"dependencyHash",Files.HashText(signature),"scenes",scenes.ToArray(),"flattened",flattened.ToArray(),"originMap",origins.ToArray());
  }
  public static async Task<object> BuildTimeline(string currentScene,string snapshotRoot,Func<string,string,Task<object>> parse){
   currentScene=NormalizeScene(currentScene)??currentScene.Replace('\\','/');var names=SceneNames(snapshotRoot);if(!names.Contains(currentScene,StringComparer.OrdinalIgnoreCase))throw new FileNotFoundException("当前场景不在场景快照中："+currentScene);
   var successors=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);var metadata=new Dictionary<string,object>(StringComparer.OrdinalIgnoreCase);var predecessors=new Dictionary<string,List<string>>(StringComparer.OrdinalIgnoreCase);
   foreach(var name in names){
    string source=VideoWorkflow.CanonicalSource(File.ReadAllText(Files.Under(snapshotRoot,name))),next=null,parseError="";try{var parsed=await parse(source,name);next=StaticSuccessor(parsed);}catch(Exception e){parseError=e.Message;}if(next!=null&&!names.Contains(next,StringComparer.OrdinalIgnoreCase)){if(name.Equals(currentScene,StringComparison.OrdinalIgnoreCase))throw new FileNotFoundException("场景跳转目标不存在："+next);next=null;}
    successors[name]=next;metadata[name]=J.O("scene",name,"hash",Files.HashText(source),"fingerprint",Fingerprint(source),"lines",source.Split('\n').Length,"nextScene",next??"","parseError",parseError);if(next!=null){List<string> list;if(!predecessors.TryGetValue(next,out list)){list=new List<string>();predecessors[next]=list;}list.Add(name);}
   }
   string root=currentScene,reason="";bool global=true;var startPath=new HashSet<string>(StringComparer.OrdinalIgnoreCase);if(names.Contains("start.txt",StringComparer.OrdinalIgnoreCase)){string walk="start.txt";for(int i=0;i<MaxScenes&&walk!=null&&startPath.Add(walk);i++){string next;successors.TryGetValue(walk,out next);walk=next;}if(startPath.Contains(currentScene))root="start.txt";}
   if(!root.Equals("start.txt",StringComparison.OrdinalIgnoreCase)||!startPath.Contains(currentScene)){var reverse=new List<string>();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);root=currentScene;for(;;){if(!seen.Add(root))throw new IOException("检测到场景前驱循环："+string.Join(" → ",reverse.Concat(new[]{root})));reverse.Add(root);List<string> prev;if(!predecessors.TryGetValue(root,out prev)||prev.Count==0)break;if(prev.Count>1){global=false;reason="multiple-predecessors";root=currentScene;break;}root=prev[0];}}
   string rootSource=VideoWorkflow.CanonicalSource(File.ReadAllText(Files.Under(snapshotRoot,root)));var chain=J.D(await Expand(root,rootSource,snapshotRoot,parse));if(!J.A(J.Get(chain,"scenes")).Any(x=>J.S(x,"scene").Equals(currentScene,StringComparison.OrdinalIgnoreCase))){global=false;reason=reason==""?"current-scene-not-reachable":reason;root=currentScene;rootSource=VideoWorkflow.CanonicalSource(File.ReadAllText(Files.Under(snapshotRoot,root)));chain=J.D(await Expand(root,rootSource,snapshotRoot,parse));}
   string graphSignature=string.Join("\n",names.Select(name=>name+":"+J.S(metadata[name],"hash")+"->"+J.S(metadata[name],"nextScene")));chain["dependencyHash"]=Files.HashText(graphSignature);chain["rootScene"]=root;chain["currentScene"]=currentScene;chain["global"]=global;chain["reason"]=reason;chain["graphScenes"]=metadata.Values.ToArray();return chain;
  }
  // Keep graph discovery and all predecessor state intact. Limit the executable
  // source BEFORE scanning/snapshotting: stopping the timing loop alone is too
  // late for the engine's look-ahead asset preloader (also used by workers).
  public static object LimitPlanningTail(object chain,object request,object settings){
   if(J.S(request,"storyScope","full")!="sceneOnly"||J.Get(request,"range")!=null||J.B(request,"analysisOnly")||J.S(settings,"mode")=="bgm")return chain;
   // A future custom music track can enable the mixer's global limiter even
   // before that track starts. Keep the existing complete mix in this case.
   if(J.A(J.Get(J.Get(request,"musicTimeline"),"tracks")).Count>0)return chain;
   // BGM stretching depends on the full story's elastic windows. Optimizing it
   // would change preceding timestamps, so leave that mode on its original path.
   string scene=NormalizeScene(J.S(request,"scene","start.txt"));if(scene==null)return chain;
   var scenes=J.A(J.Get(chain,"scenes"));int selected=scenes.FindIndex(s=>J.S(s,"scene").Equals(scene,StringComparison.OrdinalIgnoreCase));
   if(selected<0||selected==scenes.Count-1)return chain;
   // Existing queued/API statement cuts may name a later scene; the original
   // collector validates those and the range resolver ignores them. Preserve
   // that contract instead of turning an outside-range cut into a missing scene.
   var omitted=new HashSet<string>(scenes.Skip(selected+1).Select(s=>J.S(s,"scene")),StringComparer.OrdinalIgnoreCase);
   if(J.A(J.Get(request,"manualCutStatements")).Any(s=>omitted.Contains(NormalizeScene(J.S(s,"scene"))??J.S(s,"scene"))))return chain;
   var lines=J.S(chain,"script").Split('\n');var origins=J.A(J.Get(chain,"originMap"));
   if(lines.Length!=origins.Count)throw new IOException("单场景规划的剧本行映射不完整");
   int first=origins.FindIndex(o=>J.S(o,"scene").Equals(scene,StringComparison.OrdinalIgnoreCase));if(first<0)throw new IOException("单场景规划缺少目标场景行映射");
   int end=first;while(end<origins.Count&&J.S(origins[end],"scene").Equals(scene,StringComparison.OrdinalIgnoreCase))end++;
   if(end==origins.Count||origins.Skip(end).Any(o=>J.S(o,"scene").Equals(scene,StringComparison.OrdinalIgnoreCase)))throw new IOException("单场景规划的目标区间不唯一");
   // Preserve even the target's zero-time trailing comments/flattened transfer.
   // The observer stops at this asset-free comment at the same forward
   // boundary as the next scene's first statement. Do not use an actual end:
   // it resets the stage and artificially terminates active perform windows.
   var result=new Dictionary<string,object>(J.D(chain));
   result["script"]=string.Join("\n",lines.Take(end).Concat(new[]{"; WebVideo+ scene-only boundary"}));
   // Preserve a valid source location for existing statement-cut validation;
   // synthetic=true distinguishes this marker from the omitted source command.
   var boundaryOrigin=new Dictionary<string,object>(J.D(origins[end]));boundaryOrigin["synthetic"]=true;
   result["originMap"]=origins.Take(end).Concat(new[]{(object)boundaryOrigin}).ToArray();
   result["scenes"]=scenes.Take(selected+1).ToArray();
   var kept=new HashSet<string>(scenes.Take(selected+1).Select(s=>J.S(s,"scene")),StringComparer.OrdinalIgnoreCase);
   result["flattened"]=J.A(J.Get(chain,"flattened")).Where(f=>kept.Contains(J.S(f,"from"))).ToArray();
   result["planningTail"]=J.O("schemaVersion",1,"scope","sceneOnly","scene",scene,"boundaryLine",end,"omittedScenes",scenes.Count-selected-1);
   return result;
  }
  public static void AlignPlanningTailDuration(object result,object chain){
   var limit=J.Get(chain,"planningTail");if(limit==null)return;
   int boundary=(int)J.N(limit,"boundaryLine",-1);
   var marker=J.A(J.Get(result,"events")).FirstOrDefault(e=>J.N(e,"index",-1)==boundary&&J.S(e,"command")=="comment");
   if(marker==null)throw new IOException("单场景规划未到达预期结束边界");
   double at=J.N(marker,"atMs",double.NaN);if(double.IsNaN(at)||double.IsInfinity(at)||at<0)throw new IOException("单场景规划结束时间无效");
   // finishNativeTimeline rounds source-event times to whole milliseconds.
   // Keep the full-story crop's ceil(round(boundaryMs) * fps) endpoint even
   // when the raw boundary falls exactly on a fractional-ms frame boundary.
   // This only pads output duration; no extra statement or simulation runs.
   J.D(result)["durationMs"]=Math.Max(J.N(result,"durationMs"),Math.Floor(at+.5));
  }
  static double? Number(object value){if(value==null)return null;double n;return double.TryParse(Convert.ToString(value,System.Globalization.CultureInfo.InvariantCulture),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out n)?(double?)n:null;}
  public static void AttachTimeline(object timing,object chain,string currentScene){
   var lineTimes=J.A(J.Get(timing,"lineTimes"));var origins=J.A(J.Get(chain,"originMap"));var sceneMeta=J.A(J.Get(chain,"scenes"));var rows=new Dictionary<string,object[]>(StringComparer.OrdinalIgnoreCase);
   foreach(var scene in sceneMeta)rows[J.S(scene,"scene")]=new object[Math.Max(0,(int)J.N(scene,"lines"))];
   int count=Math.Min(lineTimes.Count,origins.Count);for(int i=0;i<count;i++){var origin=origins[i];object[] target;if(!rows.TryGetValue(J.S(origin,"scene"),out target))continue;int line=(int)J.N(origin,"line")-1;if(line>=0&&line<target.Length)target[line]=lineTimes[i];}
   double duration=J.N(timing,"durationSeconds"),durationMs=duration*1000,sceneEnd=duration;var limit=J.Get(chain,"planningTail");
   if(limit!=null){int boundary=(int)J.N(limit,"boundaryLine",-1);var at=boundary>=0&&boundary<lineTimes.Count?Number(lineTimes[boundary]):null;if(!at.HasValue||double.IsNaN(at.Value)||double.IsInfinity(at.Value)||at.Value<0||at.Value>durationMs+.001)throw new IOException("单场景规划未到达预期结束边界");sceneEnd=at.Value/1000;}
   var starts=new double[sceneMeta.Count];for(int i=0;i<starts.Length;i++)starts[i]=double.NaN;
   for(int i=0;i<sceneMeta.Count;i++){var name=J.S(sceneMeta[i],"scene");object[] target=rows[name];foreach(var value in target){var n=Number(value);if(n.HasValue){starts[i]=n.Value/1000;break;}}}
   for(int i=starts.Length-1;i>=0;i--)if(double.IsNaN(starts[i]))starts[i]=i+1<starts.Length?starts[i+1]:sceneEnd;if(starts.Length>0)starts[0]=0;
   var sceneResults=new List<object>();double currentStart=0,currentEnd=duration;object[] currentLines=new object[0];
   for(int i=0;i<sceneMeta.Count;i++){string name=J.S(sceneMeta[i],"scene");double start=Math.Max(0,starts[i]),end=i+1<sceneMeta.Count?Math.Max(start,starts[i+1]):sceneEnd;object[] local=rows[name];sceneResults.Add(J.O("scene",name,"hash",J.S(sceneMeta[i],"hash"),"fingerprint",J.S(sceneMeta[i],"fingerprint"),"startSeconds",start,"endSeconds",end,"durationSeconds",Math.Max(0,end-start),"lineTimes",local));if(name.Equals(currentScene,StringComparison.OrdinalIgnoreCase)){currentStart=start;currentEnd=end;currentLines=local;}}
   var story=J.O("schemaVersion",1,"rootScene",J.S(chain,"rootScene",J.S(chain,"entryScene")),"currentScene",currentScene,"global",J.B(chain,"global",true),"reason",J.S(chain,"reason"),"dependencyHash",J.S(chain,"dependencyHash"),"durationSeconds",duration,"currentStartSeconds",currentStart,"currentEndSeconds",currentEnd,"scenes",sceneResults.ToArray());
   if(limit!=null)story["planningTail"]=limit;
   J.D(timing)["storyTimeline"]=story;J.D(timing)["sceneChain"]=J.O("dependencyHash",J.S(chain,"dependencyHash"),"scenes",J.Get(chain,"scenes"),"flattened",J.Get(chain,"flattened"));J.D(timing)["lineTimes"]=currentLines;
  }
  public static void AnnotateReport(object report,object chain){
   var map=J.A(J.Get(chain,"originMap"));foreach(var issue in J.A(J.Get(report,"issues"))){var refs=new List<object>();foreach(var line in J.A(J.Get(issue,"lines"))){int n=Convert.ToInt32(line);if(n>0&&n<=map.Count){var origin=map[n-1];refs.Add(J.O("scene",J.S(origin,"scene"),"line",J.N(origin,"line")));}}if(refs.Count>0)J.D(issue)["sceneLines"]=refs.ToArray();}
  }
 }
}

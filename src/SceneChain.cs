using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Threading.Tasks;
namespace NativeVideo {
 public static class SceneChain {
  const int MaxScenes=256,MaxSceneFiles=4096;const long MaxSceneBytes=8L*1024*1024,MaxSnapshotBytes=128L*1024*1024;
  static void Collect(string dir,List<string> files){
   foreach(var child in Directory.GetDirectories(dir)){if((File.GetAttributes(child)&FileAttributes.ReparsePoint)!=0)throw new IOException("场景目录不能包含目录链接："+child);Collect(child,files);}
   foreach(var file in Directory.GetFiles(dir,"*.txt")){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new IOException("场景文件不能是链接："+file);files.Add(file);}
  }
  public static void SnapshotScenes(string project,string target){
   string root=Files.Full(Path.Combine(project,"game/scene")),copy=Files.Full(target);if(!Directory.Exists(root))throw new DirectoryNotFoundException("项目缺少 game/scene 目录");
   if(Directory.Exists(copy))Files.DeleteTree(Path.GetDirectoryName(copy),copy);Directory.CreateDirectory(copy);var files=new List<string>();Collect(root,files);if(files.Count>MaxSceneFiles)throw new IOException("场景文件过多，最多支持 "+MaxSceneFiles+" 个 .txt 文件");
   long bytes=0;string prefix=root.TrimEnd('\\','/')+Path.DirectorySeparatorChar;foreach(var file in files){var info=new FileInfo(file);if(info.Length>MaxSceneBytes)throw new IOException("单个场景超过 8 MB："+Path.GetFileName(file));bytes+=info.Length;if(bytes>MaxSnapshotBytes)throw new IOException("场景文本总大小超过 128 MB");string relative=Files.Full(file).Substring(prefix.Length);Files.CopyFile(file,Files.Under(copy,relative));}
  }
  static string NormalizeScene(string value){
   value=(value??"").Trim().Replace('\\','/');if(value.StartsWith("./game/scene/",StringComparison.OrdinalIgnoreCase))value=value.Substring(13);else if(value.StartsWith("game/scene/",StringComparison.OrdinalIgnoreCase))value=value.Substring(11);else if(value.StartsWith("./"))value=value.Substring(2);
   if(string.IsNullOrWhiteSpace(value)||value.StartsWith("/")||value.IndexOf(':')>=0||value.IndexOf('?')>=0||value.IndexOf('#')>=0||value.Split('/').Any(x=>x==""||x=="."||x=="..")||!value.EndsWith(".txt",StringComparison.OrdinalIgnoreCase))return null;return value;
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
    string source=depth==0?currentSource:VideoWorkflow.CanonicalSource(File.ReadAllText(Files.Under(snapshotRoot,current)));scenes.Add(J.O("scene",current,"hash",Files.HashText(source),"lines",source.Split('\n').Length));
    var parsed=await parse(source,current);object candidate=null;Dictionary<string,object> candidateArgs=null;
    foreach(var sentence in J.A(J.Get(parsed,"sentenceList"))){
     if(J.B(sentence,"isLineBreakHolder"))continue;string command=J.N(sentence,"command",-1)==0?"say":J.S(sentence,"commandRaw");var args=ProjectAssets.Params(sentence);
     if(command=="end")break;
     if(command=="changeScene"){candidate=sentence;candidateArgs=args;break;}
     if(blockers.Contains(command)&&!(command=="choose"&&ProjectAssets.SingleLineHint(command,sentence,args)))break;
    }
    var lines=source.Split('\n');if(candidate==null){Append(output,origins,lines,current);break;}
    string target=candidateArgs.Count==0?NormalizeScene(J.S(candidate,"content")):null;if(target==null){Append(output,origins,lines,current);break;}
    int first=(int)J.N(candidate,"startLine",-1),last=(int)J.N(candidate,"endLine",first);if(first<0||last<first||last>=lines.Length)throw new IOException("场景跳转语句边界无效："+current);
    string targetFile;try{targetFile=Files.Under(snapshotRoot,target);}catch{Append(output,origins,lines,current);break;}if(!File.Exists(targetFile))throw new FileNotFoundException("场景跳转目标不存在："+target);
    var flattenedLines=(string[])lines.Clone();for(int i=first;i<=last;i++)flattenedLines[i]=i==first?"; WebVideo+ flattened changeScene -> "+target:"; WebVideo+ flattened changeScene";for(int i=last+1;i<flattenedLines.Length;i++)flattenedLines[i]="; WebVideo+ unreachable after changeScene";
    Append(output,origins,flattenedLines,current);flattened.Add(J.O("from",current,"to",target,"line",first+1));current=target;
   }
   string signature=string.Join("\n",scenes.Select(x=>J.S(x,"scene")+":"+J.S(x,"hash")));return J.O("schemaVersion",1,"entryScene",entryScene,"script",string.Join("\n",output),"dependencyHash",Files.HashText(signature),"scenes",scenes.ToArray(),"flattened",flattened.ToArray(),"originMap",origins.ToArray());
  }
  public static void AnnotateReport(object report,object chain){
   var map=J.A(J.Get(chain,"originMap"));foreach(var issue in J.A(J.Get(report,"issues"))){var refs=new List<object>();foreach(var line in J.A(J.Get(issue,"lines"))){int n=Convert.ToInt32(line);if(n>0&&n<=map.Count){var origin=map[n-1];refs.Add(J.O("scene",J.S(origin,"scene"),"line",J.N(origin,"line")));}}if(refs.Count>0)J.D(issue)["sceneLines"]=refs.ToArray();}
  }
 }
}

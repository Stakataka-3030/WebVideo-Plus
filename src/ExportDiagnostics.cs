using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace NativeVideo {
 // Only these task-owned text records may survive a failed export. In
 // particular, .json model files below prepared/web are not diagnostic records.
 public static class ExportDiagnostics {
  static readonly object gate=new object();
  static readonly string[] partFiles={"request.json","runner.log","error.log","retry.jsonl","gpu-selection.json","processes.json","restore.json","restore-dialogue.json","progress.json","result.json"};
  static readonly string[] planningFiles={"timing-plan.json","scene-chain.json","native-version.json","gpu-selection.json","scan-report.json","video-preflight.json","audio-args.json","prepared/input.txt","prepared/plan.json"};
  static readonly string[] workFiles={"segment-plan.json","mix.log","merge.log","audio-export.log","subtitle.log","concat.txt"};
  static string Record(object request){return Files.Full(J.S(request,"recordDir",J.S(request,"jobDir")));}
  static string Root(object request){string record=Record(request);NoLinks(Path.GetPathRoot(record),record);string root=Files.Under(record,"diagnostics");NoLinks(record,root);return root;}
  static string RunFolder(object request){
   string root=Root(request),name=J.S(J.TryRead(Path.Combine(root,"current.json")),"run");
   if(!Regex.IsMatch(name,"^run-[0-9TZ-]+-[a-f0-9]{8}$"))throw new IOException("导出诊断运行标识缺失");
   return Files.Under(root,name);
  }
  static void NoLinks(string root,string file){
   if(!Files.Within(root,file))throw new IOException("诊断文件超出所属任务目录");
   for(string p=Files.Full(file);!string.IsNullOrEmpty(p)&&Files.Within(root,p);p=Path.GetDirectoryName(p))
    if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new IOException("诊断路径不能包含链接："+p);
   if((File.GetAttributes(root)&FileAttributes.ReparsePoint)!=0)throw new IOException("任务目录不能是链接");
  }
  static void CopyText(string root,string source,string target){
   NoLinks(root,source);Files.AtomicBytes(target,File.ReadAllBytes(Files.IoPath(source)));
  }
  static void Note(object request,Exception error){try{Files.Append(Path.Combine(RunFolder(request),"collection-errors.jsonl"),J.O("at",DateTime.UtcNow.ToString("o"),"error",error.ToString()));}catch{}}
  public static void Begin(object request){
   try{lock(gate){string root=Root(request);J.D(request).Remove("diagnosticInitError");J.D(request)["diagnosticPolicy"]=1;J.Write(Path.Combine(Record(request),"request.json"),request);string name="run-"+DateTime.UtcNow.ToString("yyyyMMddTHHmmssfffZ")+"-"+Guid.NewGuid().ToString("N").Substring(0,8);Directory.CreateDirectory(Path.Combine(root,name));J.Write(Path.Combine(root,"current.json"),J.O("run",name));J.Write(Path.Combine(root,name,"environment.json"),J.O("kernelVersion",VersionInfo.Kernel,"processorCount",Environment.ProcessorCount,"osVersion",Environment.OSVersion.ToString(),"is64BitProcess",Environment.Is64BitProcess));}}
   catch(Exception error){J.D(request)["diagnosticInitError"]=error.ToString();Note(request,error);}
  }
  public static void BeginAttempt(object request,object render,string part,int attempt){
   try{string folder=Files.Under(RunFolder(request),"parts/"+Path.GetFileName(part)+"/attempt-"+attempt.ToString("D3"));Directory.CreateDirectory(folder);NoLinks(Root(request),folder);foreach(string name in partFiles.Where(n=>n!="retry.jsonl")){string file=Path.Combine(part,name);if(File.Exists(file)){NoLinks(J.S(request,"jobDir"),file);File.Delete(Files.IoPath(file));}}J.D(render)["diagnosticAttemptDir"]=folder;J.Write(Path.Combine(folder,"request.json"),render);}
   catch(Exception error){Note(request,error);}
  }
  static string Attempt(object request){string folder=J.S(request,"diagnosticAttemptDir");if(!Files.Within(Root(request),folder))throw new IOException("恢复诊断目录不属于本次任务");NoLinks(Root(request),folder);return folder;}
  public static void Prefix(object request,string name,string source,object[] events,int target,int first,int start){
   try{
    if(!Regex.IsMatch(name,"^export-prefix-[0-9]{3}\\.txt$"))throw new IOException("恢复脚本名称无效");string folder=Attempt(request);Files.Atomic(Path.Combine(folder,name),source);
    var chain=J.TryRead(Path.Combine(J.S(request,"jobDir"),"planning/scene-chain.json"));var origins=J.A(J.Get(chain,"originMap"));
    int physical=1;var rows=new List<object>();foreach(var e in events){int line=(int)J.N(e,"line"),length=J.S(e,"script").Count(ch=>ch=='\n')+1;object origin=line>0&&line<=origins.Count?origins[line-1]:null,end=line>0&&line+length-1<=origins.Count?origins[line+length-2]:null;rows.Add(J.O("prefixLine",physical,"prefixEndLine",physical+length-1,"sourceIndex",J.Get(e,"sourceIndex"),"flattenedLine",line,"origin",origin,"originEnd",end,"command",J.Get(e,"command"),"atMs",J.Get(e,"atMs")));physical+=length;}
    J.Write(Path.Combine(folder,"prefix-map.json"),J.O("target",target,"firstSimulationFrame",first,"startFrame",start,"warmupFrames",start-first,"sourceHash",Files.HashText(source),"rows",rows.ToArray()));
    Stage(request,"prefix-restore-start",J.O("scene",name,"target",target));
   }catch(Exception error){Note(request,error);}
  }
  public static void Stage(object request,string stage,object detail){try{Files.Append(Path.Combine(Attempt(request),"stages.jsonl"),J.O("at",DateTime.UtcNow.ToString("o"),"stage",stage,"detail",detail));}catch(Exception error){Note(request,error);}}
  public static void EndAttempt(object request,string part,int attempt,Exception failure){
   try{
    string folder=Files.Under(RunFolder(request),"parts/"+Path.GetFileName(part)+"/attempt-"+attempt.ToString("D3"));
    foreach(string name in partFiles){string source=Path.Combine(part,name);if(File.Exists(source))try{CopyText(J.S(request,"jobDir"),source,Path.Combine(folder,name));}catch(Exception error){Note(request,error);}}
    J.Write(Path.Combine(folder,"attempt.json"),J.O("attempt",attempt,"endedAt",DateTime.UtcNow.ToString("o"),"state",failure==null?"completed":"failed","exception",failure==null?null:failure.ToString()));
   }catch(Exception error){Note(request,error);}
  }
  static Dictionary<string,string> Candidates(string work){
   var files=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
   foreach(string name in workFiles)files[name]=Path.Combine(work,name);
   foreach(string name in planningFiles)files["planning/"+name]=Path.Combine(work,"planning",name);
   string parts=Path.Combine(work,"parts");
   if(Directory.Exists(parts)){NoLinks(work,parts);foreach(string part in Directory.GetDirectories(parts)){if(!Regex.IsMatch(Path.GetFileName(part),"^[0-9]{3}$"))continue;NoLinks(work,part);foreach(string name in partFiles)files["parts/"+Path.GetFileName(part)+"/"+name]=Path.Combine(part,name);}}
   string scene=Path.Combine(work,"planning/prepared/web/game/scene");
   if(Directory.Exists(scene)){NoLinks(work,scene);foreach(string file in Directory.GetFiles(scene,"export-prefix-*.txt"))if(Regex.IsMatch(Path.GetFileName(file),"^export-prefix-[0-9]{3}\\.txt$"))files["prefix/"+Path.GetFileName(file)]=file;}
   return files;
  }
  static bool KeepText(string relative){
   relative=relative.Replace('\\','/');
   return workFiles.Contains(relative)||planningFiles.Any(n=>relative=="planning/"+n)||Regex.IsMatch(relative,"^parts/[0-9]{3}/("+string.Join("|",partFiles.Select(Regex.Escape))+ ")$")||Regex.IsMatch(relative,"^planning/prepared/web/game/scene/export-prefix-[0-9]{3}\\.txt$");
  }
  static void Prune(string work,string directory){
   if((File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0){Directory.Delete(directory);return;}
   foreach(string child in Directory.GetDirectories(directory)){
    if((File.GetAttributes(child)&FileAttributes.ReparsePoint)!=0){Directory.Delete(child);continue;}
    Prune(work,child);if(!Directory.EnumerateFileSystemEntries(child).Any())Directory.Delete(child);
   }
   foreach(string file in Directory.GetFiles(directory)){string relative=Files.Full(file).Substring(Files.Full(work).TrimEnd('\\','/').Length+1);if(!KeepText(relative))File.Delete(Files.IoPath(file));}
  }
  // Failure collection is best effort per file. Even a partial collection never
  // means keeping the model/image/video cache: only selected text can remain.
  public static object Failure(object request,Exception failure){
   var copied=new List<object>();var absent=new List<object>();var errors=new List<object>();string work=J.S(request,"jobDir"),folder="";bool cleaned=false;
   try{
    try{folder=RunFolder(request);}catch{Begin(request);folder=RunFolder(request);}
    string exceptionFile=Path.Combine(folder,"exception.json");if(!File.Exists(exceptionFile))J.Write(exceptionFile,J.O("at",DateTime.UtcNow.ToString("o"),"exception",failure.ToString()));
    foreach(var file in Candidates(work)){
     if(!File.Exists(file.Value)){absent.Add(file.Key);continue;}
     try{CopyText(work,file.Value,Files.Under(folder,"final/"+file.Key));copied.Add(file.Key);}catch(Exception error){errors.Add(J.O("file",file.Key,"error",error.Message));}
    }
    string prior=Path.Combine(folder,"collection-errors.jsonl");if(File.Exists(prior))errors.Add(J.O("file","attempt collection","error","部分分次采集失败，详见 collection-errors.jsonl"));
   }catch(Exception error){errors.Add(J.O("file","collection","error",error.Message));}
   try{
    WorkCache.ValidateOutputLocation(request);
    if(Directory.Exists(work))NoLinks(Path.GetPathRoot(Files.Full(work)),work);
    if(errors.Count==0)WorkCache.CleanupCompleted(request);
    else if(Directory.Exists(work)){
     if(!Files.Full(work).Equals(Record(request),StringComparison.OrdinalIgnoreCase)){
      string root=J.S(request,"cacheRoot");if(root==""||!Files.Within(root,work))throw new IOException("工作缓存不在记录的缓存根目录内");Prune(work,work);
     }else {
      foreach(string name in new[]{"parts","planning","music-snapshot","subtitle-snapshot","imported-music"}){string path=Path.Combine(work,name);if(Directory.Exists(path)){Prune(work,path);if(Directory.Exists(path)&&!Directory.EnumerateFileSystemEntries(path).Any())Directory.Delete(path);}}
      foreach(string name in new[]{"audio.wav","webgal-audio-full.wav"}){string path=Path.Combine(work,name);if(File.Exists(path))File.Delete(Files.IoPath(path));}
     }
    }
    cleaned=true;
   }catch(Exception error){errors.Add(J.O("file","cache cleanup","error",error.Message));}
   var result=J.O("status",errors.Count==0?"complete":"partial","path",folder,"copied",copied.ToArray(),"notProduced",absent.ToArray(),"errors",errors.ToArray(),"heavyCacheCleaned",cleaned);
   try{if(folder==""||!Files.Within(Root(request),folder))throw new IOException("无法创建任务内诊断目录，未写入任何相对路径");NoLinks(Root(request),folder);J.Write(Path.Combine(folder,"manifest.json"),result);Files.Atomic(Path.Combine(folder,"summary.txt"),"导出失败\n"+failure.Message+"\n诊断采集："+J.S(result,"status")+"\n重型缓存已清理："+cleaned+"\n完整异常与材料清单见 exception.json 和 manifest.json。\n");}catch(Exception error){J.D(result)["status"]="partial";J.D(result)["manifestError"]=error.Message;}
   return result;
  }
  public static void Success(object request){
   string record=Record(request);NoLinks(Path.GetPathRoot(record),record);
   foreach(string name in new[]{"diagnostics","scene-at-queue","cubism-memory"}){string directory=Path.Combine(record,name);if(Directory.Exists(directory))Files.DeleteTree(record,directory);}
   foreach(string name in new[]{"runner.log","error.log","progress.jsonl","source-at-queue.txt"}.Concat(workFiles)){string file=Path.Combine(record,name);if(File.Exists(file))File.Delete(Files.IoPath(file));}
   // Successful time analysis retains its functional result, not diagnostic logs.
   string timing=Path.Combine(record,"timing-plan.json");if(!J.B(request,"analysisOnly")&&File.Exists(timing))File.Delete(Files.IoPath(timing));
  }
  // Called only after the owned job process exits. The marker prevents this new
  // policy from retrospectively pruning jobs created by an older installation.
  public static void Reconcile(object request){
   try{NoLinks(Path.GetPathRoot(Record(request)),Record(request));}catch{return;}
   if(J.N(request,"diagnosticPolicy")!=1&&J.N(J.TryRead(Path.Combine(Record(request),"request.json")),"diagnosticPolicy")!=1)return;
   string file=Path.Combine(Record(request),"status.json");var state=J.D(J.TryRead(file));string outcome=J.S(state,"state");
   int runner=(int)J.N(state,"runnerPid");if(runner>0&&runner!=System.Diagnostics.Process.GetCurrentProcess().Id&&Commands.Alive(runner))return;
   if(outcome=="completed"){
    try{WorkCache.CleanupCompleted(request);Success(request);state["cacheCleaned"]=true;state["cacheCleanupWarning"]=null;state["phase"]="completed";}
    catch(Exception error){state["cacheCleaned"]=false;state["cacheCleanupWarning"]=error.Message;}
    try{J.Write(file,state);}catch{}return;
   }
   if(outcome!="failed"||J.B(J.Get(state,"diagnosticArchive"),"heavyCacheCleaned"))return;
   try{state["diagnosticArchive"]=Failure(request,new IOException(J.S(state,"message","导出进程中断")));state["cleanupComplete"]=true;state["requiresNewExport"]=true;J.Write(file,state);}catch{}
  }
 }
}

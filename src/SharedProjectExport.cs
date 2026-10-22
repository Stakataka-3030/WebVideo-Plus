using System;using System.IO;using System.Linq;using System.Net.Http;using System.Collections.Generic;using System.Diagnostics;using System.Threading;using System.Threading.Tasks;
namespace NativeVideo {
 public sealed partial class QueueService {
  readonly SemaphoreSlim sharedExportGate=new SemaphoreSlim(1,1);
  readonly Dictionary<string,object> sharedExportResults=new Dictionary<string,object>();
  IEnumerable<string> SharedScriptFiles(string project){string scenes=Path.Combine(project,"game/scene");if(Directory.Exists(scenes))foreach(string file in Directory.EnumerateFiles(scenes,"*.txt",SearchOption.AllDirectories)){SharedAssets.NoLinks(project,file);yield return file;}string configFile=Path.Combine(project,"game/config.txt");if(File.Exists(configFile)){SharedAssets.NoLinks(project,configFile);yield return configFile;}}
  async Task<object> SharedExport(object data){
   string project=SharedProject(J.S(data,"project")),platform=J.S(data,"platform"),requestId=J.S(data,"requestId"),route;
   if(!ValidId(requestId))throw new ArgumentException("打包请求编号无效");
   if(platform=="web")route="ejectGameAsWeb";else if(platform=="electron-windows")route="ejectGameAsExe";else if(platform=="android")route="ejectGameAsAndroid";else throw new ArgumentException("打包平台无效");
   string signature=project+"|"+platform;lock(sharedExportResults){object done;if(sharedExportResults.TryGetValue(requestId,out done)){if(J.S(done,"signature")!=signature)throw new IOException("打包请求编号已用于另一项目");return J.Get(done,"result");}}
   if(!await sharedExportGate.WaitAsync(0))throw new IOException("正在准备游戏打包，请完成后再试");
   string clone=null,temporaryExport=null;var began=Stopwatch.StartNew();
   try{
    lock(sharedExportResults){object done;if(sharedExportResults.TryGetValue(requestId,out done)){if(J.S(done,"signature")!=signature)throw new IOException("打包请求编号已用于另一项目");return J.Get(done,"result");}}
    var sources=SharedScriptFiles(project).ToDictionary(f=>f,File.ReadAllText,StringComparer.OrdinalIgnoreCase);
    var external=externalEngines.ForProject(project);bool usesShared=sources.Values.Any(t=>SharedStore.SourceReferences(t).Any()),needsClone=usesShared||external!=null;string game=Path.GetFileName(project),exportGame=game,parent=Path.GetDirectoryName(project),exportRoot=Path.Combine(Path.GetDirectoryName(parent),"Exported_Games");double prepareSeconds=0;object manifest=null;
    if(needsClone){
     exportGame="webvideo-shared-export-"+Guid.NewGuid().ToString("N");clone=Files.Under(parent,exportGame);temporaryExport=Files.Under(exportRoot,exportGame);
     await Task.Run(()=>{
      Files.CopyTree(project,clone);if(external!=null){ExternalEngines.CopyShell(J.S(external,"root"),clone);File.Delete(Path.Combine(clone,".webvideo-engine.json"));}
      if(!File.Exists(Path.Combine(clone,"index.html"))){string template=Path.Combine(terreDir,"assets/templates/WebGAL_Template");foreach(string directory in Directory.GetDirectories(template)){string name=Path.GetFileName(directory),target=Path.Combine(clone,name);if(name!="game"&&!Directory.Exists(target))Files.CopyTree(directory,target);}foreach(string file in Directory.GetFiles(template)){string target=Path.Combine(clone,Path.GetFileName(file));if(!File.Exists(target))Files.CopyFile(file,target);}}
      var adapter=EngineAdapter.Select(J.O("project",project,"engineRoot",Path.Combine(terreDir,"assets/templates/WebGAL_Template"),"settings",J.O("engine","webgal")));
      var assets=new ProjectAssets(project,clone,adapter.Source,"",null,adapter){Shared=SharedStore.ForHttpSource(string.Join("\n",sources.Values))};
      foreach(var pair in sources){assets.CollectSharedSource(pair.Value);string relative=pair.Key.Substring(project.Length+1),target=Files.Under(clone,relative);Files.Atomic(target,SharedStore.LocalizeSource(pair.Value));}
      manifest=assets.CopyShared();
      foreach(string library in new[]{"live2d.min.js","live2dcubismcore.min.js"}){string target=Path.Combine(clone,"lib",library);if(File.Exists(target))continue;string source=new[]{project,adapter.Source}.Select(p=>Path.Combine(p,"lib",library)).FirstOrDefault(File.Exists);if(source!=null)Files.CopyFile(source,target);}
     });prepareSeconds=began.Elapsed.TotalSeconds;
    }
    var address=new Uri(J.S(config,"terreUrl"));if(address.Scheme!="http"||!new[]{"localhost","127.0.0.1"}.Contains(address.Host))throw new IOException("Terre 地址无效");
    using(var client=new HttpClient(new HttpClientHandler{UseProxy=false}){Timeout=TimeSpan.FromMinutes(30)})using(var response=await client.GetAsync(new Uri(address,"/api/manageGame/"+route+"/"+Uri.EscapeDataString(exportGame)))){if(!response.IsSuccessStatusCode)throw new IOException("Terre 打包失败："+await response.Content.ReadAsStringAsync());}
    string produced=Files.Under(exportRoot,exportGame+"/"+platform);if(!Directory.Exists(produced)||(platform=="web"&&!File.Exists(Path.Combine(produced,"index.html")))||(platform=="web"&&!File.Exists(Path.Combine(produced,"game/config.txt")))||(platform=="android"&&!File.Exists(Path.Combine(produced,"app/src/main/assets/webgal/game/config.txt")))||(platform=="electron-windows"&&!File.Exists(Path.Combine(produced,"resources/app.asar"))))throw new IOException("Terre 尚未生成完整打包文件，请查看后台日志");
    if(needsClone&&platform=="android"){string settingsFile=Path.Combine(produced,"settings.gradle");if(File.Exists(settingsFile))Files.Atomic(settingsFile,File.ReadAllText(settingsFile).Replace(exportGame,game));}
    string output=Files.Under(exportRoot,game+"/"+platform);
    if(needsClone){
     Directory.CreateDirectory(Path.GetDirectoryName(output));string previous=output+".webvideo-previous-"+Guid.NewGuid().ToString("N");bool moved=false;
     try{if(Directory.Exists(output)){Directory.Move(output,previous);moved=true;}Directory.Move(produced,output);}catch{if(moved&&!Directory.Exists(output))Directory.Move(previous,output);throw;}
     if(moved)try{Files.DeleteTree(exportRoot,previous);}catch(Exception e){PathLog(J.O("event","shared-export-previous-retained","path",previous,"error",e.Message));}
    }
    var result=J.O("output",output,"platform",platform,"materialized",needsClone,"externalEngineMaterialized",external!=null,"manifest",manifest,"prepareSeconds",prepareSeconds,"totalSeconds",began.Elapsed.TotalSeconds);lock(sharedExportResults)sharedExportResults[requestId]=J.O("signature",signature,"result",result);return result;
   }finally{
    if(clone!=null&&Directory.Exists(clone))try{Files.DeleteTree(Path.GetDirectoryName(project),clone);}catch(Exception e){PathLog(J.O("event","shared-export-stage-retained","path",clone,"error",e.Message));}
    if(temporaryExport!=null&&Directory.Exists(temporaryExport))try{Files.DeleteTree(Path.GetDirectoryName(temporaryExport),temporaryExport);}catch(Exception e){PathLog(J.O("event","shared-export-output-retained","path",temporaryExport,"error",e.Message));}
    sharedExportGate.Release();
   }
  }
  object UpgradeSharedProject(object data){
   string project=SharedProject(J.S(data,"project"));var changes=new Dictionary<string,string>();var originals=new Dictionary<string,string>();
   foreach(string file in SharedScriptFiles(project)){string source=File.ReadAllText(file),updated=SharedStore.UpgradeSource(source);if(updated!=source){changes[file]=updated;originals[file]=source;}}
   if(changes.Count==0)return J.O("changed",0);
   string backup=Path.Combine(stateDir,"shared-reference-backups",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(backup);
   foreach(var pair in originals)Files.Atomic(Files.Under(backup,pair.Key.Substring(project.Length+1)),pair.Value);
   J.Write(Path.Combine(backup,"restore.json"),J.O("project",project,"files",originals.Select(p=>J.O("path",p.Key.Substring(project.Length+1),"before",Files.HashText(p.Value),"after",Files.HashText(changes[p.Key]))).ToArray()));
   var written=new List<string>();try{foreach(var pair in changes){if(File.ReadAllText(pair.Key)!=originals[pair.Key])throw new IOException("剧本在转换期间已修改，请稍后重试");Files.Atomic(pair.Key,pair.Value);written.Add(pair.Key);}}catch{foreach(string file in written){if(File.ReadAllText(file)==changes[file])Files.Atomic(file,originals[file]);}throw;}
   return J.O("changed",changes.Count,"backup",backup);
  }
 }
}

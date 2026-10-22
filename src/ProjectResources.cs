using System;using System.IO;using System.Linq;using System.Text.RegularExpressions;using System.Collections.Generic;using System.Threading;using System.Threading.Tasks;
namespace NativeVideo {
 public sealed class ExternalEngines {
  readonly string registry;readonly SharedAssets resources;readonly object gate=new object();
  public ExternalEngines(string registry,SharedAssets resources){this.registry=registry;this.resources=resources;}
  public string Prefix{get{return resources.HttpPrefix==null?null:resources.HttpPrefix.Replace("/webvideo-shared/","/webvideo-engine/");}}
  static string Name(string value){if(string.IsNullOrWhiteSpace(value)||value!=Path.GetFileName(value)||value=="."||value==".."||value.IndexOfAny(Path.GetInvalidFileNameChars())>=0||value.EndsWith(" ")||value.EndsWith("."))throw new IOException("游戏目录名称无效");return value;}
  public static object Inspect(string root){
   root=Files.Full(root);SharedAssets.NoLinks(Path.GetPathRoot(root),root);
   if(!File.Exists(Path.Combine(root,"index.html"))||!File.Exists(Path.Combine(root,"webgal-engine.json"))||!Directory.Exists(Path.Combine(root,"assets")))throw new IOException("请选择包含 index.html、webgal-engine.json 和 assets 的引擎文件夹");
   string descriptor=Path.Combine(root,"webgal-engine.json");if(new FileInfo(descriptor).Length>65536)throw new IOException("引擎信息文件过大");var meta=J.Read(descriptor);string id=J.S(meta,"id"),version=J.S(meta,"version");
   if(!(id=="open-webgal.webgal"&&new[]{"4.6.4","4.6.5","4.6.6"}.Contains(version)||id=="webgal-mygo.mygo"&&version=="3.2.1"))throw new IOException("请选择受支持的 WebGAL 4.6.4–4.6.6 或 MyGO 3.2.1 引擎");
   string html=File.ReadAllText(Path.Combine(root,"index.html"));var module=Regex.Match(html,"<script[^>]*type=[\"']module[\"'][^>]*src=[\"']([^\"']+)",RegexOptions.IgnoreCase);if(!module.Success)module=Regex.Match(html,"<script[^>]*src=[\"']([^\"']+)[\"'][^>]*type=[\"']module",RegexOptions.IgnoreCase);
   string main=module.Success?Regex.Split(module.Groups[1].Value,"[?#]")[0].TrimStart('.','/'):"";if(!main.StartsWith("assets/",StringComparison.Ordinal)||!File.Exists(Files.Under(root,main)))throw new IOException("引擎缺少可识别的 assets 脚本入口");
   return J.O("root",root,"name",J.S(meta,"name",Path.GetFileName(root)),"engineId",id,"version",version,"main",main,"descriptorHash",Files.Hash(descriptor));
  }
  public object Register(string root){var info=J.D(Inspect(root));lock(gate){var rows=J.A(J.Get(J.TryRead(registry),"engines")).ToList();var found=rows.FirstOrDefault(r=>TerreUserData.SamePath(J.S(r,"root"),J.S(info,"root")));info["id"]=found==null?Guid.NewGuid().ToString("N"):J.S(found,"id");rows.RemoveAll(r=>J.S(r,"id")==J.S(info,"id"));rows.Add(info);J.Write(registry,J.O("schemaVersion",1,"engines",rows.ToArray()));return info;}}
  public object ForProject(string project){var marker=J.TryRead(Path.Combine(project,".webvideo-engine.json"));if(marker==null)return null;string id=J.S(marker,"id");var found=J.A(J.Get(J.TryRead(registry),"engines")).FirstOrDefault(r=>J.S(r,"id")==id);if(found==null)throw new IOException("外部引擎来源未登记，请重新选择引擎文件夹");var info=J.D(Inspect(J.S(found,"root")));info["id"]=id;return info;}
  public string FileFor(string path){
   if(Prefix==null||!path.StartsWith(new Uri(Prefix).AbsolutePath,StringComparison.Ordinal))return null;string relative=Uri.UnescapeDataString(path.Substring(new Uri(Prefix).AbsolutePath.Length));var pieces=relative.Split('/');if(pieces.Length<2||!Regex.IsMatch(pieces[0],"^[a-f0-9]{32}$")||relative.Contains("\\")||relative.Contains(":" )||pieces.Any(p=>p==".."||p=="."))throw new IOException("引擎资源路径无效");
   var engine=J.A(J.Get(J.TryRead(registry),"engines")).FirstOrDefault(r=>J.S(r,"id")==pieces[0]);if(engine==null)throw new IOException("引擎来源未登记");string name=string.Join("/",pieces.Skip(1));if(!name.StartsWith("assets/",StringComparison.Ordinal)&&!name.StartsWith("icons/",StringComparison.Ordinal)&&!name.StartsWith("lib/",StringComparison.Ordinal)&&name!="manifest.json"&&name!="webgal-engine.json")throw new IOException("该文件不属于引擎运行资源");string root=Files.Full(J.S(engine,"root")),file=Files.Under(root,name);SharedAssets.NoLinks(root,file);return file;
  }
  public string EntryHtml(object engine){string root=J.S(engine,"root"),baseUrl=Prefix+J.S(engine,"id")+"/",html=File.ReadAllText(Path.Combine(root,"index.html"));
   html=Regex.Replace(html,@"<(?<tag>[A-Za-z][A-Za-z0-9:-]*)\b[^>]*>",tag=>Regex.Replace(tag.Value,"(?<attribute>(?<name>src|href)\\s*=\\s*[\"'])(?<path>[^\"']+)(?<quote>[\"'])",m=>{if(m.Groups["name"].Value.Equals("href",StringComparison.OrdinalIgnoreCase)&&!tag.Groups["tag"].Value.Equals("link",StringComparison.OrdinalIgnoreCase))return m.Value;string value=m.Groups["path"].Value;if(Regex.IsMatch(value,@"^(?:https?:|//|file:)",RegexOptions.IgnoreCase))throw new IOException("引擎入口包含外部资源地址，请使用本机完整引擎");if(value.StartsWith("#")||value.StartsWith("data:"))return m.Value;string name=value.TrimStart('.','/');if(!new[]{"assets/","icons/","lib/","manifest.json","webgal-engine.json"}.Any(name.StartsWith))return m.Value;return m.Groups["attribute"].Value+baseUrl+name+m.Groups["quote"].Value;},RegexOptions.IgnoreCase),RegexOptions.IgnoreCase);
   html=Regex.Replace(html,"(?<quote>[\"'])(?<path>(?:\\./)?lib/[^\"']+)\\k<quote>",m=>m.Groups["quote"].Value+baseUrl+m.Groups["path"].Value.TrimStart('.','/')+m.Groups["quote"].Value);return html;
  }
  public static void CopyShell(string root,string target){foreach(string name in new[]{"assets","icons"})if(Directory.Exists(Path.Combine(root,name)))Files.CopyTree(Path.Combine(root,name),Path.Combine(target,name));string libraries=Path.Combine(root,"lib");if(Directory.Exists(libraries))foreach(string file in Directory.GetFiles(libraries,"*",SearchOption.AllDirectories)){SharedAssets.NoLinks(libraries,file);string copy=Files.Under(Path.Combine(target,"lib"),file.Substring(libraries.Length+1));if(!File.Exists(copy))Files.CopyFile(file,copy);}foreach(string name in new[]{"index.html","manifest.json","webgal-engine.json","webgal-serviceworker.js"})if(File.Exists(Path.Combine(root,name)))Files.CopyFile(Path.Combine(root,name),Path.Combine(target,name));}
  public static string DirectoryName(string value){return Name(value);}
 }
 public sealed partial class QueueService {
  readonly ExternalEngines externalEngines;readonly SemaphoreSlim projectCreateGate=new SemaphoreSlim(1,1);
  string CreationEngineSource(object data){string games=TerreUserData.GamesRoot(terreDir),derivative=J.S(data,"derivative");if(derivative=="")return Path.Combine(terreDir,"assets/templates/WebGAL_Template");ExternalEngines.DirectoryName(derivative);string source=new[]{Path.Combine(Path.GetDirectoryName(games),"derivative-engines",derivative),Path.Combine(terreDir,"assets/templates/Derivative_Engine",derivative)}.FirstOrDefault(Directory.Exists);if(source==null)throw new IOException("所选衍生引擎不存在");return source;}
  static object EngineResourceSource(string root){root=Files.Full(root);string game=Path.Combine(root,"game");if(!Directory.Exists(game))throw new IOException("请选择包含 game 素材文件夹的引擎目录");SharedAssets.NoLinks(Path.GetPathRoot(root),game);var metadata=J.TryRead(Path.Combine(root,"webgal-engine.json"));return J.O("root",root,"resourceRoot",game,"name",J.S(metadata,"name",Path.GetFileName(root)),"version",J.S(metadata,"version"));}
  async Task<HttpResponse> ProjectResourceRequest(HttpRequest r){
   if(!SharedEditingEnabled)return HttpResponse.Data(J.O("error","项目资源选项已关闭；可在安装器中启用共享素材与项目资源。"),409);
   if(r.Method!="POST")return HttpResponse.Data(J.O("error","接口不存在"),404);var data=r.Json;
   if(r.Path=="/api/project-resources/source")return HttpResponse.Data(EngineResourceSource(CreationEngineSource(data)));
   if(r.Path=="/api/project-resources/resource-dialog"){var picked=await App.OnUI(()=>NativeDialogs.SelectFolder(J.S(data,"initial"),"选择素材来源的引擎文件夹"));if(J.B(picked,"canceled"))return HttpResponse.Data(picked);return HttpResponse.Data(EngineResourceSource(J.S(picked,"path")));}
   if(r.Path=="/api/project-resources/engine-dialog"){var picked=await App.OnUI(()=>NativeDialogs.SelectFolder(J.S(data,"initial"),"选择引擎文件夹"));if(J.B(picked,"canceled"))return HttpResponse.Data(picked);return HttpResponse.Data(ExternalEngines.Inspect(J.S(picked,"path")));}
   if(r.Path=="/api/project-resources/create")return HttpResponse.Data(await CreateResourceProject(data));
   return HttpResponse.Data(J.O("error","接口不存在"),404);
  }
  async Task<object> CreateResourceProject(object data){
   if(!await projectCreateGate.WaitAsync(0))throw new IOException("正在创建项目，请稍候");string stage=null,games=TerreUserData.GamesRoot(terreDir);
   try{return await Task.Run(()=>{
    string name=ExternalEngines.DirectoryName(J.S(data,"gameDir")),title=J.S(data,"gameName").Trim();if(title==""||title.Contains(";")||title.Contains("\r")||title.Contains("\n"))throw new IOException("请输入有效的游戏名称");
    Directory.CreateDirectory(games);SharedAssets.NoLinks(Path.GetPathRoot(games),games);string target=Files.Under(games,name);if(Directory.Exists(target)||File.Exists(target))throw new IOException("同名项目已存在");
    var options=J.Get(data,"webVideoResources");bool skip=J.B(options,"skipAssets"),mount=J.B(options,"mountEngine");string source=CreationEngineSource(data),derivative=J.S(data,"derivative");bool share=skip&&J.B(options,"shareEngineAssets");object resourceSource=share?EngineResourceSource(J.S(options,"assetEnginePath")==""?source:J.S(options,"assetEnginePath")):null;object external=null;
    if(mount){external=ExternalEngines.Inspect(J.S(options,"enginePath"));source=J.S(external,"root");}
    if(!Directory.Exists(Path.Combine(source,"game")))throw new IOException("引擎缺少创建项目所需的 game 文件夹");SharedAssets.NoLinks(Path.GetPathRoot(source),source);
    stage=Files.Under(games,".webvideo-create-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(stage);
    if(!mount&&derivative!="")ExternalEngines.CopyShell(source,stage);
    string game=Path.Combine(stage,"game");Directory.CreateDirectory(game);var omit=new HashSet<string>(new[]{"figure","background","bgm","vocal","video","scene"},StringComparer.OrdinalIgnoreCase);
    foreach(string folder in Directory.GetDirectories(Path.Combine(source,"game"))){string part=Path.GetFileName(folder);if(skip&&omit.Contains(part)||part=="template"&&!J.B(data,"ignoreTemplate"))continue;Files.CopyTree(folder,Path.Combine(game,part));}
    foreach(string file in Directory.GetFiles(Path.Combine(source,"game")))Files.CopyFile(file,Path.Combine(game,Path.GetFileName(file)));
    foreach(string kind in new[]{"figure","background","bgm","vocal","video","scene","tex","animation"})Directory.CreateDirectory(Path.Combine(game,kind));
    if(skip)Files.Atomic(Path.Combine(game,"scene/start.txt"),":;\n");
    if(!J.B(data,"ignoreTemplate")){string selected=J.S(data,"templateDir"),template=Path.Combine(terreDir,"assets/templates/WebGAL_Default_Template");if(selected!=""){ExternalEngines.DirectoryName(selected);template=Path.Combine(Path.GetDirectoryName(games),"templates",selected);if(!Directory.Exists(template))throw new IOException("所选界面模板不存在");}if(Directory.Exists(template))Files.CopyTree(template,Path.Combine(game,"template"));}
    string configFile=Path.Combine(game,"config.txt");if(!File.Exists(configFile))throw new IOException("引擎缺少游戏配置");string configText=Regex.Replace(File.ReadAllText(configFile),@"(?m)^Game_name:[^;]*;","Game_name:"+title+";");if(skip)configText=Regex.Replace(configText,@"(?m)^(Title_img|Title_bgm|Game_Logo):[^;]*;","$1:;");Files.Atomic(configFile,configText);
    if(mount){sharedResources.Start();if(sharedResources.Error!=null)throw new IOException(sharedResources.Error);external=externalEngines.Register(source);Files.Atomic(Path.Combine(stage,"index.html"),externalEngines.EntryHtml(external));Files.CopyFile(Path.Combine(source,"webgal-engine.json"),Path.Combine(stage,"webgal-engine.json"));J.Write(Path.Combine(stage,".webvideo-engine.json"),J.O("schemaVersion",1,"id",J.S(external,"id"),"name",J.S(external,"name"),"version",J.S(external,"version")));}
    object library=share?sharedAssets.AddEngineResources(J.S(resourceSource,"resourceRoot"),"引擎资源 · "+J.S(resourceSource,"name")):null;
    Directory.Move(stage,target);stage=null;return J.O("status","success","data",true,"gameDir",name,"copiedAssets",!skip,"sharedLibrary",library,"externalEngine",mount?external:null);
   });}finally{if(stage!=null&&Directory.Exists(stage))Files.DeleteTree(games,stage);projectCreateGate.Release();}
  }
 }
}

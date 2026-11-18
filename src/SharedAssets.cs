using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public sealed partial class SharedAssets {
  public static readonly string[] Kinds={"figure","background","bgm","vocal","video"};
  public const string Prefix="__shared/";
  internal static IEnumerable<string> FilesWithoutLinks(string root,string folder){
   NoLinks(root,folder);
   foreach(var file in Directory.GetFiles(folder)){NoLinks(root,file);yield return file;}
   foreach(var child in Directory.GetDirectories(folder))
    foreach(var file in FilesWithoutLinks(root,child))yield return file;
  }
  internal string FindDefaultMotion(string modelReference,string name){
   if(string.IsNullOrWhiteSpace(name)||Regex.IsMatch(name,@"^(?:[a-z][a-z\d+.-]*:|[/\\])",RegexOptions.IgnoreCase))return null;
   var id=modelReference.Substring(Prefix.Length).Split('/')[0];
   var root=J.S(Library(id),"root");
   var paths=name.EndsWith(".motionbin",StringComparison.Ordinal)?new[]{"motion/"+name}
    :new[]{"mtn_exp/"+name+".mtn","motion/"+name+".motionbin"};
   foreach(var path in paths)foreach(var prefix in new[]{"3d/",""}){
    var relative=Relative(prefix+Uri.UnescapeDataString(path));
    var file=Files.Under(root,relative);
    NoLinks(root,file);
    if(File.Exists(file))return Prefix+id+"/"+relative;
   }
   return null;
  }
  internal static string GltfNamedKind(string reference){
   if(!reference.StartsWith(Prefix,StringComparison.Ordinal))return null;
   if(reference.EndsWith(".motionbin",StringComparison.Ordinal))return "motion";
   return Regex.IsMatch(reference,@"^__shared/[^/]+/(?:3d/)?mtn_exp/.+\.(mtn|exp\.json)$")?"mtn_exp":null;
  }
  public object GltfNamedResources(){
   var result=new List<object>();
   foreach(var library in Current().Where(l=>J.S(l,"kind")=="all")){
    string root=J.S(library,"root"),id=J.S(library,"id");
    foreach(var folder in new[]{"3d/motion","3d/mtn_exp","motion","mtn_exp"}){
     var directory=Files.Under(root,folder);
     if(!Directory.Exists(directory))continue;
     var pending=new Stack<string>();pending.Push(directory);
     while(pending.Count>0){
      var current=pending.Pop();
      NoLinks(root,current);
      foreach(var child in Directory.GetDirectories(current))
       if((File.GetAttributes(child)&FileAttributes.ReparsePoint)==0)pending.Push(child);
      foreach(var file in Directory.GetFiles(current)){
       if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)continue;
       var path=file.Substring(root.TrimEnd('/','\\').Length+1).Replace('\\','/');
       var reference=Prefix+id+"/"+path;
       var kind=GltfNamedKind(reference);
       if(kind==null||!folder.EndsWith(kind,StringComparison.Ordinal))continue;
       result.Add(J.O("name",J.S(library,"name")+"/"+path,
        "libraryId",id,"libraryName",J.S(library,"name"),"relativePath",path.Substring(folder.Length+1),
        "url",HttpPrefix+string.Join("/",reference.Substring(Prefix.Length).Split('/').Select(Uri.EscapeDataString)),
        "type",path.EndsWith(".exp.json",StringComparison.Ordinal)?"expression":"motion"));
      }
     }
    }
   }
   return result;
  }
  readonly string registry;readonly object gate=new object();readonly string[] protectedRoots;
  readonly Dictionary<string,object> completedCopies=new Dictionary<string,object>();
  public SharedAssets(string file,params string[] protectedRoots){registry=Files.Full(file);this.protectedRoots=protectedRoots.Where(p=>!string.IsNullOrWhiteSpace(p)).Select(Files.Full).ToArray();}
  public object Export(){lock(gate)return J.O("schemaVersion",2,"libraries",Current().ToArray(),"http",HttpState);}
  internal string PortableRoot {get;set;}
  List<object> Libraries(){
   var list=J.A(J.Get(J.TryRead(registry),"libraries")).ToList();
   if(PortableRoot!=null)foreach(var item in list)J.D(item)["root"]=PortablePaths.Resolve(PortableRoot,J.S(item,"root"));
   return list;
  }
  void SaveLibraries(IEnumerable<object> libraries){
   var stored=PortableRoot==null?libraries:libraries.Select(item=>{
    var copy=new Dictionary<string,object>(J.D(item));
    copy["root"]=PortablePaths.Store(PortableRoot,J.S(item,"root"));
    return (object)copy;
   });
   J.Write(registry,J.O("schemaVersion",1,"libraries",stored.ToArray()));
  }
  public static SharedAssets FromSnapshot(object data){var store=new SharedAssets(Path.Combine(Path.GetTempPath(),"unused-shared-assets.json"));store.snapshot=J.A(J.Get(data,"libraries")).ToList();store.httpSnapshot=J.Get(data,"http");return store;}
  List<object> snapshot;
  IEnumerable<object> Current(){return snapshot??Libraries();}
  static void RegistrationKind(string kind){if(kind!="all")Kind(kind);}
  static void Kind(string kind){if(!Kinds.Contains(kind))throw new ArgumentException("素材类型无效");}
  static string Relative(string value){value=(value??"").Replace('\\','/');if(value.StartsWith("/")||value.Split('/').Any(p=>p==".."||p=="."||p.IndexOfAny(Path.GetInvalidFileNameChars())>=0))throw new IOException("素材路径无效");return value;}
  public static void NoLinks(string root,string file){root=Files.Full(root);file=Files.Full(file);if(!Files.Within(root,file,true))throw new IOException("素材路径超出共享文件夹");for(string at=file;at!=null;at=Path.GetDirectoryName(at)){if((File.Exists(at)||Directory.Exists(at))&&(File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new IOException("请选择实体素材文件夹");if(TerreUserData.SamePath(root,at))break;}}
  object Library(string id,string kind=null){var value=Current().FirstOrDefault(l=>J.S(l,"id")==id&&(kind==null||J.S(l,"kind")==kind||J.S(l,"kind")=="all"));if(value==null)throw new IOException("共享素材来源未登记，请重新选择文件夹");return value;}
  public object Add(string root,string kind,string name){RegistrationKind(kind);root=Files.Full(root);if(!Directory.Exists(root))throw new IOException("共享素材文件夹不存在");if(protectedRoots.Any(p=>Files.Within(p,root,true)||Files.Within(root,p,true)))throw new IOException("请选择项目与安装目录之外的共享素材文件夹");NoLinks(Path.GetPathRoot(root),root);return AddLibrary(root,kind,name);}
  internal object AddEngineResources(string root,string name){root=Files.Full(root);if(!Directory.Exists(root))throw new IOException("引擎素材文件夹不存在");NoLinks(Path.GetPathRoot(root),root);return AddLibrary(root,"all",name);}
  object AddLibrary(string root,string kind,string name){lock(gate){var list=Libraries();var existing=list.FirstOrDefault(l=>J.S(l,"kind")==kind&&TerreUserData.SamePath(J.S(l,"root"),root));if(existing!=null)return existing;var item=J.O("id",Guid.NewGuid().ToString("N"),"kind",kind,"name",string.IsNullOrWhiteSpace(name)?Path.GetFileName(root.TrimEnd('\\','/')):name.Trim(),"root",root);list.Add(item);SaveLibraries(list);return item;}}
  public object Relocate(string id,string root){root=Files.Full(root);if(!Directory.Exists(root))throw new IOException("共享素材文件夹不存在");if(protectedRoots.Any(p=>Files.Within(p,root,true)||Files.Within(root,p,true)))throw new IOException("请选择项目与安装目录之外的共享素材文件夹");NoLinks(Path.GetPathRoot(root),root);lock(gate){var list=Libraries();var item=list.FirstOrDefault(l=>J.S(l,"id")==id);if(item==null)throw new IOException("共享素材来源未登记");J.D(item)["root"]=root;SaveLibraries(list);return item;}}
  public void Remove(string id){lock(gate)SaveLibraries(Libraries().Where(l=>J.S(l,"id")!=id));}
  public string KindForId(string id){var item=Current().FirstOrDefault(l=>J.S(l,"id")==id);return item==null?null:J.S(item,"kind");}
  public object Catalog(){return J.O("libraries",Current().Select(l=>J.O("id",J.S(l,"id"),"kind",J.S(l,"kind"),"name",J.S(l,"name"),"root",J.S(l,"root"),"missing",!Directory.Exists(J.S(l,"root")))).ToArray());}
  public string Resolve(string kind,string reference){Kind(kind);reference=Relative(reference);if(!reference.StartsWith(Prefix,StringComparison.Ordinal))return null;var parts=reference.Substring(Prefix.Length).Split(new[]{'/'},2);if(parts.Length!=2)throw new IOException("共享素材路径无效");var library=Library(parts[0],kind);string root=J.S(library,"root");if(!Directory.Exists(root))throw new IOException("共享素材来源不可用："+J.S(library,"name"));string file=Files.Under(root,parts[1]);NoLinks(root,file);if(!File.Exists(file))throw new IOException("找不到共享素材："+parts[1]);return file;}
  public bool Allowed(string file){foreach(var item in Current()){string root=J.S(item,"root");if(!Files.Within(root,file,true))continue;NoLinks(root,file);return true;}return false;}
  public void CheckDependency(string parent,string child,string libraryId=null){var library=libraryId==null?Current().Where(l=>Files.Within(J.S(l,"root"),parent,true)).OrderByDescending(l=>J.S(l,"root").Length).FirstOrDefault():Library(libraryId);if(library==null)throw new IOException("共享素材来源未登记");if(!Files.Within(J.S(library,"root"),parent,true))throw new IOException("素材路径超出共享文件夹");NoLinks(J.S(library,"root"),child);}
  static object FigurePackage(string root,string config,string relative){
   if(!File.Exists(config))return null;
   NoLinks(root,config);
   var models=J.A(J.Get(J.TryRead(config),"components")).Where(c=>J.S(c,"type")=="model")
    .Select(c=>J.O("role",J.S(c,"role"),"name",J.S(c,"name"),"description",J.S(c,"description"))).ToArray();
   return models.Length==0?null:J.O("path",relative,"models",models);
  }
  public object List(string id,string relative,bool figurePackages=false){
   var library=Library(id);string root=J.S(library,"root");
   if(!Directory.Exists(root))throw new IOException("共享素材来源不可用："+J.S(library,"name"));
   relative=Relative(relative).TrimEnd('/');string folder=relative==""?root:Files.Under(root,relative);
   NoLinks(root,folder);if(!Directory.Exists(folder))throw new IOException("共享素材文件夹不存在");
   string prefix=relative==""?"":relative+"/";
   var entries=new DirectoryInfo(folder).EnumerateFileSystemInfos().Where(p=>!p.Name.StartsWith(".")).Select(p=>{
    var attributes=p.Attributes;if((attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("请选择实体素材文件夹");
    bool dir=(attributes&FileAttributes.Directory)!=0;
    var entry=J.O("name",p.Name,"isDir",dir,"path",prefix+p.Name,"extName",p.Extension.ToLowerInvariant(),"size",dir?0:((FileInfo)p).Length,"lastModified",new DateTimeOffset(p.LastWriteTimeUtc).ToUnixTimeMilliseconds());
    if(figurePackages&&dir){var model=FigurePackage(root,Path.Combine(p.FullName,"config.json"),prefix+p.Name+"/config.json");if(model!=null)J.D(entry)["modelPackage"]=model;}
    return entry;
   }).OrderBy(e=>J.B(e,"isDir")?0:1).ThenBy(e=>J.S(e,"name"),StringComparer.CurrentCultureIgnoreCase).ToArray();
   NoLinks(root,folder);
   var result=J.O("entries",entries,"library",library,"path",relative);
   if(figurePackages){var model=FigurePackage(root,Path.Combine(folder,"config.json"),prefix+"config.json");if(model!=null)J.D(result)["modelPackage"]=model;}
   return result;
  }
  public static string SafeCopyName(string value){value=Regex.Replace(value??"","[\\x00-\\x1f<>:\"/\\\\|?*;#%&@]","_").Trim();
   if(value.Length>100)value=value.Substring(0,char.IsHighSurrogate(value[99])?99:100);
   value=value.TrimEnd('.',' ');
   if(value.Length==0||value.Equals("__shared",StringComparison.OrdinalIgnoreCase)||Regex.IsMatch(value,@"^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))return "共享素材副本";
   return value;
  }
  public object Copy(string requestId,string project,string kind,string reference,string name,string temporaryRoot,EngineAdapter adapter){Guid parsed;if(!Guid.TryParse(requestId,out parsed))throw new ArgumentException("复制请求编号无效");string key=parsed.ToString("N"),signature=Files.HashText(project+"|"+kind+"|"+reference+"|"+name);lock(gate){object previous;if(completedCopies.TryGetValue(key,out previous)){if(J.S(previous,"signature")!=signature)throw new IOException("复制请求编号已用于另一份素材");return J.Get(previous,"result");}Kind(kind);string file=Resolve(kind,reference);string[] parts=reference.Substring(Prefix.Length).Split(new[]{'/'},2);bool gltf=adapter.IsLoveLive&&kind=="figure"&&ProjectAssets.IsGltfPackage(file);string stem=SafeCopyName(string.IsNullOrWhiteSpace(name)?(gltf?Path.GetFileName(Path.GetDirectoryName(file)):Path.GetFileNameWithoutExtension(file)):name),stage=Path.Combine(temporaryRoot,"shared-copy-"+Guid.NewGuid().ToString("N"));try{var assets=new ProjectAssets(project,stage,adapter.Source,"",null,adapter){Shared=this};assets.CollectShared(kind,reference);string localKind=gltf?"3d/figure":kind;string basePath=Path.Combine(stage,"game",localKind,Prefix.Replace('/',Path.DirectorySeparatorChar),parts[0]);assets.CopyShared();assets.LocalizeCopiedDefaultMotions();string targetParent=Path.Combine(project,"game",localKind);NoLinks(project,targetParent);Directory.CreateDirectory(targetParent);string copyName=stem;int index=2;while(Directory.Exists(Path.Combine(targetParent,copyName))||File.Exists(Path.Combine(targetParent,copyName)))copyName=stem+" ("+(index++)+")";Directory.Move(basePath,Path.Combine(targetParent,copyName));var result=J.O("reference",copyName+"/"+parts[1],"name",copyName,"kind",localKind);completedCopies[key]=J.O("signature",signature,"result",result);return result;}finally{if(Directory.Exists(stage))Files.DeleteTree(temporaryRoot,stage);}}}
 }
}

using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;using System.Threading.Tasks;
namespace NativeVideo {
 public sealed class ScanException:Exception {
  public object Report;
  public ScanException(object report):base(Summary(report)){Report=report;}
  public static string Summary(object report){
   int issues=J.A(J.Get(report,"issues")).Count,warnings=J.A(J.Get(report,"warnings")).Count;
   if(issues==0)return "完整扫描发现 "+warnings+" 项兼容性提示";
   return "完整扫描发现 "+issues+" 项问题"+(warnings>0?"，另有 "+warnings+" 项兼容性提示":"");
  }
 }
 public sealed class ProjectAssets {
  public SharedAssets Shared;readonly Dictionary<string,string> sharedScanHashes=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
  public readonly string Project,Root,Engine;public string Script;public object Parsed,Presentation;public readonly Dictionary<string,object> Media=new Dictionary<string,object>(),Animations=new Dictionary<string,object>();public Action<object> Log;public readonly EngineAdapter Adapter;public readonly Dictionary<string,object> AggregateCounts=new Dictionary<string,object>();readonly Dictionary<string,string> copies=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);readonly Dictionary<string,object> issues=new Dictionary<string,object>();readonly Dictionary<string,object> warnings=new Dictionary<string,object>();readonly List<object> actions=new List<object>();readonly HashSet<string> checkedFiles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);readonly HashSet<string> visits=new HashSet<string>();sealed class ModelDependencies {public string[] Children,ModelChildren,Libraries;public bool Container;}readonly Dictionary<string,ModelDependencies> dependencyCache=new Dictionary<string,ModelDependencies>(StringComparer.OrdinalIgnoreCase);readonly HashSet<string> requiredLibraries=new HashSet<string>(StringComparer.OrdinalIgnoreCase);readonly List<object> libraries=new List<object>();
  static readonly Regex Resource=new Regex(@"\.(jsonl|wmdl|json|moc3?|mtn|png|jpe?g|webp|gif|mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov|mkv|ttf|woff2?)([?#].*)?$",RegexOptions.IgnoreCase);
  internal static bool IsGltfPackage(string file){
   return Path.GetFileName(file).Equals("config.json",StringComparison.OrdinalIgnoreCase)
    && J.A(J.Get(J.TryRead(file),"components")).Any(component=>J.S(component,"type")=="model");
  }
  bool collectLocalGltf;
  readonly HashSet<string> localGltfComponents=new HashSet<string>(StringComparer.OrdinalIgnoreCase);

  void CopyProjectResource(string file){
   if(!Files.Within(Project,file))throw new IOException("3D 资源路径超出工程目录");
   SharedAssets.NoLinks(Project,file);
   if(!File.Exists(file))throw new FileNotFoundException("找不到 3D 资源",file);
   checkedFiles.Add(file);
   copies[Files.Under(Root,file.Substring(Project.TrimEnd('\\','/').Length+1))]=file;
  }

  void CopyGltfTree(string folder){
   if(Directory.Exists(folder))foreach(var file in SharedAssets.FilesWithoutLinks(Project,folder))CopyProjectResource(file);
  }

  bool CollectLocalGltfNamed(string kind,string name,string libraryRoot=null,bool copy=true){
   if(string.IsNullOrEmpty(name)||External(name)||(kind=="expression"&&name.StartsWith("3d:",StringComparison.Ordinal)))return false;
   var binary=name.EndsWith(".motionbin",StringComparison.Ordinal);
   var materialized=name.StartsWith(SharedAssets.Prefix,StringComparison.Ordinal);
   string[] paths;
   if(kind=="expression")paths=new[]{"mtn_exp/"+name+(materialized&&name.EndsWith(".exp.json",StringComparison.Ordinal)?"":".exp.json")};
   else if(binary)paths=new[]{"motion/"+name};
   else if(materialized&&name.EndsWith(".mtn",StringComparison.Ordinal))paths=new[]{"mtn_exp/"+name};
   else paths=new[]{"mtn_exp/"+name+".mtn","motion/"+name+".motionbin"};
   var root=Path.Combine(Project,"game/3d");
   var candidates=libraryRoot==null?paths:paths.SelectMany(path=>new[]{libraryRoot+"/3d/"+path,libraryRoot+"/"+path}).Concat(paths);
   foreach(var path in candidates){
    var candidate=Path.Combine(root,PhysicalName(path));
    if(!File.Exists(candidate))continue;
    var file=Files.Full(candidate);
    if(!Files.Within(root,file))continue;
    SharedAssets.NoLinks(Project,file);
    if(copy)CopyProjectResource(file);
    return true;
   }
   return false;
  }

  string LocalGltfFile(string parent,string reference){
   if(string.IsNullOrEmpty(reference)||External(reference)||reference.StartsWith("data:",StringComparison.OrdinalIgnoreCase))return null;
   var path=PhysicalName(reference);
   var file=path.StartsWith("/",StringComparison.Ordinal)
    ?Files.Under(Project,path.TrimStart('/')):Files.Full(Path.Combine(Path.GetDirectoryName(parent),path));
   return Files.Within(Path.Combine(Project,"game/3d"),file)?file:null;
  }

  static object ReadGlbJson(string file){
   using(var reader=new BinaryReader(File.OpenRead(file))){
    if(reader.ReadUInt32()!=0x46546c67||reader.ReadUInt32()!=2)throw new IOException("模型不是 GLB 2.0");
    reader.ReadUInt32();var length=reader.ReadInt32();
    if(reader.ReadUInt32()!=0x4e4f534a||length<0||length>reader.BaseStream.Length-reader.BaseStream.Position)throw new IOException("GLB JSON 数据无效");
    return J.Parse(System.Text.Encoding.UTF8.GetString(reader.ReadBytes(length)));
   }
  }

  void CollectLocalGltf(string config,string role){
   if(!collectLocalGltf||!localGltfComponents.Add(config+"|"+role))return;
   CopyProjectResource(config);
   var relativeConfig=config.Substring(Path.Combine(Project,"game/3d").Length+1).Replace('\\','/');
   var sharedLibrary=Regex.Match(relativeConfig,@"^(figure/__shared/[^/]+)/");
   var libraryRoot=sharedLibrary.Success?sharedLibrary.Groups[1].Value:null;
   var components=J.A(J.Get(J.Read(config),"components")).Where(c=>J.S(c,"type")=="model"&&(role==null||J.S(c,"role")==role)).ToArray();
   if(components.Length==0)throw new IOException("3D 模型包缺少所需组件："+(role??"model"));
   var required=new HashSet<string>(StringComparer.Ordinal);
   foreach(var component in components){
    if(J.S(component,"role")!="head"){
     var motion=J.S(component,"defaultMotion");
     if(motion.StartsWith("./",StringComparison.Ordinal)||motion.StartsWith("../",StringComparison.Ordinal)){
      var relative=LocalGltfFile(config,motion);
      if(relative==null||!File.Exists(relative))throw new IOException("找不到默认动作："+motion);
      CopyProjectResource(relative);
     }else if(motion!=""&&!CollectLocalGltfNamed("motion",motion,libraryRoot))throw new IOException("找不到默认动作："+motion);
    }
    var model=LocalGltfFile(config,J.S(component,"model"));
    if(model==null||!File.Exists(model))throw new IOException("找不到 3D 模型："+J.S(component,"model"));
    CopyProjectResource(model);
    CollectGltfRequirements(component,ReadGlbJson(model),required);
   }
   CheckGltfRequirements(required);
  }
  static void CollectGltfRequirements(object component,object document,HashSet<string> required){
   var profile=J.S(component,"renderProfile");
   if(profile!="")required.Add("render-profile:"+profile);
   foreach(var behavior in J.A(J.Get(component,"behaviors")))
    if(J.Get(behavior,"required")==null||J.B(behavior,"required"))required.Add("behavior:"+J.S(behavior,"name"));
   foreach(var material in J.A(J.Get(document,"materials"))){
    var shader=J.S(J.Get(material,"extras"),"shader");
    if(shader!="")required.Add("shader:"+shader);
   }
  }
  void CheckGltfRequirements(IEnumerable<string> required){
   foreach(var dependency in required){
    string[] files;
    if(!GltfRuntime().TryGetValue(dependency,out files)||files.Any(file=>!File.Exists(file)))
     throw new IOException("当前工程缺少 3D 运行时依赖："+dependency);
    foreach(var file in files)SharedAssets.NoLinks(Project,file);
   }
  }
  Dictionary<string,string[]> gltfRuntime;
  Dictionary<string,string[]> GltfRuntime(){
   if(gltfRuntime!=null)return gltfRuntime;
   var entries=new Dictionary<string,string[]>(StringComparer.Ordinal);
   var root=Path.Combine(Project,"game/3d/runtime");
   SharedAssets.NoLinks(Project,Path.Combine(root,"index.json"));
   var index=J.TryRead(Path.Combine(root,"index.json"));
   foreach(var path in J.A(J.Get(index,"packages"))){
    var file=Files.Under(root,Convert.ToString(path));
    SharedAssets.NoLinks(root,file);
    foreach(var component in J.A(J.Get(J.Read(file),"components"))){
     var type=J.S(component,"type");var name=J.S(component,"name");
     if(type=="behavior")name=J.S(component,"namespace")+"."+name;
     var sources=new[]{J.S(component,"script"),J.S(component,"src")}.Where(source=>source!=""&&!External(source)&&!source.StartsWith("data:",StringComparison.OrdinalIgnoreCase));
     var targets=sources.Select(source=>Files.Full(Path.Combine(Path.GetDirectoryName(file),PhysicalName(source)))).ToArray();
     entries.Add(type+":"+name,targets);
    }
   }
   return gltfRuntime=entries;
  }
  void CollectSharedGltf(string reference,string config,string role=null){
   try{
    var dependencies=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    Action<string,string> collect=(parent,uri)=>{
     if(string.IsNullOrEmpty(uri)||uri.StartsWith("data:",StringComparison.OrdinalIgnoreCase)||External(uri))return;
     var file=Files.Full(Path.Combine(Path.GetDirectoryName(parent),PhysicalName(uri)));
     Shared.CheckDependency(config,file,reference.Substring(SharedAssets.Prefix.Length).Split('/')[0]);
     if(!File.Exists(file))throw new FileNotFoundException("找不到模型依赖",uri);
     dependencies.Add(file);
    };
    var required=new HashSet<string>(StringComparer.Ordinal);
    var components=J.A(J.Get(J.Read(config),"components")).Where(c=>J.S(c,"type")=="model"&&(role==null||J.S(c,"role")==role)).ToArray();
    if(components.Length==0)throw new IOException("3D 模型包缺少所需组件："+(role??"model"));
    foreach(var component in components){
     if(J.S(component,"role")!="head"){
      var defaultMotion=J.S(component,"defaultMotion");
      var relative=defaultMotion.StartsWith("./",StringComparison.Ordinal)||defaultMotion.StartsWith("../",StringComparison.Ordinal);
      if(relative)collect(config,defaultMotion);
      var motion=relative?null:Shared.FindDefaultMotion(reference,defaultMotion);
      if(motion!=null){
       var file=Shared.ResourceFile(motion);
       Shared.CheckDependency(config,file,reference.Substring(SharedAssets.Prefix.Length).Split('/')[0]);
       dependencies.Add(file);
       var stagedConfig=Files.Under(Path.Combine(Root,"game/3d/figure"),reference);
       var stagedMotion=Files.Under(Path.Combine(Root,"game/3d/figure"),motion);
       copiedDefaultMotions[stagedConfig]=stagedMotion;
      }else if(!relative&&defaultMotion!=""&&!CollectLocalGltfNamed("motion",defaultMotion,null,collectLocalGltf))throw new IOException("找不到默认动作："+defaultMotion);
     }
     var model=J.S(component,"model");
     if(string.IsNullOrWhiteSpace(model))throw new IOException("3D 模型组件缺少 model 路径");
     collect(config,model);
     var glb=Files.Full(Path.Combine(Path.GetDirectoryName(config),PhysicalName(model)));
     if(!dependencies.Contains(glb))continue;
     CollectGltfRequirements(component,ReadGlbJson(glb),required);
    }
    CheckGltfRequirements(required);
    var segments=reference.Split(new[]{'/'},StringSplitOptions.RemoveEmptyEntries);
    var libraryRoot=Files.Under(Path.Combine(Root,"game/3d/figure"),string.Join("/",segments.Take(2)));
    var sourceRoot=config;
    for(int i=2;i<segments.Length;i++)sourceRoot=Path.GetDirectoryName(sourceRoot);
    foreach(var file in dependencies.Concat(new[]{config})){
     var relative=file.Substring(sourceRoot.TrimEnd('\\','/').Length+1);
     var destination=Files.Under(libraryRoot,relative);
     string previous;
     if(!copies.TryGetValue(destination,out previous)&&File.Exists(destination))previous=destination;
     string hash;
     if(!sharedScanHashes.TryGetValue(file,out hash))hash=Files.Hash(file);
     if(previous!=null&&!string.Equals(previous,file,StringComparison.OrdinalIgnoreCase)&&Files.Hash(previous)!=hash)
      throw new IOException("共享模型依赖与工程中的文件重名："+relative);
     sharedScanHashes[file]=hash;
     copies[destination]=file;
    }
   }catch(Exception e){Add("unsupported",0,reference,"无法收集共享 3D 模型："+e.Message);}
  }
  readonly Dictionary<string,string> copiedDefaultMotions=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
  internal void LocalizeCopiedDefaultMotions(){
   foreach(var pair in copiedDefaultMotions){
    var config=J.Read(pair.Key);
    var from=new Uri(Path.GetDirectoryName(pair.Key)+Path.DirectorySeparatorChar);
    var relative=from.MakeRelativeUri(new Uri(pair.Value)).ToString();
    foreach(var component in J.A(J.Get(config,"components")).Where(c=>J.S(c,"type")=="model"&&J.S(c,"role")!="head"))
     J.D(component)["defaultMotion"]=relative.StartsWith("../",StringComparison.Ordinal)?relative:"./"+relative;
    J.Write(pair.Key,config);
   }
  }
  public static object AudioLoopPoints(object probe,double durationMs){
   var stream=J.A(J.Get(probe,"streams")).FirstOrDefault(s=>J.S(s,"codec_type")=="audio");
   string codec=J.S(stream,"codec_name");
   if(codec!="opus"&&codec!="vorbis")return null;
   var tags=new Dictionary<string,string>();
   foreach(var source in new[]{J.Get(J.Get(probe,"format"),"tags"),J.Get(stream,"tags")})
    foreach(var tag in J.D(source))tags[tag.Key.ToUpperInvariant().Replace("_","")]=Convert.ToString(tag.Value);
   Func<string,double> number=key=>{string value;double parsed;return tags.TryGetValue(key,out value)&&Regex.IsMatch(value,@"^\d+$")&&double.TryParse(value,System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out parsed)&&parsed<=9007199254740991d?parsed:double.NaN;};
   double rate=tags.ContainsKey("LOOPSAMPLERATE")?number("LOOPSAMPLERATE"):codec=="opus"?48000:J.N(stream,"sample_rate");
   double start=number("LOOPSTART"),end=tags.ContainsKey("LOOPEND")?number("LOOPEND"):start+number("LOOPLENGTH");
   if(double.IsNaN(start)||double.IsNaN(end)||!(rate>0)||start<0||end<=start||end>9007199254740991d||end/rate>durationMs/1000)return null;
   return J.O("start",start/rate,"end",end/rate);
  }
  public ProjectAssets(string project,string root,string engine,string script,Action<object> log,EngineAdapter adapter){Adapter=adapter;Project=Files.Full(project);Root=Files.Full(root);Engine=string.IsNullOrWhiteSpace(engine)?Project:Files.Full(engine);Script=script.TrimStart('\uFEFF');Log=log;if(Files.Within(Project,Root,true))throw new IOException("工作目录必须位于原工程之外");}
  void Report(object value){if(Log!=null)Log(value);}
  public void Skeleton(){Adapter.Prepare(Root);var initialTemplate=Directory.Exists(Path.Combine(Project,"game/template"))?Path.Combine(Project,"game/template"):Path.Combine(Engine,"game/template");if(Directory.Exists(initialTemplate))Files.CopyTree(initialTemplate,Path.Combine(Root,"game/template"));Directory.CreateDirectory(Path.Combine(Root,"game/scene"));Files.Atomic(Path.Combine(Root,"game/scene/start.txt"),":;\n");Directory.CreateDirectory(Path.Combine(Root,"lib"));foreach(var name in new[]{"live2d.min.js","live2dcubismcore.min.js"}){var source=new[]{Project,Engine}.Distinct(StringComparer.OrdinalIgnoreCase).Select(p=>Path.Combine(p,"lib",name)).FirstOrDefault(File.Exists);libraries.Add(J.O("name",name,"found",source!=null));if(source!=null)Files.CopyFile(source,Path.Combine(Root,"lib",name));else if(File.Exists(Path.Combine(Root,"lib",name)))File.Delete(Path.Combine(Root,"lib",name));}var config=Path.Combine(Project,"game/config.txt");string configText=File.Exists(config)?File.ReadAllText(config):"Game_name:WebGAL;\nDefault_Language:zh_CN;\nStage_Width:1920;\nStage_Height:1080;\n";Files.Atomic(Path.Combine(Root,"game/config.txt"),Shared==null?configText:Shared.LocalizeSource(configText));Files.Atomic(Path.Combine(Root,"game/userStyleSheet.css"),"");Files.Atomic(Path.Combine(Root,"game/animation/animationTable.json"),"[]");}
  string LocalFile(string kind,string name){foreach(var root in new[]{Project,Engine}.Distinct(StringComparer.OrdinalIgnoreCase)){string p;try{p=Files.Under(Path.Combine(root,"game"),kind+"/"+name);}catch{return null;}if(File.Exists(p))return p;}return null;}
  public string Resolve(string kind,string name){name=PhysicalName(Clean(kind,name));if(AmbiguousWindowsPath(name))return null;string local=LocalFile(kind,name);if(local!=null)return local;if(Shared!=null&&name.StartsWith(SharedAssets.Prefix,StringComparison.Ordinal))return Shared.Resolve(kind,name);return null;}
  public static string Clean(string kind,string name){return Regex.Replace(name??"","^\\.?/?game/"+kind+"/","");}
  bool Allowed(string file){return Files.Within(Project,file)||Files.Within(Engine,file)||(Shared!=null&&Shared.Allowed(file));}
  void Add(string kind,int line,string file,string message,object action=null){var key=J.Text(new[]{kind,file,message});object o;if(!issues.TryGetValue(key,out o)){o=J.O("kind",kind,"file",file,"message",message,"lines",new List<object>());issues[key]=o;}var lines=(List<object>)J.Get(o,"lines");if(line>0&&!lines.Contains(line))lines.Add(line);if(action!=null)actions.Add(action);}void AddWarning(string kind,int line,string file,string message,object action=null){var key=J.Text(new[]{kind,file,message});object o;if(!warnings.TryGetValue(key,out o)){o=J.O("kind",kind,"file",file,"message",message,"lines",new List<object>());warnings[key]=o;}var lines=(List<object>)J.Get(o,"lines");if(line>0&&!lines.Contains(line))lines.Add(line);if(action!=null)actions.Add(action);}static bool External(string value){return Regex.IsMatch(value??"",@"^(?:https?:)?//",RegexOptions.IgnoreCase);}static bool RuntimeVariable(string value){return Regex.IsMatch(value??"",@"(?<!\\)\{\s*(?![""\']|\{)[^{}\r\n]+\s*\}");}
  void JsonChildren(object obj,string key,List<string> values){if(obj is string){if(Resource.IsMatch((string)obj)&&!key.Equals("name",StringComparison.OrdinalIgnoreCase))values.Add((string)obj);}else if(obj is Dictionary<string,object>){foreach(var kv in J.D(obj))JsonChildren(kv.Value,kv.Key,values);}else foreach(var v in J.A(obj))JsonChildren(v,key,values);}
  const string LegacyLibrary="live2d.min.js",ModernLibrary="live2dcubismcore.min.js";
  static bool FigureMayUseModel(string name){
   if(string.IsNullOrWhiteSpace(name)||name=="none")return false;
   if(RuntimeVariable(name))return true;
   var type=Regex.Match(name,@"[?&]type=([^&#]*)",RegexOptions.IgnoreCase);if(type.Success&&!new[]{"image","img","video"}.Contains(type.Groups[1].Value,StringComparer.OrdinalIgnoreCase))return true;
   return !Regex.IsMatch(PhysicalName(name),@"\.(?:png|jpe?g|webp|gif|bmp|avif|svg|mp4|webm|mov|mkv)$",RegexOptions.IgnoreCase);
  }
  static string ModelLibraryHint(string name){
   var clean=PhysicalName(name??"");
   if(Regex.IsMatch(clean,@"(?:\.moc3|\.model3\.json)$",RegexOptions.IgnoreCase))return ModernLibrary;
   if(Regex.IsMatch(clean,@"(?:\.moc|\.model\.json)$",RegexOptions.IgnoreCase))return LegacyLibrary;
   return null;
  }
  void RequireModelLibraries(string name,IEnumerable<string> inferred,bool explicitModel,bool container=false){
   bool knownModel=(inferred??new string[0]).Any()||ModelLibraryHint(name)!=null;
   // The pinned combined Live2D plugin checks BOTH globals at module startup,
   // even when every referenced model uses only one Cubism generation.
   // Unknown model metadata remains fail-closed; aggregates inspect every child.
   if(knownModel||(explicitModel&&!container)){requiredLibraries.Add(LegacyLibrary);requiredLibraries.Add(ModernLibrary);}
  }
  static void ModelChildren(object value,string key,HashSet<string> paths){
   if(value is string){if(new[]{"model","Moc","modelRelativePath"}.Contains(key,StringComparer.OrdinalIgnoreCase))paths.Add((string)value);}
   else if(value is Dictionary<string,object>)foreach(var item in J.D(value))ModelChildren(item.Value,item.Key,paths);
   else foreach(var item in J.A(value))ModelChildren(item,key,paths);
  }
  void Inspect(string file,int line,string label,object action,string destination,HashSet<string> ancestry=null,bool modelReference=false,string sharedLibraryId=null){
   if(file==null||!File.Exists(file)){RequireModelLibraries(label,null,modelReference);Add("missing",line,label,"找不到资源文件",action);return;}
   if(!Allowed(file)){RequireModelLibraries(label,null,modelReference);Add("unsupported",line,label,"资源引用超出工程目录，请先导入工程");return;}
   if(Shared!=null&&Shared.Allowed(file)&&!sharedScanHashes.ContainsKey(file))sharedScanHashes[file]=Files.Hash(file);
   checkedFiles.Add(file);var key=file+"|"+line+"|"+J.Text(action)+"|"+modelReference;if(sharedScanHashes.ContainsKey(file))key+="|"+destination;
   if(visits.Contains(key)||(ancestry!=null&&ancestry.Contains(file))){if(modelReference)RequireModelLibraries(file,null,true);return;}visits.Add(key);
   if(destination!=null){if(!Files.Within(Root,destination))throw new IOException("资源副本路径无效");copies[destination]=file;}
   var extension=Path.GetExtension(file).ToLowerInvariant();
   if(!new[]{".json",".jsonl",".wmdl"}.Contains(extension)){RequireModelLibraries(file,null,modelReference);return;}
   ModelDependencies dependencies;
   try{dependencies=ReadModelDependencies(file,destination,extension);RequireModelLibraries(file,dependencies.Libraries,modelReference,dependencies.Container);}
   catch(Exception e){RequireModelLibraries(file,null,modelReference);Add("syntax",line,label,"模型或 JSON 无法解析："+e.Message);return;}
   var next=ancestry==null?new HashSet<string>(StringComparer.OrdinalIgnoreCase):new HashSet<string>(ancestry,StringComparer.OrdinalIgnoreCase);next.Add(file);
   foreach(var value in dependencies.Children){
    bool childModel=dependencies.Container||dependencies.ModelChildren.Contains(value);
    if(External(value)){RequireModelLibraries(value,null,childModel);AddWarning("external-resource",line,value,"外链资源不会写入本地快照；导出结果依赖当前网络、CORS 与远端内容是否变化。");continue;}
    if(value.StartsWith("data:",StringComparison.OrdinalIgnoreCase)){RequireModelLibraries(value,null,childModel);continue;}
    string child,target;
    try{var clean=PhysicalName(value);bool gameRelative=extension==".jsonl"&&clean.StartsWith("game/",StringComparison.OrdinalIgnoreCase);string sourceRoot=Files.Within(Project,file)?Project:Engine;child=Files.Full(Path.Combine(gameRelative?sourceRoot:Path.GetDirectoryName(file),clean));target=destination==null?null:Files.Full(Path.Combine(gameRelative?Root:Path.GetDirectoryName(destination),clean));if(target!=null&&!Files.Within(Root,target))throw new IOException("资源路径超出工程目录");}
    catch(Exception e){RequireModelLibraries(value,null,childModel);Add("unsupported",line,value,e.Message);continue;}
    if(Shared!=null&&Shared.Allowed(file))try{Shared.CheckDependency(file,child,sharedLibraryId);}catch(Exception e){Add("unsupported",line,value,e.Message);continue;}
    Inspect(child,line,value,action,target,next,childModel,sharedLibraryId);
   }
  }
  // assetSetter prefixes resource names before URL parsing: only the complete
  // URL's raw trailing C0/ASCII space is discarded. Decode afterwards so %20
  // and fullwidth/internal spaces remain real path characters.
  public static string NormalizeResourceUrlReference(string name){return Regex.Replace(Regex.Replace(name??"",@"[\x00-\x20]+$",""),@"[\t\n\r]","");}
  static string PhysicalName(string name){return Uri.UnescapeDataString(Regex.Split(NormalizeResourceUrlReference(name),"[?#]")[0]).Replace('\\','/');}
  static bool AmbiguousWindowsPath(string name){return name.Split('/').Any(part=>part.EndsWith(" ",StringComparison.Ordinal));}
  ModelDependencies ReadModelDependencies(string file,string destination,string extension){
   var stamp=new FileInfo(file);string cacheKey=file+"|"+stamp.Length+"|"+stamp.LastWriteTimeUtc.Ticks;ModelDependencies cached;
   if(dependencyCache.TryGetValue(cacheKey,out cached)){if(destination!=null&&cached.Container)AggregateCounts["/"+destination.Substring(Root.Length+1).Replace('\\','/')]=cached.Children.Length;return cached;}
   var children=new List<string>();var modelChildren=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var librariesNeeded=new HashSet<string>(StringComparer.OrdinalIgnoreCase);bool container=extension==".jsonl"||extension==".wmdl";
   if(extension==".json"){
    var data=J.Read(file);JsonChildren(data,"",children);ModelChildren(data,"",modelChildren);
    var moc=J.S(J.Get(data,"FileReferences"),"Moc");if(moc!=""){librariesNeeded.Add(ModernLibrary);children.Add(moc);modelChildren.Add(moc);}
    var legacyModel=J.S(data,"model");if(legacyModel!=""){librariesNeeded.Add(ModelLibraryHint(legacyModel)??LegacyLibrary);children.Add(legacyModel);modelChildren.Add(legacyModel);}
    foreach(var child in modelChildren)if(!string.IsNullOrWhiteSpace(child))children.Add(child);
   }else{
    if(!Adapter.SupportsMygoFigures)throw new IOException("聚合模型需要 MyGO 引擎");
    if(extension==".jsonl")foreach(var line in File.ReadLines(file)){
     if(string.IsNullOrWhiteSpace(line))continue;var row=J.Parse(line);if(J.Get(row,"motions")!=null||J.Get(row,"expressions")!=null)continue;string child=J.S(row,"path");if(child!="")children.Add(child);
    }
    else{var model=J.Read(file);foreach(var row in new[]{model}.Concat(J.A(J.Get(model,"subModels")))){string child=J.S(row,"modelRelativePath");if(child!="")children.Add(child);}}
    if(children.Count==0)throw new IOException("聚合模型没有有效的子模型路径");
   }
   var result=new ModelDependencies{Children=container?children.ToArray():children.Distinct(StringComparer.OrdinalIgnoreCase).ToArray(),ModelChildren=modelChildren.ToArray(),Libraries=librariesNeeded.ToArray(),Container=container};dependencyCache[cacheKey]=result;
   if(destination!=null&&container)AggregateCounts["/"+destination.Substring(Root.Length+1).Replace('\\','/')]=result.Children.Length;return result;
  }
  void InspectTemplateModels(string file){
   var dependencies=ReadModelDependencies(file,null,".json");
   var candidates=dependencies.ModelChildren.Concat(dependencies.Children.Where(value=>ModelLibraryHint(value)!=null||Regex.IsMatch(PhysicalName(value),@"\.(jsonl|wmdl)$",RegexOptions.IgnoreCase))).Distinct(StringComparer.OrdinalIgnoreCase);
   foreach(var value in candidates){
    if(string.IsNullOrWhiteSpace(value))continue;
    if(External(value)||value.StartsWith("data:",StringComparison.OrdinalIgnoreCase)){RequireModelLibraries(value,null,true);AddWarning("external-resource",0,value,"模板模型引用无法在本地验证；保留 Live2D 运行库检查。");continue;}
    var clean=PhysicalName(value);string sourceRoot=Files.Within(Project,file)?Project:Engine;
    string child=Regex.IsMatch(clean,@"^\.?/?game/")?Files.Full(Path.Combine(sourceRoot,Regex.Replace(clean,@"^\.?/?game/","game/"))):Files.Full(Path.Combine(Path.GetDirectoryName(file),clean));
    Inspect(child,0,value,null,null,null,true);
   }
  }
  void Ref(string kind,string name,int line,object action){
   if(string.IsNullOrEmpty(name)||name=="none")return;bool modelReference=kind=="figure"&&FigureMayUseModel(name);
   if(External(name)){RequireModelLibraries(name,null,modelReference);AddWarning("external-resource",line,name,"外链素材不会写入本地快照；导出结果依赖当前网络、CORS 与远端内容是否变化。");return;}
   if(Adapter.IsLoveLive&&kind=="figure"&&!External(name)) {
    string[] parts=Regex.Split(name,@"(?<=config\.json)\+",RegexOptions.IgnoreCase)
     .Select(part=>PhysicalName(Clean("figure",Clean("3d/figure",part)))).ToArray();
    string figureRoot=Path.Combine(Project,"game/3d/figure");
    if(parts.All(part=>Path.GetFileName(part).Equals("config.json",StringComparison.OrdinalIgnoreCase))){
     try{
      bool found=true;
      for(int index=0;index<parts.Length;index++){
       var part=parts[index];
       var role=parts.Length==2?(index==0?"head":"body"):null;
       var local=Files.Under(figureRoot,part);
       if(File.Exists(local)){CollectLocalGltf(local,role);continue;}
       if(Shared!=null&&part.StartsWith(SharedAssets.Prefix,StringComparison.Ordinal)){
        var config=Shared.Resolve(kind,part);
        if(IsGltfPackage(config))CollectSharedGltf(part,config,role);else found=false;
       }else found=false;
      }
      if(found)return;
     }catch(Exception e){Add("missing",line,name,e.Message,action);return;}
    }
   }
   string reference=name;name=PhysicalName(Clean(kind,name));if(AmbiguousWindowsPath(name)){Add("unsupported",line,name,"资源 URL 的编码空格或查询前空格保留为真实路径字符；Windows 不支持路径段末尾 ASCII 空格，不能替换为无空格文件",action);return;}string target;try{target=Files.Under(Path.Combine(Root,"game"),kind+"/"+name);}catch{RequireModelLibraries(name,null,modelReference);Add("unsupported",line,name,"资源路径超出工程目录");return;}
   string resolved;try{resolved=Resolve(kind,reference);}catch(Exception e){Add("missing",line,name,e.Message,action);return;}
   Inspect(resolved,line,kind+"/"+name,action,target,null,modelReference,name.StartsWith(SharedAssets.Prefix,StringComparison.Ordinal)?name.Substring(SharedAssets.Prefix.Length).Split('/')[0]:null);
  }
  public void CollectShared(string kind,string reference){
   if(Shared!=null)reference=Shared.LocalizeSource(reference);
   var parts=kind=="figure"&&Adapter.IsLoveLive
    ? Regex.Split(reference??"", @"(?<=config\.json)\+",RegexOptions.IgnoreCase)
    : new[]{reference};
   if(parts.Any(part=>PhysicalName(Clean(kind,part)).StartsWith(SharedAssets.Prefix,StringComparison.Ordinal)))
    Ref(kind,reference,0,null);
  }
  public void CollectSharedConfig(string text){if(Shared!=null){Shared=Shared.ForHttpSource(text);text=Shared.LocalizeSource(text);}text=Regex.Replace(text??"",@"(?m)^\s*;[^\r\n]*","");foreach(Match match in Regex.Matches(text,@"(?:^|[;\r\n])\s*(Title_img|Title_bgm|Game_Logo)\s*:\s*([^;]*)",RegexOptions.IgnoreCase)){string kind=match.Groups[1].Value.Equals("Title_bgm",StringComparison.OrdinalIgnoreCase)?"bgm":"background",value=Regex.Split(match.Groups[2].Value,@"\s+-")[0].Trim();foreach(string reference in value.Split('|'))CollectShared(kind,reference.Trim());}}
  void CollectSharedLiteral(string value){
   if(Adapter.IsLoveLive&&Shared!=null&&SharedAssets.GltfNamedKind(value)!=null){
    var kind=SharedAssets.GltfNamedKind(value);
    var destination=Files.Under(Path.Combine(Root,"game/3d",kind),PhysicalName(value));
    var local=LocalFile("3d/"+kind,PhysicalName(value));
    if(local!=null){if(collectLocalGltf&&Files.Within(Project,local))CopyProjectResource(local);return;}
    try{
     var file=Shared.ResourceFile(PhysicalName(value));
     if(!sharedScanHashes.ContainsKey(file))sharedScanHashes[file]=Files.Hash(file);
     if(File.Exists(destination)&&Files.Hash(destination)!=sharedScanHashes[file])
      throw new IOException("共享动作或表情与目标文件重名："+value);
     copies[destination]=file;
    }
    catch(Exception e){Add("missing",0,value,e.Message);}
    return;
   }
   if(Adapter.IsLoveLive&&value.EndsWith("/config.json",StringComparison.OrdinalIgnoreCase)
     &&File.Exists(Files.Under(Path.Combine(Project,"game/3d/figure"),PhysicalName(value))))return;
   string id=value.Substring(SharedAssets.Prefix.Length).Split('/')[0],registered=Shared==null?null:Shared.KindForId(id);if(registered!=null){if(registered!="all")CollectShared(registered,value);else{string file=Shared.Resolve("figure",value),extension=Path.GetExtension(file).ToLowerInvariant();string[] kinds=Regex.IsMatch(extension,@"^\.(jsonl|wmdl|json|moc3?|mtn)$")?new[]{"figure"}:Regex.IsMatch(extension,@"^\.(png|jpe?g|webp|gif|bmp|avif|svg)$")?new[]{"figure","background"}:Regex.IsMatch(extension,@"^\.(mp3|wav|ogg|opus|m4a|aac|flac)$")?new[]{"bgm","vocal"}:Regex.IsMatch(extension,@"^\.(mp4|webm|mov|mkv)$")?new[]{"background","video"}:SharedAssets.Kinds;foreach(string kind in kinds)CollectShared(kind,value);}return;}bool found=false;foreach(string kind in SharedAssets.Kinds){string name=PhysicalName(Clean(kind,value));if(!AmbiguousWindowsPath(name)&&LocalFile(kind,name)!=null){CollectShared(kind,value);found=true;}}if(!found)Add("missing",0,value,"共享素材来源未登记，请重新选择文件夹");}
  public void CollectSharedSource(string source){
   if(Shared==null)return;
   if(Adapter.IsLoveLive){
    source=Shared.LocalizeSource(source);
    source=Regex.Replace(source,@"(?im)^(\s*changeFigure\s*:\s*)(?<pair>[^;\r\n]+?config\.json\+[^;\r\n]+?config\.json)(?=\s|;|$)",match=>{
     string pair=match.Groups["pair"].Value;
     if(!Regex.Split(pair,@"(?<=config\.json)\+",RegexOptions.IgnoreCase).Any(part=>part.StartsWith(SharedAssets.Prefix,StringComparison.Ordinal)))return match.Value;
     Ref("figure",pair,0,null);
     return match.Groups[1].Value;
    });
   }
   foreach(string reference in Shared.SourceReferences(source).Distinct(StringComparer.Ordinal))CollectSharedLiteral(reference);
  }
  void CollectSharedNamedArgs(object parameters){
   if(!Adapter.IsLoveLive||Shared==null)return;
   foreach(var key in new[]{"motion","expression"}){
    var reference=Shared.LocalizeSource(J.S(parameters,key));
    if(SharedAssets.GltfNamedKind(reference)!=null)CollectSharedLiteral(reference);
   }
  }
  public void CollectSharedScene(object parsed){var mapping=new Dictionary<string,string>{{"changeBg","background"},{"changeFigure","figure"},{"miniAvatar","figure"},{"bgm","bgm"},{"playEffect","vocal"},{"playVideo","video"},{"unlockCg","background"},{"unlockBgm","bgm"}};var args=new Dictionary<string,string>{{"vocal","vocal"},{"backgroundImage","background"},{"mouthOpen","figure"},{"mouthClose","figure"},{"mouthHalfOpen","figure"},{"eyesOpen","figure"},{"eyesClose","figure"}};foreach(var sentence in J.A(J.Get(parsed,"sentenceList"))){string command=J.S(sentence,"commandRaw");if(mapping.ContainsKey(command))CollectShared(mapping[command],J.S(sentence,"content"));if(command=="setVar"){string content=J.S(sentence,"content");int equal=content.IndexOf('=');if(equal>=0){string value=content.Substring(equal+1).Trim().Trim('"','\'');if(value.StartsWith(SharedAssets.Prefix,StringComparison.Ordinal)){CollectSharedLiteral(value);}}}var parameters=Params(sentence);CollectSharedNamedArgs(parameters);foreach(var pair in args)if(parameters.ContainsKey(pair.Key))CollectShared(pair.Value,J.S(parameters,pair.Key));}}
  public object CopyShared(){if(issues.Count>0)throw new IOException(string.Join("；",issues.Values.Select(v=>J.S(v,"file")+"："+J.S(v,"message"))));foreach(var pair in copies)Files.CopyFile(pair.Value,pair.Key);return WriteSharedManifest();}
  string SharedCopiedHash(string source,string copy){string actual=Files.Hash(copy),expected;if(sharedScanHashes.TryGetValue(source,out expected)&&actual!=expected)throw new IOException("共享素材在准备期间已更新，请重新导出："+Path.GetFileName(source));return actual;}
  public object WriteSharedManifest(){var entries=copies.Where(p=>Shared!=null&&Shared.Allowed(p.Value)).OrderBy(p=>p.Key,StringComparer.OrdinalIgnoreCase).Select(p=>J.O("path",p.Key.Substring(Root.Length+1).Replace('\\','/'),"sha256",SharedCopiedHash(p.Value,p.Key))).ToArray();if(entries.Length==0)return null;var result=J.O("schemaVersion",1,"files",entries,"digest",Files.HashText(J.Text(entries)));J.Write(Path.Combine(Root,"shared-assets-manifest.json"),result);return result;}
  public static Dictionary<string,object> Params(object sentence){var p=new Dictionary<string,object>();foreach(var arg in J.A(J.Get(sentence,"args")))p[J.S(arg,"key")]=J.Get(arg,"value");return p;}
  public static bool SingleLineHint(string command,object sentence,Dictionary<string,object> args){if(command!="choose"||J.N(args,"defaultChoose",-1)!=1||J.B(args,"next"))return false;var options=Regex.Split(J.S(sentence,"content"),@"(?<!\\)\|");if(options.Length!=1)return false;var nodes=Regex.Split(options[0],@"(?<!\\):");return nodes.Length==2&&Regex.IsMatch(nodes[1].Trim(),@"^__wvp_hint_[A-Za-z0-9_]+$");}
  public static bool ConvertibleSingleChoose(string command,object sentence,Dictionary<string,object> args){if(command!="choose"||args.ContainsKey("wvpHint")||J.B(args,"next")||args.Keys.Any(key=>key!="defaultChoose"))return false;var options=Regex.Split(J.S(sentence,"content"),@"(?<!\\)\|");if(options.Length!=1||options[0].Contains("->"))return false;var nodes=Regex.Split(options[0],@"(?<!\\):");return nodes.Length==2&&!string.IsNullOrWhiteSpace(nodes[0])&&!string.IsNullOrWhiteSpace(nodes[1]);}
  void CheckJson(object text,bool array,int line,string label){try{object value=text is string?J.Parse((string)text):text;if(array?!(value is object[]):!(value is Dictionary<string,object>))throw new Exception(array?"应为动画帧数组":"应为对象");}catch(Exception e){Add("syntax",line,label,"参数无法解析："+e.Message);}}
  readonly HashSet<string> timingFigures=new HashSet<string>(StringComparer.Ordinal);
  public string PrepareTimingFigures(string source,object parsed){
   var lines=VideoWorkflow.CanonicalSource(source).Split('\n');
   foreach(var sentence in J.A(J.Get(parsed,"sentenceList"))){
    string command=J.S(sentence,"commandRaw"),content=J.S(sentence,"content");
    if((command!="changeFigure"&&command!="miniAvatar")||J.B(sentence,"isLineBreakHolder")||
      !Regex.IsMatch(content,@"\.(jsonl?|wmdl|skel)(?:[?#].*)?$|[?&]type=(?:live2d|spine)(?:[&#]|$)",RegexOptions.IgnoreCase))continue;
    int first=(int)J.N(sentence,"startLine",-1);
    if(first<0||first>=lines.Length)throw new IOException("时间分析立绘语句边界无效");
    string line=lines[first];int colon=line.IndexOf(':'),args=line.IndexOf(" -",colon+1,StringComparison.Ordinal);
    var comment=Regex.Match(line,@"(?<!\\);");
    int end=comment.Success?comment.Index:line.Length;
    if(args>=0)end=Math.Min(end,args);
    if(colon<0||end<=colon)throw new IOException("时间分析无法保留立绘语句参数");
    // One image per original reference preserves same-figure updates and replacements.
    string name="__webvideo_timing/"+Files.HashText(content)+".png";
    if(timingFigures.Add(name))LayerExport.WriteTransparentImage(Files.Under(Path.Combine(Root,"game/figure"),name));
    lines[first]=line.Substring(0,colon+1)+name+line.Substring(end);
   }
   return string.Join("\n",lines);
  }
  public object Scan(object parsed,bool ignoreStageBackground=false,bool timingOnly=false){
   collectLocalGltf=Adapter.IsLoveLive&&!timingOnly;
   bool dynamicGltf=false;
   Parsed=parsed;
   var lines=Regex.Split(Script,"\r?\n");
   var sentences=J.A(J.Get(parsed,"sentenceList"));
   var forbidden=new HashSet<string>(new[]{"changeScene","callScene","return","choose","chooseLabel","jumpLabel","getUserInput","if","setVar","showVars"});
   var known=new HashSet<string>(new[]{"say","changeBg","changeFigure","bgm","playVideo","pixiPerform","pixiInit","intro","miniAvatar","changeScene","choose","end","setComplexAnimation","setFilter","label","jumpLabel","chooseLabel","setVar","if","callScene","showVars","unlockCg","unlockBgm","filmMode","setTextbox","setAnimation","playEffect","setTempAnimation","comment","__commment","setTransform","setTransition","getUserInput","applyStyle","wait","callSteam","return"});
   var sideEffects=new HashSet<string>(new[]{"unlockCg","unlockBgm","callSteam"});
   var mapping=new Dictionary<string,string>{{"changeBg","background"},{"changeFigure","figure"},{"miniAvatar","figure"},{"bgm","bgm"},{"playEffect","vocal"},{"playVideo","video"}};
   var args=new Dictionary<string,string>{{"vocal","vocal"},{"backgroundImage","background"},{"mouthOpen","figure"},{"mouthClose","figure"},{"mouthHalfOpen","figure"},{"eyesOpen","figure"},{"eyesClose","figure"}};
   for(int i=0;i<lines.Length;i++){
    if(string.IsNullOrWhiteSpace(lines[i])||lines[i].TrimStart().StartsWith(";"))continue;
    if(i>=sentences.Count){Add("syntax",i+1,"场景","此行未能解析");continue;}
    var s=sentences[i];
    if(J.B(s,"isLineBreakHolder"))continue;
    int first=Math.Max(0,(int)J.N(s,"startLine",i)),last=Math.Max(first,(int)J.N(s,"endLine",first)),line=first+1,endLine=last+1;
    string cmd=J.N(s,"command",-1)==0?"say":J.S(s,"commandRaw");
    var p=Params(s);
    bool timingFigure=(cmd=="changeFigure"||cmd=="miniAvatar")&&timingFigures.Count>0&&timingFigures.Contains(PhysicalName(Clean("figure",J.S(s,"content"))));
    if(!timingFigure)CollectSharedNamedArgs(p);
    if(collectLocalGltf){
     if(cmd=="changeFigure"){
      string motion=J.S(p,"motion"),expression=J.S(p,"expression");
      dynamicGltf|=RuntimeVariable(J.S(s,"content"))||RuntimeVariable(motion)||RuntimeVariable(expression);
      if(!RuntimeVariable(motion))CollectLocalGltfNamed("motion",motion);
      if(!RuntimeVariable(expression))CollectLocalGltfNamed("expression",expression);
     }
     dynamicGltf|=!known.Contains(cmd);
    }
    if(!known.Contains(cmd)){RequireModelLibraries(J.S(s,"content"),null,true);AddWarning("custom-command",line,cmd,"检测到非标准或深度定制引擎指令；WebVideo+ 会按当前运行时执行，但不保证其隐藏状态能够跨 Worker 恢复。");}
    if(RuntimeVariable(J.S(s,"content"))||p.Values.OfType<string>().Any(RuntimeVariable))AddWarning("runtime-variable",line,cmd,"检测到运行时变量插值。导出使用独立临时运行环境，不保证继承玩家存档中的变量值。");
    bool singleLineHint=SingleLineHint(cmd,s,p),convertibleSingleChoose=ConvertibleSingleChoose(cmd,s,p);
    var skip=J.O("line",line,"startLine",line,"endLine",endLine,"kind","skip-line");
    if(sideEffects.Contains(cmd))AddWarning("nonvisual-side-effect",line,cmd,"此指令只影响游戏存档、鉴赏解锁或外部平台状态；导出副本会忽略该副作用。",skip);
    if((forbidden.Contains(cmd)&&!singleLineHint)||J.B(p,"userForward")||p.ContainsKey("when"))Add("unsupported",line,cmd,convertibleSingleChoose?"普通单选分支会等待玩家操作；可转为单行提示后导出":"含跨场景、分支、变量或需要玩家操作的命令");
    if(cmd=="setTransform"||cmd=="setTempAnimation")CheckJson(J.Get(s,"content"),cmd=="setTempAnimation",line,cmd);
    if(p.ContainsKey("transform"))CheckJson(p["transform"],false,line,"transform");
    double wait;if(cmd=="wait"&&(!double.TryParse(J.S(s,"content"),out wait)||wait<0))Add("syntax",line,"wait","等待时长需要是非负毫秒数");
    if(!timingFigure&&(cmd=="changeFigure"||cmd=="miniAvatar")&&J.S(s,"content")!="none"&&p.Keys.Any(key=>new[]{"motion","skin","expression","blink","focus","animationFlag"}.Contains(key)||Regex.IsMatch(key,"model|live2d|cubism",RegexOptions.IgnoreCase)||key=="type"&&!new[]{"image","img","video"}.Contains(J.S(p,key),StringComparer.OrdinalIgnoreCase)))RequireModelLibraries(J.S(s,"content"),null,true);
    if(!timingFigure&&mapping.ContainsKey(cmd)&&!(ignoreStageBackground&&cmd=="changeBg"))Ref(mapping[cmd],J.S(s,"content"),line,skip);
    if(cmd=="changeFigure"){
     var value=J.S(s,"content");
     if(Regex.IsMatch(value,@"\.(skel|mkv)([?#].*)?$",RegexOptions.IgnoreCase)||value.Contains("type=spine"))Add("unsupported",line,value,"当前不支持此立绘格式");
     else if(!Adapter.SupportsMygoFigures&&(Regex.IsMatch(value,@"\.(webm|mp4|mov|jsonl|wmdl)([?#].*)?$",RegexOptions.IgnoreCase)||value.Contains("type=video")))Add("unsupported",line,value,"此立绘需要选择已安装的 MyGO 3.2.1 引擎");
    }
    foreach(var a in args)if(p.ContainsKey(a.Key))Ref(a.Value,J.S(p,a.Key),line,J.O("line",line,"startLine",line,"endLine",endLine,"kind","remove-argument","key",a.Key));
    if(cmd=="setAnimation")Ref("animation",J.S(s,"content")+".json",line,skip);
    if(new[]{"setTransition","changeBg","changeFigure"}.Contains(cmd))foreach(var key in new[]{"enter","exit"})if(p.ContainsKey(key))Ref("animation",J.S(p,key)+".json",line,J.O("line",line,"startLine",line,"endLine",endLine,"kind","remove-argument","key",key));
    if(i%10==0)Report(J.O("phase","scanning","scannedLines",line,"totalLines",lines.Length,"checkedFiles",checkedFiles.Count));
   }
   if(collectLocalGltf)CopyGltfTree(Path.Combine(Project,dynamicGltf?"game/3d":"game/3d/runtime"));
   var template=Directory.Exists(Path.Combine(Project,"game/template"))?Path.Combine(Project,"game/template"):Path.Combine(Engine,"game/template");
   if(Directory.Exists(template))foreach(var file in Directory.EnumerateFiles(template,"*",SearchOption.AllDirectories)){
    checkedFiles.Add(file);
    if(Path.GetExtension(file).Equals(".json",StringComparison.OrdinalIgnoreCase))try{InspectTemplateModels(file);}catch(Exception e){Add("syntax",0,Path.GetFileName(file),"模板 JSON 无法解析："+e.Message);}
    if(Path.GetFileName(file)=="template.json")try{var templateData=J.Read(file);foreach(var font in J.A(J.Get(templateData,"fonts"))){string url=J.S(font,"url");if(External(url))AddWarning("external-resource",0,url,"模板字体依赖外网；导出时不会下载或固化远端字体，失败时将使用可用回退字体。");}}catch(Exception e){Add("syntax",0,"template.json","模板 JSON 无法解析："+e.Message);}
    if(Regex.IsMatch(file,@"\.(css|scss)$",RegexOptions.IgnoreCase)){
     string cssText=File.ReadAllText(file);
     foreach(Match m in Regex.Matches(cssText,"url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)")){
      string name=m.Groups[1].Value.Trim();if(External(name)){AddWarning("external-resource",0,name,"样式表引用外链资源；导出时不会下载或固化远端内容。");continue;}if(Regex.IsMatch(name,@"^(data:|#|/assets/)",RegexOptions.IgnoreCase))continue;
      var clean=PhysicalName(name);string sourceRoot=Files.Within(Project,file)?Project:Engine;var child=Regex.IsMatch(clean,@"^\.?/?game/")?Files.Full(Path.Combine(sourceRoot,Regex.Replace(clean,@"^\.?/?game/","game/"))):Files.Full(Path.Combine(Path.GetDirectoryName(file),clean));
      if(Allowed(child))Inspect(child,0,name,J.O("kind","font-fallback"),null);
     }
     foreach(Match m in Regex.Matches(cssText,"@import\\s+(?:url\\()?\\s*[\"']([^\"']+)[\"']",RegexOptions.IgnoreCase)){string name=m.Groups[1].Value.Trim();if(External(name))AddWarning("external-resource",0,name,"样式表通过 @import 依赖外网；导出时不会下载或固化远端内容。");}
    }
   }
   var userCss=Path.Combine(Project,"game/userStyleSheet.css");if(File.Exists(userCss)){string cssText=File.ReadAllText(userCss);foreach(Match m in Regex.Matches(cssText,"(?:url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)|@import\\s+(?:url\\()?\\s*[\"']([^\"']+)[\"'])",RegexOptions.IgnoreCase)){string name=(m.Groups[1].Success?m.Groups[1].Value:m.Groups[2].Value).Trim();if(External(name))AddWarning("external-resource",0,name,"用户样式表依赖外网；导出结果依赖当前网络、CORS 与远端内容。");}}
   var indexHtml=Path.Combine(Project,"index.html");if(File.Exists(indexHtml))foreach(Match m in Regex.Matches(File.ReadAllText(indexHtml),"<link\\b[^>]*href=[\"']([^\"']+)[\"']",RegexOptions.IgnoreCase)){string name=m.Groups[1].Value.Trim();if(External(name))AddWarning("external-resource",0,name,"项目页面引用外链样式或字体；导出时不会下载或固化远端内容。");}
   var sharedConfig=Path.Combine(Project,"game/config.txt");if(File.Exists(sharedConfig))CollectSharedConfig(File.ReadAllText(sharedConfig));
   var table=Path.Combine(Project,"game/animation/animationTable.json");
   if(File.Exists(table))try{
    var names=J.Read(table);if(!(names is object[])||J.A(names).Any(x=>!(x is string)))throw new Exception("应为动画名称数组");
    foreach(var name in J.A(names))Ref("animation",name+".json",0,J.O("kind","animation-table","name",name));
   }catch(Exception e){Add("syntax",0,"animationTable.json","动画表无法解析："+e.Message);}

   foreach(var lib in libraries)if(requiredLibraries.Contains(J.S(lib,"name"))&&!J.B(lib,"found"))Add("environment",0,J.S(lib,"name"),"未找到引擎运行库，请检查工程或安装配置");
   var list=issues.Values.ToArray();
   var unique=actions.GroupBy(J.Text).Select(g=>g.First()).ToArray();
   var sanitized=(string[])lines.Clone();
   var ranged=unique.Where(a=>J.N(a,"startLine",J.N(a,"line"))>0).GroupBy(a=>((int)J.N(a,"startLine",J.N(a,"line")))+"|"+((int)J.N(a,"endLine",J.N(a,"line"))));
   foreach(var group in ranged){
    var sample=group.First();
    int first=(int)J.N(sample,"startLine",J.N(sample,"line"))-1,last=(int)J.N(sample,"endLine",J.N(sample,"line"))-1;
    first=Math.Max(0,Math.Min(first,sanitized.Length-1));last=Math.Max(first,Math.Min(last,sanitized.Length-1));
    if(group.Any(a=>J.S(a,"kind")=="skip-line")){
     for(int n=first;n<=last;n++)sanitized[n]="; 导出副本：跳过缺少资源的语句";
     continue;
    }
    var keys=group.Where(a=>J.S(a,"kind")=="remove-argument").Select(a=>J.S(a,"key")).Where(k=>!string.IsNullOrWhiteSpace(k)).Distinct().ToArray();
    if(keys.Length==0||sanitized[first].StartsWith(";"))continue;
    string logical=string.Join("\n",sanitized.Skip(first).Take(last-first+1));
    foreach(var key in keys)logical=StripArgument(logical,key);
    sanitized[first]=Regex.Replace(logical,@"\s*\r?\n\s*"," ").Trim();
    for(int n=first+1;n<=last;n++)sanitized[n]="; 导出副本：多行参数续行已合并";
   }
   var warningList=warnings.Values.ToArray();return J.O("schemaVersion",2,"complete",true,"totalLines",lines.Length,"checkedFiles",checkedFiles.Count,"issues",list,"warnings",warningList,"actions",unique,"canContinue",list.Length>0&&list.All(x=>J.S(x,"kind")=="missing"),"digest",Files.HashText(J.Text(J.O("script",Script,"issues",list,"warnings",warningList))),"sanitizedScript",string.Join("\n",sanitized));
  }

  static string StripArgument(string line,string key){
   var terminator=Regex.Match(line,@"(?<!\\);");int end=terminator.Success?terminator.Index:line.Length;
   var starts=new List<KeyValuePair<int,string>>();
   for(int at=line.IndexOf(" -",StringComparison.Ordinal);at>=0&&at<end;at=line.IndexOf(" -",at+2,StringComparison.Ordinal)){
    int next=line.IndexOf(" -",at+2,StringComparison.Ordinal);if(next<0||next>end)next=end;
    string body=line.Substring(at+2,next-at-2);int equals=body.IndexOf('=');
    string name=(equals<0?body:body.Substring(0,equals)).Trim();if(Regex.IsMatch(name,@".ogg|.mp3|.wav|.opus",RegexOptions.IgnoreCase))name="vocal";
    starts.Add(new KeyValuePair<int,string>(at,name));
   }
   string result=line;
   for(int i=starts.Count-1;i>=0;i--)if(starts[i].Value==key){int finish=i+1<starts.Count?starts[i+1].Key:end;result=result.Substring(0,starts[i].Key)+result.Substring(finish);}
   return result;
  }

  public async Task Snapshot(){long bytes=0;int count=0;Report(J.O("phase","copying","copiedFiles",0,"copiedBytes",0));foreach(var item in copies){Files.CopyFile(item.Value,item.Key);bytes+=new FileInfo(item.Value).Length;if(++count%10==0){Report(J.O("phase","copying","copiedFiles",count,"copiedBytes",bytes));await Task.Yield();}}var animationsFrom=Path.Combine(Project,"game/animation");if(Directory.Exists(animationsFrom))Files.CopyTree(animationsFrom,Path.Combine(Root,"game/animation"));var css=Path.Combine(Project,"game/userStyleSheet.css");if(File.Exists(css))Files.CopyFile(css,Path.Combine(Root,"game/userStyleSheet.css"));var table=Path.Combine(Root,"game/animation/animationTable.json");var names=J.A(J.TryRead(table)).Where(n=>File.Exists(Path.Combine(Root,"game/animation",n+".json"))).ToArray();J.Write(table,names);var fontRoot=Directory.Exists(Path.Combine(Project,"game/template"))?Project:Engine;var fonts=new FontSnapshot(fontRoot,Root).Run();Presentation=J.O("fonts",fonts,"animationNames",names,"aggregateCounts",AggregateCounts);foreach(var file in Directory.GetFiles(Path.Combine(Root,"game/animation"),"*.json")){if(Path.GetFileName(file)=="animationTable.json")continue;Animations[Path.GetFileNameWithoutExtension(file)]=J.Read(file);}var mediaFiles=copies.Keys.Where(x=>Regex.IsMatch(x.Substring(Root.Length+1).Replace('\\','/'),@"^game/(vocal|bgm)/",RegexOptions.IgnoreCase)||Regex.IsMatch(x,@"\.(mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov|mkv)$",RegexOptions.IgnoreCase)).ToArray();
   // Each header probe can use two codec threads. Bound process creation and
   // commit results in snapshot order after every in-flight probe has finished.
   int parallelism=Math.Min(4,Math.Max(1,Environment.ProcessorCount/2));
   for(int first=0;first<mediaFiles.Length;first+=parallelism){
    int length=Math.Min(parallelism,mediaFiles.Length-first);
    var pending=new Task<KeyValuePair<string,object>>[length];
    Report(J.O("phase","media-info","current",first,"total",mediaFiles.Length));
    for(int i=0;i<length;i++)pending[i]=ReadMediaInfo(mediaFiles[first+i]);
    foreach(var info in await Task.WhenAll(pending))Media[info.Key]=info.Value;
   }
   Report(J.O("phase","copying","copiedFiles",count,"copiedBytes",bytes));}
  async Task<KeyValuePair<string,object>> ReadMediaInfo(string file){
   var url="/"+file.Substring(Root.Length+1).Replace('\\','/');
   object probe;try{probe=await Commands.Probe(file);}catch(Exception e){throw new IOException("无法读取媒体资源："+url+"；"+e.Message,e);}
   double duration=J.N(J.Get(probe,"format"),"duration")*1000;
   bool hasAudio=J.A(J.Get(probe,"streams")).Any(stream=>J.S(stream,"codec_type")=="audio");
   if(double.IsNaN(duration)||double.IsInfinity(duration)||duration<=0)throw new IOException("媒体时长无效："+url);
   if(Regex.IsMatch(url,@"^/game/(vocal|bgm)/",RegexOptions.IgnoreCase)&&!hasAudio)throw new IOException("媒体资源不含音轨："+url);
   return new KeyValuePair<string,object>(url,J.O("durationMs",duration,"hasAudio",hasAudio,"loopPoints",AudioLoopPoints(probe,duration)));
  }
 }
 public sealed class FontSnapshot {
  readonly string project,target;readonly List<object> declared=new List<object>();readonly HashSet<string> visited=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  public FontSnapshot(string project,string root){this.project=project;target=Path.Combine(root,"game/template");Directory.CreateDirectory(target);}
  string Resolve(string from,string url){if(Regex.IsMatch(url,@"^(https?:|//)",RegexOptions.IgnoreCase))return null;if(url.StartsWith("data:"))return url;var clean=Uri.UnescapeDataString(Regex.Split(url,"[?#]")[0]);var file=Files.Full(Path.Combine(clean.StartsWith("/")?project:from,clean.TrimStart('/')));if(!Files.Within(project,file)||!File.Exists(file))throw new IOException("工程字体不存在或位于工程目录以外："+url);return file;}
  void Add(Dictionary<string,object> font,string file){if(string.IsNullOrWhiteSpace(file))return;if(declared.Any(f=>J.S(f,"font-family")==J.S(font,"font-family")&&J.S(f,"weight")==J.S(font,"weight")&&J.S(f,"style")==J.S(font,"style")))return;string url=file;if(!file.StartsWith("data:")){url="fonts/"+Files.Hash(file)+Path.GetExtension(file);Files.CopyFile(file,Path.Combine(target,url));}font["url"]=url;font["display"]="block";declared.Add(font);}
  void Css(string file){if(string.IsNullOrWhiteSpace(file)||visited.Contains(file)||!File.Exists(file))return;visited.Add(file);var text=Regex.Replace(File.ReadAllText(file),@"/\*[\s\S]*?\*/","");foreach(Match m in Regex.Matches(text,"@import\\s+(?:url\\()?['\"]([^'\"]+)['\"]"))Css(Resolve(Path.GetDirectoryName(file),m.Groups[1].Value));foreach(Match m in Regex.Matches(text,@"@font-face\s*\{([^}]+)\}")){string block=m.Groups[1].Value;var family=Regex.Match(block,@"font-family\s*:\s*([^;]+)",RegexOptions.IgnoreCase);var url=Regex.Match(block,"url\\(\\s*['\"]?([^'\"\\)]+)['\"]?\\s*\\)",RegexOptions.IgnoreCase);if(!family.Success||!url.Success)continue;var format=Regex.Match(block,"format\\(['\"]([^'\"]+)['\"]\\)",RegexOptions.IgnoreCase);var ext=Path.GetExtension(url.Groups[1].Value);var f=J.O("font-family",family.Groups[1].Value.Trim().Trim('\'', '"'),"type",format.Success?format.Groups[1].Value:ext==".woff2"?"woff2":ext==".woff"?"woff":ext==".otf"?"opentype":"truetype");foreach(var k in new[]{"weight","style"}){var v=Regex.Match(block,"font-"+k+@"\s*:\s*([^;]+)",RegexOptions.IgnoreCase);if(v.Success)f[k]=v.Groups[1].Value.Trim();}Add(f,Resolve(Path.GetDirectoryName(file),url.Groups[1].Value));}}
  public List<object> Run(){var original=Path.Combine(project,"game/template/template.json");var source=J.TryRead(original)??new Dictionary<string,object>();var fonts=J.A(J.Get(source,"fonts"));if(fonts.Count>0)foreach(var f in fonts){if(J.S(f,"url")=="")throw new IOException("字体缺少资源路径");Add(new Dictionary<string,object>(J.D(f)),Resolve(Path.GetDirectoryName(original),Regex.Replace(J.S(f,"url"),@"^[./]+","")));}else if(!J.B(source,"_exportFontsProcessed")){var html=Path.Combine(project,"index.html");if(File.Exists(html))foreach(Match m in Regex.Matches(File.ReadAllText(html),"<link\\b[^>]*href=['\"]([^'\"]+\\.css(?:\\?[^'\"]*)?)['\"][^>]*>",RegexOptions.IgnoreCase))Css(Resolve(project,m.Groups[1].Value));}var file=Path.Combine(target,"template.json");var data=J.D(J.TryRead(file)??J.O("name","Export font snapshot","webgal-version","4.6.4"));data["_exportFontsProcessed"]=true;data["fonts"]=declared;J.Write(file,data);return declared;}
 }
}

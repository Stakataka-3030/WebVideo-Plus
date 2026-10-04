using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace NativeVideo {
 // Engine code is always copied into a job-local snapshot before patching.
 // Exact WebGAL 4.6.4 / 4.6.5 project/template runtimes are preferred so engine-level
 // defaults, split chunks and CSS stay identical to the game being exported.
 public sealed class EngineAdapter {
  public const string MygoHash = "0407b5a6326ebaa1608d16541b79b4ccc54a0432947ae7d3a6a855606a68866e";
  const string BundledWebgalBundle = "assets/index-R1tKotR6.js";
  public readonly string Id, Version, Source, Bundle, SourceKind, FallbackReason;
  readonly bool externalWebgal, strictMygoHash;
  readonly string sourceHash;
  readonly bool strictDescriptor;
  public bool IsMygo { get { return Id == "mygo"; } }
  public bool RuntimeParity { get { return externalWebgal||SourceKind=="mygo-project-runtime"; } }
  EngineAdapter(string id, string version, string source, string bundle, string sourceKind, bool external=false, bool strictMygo=false, string fallbackReason=null, string expectedSourceHash=null, bool requireDescriptor=false) {
   Id=id; Version=version; Source=source; Bundle=bundle; SourceKind=sourceKind; externalWebgal=external; strictMygoHash=strictMygo; FallbackReason=fallbackReason; sourceHash=expectedSourceHash; strictDescriptor=requireDescriptor;
  }
  public object Describe() { string hash=Files.Hash(Path.Combine(Source,Bundle)); return J.O("id",Id,"version",Version,"bundle",Bundle,"sourceHash",hash,"canonicalMygo",IsMygo&&hash==MygoHash,"sourceKind",SourceKind,"runtimeParity",RuntimeParity,"fallbackReason",FallbackReason,"adapterVersion",4); }

  static string MainBundle(string root) {
   string html=Path.Combine(root,"index.html");
   if(!File.Exists(html)||new FileInfo(html).Length>1024*1024)return null;
   var match=Regex.Match(File.ReadAllText(html),"<script\\b(?=[^>]*\\btype=['\"]module['\"])[^>]*\\bsrc=['\"]([^'\"]+)['\"]",RegexOptions.IgnoreCase);
   if(!match.Success)return null;
   string relative=match.Groups[1].Value;
   if(Regex.IsMatch(relative,@"^(?:[a-z]+:|//)",RegexOptions.IgnoreCase))return null;
   try { return Files.Under(root,relative.TrimStart('.','/')); } catch { return null; }
  }
  static string RelativeBundle(string root,string file) {
   string basePath=Files.Full(root).TrimEnd('\\','/'),full=Files.Full(file),prefix=basePath+Path.DirectorySeparatorChar;
   if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new IOException("引擎入口超出运行目录");
   return full.Substring(prefix.Length).Replace('\\','/');
  }
  static EngineAdapter BundledWebgal() {
   return new EngineAdapter("webgal","4.6.4",Path.Combine(Files.Root,"runtime/web"),BundledWebgalBundle,"bundled-runtime",false,false);
  }
  static EngineAdapter TryMygoProjectRuntime(string root,out string fallbackReason,bool strict=false) {
   fallbackReason=null;
   if(string.IsNullOrWhiteSpace(root))return null;
   try { root=Files.Full(root); } catch { return null; }
   if(!Directory.Exists(root))return null;
   string descriptor=Path.Combine(root,"webgal-engine.json");
   if(!File.Exists(descriptor))return null;
   try {
    if(new FileInfo(descriptor).Length>65536)throw new IOException("引擎描述文件过大");
    var metadata=J.Read(descriptor);
    if(J.S(metadata,"id")!="webgal-mygo.mygo")return null;
    string detectedVersion=J.S(metadata,"version");
    if(strict&&(detectedVersion!="3.2.1"||J.S(metadata,"webgalVersion")!="4.6.4"))throw new IOException("MyGO 描述必须为 3.2.1 / WebGAL 4.6.4");
    string main=MainBundle(root);
    if(main==null||!File.Exists(main)||new FileInfo(main).Length>32L*1024*1024)throw new IOException("缺少可识别的主 bundle");
    string hash=Files.Hash(main);
    if(strict&&hash!=MygoHash)throw new IOException("MyGO 描述与已验证 3.2.1 bundle 哈希不匹配");
    var adapter=new EngineAdapter("mygo",string.IsNullOrWhiteSpace(detectedVersion)?"project":detectedVersion,root,RelativeBundle(root,main),"mygo-project-runtime",false,strict,null,strict?hash:null,strict);
    // Nonstrict legacy derivatives retain structural compatibility. Strict Craft
    // additionally requires the exact descriptor and canonical bytes above.
    adapter.Patch(File.ReadAllText(main));
    return adapter;
   } catch(Exception e) {
    fallbackReason=(strict?"绑定项目 MyGO 无法直接用于导出：":"项目内 MyGO 无法直接用于导出，已回退到受支持的 MyGO 基线：")+e.Message;
    return null;
   }
  }
  static EngineAdapter TryWebgalRuntime(string root,string sourceKind,out string error,bool requireDescriptor=false) {
   error=null;
   if(string.IsNullOrWhiteSpace(root))return null;
   try { root=Files.Full(root); } catch { return null; }
   if(!Directory.Exists(root))return null;

   bool official=false;
   string declaredVersion=null;
   string descriptor=Path.Combine(root,"webgal-engine.json");
   if(File.Exists(descriptor)) {
    try {
     if(new FileInfo(descriptor).Length>65536)throw new IOException("引擎描述文件过大");
     var metadata=J.Read(descriptor);
     string id=J.S(metadata,"id");
     if(id=="open-webgal.webgal") {
      official=true;
      declaredVersion=J.S(metadata,"version");
      if(WebgalEngineProfile.ForVersion(declaredVersion)==null||J.S(metadata,"webgalVersion")!=declaredVersion){error="WebGAL 描述版本必须一致且为受支持的 4.6.4 或 4.6.5";return null;}
     } else if(!string.IsNullOrWhiteSpace(id))return null;
    } catch(Exception e) {
     error="读取 WebGAL 引擎描述失败："+e.Message;
     return null;
    }
   }

   if(requireDescriptor&&!official){error="绑定项目缺少已确认的官方 WebGAL 描述";return null;}
   string main=MainBundle(root);
   if(main==null) {
    if(official)error="WebGAL 运行目录缺少可识别的模块入口";
    return null;
   }
   if(!File.Exists(main)||new FileInfo(main).Length>32L*1024*1024) {
    if(official)error="WebGAL 主 bundle 缺失或尺寸异常";
    return null;
   }
   try {
    string hash=Files.Hash(main);var profile=WebgalEngineProfile.FromHash(hash);
    if(profile==null||declaredVersion!=null&&declaredVersion!=profile.Version)throw new IOException("WebGAL 描述与实际 bundle 哈希不匹配");
    var adapter=new EngineAdapter("webgal",profile.Version,root,RelativeBundle(root,main),sourceKind,true,false,null,hash,requireDescriptor);
    adapter.Patch(File.ReadAllText(main));
    return adapter;
   } catch(Exception e) {
    error=(sourceKind=="project-runtime"?"工程":"模板")+" WebGAL 运行时无法直接用于导出："+e.Message;
    return null;
   }
  }
  public static bool SupportedMygo(string root) {
   try {
    var descriptor=Path.Combine(root,"webgal-engine.json");
    if(!File.Exists(descriptor)||new FileInfo(descriptor).Length>65536)return false;
    var metadata=J.Read(descriptor);
    if(J.S(metadata,"id")!="webgal-mygo.mygo"||J.S(metadata,"version")!="3.2.1"||J.S(metadata,"webgalVersion")!="4.6.4")return false;
    string bundle=MainBundle(root);
    return bundle!=null&&File.Exists(bundle)&&new FileInfo(bundle).Length<8*1024*1024&&Files.Hash(bundle)==MygoHash;
   } catch { return false; }
  }
  public static string[] MygoSearchRoots(string gamesRoot=null,string terreDir=null,string configRoot=null) {
   var roots=new List<string>();
   if(!string.IsNullOrWhiteSpace(terreDir)){
    string activeGames=TerreUserData.GamesRoot(terreDir,configRoot);
    roots.Add(Path.Combine(Path.GetDirectoryName(activeGames),"derivative-engines"));
    if(!string.IsNullOrWhiteSpace(gamesRoot)&&(!TerreUserData.SamePath(gamesRoot,TerreUserData.DefaultGamesRoot)||TerreUserData.SamePath(activeGames,TerreUserData.DefaultGamesRoot)))roots.Add(Path.Combine(Path.GetDirectoryName(Files.Full(gamesRoot)),"derivative-engines"));
   }else{
    if(!string.IsNullOrWhiteSpace(gamesRoot))roots.Add(Path.Combine(Path.GetDirectoryName(Files.Full(gamesRoot)),"derivative-engines"));
    roots.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".webgal_terre","derivative-engines"));
   }
   return roots.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
  }
  public static string FindMygo(string gamesRoot=null,string terreDir=null) {
   foreach(string root in MygoSearchRoots(gamesRoot,terreDir)) {
    if(!Directory.Exists(root))continue;
    foreach(string candidate in Directory.GetDirectories(root).OrderBy(p=>p,StringComparer.OrdinalIgnoreCase))
     if(SupportedMygo(candidate))return candidate;
   }
   return null;
  }
  public static object[] Options(string gamesRoot,string terreDir=null) {
   var options=new List<object>{J.O("value","webgal","label","WebGAL（原版）")};
   if(FindMygo(gamesRoot,terreDir)!=null)options.Add(J.O("value","mygo","label","MyGO 3.2.1"));
   return options.ToArray();
  }
  public static void ValidateRuntimeRequest(object request) {
   if(!J.B(request,"requireRuntimeParity",false))return;
   // Validate before any project/machine derivative discovery or cache reuse.
   string expected=J.S(request,"expectedRuntimeVersion"),expectedId=J.S(request,"expectedRuntimeId","open-webgal.webgal");
   string selected=J.S(J.Get(request,"settings"),"engine","webgal");
   string baseVersion=J.S(request,"expectedWebgalVersion",expectedId=="open-webgal.webgal"?expected:"");
   bool official=expectedId=="open-webgal.webgal"&&selected=="webgal"&&WebgalEngineProfile.ForVersion(expected)!=null&&baseVersion==expected;
   bool mygo=expectedId=="webgal-mygo.mygo"&&selected=="mygo"&&expected=="3.2.1"&&baseVersion=="4.6.4";
   if(!official&&!mygo)throw new IOException("严格绑定导出只允许匹配的 WebGAL 4.6.4 / 4.6.5 或 MyGO 3.2.1（基础 WebGAL 4.6.4）；禁止 MyGO 或其它引擎替代不匹配的绑定。当前："+expectedId+" "+expected+" / WebGAL "+baseVersion);
  }
  public static void ValidateRuntimeContract(object request,object metadata) {
   if(!J.B(request,"requireRuntimeParity",false))return;
   ValidateRuntimeRequest(request);
   string expected=J.S(request,"expectedRuntimeVersion"),kind=J.S(metadata,"sourceKind");
   bool mygo=J.S(request,"expectedRuntimeId")=="webgal-mygo.mygo";
   var actual=WebgalEngineProfile.FromHash(J.S(metadata,"sourceHash"));
   bool boundProject=!string.IsNullOrWhiteSpace(J.S(request,"project"));
   bool exact=mygo?J.S(metadata,"sourceHash")==MygoHash:actual!=null&&actual.Version==expected;
   bool source=mygo?boundProject&&kind=="mygo-project-runtime":(boundProject?kind=="project-runtime":kind=="terre-template");
   if(J.S(metadata,"id")!=(mygo?"mygo":"webgal")||J.S(metadata,"version")!=expected||!J.B(metadata,"runtimeParity",false)||!exact||!source)throw new IOException("严格绑定导出拒绝了不匹配的引擎身份、版本或运行时来源");
  }
  public static EngineAdapter Select(object request) {
   ValidateRuntimeRequest(request);
   var adapter=SelectCore(request);
   if(J.B(request,"requireRuntimeParity",false))ValidateRuntimeContract(request,adapter.Describe());
   return adapter;
  }
  static EngineAdapter SelectCore(object request) {
   var selected=J.S(J.Get(request,"settings"),"engine","webgal");
   if(selected=="webgal") {
    bool strict=J.B(request,"requireRuntimeParity",false);
    string expected=J.S(request,"expectedRuntimeVersion"),projectRoot=J.S(request,"project");
    if(!string.IsNullOrEmpty(expected)&&WebgalEngineProfile.ForVersion(expected)==null)throw new IOException("不支持绑定的 WebGAL 引擎版本");
    string projectReason,templateReason;
    var project=TryWebgalRuntime(projectRoot,"project-runtime",out projectReason,strict);
    if(project!=null){if(!string.IsNullOrEmpty(expected)&&project.Version!=expected)throw new IOException("项目实际引擎与绑定版本不一致");return project;}
    if(strict&&!string.IsNullOrWhiteSpace(projectRoot))throw new IOException("绑定项目引擎无法安全接入导出；未改用模板或内置引擎。"+projectReason);
    var template=TryWebgalRuntime(J.S(request,"engineRoot"),"terre-template",out templateReason,strict);
    if(template!=null){if(!string.IsNullOrEmpty(expected)&&template.Version!=expected)throw new IOException("模板实际引擎与绑定版本不一致");return template;}
    if(strict)throw new IOException("当前工程引擎不能安全接入导出；已停止，未回退到其他版本的运行时。");
    string reason=string.Join("；",new[]{projectReason,templateReason}.Where(x=>!string.IsNullOrWhiteSpace(x)));
    return new EngineAdapter("webgal","4.6.4",Path.Combine(Files.Root,"runtime/web"),BundledWebgalBundle,"bundled-runtime",false,false,string.IsNullOrWhiteSpace(reason)?null:reason);
   }
   if(selected!="mygo")throw new IOException("未知导出引擎");
   string mygoFallbackReason;
   bool strictMygo=J.B(request,"requireRuntimeParity",false);
   var projectMygo=TryMygoProjectRuntime(J.S(request,"project"),out mygoFallbackReason,strictMygo);
   if(projectMygo!=null)return projectMygo;
   if(strictMygo)throw new IOException("绑定项目 MyGO 引擎无法安全接入导出；未改用机器上的 MyGO、模板或内置引擎。"+mygoFallbackReason);
   string source=J.S(request,"mygoRoot");
   if(string.IsNullOrEmpty(source))source=FindMygo(Path.GetDirectoryName(Files.Full(J.S(request,"project"))));
   if(source==null||!SupportedMygo(source))throw new IOException("当前游戏的 MyGO 运行时无法直接适配，且未检测到受支持的 MyGO 3.2.1 回退基线。请安装对应专版，或选择原版 WebGAL。");
   string main=MainBundle(source);
   return new EngineAdapter("mygo","3.2.1",Files.Full(source),RelativeBundle(source,main),"mygo-derivative-runtime",false,true,mygoFallbackReason);
  }
  static void CopyRuntimeShell(string source,string root) {
   // Engine shell only. Game scenes/assets are rebuilt separately from the project
   // snapshot, so importing a project runtime never duplicates the whole game.
   foreach(string name in new[]{"assets","icons","lib"}) {
    var from=Path.Combine(source,name);
    if(Directory.Exists(from))Files.CopyTree(from,Path.Combine(root,name));
   }
   foreach(string name in new[]{"index.html","manifest.json","webgal-engine.json","webgal-serviceworker.js"}) {
    var from=Path.Combine(source,name);
    if(File.Exists(from))Files.CopyFile(from,Path.Combine(root,name));
   }
  }
  public void Prepare(string root) {
   if(IsMygo||externalWebgal)CopyRuntimeShell(Source,root);
   else Files.CopyTree(Source,root);
   if(IsMygo){string html=Path.Combine(root,"index.html");Files.Atomic(html,RepairMygoHtml(File.ReadAllText(html)));}
   string file=Path.Combine(root,Bundle);
   if(!File.Exists(file))throw new IOException("导出运行时缺少主 bundle："+Bundle);
   if(IsMygo&&strictMygoHash&&Files.Hash(file)!=MygoHash)throw new IOException("MyGO 文件在准备过程中改变，请重新导出");
   if(!IsMygo){string hash=Files.Hash(file);var profile=WebgalEngineProfile.FromHash(hash);if(profile==null||profile.Version!=Version||sourceHash!=null&&hash!=sourceHash)throw new IOException("WebGAL 运行时在选择或准备后发生变化");}
   if(!IsMygo||strictDescriptor){
    string descriptor=Path.Combine(root,"webgal-engine.json");
    if(strictDescriptor&&!File.Exists(descriptor))throw new IOException("绑定引擎描述在准备过程中丢失");
    if(File.Exists(descriptor)){
     if(new FileInfo(descriptor).Length>65536)throw new IOException("引擎描述文件过大");
     var metadata=J.Read(descriptor);
     if(J.S(metadata,"id")!=(IsMygo?"webgal-mygo.mygo":"open-webgal.webgal")||J.S(metadata,"version")!=Version||J.S(metadata,"webgalVersion")!=(IsMygo?"4.6.4":Version))throw new IOException("绑定引擎描述在准备过程中改变或与 bundle 不一致");
    }
   }
   string text=File.ReadAllText(file);
   Files.Atomic(file,Patch(text));
   // SnapshotServer serves raw files only; removing stale compressed copies also
   // prevents later tooling from mistaking them for the patched main bundle.
   foreach(string extension in new[]{".gz",".br"})if(File.Exists(file+extension))File.Delete(file+extension);
   J.Write(Path.Combine(root,"export-engine.json"),Describe());
  }
  static string ReplaceOnce(string text,string from,string to) {
   int at=text.IndexOf(from,StringComparison.Ordinal);
   if(at<0||text.IndexOf(from,at+from.Length,StringComparison.Ordinal)>=0)
    throw new IOException("导出适配接口不匹配："+from.Substring(0,Math.Min(60,from.Length)));
   return text.Substring(0,at)+to+text.Substring(at+from.Length);
  }
  public static string RepairMygoHtml(string html) {
   // MyGO moved resizing into App.tsx but left viewport setup calling variables
   // whose declarations were commented out. Restore only viewport configuration;
   // the old resize implementation must remain disabled.
   const string viewport="// let viewportMeta = document.querySelector('meta[name=\"viewport\"]');";
   if(html.Contains(viewport))html=ReplaceOnce(html,viewport,"let viewportMeta = document.querySelector('meta[name=\"viewport\"]');");
   int start=html.IndexOf("// const layoutConfig = isIOS",StringComparison.Ordinal);
   if(start>=0){int end=html.IndexOf("// const root =",start,StringComparison.Ordinal);if(end<0)throw new IOException("MyGO viewport 配置接口不匹配");string block=html.Substring(start,end-start);block=Regex.Replace(block,@"(?m)^(\s*)// ?","$1");html=html.Substring(0,start)+block+html.Substring(end);}
   return html;
  }
  static string Deferral(string text,string start,string end) {
   int a=text.IndexOf(start,StringComparison.Ordinal),b=a<0?-1:text.IndexOf(end,a+start.Length,StringComparison.Ordinal);
   if(a<0||b<0)throw new IOException("MyGO 素材接口不匹配："+start);
   string part=text.Substring(a,b-a);
   part=ReplaceOnce(part,"setTimeout(","queueMicrotask(");
   part=ReplaceOnce(part,"},0)","})");
   return text.Substring(0,a)+part+text.Substring(b);
  }
  public string Patch(string text) {
   if(text.Contains("__nativeAdapterInstalled"))throw new IOException("工作副本不能重复适配");
   if(IsMygo&&strictMygoHash&&Files.HashText(text)!=MygoHash)throw new IOException("MyGO bundle bytes do not match selected exact engine profile");
   var profile=IsMygo?null:WebgalEngineProfile.ForVersion(Version);
   if(!IsMygo)text=profile.Instrument(text);
   string core=IsMygo?"R":profile.Core, observe=IsMygo?"OP":profile.Observe, next=IsMygo?"vp":profile.Next, autoCallback=IsMygo?"dTe":profile.AutoCallback;
   text=ReplaceOnce(text,observe+"=e=>{var n;",observe+"=e=>{globalThis.__nativeObserve?.(e);var n;");
   text=ReplaceOnce(text,next+"=()=>{"+core+".events.userInteractNext.emit()",next+"=()=>{if(globalThis.__nativeBeforeNext?.()===false)return;"+core+".events.userInteractNext.emit()");
   text=ReplaceOnce(text,core+".gameplay.autoTimeout=setTimeout("+autoCallback+",t)",core+".gameplay.autoTimeout=(globalThis.__nativeScheduleAuto??setTimeout)("+autoCallback+",t)");
   if(IsMygo) {
    // This is an unused placeholder, not a real polling task. A zero-period
    // interval prevents the offline clock from ever advancing past that tick.
    text=ReplaceOnce(text,"audioLevelInterval:setInterval(()=>{},0)","audioLevelInterval:null");
    text=ReplaceOnce(text,"SCe=e=>{const t=Z.getCalculationStageState()","SCe=e=>{const nativeSpeechGeneration=globalThis.__exportSpeechGeneration;const t=Z.getCalculationStageState()");
    text=ReplaceOnce(text,"const T=(F=!1)=>{if(!S)return;","const T=(F=!1)=>{if(nativeSpeechGeneration!==globalThis.__exportSpeechGeneration){E!==null&&cancelAnimationFrame(E);E=null;return;}if(!S)return;");
    text=ReplaceOnce(text,"tt={\"preview.command.sync-scene\"","tt=globalThis.__probeCommands={\"preview.command.sync-scene\"");
    // Voiced lines are mixed offline; do not also start MyGO's simulated mouth.
    text=ReplaceOnce(text,"else if(b||_){const F=Date.now();S=bCe(F),T()}","else if(!globalThis.__exportControlledSpeech&&(b||_)){const F=Date.now();S=bCe(F),T()}");
    int a=text.IndexOf("SS=function(){",StringComparison.Ordinal),b=a<0?-1:text.IndexOf("e.queue=function(t,r){return new e(t,r)},e}()",a,StringComparison.Ordinal);
    if(a<0||b<0)throw new IOException("MyGO 素材队列接口不匹配");
    string queue=text.Substring(a,b-a);
    if(Regex.Matches(queue,@"setTimeout\(").Count!=3)throw new IOException("MyGO 素材队列计时接口不匹配");
    text=text.Substring(0,a)+queue.Replace("setTimeout(","queueMicrotask(")+text.Substring(b);
    text=Deferral(text,"addBg(","addVideoBg(");
    text=Deferral(text,"addVideoBg(","addFigure(");
    text=Deferral(text,"addFigure(","async addJsonlFigure(");
    text=Deferral(text,"addVideoFigure(","addWmdlFigure(");
    text+="\n;globalThis.__wgProbe={core:R,store:Ie,stageManager:Z,parseScene:Ao,nativeAuto:yP,nativeStopAuto:$_,nativeNext:vp,compileText:Ds,textDelay:CP,textAnimation:PP};\n";
   } else text+="\nObject.assign(globalThis.__wgProbe,{"+profile.Exports+"});\n";
   text+="\nglobalThis.__wgProbe.adapter="+J.Text(J.O("id",Id,"version",Version))+ ";globalThis.__nativeAdapterInstalled=true;\n";
   return text;
  }
 }
}

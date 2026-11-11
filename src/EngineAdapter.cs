using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace NativeVideo {
 // Engine code is always copied into a job-local snapshot before patching.
 // Compatible WebGAL 4.6.4 project/template runtimes are preferred so engine-level
 // defaults, split chunks and CSS stay identical to the game being exported.
 public sealed class EngineAdapter {
  public const string MygoHash = "0407b5a6326ebaa1608d16541b79b4ccc54a0432947ae7d3a6a855606a68866e";
  const string MygoExpressionPlugin="assets/index.es-Zih9sQ-u.js";
  const string BundledWebgalBundle = "assets/index-R1tKotR6.js";
  public readonly string Id, Version, Source, Bundle, SourceKind, FallbackReason;
  readonly bool externalWebgal, strictMygoHash;
  public bool IsLoveLive { get { return Id == "lovelive"; } }
  public bool IsMygo { get { return Id == "mygo"; } }
  public bool SupportsMygoFigures { get { return IsMygo || IsLoveLive; } }
  public bool RuntimeParity { get { return externalWebgal||SourceKind=="mygo-project-runtime"; } }
  EngineAdapter(string id, string version, string source, string bundle, string sourceKind, bool external=false, bool strictMygo=false, string fallbackReason=null) {
   Id=id; Version=version; Source=source; Bundle=bundle; SourceKind=sourceKind; externalWebgal=external; strictMygoHash=strictMygo; FallbackReason=fallbackReason;
  }
  public object Describe() { string hash=Files.Hash(Path.Combine(Source,Bundle)); return J.O("id",Id,"version",Version,"bundle",Bundle,"sourceHash",hash,"canonicalMygo",IsMygo&&hash==MygoHash,"sourceKind",SourceKind,"runtimeParity",RuntimeParity,"fallbackReason",FallbackReason,"adapterVersion",6); }

  static string MainBundle(string root) {
   string html=Path.Combine(root,"index.html");
   if(!File.Exists(html)||new FileInfo(html).Length>1024*1024)return null;
   var match=Regex.Match(File.ReadAllText(html),"<script\\b(?=[^>]*\\btype=['\"]module['\"])[^>]*\\bsrc=['\"]([^'\"]+)['\"]",RegexOptions.IgnoreCase);
   if(!match.Success)return null;
   string relative=Regex.Split(match.Groups[1].Value,@"[?#]")[0];
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
  static string InstrumentExternalWebgal(string text) {
   // Copying only the first probe assignment from the bundled build leaves
   // parseScene and stageManager undefined. Its minified identifiers are not
   // safe to transplant into a separately built project runtime either.
   if(!text.Contains("globalThis.__probeCommands")||
      !text.Contains("globalThis.__wgProbe={")||
      !text.Contains("Object.assign(globalThis.__wgProbe,{parseScene:")||
      !text.Contains("Object.assign(globalThis.__wgProbe,{stageManager:"))
    throw new IOException("外部 WebGAL 运行时缺少完整导出探针，改用内置 WebGAL 4.6.4 运行时");
   return text;
  }
  static EngineAdapter TryMygoProjectRuntime(string root,out string fallbackReason) {
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
    string main=MainBundle(root);
    if(main==null||!File.Exists(main)||new FileInfo(main).Length>32L*1024*1024)throw new IOException("缺少可识别的主 bundle");
    var adapter=new EngineAdapter("mygo",string.IsNullOrWhiteSpace(detectedVersion)?"project":detectedVersion,root,RelativeBundle(root,main),"mygo-project-runtime",false,false);
    // Version is advisory for a per-game derivative runtime. Try the game's
    // actual engine first; only the structural patch contract decides whether it
    // is safe enough for offline export.
    // Validate before selection so unsupported project plugins retain the
    // existing visible fallback to a verified canonical MyGO runtime.
    if(!SupportedMygoExpressionPlugin(root))throw new IOException("MyGO Live2D 表情插件缺失或结构不兼容");
    adapter.Patch(File.ReadAllText(main));
    return adapter;
   } catch(Exception e) {
    fallbackReason="项目内 MyGO 无法直接用于导出，已回退到受支持的 MyGO 基线："+e.Message;
    return null;
   }
  }
  static EngineAdapter TryWebgalRuntime(string root,string sourceKind,out string error) {
   error=null;
   if(string.IsNullOrWhiteSpace(root))return null;
   try { root=Files.Full(root); } catch { return null; }
   if(!Directory.Exists(root))return null;

   bool official=false;
   string descriptor=Path.Combine(root,"webgal-engine.json");
   if(File.Exists(descriptor)) {
    try {
     if(new FileInfo(descriptor).Length>65536)throw new IOException("引擎描述文件过大");
     var metadata=J.Read(descriptor);
     string id=J.S(metadata,"id");
     if(id=="open-webgal.webgal") {
      official=true;
      if(J.S(metadata,"version")!="4.6.4"||J.S(metadata,"webgalVersion")!="4.6.4")
       error="检测到 WebGAL "+J.S(metadata,"version")+"，将尝试结构兼容；不兼容时回退 4.6.4 基线";
     } else if(!string.IsNullOrWhiteSpace(id))return null;
    } catch(Exception e) {
     error="读取 WebGAL 引擎描述失败："+e.Message;
     return null;
    }
   }

   string main=MainBundle(root);
   if(main==null) {
    if(official)error="WebGAL 运行目录缺少可识别的模块入口";
    return null;
   }
   if(!File.Exists(main)||new FileInfo(main).Length>32L*1024*1024) {
    if(official)error="WebGAL 主 bundle 缺失或尺寸异常";
    return null;
   }
   var adapter=new EngineAdapter("webgal","4.6.4",root,RelativeBundle(root,main),sourceKind,true);
   try {
    // Dry-run every structural patch. Small engine customizations (for example
    // transition durations or Live2D defaults) are accepted; incompatible
    // rebuilds fail before a job snapshot is changed.
    adapter.Patch(InstrumentExternalWebgal(File.ReadAllText(main)));
    return adapter;
   } catch(Exception e) {
    error=(sourceKind=="project-runtime"?"工程":"Terre 模板")+" WebGAL 运行时无法直接用于导出，将回退内置 4.6.4："+e.Message;
    return null;
   }
  }
  static bool SupportedMygoExpressionPlugin(string root) {
   string plugin=Path.Combine(root,MygoExpressionPlugin);
   if(!File.Exists(plugin)||new FileInfo(plugin).Length>8L*1024*1024)return false;
   try { PatchExpressionLifecycle(File.ReadAllText(plugin));return true; }
   catch(IOException) { return false; }
  }
  public static bool SupportedMygo(string root) {
   try {
    var descriptor=Path.Combine(root,"webgal-engine.json");
    if(!File.Exists(descriptor)||new FileInfo(descriptor).Length>65536)return false;
    var metadata=J.Read(descriptor);
    if(J.S(metadata,"id")!="webgal-mygo.mygo"||J.S(metadata,"version")!="3.2.1"||J.S(metadata,"webgalVersion")!="4.6.4")return false;
    string bundle=MainBundle(root);
    return bundle!=null&&File.Exists(bundle)&&new FileInfo(bundle).Length<8*1024*1024&&Files.Hash(bundle)==MygoHash&&SupportedMygoExpressionPlugin(root);
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
  public static bool IsLoveLiveProject(string root){return !string.IsNullOrEmpty(root)&&J.S(J.TryRead(Path.Combine(root,"webgal-engine.json")),"id")=="webgal-lovelive.lovelive";}
  public static object[] Options(string gamesRoot,string terreDir=null) {
   var options=new List<object>{J.O("value","webgal","label","WebGAL（原版）")};
   if(FindMygo(gamesRoot,terreDir)!=null)options.Add(J.O("value","mygo","label","MyGO 3.2.1"));
   return options.ToArray();
  }
  public static EngineAdapter Select(object request,bool requireOfflineHost=true) {
   string projectRuntime=J.S(J.Get(request,"externalEngine"),"root",J.S(request,"project"));
   var selected=J.S(J.Get(request,"settings"),"engine","webgal");
   var manifest=J.TryRead(Path.Combine(projectRuntime,"webgal-engine.json"));
   if(IsLoveLiveProject(projectRuntime)) {
    string loveLiveMain=MainBundle(projectRuntime);
    if(loveLiveMain==null||!File.Exists(loveLiveMain))
     throw new IOException("当前 LoveLive 引擎缺少入口脚本");
    if(requireOfflineHost&&!File.ReadAllText(loveLiveMain).Contains("__webgalOfflineExportHost"))
     throw new IOException("当前 LoveLive 引擎缺少逐帧导出入口，请更新工程引擎");
    return new EngineAdapter("lovelive",J.S(manifest,"version"),projectRuntime,RelativeBundle(projectRuntime,loveLiveMain),"project-runtime");
   }
   if(selected=="webgal") {
    string projectReason,templateReason;
    var project=TryWebgalRuntime(projectRuntime,"project-runtime",out projectReason);
    if(project!=null)return project;
    var template=TryWebgalRuntime(J.S(request,"engineRoot"),"terre-template",out templateReason);
    if(template!=null)return template;
    string reason=string.Join("；",new[]{projectReason,templateReason}.Where(x=>!string.IsNullOrWhiteSpace(x)));
    return new EngineAdapter("webgal","4.6.4",Path.Combine(Files.Root,"runtime/web"),BundledWebgalBundle,"bundled-runtime",false,false,string.IsNullOrWhiteSpace(reason)?null:reason);
   }
   if(selected!="mygo")throw new IOException("未知导出引擎");
   string mygoFallbackReason;
   var projectMygo=TryMygoProjectRuntime(projectRuntime,out mygoFallbackReason);
   if(projectMygo!=null)return projectMygo;
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
   if(IsLoveLive||IsMygo||externalWebgal)CopyRuntimeShell(Source,root);
   else Files.CopyTree(Source,root);
   if(IsMygo){string html=Path.Combine(root,"index.html");Files.Atomic(html,RepairMygoHtml(File.ReadAllText(html)));}
   string file=Path.Combine(root,Bundle);
   if(!File.Exists(file))throw new IOException("导出运行时缺少主 bundle："+Bundle);
   if(IsMygo&&strictMygoHash&&Files.Hash(file)!=MygoHash)throw new IOException("MyGO 文件在准备过程中改变，请重新导出");
   string text=File.ReadAllText(file);
   if(IsLoveLive) {
    LoveLiveResourceTimers.Prepare(root,Bundle,text);
    string html=Path.Combine(root,"index.html");
    string script=File.ReadAllText(Path.Combine(Files.Root,"browser/lovelive-export-host.js"));
    Files.Atomic(html,ReplaceOnce(File.ReadAllText(html),"<head>","<head><script>"+script+"</script>"));
   }
   if(externalWebgal)text=InstrumentExternalWebgal(text);
   PrepareExpressionLifecycle(root,file,text);
   Files.Atomic(file,Patch(text));
   // SnapshotServer serves raw files only; removing stale compressed copies also
   // prevents later tooling from mistaking them for the patched main bundle.
   foreach(string extension in new[]{".gz",".br"})if(File.Exists(file+extension))File.Delete(file+extension);
   J.Write(Path.Combine(root,"export-engine.json"),Describe());
  }
  const string AutoSaveExportGuard="if(globalThis.__nativeAdapterInstalled===true)return;";
  string PatchAutoSave(string text) {
   // Identify the autosave function by its throttled caller, independent of minified names.
   var matches=Regex.Matches(text,@"async function (?<save>[$\w]+)\(\)\s*(?<body>\{)[^{}]{0,600}\.dispatch\([^{}]{0,100}\.setFastSave\([^{}]{0,100}\)[^{}]{0,120}\}\s*(?:const|let|var)\s+[$\w]+\s*=\s*[$\w]+\(\s*\(\)\s*=>\s*\{\s*\k<save>\(\)\s*;?\s*\}\s*,\s*(?:1e3|1000)\s*\)",RegexOptions.CultureInvariant);
   if(matches.Count==1)return text.Insert(matches[0].Groups["body"].Index+1,AutoSaveExportGuard);
   if(IsLoveLive)return text;
   // Retain the existing entry match for project runtimes with a modified throttle.
   string store=IsMygo?"Ie":"Pe",core=IsMygo?"R":"I";
   string start="(){if("+store+".getState().GUI.showTitle||"+core+".sceneManager.sceneData.currentSentenceId===0||"+core+".sceneManager.lockSceneWrite)return;";
   return ReplaceOnce(text,start,"(){"+AutoSaveExportGuard+start.Substring(3));
  }
  static string PatchAssetQueue(string text) {
   const string anchor="task callback must be a function";
   int start=text.IndexOf(anchor,StringComparison.Ordinal);
   int end=start<0?-1:text.IndexOf(".queue=function(",start,StringComparison.Ordinal);
   if(start<0||end<0||end-start>4096||text.IndexOf(anchor,start+anchor.Length,StringComparison.Ordinal)>=0)
    throw new IOException("Pixi 素材队列入口不匹配");
   string queue=text.Substring(start,end-start);
   if(Regex.Matches(queue,@"\bsetTimeout\(").Count!=3)
    throw new IOException("Pixi 素材队列计时入口不匹配");
   queue=queue.Replace("setTimeout(","queueMicrotask(");
   return text.Substring(0,start)+queue+text.Substring(end);
  }
   // Find the module imported by this build instead of scanning old bundles in assets/.
   static IEnumerable<string> FindImportedExpressionPlugins(string bundle,string text) {
    string directory=Path.GetDirectoryName(bundle);
    foreach(var name in Regex.Matches(text,@"\bimport\([""']\./(?<name>[\w.-]+\.js)[""']\)").Cast<Match>().Select(m=>m.Groups["name"].Value).Distinct()) {
     string file=Path.Combine(directory,name);
     if(File.Exists(file)&&File.ReadAllText(file).Contains(" as ExpressionManager"))yield return file;
    }
   }
   // MyGO uses the same structural contract at discovery and preparation.
   // The bundled official module remains pinned.
  IEnumerable<string> FindExpressionPlugins(string root,string bundle,string text) {
   if(IsLoveLive)return FindImportedExpressionPlugins(bundle,text);
   string name=IsMygo?"index.es-Zih9sQ-u.js":"index.es-erQsk_Nn.js";
   string expected="46590e11b6fb9877524fbb27525734d5208b67b3d28b4afb226d849bc95d7505";
   string file=Path.Combine(root,"assets",name);
   if(IsMygo) {
    if(!SupportedMygoExpressionPlugin(root))throw new IOException("MyGO Live2D 表情插件缺失或结构不兼容："+name);
   } else if(!File.Exists(file)||Files.Hash(file)!=expected)throw new IOException("Live2D 表情插件缺失或字节不匹配："+name);
   return new[]{file};
  }
  void PrepareExpressionLifecycle(string root,string bundle,string text) {
   foreach(string file in FindExpressionPlugins(root,bundle,text)) {
    string source=File.ReadAllText(file),patched;
    // LoveLive can use a different Live2D SDK build through its native host.
    try{patched=PatchExpressionLifecycle(source);}
    catch(IOException){if(!IsLoveLive)throw;continue;}
    WriteExpressionPlugin(file,patched);
   }
   }
   static string PatchExpressionLifecycle(string text) {
   if(text.Contains("__webvideoSetExpression"))throw new IOException("Live2D 表情插件已包含导出补丁");
   // A factory prefetch can cache an already handled failure. Remember it per
   // manager/index without failing unrelated export work; if setExpression
   // later requests that entry and still receives no expression, surface it
   // to the current-request barrier. Always try the native loader first: SDK
   // parse/setup failures remove their cache task and can be retried normally.
   text=ReplaceOnce(text,"loadExpression(t){return I(this,null,function*(){if(!this.definitions[t])","loadExpression(t){return I(this,null,function*(){if(this.destroyed)return;if(!this.definitions[t])");
   text=ReplaceOnce(text,"const e=yield this._loadExpression(t);return this.expressions[t]=e,e","let e;try{e=yield this._loadExpression(t)}catch(error){if(this.destroyed)return;throw error}if(this.destroyed)return;if(!e&&this.__webvideoExpressionErrors?.has(t))globalThis.__exportExpressionFailed?.(this,t,this.__webvideoExpressionErrors.get(t));return this.expressions[t]=e,e");
   text=ReplaceOnce(text,"setRandomExpression(){return I(this,null,function*(){if(this.definitions.length)","setRandomExpression(){return I(this,null,function*(){if(this.destroyed)return!1;if(this.definitions.length)");
   // A request generation also handles A -> B -> A and returning to the current
   // expression while an older, different expression is still loading.
   text=ReplaceOnce(text,@"setExpression(t){return I(this,null,function*(){if(typeof t!=""number""&&(t=this.getExpressionIndex(t)),!(t>-1&&t<this.definitions.length)||t===this.expressions.indexOf(this.currentExpression))return!1;this.reserveExpressionIndex=t;const e=yield this.loadExpression(t);return!e||this.reserveExpressionIndex!==t?!1:(this.reserveExpressionIndex=-1,this.currentExpression=e,this._setExpression(e),!0)})}",
    @"setExpression(t){return I(this,null,function*(){if(this.destroyed)return!1;if(typeof t!=""number""&&(t=this.getExpressionIndex(t)),!(t>-1&&t<this.definitions.length))return!1;const request=(this.__webvideoExpressionGeneration||0)+1;this.__webvideoExpressionGeneration=request;this.__webvideoExpressionIndex=t;if(t===this.expressions.indexOf(this.currentExpression)){this.reserveExpressionIndex=-1;return!1}this.reserveExpressionIndex=t;let e;try{e=yield this.loadExpression(t)}catch(error){if(this.destroyed)return!1;throw error}return this.destroyed||request!==this.__webvideoExpressionGeneration||!e||this.reserveExpressionIndex!==t?!1:(this.reserveExpressionIndex=-1,this.currentExpression=e,this._setExpression(e),!0)})}");
   // Cached loader promises can resolve successfully after destroy, without an
   // XHR abort. Do not create SDK expressions or emit a false success then.
   text=ReplaceOnce(text,@"static loadExpression(s,t){var e;const i=r=>s.emit(""expressionLoadError"",t,r);",@"static loadExpression(s,t){if(s.destroyed)return Promise.resolve(void 0);var e;const i=r=>{if(!s.destroyed){(s.__webvideoExpressionErrors??=new Map).set(t,r);globalThis.__exportExpressionFailed?.(s,t,r);s.emit(""expressionLoadError"",t,r)}};");
   text=ReplaceOnce(text,@"const l=L.expressionTasksMap.get(s);l&&delete l[t];const h=s.createExpression(o,r);return s.emit(""expressionLoaded"",t,h),h",@"const l=L.expressionTasksMap.get(s);l&&delete l[t];if(s.destroyed)return;const h=s.createExpression(o,r);if(s.destroyed)return;s.__webvideoExpressionErrors?.delete(t);return s.emit(""expressionLoaded"",t,h),h");
   text=ReplaceOnce(text,".catch(o=>{C.warn(s.tag,`Failed to load expression:",".catch(o=>{if(s.destroyed)return;C.warn(s.tag,`Failed to load expression:");
   text=ReplaceOnce(text,"catch(r){C.warn(s.tag,`Failed to load expression at", "catch(r){if(s.destroyed)return Promise.resolve(void 0);C.warn(s.tag,`Failed to load expression at");
   string manager="Ot";
   ReplaceOnce(text,manager+" as ExpressionManager",manager+" as ExpressionManager");
   text+="\n;const __webvideoSetExpression="+manager+".prototype.setExpression;"+manager+".prototype.setExpression=function(index){const start=()=>__webvideoSetExpression.call(this,index);return globalThis.__exportTrackExpression?globalThis.__exportTrackExpression(this,index,start):start()};\n";
    return text;
   }
   static void WriteExpressionPlugin(string file,string text) {
   Files.Atomic(file,text);
   foreach(string extension in new[]{".gz",".br"})if(File.Exists(file+extension))File.Delete(file+extension);

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
   // The offline clock makes the engine's one-second autosave throttle run at
   // story speed. Each save clones the growing backlog and queues an IndexedDB
   // write, although export never resumes from this quick-save slot. Guard the
   // automatic entry point before it builds the save; manual saves and the
   // source game's runtime remain untouched. Patch() only runs on job copies.
   text=PatchAutoSave(text);
   if(SupportsMygoFigures)text=PatchAssetQueue(text);
   // LoveLive registers these engine bindings through its source-level host.
   if(!IsLoveLive)text=PatchLegacyHostBindings(text);
   return text;
  }
  string PatchLegacyHostBindings(string text) {
   string core=IsMygo?"R":"I", observe=IsMygo?"OP":"bP", next=IsMygo?"vp":"dp", autoCallback=IsMygo?"dTe":"JAe";
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
    text=Deferral(text,"addBg(","addVideoBg(");
    text=Deferral(text,"addVideoBg(","addFigure(");
    text=Deferral(text,"addFigure(","async addJsonlFigure(");
    text=Deferral(text,"addVideoFigure(","addWmdlFigure(");
    text+="\n;globalThis.__wgProbe={core:R,store:Ie,stageManager:Z,parseScene:Ao,nativeAuto:yP,nativeStopAuto:$_,nativeNext:vp,compileText:Ds,textDelay:CP,textAnimation:PP};\n";
   } else text+="\nObject.assign(globalThis.__wgProbe,{nativeAuto:G$,nativeStopAuto:D_,nativeNext:dp,compileText:Os,textDelay:_P,textAnimation:xP});\n";
   text+="\nglobalThis.__wgProbe.adapter="+J.Text(J.O("id",Id,"version",Version))+ ";globalThis.__nativeAdapterInstalled=true;\n";
   return text;
  }
 }
}

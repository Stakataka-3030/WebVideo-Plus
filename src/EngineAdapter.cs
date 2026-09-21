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
  const string BundledWebgalBundle = "assets/index-R1tKotR6.js";
  public readonly string Id, Version, Source, Bundle, SourceKind;
  readonly bool externalWebgal;
  public bool IsMygo { get { return Id == "mygo"; } }
  EngineAdapter(string id, string version, string source, string bundle, string sourceKind, bool external=false) {
   Id=id; Version=version; Source=source; Bundle=bundle; SourceKind=sourceKind; externalWebgal=external;
  }
  public object Describe() { return J.O("id",Id,"version",Version,"bundle",Bundle,"sourceHash",IsMygo?MygoHash:Files.Hash(Path.Combine(Source,Bundle)),"sourceKind",SourceKind,"runtimeParity",externalWebgal,"adapterVersion",2); }

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
  static bool IdentifierChar(char value) {
   return char.IsLetterOrDigit(value)||value=='_'||value=='$';
  }
  static string InstrumentExternalWebgal(string text) {
   string baselineFile=Path.Combine(Files.Root,"runtime/web",BundledWebgalBundle);
   if(!File.Exists(baselineFile))throw new IOException("缺少内置 WebGAL 运行快照");
   string baseline=File.ReadAllText(baselineFile);

   // The pinned runtime already contains the read-only probe exports used by the
   // exporter. Transfer those tiny exports to a compatible project runtime rather
   // than replacing the project's engine code, defaults, split chunks or CSS.
   if(!text.Contains("globalThis.__probeCommands")) {
    const string commandMarker="=globalThis.__probeCommands={\"preview.command.sync-scene\"";
    int at=baseline.IndexOf(commandMarker,StringComparison.Ordinal);
    if(at<0)throw new IOException("内置 WebGAL 运行快照缺少预览命令探针");
    int start=at-1;
    while(start>=0&&IdentifierChar(baseline[start]))start--;
    string name=baseline.Substring(start+1,at-start-1);
    if(string.IsNullOrWhiteSpace(name))throw new IOException("无法识别 WebGAL 预览命令表");
    string from=name+"={\"preview.command.sync-scene\"";
    text=ReplaceOnce(text,from,name+commandMarker);
   }

   if(!text.Contains("globalThis.__wgProbe")) {
    const string probeMarker="globalThis.__wgProbe={";
    int at=baseline.IndexOf(probeMarker,StringComparison.Ordinal);
    int end=at<0?-1:baseline.IndexOf(';',at);
    if(at<0||end<0)throw new IOException("内置 WebGAL 运行快照缺少核心探针");
    text+="\n;"+baseline.Substring(at,end-at+1)+"\n";
   }
   return text;
  }
  static EngineAdapter TryMygoProjectRuntime(string root,out string error) {
   error=null;
   if(string.IsNullOrWhiteSpace(root))return null;
   try { root=Files.Full(root); } catch { return null; }
   if(!Directory.Exists(root))return null;
   string descriptor=Path.Combine(root,"webgal-engine.json");
   if(!File.Exists(descriptor))return null;
   try {
    if(new FileInfo(descriptor).Length>65536)throw new IOException("引擎描述文件过大");
    var metadata=J.Read(descriptor);
    if(J.S(metadata,"id")!="webgal-mygo.mygo")return null;
    if(J.S(metadata,"version")!="3.2.1"||J.S(metadata,"webgalVersion")!="4.6.4") {
     error="检测到项目内 MyGO "+J.S(metadata,"version")+"，当前导出适配基线为 MyGO 3.2.1 / WebGAL 4.6.4";
     return null;
    }
    string main=MainBundle(root);
    if(main==null||!File.Exists(main)||new FileInfo(main).Length>32L*1024*1024) {
     error="项目内 MyGO 运行目录缺少可识别的主 bundle";
     return null;
    }
    var adapter=new EngineAdapter("mygo","3.2.1",root,RelativeBundle(root,main),"mygo-project-runtime",false,false);
    // Per-game derivative projects are full engine copies. Allow project-local
    // constants/chunks to differ from the canonical MyGO package, but require every
    // exporter patch anchor to remain unique before accepting the runtime.
    adapter.Patch(File.ReadAllText(main));
    return adapter;
   } catch(Exception e) {
    error="项目内 MyGO 运行时已修改，但无法安全接入导出探针："+e.Message;
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
      if(J.S(metadata,"version")!="4.6.4"||J.S(metadata,"webgalVersion")!="4.6.4") {
       error="检测到 WebGAL "+J.S(metadata,"version")+"，当前导出适配基线为 4.6.4";
       return null;
      }
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
    if(official)error="项目 WebGAL 运行时已修改，但无法安全接入导出探针："+e.Message;
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
  public static string FindMygo(string gamesRoot=null) {
   var roots=new List<string>();
   if(!string.IsNullOrWhiteSpace(gamesRoot))roots.Add(Path.Combine(Path.GetDirectoryName(Files.Full(gamesRoot)),"derivative-engines"));
   roots.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".webgal_terre","derivative-engines"));
   foreach(string root in roots.Distinct(StringComparer.OrdinalIgnoreCase)) {
    if(!Directory.Exists(root))continue;
    foreach(string candidate in Directory.GetDirectories(root).OrderBy(p=>p,StringComparer.OrdinalIgnoreCase))
     if(SupportedMygo(candidate))return candidate;
   }
   return null;
  }
  public static object[] Options(string gamesRoot) {
   var options=new List<object>{J.O("value","webgal","label","WebGAL（原版）")};
   if(FindMygo(gamesRoot)!=null)options.Add(J.O("value","mygo","label","MyGO 3.2.1"));
   return options.ToArray();
  }
  public static EngineAdapter Select(object request) {
   var selected=J.S(J.Get(request,"settings"),"engine","webgal");
   if(selected=="webgal") {
    string error;
    var project=TryWebgalRuntime(J.S(request,"project"),"project-runtime",out error);
    if(project!=null)return project;
    if(error!=null)throw new IOException(error);
    var template=TryWebgalRuntime(J.S(request,"engineRoot"),"terre-template",out error);
    if(template!=null)return template;
    if(error!=null)throw new IOException(error);
    return BundledWebgal();
   }
   if(selected!="mygo")throw new IOException("未知导出引擎");
   string source=J.S(request,"mygoRoot");
   if(string.IsNullOrEmpty(source))source=FindMygo(Path.GetDirectoryName(Files.Full(J.S(request,"project"))));
   if(source==null||!SupportedMygo(source))throw new IOException("未检测到受支持的 MyGO 3.2.1 安装，或引擎文件已改变。请安装对应专版，或选择原版 WebGAL。");
   string main=MainBundle(source);
   return new EngineAdapter("mygo","3.2.1",Files.Full(source),RelativeBundle(source,main),"mygo-runtime",false);
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
   string text=File.ReadAllText(file);
   if(externalWebgal)text=InstrumentExternalWebgal(text);
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
   } else text+="\nObject.assign(globalThis.__wgProbe,{nativeAuto:G$,nativeStopAuto:D_,nativeNext:dp,compileText:Os,textDelay:_P,textAnimation:xP});\n";
   text+="\nglobalThis.__wgProbe.adapter="+J.Text(J.O("id",Id,"version",Version))+ ";globalThis.__nativeAdapterInstalled=true;\n";
   return text;
  }
 }
}

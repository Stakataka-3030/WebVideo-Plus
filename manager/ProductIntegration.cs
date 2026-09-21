using System;using System.IO;using System.IO.Compression;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;using System.Threading.Tasks;using System.Diagnostics;
namespace NativeVideo {
 public static class ProductIntegration {
  const string TerreBaselineHash="3b40aa7bccf427178c6580d9ed1686d3b50cc6617fa95c34632026002a9e7133";
  static string ProductVersion{get{return VersionInfo.Product;}}static string InternalVersion{get{return VersionInfo.Internal;}}static string KernelVersion{get{return VersionInfo.Kernel;}}
  static string ProductFile(string terre){return Path.Combine(terre,"webvideo-plus.json");}
  static string State(string terre){var p=J.TryRead(ProductFile(terre));var c=J.S(p,"config");return c!=""?Path.GetDirectoryName(c):Integration.StateFor(terre);}
  static string Once(string text,string find,string replacement){if(text.IndexOf(find,StringComparison.Ordinal)<0||text.IndexOf(find,text.IndexOf(find,StringComparison.Ordinal)+find.Length,StringComparison.Ordinal)>=0)throw new IOException("Terre 接入位置不匹配，尚未更改安装："+find.Substring(0,Math.Min(45,find.Length)));return text.Replace(find,replacement);}
  static string RegexOnceInScope(string text,string scopeStart,string scopeEnd,string pattern,string replacement){int start=text.IndexOf(scopeStart,StringComparison.Ordinal);if(start<0||text.IndexOf(scopeStart,start+scopeStart.Length,StringComparison.Ordinal)>=0)throw new IOException("Terre 接入范围不匹配，尚未更改安装："+scopeStart);int end=text.IndexOf(scopeEnd,start+scopeStart.Length,StringComparison.Ordinal);if(end<0)throw new IOException("Terre 接入范围终点不匹配，尚未更改安装："+scopeEnd);string scope=text.Substring(start,end-start);var regex=new Regex(pattern);var matches=regex.Matches(scope);if(matches.Count!=1)throw new IOException("Terre 接入位置不匹配，尚未更改安装："+pattern.Substring(0,Math.Min(45,pattern.Length)));return text.Substring(0,start)+regex.Replace(scope,replacement,1)+text.Substring(end);}
  public static string Patch(string source,string[] modules){
   if(source.Contains("function CodexVideoExport()")||source.Contains("const WebVideoPlus ="))throw new IOException("检测到未匹配记录的挂载，请先恢复 Terre 原版入口");
   source=Once(source,"return displayWidth(rt)<=MULTILINE_THRESHOLD?rt:foldToMultiline(_e,nt,tt,ot)??rt","return rt");
   string prefix="",marker="return jsxRuntimeExports.jsxs(TopbarTab,{children:[";int begin=source.IndexOf("function AddSentenceTab(){"),at=begin<0?-1:source.IndexOf(marker,begin);if(at<0||at-begin>16000)throw new IOException("Terre 工具栏结构不匹配");
   foreach(var patch in J.A(J.Read(Path.Combine(Files.Root,"product-ui/menu-patches.json"))))source=Once(source,J.S(patch,"find"),J.S(patch,"replace"));
   prefix+=File.ReadAllText(Path.Combine(Files.Root,"product-ui/editor-runtime.js")).Replace("__WEBVIDEO_CHARACTER_MAP_ENABLED__",ModuleCatalog.NeedsKernel(modules)?"true":"false").Replace("__WEBVIDEO_MODULES__",J.Text(modules))+"\n";
   source=Once(source,"jsxRuntimeExports.jsx(FastPreviewTimeoutDialog,{})","jsxRuntimeExports.jsx(WebVideoRuntimeHost,{}),jsxRuntimeExports.jsx(FastPreviewTimeoutDialog,{})");
   if(ModuleCatalog.NeedsKernel(modules)){
    foreach(var patch in J.A(J.Read(Path.Combine(Files.Root,"product-ui/character-map-patches.json"))))source=Once(source,J.S(patch,"find"),J.S(patch,"replace"));
    var tip=Regex.Match(source,@"jsxRuntimeExports\.jsx\((Tooltip(?:\$\d+)?),");if(!tip.Success)throw new IOException("未识别到 Terre 提示控件");
    prefix+=File.ReadAllText(Path.Combine(Files.Root,"integration/terre-export-component.js")).Replace("__CODEX_TOOLTIP__",tip.Groups[1].Value)+"\n";
   }
   if(modules.Any(m=>m.StartsWith("timeline"))){
    foreach(var patch in J.A(J.Read(Path.Combine(Files.Root,"timeline/patches.json")))){string pattern=J.S(patch,"regex");source=pattern!=""?RegexOnceInScope(source,J.S(patch,"scopeStart"),J.S(patch,"scopeEnd"),pattern,J.S(patch,"replace")):Once(source,J.S(patch,"find"),J.S(patch,"replace"));}
    string css=File.ReadAllText(Path.Combine(Files.Root,"timeline/timeline.css"));
    string host=File.ReadAllText(Path.Combine(Files.Root,"timeline/timeline-host.js")).Replace("__WEBVIDEO_MODULES__",J.Text(modules)).Replace("__WEBVIDEO_NAVIGATOR_VIEW__",modules.Contains("timelineNavigator")?File.ReadAllText(Path.Combine(Files.Root,"timeline/navigator.js")):"null").Replace("__WEBVIDEO_SELECTOR_VIEW__",modules.Contains("timelineSelector")?File.ReadAllText(Path.Combine(Files.Root,"timeline/selector.js")):"null");
    if(modules.Contains("timelineSelector"))host+="\n"+File.ReadAllText(Path.Combine(Files.Root,"timeline/selector-launcher.js"));
    prefix+="(()=>{const s=document.createElement('style');s.dataset.webvideoPlus='0.1.2';s.textContent="+J.Text(css)+";document.head.appendChild(s);})();\n"+File.ReadAllText(Path.Combine(Files.Root,"timeline/timeline-core.js"))+"\n"+host+"\n";
   }
   if(modules.Contains("projectCore")){
    source=Once(source,"jsxRuntimeExports.jsx(WebVideoTimelineHost,{})]","jsxRuntimeExports.jsx(WebVideoTimelineHost,{}),jsxRuntimeExports.jsx(WebVideoToolsHost,{})]");
    foreach(var name in new[]{"project-core.js","project-bridge.js","tools-host.js"})prefix+=File.ReadAllText(Path.Combine(Files.Root,"features/core",name)).Replace("__WEBVIDEO_MODULES__",J.Text(modules))+"\n";
    foreach(var feature in ModuleCatalog.Selectable.Where(m=>!new[]{"timelineNavigator","timelineSelector","exporter","compactGameTools"}.Contains(m)&&modules.Contains(m)))prefix+=File.ReadAllText(Path.Combine(Files.Root,"features/modules",feature+".js"))+"\n";
    prefix+="(()=>{const s=document.createElement('style');s.textContent="+J.Text(File.ReadAllText(Path.Combine(Files.Root,"features/core/tools.css")))+";document.head.appendChild(s);})();\n";
   }
   if(ModuleCatalog.NeedsKernel(modules)){
    prefix+="function WebVideoExportHost(){return reactExports.createElement(CodexVideoExport,{hiddenLauncher:true});}\n";
    source=Once(source,"jsxRuntimeExports.jsx(FastPreviewTimeoutDialog,{})","jsxRuntimeExports.jsx(WebVideoExportHost,{}),jsxRuntimeExports.jsx(FastPreviewTimeoutDialog,{})");
   }
   bool compact=modules.Contains("compactGameTools"),editorTools=modules.Any(m=>ModuleCatalog.Selectable.Except(new[]{"timelineNavigator","timelineSelector","compactGameTools"}).Contains(m));
   if(compact||modules.Contains("presetEffects")){foreach(var patch in J.A(J.Read(Path.Combine(Files.Root,"product-ui/game-patches.json"))))if(compact||J.S(patch,"scope")=="presets")source=Once(source,J.S(patch,"find"),J.S(patch,"replace"));prefix+=File.ReadAllText(Path.Combine(Files.Root,"product-ui/game-tools.js")).Replace("__WEBVIDEO_MODULES__",J.Text(modules))+"\n";}
   if(Regex.IsMatch(prefix,@"__WEBVIDEO_[A-Z_]+__"))throw new IOException("前端配置存在未替换占位符，已停止安装。");
   if(!editorTools){prefix+="(()=>{const s=document.createElement('style');s.textContent="+J.Text(File.ReadAllText(Path.Combine(Files.Root,"product-ui/toolbar.css")))+";document.head.appendChild(s);})();\n";return Once(source,"function AddSentenceTab(){",prefix+"function AddSentenceTab(){");}
   source=Once(source,"jsxRuntimeExports.jsx(Tab,{value:\"export\",children:i18n._({id:\"v6FJm2\"})})","jsxRuntimeExports.jsx(Tab,{value:\"export\",children:i18n._({id:\"v6FJm2\"})}),!dt&&jsxRuntimeExports.jsx(Tab,{value:\"webvideoPlus\",children:\"WebVideo+\"})");
   source=Once(source,"tt===\"addSentence\"&&jsxRuntimeExports.jsx(AddSentenceTab,{})","tt===\"addSentence\"&&jsxRuntimeExports.jsx(AddSentenceTab,{}),tt===\"webvideoPlus\"&&jsxRuntimeExports.jsx(WebVideoToolsTab,{})");
   begin=source.IndexOf("function AddSentenceTab(){");at=source.IndexOf(marker,begin);source=source.Insert(at+marker.Length,"jsxRuntimeExports.jsx(WebVideoToolsTab,{embedded:true}),");
   source=Once(source,"!dt&&tt===\"addSentence\"&&ot(d?void 0:\"config\")","!dt&&tt===\"addSentence\"&&ot(d?void 0:\"webvideoPlus\")");
   source=Once(source,"dt&&tt!==\"addSentence\"&&(d||ot(\"addSentence\"))","dt&&tt!==\"addSentence\"&&(!d||tt===\"webvideoPlus\")&&ot(\"addSentence\")");
   prefix+=File.ReadAllText(Path.Combine(Files.Root,"product-ui/toolbar.js")).Replace("__WEBVIDEO_MODULES__",J.Text(modules))+"\n";
   prefix+="(()=>{const s=document.createElement('style');s.textContent="+J.Text(File.ReadAllText(Path.Combine(Files.Root,"product-ui/toolbar.css")))+";document.head.appendChild(s);})();\n";
   return Once(source,"function AddSentenceTab(){",prefix+"function AddSentenceTab(){");
  }

  static IOException ForceRequired(string message){return new IOException("[FORCE_AVAILABLE] "+message);}
  static bool SamePath(string a,string b){if(string.IsNullOrWhiteSpace(a)||string.IsNullOrWhiteSpace(b))return false;return Files.Full(a).TrimEnd('\\','/').Equals(Files.Full(b).TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase);}
  static bool PatchedSource(string text){return (text??"").Contains("function CodexVideoExport()")||(text??"").Contains("const WebVideoPlus =")||(text??"").Contains("function WebVideoToolsHost");}
  static string RecoveryDir(string state){return Path.Combine(state,"recovery");}
  static string RecoveryMeta(string state){return Path.Combine(RecoveryDir(state),"recovery.json");}
  static bool TryCleanBundle(string terre,string html,string preferred,bool scanAll,out string source,out string bundle){
   source=null;bundle=null;string publicDir=Path.Combine(terre,"public"),assets=Path.Combine(publicDir,"assets");
   var names=new List<string>();if(!string.IsNullOrWhiteSpace(preferred))names.Add(preferred);
   foreach(Match m in Regex.Matches(html??"","(?:src|href)=[\"']([^\"']+\\.js)[\"']"))names.Add(m.Groups[1].Value.TrimStart('.','/').Replace('/','\\'));
   if(scanAll&&Directory.Exists(assets))names.AddRange(Directory.GetFiles(assets,"*.js").Select(file=>"assets\\ "+Path.GetFileName(file)).Select(x=>x.Replace("assets\\ ","assets\\")));
   var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);string fallbackSource=null,fallbackBundle=null;
   foreach(var name in names){string file;try{file=Path.IsPathRooted(name)?name:Files.Under(publicDir,name);}catch{continue;}if(!File.Exists(file)||!seen.Add(Files.Full(file)))continue;string candidate;try{candidate=File.ReadAllText(file);}catch{continue;}if(!candidate.Contains("function AddSentenceTab(){")||PatchedSource(candidate))continue;string relative=file.StartsWith(publicDir,StringComparison.OrdinalIgnoreCase)?file.Substring(publicDir.Length+1).Replace('\\','/'):Path.GetFileName(file);if(Files.HashText(candidate)==TerreBaselineHash){source=candidate;bundle=relative;return true;}if(fallbackSource==null){fallbackSource=candidate;fallbackBundle=relative;}}
   if(fallbackSource!=null){source=fallbackSource;bundle=fallbackBundle;return true;}return false;
  }
  static byte[] RecoveryIndex(string state){string file=Path.Combine(RecoveryDir(state),"index.html");return File.Exists(file)?File.ReadAllBytes(file):null;}
  static string RecoveryExe(string state){string file=Path.Combine(RecoveryDir(state),"original.exe");return File.Exists(file)?file:null;}
  static byte[] ResolveOriginalIndex(string terre,string index,object manifest,string state,bool mounted,bool force){
   byte[] current=File.ReadAllBytes(index);if(!mounted)return current;string installedHash=J.S(manifest,"installedEntryHash"),originalFile=J.S(manifest,"originalEntry"),originalHash=J.S(manifest,"originalEntryHash"),originalText=J.S(manifest,"originalIndexText");
   bool currentMatches=installedHash!=""&&Files.Hash(index)==installedHash;
   if(currentMatches){if(originalFile!=""&&File.Exists(originalFile)&&(originalHash==""||Files.Hash(originalFile)==originalHash))return File.ReadAllBytes(originalFile);if(originalText!="")return Files.Utf8.GetBytes(originalText);var recovery=RecoveryIndex(state);if(recovery!=null)return recovery;if(!force)throw ForceRequired("原版 Terre 入口备份缺失或已变化。");}
   else if(!force)throw ForceRequired("Terre 入口已被其他程序、更新或手动操作修改。");
   if(originalText!="")return Files.Utf8.GetBytes(originalText);if(originalFile!=""&&File.Exists(originalFile))return File.ReadAllBytes(originalFile);var fallback=RecoveryIndex(state);if(fallback!=null)return fallback;
   string html=Files.Utf8.GetString(current),oldBundle=J.S(manifest,"originalBundle"),installedBundle=J.S(manifest,"installedBundle"),candidatePath="";
   if(oldBundle!=""){try{candidatePath=Files.Under(Path.Combine(terre,"public/assets"),Path.GetFileName(oldBundle));}catch{}if(File.Exists(candidatePath)){string candidate=File.ReadAllText(candidatePath);if(candidate.Contains("function AddSentenceTab(){")&&!PatchedSource(candidate)){if(installedBundle!=""&&html.Contains(installedBundle))html=html.Replace(installedBundle,oldBundle);return Files.Utf8.GetBytes(html);}}}
   string source,bundle;if(TryCleanBundle(terre,html,oldBundle,true,out source,out bundle)){var matches=Regex.Matches(html,"(?:src|href)=[\"']([^\"']+\\.js)[\"']");if(matches.Count>0){string first=matches[0].Groups[1].Value;html=html.Replace(first,bundle);return Files.Utf8.GetBytes(html);}}
   throw new IOException("强制操作仍无法找到可确认的 Terre 原版前端。当前文件未被覆盖，请先修复或重新安装 Terre。");
  }
  static void SaveRecovery(string state,string originalExe,byte[] originalIndex,string originalBundleFile,string originalBundleName){
   string root=RecoveryDir(state);if(Directory.Exists(root))Files.DeleteTree(state,root);Directory.CreateDirectory(root);Files.CopyFile(originalExe,Path.Combine(root,"original.exe"));File.WriteAllBytes(Path.Combine(root,"index.html"),originalIndex);if(!string.IsNullOrWhiteSpace(originalBundleFile)&&File.Exists(originalBundleFile))Files.CopyFile(originalBundleFile,Path.Combine(root,"original-bundle.js"));J.Write(RecoveryMeta(state),J.O("schemaVersion",1,"originalExeHash",Files.Hash(originalExe),"originalIndexHash",Files.Hash(Path.Combine(root,"index.html")),"originalBundle",originalBundleName,"createdAt",DateTime.UtcNow.ToString("o")));
  }
  static bool RestoreRecoveryExe(string state,string target,string expectedHash=""){
   string file=RecoveryExe(state);if(file==null)return false;try{var meta=J.TryRead(RecoveryMeta(state));string hash=J.S(meta,"originalExeHash");if(hash!=""&&Files.Hash(file)!=hash)return false;if(expectedHash!=""&&hash!=""&&hash!=expectedHash)return false;Files.CopyFile(file,target);return true;}catch{return false;}
  }
  static void CopyStateVerified(string source,string target){
   if(!Directory.Exists(source)){Directory.CreateDirectory(target);return;}if(Directory.Exists(target)&&Directory.EnumerateFileSystemEntries(target).Any())throw new IOException("新的 WebVideo+ 数据目录必须为空，避免覆盖其中现有文件。");Directory.CreateDirectory(target);Files.CopyTree(source,target);string prefix=Files.Full(source).TrimEnd('\\','/')+Path.DirectorySeparatorChar;
   foreach(var file in Directory.GetFiles(source,"*",SearchOption.AllDirectories)){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)continue;string relative=Files.Full(file).Substring(prefix.Length),copy=Path.Combine(target,relative);if(!File.Exists(copy)||new FileInfo(copy).Length!=new FileInfo(file).Length||Files.Hash(copy)!=Files.Hash(file))throw new IOException("WebVideo+ 数据目录迁移校验失败："+relative);}
   foreach(var transient in new[]{"lifecycle.lock","lifecycle-control.json","service-state.json","runtime-session.json"}){string file=Path.Combine(target,transient);if(File.Exists(file))File.Delete(file);}
  }
  static void SaveTransactionCopy(string root,string source,string name){if(!File.Exists(source))return;Directory.CreateDirectory(root);Files.CopyFile(source,Path.Combine(root,name));}
  static void CleanupWorkCaches(object config,string state){
   string work=J.S(config,"workDir");if(work!=""&&Directory.Exists(work)){foreach(var dir in Directory.GetDirectories(work)){Guid id;if(Guid.TryParse(Path.GetFileName(dir),out id))try{Files.DeleteTree(work,dir);}catch{}}foreach(var file in Directory.GetFiles(work).Where(x=>Path.GetFileName(x).StartsWith(".webvideo-",StringComparison.OrdinalIgnoreCase)))try{File.Delete(file);}catch{}try{if(!Directory.EnumerateFileSystemEntries(work).Any())Directory.Delete(work);}catch{}}
   string jobs=Path.Combine(state,"jobs");if(Directory.Exists(jobs))foreach(var job in Directory.GetDirectories(jobs)){foreach(var name in new[]{"parts","planning","music-snapshot","imported-music"}){string dir=Path.Combine(job,name);if(Directory.Exists(dir))try{Files.DeleteTree(job,dir);}catch{}}foreach(var name in new[]{"audio.wav","concat.txt","mix.log"}){string file=Path.Combine(job,name);if(File.Exists(file))try{File.Delete(file);}catch{}}}
   string media=Path.Combine(state,"media");if(Directory.Exists(media))try{Files.DeleteTree(state,media);}catch{}
  }
  static void DeleteOwnedData(string state,string terre){
   if(string.IsNullOrWhiteSpace(state)||!Directory.Exists(state))return;string full=Files.Full(state).TrimEnd('\\','/'),root=Path.GetPathRoot(full).TrimEnd('\\','/');if(full.Equals(root,StringComparison.OrdinalIgnoreCase)||Files.Within(terre,full,true))throw new IOException("拒绝删除不安全的数据目录："+state);var config=J.TryRead(Path.Combine(state,"config.json"));if(config!=null&&J.S(config,"terreDir")!=""&&!SamePath(J.S(config,"terreDir"),terre))throw new IOException("数据目录属于另一份 Terre，未删除。");Files.DeleteTree(Path.GetDirectoryName(full),full);
  }
  public static async Task Run(){
   string command=App.Args.FirstOrDefault()??"help",terre=Files.Full(App.Arg("--terre-dir","."));
   if(command=="modules"){Console.WriteLine(J.Text(J.O("selectable",ModuleCatalog.Selectable,"labels",ModuleCatalog.Labels,"dependencies",ModuleCatalog.Graph())));return;}
   if(command=="launch"){var launchRecord=J.Read(ProductFile(terre));Process.Start(new ProcessStartInfo(Files.Under(terre,J.S(launchRecord,"exeName"))){UseShellExecute=true,WorkingDirectory=terre});return;}
   if(command!="install"&&command!="uninstall")throw new ArgumentException("使用 install / uninstall / launch --terre-dir DIR");
   var requestedModules=command=="uninstall"?new string[0]:App.Arg("--modules",string.Join(",",ModuleCatalog.Advanced)).Split(',').Where(x=>x!="").Distinct().ToArray();requestedModules=ModuleCatalog.Normalize(requestedModules);var modules=ModuleCatalog.Resolve(requestedModules);
   bool export=ModuleCatalog.NeedsKernel(modules),timeline=modules.Contains("timelineCore");
   string state=Files.Full(App.Arg("--state-dir",State(terre))),configFile=Path.Combine(state,"config.json"),manifestFile=Path.Combine(state,"install.json"),lifeFile=Path.Combine(state,"lifecycle-install.json"),index=Path.Combine(terre,"public/index.html"),assets=Path.Combine(terre,"public/assets"),addon=Files.Under(terre,"video-export"),wrapperFile=Path.Combine(terre,"video-export-wrapper.json");
   if(!File.Exists(index))throw new IOException("缺少 Terre public/index.html");
   var product=J.TryRead(ProductFile(terre));var manifest=J.TryRead(manifestFile);var previous=J.TryRead(configFile);var life=J.TryRead(lifeFile);
   bool mounted=product!=null||File.Exists(wrapperFile);
   byte[] originalEntry=File.ReadAllBytes(index);
   if(mounted){if(manifest==null||Files.Hash(index)!=J.S(manifest,"installedEntryHash"))throw new IOException("Terre 入口已被其他更新修改，未覆盖");string originalIndex=J.S(manifest,"originalEntry");if(!File.Exists(originalIndex)||Files.Hash(originalIndex)!=J.S(manifest,"originalEntryHash"))throw new IOException("原版入口备份校验失败");originalEntry=File.ReadAllBytes(originalIndex);}
   string html=Files.Utf8.GetString(originalEntry),source=null,bundleName=null;
   foreach(Match m in Regex.Matches(html,"(?:src|href)=[\"']([^\"']+\\.js)[\"']")){string file;try{file=Files.Under(Path.Combine(terre,"public"),m.Groups[1].Value.TrimStart('.','/'));}catch{continue;}if(File.Exists(file)){var candidate=File.ReadAllText(file);if(candidate.Contains("function AddSentenceTab(){")){source=candidate;bundleName=Path.GetFileName(file);break;}}}
   if(source==null)throw new IOException("无法识别 Terre 前端");
   if(modules.Length>0){
    string sourceHash=Files.HashText(source);bool exactBaseline=sourceHash==TerreBaselineHash;
    if(!exactBaseline)Console.WriteLine("前端哈希与已知 Terre 4.6.4 基线不同；正在使用结构锚点兼容性校验。");
    try{source=Patch(source,modules);}catch(IOException e){if(!exactBaseline)throw new IOException("前端与已知 Terre 4.6.4 基线不同，且结构锚点校验未通过；未更改文件。"+e.Message);throw;}
   }
   string exeName=J.S(product,"exeName",J.S(life,"exeName",""));
   if(exeName==""){
    foreach(var name in new[]{"WebGAL_Terre.exe","WebGAL Terre.exe"})if(File.Exists(Path.Combine(terre,name))){exeName=name;break;}
    if(exeName==""){var matches=Directory.GetFiles(terre,"*.exe").Where(f=>Regex.Replace(Path.GetFileNameWithoutExtension(f),@"[\s_-]+","").Equals("WebGALTerre",StringComparison.OrdinalIgnoreCase)).ToArray();if(matches.Length==1)exeName=Path.GetFileName(matches[0]);}
    if(exeName=="")throw new IOException("未找到 Terre 主程序（支持 WebGAL_Terre.exe / WebGAL Terre.exe）");
   }
   string exe=Files.Under(terre,exeName),originalName=J.S(life,"originalName",Path.GetFileNameWithoutExtension(exeName)+".video-original.exe"),original=Files.Under(terre,originalName);
   bool wrapped=File.Exists(wrapperFile);
   if(wrapped&&(life==null||!File.Exists(original)||Files.Hash(original)!=J.S(life,"originalHash")||Files.Hash(exe)!=J.S(life,"wrapperHash")))throw new IOException("Terre 启动程序或备份已变化，未覆盖");
   if(!wrapped&&File.Exists(original))throw new IOException("发现来源不明的原程序备份，请先核对启动程序");
   string url=App.Arg("--terre-url",J.S(previous,"terreUrl","http://localhost:3001"));Uri uri;if(!Uri.TryCreate(url,UriKind.Absolute,out uri)||!new[]{"localhost","127.0.0.1"}.Contains(uri.Host))throw new IOException("Terre 地址必须是本机地址");
   if(previous!=null&&wrapped)await Integration.StopInstance(previous);
   using(var access=new FileStream(exe,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){}
   Directory.CreateDirectory(state);
   string stage=Files.Under(terre,"video-export.next-"+Guid.NewGuid().ToString("N")),retired=Files.Under(terre,"video-export.replaced-"+Guid.NewGuid().ToString("N"));
   if(modules.Length>0){Directory.CreateDirectory(stage);if(export){foreach(var directory in Directory.GetDirectories(Files.Root)){string name=Path.GetFileName(directory);if(new[]{"source","timeline","features","product-ui"}.Contains(name)||name=="ai-runtime"&&!modules.Contains("generativeAI"))continue;Files.CopyTree(directory,Path.Combine(stage,name));}foreach(var file in Directory.GetFiles(Files.Root)){string name=Path.GetFileName(file);if(name.StartsWith("WebVideoPlus.Manager")||name=="product.json"||name=="MANIFEST.json")continue;Files.CopyFile(file,Path.Combine(stage,name));}}
    foreach(var doc in Directory.GetFiles(Files.Root).Where(f=>Path.GetFileName(f)=="README.md"||Path.GetFileName(f).StartsWith("LICENSE")||Path.GetFileName(f).EndsWith("ATTRIBUTION.txt")))Files.CopyFile(doc,Path.Combine(stage,Path.GetFileName(doc)));
    Files.CopyTree(Path.Combine(Files.Root,"product-ui"),Path.Combine(stage,"product-ui"));
    if(timeline){var timelineFiles=new List<string>{"timeline-core.js","timeline-host.js","timeline.css","patches.json"};if(modules.Contains("timelineNavigator"))timelineFiles.Add("navigator.js");if(modules.Contains("timelineSelector"))timelineFiles.AddRange(new[]{"selector.js","selector-launcher.js"});foreach(var name in timelineFiles)Files.CopyFile(Path.Combine(Files.Root,"timeline",name),Path.Combine(stage,"timeline",name));}
    if(modules.Contains("projectCore")){Files.CopyTree(Path.Combine(Files.Root,"features/core"),Path.Combine(stage,"features/core"));foreach(var feature in ModuleCatalog.Selectable.Where(m=>!new[]{"timelineNavigator","timelineSelector","exporter","compactGameTools"}.Contains(m)&&modules.Contains(m)))Files.CopyFile(Path.Combine(Files.Root,"features/modules",feature+".js"),Path.Combine(stage,"features/modules",feature+".js"));}
    var stagedProduct=J.O("name","WebVideo+","version",ProductVersion,"kernelVersion",export?KernelVersion:null,"modules",modules,"dependencies",timeline?new[]{"timelineCore"}:new string[0]);if(InternalVersion!="")J.D(stagedProduct)["internalVersion"]=InternalVersion;J.Write(Path.Combine(stage,"product.json"),stagedProduct);}
   string backup=Path.Combine(state,"install-backup",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff"));Directory.CreateDirectory(backup);File.WriteAllBytes(Path.Combine(backup,"index.html"),originalEntry);
   string newBundle="webvideo-plus-"+Files.HashText(source).Substring(0,12)+".js",bundle=Path.Combine(assets,newBundle);
   var changed=new[]{index,exe,original,wrapperFile,ProductFile(terre),configFile,manifestFile,lifeFile,Path.Combine(assets,"video-export-instance.json"),Path.Combine(assets,"video-export-service.json"),bundle,bundle+".gz"};
   var rollback=changed.Distinct().ToDictionary(f=>f,f=>File.Exists(f)?File.ReadAllBytes(f):null);bool moved=false,staged=false;
   try{
    if(Directory.Exists(addon)){Directory.Move(addon,retired);moved=true;}if(modules.Length>0){Directory.Move(stage,addon);staged=true;}
    string originalHash=Files.Hash(wrapped?original:exe);
    if(export){if(!wrapped)File.Move(exe,original);Files.CopyFile(Path.Combine(addon,"TerreLauncher.exe"),exe);}else if(wrapped){Files.CopyFile(original,exe);File.Delete(original);}
    if(modules.Length>0){Files.Atomic(bundle,source);using(var gz=new GZipStream(File.Create(bundle+".gz"),CompressionMode.Compress)){var bytes=Files.Utf8.GetBytes(source);gz.Write(bytes,0,bytes.Length);}Files.Atomic(index,html.Replace(bundleName,newBundle));}else File.WriteAllBytes(index,originalEntry);
    var config=J.D(previous);config["terreDir"]=terre;config["terreUrl"]=url;config["stateDir"]=state;config["runtimePath"]=App.Arg("--runtime-path",J.S(previous,"runtimePath"));config["gamesRoot"]=Files.Full(App.Arg("--games-root",J.S(previous,"gamesRoot",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".webgal_terre/games"))));config["outputDir"]=Files.Full(App.Arg("--output-dir",J.S(previous,"outputDir",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),"WebGAL Exports"))));config["allowedOrigins"]=new[]{uri.GetLeftPart(UriPartial.Authority),new UriBuilder(uri){Host=uri.Host=="localhost"?"127.0.0.1":"localhost"}.Uri.GetLeftPart(UriPartial.Authority)};config["sourcePackageRoot"]=addon;config["instanceId"]=Files.HashText(terre.ToLowerInvariant()).Substring(0,20);config["exeName"]=exeName;config["modules"]=modules;J.Write(configFile,config);
    if(export){J.Write(wrapperFile,J.O("version",KernelVersion,"backend",originalName,"addon","video-export","native","WebGAL.Video.exe","config",configFile));J.Write(Path.Combine(assets,"video-export-instance.json"),J.O("id",config["instanceId"]));J.Write(lifeFile,J.O("version",KernelVersion,"exeName",exeName,"originalName",originalName,"originalHash",originalHash,"wrapperHash",Files.Hash(exe),"addon",addon));}
    else {foreach(var f in new[]{wrapperFile,lifeFile,Path.Combine(assets,"video-export-instance.json"),Path.Combine(assets,"video-export-service.json")})if(File.Exists(f))File.Delete(f);}
    if(modules.Length>0){var installedProduct=J.O("name","WebVideo+","version",ProductVersion,"kernelVersion",export?KernelVersion:null,"modules",modules,"requestedModules",requestedModules,"config",configFile,"exeName",exeName);if(InternalVersion!="")J.D(installedProduct)["internalVersion"]=InternalVersion;J.Write(ProductFile(terre),installedProduct);J.Write(manifestFile,J.O("terreDir",terre,"originalBundle",bundleName,"originalEntry",Path.Combine(backup,"index.html"),"originalEntryHash",Files.Hash(Path.Combine(backup,"index.html")),"installedBundle",newBundle,"installedEntryHash",Files.Hash(index),"installedAt",DateTime.UtcNow.ToString("o")));}
    else {if(File.Exists(ProductFile(terre)))File.Delete(ProductFile(terre));if(File.Exists(manifestFile))File.Delete(manifestFile);}
   }catch{foreach(var pair in rollback){try{if(pair.Value==null){if(File.Exists(pair.Key))File.Delete(pair.Key);}else{Files.EnsureParent(pair.Key);File.WriteAllBytes(pair.Key,pair.Value);}}catch{}}if(staged&&Directory.Exists(addon))Files.DeleteTree(terre,addon);if(moved&&Directory.Exists(retired))Directory.Move(retired,addon);throw;}
   finally{if(Directory.Exists(stage))Files.DeleteTree(terre,stage);}
   if(Directory.Exists(retired))Files.DeleteTree(terre,retired);
   string oldBundle=J.S(manifest,"installedBundle");if(oldBundle!=""&&(oldBundle!=newBundle||modules.Length==0)){foreach(var name in new[]{oldBundle,oldBundle+".gz"}){var file=Files.Under(assets,name);if(File.Exists(file))File.Delete(file);}}
   if(modules.Length==0&&File.Exists(bundle))File.Delete(bundle);
   if(App.Arg("--no-recent")!="true"&&modules.Length>0)J.Write(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter/last-install.json"),J.Read(configFile));
   Console.WriteLine(modules.Length>0?"WebVideo+ "+ProductVersion+(InternalVersion!=""?"（内部 "+InternalVersion+"）":"")+" 已安装："+string.Join(", ",modules):"WebVideo+ 已拆卸，Terre 原程序已恢复；视频、任务与设置保留。");
  }
 }
}

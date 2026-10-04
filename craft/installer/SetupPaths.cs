using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// This is a read-only discovery and UI preflight layer, not a trust boundary.
// Installing and launching must still run the transaction/native full verifier.
internal sealed class CraftInstallationInfo {
 internal bool Exists, Valid;
 internal bool MetadataOnly { get { return true; } }
 internal string CraftExe="", AdapterRoot="", Mode="", Status="not-installed", Version="", LauncherPath="", TemplatePath="", Message="", StatePath="";
}

internal static class CraftSetupPaths {
 const string CraftName="webgal-craft.exe";
 const int MaxShortcutHops=8, MaxDiscoveryDirectories=160, MaxDiscoveryLinks=800, MaxRegistryEntries=2048;
 internal static string DefaultCache { get { return Path.GetTempPath(); } }
 internal static string DefaultTarget { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebVideoCraft","adapter"); } }

 internal static string NormalizeFolder(string value) {
  try {
   if(String.IsNullOrWhiteSpace(value))throw new ArgumentException("路径不能为空，请选择完整路径。");
   value=value.Trim();
   if(value.Length>=2&&value[0]=='"'&&value[value.Length-1]=='"')value=value.Substring(1,value.Length-2).Trim();
   value=Environment.ExpandEnvironmentVariables(value);
   if(!Path.IsPathRooted(value)||value.StartsWith(@"\\?\",StringComparison.Ordinal)||value.StartsWith(@"\\.\",StringComparison.Ordinal))throw new ArgumentException("请选择完整的绝对路径，不支持相对路径或设备路径。");
   if(Path.DirectorySeparatorChar=='\\') {
    // Path.IsPathRooted alone accepts C:relative and \current-drive-relative.
    bool drive=value.Length>=3&&Char.IsLetter(value[0])&&value[1]==':'&&(value[2]=='\\'||value[2]=='/');
    bool share=value.StartsWith(@"\\",StringComparison.Ordinal)&&value.Substring(2).Split('\\','/').Length>=2;
    if(!drive&&!share)throw new ArgumentException("请选择包含盘符的完整路径或完整网络共享路径。");
   }
   string full=Path.GetFullPath(value),root=Path.GetPathRoot(full);
   foreach(string part in full.Substring(root.Length).Split(new[]{'\\','/'},StringSplitOptions.RemoveEmptyEntries))
    if(part.EndsWith(".",StringComparison.Ordinal)||part.EndsWith(" ",StringComparison.Ordinal)||part.Any(Char.IsControl)||part.IndexOfAny(new[]{'"','<','>','|','?','*',':','\0'})>=0||Regex.IsMatch(part,@"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$",RegexOptions.IgnoreCase))throw new ArgumentException("路径包含 Windows 不支持的名称、符号或结尾空格。");
   return full.Length>root.Length?full.TrimEnd('\\','/'):full;
  } catch(ArgumentException error) { throw new ArgumentException("路径无效，请重新选择："+error.Message); }
  catch(Exception error) { throw new ArgumentException("无法识别此路径，请重新选择："+error.Message); }
 }

 internal static InstallerHostProduct DetectProduct(string selected){return InstallerProductRouting.Detect(selected,ShortcutTarget);}
 internal static string DetectTerreEngine(string selected){return InstallerProductRouting.TerreEngine(selected,ShortcutTarget);}
 internal static string ResolveCraftSelection(string selected) { return ResolveCraftSelection(selected,ShortcutTarget); }
 // Injectable only for deterministic, inert shortcut-chain regression fixtures.
 internal static string ResolveCraftSelection(string selected,Func<string,string> shortcutTarget) {
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  try {
   for(int hop=0;hop<=MaxShortcutHops;hop++) {
    string full=NormalizeFolder(selected);NoLinks(full);
    if(!seen.Add(full))return null;
    if(Directory.Exists(full))full=Path.Combine(full,CraftName);
    if(!File.Exists(full))return null;
    NoLinks(full);
    if(Path.GetFileName(full).Equals(CraftName,StringComparison.OrdinalIgnoreCase))return full;
    if(hop==MaxShortcutHops)return null;
    // Our desktop shortcut targets the owned adapter launcher, not Craft itself.
    // Its adjacent metadata is only a discovery hint: require the exact recorded
    // launcher, then resolve the recorded host through the same bounded checks.
    if(Path.GetExtension(full).Equals(".exe",StringComparison.OrdinalIgnoreCase)) {
     var installed=ReadInstalled(Path.GetDirectoryName(full));
     if(!installed.Valid||!(CraftManifestVerifier.Same(full,installed.LauncherPath)||CraftManifestVerifier.Same(full,installed.TemplatePath)))return null;
     selected=installed.CraftExe;continue;
    }
    if(!Path.GetExtension(full).Equals(".lnk",StringComparison.OrdinalIgnoreCase))return null;
    selected=shortcutTarget(full);if(String.IsNullOrWhiteSpace(selected))return null;
   }
  } catch { }
  return null;
 }

 // Resolve ownership as well as the host, so an enhanced external shortcut
 // retains its custom adapter directory. No hashes or launch trust are implied.
 internal static CraftInstallationInfo ResolveInstalledSelection(string selected) { return ResolveInstalledSelection(selected,ShortcutTarget); }
 internal static CraftInstallationInfo ResolveInstalledSelection(string selected,Func<string,string> shortcutTarget) {
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  try {
   for(int hop=0;hop<=MaxShortcutHops;hop++) {
    string full=NormalizeFolder(selected);NoLinks(full);if(!seen.Add(full))return null;
    if(Directory.Exists(full)) {
     var directoryOwner=ReadInstalled(full);if(directoryOwner.Valid)return directoryOwner;
     full=Path.Combine(full,CraftName);
    }
    if(!File.Exists(full))return null;NoLinks(full);
    if(Path.GetExtension(full).Equals(".lnk",StringComparison.OrdinalIgnoreCase)) {
     if(hop==MaxShortcutHops)return null;selected=shortcutTarget(full);if(String.IsNullOrWhiteSpace(selected))return null;continue;
    }
    if(!Path.GetExtension(full).Equals(".exe",StringComparison.OrdinalIgnoreCase))return null;
    var installed=ReadInstalled(Path.GetDirectoryName(full));
    if(installed.Valid&&(CraftManifestVerifier.Same(full,installed.LauncherPath)||CraftManifestVerifier.Same(full,installed.TemplatePath)))return installed;
    if(!Path.GetFileName(full).Equals(CraftName,StringComparison.OrdinalIgnoreCase))return null;
    string record=Path.Combine(Path.GetDirectoryName(full),"webvideo-craft.install.json");
    if(!File.Exists(record))return null;
    var hostRecord=ReadMetadata(record);installed=ReadInstalled(RequiredPath(hostRecord,"adapterRoot"));
    if(installed.Valid&&installed.Mode=="same-name"&&CraftManifestVerifier.Same(installed.CraftExe,full))return installed;
    return null;
   }
  } catch { }
  return null;
 }
 internal static CraftInstallationInfo[] CollectInstallations(string craftExe,IEnumerable<string> selections,Func<string,string> shortcutTarget=null) {
  string craft=ResolveCraftSelection(craftExe);var found=new List<CraftInstallationInfo>();
  if(craft==null)return found.ToArray();
  foreach(string selected in selections) {
   var installed=ResolveInstalledSelection(selected,shortcutTarget??ShortcutTarget);
   if(installed!=null&&CraftManifestVerifier.Same(installed.CraftExe,craft)&&!found.Any(item=>CraftManifestVerifier.Same(item.AdapterRoot,installed.AdapterRoot)))found.Add(installed);
  }
  return found.ToArray();
 }
 internal static CraftInstallationInfo[] FindInstallations(string craftExe) {
  // External mode deliberately has no host-side marker. Recover its location
  // only from our default config or an existing owned shortcut, never a scan.
  string craft=ResolveCraftSelection(craftExe);if(craft==null)return new CraftInstallationInfo[0];
  return CollectInstallations(craft,new[]{DefaultTarget,craft}.Concat(DiscoveryShortcuts()));
 }

 static void ReleaseCom(object value) { try { if(value!=null&&Marshal.IsComObject(value))Marshal.FinalReleaseComObject(value); } catch { } }
 static object ShortcutProperty(object shortcut,string property) { return shortcut.GetType().InvokeMember(property,BindingFlags.GetProperty,null,shortcut,null); }
 static void SetShortcutProperty(object shortcut,string property,string value) { shortcut.GetType().InvokeMember(property,BindingFlags.SetProperty,null,shortcut,new object[]{value}); }
 static string ShortcutTarget(string link) {
  object shell=null,shortcut=null;
  try {
   if(Environment.OSVersion.Platform!=PlatformID.Win32NT)return null;
   var type=Type.GetTypeFromProgID("WScript.Shell");if(type==null)return null;
   shell=Activator.CreateInstance(type);shortcut=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{link});
   return Convert.ToString(ShortcutProperty(shortcut,"TargetPath"));
  } catch { return null; }
  finally { ReleaseCom(shortcut);ReleaseCom(shell); }
 }

 internal static string[] CollectCandidates(IEnumerable<string> selections) {
  var found=new List<string>();
  foreach(string selection in selections)AddCandidate(found,selection);
  return found.ToArray();
 }
 static void AddCandidate(List<string> found,string selection) {
  string candidate=ResolveCraftSelection(selection);
  if(candidate!=null&&!found.Contains(candidate,StringComparer.OrdinalIgnoreCase))found.Add(candidate);
 }
 internal static string[] FindCandidates(string preferred=null,string adapterRoot=null) {
  var found=new List<string>();
  AddCandidate(found,preferred);
  // An associated config is a useful hint; it never makes an unverified binary trusted.
  foreach(string target in new[]{adapterRoot,DefaultTarget}.Where(p=>!String.IsNullOrWhiteSpace(p)).Distinct(StringComparer.OrdinalIgnoreCase)) {
   var installed=ReadInstalled(target);if(installed.Valid)AddCandidate(found,installed.CraftExe);
  }
  string local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
  foreach(string relative in new[]{"WebGAL Craft","webgal-craft",Path.Combine("Programs","WebGAL Craft"),Path.Combine("Programs","webgal-craft")})
   if(!String.IsNullOrWhiteSpace(local))AddCandidate(found,Path.Combine(local,relative));
  try { AddCandidate(found,Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)); } catch { }
  foreach(string link in DiscoveryShortcuts())AddCandidate(found,link);
  foreach(string candidate in RegistryCandidates())AddCandidate(found,candidate);
  return found.ToArray();
 }
 static List<string> DiscoveryShortcuts() {
  var result=new List<string>();
  var roots=new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.Programs),Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu)};
  int directories=0,links=0;
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(string root in roots.Where(p=>!String.IsNullOrWhiteSpace(p)).Distinct(StringComparer.OrdinalIgnoreCase)) {
   if(directories>=MaxDiscoveryDirectories||links>=MaxDiscoveryLinks)break;
   result.AddRange(FindShortcuts(root,seen,ref directories,ref links));
  }
  return result;
 }
 // Only Desktop/Start Menu shortcut trees are visited. Never scan drives, user
 // profiles, Downloads or application directories looking for executables.
 static List<string> FindShortcuts(string root,HashSet<string> seen,ref int directories,ref int links) {
  var result=new List<string>();var queue=new Queue<Tuple<string,int>>();queue.Enqueue(Tuple.Create(root,0));
  while(queue.Count>0&&directories<MaxDiscoveryDirectories&&links<MaxDiscoveryLinks) {
   var next=queue.Dequeue();
   try {
    string directory=NormalizeFolder(next.Item1);if(!seen.Add(directory)||!Directory.Exists(directory))continue;
    NoLinks(directory);directories++;
    foreach(string link in Directory.EnumerateFiles(directory,"*.lnk",SearchOption.TopDirectoryOnly)) {
     if(links>=MaxDiscoveryLinks)break;links++;result.Add(link);
    }
    if(next.Item2>=4)continue;
    foreach(string child in Directory.EnumerateDirectories(directory)) {
     if(queue.Count+directories>=MaxDiscoveryDirectories)break;
     if((File.GetAttributes(child)&FileAttributes.ReparsePoint)==0)queue.Enqueue(Tuple.Create(child,next.Item2+1));
    }
   } catch { }
  }
  return result;
 }
 static List<string> RegistryCandidates() {
  var result=new List<string>();if(Environment.OSVersion.Platform!=PlatformID.Win32NT)return result;
  int visited=0;
  foreach(RegistryHive hive in new[]{RegistryHive.CurrentUser,RegistryHive.LocalMachine})
   foreach(RegistryView view in new[]{RegistryView.Registry64,RegistryView.Registry32}) {
    try {
     using(var root=RegistryKey.OpenBaseKey(hive,view))
     using(var uninstall=root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",false)) {
      if(uninstall==null)continue;
      foreach(string name in uninstall.GetSubKeyNames()) {
       if(visited++>=MaxRegistryEntries)return result;
       try {
        using(var entry=uninstall.OpenSubKey(name,false)) {
         if(entry==null)continue;string display=Convert.ToString(entry.GetValue("DisplayName","",RegistryValueOptions.DoNotExpandEnvironmentNames));
         if(!Regex.IsMatch(display,@"webgal[\s_-]*craft",RegexOptions.IgnoreCase))continue;
         result.Add(Convert.ToString(entry.GetValue("InstallLocation","",RegistryValueOptions.DoNotExpandEnvironmentNames)));
         string icon=Convert.ToString(entry.GetValue("DisplayIcon","",RegistryValueOptions.DoNotExpandEnvironmentNames));
         // Strip only a trailing numeric icon resource index, never arguments.
         result.Add(Regex.Replace(icon,@",\s*-?\d+\s*$","").Trim());
        }
       } catch { }
      }
     }
    } catch { }
   }
  return result;
 }

 // GetAttributes also observes dangling links; File.Exists alone can hide them.
 static void NoLinks(string path) {
  string current=Path.GetFullPath(path);
  for(;;) {
   try { if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("不允许链接或重解析路径："+current); }
   catch(FileNotFoundException) { }
   catch(DirectoryNotFoundException) { }
   string parent=Path.GetDirectoryName(current);if(String.IsNullOrEmpty(parent)||parent==current)break;current=parent;
  }
 }
 static bool Overlaps(string first,string second) { return CraftManifestVerifier.Same(first,second)||CraftManifestVerifier.Within(first,second)||CraftManifestVerifier.Within(second,first); }
 static void ExistingAncestor(string path) {
  string current=path;
  while(!Directory.Exists(current)) {
   if(File.Exists(current))throw new IOException("目录路径被同名文件占用："+current);
   string parent=Path.GetDirectoryName(current);if(String.IsNullOrEmpty(parent)||parent==current)throw new IOException("找不到可用的上级目录，请检查盘符或网络共享。");current=parent;
  }
  NoLinks(path);
 }
 internal static string Validate(string destination,string craftSelection) {
  return Validate(destination,craftSelection,new[]{Path.GetTempPath(),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Temp"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"Package Cache")});
 }
 // Explicit cache roots keep preflight testable without mutating OS folders.
 internal static string Validate(string destination,string craftSelection,IEnumerable<string> temporaryRoots) {
  string target=NormalizeFolder(destination),craft=ResolveCraftSelection(craftSelection);
  if(craft==null)throw new ArgumentException("未找到 webgal-craft.exe。请选择 Craft 安装目录、原程序或快捷方式。");
  ExistingAncestor(target);string host=Path.GetDirectoryName(craft);
  if(Overlaps(target,host))throw new IOException("适配包目录和 Craft 目录必须彼此独立，不能相同或互相包含。");
  if(CraftManifestVerifier.Same(target,Path.GetPathRoot(target)))throw new IOException("不能把整个磁盘或网络共享根目录用作适配包目录，请新建独立文件夹。");
  foreach(var special in new[]{Environment.SpecialFolder.Windows,Environment.SpecialFolder.System,Environment.SpecialFolder.SystemX86}) {
   string system=Environment.GetFolderPath(special);if(!String.IsNullOrWhiteSpace(system)&&Overlaps(target,system))throw new IOException("不能在 Windows 系统目录或其上级目录安装适配包。");
  }
  foreach(var special in new[]{Environment.SpecialFolder.ProgramFiles,Environment.SpecialFolder.ProgramFilesX86,Environment.SpecialFolder.CommonProgramFiles,Environment.SpecialFolder.CommonProgramFilesX86,Environment.SpecialFolder.UserProfile,Environment.SpecialFolder.LocalApplicationData,Environment.SpecialFolder.ApplicationData,Environment.SpecialFolder.CommonApplicationData,Environment.SpecialFolder.DesktopDirectory,Environment.SpecialFolder.MyDocuments}) {
   string system=Environment.GetFolderPath(special);if(!String.IsNullOrWhiteSpace(system)&&CraftManifestVerifier.Same(target,system))throw new IOException("不能使用整个系统或个人资料目录，请在其中新建独立适配包文件夹。");
  }
  foreach(string cache in temporaryRoots.Where(p=>!String.IsNullOrWhiteSpace(p))) {
   string root=NormalizeFolder(cache);
   if(Overlaps(target,root)||Overlaps(host,root))throw new IOException("Craft、适配包与临时解包/缓存目录必须彼此独立。请先将 Craft 移出临时目录，并选择长期保存位置。");
  }
  if(Directory.Exists(target)) {
   var installed=ReadInstalled(target);
   if(installed.Exists) {
    if(!installed.Valid)throw new IOException(installed.Message);
    if(!CraftManifestVerifier.Same(installed.CraftExe,craft))throw new IOException("此适配包目录属于另一个 Craft，请选择独立目录。");
   } else if(Directory.EnumerateFileSystemEntries(target).Any())throw new IOException("此目录已有其他文件且没有有效安装记录，请选择新的独立适配包目录。");
  }
  return target;
 }
 internal static string ValidateCache(string cacheDirectory,string destination,string craftSelection,bool allowMissingCraft=false) {
  string cache=NormalizeFolder(cacheDirectory),target=NormalizeFolder(destination),craft;
  if(allowMissingCraft) {
   // Only detach/recovery after validated metadata may use a missing host path.
   // This is structural preflight, never permission to install or launch it.
   craft=NormalizeFolder(craftSelection);NoLinks(craft);
   if(!Path.GetFileName(craft).Equals(CraftName,StringComparison.OrdinalIgnoreCase)||Directory.Exists(craft))throw new IOException("安装记录中的 Craft 原程序路径无效。");
  } else {
   craft=ResolveCraftSelection(craftSelection);
   if(craft==null)throw new IOException("未找到有效的 Craft 原程序，请先选择 Craft。");
  }
  ExistingAncestor(cache);
  if(Overlaps(cache,target)||Overlaps(cache,Path.GetDirectoryName(craft)))throw new IOException("临时解包目录必须与 Craft、适配包目录彼此独立，不能相同或互相包含。");
  if(CraftManifestVerifier.Same(cache,Path.GetPathRoot(cache)))throw new IOException("不能直接使用磁盘或网络共享根目录作为临时解包目录，请新建独立缓存文件夹。");
  foreach(var special in new[]{Environment.SpecialFolder.Windows,Environment.SpecialFolder.System,Environment.SpecialFolder.SystemX86}) {
   string system=Environment.GetFolderPath(special);if(!String.IsNullOrWhiteSpace(system)&&Overlaps(cache,system))throw new IOException("不能使用 Windows 系统目录作为临时解包目录。");
  }
  return cache;
 }

 static Dictionary<string,object> ReadMetadata(string file) {
  NoLinks(file);
  if(new FileInfo(file).Length>1024*1024)throw new IOException("安装记录过大，无法安全读取。");
  return new JavaScriptSerializer{MaxJsonLength=1024*1024}.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));
 }
 static string RequiredPath(object state,string key) {
  string value=CraftManifestVerifier.Text(state,key);
  if(String.IsNullOrWhiteSpace(value)||!Path.IsPathRooted(value)||value!=NormalizeFolder(value))throw new IOException("安装记录中的路径无效："+key);
  NoLinks(value);return value;
 }
 static bool IsHash(string value) { return Regex.IsMatch(value??"",@"^[a-f0-9]{64}$"); }
 static string PackagePath(string root,object package,string key) {
  string relative=CraftManifestVerifier.Text(package,key),full=CraftManifestVerifier.Under(root,relative);
  if(new[]{"config.json","state","logs","MANIFEST.json"}.Contains(relative.Split('/')[0],StringComparer.OrdinalIgnoreCase))throw new IOException("安装记录中的启动路径占用了保留目录。");
  return full;
 }
 internal static CraftInstallationInfo ReadInstalled(string destination) {
  var info=new CraftInstallationInfo();
  try {
   info.AdapterRoot=NormalizeFolder(destination);NoLinks(info.AdapterRoot);
   info.StatePath=Path.Combine(info.AdapterRoot,"config.json");info.Exists=File.Exists(info.StatePath);
   if(!info.Exists){info.Message="此目录尚无适配器安装记录。";return info;}
   var state=ReadMetadata(info.StatePath);Guid owner;
   if(CraftManifestVerifier.Text(state,"schemaVersion")!="1"||CraftManifestVerifier.Text(state,"stateVersion")!="1"||!Guid.TryParseExact(CraftManifestVerifier.Text(state,"installId"),"D",out owner)||owner==Guid.Empty)throw new IOException("安装记录格式或所有权标识无效。");
   string root=RequiredPath(state,"adapterRoot"),craft=RequiredPath(state,"craftExe"),original=RequiredPath(state,"originalExe"),kernel=RequiredPath(state,"kernelExe"),stateDir=RequiredPath(state,"stateDir");
   if(!CraftManifestVerifier.Same(root,info.AdapterRoot)||!Path.GetFileName(craft).Equals(CraftName,StringComparison.OrdinalIgnoreCase)||Overlaps(root,Path.GetDirectoryName(craft))||!CraftManifestVerifier.Within(root,kernel)||!CraftManifestVerifier.Same(stateDir,Path.Combine(root,"state")))throw new IOException("安装记录的目录或宿主归属不匹配。");
   string mode=CraftManifestVerifier.Text(state,"installMode"),status=CraftManifestVerifier.Text(state,"status");
   if(!new[]{"external","same-name"}.Contains(mode)||!new[]{"installed","detached","host-changed","update-unmounted"}.Contains(status))throw new IOException("安装模式或状态无法识别。");
   string expectedOriginal=mode=="same-name"?Path.Combine(Path.GetDirectoryName(craft),"webgal-craft.webvideo-original.exe"):craft;
   if(!CraftManifestVerifier.Same(original,expectedOriginal))throw new IOException("安装记录中的原程序备份不属于此 Craft。");
   object ownership=CraftManifestVerifier.Get(state,"ownership"),package=CraftManifestVerifier.Get(state,"package");
   if(!IsHash(CraftManifestVerifier.Text(ownership,"originalSha256"))||!IsHash(CraftManifestVerifier.Text(ownership,"wrapperSha256"))||!IsHash(CraftManifestVerifier.Text(package,"manifestSha256")))throw new IOException("安装记录缺少完整的文件所有权标识。");
   string launcher=PackagePath(root,package,"wrapper");PackagePath(root,package,"entry");PackagePath(root,package,"node");
   if(!Path.GetExtension(launcher).Equals(".exe",StringComparison.OrdinalIgnoreCase))throw new IOException("安装记录中的启动器路径无效。");
   string version=CraftManifestVerifier.Text(package,"version");
   if(String.IsNullOrWhiteSpace(version)||version.Length>80||version.Any(Char.IsControl))throw new IOException("安装记录中的版本无效。");
   string mirror=Path.Combine(Path.GetDirectoryName(craft),"webvideo-craft.install.json");
   if(mode=="same-name"&&status=="installed"&&!File.Exists(mirror))throw new IOException("同名模式的宿主所有权记录缺失。");
   if(File.Exists(mirror)) {
    var hostRecord=ReadMetadata(mirror);
    if(CraftManifestVerifier.Text(hostRecord,"schemaVersion")!="1"||CraftManifestVerifier.Text(hostRecord,"stateVersion")!="1"||(status=="installed"&&CraftManifestVerifier.Text(hostRecord,"status")!="installed"))throw new IOException("宿主所有权记录格式或状态不匹配。");
    foreach(string key in new[]{"originalSha256","wrapperSha256"})
     if(CraftManifestVerifier.Text(CraftManifestVerifier.Get(hostRecord,"ownership"),key)!=CraftManifestVerifier.Text(ownership,key))throw new IOException("宿主与适配器的文件所有权标识不一致。");
    if(CraftManifestVerifier.Text(CraftManifestVerifier.Get(hostRecord,"package"),"manifestSha256")!=CraftManifestVerifier.Text(package,"manifestSha256"))throw new IOException("宿主与适配器版本记录不一致。");
    foreach(string key in new[]{"installId","adapterRoot","craftExe","originalExe","installMode"})
     if(CraftManifestVerifier.Text(hostRecord,key)!=CraftManifestVerifier.Text(state,key))throw new IOException("宿主与适配器所有权记录不一致。");
   }
   info.CraftExe=craft;info.Mode=mode;info.Status=status;info.Version=version;info.TemplatePath=launcher;info.LauncherPath=mode=="same-name"?craft:launcher;info.Valid=true;
   string label=status=="installed"?"已记录安装":status=="detached"?"已拆卸，数据保留":status=="host-changed"?"Craft 入口已改变，保留恢复记录":"官方更新已解除挂载";
   info.Message=label+" "+version+"（"+(mode=="same-name"?"原 Craft 入口":"旧版独立入口，安装更新将迁移")+"）。仅检查安装记录，尚未校验文件完整性。";
   if(!File.Exists(craft)||!File.Exists(launcher))info.Message+=" 原程序或启动器已缺失，请核对路径。";
  } catch(Exception error) { info.Valid=false;info.Message="安装记录不可用："+error.Message; }
  return info;
 }

 static string Quote(string value) { return "\""+Regex.Replace(Regex.Replace(value,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\""; }
 // New links are opt-in. A verified legacy link for this same installation is
 // migrated to the original EXE when the installation itself is migrated.
 internal static string CreateDesktopShortcut(string destination){return WriteDesktopShortcut(destination,true,null);}
 internal static string MigrateLegacyDesktopShortcut(string destination){return WriteDesktopShortcut(destination,false,null);}
 internal static string WriteDesktopShortcut(string destination,bool createIfMissing,string desktopOverride){
  var installed=ReadInstalled(destination);
  if(!installed.Valid||installed.Mode!="same-name"||installed.Status!="installed")throw new IOException("当前安装记录无效，无法创建启动快捷方式。");
  string desktop=desktopOverride??Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
  if(String.IsNullOrWhiteSpace(desktop)||!Directory.Exists(desktop)){if(!createIfMissing)return null;throw new IOException("找不到桌面目录，未创建快捷方式。");}
  NoLinks(desktop);string link=Path.Combine(desktop,"WebVideo+ Craft.lnk");NoLinks(link);
  if(!createIfMissing&&!File.Exists(link))return null;
  CraftManifestVerifier.VerifyLaunch(installed.StatePath,installed.LauncherPath);
  object shell=null,shortcut=null;string temporary=null,before=null;
  try {
   var type=Type.GetTypeFromProgID("WScript.Shell");if(type==null)throw new IOException("系统无法创建快捷方式，请使用原 Craft 快捷方式或程序。");
   shell=Activator.CreateInstance(type);
   if(File.Exists(link)) {
    before=CraftManifestVerifier.Hash(link);shortcut=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{link});
    string target=Convert.ToString(ShortcutProperty(shortcut,"TargetPath")),arguments=Convert.ToString(ShortcutProperty(shortcut,"Arguments")),cwd=Convert.ToString(ShortcutProperty(shortcut,"WorkingDirectory"));
    if(CraftManifestVerifier.Same(target,installed.LauncherPath)&&arguments==""&&CraftManifestVerifier.Same(cwd,Path.GetDirectoryName(installed.CraftExe)))return link;
    bool legacy=CraftManifestVerifier.Same(target,installed.TemplatePath)&&arguments=="--state "+Quote(installed.StatePath)&&CraftManifestVerifier.Same(cwd,installed.AdapterRoot);
    if(!legacy){if(!createIfMissing)return null;throw new IOException("桌面已有同名快捷方式，可能属于其他安装；未覆盖。请使用原 Craft 快捷方式或程序。");}
    ReleaseCom(shortcut);shortcut=null;
   }
   temporary=Path.Combine(desktop,".WebVideoCraft-"+Guid.NewGuid().ToString("N")+".lnk");
   shortcut=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{temporary});
   SetShortcutProperty(shortcut,"TargetPath",installed.LauncherPath);SetShortcutProperty(shortcut,"Arguments","");SetShortcutProperty(shortcut,"WorkingDirectory",Path.GetDirectoryName(installed.CraftExe));SetShortcutProperty(shortcut,"Description","Craft 原程序入口（WebVideo+）");
   shortcut.GetType().InvokeMember("Save",BindingFlags.InvokeMethod,null,shortcut,null);
   NoLinks(desktop);NoLinks(link);
   if(before==null)File.Move(temporary,link);
   else {if(!File.Exists(link)||CraftManifestVerifier.Hash(link)!=before)throw new IOException("桌面快捷方式在迁移期间变化，已保留，请手动使用原 Craft 入口。");File.Replace(temporary,link,null);}
   temporary=null;return link;
  } finally {
   ReleaseCom(shortcut);ReleaseCom(shell);
   if(temporary!=null)try { File.Delete(temporary); } catch { }
  }
 }
}

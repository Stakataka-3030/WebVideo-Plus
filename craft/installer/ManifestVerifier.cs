using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

internal static class CraftManifestVerifier {
 internal static string Text(object value,string key){object item;return value is Dictionary<string,object>&&((Dictionary<string,object>)value).TryGetValue(key,out item)&&item!=null?Convert.ToString(item):"";}
 internal static object Get(object value,string key){object item;return value is Dictionary<string,object>&&((Dictionary<string,object>)value).TryGetValue(key,out item)?item:null;}
 internal static Dictionary<string,object> Read(string file){NoLinks(file);return new JavaScriptSerializer{MaxJsonLength=32*1024*1024}.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));}
 internal static string Hash(string file){using(var input=File.OpenRead(file))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();}
 internal static bool Within(string root,string file){return Path.GetFullPath(file).StartsWith(Path.GetFullPath(root).TrimEnd('\\','/')+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
 internal static bool Same(string a,string b){return Path.GetFullPath(a).TrimEnd('\\','/').Equals(Path.GetFullPath(b).TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase);}
 internal static void NoLinks(string file){string current=Path.GetFullPath(file);for(;;){if((File.Exists(current)||Directory.Exists(current))&&(File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("不允许链接或重解析路径："+current);string parent=Path.GetDirectoryName(current);if(String.IsNullOrEmpty(parent)||parent==current)break;current=parent;}}
 internal static string Under(string root,string relative,bool checkLinks=true){
  if(String.IsNullOrWhiteSpace(relative)||relative.IndexOf('\\')>=0||relative.IndexOf(':')>=0||relative.IndexOf('\0')>=0||relative.Split('/').Any(part=>part==""||part=="."||part==".."||part.EndsWith(".")||part.EndsWith(" ")||System.Text.RegularExpressions.Regex.IsMatch(part,@"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$",System.Text.RegularExpressions.RegexOptions.IgnoreCase)))throw new IOException("安装包路径无效："+relative);
  string full=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar))),prefix=Path.GetFullPath(root).TrimEnd('\\','/')+Path.DirectorySeparatorChar;
  if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new IOException("安装包路径越界");if(checkLinks)NoLinks(full);return full;
 }
 internal static Dictionary<string,object> Verify(string root,bool mutable=false,Action<string> report=null){
  root=Path.GetFullPath(root);NoLinks(root);var manifest=Read(Path.Combine(root,"MANIFEST.json"));
  if(Text(manifest,"schemaVersion")!="1"||Text(manifest,"product")!="WebVideo+ Craft")throw new IOException("Craft 安装包格式不匹配");
  var hosts=Get(manifest,"supportedHosts") as IEnumerable;if(hosts==null||!hosts.Cast<object>().Any())throw new IOException("缺少已验证 Craft 主程序兼容清单");
  var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var entries=Get(manifest,"files") as IEnumerable;if(entries==null)throw new IOException("安装包缺少文件清单");
  // Validate the root/ancestors once, then each child as it is visited. Check
  // links and hash a declared file together, without a separate cached tree pass.
  // No verification result or path cache is trusted across calls.
  var expected=new Dictionary<string,object>(StringComparer.OrdinalIgnoreCase);
  foreach(var item in entries){string name=Text(item,"path"),first=name.Split('/')[0];Under(root,name,false);long length;if(new[]{"config.json","state","logs","MANIFEST.json"}.Contains(first,StringComparer.OrdinalIgnoreCase)||!names.Add(name))throw new IOException("安装包重复或保留路径："+name);if(!long.TryParse(Text(item,"bytes"),out length)||length<0)throw new IOException("安装文件大小无效："+name);expected.Add(name,item);}
  if(names.Count==0)throw new IOException("安装包文件清单为空");
  foreach(string key in new[]{"entry","wrapper","node","kernel"}){string name=Text(manifest,key);Under(root,name,false);if(!names.Contains(name))throw new IOException("安装包缺少启动接口："+key);}
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);int completed=0;var progress=System.Diagnostics.Stopwatch.StartNew();
  Action<string> visit=null;visit=directory=>{foreach(string child in Directory.EnumerateFileSystemEntries(directory)){
   string relative=child.Substring(root.TrimEnd('\\','/').Length+1).Replace('\\','/');
   if(report!=null&&(completed==0||progress.ElapsedMilliseconds>=250)){report("正在校验启动文件 "+completed+" / "+names.Count+"："+relative);progress.Restart();}
   var attributes=File.GetAttributes(child);if((attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("不允许链接或重解析路径："+child);
   if((attributes&FileAttributes.Directory)!=0){visit(child);continue;}
   if(!seen.Add(relative))throw new IOException("安装目录包含重复路径："+relative);
   if(relative=="MANIFEST.json"||mutable&&new[]{"config.json","state","logs"}.Contains(relative.Split('/')[0],StringComparer.OrdinalIgnoreCase))continue;
   object item;if(!expected.TryGetValue(relative,out item))throw new IOException("安装目录包含未声明文件："+relative);
   if(new FileInfo(child).Length!=long.Parse(Text(item,"bytes"))||Hash(child)!=Text(item,"sha256"))throw new IOException("安装文件校验失败："+relative);completed++;
  }};
  if(report!=null)report("正在检查启动目录及全部文件完整性…");visit(root);
  foreach(string name in names)if(!seen.Contains(name))throw new IOException("安装文件缺失："+name);
  if(report!=null)report("全部 "+names.Count+" 个启动文件校验完成");
  return manifest;
 }
 internal static void MatchOwnership(object state,object canonical){
  foreach(string key in new[]{"schemaVersion","stateVersion","installId","status","installMode"})if(Text(state,key)!=Text(canonical,key))throw new IOException("宿主与适配器所有权记录不一致："+key);
  foreach(string key in new[]{"adapterRoot","craftExe","originalExe","kernelExe","stateDir"})if(!Same(Text(state,key),Text(canonical,key)))throw new IOException("宿主与适配器路径记录不一致："+key);
  foreach(string key in new[]{"originalSha256","wrapperSha256"})if(Text(Get(state,"ownership"),key)!=Text(Get(canonical,"ownership"),key))throw new IOException("宿主与适配器文件所有权不一致："+key);
  foreach(string key in new[]{"version","manifestSha256","entry","node","wrapper"})if(Text(Get(state,"package"),key)!=Text(Get(canonical,"package"),key))throw new IOException("宿主与适配器负载记录不一致："+key);
  foreach(string key in new[]{"version","sha256"})if(Text(Get(state,"host"),key)!=Text(Get(canonical,"host"),key))throw new IOException("宿主与适配器版本记录不一致："+key);
 }
 internal static Dictionary<string,object> VerifyLaunch(string statePath,string launcher,Action<string> report=null){
  var state=Read(statePath);string root=Text(state,"adapterRoot"),craft=Text(state,"craftExe"),original=Text(state,"originalExe"),mode=Text(state,"installMode");
  if(Text(state,"schemaVersion")!="1"||Text(state,"stateVersion")!="1"||Text(state,"status")!="installed"||!new[]{"external","same-name"}.Contains(mode))throw new IOException("Craft 适配器当前未挂载，请重新安装或完成更新恢复。");
  foreach(string file in new[]{root,craft,original}){if(!Path.IsPathRooted(file))throw new IOException("适配记录路径无效");NoLinks(file);}
  Guid owner;if(!Guid.TryParse(Text(state,"installId"),out owner))throw new IOException("适配器缺少安装所有权标识");
  if(Same(root,Path.GetDirectoryName(craft))||Within(root,Path.GetDirectoryName(craft))||Within(Path.GetDirectoryName(craft),root))throw new IOException("适配器与宿主目录必须隔离");
  string configPath=Path.Combine(root,"config.json");var canonicalState=Read(configPath);MatchOwnership(state,canonicalState);
  string record=Path.Combine(Path.GetDirectoryName(craft),"webvideo-craft.install.json");if(!Same(statePath,record)&&!Same(statePath,Path.Combine(root,"config.json")))throw new IOException("适配记录不属于此路径");
  if(mode=="same-name")MatchOwnership(state,Read(record));
  string expected=mode=="same-name"?Path.Combine(Path.GetDirectoryName(craft),"webgal-craft.webvideo-original.exe"):craft;if(!Same(original,expected))throw new IOException("原程序备份路径不匹配");
  var manifest=Verify(root,true,report);if(Text(manifest,"launchMode")=="same-name"&&mode!="same-name")throw new IOException("此版本只支持原 Craft EXE 入口，请使用安装器迁移旧入口。");var package=Get(state,"package");var ownership=Get(state,"ownership");
  if(Hash(Path.Combine(root,"MANIFEST.json"))!=Text(package,"manifestSha256")||Text(package,"entry")!=Text(manifest,"entry")||Text(package,"node")!=Text(manifest,"node")||!Same(Text(state,"kernelExe"),Under(root,Text(manifest,"kernel"))))throw new IOException("适配器版本记录与文件清单不一致");
  string wrapper=Under(root,Text(manifest,"wrapper"));if(!Same(launcher,wrapper)&&!(mode=="same-name"&&Same(launcher,craft)))throw new IOException("启动包装器不属于当前安装记录");
  if(Hash(launcher)!=Text(ownership,"wrapperSha256")||!File.Exists(original)||Hash(original)!=Text(ownership,"originalSha256"))throw new IOException("Craft 原程序或启动器已改变，未自动覆盖，请核对官方更新状态。");
  string hostHash=Text(ownership,"originalSha256");var verifiedHosts=Get(manifest,"supportedHosts") as IEnumerable;var verifiedHost=verifiedHosts.Cast<object>().FirstOrDefault(h=>Text(h,"sha256")==hostHash);if(verifiedHost==null||Text(Get(state,"host"),"sha256")!=hostHash||Text(Get(state,"host"),"version")!=Text(verifiedHost,"version"))throw new IOException("此 Craft 主程序未通过当前适配器的兼容验证");
  if(mode=="same-name"&&Hash(craft)!=Text(ownership,"wrapperSha256"))throw new IOException("官方更新已替换 Craft 入口，适配器不会恢复旧程序覆盖它。");
  return state;
 }
}

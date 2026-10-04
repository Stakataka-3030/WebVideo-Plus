using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Read-only host identification and product-specific release selection.
// Selection is not proof of patch compatibility: native integration retains its own gates.
public sealed class InstallerHostProduct {
 public string Product="unknown",Root="";
 public bool WrongForCraft {get{return Product=="terre"||Product=="ambiguous";}}
 public string CraftGuidance {get{return Product=="ambiguous"?"该目录同时包含 Terre 与 Craft。请分别使用独立安装目录；本安装器不会修改此目录。":"检测到 WebGAL Terre。当前安装器用于 Craft，请改用与引擎版本匹配的 WebVideo+ Terre 安装器；不会修改 Terre。";}}
 public bool WrongForTerre {get{return Product=="craft"||Product=="ambiguous";}}
 public string TerreGuidance {get{return Product=="ambiguous"?"该目录同时包含 Terre 与 Craft。请分别使用独立安装目录；本安装器不会修改此目录。":"检测到 WebGAL Craft。当前安装器用于 Terre，请改用 WebVideo+ Craft 安装器；不会修改 Craft。";}}
}
public sealed class InstallerDownload {
 public string Url="",Version="",Message="";
}
public static class InstallerProductRouting {
 public const string Api="https://api.github.com/repos/Stakataka-3030/WebVideo-Plus/releases?per_page=100";
 const string Repository="https://github.com/Stakataka-3030/WebVideo-Plus";
 static string Value(Dictionary<string,object> row,string key){object value;return row.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):"";}
 static bool Flag(Dictionary<string,object> row,string key){object value;return row.TryGetValue(key,out value)&&value is bool&&(bool)value;}
 static bool TerreName(string file){return System.Text.RegularExpressions.Regex.Replace(Path.GetFileNameWithoutExtension(file)??"",@"[\s_-]+","").Equals("WebGALTerre",StringComparison.OrdinalIgnoreCase);}
 public static InstallerHostProduct Detect(string selected,Func<string,string> shortcutTarget=null){
  var unknown=new InstallerHostProduct();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  try{for(int hop=0;hop<=8;hop++){
   if(String.IsNullOrWhiteSpace(selected))return unknown;selected=Path.GetFullPath(Environment.ExpandEnvironmentVariables(selected.Trim().Trim('"')));if(!seen.Add(selected))return unknown;
   if(File.Exists(selected)&&Path.GetExtension(selected).Equals(".lnk",StringComparison.OrdinalIgnoreCase)){if(shortcutTarget==null||hop==8)return unknown;selected=shortcutTarget(selected);continue;}
   string root=Directory.Exists(selected)?selected:File.Exists(selected)?Path.GetDirectoryName(selected):null;if(root==null)return unknown;
   bool craft=File.Exists(Path.Combine(root,"webgal-craft.exe"));
   bool terre=false;if(File.Exists(Path.Combine(root,"public/index.html"))){
    terre=File.Exists(Path.Combine(root,"WebGAL_Terre.exe"))||File.Exists(Path.Combine(root,"WebGAL Terre.exe"));
    if(!terre)try{terre=Directory.GetFiles(root,"*.exe",SearchOption.TopDirectoryOnly).Any(TerreName);}catch{if(craft)return new InstallerHostProduct{Root=root,Product="craft"};}
   }
   return new InstallerHostProduct{Root=root,Product=craft&&terre?"ambiguous":craft?"craft":terre?"terre":"unknown"};
  }}catch{}return unknown;
 }
 // Read the selected host's declared default engine only; never infer it from the newest release.
 public static string TerreEngine(string selected,Func<string,string> shortcutTarget=null){
  try{var host=Detect(selected,shortcutTarget);if(host.Product!="terre")return "";string file=Path.Combine(host.Root,"assets/templates/WebGAL_Template/webgal-engine.json");if(!File.Exists(file)||new FileInfo(file).Length>65536)return "";
   var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(file));string id=Value(data,"id"),version=Value(data,"version"),webgal=Value(data,"webgalVersion");
   if(id=="webgal-mygo.mygo")return version=="3.2.1"&&webgal=="4.6.4"?"4.6.4":"";
   if(id!="open-webgal.webgal"||version!=""&&webgal!=""&&version!=webgal)return "";string engine=webgal!=""?webgal:version;return engine=="4.6.4"||engine=="4.6.5"?engine:"";
  }catch{return "";}
 }
 public static void RequireTerre(string selected){var host=Detect(selected);if(host.WrongForTerre)throw new InvalidOperationException(host.TerreGuidance);}
 public static InstallerDownload Select(object[] rows,string product,string engine=""){
  if(product!="craft"&&product!="terre")throw new ArgumentException("未知安装器产品");
  var candidates=new List<Tuple<System.Version,InstallerDownload>>();
  foreach(var row in (rows??new object[0]).OfType<Dictionary<string,object>>()){
   if(Flag(row,"draft")||Flag(row,"prerelease"))continue;
   string tag=Value(row,"tag_name"),pattern=product=="craft"?@"^craft-v(\d+\.\d+\.\d+\.\d+)c$":@"^v(\d+\.\d+\.\d+)$";
   var match=System.Text.RegularExpressions.Regex.Match(tag,pattern);System.Version version;
   if(!match.Success||!System.Version.TryParse(match.Groups[1].Value,out version))continue;
   var marker=System.Text.RegularExpressions.Regex.Match(Value(row,"body"),@"<!--\s*webvideo-compat:\s*(\{[^\r\n]*\})\s*-->",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
   if(!marker.Success)continue;
   try{
    var metadata=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(marker.Groups[1].Value);string declared=Value(metadata,"product");
    if(product=="craft"&&declared!="craft"||product=="terre"&&declared!=""&&declared!="terre")continue;
    object engines;if(!metadata.TryGetValue("webgal",out engines)||!(engines is System.Collections.IEnumerable)||engines is string)continue;
    var supported=((System.Collections.IEnumerable)engines).Cast<object>().Select(Convert.ToString).ToArray();if(supported.Length==0||supported.Any(v=>!System.Text.RegularExpressions.Regex.IsMatch(v??"",@"^\d+\.\d+\.\d+$")))continue;
    if(product=="terre"&&(String.IsNullOrEmpty(engine)||!supported.Contains(engine)))continue;
    string name=product=="craft"?"WebVideoCraft-Setup-"+match.Groups[1].Value+"c.exe":"WebVideo+-Setup-"+match.Groups[1].Value+".exe";
    string expected=Repository+"/releases/download/"+tag+"/"+name;object assets;if(!row.TryGetValue("assets",out assets)||!(assets is System.Collections.IEnumerable))continue;
    foreach(var asset in ((System.Collections.IEnumerable)assets).OfType<Dictionary<string,object>>()){
     string url=Value(asset,"browser_download_url");Uri parsed;
     if(Value(asset,"name")!=name||Value(asset,"state")!="uploaded"||!Uri.TryCreate(url,UriKind.Absolute,out parsed)||parsed.Scheme!="https"||parsed.Host!="github.com"||!String.IsNullOrEmpty(parsed.UserInfo)||!String.IsNullOrEmpty(parsed.Query)||!String.IsNullOrEmpty(parsed.Fragment)||Uri.UnescapeDataString(url)!=expected)continue;
     candidates.Add(Tuple.Create(version,new InstallerDownload{Url=url,Version=match.Groups[1].Value,Message="已找到已发布的 "+(product=="craft"?"Craft":"Terre")+" 安装器 "+match.Groups[1].Value+"。"}));break;
    }
   }catch{}
  }
  return candidates.OrderByDescending(item=>item.Item1).Select(item=>item.Item2).FirstOrDefault()??new InstallerDownload{Message="暂无可确认的兼容正式安装器；请稍后重试。不会跳转到其他产品或旧测试版。"};
 }
 public static InstallerDownload Fetch(string product,string engine=""){
  ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;var request=(HttpWebRequest)WebRequest.Create(Api);request.Timeout=7000;request.ReadWriteTimeout=7000;request.UserAgent="WebVideoPlus-InstallerRouting";request.Accept="application/vnd.github+json";
  using(var response=(HttpWebResponse)request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8)){
   if(response.StatusCode!=HttpStatusCode.OK||response.ContentLength>2*1024*1024)throw new IOException("发行列表不可用");var text=new StringBuilder();var block=new char[4096];int count;
   while((count=reader.Read(block,0,block.Length))>0){text.Append(block,0,count);if(text.Length>2*1024*1024)throw new IOException("发行列表过大");}
   return Select(new JavaScriptSerializer{MaxJsonLength=2*1024*1024}.Deserialize<object[]>(text.ToString()),product,engine);
  }
 }
}

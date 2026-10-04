using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Unmodified release evaluator and version comparator from published v1.1.6 (00015e0).
// Included by configure-installer.mjs after the responsive layout helpers.
public sealed class ReleaseUpdateFinding {
 public string Kind,Message,Url,LatestVersion;
 public ReleaseUpdateFinding(string kind,string message,string url=""){Kind=kind;Message=message;Url=url;}
}

public static class ReleaseUpdateCheck {
 const string Api="https://api.github.com/repos/Stakataka-3030/WebVideo-Plus/releases?per_page=100";
 const string Releases="https://github.com/Stakataka-3030/WebVideo-Plus/releases";
 static readonly string[] Legacy={"1.0.0","1.0.1","1.0.4","1.1.0"};
 static readonly System.Text.RegularExpressions.Regex Tag=new System.Text.RegularExpressions.Regex(@"^v?(\d+)\.(\d+)\.(\d+)$");
 static string Version(string tag){var match=Tag.Match(tag??"");return match.Success?match.Groups[1].Value+"."+match.Groups[2].Value+"."+match.Groups[3].Value:"";}
 static string Value(Dictionary<string,object> row,string key){object value;return row.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):"";}
 static bool Flag(Dictionary<string,object> row,string key){object value;return row.TryGetValue(key,out value)&&value!=null&&Convert.ToBoolean(value);}
 static string Url(string tag){return Version(tag)==""?"":Releases+"/tag/"+Uri.EscapeDataString(tag);}
 static string[] Supports(Dictionary<string,object> release){
  var body=Value(release,"body");var marker=System.Text.RegularExpressions.Regex.Match(body,@"<!--\s*webvideo-compat:\s*(\{[^\r\n]*\})\s*-->",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  if(marker.Success)try{var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(marker.Groups[1].Value);object values;if(data.TryGetValue("webgal",out values)&&values is System.Collections.IEnumerable)return ((System.Collections.IEnumerable)values).Cast<object>().Select(Convert.ToString).Where(value=>System.Text.RegularExpressions.Regex.IsMatch(value??"",@"^\d+\.\d+\.\d+$")).ToArray();return new string[0];}catch{return new string[0];}
  return Legacy.Contains(Version(Value(release,"tag_name")))?new[]{"4.6.4"}:new string[0];
 }
 public static ReleaseUpdateFinding Evaluate(object[] data,string engine,string current){
  if(!System.Text.RegularExpressions.Regex.IsMatch(engine??"",@"^\d+\.\d+\.\d+$"))return new ReleaseUpdateFinding("unknown","无法确认 Terre 默认 WebGAL 引擎版本，不能自动推荐安装包。");
  var releases=data.OfType<Dictionary<string,object>>().Where(row=>!Flag(row,"draft")&&!Flag(row,"prerelease")&&Version(Value(row,"tag_name"))!="").OrderByDescending(row=>new System.Version(Version(Value(row,"tag_name")))).ToArray();
  if(releases.Length==0)throw new IOException("GitHub 没有可读取的正式发行版");
  var compatible=releases.FirstOrDefault(row=>Supports(row).Contains(engine));var latest=releases[0];string latestVersion=Version(Value(latest,"tag_name"));
  if(compatible==null)return new ReleaseUpdateFinding("unsupported","WebGAL "+engine+" 暂无已发布的兼容 WebVideo+ 版本；请勿仅按版本号升级。",Releases);
  string target=Version(Value(compatible,"tag_name")),url=Url(Value(compatible,"tag_name"));
  if(releases.Any(row=>InstallationState.CompareVersions(Version(Value(row,"tag_name")),target)>0&&Supports(row).Length==0))return new ReleaseUpdateFinding("unknown","发现较新的 WebVideo+，但其发行说明没有兼容范围；请在发行页确认后再安装。",Url(Value(latest,"tag_name")));
  if(InstallationState.CompareVersions(target,current)>0)return new ReleaseUpdateFinding("update","WebGAL "+engine+" 可更新至兼容的 WebVideo+ "+target+"。"+(InstallationState.CompareVersions(latestVersion,target)>0?"更新的 "+latestVersion+" 不适配当前引擎。":""),url);
  if(InstallationState.CompareVersions(latestVersion,target)>0)return new ReleaseUpdateFinding("keep","WebGAL "+engine+" 需要保留兼容的 WebVideo+ "+target+"；较新的 "+latestVersion+" 面向其他引擎版本。",url);
  return new ReleaseUpdateFinding("current","WebGAL "+engine+" 暂无比 "+current+" 更新的兼容正式版。");
 }
 public static ReleaseUpdateFinding Fetch(string engine,string current){
  ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;var request=(HttpWebRequest)WebRequest.Create(Api);request.Timeout=7000;request.ReadWriteTimeout=7000;request.UserAgent="WebVideoPlus-Setup/"+current;request.Accept="application/vnd.github+json";
  using(var response=(HttpWebResponse)request.GetResponse())using(var stream=response.GetResponseStream())using(var reader=new StreamReader(stream,Encoding.UTF8)){
   if(response.StatusCode!=HttpStatusCode.OK||response.ContentLength>2*1024*1024)throw new IOException("GitHub 发行列表不可用");
   var text=new StringBuilder();var block=new char[4096];int count;while((count=reader.Read(block,0,block.Length))>0){text.Append(block,0,count);if(text.Length>2*1024*1024)throw new IOException("GitHub 发行列表过大");}
   var serializer=new JavaScriptSerializer{MaxJsonLength=2*1024*1024};var rows=serializer.Deserialize<object[]>(text.ToString());var result=Evaluate(rows,engine,current);result.LatestVersion=rows.OfType<Dictionary<string,object>>().Where(row=>!Flag(row,"draft")&&!Flag(row,"prerelease")&&Version(Value(row,"tag_name"))!="").Select(row=>Version(Value(row,"tag_name"))).OrderByDescending(value=>new System.Version(value)).FirstOrDefault()??current;return result;
  }
 }
}


public class InstallationState {
 static string[] ParseVersion(string value){var m=System.Text.RegularExpressions.Regex.Match(value??"",@"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$");if(!m.Success)throw new FormatException("无法识别版本");return new[]{m.Groups[1].Value,m.Groups[2].Value,m.Groups[3].Value,m.Groups[4].Value};}
 static int NumericCompare(string a,string b){a=a.TrimStart('0');b=b.TrimStart('0');return a.Length!=b.Length?a.Length.CompareTo(b.Length):String.CompareOrdinal(a,b);}
 public static int CompareVersions(string a,string b){var x=ParseVersion(a);var y=ParseVersion(b);for(int i=0;i<3;i++){int c=NumericCompare(x[i],y[i]);if(c!=0)return c;}if(x[3]==y[3])return 0;if(x[3]=="")return 1;if(y[3]=="")return -1;var xp=x[3].Split('.');var yp=y[3].Split('.');for(int i=0;i<Math.Min(xp.Length,yp.Length);i++){bool xn=xp[i].All(Char.IsDigit),yn=yp[i].All(Char.IsDigit);int c=xn&&yn?NumericCompare(xp[i],yp[i]):xn!=yn?(xn?-1:1):String.CompareOrdinal(xp[i],yp[i]);if(c!=0)return c;}return xp.Length.CompareTo(yp.Length);}
}

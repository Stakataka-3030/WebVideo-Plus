using System;using System.IO;using System.Linq;using System.Text;using System.Text.RegularExpressions;using System.Collections.Generic;using System.Security.Cryptography;
namespace NativeVideo {
 public sealed class TerreHostMatch {public string Profile,SourceHash,Evidence;public bool ExactBaseline;}
 public sealed class TerreEntryReference {
  public string RawUrl,FileName;
  public string WithFileName(string name){int suffix=RawUrl.IndexOfAny(new[]{'?','#'});string path=suffix<0?RawUrl:RawUrl.Substring(0,suffix);return path.Substring(0,path.LastIndexOf('/')+1)+name+(suffix<0?"":RawUrl.Substring(suffix));}
 }
 public static class TerreHostCompatibility {
  const string Id=@"[A-Za-z_$][A-Za-z0-9_$]*";
  public static string SourceHash(string source){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(new UTF8Encoding(false).GetBytes(source))).Replace("-","").ToLowerInvariant();}
  static int Count(string source,string pattern){return Regex.Matches(source,pattern,RegexOptions.CultureInvariant).Count;}
  public static TerreHostMatch Inspect(string source,IDictionary<string,string> known){
   string hash=SourceHash(source);foreach(var pair in known)if(pair.Value==hash)return new TerreHostMatch{Profile=pair.Key,SourceHash=hash,ExactBaseline=true,Evidence="known-source-hash"};
   foreach(string name in new[]{"AddSentenceTab","ChangeFigure","GraphicalEditor"})if(Count(source,@"\bfunction\s+"+name+@"\s*\(")!=1)throw new IOException("Terre 接入函数不唯一或缺失："+name);
   int inheritName=Count(source,@"\bfunction\s+isInherit\s*\("),relativeName=Count(source,@"\bfunction\s+getDefaultRelativeCalc\s*\("),diff=Count(source,@"\bfunction\s+ChangeFigureDiff\s*\(");
   bool inherit=Count(source,@"\bfunction\s+isInherit\s*\(\s*(?<arg>"+Id+@")\s*\)\s*\{\s*return\s+\k<arg>\s*\.\s*inherit\s*!==\s*(?:!\s*1|false)\s*;?\s*\}")==1;
   bool relative=Count(source,@"\bfunction\s+getDefaultRelativeCalc\s*\(\s*(?<arg>"+Id+@")\s*\)\s*\{\s*return\s+DEFAULT_RELATIVE_CALC\s*\[\s*getCalcKey\s*\(\s*\k<arg>\s*\)\s*\]\s*\?\?\s*[""']absolute[""']\s*;?\s*\}")==1;
   string profile;if(inheritName!=0||relativeName!=0){if(inheritName!=1||relativeName!=1||!inherit||!relative||diff!=1)throw new IOException("Terre 4.6.6 能力组合不完整或存在重复锚点");profile="4.6.6";}
   else if(diff==1)profile="4.6.5";else if(diff==0)profile="4.6.4";else throw new IOException("Terre 立绘差分锚点不唯一");
   return new TerreHostMatch{Profile=profile,SourceHash=hash,ExactBaseline=false,Evidence="unique-known-capability-shapes; requires full patch preflight"};
  }
  public static string SingleLineReturn(string source){
   string start="function combineSubmitString(",end="function foldToMultiline(";int at=source.IndexOf(start,StringComparison.Ordinal),last=source.IndexOf(end,at<0?0:at+start.Length,StringComparison.Ordinal);
   if(at<0||last<0||source.IndexOf(start,at+start.Length,StringComparison.Ordinal)>=0||source.IndexOf(end,StringComparison.Ordinal)!=last||source.IndexOf(end,last+end.Length,StringComparison.Ordinal)>=0)throw new IOException("Terre 单行输出范围不唯一或缺失");
   string scope=source.Substring(at,last-at),pattern=@"return\s+displayWidth\s*\(\s*(?<line>"+Id+@")\s*\)\s*<=\s*MULTILINE_THRESHOLD\s*\?\s*\k<line>\s*:\s*foldToMultiline\s*\(\s*"+Id+@"\s*,\s*"+Id+@"\s*,\s*"+Id+@"\s*,\s*"+Id+@"\s*\)\s*\?\?\s*\k<line>";
   var regex=new Regex(pattern,RegexOptions.CultureInvariant);if(regex.Matches(scope).Count!=1)throw new IOException("Terre 单行输出锚点不唯一或缺失");return source.Substring(0,at)+regex.Replace(scope,m=>"return "+m.Groups["line"].Value,1)+source.Substring(last);
  }
  public static TerreEntryReference[] Entries(string html){
   var entries=new List<TerreEntryReference>();foreach(Match match in Regex.Matches(html??"",@"\b(?:src|href)\s*=\s*(?<quote>[""'])(?<url>[^""']+)\k<quote>",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant)){
    string raw=match.Groups["url"].Value;int suffix=raw.IndexOfAny(new[]{'?','#'});string path=suffix<0?raw:raw.Substring(0,suffix);if(path.StartsWith("./",StringComparison.Ordinal))path=path.Substring(2);else if(path.StartsWith("/",StringComparison.Ordinal))path=path.Substring(1);
    if(!path.StartsWith("assets/",StringComparison.Ordinal)||!path.EndsWith(".js",StringComparison.OrdinalIgnoreCase))continue;string file=path.Substring(7);
    if(file.Length==0||file.IndexOfAny(new[]{'/','\\',':','%'})>=0||file.IndexOfAny(Path.GetInvalidFileNameChars())>=0)continue;entries.Add(new TerreEntryReference{RawUrl=raw,FileName=file});
   }return entries.ToArray();
  }
 }
}

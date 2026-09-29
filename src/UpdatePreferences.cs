using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace NativeVideo {
 public static class UpdatePreferences {
  static readonly object Gate=new object();
  static string FileName { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter","update-preferences.json"); } }
  static string Value(Dictionary<string,object> values,string key){object value;return values.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):"";}
  public static Dictionary<string,object> Read(){
   lock(Gate){try{var path=FileName;if(!File.Exists(path)||new FileInfo(path).Length>4096)return Default();var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(path));var mode=Value(data,"mode");if(mode!="next-release"&&mode!="next-major"&&mode!="never")return Default();return new Dictionary<string,object>{{"mode",mode},{"baselineVersion",Value(data,"baselineVersion")}};}catch{return Default();}}
  }
  static Dictionary<string,object> Default(){return new Dictionary<string,object>{{"mode","on"},{"baselineVersion",""}};}
  public static Dictionary<string,object> Save(string mode,string baseline){
   if(mode!="on"&&mode!="next-release"&&mode!="next-major"&&mode!="never")throw new ArgumentException("更新提醒选项无效");
   Version parsed;if(mode!="on"&&mode!="never"&&!Version.TryParse(baseline,out parsed))throw new ArgumentException("缺少当前版本，无法暂停更新提醒");
   var data=new Dictionary<string,object>{{"mode",mode},{"baselineVersion",mode=="on"?"":baseline}};
   lock(Gate){var path=FileName;Directory.CreateDirectory(Path.GetDirectoryName(path));var temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";try{File.WriteAllText(temp,new JavaScriptSerializer().Serialize(data));if(File.Exists(path))File.Replace(temp,path,null);else File.Move(temp,path);}finally{if(File.Exists(temp))File.Delete(temp);}}
   return data;
  }
  public static bool Suppressed(Dictionary<string,object> preference,string latest){
   string mode=Value(preference,"mode");if(mode=="never")return true;if(mode=="on")return false;
   Version baseline,available;if(!Version.TryParse(Value(preference,"baselineVersion"),out baseline)||!Version.TryParse(latest,out available))return true;
   if(mode=="next-release")return available<=baseline;
   return available.Major<=baseline.Major;
  }
 }
}

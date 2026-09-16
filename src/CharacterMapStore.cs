using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Diagnostics;using System.Reflection;
namespace NativeVideo {
 public sealed class CharacterMapStore {
  readonly string folder,file;readonly object gate=new object();
  public CharacterMapStore(){folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebVideoPlus","character-map");file=Path.Combine(folder,"characters.json");bool firstUse=!Directory.Exists(folder);Directory.CreateDirectory(folder);if(firstUse)Files.Atomic(file,Factory());Read();}
  string Factory(){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("character-map.factory.json")){if(stream==null)throw new IOException("内置出厂表缺失，请重新安装组件");using(var reader=new StreamReader(stream))return reader.ReadToEnd();}}
  object Compile(object raw){
   var doc=raw as Dictionary<string,object>;if(doc==null||J.N(doc,"schemaVersion")!=1||!(J.Get(doc,"rows") is object[]))throw new ArgumentException("JSON 必须包含 schemaVersion: 1 和 rows 数组。");
   var rows=J.A(J.Get(doc,"rows"));if(rows.Count>10000)throw new ArgumentException("映射表超过 10000 行。");
   var names=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);var ids=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);var seenNames=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);var seenIds=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);var warnings=new List<string>();
   for(int i=0;i<rows.Count;i++){var row=rows[i] as Dictionary<string,object>;if(row==null||!(J.Get(row,"names") is string)||!(J.Get(row,"id") is string))throw new ArgumentException("第 "+(i+1)+" 行必须包含字符串 names 和 id。");string value=J.S(row,"names"),id=J.S(row,"id").Trim();var aliases=value.Split(';').Select(n=>n.Trim()).ToArray();if(id.Length==0||id.Length>256||id.Any(char.IsControl)||aliases.Any(n=>n.Length==0||n.Length>256||n.Any(char.IsControl)))throw new ArgumentException("第 "+(i+1)+" 行名字或 ID 为空、过长或含控制字符；名字用半角 ; 分隔。");
    foreach(string name in aliases){int first;if(seenNames.TryGetValue(name,out first))warnings.Add("名字“"+name+"”重复：第 "+first+"、"+(i+1)+" 行；采用第 "+(i+1)+" 行。");seenNames[name]=i+1;names[name.ToLowerInvariant()]=id;}
    int prior;if(seenIds.TryGetValue(id,out prior))warnings.Add("ID“"+id+"”重复：第 "+prior+"、"+(i+1)+" 行；采用第 "+(i+1)+" 行。");seenIds[id]=i+1;ids[id.ToLowerInvariant()]=DisplayName(aliases);
   }
   return J.O("fatal",false,"rows",rows,"nameToId",names,"idToName",ids,"warnings",warnings);
  }
  static string DisplayName(string[] aliases){string full=aliases[0];var given=aliases.Where(name=>name.Length<full.Length&&full.EndsWith(name,StringComparison.OrdinalIgnoreCase)).OrderByDescending(name=>name.Length).FirstOrDefault();if(!string.IsNullOrEmpty(given))return given;var words=full.Split(new[]{' ','\u3000'},StringSplitOptions.RemoveEmptyEntries);return words.Length>1?words.Last():full;}
  public object Read(){lock(gate){string hash="";try{if(!File.Exists(file))throw new IOException("映射表文件不存在，可恢复出厂表。");hash=Files.Hash(file);if(new FileInfo(file).Length>2*1024*1024)throw new IOException("映射表超过 2 MB。");var result=J.D(Compile(J.Read(file)));result["hash"]=hash;result["folder"]=folder;return result;}catch(Exception e){return J.O("fatal",true,"message",e.Message,"hash",hash,"folder",folder,"warnings",new string[0],"idToName",J.O(),"nameToId",J.O());}}}
  void CheckHash(object request){string actual=File.Exists(file)?Files.Hash(file):"";if(J.S(request,"expectedHash")!=actual)throw new IOException("文件已被外部修改，请重新读取后再保存。");}
  public object Save(object request){lock(gate){CheckHash(request);var doc=J.O("schemaVersion",1,"rows",J.Get(request,"rows"));Compile(doc);J.Write(file,doc);return Read();}}
  public object Reset(object request){lock(gate){CheckHash(request);var text=Factory();Compile(J.Parse(text));if(File.Exists(file))File.Copy(file,Path.Combine(folder,"characters.before-reset-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff")+".json"));Files.Atomic(file,text);return Read();}}
  public object Open(){Directory.CreateDirectory(folder);if(File.Exists(file))Process.Start(new ProcessStartInfo("explorer.exe","/select,\""+Path.GetFullPath(file)+"\""){UseShellExecute=true});else Process.Start(new ProcessStartInfo(Path.GetFullPath(folder)){UseShellExecute=true,Verb="open"});return J.O("ok",true,"folder",Path.GetFullPath(folder));}
 }
}

using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Security.Cryptography;
namespace NativeVideo {
 public static class MusicProjectStore {
  static readonly object gate=new object();
  sealed class MusicLease:IDisposable {
   readonly Mutex mutex;
   public MusicLease(string file){mutex=new Mutex(false,"Local\\WebVideoMusic-"+Files.HashText(Files.Full(file).ToLowerInvariant()));bool held=false;try{try{held=mutex.WaitOne(10000);}catch(AbandonedMutexException){held=true;}if(!held)throw new IOException("音乐配置正在保存，请稍后再试。");}catch{mutex.Dispose();throw;}}
   public void Dispose(){mutex.ReleaseMutex();mutex.Dispose();}
  }
  static string Target(string gamesRoot,object input){string project=J.S(input,"project");if(string.IsNullOrWhiteSpace(project)||project.IndexOfAny(new[]{'/','\\',':'})>=0||project=="."||project=="..")throw new ArgumentException("项目名称无效");string root=Files.Under(gamesRoot,project);if(!Directory.Exists(root))throw new DirectoryNotFoundException("项目不存在");return Path.Combine(root,"video-project.json");}
  static string Hash(string file){return File.Exists(file)?Files.Hash(file):"missing";}
  static string Digest(byte[] bytes){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  static object Empty(){return J.O("schemaVersion",2,"enabled",false,"players",1,"tracks",new object[0]);}
  static string TransactionRoot(string file){return Path.Combine(Path.GetDirectoryName(file),".webvideo-plus","music-transactions");}
  // A foreign editor need not honor our mutex. Preserve the exact file displaced
  // by ReplaceFile, then compare that preimage instead of trusting only a precheck.
  static bool FinishTransaction(string file,string journal){
   var data=J.Read(journal);string id=J.S(data,"id"),root=TransactionRoot(file),previous=Path.Combine(root,id+".previous"),temp=Path.Combine(Path.GetDirectoryName(file),".wvp-music-"+id+".tmp");Guid guid;
   if(!Guid.TryParse(id,out guid)||Path.GetFileName(journal)!=id+".pending.json"||J.S(data,"target")!=Files.Full(file)||!Files.Full(J.S(data,"previous")).Equals(Files.Full(previous),StringComparison.OrdinalIgnoreCase)||!Files.Full(J.S(data,"temp")).Equals(Files.Full(temp),StringComparison.OrdinalIgnoreCase))throw new IOException("音乐保存记录不匹配，已保留现场。");
   bool conflict=File.Exists(previous)&&Files.Hash(previous)!=J.S(data,"expectedHash");
   if(conflict){
    byte[] bytes=File.ReadAllBytes(previous);string backup=Path.Combine(Path.GetDirectoryName(file),".webvideo-plus","backups","music-"+id+"-concurrent.json");
    J.Write(backup,J.O("schemaVersion",1,"kind","music","id",id+"-concurrent","label","音乐时间线","path",J.S(data,"projectPath"),"createdAt",DateTime.UtcNow.ToString("o"),"before",Files.Utf8.GetString(bytes),"beforeBase64",Convert.ToBase64String(bytes),"beforeSha256",Digest(bytes)));
    // Never restore automatically: another editor may have written an even later
    // version. Both the actual preimage and a normal UI backup remain available.
    File.Move(journal,Path.Combine(root,id+".conflict.json"));return true;
   }
   if(File.Exists(previous))File.Delete(previous);
   if(File.Exists(temp))File.Delete(temp);
   File.Delete(journal);return false;
  }
  static bool RecoverPending(string file){string root=TransactionRoot(file);bool conflict=false;if(Directory.Exists(root))foreach(string journal in Directory.GetFiles(root,"*.pending.json"))conflict=FinishTransaction(file,journal)||conflict;return conflict;}
  static void AtomicSave(string file,string text,string expected,string projectPath){
   string root=TransactionRoot(file),id=Guid.NewGuid().ToString(),previous=Path.Combine(root,id+".previous"),temp=Path.Combine(Path.GetDirectoryName(file),".wvp-music-"+id+".tmp"),journal=Path.Combine(root,id+".pending.json");
   Directory.CreateDirectory(root);byte[] bytes=Files.Utf8.GetBytes(text);
   using(var stream=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
   try{J.Write(journal,J.O("id",id,"target",Files.Full(file),"previous",previous,"temp",temp,"expectedHash",expected,"newHash",Digest(bytes),"projectPath",projectPath));}catch{if(File.Exists(temp))File.Delete(temp);throw;}
   try{if(expected=="missing")File.Move(temp,file);else File.Replace(temp,file,previous);}
   catch{try{FinishTransaction(file,journal);}catch{}throw;}
   if(FinishTransaction(file,journal))throw new IOException("音乐配置已被另一个编辑器修改；两个版本已保留，请在历史备份中核对后继续。");
  }
  public static object Read(string gamesRoot,object input){lock(gate){string file=Target(gamesRoot,input);using(new MusicLease(file)){bool conflict=RecoverPending(file);if(!File.Exists(file))return J.O("music",Empty(),"hash","missing");byte[] bytes=File.ReadAllBytes(file);object music=null;string error=conflict?"音乐配置存在并发保存，历史备份已保留两个版本，请先核对。":null;try{music=J.Parse(Files.Utf8.GetString(bytes));if(music==null)error="音乐配置无法解析，请先恢复备份。";}catch{error="音乐配置无法解析，请先恢复备份。";}return J.O("music",music,"hash",Digest(bytes),"error",error);}}}
  public static object Save(string gamesRoot,object input){lock(gate){string file=Target(gamesRoot,input),expected=J.S(input,"expectedHash");var music=J.Get(input,"music");if(!new[]{1.0,2.0}.Contains(J.N(music,"schemaVersion"))||J.A(J.Get(music,"tracks")).Count>64)throw new ArgumentException("音乐配置格式无效");string text=J.Text(music);if(text.Length>4*1024*1024)throw new ArgumentException("音乐配置过大");using(new MusicLease(file)){
   RecoverPending(file);if(expected==""||expected!=Hash(file))throw new IOException("音乐配置已被修改，请重新打开音乐面板后再保存。");
   byte[] beforeBytes=File.Exists(file)?File.ReadAllBytes(file):null;if((beforeBytes==null?"missing":Digest(beforeBytes))!=expected)throw new IOException("音乐配置已被修改，本次保存已停止。");
   string before=beforeBytes==null?J.Text(Empty()):Files.Utf8.GetString(beforeBytes),id=Guid.NewGuid().ToString(),at=DateTime.UtcNow.ToString("o"),projectPath="games/"+J.S(input,"project")+"/video-project.json",backup=Path.Combine(Path.GetDirectoryName(file),".webvideo-plus","backups","music-"+id+".json");
   J.Write(backup,J.O("beforeBase64",beforeBytes==null?null:Convert.ToBase64String(beforeBytes),"beforeSha256",expected,"label","音乐时间线","schemaVersion",1,"kind","music","id",id,"path",projectPath,"createdAt",at,"before",before,"after",music));
   if(expected!=Hash(file))throw new IOException("音乐配置已被修改，本次保存已停止。");AtomicSave(file,text,expected,projectPath);
   return J.O("music",music,"hash",Files.HashText(text),"backup",backup,"file","games/"+J.S(input,"project")+"/.webvideo-plus/backups/music-"+id+".json","id",id,"createdAt",at);
  }}}
 }
}

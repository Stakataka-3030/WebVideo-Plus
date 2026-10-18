using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Threading;
using System.Security.Cryptography;
namespace NativeVideo {
  public static class MusicProjectStore {
    static readonly object gate=new object();
    static string Target(string gamesRoot,object input){
      string project=J.S(input,"project");
      if(string.IsNullOrWhiteSpace(project)||project.IndexOfAny(new[]{
        '/','\\',':'
      }
      )>=0||project=="."||project=="..")throw new ArgumentException("项目名称无效");
      string root=Files.Under(gamesRoot,project);
      if(!Directory.Exists(root))throw new DirectoryNotFoundException("项目不存在");
      return Path.Combine(root,"video-project.json");
    }
    static string Hash(string file){
      return File.Exists(file)?Files.Hash(file):"missing";
    }
    static string Digest(byte[] bytes){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    static object Empty(){
      return J.O("schemaVersion",2,"enabled",false,"players",1,"tracks",new object[0]);
    }
    public static object Read(string gamesRoot,object input){
      lock(gate){
        string file=Target(gamesRoot,input);
        if(!File.Exists(file))return J.O("music",Empty(),"hash","missing");
        byte[] bytes=File.ReadAllBytes(file);string text=Files.Utf8.GetString(bytes);
        object music=null;string error=null;try{music=J.Parse(text);if(music==null)error="音乐配置无法解析，请先恢复备份。";}catch{error="音乐配置无法解析，请先恢复备份。";}return J.O("music",music,"hash",Digest(bytes),"error",error);
      }
    }
    public static object Save(string gamesRoot,object input){
      lock(gate){
        string file=Target(gamesRoot,input),expected=J.S(input,"expectedHash");
        if(expected==""||expected!=Hash(file))throw new IOException("音乐配置已被修改，请重新打开音乐面板后再保存。");
        var music=J.Get(input,"music");
        if(!new[]{1.0,2.0}.Contains(J.N(music,"schemaVersion"))||J.A(J.Get(music,"tracks")).Count>64)throw new ArgumentException("音乐配置格式无效");
        string text=J.Text(music);
        if(text.Length>4*1024*1024)throw new ArgumentException("音乐配置过大");
        using(var mutex=new Mutex(false,"Local\\WebVideoMusic-"+Files.HashText(Files.Full(file).ToLowerInvariant()))){
          bool held=false;
          try{
            try{
              held=mutex.WaitOne(10000);
            }
            catch(AbandonedMutexException){
              held=true;
            }
            if(!held)throw new IOException("音乐配置正在保存，请稍后再试。");
            if(expected!=Hash(file))throw new IOException("音乐配置已被修改，请重新打开音乐面板后再保存。");
            byte[] beforeBytes=File.Exists(file)?File.ReadAllBytes(file):null;string before=beforeBytes==null?null:Files.Utf8.GetString(beforeBytes),id=Guid.NewGuid().ToString(),at=DateTime.UtcNow.ToString("o"),backup=Path.Combine(Path.GetDirectoryName(file),".webvideo-plus","backups","music-"+id+".json");
            if((beforeBytes==null?"missing":Digest(beforeBytes))!=expected)throw new IOException("音乐配置已被修改，本次保存已停止。");J.Write(backup,J.O("beforeBase64",beforeBytes==null?null:Convert.ToBase64String(beforeBytes),"beforeSha256",expected,"label","音乐时间线","schemaVersion",1,"kind","music","id",id,"path","games/"+J.S(input,"project")+"/video-project.json","createdAt",at,"before",before??J.Text(Empty()),"after",music));
            if(expected!=Hash(file))throw new IOException("音乐配置已被修改，本次保存已停止。");
            Files.Atomic(file,text);
            return J.O("music",music,"hash",Files.Hash(file),"backup",backup,"file","games/"+J.S(input,"project")+"/.webvideo-plus/backups/music-"+id+".json","id",id,"createdAt",at);
          }
          finally{
            if(held)mutex.ReleaseMutex();
          }
        }
      }
    }
  }
}

using System;
using System.IO;
namespace NativeVideo {
  public sealed class QueuePreparation:IDisposable {
    readonly string record,work,nonce;
    bool committed;
    public QueuePreparation(string record,string work){
      this.record=Files.Full(record);
      this.work=Files.Full(work);
      nonce=Guid.NewGuid().ToString("N");
      if(Directory.Exists(record)||Directory.Exists(work))throw new IOException("任务准备目录已存在");
      Directory.CreateDirectory(record);
      try{
        J.Write(Path.Combine(record,"preparing.json"),J.O("schemaVersion",1,"id",Path.GetFileName(record),"recordDir",this.record,"workDir",this.work,"nonce",nonce));
        Directory.CreateDirectory(work);
        J.Write(Path.Combine(work,".preparing.json"),J.O("nonce",nonce));
      }
      catch{
        if(!File.Exists(Path.Combine(record,"preparing.json"))&&Directory.GetFileSystemEntries(record).Length==0)Directory.Delete(record);
        else Dispose();
        throw;
      }
    }
    public void Commit(){
      committed=true;
      try{
        File.Delete(Path.Combine(record,"preparing.json"));
        File.Delete(Path.Combine(work,".preparing.json"));
      }
      catch{
      }
    }
    public void Dispose(){
      if(committed)return;
      try{
        Cleanup(record,work,nonce);
      }
      catch(Exception error){
        try{
          Files.Atomic(Path.Combine(record,"preparation-error.txt"),error.ToString());
        }
        catch{
        }
      }
    }
    static void Cleanup(string record,string work,string nonce){
      var marker=J.Read(Path.Combine(record,"preparing.json"));
      if(string.IsNullOrEmpty(nonce)||J.S(marker,"nonce")!=nonce||J.S(marker,"recordDir")!=Files.Full(record)||J.S(marker,"workDir")!=Files.Full(work))throw new IOException("任务准备目录归属不符");
      if(File.Exists(Path.Combine(record,"request.json")))return;
      if(Directory.Exists(work)){
        var owned=J.TryRead(Path.Combine(work,".preparing.json"));
        if(J.S(owned,"nonce")==nonce)Files.DeleteTree(Path.GetDirectoryName(work),work);
        else if(Directory.GetFileSystemEntries(work).Length==0)Directory.Delete(work);
        else throw new IOException("任务工作目录缺少归属标记");
      }
      Files.DeleteTree(Path.GetDirectoryName(record),record);
    }
    public static void Recover(string jobsRoot,string workRoot){
      if(!Directory.Exists(jobsRoot))return;
      foreach(string record in Directory.GetDirectories(jobsRoot)){
        string markerFile=Path.Combine(record,"preparing.json");
        if(!File.Exists(markerFile))continue;
        try{
          var marker=J.Read(markerFile);
          Guid id;
          if(!Guid.TryParse(Path.GetFileName(record),out id)||J.S(marker,"id")!=Path.GetFileName(record)||J.S(marker,"recordDir")!=Files.Full(record))continue;
          string work=Files.Full(J.S(marker,"workDir"));
          if(Path.GetFileName(work)!=Path.GetFileName(record)||J.S(marker,"nonce")=="")continue;
          var request=J.TryRead(Path.Combine(record,"request.json"));
          if(request!=null){
            if(J.S(request,"id")!=Path.GetFileName(record)||J.S(request,"jobDir")!=work)continue;
            if(J.TryRead(Path.Combine(record,"status.json"))==null)J.Write(Path.Combine(record,"status.json"),J.O("state","failed","phase","failed","message","任务准备中断，可重试继续","noticeId",Guid.NewGuid().ToString()));
            if(J.S(J.TryRead(Path.Combine(work,".preparing.json")),"nonce")==J.S(marker,"nonce"))File.Delete(Path.Combine(work,".preparing.json"));
            File.Delete(markerFile);
            continue;
          }
          Cleanup(record,work,J.S(marker,"nonce"));
        }
        catch{
        }
      }
    }
  }
}

using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
namespace NativeVideo {
  public sealed partial class AiProviderStore {
    readonly Dictionary<string,Dictionary<string,object>> novelTasks=new Dictionary<string,Dictionary<string,object>>();
    CancellationTokenSource novelCancellation;
    string novelActive;
    string NovelRoot{
      get{
        return Path.Combine(folder,"novel-tasks");
      }
    }
    string NovelDir(string id){
      Guid value;
      if(!Guid.TryParse(id,out value))throw new ArgumentException("任务编号无效");
      return Files.Under(NovelRoot,id);
    }
    void SaveNovelState(string id,Dictionary<string,object> state){
      J.Write(Path.Combine(NovelDir(id),"status.json"),state);
    }
    public object StartNovel(object input,string gamesRoot){
      Enabled();
      lock(gate){
        if(novelActive!=null)throw new InvalidOperationException("已有小说转换正在进行，请完成或取消后再试。");
        string source=J.S(input,"source");
        if(string.IsNullOrWhiteSpace(source)||source.Length>2000000||J.A(J.Get(input,"units")).Count>200000||J.Text(input).Length>20000000)throw new ArgumentException("原文为空或文本过大，请按卷分次处理。");
        var settings=Read();
        string selected=J.S(settings,"selected");
        var saved=J.Get(J.Get(settings,"profiles"),selected);
        if(saved==null||J.S(saved,"secret")==""||J.S(saved,"model")=="")throw new ArgumentException("请先在配置中填写 API Key 并选择模型。");
        var request=new Dictionary<string,object>(J.D(saved));
        request["expectedConfiguration"]=CacheIdentity(saved);
        request.Remove("secret");
        request["source"]=source;
        request["units"]=J.Get(input,"units");
        request["knownSpeakers"]=J.Get(input,"knownSpeakers");
        request["project"]=J.S(input,"project");
        request["gamesRoot"]=Files.Full(gamesRoot);
        request["maxActors"]=J.B(input,"allowTwo")?2:1;
        request["characterMap"]=new CharacterMapStore(Path.GetDirectoryName(folder)).Read();
        if(J.B(J.Get(request,"characterMap"),"fatal"))throw new IOException("角色对应表不可用。");
        string runtime=Path.Combine(Files.Root,"ai-runtime");
        request["promptSignature"]=Files.HashText(File.ReadAllText(Path.Combine(runtime,"novel-prompt.txt"))+File.ReadAllText(Path.Combine(runtime,"stage-prompt.txt"))+File.ReadAllText(Path.Combine(runtime,"worker.mjs")));
        string signature=Files.HashText(J.Text(request)),id=null;
        Directory.CreateDirectory(NovelRoot);
        if(!J.B(input,"fromScratch"))foreach(string dir in Directory.GetDirectories(NovelRoot).OrderByDescending(p=>Directory.GetLastWriteTimeUtc(p))){
          var previous=J.TryRead(Path.Combine(dir,"request.json"));
          if(J.S(previous,"inputSignature")!=signature)continue;
          var previousState=J.TryRead(Path.Combine(dir,"status.json"));
          if(J.S(previousState,"state")=="cancelled"||File.Exists(Path.Combine(dir,"cancelled.json")))break;
          if(J.S(previousState,"state")=="complete"&&!J.B(input,"reuseCompleted"))break;
          id=Path.GetFileName(dir);
          request=J.D(previous);
          if(J.S(previousState,"state")=="complete"){
            novelTasks[id]=J.D(previousState);
            return J.O("id",id,"state","complete");
          }
          break;
        }
        if(id==null){
          id=Guid.NewGuid().ToString();
          request["inputSignature"]=signature;
          request["sessionId"]=id;
          request["checkpointDir"]=NovelDir(id);
          Directory.CreateDirectory(NovelDir(id));
          J.Write(Path.Combine(NovelDir(id),"request.json"),request);
        }
        var state=J.O("id",id,"state","running","phase","正文与角色识别","startedAt",DateTime.UtcNow.ToString("o"));
        novelTasks[id]=state;
        SaveNovelState(id,state);
        novelActive=id;
        novelCancellation=new CancellationTokenSource();
        novelCancellation.CancelAfter(3600000);
        var cancel=novelCancellation;
        string taskId=id;
        Task.Run(async()=>{
          try{
            string structured=Path.Combine(NovelDir(taskId),"structure.json");
            var result=File.Exists(structured)?J.Read(structured):await Run(request,"novel",cancel.Token);
            cancel.Token.ThrowIfCancellationRequested();
            J.Write(structured,result);
            lock(gate){
              state["phase"]="扫描全部相关素材";
              SaveNovelState(taskId,state);
            }
            var assets=J.Get(request,"stageAssets")??CollectStageAssets(gamesRoot,J.S(request,"project"),J.Get(result,"cast"),J.Get(request,"characterMap"));
            request["segments"]=J.Get(result,"segments");
            request["stageAssets"]=assets;
            J.Write(Path.Combine(NovelDir(taskId),"request.json"),request);
            lock(gate){
              state["phase"]="基础舞台安排";
              state["completedBatches"]=0;
              state["totalBatches"]=0;
              SaveNovelState(taskId,state);
            }
            var staging=await Run(request,"stage",cancel.Token);
            cancel.Token.ThrowIfCancellationRequested();
            J.D(result)["staging"]=J.O("assets",assets,"changes",J.Get(staging,"changes"),"maxActors",J.Get(request,"maxActors"));
            lock(gate){
              cancel.Token.ThrowIfCancellationRequested();
              state["state"]="complete";
              state["result"]=result;
              SaveNovelState(taskId,state);
            }
          }
          catch(Exception e){
            lock(gate){
              state["state"]=File.Exists(Path.Combine(NovelDir(taskId),"cancelled.json"))?"cancelled":"failed";
              state["error"]=e.Message;
              try{
                SaveNovelState(taskId,state);
              }
              catch{
              }
            }
          }
          finally{
            lock(gate){
              novelActive=null;
              novelCancellation=null;
            }
            cancel.Dispose();
          }
        }
        );
        return J.O("id",id,"state","running");
      }
    }
    public object NovelStatus(object input){
      lock(gate){
        string id=J.S(input,"id");
        Dictionary<string,object> state;
        if(novelTasks.TryGetValue(id,out state))return new Dictionary<string,object>(state);
        var persisted=J.TryRead(Path.Combine(NovelDir(id),"status.json"));
        if(persisted==null)throw new ArgumentException("任务不存在。");
        state=J.D(persisted);
        if(J.S(state,"state")=="running")state["state"]="interrupted";
        if(File.Exists(Path.Combine(NovelDir(id),"cancelled.json")))state["state"]="cancelled";
        return state;
      }
    }
    public object CancelNovel(object input){
      lock(gate){
        string id=J.S(input,"id");
        var state=J.D(NovelStatus(input));
        J.Write(Path.Combine(NovelDir(id),"cancelled.json"),J.O("at",DateTime.UtcNow.ToString("o")));
        state["state"]="cancelled";
        novelTasks[id]=state;
        SaveNovelState(id,state);
        if(id==novelActive)novelCancellation.Cancel();
        return J.O("ok",true);
      }
    }
    async Task<string> ReadNovelOutput(System.IO.StreamReader reader,string id){
      string line,result="";
      while((line=await reader.ReadLineAsync())!=null){
        if(line.Length>16000000)throw new System.IO.IOException("生成结果过大。");
        object data;
        try{
          data=J.Parse(line);
        }
        catch{
          result=line;
          continue;
        }
        if(J.S(data,"type")=="progress"){
          lock(gate){
            Dictionary<string,object> state;
            if(novelTasks.TryGetValue(id,out state)){
              state["completedBatches"]=J.N(data,"completed");
              state["totalBatches"]=J.N(data,"total");
              state["retrying"]=J.B(data,"retrying");
              SaveNovelState(id,state);
            }
          }
          continue;
        }
        result=line;
      }
      return result;
    }
  }
}

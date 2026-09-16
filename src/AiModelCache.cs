using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Threading;using System.Threading.Tasks;
namespace NativeVideo {
 public sealed partial class AiProviderStore {
  volatile bool refreshStopped,refreshing;int refreshStarted;Task refreshTask;readonly CancellationTokenSource refreshCancellation=new CancellationTokenSource();
  string CacheFile{get{return Path.Combine(folder,"model-lists.json");}}
  Dictionary<string,object> Cache(){try{if(!File.Exists(CacheFile)||new FileInfo(CacheFile).Length>8*1024*1024)return J.O();return J.D(J.Get(J.Read(CacheFile),"providers"));}catch{return J.O();}}
  string CacheIdentity(object profile){return Files.HashText(J.Text(J.O("baseURL",J.S(profile,"baseURL"),"api",J.S(profile,"api"),"secret",J.S(profile,"secret"),"autoRouting",J.Get(profile,"autoRouting"))));}
  object PublicCache(object data){var result=J.O();foreach(var pair in Cache()){var profile=J.Get(J.Get(data,"profiles"),pair.Key);if(profile!=null&&J.S(pair.Value,"signature")==CacheIdentity(profile))result[pair.Key]=J.O("models",J.Get(pair.Value,"models"),"updatedAt",J.S(pair.Value,"updatedAt"));}return result;}
  void RememberModels(object payload,object result){lock(gate){try{var saved=J.Get(J.Get(Read(),"profiles"),J.S(payload,"provider"));if(saved==null||Unprotect(J.S(saved,"secret"))!=J.S(payload,"key"))return;var actual=Validate(saved);if(J.S(actual,"baseURL")!=J.S(payload,"baseURL")||J.S(actual,"api")!=J.S(payload,"api"))return;var cache=Cache();cache[J.S(payload,"provider")]=J.O("signature",CacheIdentity(saved),"models",J.Get(result,"models"),"updatedAt",DateTime.UtcNow.ToString("o"));Directory.CreateDirectory(folder);Files.Atomic(CacheFile,J.Text(J.O("schemaVersion",1,"providers",cache)));}catch{}}
  }
  public void StartModelRefresh(){if(Interlocked.Exchange(ref refreshStarted,1)!=0)return;if(!File.Exists(Path.Combine(Files.Root,"ai-runtime","worker.mjs")))return;refreshing=true;refreshTask=RefreshModels();}
  async Task RefreshModels(){try{await Task.Delay(1500);object[] profiles;lock(gate)profiles=J.D(J.Get(Read(),"profiles")).Values.Where(p=>J.S(p,"secret")!="").Select(p=>(object)new Dictionary<string,object>(J.D(p))).ToArray();using(var slots=new SemaphoreSlim(2)){await Task.WhenAll(profiles.Select(async p=>{await slots.WaitAsync();try{if(refreshStopped)return;var request=J.D(p);request["expectedConfiguration"]=CacheIdentity(p);request.Remove("secret");request["sessionId"]=Guid.NewGuid().ToString();await Run(request,"models");}catch{}finally{slots.Release();}}));}}catch{}finally{refreshing=false;}}
  public void StopModelRefresh(){refreshStopped=true;refreshCancellation.Cancel();}
 }
}

using System;using System.Collections.Generic;using System.IO;using System.Text;using System.Reflection;using System.Threading.Tasks;using NativeVideo;
class RuntimeContractChecks {
 static HttpResponse Call(QueueService service,HttpRequest request){return ((Task<HttpResponse>)typeof(QueueService).GetMethod("Authorized",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(service,new object[]{request})).GetAwaiter().GetResult();}
 static int Main(){string root=Path.Combine(Path.GetTempPath(),"craft-request-contract-"+Guid.NewGuid().ToString("N"));try{
  string games=Path.Combine(root,"games"),project=Path.Combine(games,"fixture"),state=Path.Combine(root,"state");Directory.CreateDirectory(Path.Combine(project,"game","scene"));Directory.CreateDirectory(state);File.WriteAllText(Path.Combine(project,"game","scene","start.txt"),"A:test;\n");
  object config=J.O("stateDir",state,"gamesRoot",games,"terreDir",Path.Combine(root,"host"),"outputDir",Path.Combine(root,"out"),"workDir",Path.Combine(root,"work"),"importLegacyUserData",false,"autoRefreshAiModels",false,"automaticBackups",false,"requireRuntimeParity",true);
  J.Write(Path.Combine(state,"settings.json"),J.O("engine","mygo"));
  var service=new QueueService(config);
  // Exercise real request construction/serialization while preventing the test from spawning a renderer.
  typeof(QueueService).GetField("stopping",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(service,true);
  var request=new HttpRequest{Method="POST",Path="/api/timing",Body=Encoding.UTF8.GetBytes(J.Text(J.O("project","fixture","scene","start.txt","sourceText","A:test;\n","expectedRuntimeVersion","4.6.5","runtimeStartup",J.O("language",2,"source","preview"),"settings",J.O("gpuRawMode","traditional"))))};
  var task=(Task<HttpResponse>)typeof(QueueService).GetMethod("Authorized",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(service,new object[]{request});var response=task.GetAwaiter().GetResult();
  if(response.Status!=200)throw new Exception("Queue rejected test request: "+J.Text(response.Json));
  var paths=Directory.GetFiles(Path.Combine(state,"jobs"),"request.json",SearchOption.AllDirectories);if(paths.Length!=1)throw new Exception("Expected one persisted queue request");
  var persisted=J.Read(paths[0]);if(!J.B(persisted,"requireRuntimeParity")||J.S(persisted,"expectedRuntimeVersion")!="4.6.5"||J.S(persisted,"expectedRuntimeId")!="open-webgal.webgal")throw new Exception("Runtime contract was lost before request.json serialization");
  if(J.N(J.Get(persisted,"runtimeStartup"),"language",-1)!=2||J.S(J.Get(persisted,"runtimeStartup"),"source")!="preview")throw new Exception("Queued preview language was lost");
  if(J.S(J.Get(persisted,"settings"),"engine")!="webgal"||J.S(persisted,"engineRoot")!=project||!string.IsNullOrEmpty(J.S(persisted,"mygoRoot")))throw new Exception("Strict queue selected a foreign engine");
  var configResponse=Call(service,new HttpRequest{Method="GET",Path="/api/config"});
  if(J.S(J.Get(configResponse.Json,"settings"),"engine")!="webgal"||J.A(J.Get(configResponse.Json,"engineOptions")).Count!=1)throw new Exception("Machine MyGO preference leaked into Craft config");
  foreach(string version in new[]{"4.6.4",""}){
   var rejected=new HttpRequest{Method="POST",Path="/api/timing",Body=Encoding.UTF8.GetBytes(J.Text(J.O("project","fixture","scene","start.txt","expectedRuntimeVersion",version,"settings",J.O("engine",version==""?"webgal":"mygo","gpuRawMode","traditional"))))};
   bool failed=false;try{Call(service,rejected);}catch(IOException){failed=true;}
   if(!failed)throw new Exception("Strict queue accepted noncanonical or missing engine contract");
  }
  if(Directory.GetFiles(Path.Combine(state,"jobs"),"request.json",SearchOption.AllDirectories).Length!=1)throw new Exception("Rejected request created a runnable job");
  var mygoBody=J.O("project","fixture","scene","start.txt","sourceText","A:test;\n","expectedRuntimeId","webgal-mygo.mygo","expectedRuntimeVersion","3.2.1","expectedWebgalVersion","4.6.4","runtimeStartup",J.O("language",2,"source","preview"),"settings",J.O("engine","mygo","gpuRawMode","traditional"));
  var mygoResponse=Call(service,new HttpRequest{Method="POST",Path="/api/timing",Body=Encoding.UTF8.GetBytes(J.Text(mygoBody))});if(mygoResponse.Status!=200)throw new Exception("MyGO queue rejected bound contract");
  var allPaths=Directory.GetFiles(Path.Combine(state,"jobs"),"request.json",SearchOption.AllDirectories);if(allPaths.Length!=2)throw new Exception("Expected official and MyGO persisted requests");
  object mygoPersisted=null;foreach(string path in allPaths){var item=J.Read(path);if(J.S(item,"expectedRuntimeId")=="webgal-mygo.mygo")mygoPersisted=item;}
  if(mygoPersisted==null||J.S(mygoPersisted,"expectedRuntimeVersion")!="3.2.1"||J.S(mygoPersisted,"expectedWebgalVersion")!="4.6.4"||J.S(J.Get(mygoPersisted,"settings"),"engine")!="mygo"||J.S(mygoPersisted,"engineRoot")!=project||!string.IsNullOrEmpty(J.S(mygoPersisted,"mygoRoot")))throw new Exception("Queue lost MyGO identity or searched a foreign runtime");
  foreach(string fault in new[]{"expectedRuntimeId","expectedRuntimeVersion","expectedWebgalVersion"}){var bad=new Dictionary<string,object>(mygoBody);bad[fault]=fault=="expectedRuntimeId"?"open-webgal.webgal":fault=="expectedRuntimeVersion"?"4.6.4":"4.6.5";bool failed=false;try{Call(service,new HttpRequest{Method="POST",Path="/api/timing",Body=Encoding.UTF8.GetBytes(J.Text(bad))});}catch(IOException){failed=true;}if(!failed)throw new Exception("Invalid MyGO queue contract passed: "+fault);}
  if(Directory.GetFiles(Path.Combine(state,"jobs"),"request.json",SearchOption.AllDirectories).Length!=2)throw new Exception("Invalid MyGO contract created a runnable job");
  if(File.Exists(Path.Combine(state,"legacy-user-data-import.json")))throw new Exception("Craft imported legacy user data");
  foreach(string kind in new[]{"analysis","audio","full"}){
   string job=Path.Combine(root,"cached-"+kind),planning=Path.Combine(job,"planning");Directory.CreateDirectory(Path.Combine(planning,"prepared"));
   var cached=new Dictionary<string,object>(J.D(persisted));cached["jobDir"]=job;cached["recordDir"]=job;cached["output"]=Path.Combine(root,"rejected-"+kind+".mp4");cached["retry"]=true;cached["analysisOnly"]=kind=="analysis";cached["exportKind"]=kind=="analysis"?"full":kind;cached["gpuRawExport"]=false;
   string revision=(string)typeof(JobRunner).GetField("PipelineRevision",BindingFlags.Static|BindingFlags.NonPublic).GetRawConstantValue();
   J.Write(Path.Combine(planning,"native-version.json"),J.O("version",VersionInfo.Kernel,"pipelineRevision",revision));J.Write(Path.Combine(planning,"timing-plan.json"),J.O());J.Write(Path.Combine(planning,"envelopes.json"),J.O());
   J.Write(Path.Combine(planning,"prepared/plan.json"),J.O("engine",J.O("id","mygo","version","3.2.1","runtimeParity",false,"sourceKind","mygo-derivative-runtime")));
   bool failed=false;try{new JobRunner(cached).Run().GetAwaiter().GetResult();}catch(IOException){failed=true;}
   if(!failed||J.S(J.Read(Path.Combine(job,"status.json")),"state")!="failed"||File.Exists(J.S(cached,"output")))throw new Exception("Cached wrong engine completed "+kind);
  }
  Console.WriteLine("Real queue preserves strict canonical engine/version, rejects mismatched requests; cached wrong-engine analysis/audio/video all fail before execution.");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}finally{try{Directory.Delete(root,true);}catch{}}}
}

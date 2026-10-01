using System;using System.IO;using System.Text;using System.Reflection;using System.Threading.Tasks;using NativeVideo;
class RuntimeContractChecks {
 static int Main(){string root=Path.Combine(Path.GetTempPath(),"craft-request-contract-"+Guid.NewGuid().ToString("N"));try{
  string games=Path.Combine(root,"games"),project=Path.Combine(games,"fixture"),state=Path.Combine(root,"state");Directory.CreateDirectory(Path.Combine(project,"game","scene"));Directory.CreateDirectory(state);File.WriteAllText(Path.Combine(project,"game","scene","start.txt"),"A:test;\n");
  object config=J.O("stateDir",state,"gamesRoot",games,"terreDir",Path.Combine(root,"host"),"outputDir",Path.Combine(root,"out"),"workDir",Path.Combine(root,"work"),"importLegacyUserData",false,"autoRefreshAiModels",false,"automaticBackups",false,"requireRuntimeParity",true);
  var service=new QueueService(config);
  // Exercise real request construction/serialization while preventing the test from spawning a renderer.
  typeof(QueueService).GetField("stopping",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(service,true);
  var request=new HttpRequest{Method="POST",Path="/api/timing",Body=Encoding.UTF8.GetBytes(J.Text(J.O("project","fixture","scene","start.txt","sourceText","A:test;\n","expectedRuntimeVersion","4.6.5","settings",J.O("gpuRawMode","traditional"))))};
  var task=(Task<HttpResponse>)typeof(QueueService).GetMethod("Authorized",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(service,new object[]{request});var response=task.GetAwaiter().GetResult();
  if(response.Status!=200)throw new Exception("Queue rejected test request: "+J.Text(response.Json));
  var paths=Directory.GetFiles(Path.Combine(state,"jobs"),"request.json",SearchOption.AllDirectories);if(paths.Length!=1)throw new Exception("Expected one persisted queue request");
  var persisted=J.Read(paths[0]);if(!J.B(persisted,"requireRuntimeParity")||J.S(persisted,"expectedRuntimeVersion")!="4.6.5")throw new Exception("Runtime contract was lost before request.json serialization");
  Console.WriteLine("Real QueueService request.json preserves strict runtime parity and expected version.");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}finally{try{Directory.Delete(root,true);}catch{}}}
}

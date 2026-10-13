using System;using System.IO;using System.Diagnostics;using System.Reflection;using NativeVideo;
class QueueCancellationRecoveryChecks {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static int Main(string[] args){
  string root=Path.GetFullPath(args[0]),state=Path.Combine(root,"state"),cache=Path.Combine(root,"work"),id=Guid.NewGuid().ToString(),record=Path.Combine(state,"jobs",id),work=Path.Combine(cache,id),output=Path.Combine(root,"output","recovery.mp4");
  Directory.CreateDirectory(record);Directory.CreateDirectory(work);Directory.CreateDirectory(Path.GetDirectoryName(output));
  var req=J.O("id",id,"project",Path.Combine(root,"game"),"recordDir",record,"jobDir",work,"cacheRoot",cache,"output",output);
  J.Write(Path.Combine(record,"request.json"),req);string partial=OwnedTemporaryOutput.Create(req,".webvideo-",".mp4");File.WriteAllText(partial,"owned partial");File.WriteAllText(output,"completed neighbor");
  var config=J.O("stateDir",state,"gamesRoot",Path.Combine(root,"games"),"terreDir",Path.Combine(root,"host"),"workDir",cache,"outputDir",Path.GetDirectoryName(output),"importLegacyUserData",false,"autoRefreshAiModels",false,"automaticBackups",false,"requireRuntimeParity",true);
  var self=Process.GetCurrentProcess();string started=self.StartTime.ToUniversalTime().ToString("o");
  J.Write(Path.Combine(record,"status.json"),J.O("state","canceled","phase","canceling","cleanupComplete",false,"runnerPid",self.Id,"runnerStartedAt",started));
  var waiting=new QueueService(config);var held=(Process)typeof(QueueService).GetField("active",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(waiting);
  Check(held!=null&&held.Id==self.Id,"Live recorded runner must retain the queue slot");Check(File.Exists(partial),"Live runner partial was cleaned prematurely");held.Dispose();
  J.Write(Path.Combine(record,"status.json"),J.O("state","canceled","phase","cleanup","cleanupComplete",false,"runnerPid",self.Id,"runnerStartedAt",self.StartTime.ToUniversalTime().AddDays(-1).ToString("o")));
  var recovered=new QueueService(config);var status=J.Read(Path.Combine(record,"status.json"));
  Check(J.S(status,"phase")=="canceled"&&J.B(status,"cleanupComplete"),"Stopped runner recovery did not reach cleanup terminal");Check(!File.Exists(partial),"Stopped runner partial was retained");Check(File.ReadAllText(output)=="completed neighbor","Completed output changed during recovery");
  Check(typeof(QueueService).GetField("active",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(recovered)==null,"PID reuse kept an unrelated process active");
  Console.WriteLine("PASS actual QueueService cancellation recovery: live runner wait, PID-start identity, exact owned partial cleanup, completed output preservation");return 0;
 }
}

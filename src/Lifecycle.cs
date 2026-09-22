using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Diagnostics;using System.Threading.Tasks;
namespace NativeVideo {
 public static class Lifecycle {
  static async Task<bool> ServiceHealthy(object config){
   try{
    string terre=J.S(config,"terreDir"),file=Path.Combine(terre,"public/assets/video-export-service.json");var discovery=J.TryRead(file);string baseUrl=J.S(discovery,"baseUrl");Uri uri;
    if(!Uri.TryCreate(baseUrl,UriKind.Absolute,out uri)||uri.Scheme!="http"||!new[]{"localhost","127.0.0.1"}.Contains(uri.Host))return false;
    int pid=(int)J.N(discovery,"pid");if(pid>0&&!Commands.Alive(pid))return false;
    var health=await Integration.LocalGet(new Uri(uri,"/health").ToString(),700);if(J.S(health,"app")!="webgal-video-exporter")return false;
    string expected=J.S(discovery,"serviceId"),actual=J.S(health,"serviceId");return expected==""||actual==""||expected==actual;
   }catch{return false;}
  }
  static async Task<bool> ExistingReady(object config){
   try{var identity=await Integration.LocalGet(new Uri(new Uri(J.S(config,"terreUrl")),"/assets/video-export-instance.json").ToString(),700);return J.S(identity,"id")==J.S(config,"instanceId")&&await ServiceHealthy(config);}catch{return false;}
  }
  static async Task<int> CurrentTerreListenerPid(object config){
   try{
    var baseUri=new Uri(J.S(config,"terreUrl"));var identity=await Integration.LocalGet(new Uri(baseUri,"/assets/video-export-instance.json").ToString(),700);if(J.S(identity,"id")!=J.S(config,"instanceId"))return 0;int port=baseUri.Port;
    var net=(await Commands.Run("netstat",new[]{"-ano","-p","tcp"},null,10000)).Text;foreach(var line in net.Split('\n')){var p=System.Text.RegularExpressions.Regex.Split(line.Trim(),@"\s+");int pid;if(p.Length>=5&&p[0]=="TCP"&&p[1].EndsWith(":"+port)&&p[3]=="LISTENING"&&int.TryParse(p[4],out pid)&&pid>0)return pid;}
   }catch{}return 0;
  }
  static async Task<bool> ReuseExisting(object config,string state,string control,int pid){
   string lifeFile=Path.Combine(state,"lifecycle.json");
   for(int i=0;i<32;i++){
    if(!Commands.Alive(pid))return false;
    bool requestedStop=J.S(J.TryRead(control),"action")=="stop";
    if(requestedStop){
     for(int n=0;n<20&&Commands.Alive(pid);n++)await Task.Delay(250);
     if(!Commands.Alive(pid))return false;
     break;
    }
    if(await ExistingReady(config)){
     bool stable=true;
     for(int n=0;n<3;n++){
      await Task.Delay(300);
      if(!Commands.Alive(pid)||J.S(J.TryRead(control),"action")=="stop"){stable=false;break;}
      if(!await ExistingReady(config)){stable=false;break;}
     }
     if(stable){NativeDialogs.Open(J.S(config,"terreUrl"));return true;}
    }
    await Task.Delay(250);
   }
   if(!Commands.Alive(pid))return false;
   if(J.S(J.TryRead(control),"action")!="stop")J.Write(control,J.O("action","stop","reason","restart-takeover","requestedBy",Process.GetCurrentProcess().Id,"requestedAt",DateTime.UtcNow.ToString("o")));
   for(int i=0;i<40&&Commands.Alive(pid);i++)await Task.Delay(250);
   if(Commands.Alive(pid))throw new IOException("旧 Terre 实例未能完成退出，请关闭该实例后重试。");
   return false;
  }
  static void CleanupOwned(string file,int pid,string serviceId){
   if(pid<=0&&string.IsNullOrWhiteSpace(serviceId))return;try{var current=J.TryRead(file);bool owned=!string.IsNullOrWhiteSpace(serviceId)?J.S(current,"serviceId")==serviceId:(int)J.N(current,"pid")==pid;if(owned&&File.Exists(file))File.Delete(file);}catch{}
  }
  static string ServiceIdFor(string terre,string state){
   string id=J.S(J.TryRead(Path.Combine(state,"service-state.json")),"serviceId");if(id=="")id=J.S(J.TryRead(Path.Combine(terre,"public/assets/video-export-service.json")),"serviceId");return id;
  }
  static void CleanupServiceFiles(string terre,string state,int pid,string serviceId){
   CleanupOwned(Path.Combine(terre,"public/assets/video-export-service.json"),pid,serviceId);CleanupOwned(Path.Combine(state,"service-state.json"),pid,serviceId);
  }
  static async Task CleanupStaleServiceFiles(object config,string state){
   string discovery=Path.Combine(J.S(config,"terreDir"),"public/assets/video-export-service.json");var oldDiscovery=J.TryRead(discovery);string discoveryId=J.S(oldDiscovery,"serviceId");bool healthy=oldDiscovery!=null&&await ServiceHealthy(config);
   if(oldDiscovery!=null&&!healthy)try{File.Delete(discovery);}catch{}
   string stateFile=Path.Combine(state,"service-state.json");var oldState=J.TryRead(stateFile);int pid=(int)J.N(oldState,"pid");bool dead=pid>0&&!Commands.Alive(pid),sameStaleService=!healthy&&discoveryId!=""&&J.S(oldState,"serviceId")==discoveryId;if(dead||sameStaleService)try{if(File.Exists(stateFile))File.Delete(stateFile);}catch{}
  }
  public static async Task Run(){
   string configFile=Files.Full(App.Arg("--config")),backend=Files.Full(App.Arg("--backend"));var config=J.D(J.Read(configFile));string terre=Path.GetDirectoryName(backend),state=J.S(config,"stateDir");Directory.CreateDirectory(state);config["terreDir"]=terre;config["sourcePackageRoot"]=Files.Root;Commands.RuntimePath=J.S(config,"runtimePath");int wrapperPid;if(!int.TryParse(App.Arg("--wrapper-pid","0"),out wrapperPid))wrapperPid=0;
   string environmentPort=Environment.GetEnvironmentVariable("WEBGAL_PORT");int portValue;if(int.TryParse(environmentPort,out portValue)){var address=new UriBuilder(J.S(config,"terreUrl")){Port=portValue+1};config["terreUrl"]=address.Uri.ToString();var alt=new UriBuilder(address.Uri){Host=address.Host=="localhost"?"127.0.0.1":"localhost"};config["allowedOrigins"]=new[]{address.Uri.GetLeftPart(UriPartial.Authority),alt.Uri.GetLeftPart(UriPartial.Authority)};}
   string lockFile=Path.Combine(state,"lifecycle.lock"),control=Path.Combine(state,"lifecycle-control.json"),logFile=Path.Combine(state,"lifecycle.log"),session=Path.Combine(state,"runtime-session.json");Action<object> log=o=>{try{Files.Append(logFile,o);}catch{}};
   FileStream lockHandle=null;
   for(int attempt=0;attempt<80&&lockHandle==null;attempt++){
    var old=J.TryRead(lockFile);int oldPid=(int)J.N(old,"pid");
    if(Commands.Alive(oldPid)){
     if(await ReuseExisting(config,state,control,oldPid))return;
     if(Commands.Alive(oldPid))throw new IOException("旧 Terre 实例仍在退出，请稍后重试。");
     await Task.Delay(50);continue;
    }
    bool deleteLockFailed=false;
    if(File.Exists(lockFile))try{File.Delete(lockFile);}catch(IOException){deleteLockFailed=true;}
    if(deleteLockFailed){await Task.Delay(100);continue;}
    bool createLockFailed=false;
    try{
     lockHandle=new FileStream(lockFile,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.Read);
     var bytes=Files.Utf8.GetBytes(J.Text(J.O("pid",Process.GetCurrentProcess().Id,"instanceId",J.S(config,"instanceId"),"startedAt",DateTime.UtcNow.ToString("o"))));lockHandle.Write(bytes,0,bytes.Length);lockHandle.Flush();
    }catch(IOException){if(lockHandle!=null){lockHandle.Dispose();lockHandle=null;}createLockFailed=true;}
    if(createLockFailed)await Task.Delay(100);
   }
   if(lockHandle==null)throw new IOException("无法取得 Terre 生命周期锁，请稍后重试。");
   Process backendProcess=null,service=null;int backendPid=0,restarts=0,servicePid=0;bool stopBackend=false;Stopwatch backendMissing=null;
   try{
    if(File.Exists(control))File.Delete(control);await CleanupStaleServiceFiles(config,state);J.Write(session,config);
    bool attach=false;try{var identity=await Integration.LocalGet(new Uri(new Uri(J.S(config,"terreUrl")),"/assets/video-export-instance.json").ToString());attach=J.S(identity,"id")==J.S(config,"instanceId");}catch{}
    if(attach){backendPid=await CurrentTerreListenerPid(config);if(backendPid==0)throw new IOException("无法确认这份 Terre 的监听进程");}
    else{int at=Array.IndexOf(App.Args,"--");var args=at<0?new string[0]:App.Args.Skip(at+1).ToArray();backendProcess=Process.Start(new ProcessStartInfo(backend,string.Join(" ",args.Select(Commands.Quote))){WorkingDirectory=terre,UseShellExecute=false,CreateNoWindow=J.B(config,"hideBackendWindow")});backendPid=backendProcess.Id;}
    log(J.O("at",DateTime.UtcNow.ToString("o"),"phase",attach?"attached":"backend-started","backendPid",backendPid));
    while(true){
     if(wrapperPid>0&&!Commands.Alive(wrapperPid)){stopBackend=true;if(!Commands.Alive(backendPid)){int adopted=await CurrentTerreListenerPid(config);if(adopted>0)backendPid=adopted;}log(J.O("at",DateTime.UtcNow.ToString("o"),"phase","wrapper-exited","wrapperPid",wrapperPid,"backendPid",backendPid));break;}
     if(J.S(J.TryRead(control),"action")=="stop"){stopBackend=true;if(!Commands.Alive(backendPid)){int adopted=await CurrentTerreListenerPid(config);if(adopted>0)backendPid=adopted;}break;}
     if(!Commands.Alive(backendPid)){
      if(backendMissing==null)backendMissing=Stopwatch.StartNew();int previousPid=backendPid,adopted=await CurrentTerreListenerPid(config);
      if(adopted>0){backendPid=adopted;backendMissing=null;if(backendProcess!=null&&backendProcess.HasExited){backendProcess.Dispose();backendProcess=null;}log(J.O("at",DateTime.UtcNow.ToString("o"),"phase","backend-adopted","fromPid",previousPid,"backendPid",backendPid));}
      else{if(backendMissing.Elapsed.TotalSeconds>=8){log(J.O("at",DateTime.UtcNow.ToString("o"),"phase","backend-gone","backendPid",previousPid));break;}await Task.Delay(250);continue;}
     }else backendMissing=null;
     if(service==null||service.HasExited){
      if(service!=null){int exitedPid=servicePid;string exitedServiceId=ServiceIdFor(terre,state);service.Dispose();service=null;CleanupServiceFiles(terre,state,exitedPid,exitedServiceId);await CleanupStaleServiceFiles(config,state);if(restarts++>=3)throw new IOException("导出服务连续启动失败，请查看 service-error.log");}
      service=Commands.Start(Files.Exe,new[]{"service","--config",session,"--error-log",Path.Combine(state,"service-error.log")});servicePid=service.Id;service.OutputDataReceived+=(s,e)=>{if(e.Data!=null)Files.Append(Path.Combine(state,"service.log"),J.O("message",e.Data));};service.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)Files.Append(Path.Combine(state,"service.log"),J.O("error",e.Data));};service.BeginOutputReadLine();service.BeginErrorReadLine();log(J.O("at",DateTime.UtcNow.ToString("o"),"phase","service-started","guardPid",servicePid));
     }
     var serviceState=J.TryRead(Path.Combine(state,"service-state.json"));J.Write(Path.Combine(state,"lifecycle.json"),J.O("pid",Process.GetCurrentProcess().Id,"wrapperPid",wrapperPid,"backendPid",backendPid,"serviceGuardPid",servicePid,"servicePid",J.Get(serviceState,"pid"),"serviceId",J.Get(serviceState,"serviceId"),"terreDir",terre,"terreUrl",J.S(config,"terreUrl"),"version",VersionInfo.Kernel,"updatedAt",DateTime.UtcNow.ToString("o")));await Task.Delay(500);
    }
   }catch(Exception e){log(J.O("phase","failed","message",e.Message));throw;}
   finally{
    string stoppingServiceId=ServiceIdFor(terre,state);if(service!=null){try{if(!service.HasExited){service.Kill();service.WaitForExit(3000);}}catch{}try{service.Dispose();}catch{}}CleanupServiceFiles(terre,state,servicePid,stoppingServiceId);await CleanupStaleServiceFiles(config,state);
    if(stopBackend&&Commands.Alive(backendPid)){using(var p=Process.Start(new ProcessStartInfo("taskkill.exe","/PID "+backendPid+" /F"){UseShellExecute=false,CreateNoWindow=true})){p.WaitForExit(5000);}}
    if(backendProcess!=null)backendProcess.Dispose();
    if(lockHandle!=null){lockHandle.Dispose();lockHandle=null;}if(File.Exists(lockFile)&&J.N(J.TryRead(lockFile),"pid")==Process.GetCurrentProcess().Id)try{File.Delete(lockFile);}catch{}
    log(J.O("at",DateTime.UtcNow.ToString("o"),"phase","stopped"));
   }
  }
 }
}

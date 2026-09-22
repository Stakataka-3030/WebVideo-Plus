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
    var life=J.TryRead(lifeFile);if((int)J.N(life,"pid")==pid){int backendPid=(int)J.N(life,"backendPid");if(backendPid>0&&!Commands.Alive(backendPid))break;}
    await Task.Delay(250);
   }
   if(!Commands.Alive(pid))return false;
   if(J.S(J.TryRead(control),"action")!="stop")J.Write(control,J.O("action","stop","reason","restart-takeover","requestedBy",Process.GetCurrentProcess().Id,"requestedAt",DateTime.UtcNow.ToString("o")));
   for(int i=0;i<40&&Commands.Alive(pid);i++)await Task.Delay(250);
   if(Commands.Alive(pid))throw new IOException("旧 Terre 实例未能完成退出，请关闭该实例后重试。");
   return false;
  }
  static void CleanupOwned(string file,int pid){
   if(pid<=0)return;try{var current=J.TryRead(file);if((int)J.N(current,"pid")==pid&&File.Exists(file))File.Delete(file);}catch{}
  }
  static void CleanupServiceFiles(string terre,string state,int pid){
   CleanupOwned(Path.Combine(terre,"public/assets/video-export-service.json"),pid);CleanupOwned(Path.Combine(state,"service-state.json"),pid);
  }
  static async Task CleanupStaleServiceFiles(object config,string state){
   string discovery=Path.Combine(J.S(config,"terreDir"),"public/assets/video-export-service.json");
   if(File.Exists(discovery)&&!await ServiceHealthy(config))try{File.Delete(discovery);}catch{}
   string stateFile=Path.Combine(state,"service-state.json");var oldState=J.TryRead(stateFile);int pid=(int)J.N(oldState,"pid");if(pid>0&&!Commands.Alive(pid))try{File.Delete(stateFile);}catch{}
  }
  public static async Task Run(){
   string configFile=Files.Full(App.Arg("--config")),backend=Files.Full(App.Arg("--backend"));var config=J.D(J.Read(configFile));string terre=Path.GetDirectoryName(backend),state=J.S(config,"stateDir");Directory.CreateDirectory(state);config["terreDir"]=terre;config["sourcePackageRoot"]=Files.Root;Commands.RuntimePath=J.S(config,"runtimePath");
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
   Process backendProcess=null,service=null;int backendPid=0,restarts=0,servicePid=0;bool stopBackend=false;
   try{
    if(File.Exists(control))File.Delete(control);await CleanupStaleServiceFiles(config,state);J.Write(session,config);
    bool attach=false;try{var identity=await Integration.LocalGet(new Uri(new Uri(J.S(config,"terreUrl")),"/assets/video-export-instance.json").ToString());attach=J.S(identity,"id")==J.S(config,"instanceId");}catch{}
    if(attach){int port=new Uri(J.S(config,"terreUrl")).Port;var net=(await Commands.Run("netstat",new[]{"-ano","-p","tcp"},null,10000)).Text;foreach(var line in net.Split('\n')){var p=System.Text.RegularExpressions.Regex.Split(line.Trim(),@"\s+");if(p.Length>=5&&p[0]=="TCP"&&p[1].EndsWith(":"+port)&&p[3]=="LISTENING"){backendPid=int.Parse(p[4]);break;}}if(backendPid==0)throw new IOException("无法确认这份 Terre 的监听进程");}
    else{int at=Array.IndexOf(App.Args,"--");var args=at<0?new string[0]:App.Args.Skip(at+1).ToArray();backendProcess=Process.Start(new ProcessStartInfo(backend,string.Join(" ",args.Select(Commands.Quote))){WorkingDirectory=terre,UseShellExecute=false,CreateNoWindow=J.B(config,"hideBackendWindow")});backendPid=backendProcess.Id;}
    log(J.O("at",DateTime.UtcNow.ToString("o"),"phase",attach?"attached":"backend-started","backendPid",backendPid));
    while(Commands.Alive(backendPid)){
     if(J.S(J.TryRead(control),"action")=="stop"){stopBackend=true;break;}
     if(service==null||service.HasExited){
      if(service!=null){int exitedPid=servicePid;service.Dispose();service=null;CleanupServiceFiles(terre,state,exitedPid);if(restarts++>=3)throw new IOException("导出服务连续启动失败，请查看 service-error.log");}
      service=Commands.Start(Files.Exe,new[]{"service","--config",session,"--error-log",Path.Combine(state,"service-error.log")});servicePid=service.Id;service.OutputDataReceived+=(s,e)=>{if(e.Data!=null)Files.Append(Path.Combine(state,"service.log"),J.O("message",e.Data));};service.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)Files.Append(Path.Combine(state,"service.log"),J.O("error",e.Data));};service.BeginOutputReadLine();service.BeginErrorReadLine();log(J.O("at",DateTime.UtcNow.ToString("o"),"phase","service-started","pid",servicePid));
     }
     J.Write(Path.Combine(state,"lifecycle.json"),J.O("pid",Process.GetCurrentProcess().Id,"wrapperPid",int.Parse(App.Arg("--wrapper-pid","0")),"backendPid",backendPid,"servicePid",servicePid,"terreDir",terre,"terreUrl",J.S(config,"terreUrl"),"version",VersionInfo.Kernel,"updatedAt",DateTime.UtcNow.ToString("o")));await Task.Delay(500);
    }
   }catch(Exception e){log(J.O("phase","failed","message",e.Message));throw;}
   finally{
    if(service!=null){try{if(!service.HasExited)service.Kill();}catch{}try{service.Dispose();}catch{}}CleanupServiceFiles(terre,state,servicePid);
    if(stopBackend&&Commands.Alive(backendPid)){using(var p=Process.Start(new ProcessStartInfo("taskkill.exe","/PID "+backendPid+" /T /F"){UseShellExecute=false,CreateNoWindow=true})){p.WaitForExit(5000);}}
    if(backendProcess!=null)backendProcess.Dispose();
    if(lockHandle!=null){lockHandle.Dispose();lockHandle=null;}if(File.Exists(lockFile)&&J.N(J.TryRead(lockFile),"pid")==Process.GetCurrentProcess().Id)try{File.Delete(lockFile);}catch{}
    log(J.O("at",DateTime.UtcNow.ToString("o"),"phase","stopped"));
   }
  }
 }
}

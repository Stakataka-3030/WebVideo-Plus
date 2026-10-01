using System;
using System.IO;
using System.Diagnostics;
using System.Management;
using System.Threading;
using System.Web.Script.Serialization;
// Session-bound read-only observer. No persistent WMI objects, services or hooks.
class InstallerObserver {
 static readonly object gate=new object();
 static readonly JavaScriptSerializer json=new JavaScriptSerializer();
 static void Emit(object value){lock(gate){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}}
 static int Main(string[] args){try{
  if(args.Length!=4)throw new ArgumentException("Expected host PID, version, app name, timeout seconds");
  int hostPid,seconds;if(!Int32.TryParse(args[0],out hostPid)||hostPid<=0||!Int32.TryParse(args[3],out seconds)||seconds<1||seconds>1800)throw new ArgumentException("Invalid observer scope");
  string version=args[1],app=args[2];
  if(!System.Text.RegularExpressions.Regex.IsMatch(version,@"^[0-9A-Za-z.+-]+$")||!System.Text.RegularExpressions.Regex.IsMatch(app,@"^[0-9A-Za-z ._-]+$"))throw new ArgumentException("Invalid version or application name");
  using(var host=Process.GetProcessById(hostPid)){
   IntPtr hostHandle=host.Handle;
   DateTime hostStart=host.StartTime.ToUniversalTime(),armed=DateTime.UtcNow,deadline=armed.AddSeconds(seconds);
   string temp=Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar),prefix=app+"-"+version+"-updater-";
   Process candidate=null;string candidatePath=null;DateTime candidateStart=DateTime.MinValue;
   using(var ready=new ManualResetEvent(false))using(var watcher=new ManagementEventWatcher(new WqlEventQuery("SELECT * FROM Win32_ProcessStartTrace WHERE ParentProcessID = "+hostPid))){
    watcher.EventArrived+=(sender,ev)=>{
     Process p=null;
     try{
      int pid=Convert.ToInt32(ev.NewEvent["ProcessID"]);if(pid<=0||pid==hostPid)return;
      p=Process.GetProcessById(pid);IntPtr handle=p.Handle;
      DateTime started=p.StartTime.ToUniversalTime();if(started<armed||started<hostStart)return;
      if(host.HasExited&&started>host.ExitTime.ToUniversalTime())return;
      string file=Path.GetFullPath(p.MainModule.FileName),directory=Path.GetDirectoryName(file);
      if(!String.Equals(Path.GetDirectoryName(directory),temp,StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(directory).StartsWith(prefix,StringComparison.OrdinalIgnoreCase)||!file.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))return;
      lock(gate){if(candidate!=null)return;candidate=p;p=null;candidatePath=file;candidateStart=started;}
      Emit(new{state="observed",pid=candidate.Id,parentPid=hostPid,path=file,startedAt=started.ToString("o")});ready.Set();
     }catch(Exception){/* A short-lived or uninspectable child cannot prove success. */}
     finally{if(p!=null)p.Dispose();}
    };
    watcher.Start();Emit(new{state="armed",hostPid=hostPid,hostStartedAt=hostStart.ToString("o")});
    bool seen=ready.WaitOne(TimeSpan.FromSeconds(seconds));watcher.Stop();
    if(!seen){Emit(new{state="indeterminate",reason="No matching child process handle was obtained"});return 2;}
    using(candidate){int remaining=(int)Math.Max(1,(deadline-DateTime.UtcNow).TotalMilliseconds);
     if(!candidate.WaitForExit(remaining)){Emit(new{state="indeterminate",reason="Installer is still running",pid=candidate.Id});return 2;}
     int code=candidate.ExitCode;Emit(new{state="exited",pid=candidate.Id,parentPid=hostPid,exitCode=code,path=candidatePath,startedAt=candidateStart.ToString("o")});return code==0?0:1;
    }
   }
  }
 }catch(Exception e){Emit(new{state="indeterminate",reason=e.Message});return 2;}}
}

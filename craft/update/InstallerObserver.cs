using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
// Deadline-bound, read-only process observer. Toolhelp snapshots require no WMI
// subscription, elevation, service, persistent hook or process termination.
class InstallerObserver {
 static readonly JavaScriptSerializer json=new JavaScriptSerializer();
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Entry {
  public uint size,usage,pid;public UIntPtr heap;public uint module,threads,parent;public int priority;public uint flags;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string name;
 }
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool Process32FirstW(IntPtr snapshot,ref Entry entry);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool Process32NextW(IntPtr snapshot,ref Entry entry);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 static void Emit(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
 static bool Same(string a,string b){return String.Equals(Path.GetFullPath(a),Path.GetFullPath(b),StringComparison.OrdinalIgnoreCase);}
 static Process FindChild(int hostPid,DateTime armed,DateTime hostStart,Process host,string temp,string prefix,out string file,out DateTime started){
  file=null;started=DateTime.MinValue;IntPtr snapshot=CreateToolhelp32Snapshot(2,0);if(snapshot==new IntPtr(-1))throw new IOException("Cannot enumerate process ancestry");
  try{var entry=new Entry();entry.size=(uint)Marshal.SizeOf(typeof(Entry));if(!Process32FirstW(snapshot,ref entry))throw new IOException("Cannot read process snapshot");
   do{if(entry.parent!=(uint)hostPid||entry.pid==0||entry.pid==(uint)hostPid)continue;Process p=null;
    try{p=Process.GetProcessById((int)entry.pid);IntPtr handle=p.Handle;DateTime start=p.StartTime.ToUniversalTime();if(start<armed||start<hostStart)continue;if(host.HasExited&&start>host.ExitTime.ToUniversalTime())continue;
     string candidate=Path.GetFullPath(p.MainModule.FileName),directory=Path.GetDirectoryName(candidate);
     if(!String.Equals(Path.GetDirectoryName(directory),temp,StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(directory).StartsWith(prefix,StringComparison.OrdinalIgnoreCase)||!candidate.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))continue;
     file=candidate;started=start;Process result=p;p=null;return result;
    }catch(Exception){/* Missing/uninspectable/short-lived children prove nothing. */}finally{if(p!=null)p.Dispose();}
   }while(Process32NextW(snapshot,ref entry));return null;
  }finally{CloseHandle(snapshot);}
 }
 static int Main(string[] args){Process wrapper=null;try{
  if(args.Length!=4&&args.Length!=7)throw new ArgumentException("Expected host PID, version, app name, timeout; optional wrapper PID, wrapper path, host path");
  int hostPid,seconds;if(!Int32.TryParse(args[0],out hostPid)||hostPid<=0||!Int32.TryParse(args[3],out seconds)||seconds<1||seconds>1800)throw new ArgumentException("Invalid observer scope");
  string version=args[1],app=args[2];if(!System.Text.RegularExpressions.Regex.IsMatch(version,@"^[0-9A-Za-z.+-]+$")||!System.Text.RegularExpressions.Regex.IsMatch(app,@"^[0-9A-Za-z ._-]+$"))throw new ArgumentException("Invalid version or application name");
  using(var host=Process.GetProcessById(hostPid)){
   IntPtr hostHandle=host.Handle;DateTime hostStart=host.StartTime.ToUniversalTime(),armed=DateTime.UtcNow,deadline=armed.AddSeconds(seconds);
   if(args.Length==7){int wrapperPid;if(!Int32.TryParse(args[4],out wrapperPid)||wrapperPid<=0||wrapperPid==hostPid)throw new ArgumentException("Invalid wrapper process");if(!Same(host.MainModule.FileName,args[6]))throw new IOException("Host process path changed");
    try{wrapper=Process.GetProcessById(wrapperPid);}catch(ArgumentException){/* An already released wrapper is safe. */}
    if(wrapper!=null){IntPtr handle=wrapper.Handle;if(!Same(wrapper.MainModule.FileName,args[5])||wrapper.StartTime.ToUniversalTime()>hostStart)throw new IOException("Wrapper identity changed");}
   }
   string temp=Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar),prefix=app+"-"+version+"-updater-";Process candidate=null;string candidatePath=null;DateTime candidateStart=DateTime.MinValue;bool released=args.Length==4;
   Emit(new{state="armed",hostPid=hostPid,hostStartedAt=hostStart.ToString("o"),observer="toolhelp-process-handle"});
   while(DateTime.UtcNow<deadline){
    if(!released&&(wrapper==null||wrapper.HasExited)){released=true;Emit(new{state="wrapper-exited"});}
    candidate=FindChild(hostPid,armed,hostStart,host,temp,prefix,out candidatePath,out candidateStart);if(candidate!=null)break;Thread.Sleep(25);
   }
   if(candidate==null){Emit(new{state="indeterminate",reason="No matching child process handle was obtained before the deadline"});return 2;}
   using(candidate){Emit(new{state="observed",pid=candidate.Id,parentPid=hostPid,path=candidatePath,startedAt=candidateStart.ToString("o")});int remaining=(int)Math.Max(1,(deadline-DateTime.UtcNow).TotalMilliseconds);
    if(!candidate.WaitForExit(remaining)){Emit(new{state="indeterminate",reason="Installer is still running",pid=candidate.Id});return 2;}
    int code=candidate.ExitCode;Emit(new{state="exited",pid=candidate.Id,parentPid=hostPid,exitCode=code,path=candidatePath,startedAt=candidateStart.ToString("o")});return code==0?0:1;
   }
  }
 }catch(Exception e){Emit(new{state="indeterminate",reason=e.Message});return 2;}finally{if(wrapper!=null)wrapper.Dispose();}}
}

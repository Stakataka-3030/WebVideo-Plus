using System;using System.IO;using System.Text;using System.Diagnostics;using System.Runtime.InteropServices;using System.Linq;
// A separate kernel job per export worker. Closing this guard also kills
// Chromium renderer/GPU children, including children orphaned by a crashed main.
class ProcessGuard {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr j,int c,IntPtr v,uint l);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcess(string application,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out Proc info);
 [DllImport("kernel32.dll")]static extern uint ResumeThread(IntPtr t);
 [DllImport("kernel32.dll")]static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll")]static extern bool GetExitCodeProcess(IntPtr p,out uint c);
 [DllImport("kernel32.dll")]static extern bool TerminateProcess(IntPtr p,uint c);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")]static extern IntPtr GetStdHandle(int n);
 [StructLayout(LayoutKind.Sequential)]struct Basic{public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWorking,MaxWorking;public uint ActiveProcess;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct Io{public ulong A,B,C,D,E,F;}
 [StructLayout(LayoutKind.Sequential)]struct Limit{public Basic Basic;public Io Io;public UIntPtr A,B,C,D;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Startup{public int cb;public string reserved,desktop,title;public int x,y,w,h,xc,yc,fill,flags;public short show,reserved2;public IntPtr reservedPtr,input,output,error;}
 [StructLayout(LayoutKind.Sequential)]struct Proc{public IntPtr process,thread;public uint pid,tid;}
 static string Quote(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
 static int Main(string[] args){IntPtr job=IntPtr.Zero;Proc child=new Proc();try{
  if(args.Length<2)throw new Exception("process-guard requires parent PID and command");int owner=int.Parse(args[0]);var parent=Process.GetProcessById(owner);job=CreateJobObject(IntPtr.Zero,null);var limit=new Limit();limit.Basic.Flags=0x2000;int size=Marshal.SizeOf(limit);IntPtr memory=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(limit,memory,false);if(job==IntPtr.Zero||!SetInformationJobObject(job,9,memory,(uint)size))throw new Exception("Cannot create export process job");}finally{Marshal.FreeHGlobal(memory);}
  var si=new Startup();si.cb=Marshal.SizeOf(si);si.flags=0x100;si.input=GetStdHandle(-10);si.output=GetStdHandle(-11);si.error=GetStdHandle(-12);
  string executable=args[1];if(!Path.IsPathRooted(executable)){string name=Path.HasExtension(executable)?executable:executable+".exe";executable=(Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator).Select(d=>Path.Combine(d.Trim('"'),name)).FirstOrDefault(File.Exists);if(executable==null)throw new Exception("Cannot find export executable: "+name);}
  if(!CreateProcess(executable,new StringBuilder(string.Join(" ",new[]{executable}.Concat(args.Skip(2)).Select(Quote))),IntPtr.Zero,IntPtr.Zero,true,0x08000004,IntPtr.Zero,Directory.GetCurrentDirectory(),ref si,out child))throw new Exception("Cannot start export worker: "+Marshal.GetLastWin32Error());
  if(!AssignProcessToJobObject(job,child.process)){TerminateProcess(child.process,1);throw new Exception("Cannot isolate export worker: "+Marshal.GetLastWin32Error());}ResumeThread(child.thread);
  while(WaitForSingleObject(child.process,250)==258){if(parent.HasExited)return 130;}
  uint code;GetExitCodeProcess(child.process,out code);return unchecked((int)code);
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}finally{if(job!=IntPtr.Zero)CloseHandle(job);if(child.thread!=IntPtr.Zero)CloseHandle(child.thread);if(child.process!=IntPtr.Zero)CloseHandle(child.process);}}
}

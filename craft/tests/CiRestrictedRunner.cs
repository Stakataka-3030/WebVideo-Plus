// Disposable CI only. Restricts a token for the same existing user; never changes
// accounts, ACLs, UAC, registry, policy, credentials or the production host.
using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;

static class CiRestrictedRunner {
 [StructLayout(LayoutKind.Sequential)]struct SidAndAttributes {public IntPtr Sid;public uint Attributes;}
 [StructLayout(LayoutKind.Sequential)]struct TokenGroupsHeader {public uint Count;public SidAndAttributes First;}
 [StructLayout(LayoutKind.Sequential)]struct Luid {public uint Low;public int High;}
 [StructLayout(LayoutKind.Sequential)]struct LuidAndAttributes {public Luid Luid;public uint Attributes;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Startup {public int Size;public string Reserved,Desktop,Title;public int X,Y,XSize,YSize,XChars,YChars,Fill;public uint Flags;public short Show,Reserved2;public IntPtr ReservedBytes,Input,Output,Error;}
 [StructLayout(LayoutKind.Sequential)]struct ProcessInfo {public IntPtr Process,Thread;public uint Pid,Tid;}
 [StructLayout(LayoutKind.Sequential)]struct JobBasic {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWorkingSet,MaxWorkingSet;public uint ActiveProcesses;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IoCounters {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)]struct JobLimits {public JobBasic Basic;public IoCounters Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int length,out int returned);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool CreateRestrictedToken(IntPtr source,uint flags,uint disableCount,[In]SidAndAttributes[] disable,uint deleteCount,[In]LuidAndAttributes[] delete,uint restrictedCount,IntPtr restricted,out IntPtr result);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool SetTokenInformation(IntPtr token,int kind,ref SidAndAttributes data,int length);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool LookupPrivilegeValue(string system,string name,out Luid luid);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcessAsUser(IntPtr token,string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo info);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref JobLimits limits,uint length);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(IntPtr process,out uint exitCode);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool TerminateProcess(IntPtr process,uint exitCode);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 static void Require(bool value,string operation){if(!value)throw new Win32Exception(Marshal.GetLastWin32Error(),operation);}
 static IntPtr Info(IntPtr token,int kind){int length;GetTokenInformation(token,kind,IntPtr.Zero,0,out length);if(length<4||length>65536)throw new IOException("Token information size invalid");IntPtr result=Marshal.AllocHGlobal(length);if(!GetTokenInformation(token,kind,result,length,out length)){Marshal.FreeHGlobal(result);throw new Win32Exception(Marshal.GetLastWin32Error(),"GetTokenInformation");}return result;}
 static int Scalar(IntPtr token,int kind){var data=Info(token,kind);try{return Marshal.ReadInt32(data);}finally{Marshal.FreeHGlobal(data);}}
 static int Integrity(IntPtr token){var data=Info(token,25);try{var sid=Marshal.ReadIntPtr(data);int count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));if(count<1)throw new IOException("Invalid integrity SID");return Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));}finally{Marshal.FreeHGlobal(data);}}
 static SecurityIdentifier User(IntPtr token){var data=Info(token,1);try{return new SecurityIdentifier(Marshal.ReadIntPtr(data));}finally{Marshal.FreeHGlobal(data);}}
 static List<LuidAndAttributes> Privileges(IntPtr token){var data=Info(token,3);try{int count=Marshal.ReadInt32(data);if(count<0||count>512)throw new IOException("Invalid privilege count");var result=new List<LuidAndAttributes>();for(int i=0;i<count;i++)result.Add((LuidAndAttributes)Marshal.PtrToStructure(IntPtr.Add(data,4+i*12),typeof(LuidAndAttributes)));return result;}finally{Marshal.FreeHGlobal(data);}}
 static bool Equal(Luid a,Luid b){return a.Low==b.Low&&a.High==b.High;}
 static IntPtr Sid(SecurityIdentifier value){var bytes=new byte[value.BinaryLength];value.GetBinaryForm(bytes,0);var pointer=Marshal.AllocHGlobal(bytes.Length);Marshal.Copy(bytes,0,pointer,bytes.Length);return pointer;}
 internal static bool Administrator(IntPtr token){
  // TokenGroups needs QUERY only. WindowsPrincipal may duplicate a primary
  // token for membership checks, which the suspended-child QUERY handle cannot do.
  var data=Info(token,2);try{int count=Marshal.ReadInt32(data);if(count<0||count>2048)throw new IOException("Invalid token group count");int offset=Marshal.OffsetOf(typeof(TokenGroupsHeader),"First").ToInt32(),stride=Marshal.SizeOf(typeof(SidAndAttributes));
   for(int i=0;i<count;i++){var group=(SidAndAttributes)Marshal.PtrToStructure(IntPtr.Add(data,offset+i*stride),typeof(SidAndAttributes));if(new SecurityIdentifier(group.Sid).IsWellKnown(WellKnownSidType.BuiltinAdministratorsSid)&&(group.Attributes&4)!=0&&(group.Attributes&16)==0)return true;}return false;
  }finally{Marshal.FreeHGlobal(data);}
 }
 static void AssertReduced(IntPtr token,SecurityIdentifier expected,Luid notify){if(!User(token).Equals(expected)||Integrity(token)!=8192||Scalar(token,20)!=0||Administrator(token)||Privileges(token).Any(p=>!Equal(p.Luid,notify)))throw new IOException("Reduced token did not meet same-user non-admin medium-integrity contract");}
 internal static string Quote(string value){var result=new StringBuilder("\"");int slashes=0;foreach(char ch in value){if(ch=='\\'){slashes++;continue;}if(ch=='\"'){result.Append('\\',slashes*2+1).Append(ch);slashes=0;continue;}result.Append('\\',slashes).Append(ch);slashes=0;}return result.Append('\\',slashes*2).Append('"').ToString();}
 static string Within(string root,string value){string target=Path.GetFullPath(value),boundary=Path.GetFullPath(root).TrimEnd('\\')+'\\';if(!target.StartsWith(boundary,StringComparison.OrdinalIgnoreCase))throw new IOException("Path escaped CI boundary");return target;}
 static void NoLinks(string file){for(string p=Path.GetFullPath(file);!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked path is not an accepted CI input");}}
 internal static void Guard(){if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true"||Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT")!="github-hosted"||Environment.GetEnvironmentVariable("RUNNER_OS")!="Windows"||Environment.GetEnvironmentVariable("WEBVIDEO_CRAFT_HOST_SMOKE")!="1"||String.IsNullOrEmpty(Environment.GetEnvironmentVariable("GITHUB_RUN_ID")))throw new IOException("Restricted runner is available only in explicitly enabled disposable Windows CI");}
 static int Main(string[] args){
  string evidence=null,stage="guard";var report=new Dictionary<string,object>{{"schemaVersion",1},{"status","BLOCKED"},{"persistentChanges",false}};
  IntPtr source=IntPtr.Zero,reduced=IntPtr.Zero,admin=IntPtr.Zero,medium=IntPtr.Zero,environment=IntPtr.Zero,job=IntPtr.Zero;ProcessInfo child=new ProcessInfo();bool childFinished=false,evidenceValidated=false;
  try{
   Guard();if(args.Length!=4)throw new IOException("Expected pinned Node, diagnostic script, prepared input and evidence directory");
   string workspace=Path.GetFullPath(Environment.GetEnvironmentVariable("GITHUB_WORKSPACE")),node=Path.GetFullPath(args[0]);
   string script=Within(workspace,args[1]),input=Within(Path.Combine(workspace,".build","ci-native-tests"),args[2]);
   evidence=Within(Path.Combine(workspace,".build","ci-native-tests"),args[3]);
   if(!String.Equals(script,Path.Combine(workspace,"craft","tests","ci-host-port-diagnostic.mjs"),StringComparison.OrdinalIgnoreCase)||!String.Equals(Path.GetFileName(node),"node.exe",StringComparison.OrdinalIgnoreCase))throw new IOException("Unexpected CI diagnostic command");
   foreach(string p in new[]{workspace,node,script,input,evidence})NoLinks(p);
   if(!File.Exists(node)||!File.Exists(script)||!File.Exists(input)||!Directory.Exists(evidence))throw new IOException("CI inputs/output directory must already exist; no permissions are changed");
   evidenceValidated=true;
   stage="source-token";Require(OpenProcessToken(Process.GetCurrentProcess().Handle,0x008B,out source),stage);
   var user=User(source);if(user.IsWellKnown(WellKnownSidType.LocalSystemSid)||user.IsWellKnown(WellKnownSidType.LocalServiceSid)||user.IsWellKnown(WellKnownSidType.NetworkServiceSid)||Integrity(source)<8192)throw new IOException("Only the existing non-service CI user at medium-or-higher integrity is supported");
   report["sourceIntegrityRid"]=Integrity(source);report["sourceElevated"]=Scalar(source,20)!=0;
   Luid notify;Require(LookupPrivilegeValue(null,"SeChangeNotifyPrivilege",out notify),"LookupPrivilegeValue");
   var remove=Privileges(source).Where(p=>!Equal(p.Luid,notify)).ToArray();admin=Sid(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid,null));
   stage="create-restricted-token";
   // LUA_TOKEN plus explicit removal: no retained disabled privilege can be re-enabled.
   Require(CreateRestrictedToken(source,4,1,new[]{new SidAndAttributes{Sid=admin}},(uint)remove.Length,remove,0,IntPtr.Zero,out reduced),stage);
   var mediumSid=new SecurityIdentifier("S-1-16-8192");medium=Sid(mediumSid);var label=new SidAndAttributes{Sid=medium,Attributes=0x20};
   stage="lower-token-integrity";Require(SetTokenInformation(reduced,25,ref label,Marshal.SizeOf(typeof(SidAndAttributes))+mediumSid.BinaryLength),stage);
   report["reducedIntegrityRid"]=Integrity(reduced);report["reducedElevated"]=Scalar(reduced,20)!=0;report["sameUser"]=User(reduced).Equals(user);report["administratorEnabled"]=Administrator(reduced);report["remainingPrivilegeCount"]=Privileges(reduced).Count;report["unexpectedPrivilegeCount"]=Privileges(reduced).Count(p=>!Equal(p.Luid,notify));
   AssertReduced(reduced,user,notify);
   stage="owned-job";job=CreateJobObject(IntPtr.Zero,null);Require(job!=IntPtr.Zero,stage);var limits=new JobLimits();limits.Basic.Flags=0x2000;
   Require(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(JobLimits))),"SetInformationJobObject");
   var variables=new SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(DictionaryEntry entry in Environment.GetEnvironmentVariables())variables[(string)entry.Key]=(string)entry.Value;
   variables["WEBVIDEO_CRAFT_EXPECT_MEDIUM"]="1";environment=Marshal.StringToHGlobalUni(String.Join("\0",variables.Select(p=>p.Key+"="+p.Value))+"\0\0");
   var start=new Startup{Size=Marshal.SizeOf(typeof(Startup))};var command=new StringBuilder(String.Join(" ",new[]{node,script,input,evidence}.Select(Quote)));
   stage="create-suspended-child";
   Require(CreateProcessAsUser(reduced,node,command,IntPtr.Zero,IntPtr.Zero,false,0x08000404,environment,workspace,ref start,out child),stage);
   report["pid"]=child.Pid;
   stage="query-suspended-child";IntPtr actual;Require(OpenProcessToken(child.Process,8,out actual),stage);try{report["childIntegrityRid"]=Integrity(actual);report["childElevated"]=Scalar(actual,20)!=0;AssertReduced(actual,user,notify);report["suspendedChildVerified"]=true;}finally{CloseHandle(actual);}
   stage="assign-owned-job";Require(AssignProcessToJobObject(job,child.Process),stage);report["jobAssigned"]=true;
   stage="resume-verified-child";Require(ResumeThread(child.Thread)!=0xffffffff,stage);
   report["status"]="RUNNING";NoLinks(Path.Combine(evidence,"restricted-launch.json"));File.WriteAllText(Path.Combine(evidence,"restricted-launch.json"),new JavaScriptSerializer().Serialize(report));
   stage="wait-child";uint wait=WaitForSingleObject(child.Process,180000);if(wait!=0)throw new IOException(wait==258?"Owned CI child timed out":"Owned CI child wait failed");
   uint code;Require(GetExitCodeProcess(child.Process,out code),"read-child-exit");childFinished=true;report["childExitCode"]=code;report["status"]=code==0?"COMPLETED":"CHILD_FAILED";
   return code==0?0:1;
  }catch(Exception error){report["status"]="BLOCKED";report["stage"]=stage;report["errorType"]=error.GetType().Name;var native=error as Win32Exception;if(native!=null)report["win32Code"]=native.NativeErrorCode;Console.Error.WriteLine("Restricted CI child blocked at "+stage+" ("+error.GetType().Name+")");return 1;}
  finally{
   // Retained handles refer only to our new child/job, never a PID lookup or name-wide kill.
   if(child.Process!=IntPtr.Zero&&!childFinished){report["childTerminationRequested"]=TerminateProcess(child.Process,1);report["childExitConfirmed"]=WaitForSingleObject(child.Process,10000)==0;}
   if(job!=IntPtr.Zero)report["ownedJobClosed"]=CloseHandle(job);
   foreach(var handle in new[]{child.Thread,child.Process,reduced,source})if(handle!=IntPtr.Zero)CloseHandle(handle);
   foreach(var memory in new[]{admin,medium,environment})if(memory!=IntPtr.Zero)Marshal.FreeHGlobal(memory);
   report["finishedAt"]=DateTime.UtcNow.ToString("o");if(evidenceValidated){NoLinks(Path.Combine(evidence,"restricted-launch.json"));File.WriteAllText(Path.Combine(evidence,"restricted-launch.json"),new JavaScriptSerializer().Serialize(report));}
  }
 }
}

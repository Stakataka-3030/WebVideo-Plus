// Read-only diagnostic. Does not create/filter/modify a token, account, policy or ACL.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
static class CiHostToken {
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int length,out int returned);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")]static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 static byte[] Info(IntPtr token,int kind){int count;GetTokenInformation(token,kind,IntPtr.Zero,0,out count);if(count<4||count>65536)throw new IOException("Token information unavailable");var pointer=Marshal.AllocHGlobal(count);try{if(!GetTokenInformation(token,kind,pointer,count,out count))throw new IOException("Token query failed");var bytes=new byte[count];Marshal.Copy(pointer,bytes,0,count);return bytes;}finally{Marshal.FreeHGlobal(pointer);}}
 static int Integrity(IntPtr token){int count;GetTokenInformation(token,25,IntPtr.Zero,0,out count);if(count<IntPtr.Size||count>65536)throw new IOException("Integrity information unavailable");var pointer=Marshal.AllocHGlobal(count);try{if(!GetTokenInformation(token,25,pointer,count,out count))throw new IOException("Integrity query failed");var sid=Marshal.ReadIntPtr(pointer);byte parts=Marshal.ReadByte(GetSidSubAuthorityCount(sid));if(parts==0)throw new IOException("Invalid integrity SID");return Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(parts-1)));}finally{Marshal.FreeHGlobal(pointer);}}
 static int Main(string[] args){try{
  int pid;if(args.Length!=3||!Int32.TryParse(args[0],out pid)||pid<=0)throw new IOException("Expected owned PID, executable and creation time");
  using(var process=Process.GetProcessById(pid)){
   var handle=process.Handle;
   if(!String.Equals(process.MainModule.FileName,Path.GetFullPath(args[1]),StringComparison.OrdinalIgnoreCase)||process.StartTime.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.ffffff'Z'")!=args[2])throw new IOException("Process identity mismatch");
   IntPtr token;if(!OpenProcessToken(handle,8,out token))throw new IOException("Cannot query process token");
   try{int rid=Integrity(token),type=BitConverter.ToInt32(Info(token,18),0);bool elevated=BitConverter.ToInt32(Info(token,20),0)!=0;
    bool linkedAvailable=false;int linkedError=0,returned;var linked=Marshal.AllocHGlobal(IntPtr.Size);
    try{linkedAvailable=GetTokenInformation(token,19,linked,IntPtr.Size,out returned);if(linkedAvailable)CloseHandle(Marshal.ReadIntPtr(linked));else linkedError=Marshal.GetLastWin32Error();}finally{Marshal.FreeHGlobal(linked);}
    Console.WriteLine(new JavaScriptSerializer().Serialize(new{pid=pid,elevated=elevated,elevationType=type,integrityRid=rid,integrity=rid>=16384?"system":rid>=12288?"high":rid>=8192?"medium":rid>=4096?"low":"untrusted",linkedTokenAvailable=linkedAvailable,linkedTokenQueryError=linkedError}));
   }finally{CloseHandle(token);}
  }return 0;
 }catch(Exception error){Console.Error.WriteLine("Read-only token diagnostic failed: "+error.GetType().Name);return 1;}}
}

using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Win32;
// Bounded clean-environment launcher. No registry writes, remote environment
// manipulation, service, startup hook, process killing or host-file mutation.
class OfficialInstallerLauncher {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static void Emit(object value){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}
 static bool Same(string a,string b){return String.Equals(Path.GetFullPath(a).TrimEnd('\\','/'),Path.GetFullPath(b).TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase);}
 static void NoLinks(string file){for(string p=Path.GetFullPath(file);!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p))if((File.Exists(p)||Directory.Exists(p))&&(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked update path is not allowed");}
 internal static string RegistryPath(object value){string s=Convert.ToString(value).Trim();if(s.Length>=2&&s[0]=='"'&&s[s.Length-1]=='"')s=s.Substring(1,s.Length-2);if(!Path.IsPathRooted(s)||s.IndexOf('"')>=0)throw new IOException("Invalid official registry path");return Path.GetFullPath(s);}
 internal static void ValidateRegistryValues(string craft,string currentVersion,object productPath,object installLocation,object uninstall,object binary,object displayName,object publisher,object displayVersion){
  string directory=Path.GetDirectoryName(craft);
  if(!Same(RegistryPath(productPath),directory)||!Same(RegistryPath(installLocation),directory)||!Same(RegistryPath(uninstall),Path.Combine(directory,"uninstall.exe"))||!String.Equals(Convert.ToString(binary),"webgal-craft.exe",StringComparison.OrdinalIgnoreCase)||Convert.ToString(displayName)!="WebGAL Craft"||Convert.ToString(publisher)!="Akirami"||Convert.ToString(displayVersion)!=currentVersion)throw new IOException("Official registered installation does not match this Craft entry/version; no installer was launched");
 }
 internal static bool ConflictingMachineProduct(object displayName,object publisher){return String.Equals(Convert.ToString(displayName),"WebGAL Craft",StringComparison.OrdinalIgnoreCase)&&String.Equals(Convert.ToString(publisher),"Akirami",StringComparison.OrdinalIgnoreCase);}
 static void NoConflictingMachineInstall(){
  // The official NSIS /UPDATE path can prefer a matching HKLM MSI uninstall
  // before its normal current-user update bypass. Refuse all matching machine
  // registrations, conservatively in both views; never uninstall another copy.
  foreach(var view in new[]{RegistryView.Registry64,RegistryView.Registry32})using(var root=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,view))using(var list=root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall",false)){
   if(list==null)continue;string[] names=list.GetSubKeyNames();if(names.Length>4096)throw new IOException("Machine uninstall inventory exceeds bounded verification limit");foreach(string name in names)using(var entry=list.OpenSubKey(name,false)){if(entry==null)throw new IOException("Machine installation registration changed during verification");if(ConflictingMachineProduct(entry.GetValue("DisplayName"),entry.GetValue("Publisher")))throw new IOException("Another machine-wide Craft registration exists; refuse ambiguous official update target");}
  }
 }
 static void RegisteredTarget(string craft,string currentVersion){
  NoConflictingMachineInstall();
  using(var root=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,RegistryView.Registry64))using(var product=root.OpenSubKey(@"Software\Akirami\WebGAL Craft",false))using(var uninstall=root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\WebGAL Craft",false)){
   if(product==null||uninstall==null)throw new IOException("No matching current-user official installation registration; copied EXE is not update-isolated");
   ValidateRegistryValues(craft,currentVersion,product.GetValue(""),uninstall.GetValue("InstallLocation"),uninstall.GetValue("UninstallString"),uninstall.GetValue("MainBinaryName"),uninstall.GetValue("DisplayName"),uninstall.GetValue("Publisher"),uninstall.GetValue("DisplayVersion"));
  }
 }
 // Same argument escaping as pinned Tauri updater 2.10.1. Slash is quoted too,
 // so forwarded host arguments cannot become new NSIS installer switches.
 internal static string EscapeNsisArgument(string arg){
  if(arg==null||arg.IndexOf('\0')>=0||arg.IndexOf('\r')>=0||arg.IndexOf('\n')>=0)throw new ArgumentException("Invalid host argument");
  bool quote=arg.Length==0||arg.IndexOfAny(new[]{' ','\t','/'})>=0;var b=new StringBuilder();if(quote)b.Append('"');int slashes=0;
  foreach(char c in arg){if(c=='\\')slashes++;else{if(c=='"')b.Append('\\',slashes+1);slashes=0;}b.Append(c);}if(quote){b.Append('\\',slashes);b.Append('"');}return b.ToString();
 }
 static void NoForeignOriginalNameProcess(int ownedWrapperPid,string craft){
  foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(craft)))using(process){if(process.Id!=ownedWrapperPid)throw new IOException("Another same-name Craft process is running; official NSIS could terminate unrelated work");}
 }
 internal static void CleanEnvironment(){foreach(string name in new[]{"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS","WEBVIEW2_USER_DATA_FOLDER","WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER"})Environment.SetEnvironmentVariable(name,null,EnvironmentVariableTarget.Process);}
 internal static bool HostCloseGraceExpired(TimeSpan elapsed){return elapsed.TotalMilliseconds>=30000;}
 static int Main(string[] args){return Run(args,RegisteredTarget);}
 // The test harness supplies an inert registry reader at compile time; there is
 // deliberately no CLI/environment flag that bypasses real registry preflight.
 internal static int Run(string[] args,Action<string,string> preflight){Process wrapper=null;bool attempted=false;try{
  if(args.Length!=10)throw new ArgumentException("Expected owned PIDs/paths, verified installer hash, versions, deadline and host arguments");
  int hostPid,wrapperPid,seconds;if(!Int32.TryParse(args[0],out hostPid)||hostPid<=0||!Int32.TryParse(args[1],out wrapperPid)||wrapperPid<=0||hostPid==wrapperPid||!Int32.TryParse(args[8],out seconds)||seconds<1||seconds>900)throw new ArgumentException("Invalid bounded update scope");
  string original=Path.GetFullPath(args[2]),craft=Path.GetFullPath(args[3]),installer=Path.GetFullPath(args[4]),expected=args[5],current=args[6],version=args[7];
  if(!System.Text.RegularExpressions.Regex.IsMatch(expected,@"^[a-f0-9]{64}$")||!System.Text.RegularExpressions.Regex.IsMatch(current,@"^[0-9A-Za-z.+-]+$")||!System.Text.RegularExpressions.Regex.IsMatch(version,@"^[0-9A-Za-z.+-]+$"))throw new ArgumentException("Invalid verified installer identity");
  if(args[9].Length>32768)throw new ArgumentException("Host arguments exceed limit");var hostArgs=Json.Deserialize<string[]>(args[9]);if(hostArgs==null||hostArgs.Length>128)throw new ArgumentException("Host arguments exceed limit");
  string installerArgs="/P /R /UPDATE /ARGS"+(hostArgs.Length==0?"":" "+String.Join(" ",hostArgs.Select(EscapeNsisArgument)));
  NoLinks(original);NoLinks(craft);NoLinks(installer);preflight(craft,current);CleanEnvironment();
  using(var host=Process.GetProcessById(hostPid)){
   IntPtr hostHandle=host.Handle;DateTime hostStart=host.StartTime.ToUniversalTime(),deadline=DateTime.UtcNow.AddSeconds(seconds);
   if(!Same(host.MainModule.FileName,original))throw new IOException("Owned host process changed");
   try{wrapper=Process.GetProcessById(wrapperPid);}catch(ArgumentException){}
   if(wrapper!=null){IntPtr handle=wrapper.Handle;if(!Same(wrapper.MainModule.FileName,craft)||wrapper.StartTime.ToUniversalTime()>hostStart)throw new IOException("Owned wrapper process changed");}
   NoForeignOriginalNameProcess(wrapper==null?-1:wrapperPid,craft);
   bool released=false,committed=false;Stopwatch closeWait=null;var command=Task.Factory.StartNew(()=>Console.ReadLine());Emit(new{state="armed",hostPid=hostPid,hostStartedAt=hostStart.ToString("o"),mode="signed-clean-environment"});
   while(DateTime.UtcNow<deadline){
    if(!released&&(wrapper==null||wrapper.HasExited)){released=true;Emit(new{state="wrapper-exited"});}
    if(command.IsCompleted){
     string input=command.Result;
     if(input=="cancel"||input==null){Emit(new{state="not-started",reason="Official update cancelled before installer launch",launchAttempted=false});return 2;}
     if(committed||input!="commit")throw new IOException("Invalid update command");
     committed=true;closeWait=Stopwatch.StartNew();Emit(new{state="committed",hostCloseGraceMs=30000});command=Task.Factory.StartNew(()=>Console.ReadLine());
    }
    if(committed&&HostCloseGraceExpired(closeWait.Elapsed)){Emit(new{state="not-started",reason="Normal Craft close was not completed within 30 seconds; installer was not launched",launchAttempted=false});return 2;}
    if(committed&&released&&host.HasExited){
     preflight(craft,current);NoForeignOriginalNameProcess(-1,craft);NoLinks(installer);
     // Hold a read-only, non-delete-shared handle through the whole installer
     // lifetime: replacement between verified hash and process launch is denied.
     using(var hold=new FileStream(installer,FileMode.Open,FileAccess.Read,FileShare.Read)){
      string actual;using(var sha=SHA256.Create())actual=BitConverter.ToString(sha.ComputeHash(hold)).Replace("-","").ToLowerInvariant();if(actual!=expected)throw new IOException("Verified installer bytes changed immediately before launch");
      preflight(craft,current);NoForeignOriginalNameProcess(-1,craft);
      // Registry enumeration and hashing can take time. Recheck the pending
      // prelaunch cancellation and monotonic close grace at the final boundary.
      if(command.IsCompleted){string input=command.Result;if(input!="cancel"&&input!=null)throw new IOException("Invalid prelaunch command");Emit(new{state="not-started",reason="Official update cancelled before installer launch",launchAttempted=false});return 2;}
      if(HostCloseGraceExpired(closeWait.Elapsed)||DateTime.UtcNow>=deadline){Emit(new{state="not-started",reason="Official update prelaunch deadline expired",launchAttempted=false});return 2;}
      CleanEnvironment();attempted=true;
      using(var child=Process.Start(new ProcessStartInfo(installer,installerArgs){UseShellExecute=true,WorkingDirectory=Path.GetDirectoryName(installer)})){
       if(child==null)throw new IOException("No native installer process handle was returned");IntPtr childHandle=child.Handle;DateTime started=child.StartTime.ToUniversalTime();
       Emit(new{state="observed",pid=child.Id,path=installer,startedAt=started.ToString("o"),cleanEnvironment=true});
       int remaining=(int)Math.Max(1,(deadline-DateTime.UtcNow).TotalMilliseconds);if(!child.WaitForExit(remaining)){Emit(new{state="indeterminate",pid=child.Id,reason="Official installer still running",launchAttempted=true});return 2;}
       int code=child.ExitCode;Emit(new{state="exited",pid=child.Id,exitCode=code,path=installer,startedAt=started.ToString("o"),cleanEnvironment=true});return code==0?0:1;
      }
     }
    }
    Thread.Sleep(25);
   }
   Emit(new{state="not-started",reason="Host/wrapper did not exit before the deadline",launchAttempted=false});return 2;
  }
 }catch(Exception error){Emit(new{state=attempted?"indeterminate":"not-started",reason=error.Message,launchAttempted=attempted});return 2;}finally{if(wrapper!=null)wrapper.Dispose();}}
}

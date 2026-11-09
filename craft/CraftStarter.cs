using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using System.Reflection;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Web.Script.Serialization;
using System.Threading;
using System.Security.Cryptography;
using System.Text;
using System.Runtime.InteropServices;
using System.Net;
[assembly: AssemblyVersion("1.2.2.0")]
[assembly: AssemblyFileVersion("1.2.2.0")]
[assembly: AssemblyInformationalVersion("1.2.2.0c")]

static class CraftStarter {
 static string Q(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
 [STAThread] static int Main(string[] args){
  // Read-only native query: never enter the GUI, installation or session path.
  if(args.Length>0&&args[0]=="--verify-listener")return CraftListenerVerifier.Run(args);
  CraftManifestVerifier.ConfigurePaths();
  if(args.Contains("--auto-click"))try{return Run(args,(message,ready)=>{});}catch{return 1;}
  Application.EnableVisualStyles();
  using(var form=CreateForm(report=>Run(args,report),(owner,text)=>MessageBox.Show(owner,text,"WebVideo+ Craft",MessageBoxButtons.OK,MessageBoxIcon.Error))){Application.Run(form);return (int)form.Tag;}
 }
 // Keep the message loop responsive while the complete package is verified.
 // Hiding this window after readiness does not end the owned session lifetime.
 internal static Form CreateForm(Func<Action<string,bool>,int> operation,Action<IWin32Window,string> showError){
  var form=new Form{Text="WebVideo+ Craft · 正在启动",ClientSize=new Size(570,180),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,Tag=1};
  var title=new Label{Text="正在启动 WebVideo+ Craft",Font=new Font("Microsoft YaHei UI",12,FontStyle.Bold),Location=new Point(20,18),AutoSize=true};
  var status=new Label{Name="status",Text="正在准备完整性校验…",Location=new Point(22,55),Size=new Size(526,64)};
  var progress=new ProgressBar{Name="progress",Location=new Point(22,137),Size=new Size(526,16),Style=ProgressBarStyle.Marquee,MarqueeAnimationSpeed=30};
  var worker=new BackgroundWorker{WorkerReportsProgress=true};var timer=new System.Windows.Forms.Timer{Interval=1000};var elapsed=new Stopwatch();bool busy=true,ready=false,started=false;string phase="正在准备完整性校验…";
  Action refresh=()=>{status.Text=phase+"\n已用时 "+(int)elapsed.Elapsed.TotalSeconds+" 秒；完整性校验期间请稍候。";};
  timer.Tick+=(sender,e)=>refresh();
  worker.DoWork+=(sender,e)=>{e.Result=operation((message,isReady)=>worker.ReportProgress(isReady?1:0,message));};
  worker.ProgressChanged+=(sender,e)=>{phase=(string)e.UserState;refresh();if(e.ProgressPercentage==1){ready=true;timer.Stop();form.Hide();}};
  worker.RunWorkerCompleted+=(sender,e)=>{
   busy=false;timer.Stop();elapsed.Stop();form.Tag=e.Error==null?(int)e.Result:1;
   if(e.Error!=null||(int)form.Tag!=0){form.Show();showError(form,e.Error==null?"Craft 会话启动失败，请检查适配目录 state/logs/launcher.log。":e.Error.Message);}
   form.Close();
  };
  // A close must not terminate the coordinator or abandon a running host.
  form.FormClosing+=(sender,e)=>{if(busy&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;if(ready)form.Hide();else refresh();}};
  form.FormClosed+=(sender,e)=>{timer.Dispose();worker.Dispose();};
  form.Shown+=(sender,e)=>{if(started)return;started=true;elapsed.Start();refresh();timer.Start();worker.RunWorkerAsync();};
  form.Controls.AddRange(new Control[]{title,status,progress});return form;
 }
 internal static Mutex AcquireLaunchMutex(string adapter){
  if(!Path.IsPathRooted(adapter))throw new IOException("适配记录路径无效");
  string mutexId;using(var sha=SHA256.Create())mutexId=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(adapter).TrimEnd('\\','/').ToUpperInvariant()))).Replace("-","");
  var mutex=new Mutex(false,"Local\\WebVideoCraft.Launch-"+mutexId);bool owned;
  try{owned=mutex.WaitOne(0);}catch(AbandonedMutexException){owned=true;}
  if(!owned){mutex.Dispose();throw new IOException("此增强版 Craft 已在启动或运行，请稍候或切换到现有窗口。无需重复打开，也不要结束正在启动的进程。");}
  return mutex;
 }
 // Log failures must never escape a redirected-output callback and tear down
 // the wrapper while its coordinator/host are still alive. Keep a bounded tail
 // in memory, fall back to the per-launch temp log, and describe failed writes.
 internal sealed class LaunchLog {
  readonly object gate=new object();readonly string fallback;readonly Action<string,string> append;
  readonly Queue<string> recent=new Queue<string>();int recentChars;string target,failure="";bool lastWriteFailed;
  internal LaunchLog(string temporaryFile,Action<string,string> writer=null){fallback=temporaryFile;target=temporaryFile;append=writer??new Action<string,string>(File.AppendAllText);}
  internal void UsePrimary(string file){lock(gate)target=file;}
  void Remember(string line){if(line.Length>8192)line=line.Substring(line.Length-8192);recent.Enqueue(line);recentChars+=line.Length;while(recentChars>16384&&recent.Count>1)recentChars-=recent.Dequeue().Length;}
  internal void Write(string message){
   string line=DateTime.UtcNow.ToString("o")+" "+message+Environment.NewLine;
   lock(gate){
    Remember(line);
    try{append(target,line);lastWriteFailed=false;return;}catch(Exception error){failure="日志写入失败："+target+"（"+error.GetType().Name+"："+error.Message+"）";lastWriteFailed=true;}
    if(!String.Equals(target,fallback,StringComparison.OrdinalIgnoreCase)){
     target=fallback;string notice=DateTime.UtcNow.ToString("o")+" "+failure+"；转存临时启动日志。"+Environment.NewLine;
     try{append(target,notice+line);lastWriteFailed=false;}catch(Exception error){failure+="；临时日志也无法写入（"+error.GetType().Name+"："+error.Message+"）";}
    }
   }
  }
  internal string Diagnostic{get{lock(gate){return (failure.Length==0?"":failure+Environment.NewLine)+(lastWriteFailed?"日志未能写入磁盘；近期输出："+Environment.NewLine+String.Join("",recent.ToArray()):"启动日志："+target);}}}
 }
 internal static void HandleSessionOutput(string line,LaunchLog log,Action<string,bool> report,Action releaseWrapper=null){
  if(line==null)return;
  log.Write(line);
  const string prefix="WEBVIDEO_CRAFT_STATUS ";if(!line.StartsWith(prefix,StringComparison.Ordinal))return;
  try{var update=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line.Substring(prefix.Length));string stage=CraftManifestVerifier.Text(update,"stage"),message=CraftManifestVerifier.Text(update,"text");if(stage=="update-handoff"&&releaseWrapper!=null){releaseWrapper();return;}if(message.Length>0)report(message,stage=="ready");}
  catch(Exception error){log.Write("会话状态消息处理失败："+error.Message);}
 }
 internal sealed class LaunchArguments {
  internal string StatePath;
  internal readonly List<string> Coordinator=new List<string>(),Host=new List<string>();
 }
 internal static LaunchArguments ParseArguments(string[] args){
  var parsed=new LaunchArguments();bool hostOnly=false,isolated=args.Contains("--isolated-test");
  for(int i=0;i<args.Length;i++){
   string value=args[i];if(hostOnly){parsed.Host.Add(value);continue;}
   if(value=="--"){hostOnly=true;continue;}
   if(value=="--state"||value=="--config"){
    if(parsed.StatePath!=null||i+1>=args.Length||args[i+1].StartsWith("--",StringComparison.Ordinal))throw new IOException("启动状态参数无效或重复");
    parsed.StatePath=Path.GetFullPath(args[++i]);continue;
   }
   if(value=="--isolated-test"||value=="--auto-click"){parsed.Coordinator.Add(value);continue;}
   if(value=="--profile"&&isolated){if(i+1>=args.Length)throw new IOException("隔离 profile 参数缺失");parsed.Coordinator.Add(value);parsed.Coordinator.Add(Path.GetFullPath(args[++i]));continue;}
   parsed.Host.Add(value);
  }
  return parsed;
 }
 static int Run(string[] args,Action<string,bool> report){
  string startupLog=Path.Combine(Path.GetTempPath(),"WebVideoCraft-Launcher-"+Guid.NewGuid().ToString("N")+".log");
  var log=new LaunchLog(startupLog);Mutex launchMutex=null;
  Action<string> record=log.Write;
  try{
   record("launcher-started");report("正在读取安装记录并校验全部启动文件…",false);
   string self=Assembly.GetExecutingAssembly().Location,home=Path.GetDirectoryName(self);var parsed=ParseArguments(args);string statePath=parsed.StatePath;
   if(statePath==null)statePath=File.Exists(Path.Combine(home,"config.json"))?Path.Combine(home,"config.json"):Path.Combine(home,"webvideo-craft.install.json");
   // Both entry points resolve the same adapter record before expensive work.
   // The mutex only coordinates startup; it never substitutes for verification.
   var hint=CraftManifestVerifier.Read(statePath);string adapter=CraftManifestVerifier.Text(hint,"adapterRoot"),canonical=CraftManifestVerifier.Text(hint,"craftExe");
   if(CraftManifestVerifier.Text(hint,"installMode")=="same-name"&&!CraftManifestVerifier.Same(self,canonical)){
    // Legacy enhanced shortcuts redirect to the one original-name entry. The
    // package template never creates a second independently enhanced session.
    var legacy=CraftManifestVerifier.VerifyLaunch(statePath,self,message=>record(message));
    Process.Start(new ProcessStartInfo(CraftManifestVerifier.Text(legacy,"craftExe"),String.Join(" ",args.Select(Q))){WorkingDirectory=Path.GetDirectoryName(canonical),UseShellExecute=false});return 0;
   }
   launchMutex=AcquireLaunchMutex(adapter);
   var state=CraftManifestVerifier.VerifyLaunch(statePath,self,message=>{record(message);report(message,false);});string root=CraftManifestVerifier.Text(state,"adapterRoot"),stateDir=CraftManifestVerifier.Text(state,"stateDir");
   if(File.Exists(Path.Combine(stateDir,"update.lock")))throw new IOException("Craft 官方更新仍在进行或结果待核对，请等安装器结束；如已退出，请用安装器检查过期更新记录。");
   if(!CraftManifestVerifier.Same(stateDir,Path.Combine(root,"state")))throw new IOException("会话目录不属于此适配器");CraftManifestVerifier.NoLinks(stateDir);Directory.CreateDirectory(Path.Combine(stateDir,"logs"));log.UsePrimary(Path.Combine(stateDir,"logs","launcher.log"));record("launcher-verified; startup log: "+startupLog);
   var package=CraftManifestVerifier.Get(state,"package");string node=CraftManifestVerifier.Under(root,CraftManifestVerifier.Text(package,"node")),script=CraftManifestVerifier.Under(root,CraftManifestVerifier.Text(package,"entry"));
   // Node 22.20.0 uses Windows' trusted CA store in addition to its bundled CAs.
   // This retains TLS verification without installing certificates or changing the host.
   var command=new[]{"--use-system-ca",script,"--state",Path.Combine(root,"config.json"),"--craft",CraftManifestVerifier.Text(state,"originalExe"),"--kernel",CraftManifestVerifier.Text(state,"kernelExe"),"--wrapper-pid",Process.GetCurrentProcess().Id.ToString()}.Concat(parsed.Coordinator).Concat(new[]{"--"}).Concat(parsed.Host);
   // Only the child session configures WebView2. This wrapper never sets a
   // persistent environment variable, registry value or background service.
   report("启动文件校验完成，正在启动会话协调器…",false);
   using(var handoff=new ManualResetEvent(false))using(var exited=new ManualResetEvent(false))
   using(var process=new Process{StartInfo=new ProcessStartInfo(node,String.Join(" ",command.Select(Q))){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true},EnableRaisingEvents=true}){
    process.Exited+=(sender,e)=>{try{exited.Set();}catch(ObjectDisposedException){}};
    DataReceivedEventHandler append=(sender,e)=>HandleSessionOutput(e.Data,log,report,()=>handoff.Set());process.OutputDataReceived+=append;process.ErrorDataReceived+=append;process.Start();process.BeginOutputReadLine();process.BeginErrorReadLine();
    // Official NSIS addresses the original filename. Release this mapped EXE
    // before the signed updater starts it; Node retains the session ownership.
    if(WaitHandle.WaitAny(new WaitHandle[]{handoff,exited})==0){record("wrapper released for official update handoff");return 0;}
    process.WaitForExit();
    // The session may hand an update to an external one-shot coordinator. Exit
    // immediately so the original-name executable is no longer mapped/locked.
    if(process.ExitCode==75)return 0;
    if(process.ExitCode!=0)throw new IOException("Craft 会话启动失败（退出码 "+process.ExitCode+"）。");
    return process.ExitCode;
   }
  }catch(Exception error){record(error.ToString());throw new IOException(error.Message+"\n"+log.Diagnostic,error);}finally{if(launchMutex!=null){launchMutex.ReleaseMutex();launchMutex.Dispose();}}
 }
}

// Some Windows 26H2 builds return State=0 for live listening sockets through
// CIM and all-connections IP Helper tables. Ask the OS for its listener-only
// table instead; membership, not the unreliable State field, proves listening.
internal static class CraftListenerVerifier {
 internal const int ListenerTable=3; // TCP_TABLE_OWNER_PID_LISTENER
 internal delegate uint TableQuery(IntPtr table,ref int size,bool order,int family,int tableClass,uint reserved);
 [DllImport("iphlpapi.dll")]static extern uint GetExtendedTcpTable(IntPtr table,ref int size,bool order,int family,int tableClass,uint reserved);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Entry {
  public uint size,usage,pid;public UIntPtr heap;public uint module,threads,parent;public int priority;public uint flags;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string name;
 }
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool Process32FirstW(IntPtr snapshot,ref Entry entry);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool Process32NextW(IntPtr snapshot,ref Entry entry);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 internal sealed class Listener {internal string Address;internal int Port,Pid;}
 internal static byte[] ReadTable(int family,TableQuery query=null){
  if(family!=2&&family!=23)throw new ArgumentException("Invalid address family");
  query=query??GetExtendedTcpTable;int size=0;uint error=query(IntPtr.Zero,ref size,false,family,ListenerTable,0);
  if(error!=122)throw new IOException("Cannot size native listener table: "+error);
  for(int attempt=0;attempt<4;attempt++){
   if(size<4||size>16*1024*1024)throw new IOException("Invalid native listener table size");
   int capacity=size;IntPtr buffer=Marshal.AllocHGlobal(capacity);
   try{
    error=query(buffer,ref size,false,family,ListenerTable,0);
    if(error==122)continue;
    if(error!=0)throw new IOException("Cannot read native listener table: "+error);
    if(size<4||size>capacity)throw new IOException("Incomplete native listener table");
    var bytes=new byte[size];Marshal.Copy(buffer,bytes,0,size);return bytes;
   }finally{Marshal.FreeHGlobal(buffer);}
  }
  throw new IOException("Native listener table kept changing");
 }
 internal static List<Listener> ParseTable(byte[] bytes,int family){
  if(bytes==null||bytes.Length<4||(family!=2&&family!=23))throw new IOException("Invalid native listener table");
  uint count=BitConverter.ToUInt32(bytes,0);int stride=family==2?24:56;
  if(4L+(long)count*stride>bytes.Length)throw new IOException("Truncated native listener table");
  var result=new List<Listener>();
  for(int i=0;i<(int)count;i++){
   int offset=4+i*stride,portOffset=offset+(family==2?8:20),pidOffset=offset+(family==2?20:52);
   var address=new byte[family==2?4:16];Array.Copy(bytes,offset+(family==2?4:0),address,0,address.Length);
   string text=family==2?new IPAddress(address).ToString():new IPAddress(address,BitConverter.ToUInt32(bytes,offset+16)).ToString();
   uint pid=BitConverter.ToUInt32(bytes,pidOffset);if(pid>Int32.MaxValue)throw new IOException("Invalid listener process ID");
   result.Add(new Listener{Address=text,Port=(bytes[portOffset]<<8)|bytes[portOffset+1],Pid=(int)pid});
  }
  return result;
 }
 internal static Dictionary<int,int> ReadParents(){
  IntPtr snapshot=CreateToolhelp32Snapshot(2,0);if(snapshot==new IntPtr(-1))throw new IOException("Cannot enumerate listener process ancestry");
  try{
   var result=new Dictionary<int,int>();var entry=new Entry();entry.size=(uint)Marshal.SizeOf(typeof(Entry));
   if(!Process32FirstW(snapshot,ref entry))throw new IOException("Cannot read listener process snapshot");
   do{
    if(entry.pid>Int32.MaxValue||entry.parent>Int32.MaxValue||result.ContainsKey((int)entry.pid))throw new IOException("Invalid listener process snapshot");
    result.Add((int)entry.pid,(int)entry.parent);
   }while(Process32NextW(snapshot,ref entry));
   if(Marshal.GetLastWin32Error()!=18)throw new IOException("Incomplete listener process snapshot");
   return result;
  }finally{CloseHandle(snapshot);}
 }
 internal static int Validate(IList<Listener> rows,int port,int hostPid,Dictionary<int,int> parents){
  if(port<1||port>65535||hostPid<=0||rows==null||parents==null)throw new IOException("Invalid listener verification scope");
  var selected=rows.Where(r=>r.Port==port).ToArray();if(selected.Length==0)throw new IOException("No native listener on the session port");
  if(selected.Any(r=>r.Address!="127.0.0.1"&&r.Address!="::1"))throw new IOException("Non-loopback session listener");
  if(selected.Any(r=>r.Pid<=0)||selected.Select(r=>r.Pid).Distinct().Count()!=1||selected.Select(r=>r.Address).Distinct().Count()!=selected.Length)throw new IOException("Ambiguous session listener ownership");
  int owner=selected[0].Pid,pid=owner;var seen=new HashSet<int>();
  if(!parents.ContainsKey(hostPid))throw new IOException("Launched host is no longer present");
  for(int depth=0;depth<20&&pid>0;depth++){
   int parent;if(!seen.Add(pid)||!parents.TryGetValue(pid,out parent))break;
   if(pid==hostPid)return owner;pid=parent;
  }
  throw new IOException("Listener is not owned by the launched host");
 }
 internal static object Verify(int port,int hostPid,Func<int,byte[]> table=null,Func<Dictionary<int,int>> processes=null){
  if(port<1||port>65535||hostPid<=0)throw new IOException("Invalid listener verification scope");
  table=table??(family=>ReadTable(family));processes=processes??ReadParents;
  // Both families must succeed. A partial query cannot exclude a foreign or
  // wildcard listener sharing the port in the other address family.
  var rows=ParseTable(table(2),2);rows.AddRange(ParseTable(table(23),23));
  int owner=Validate(rows,port,hostPid,processes());
  return new{schemaVersion=1,verified=true,source="native-listener-table",port=port,hostPid=hostPid,ownerPid=owner,addresses=rows.Where(r=>r.Port==port).Select(r=>r.Address).ToArray()};
 }
 internal static int Run(string[] args){
  try{
   int port,hostPid;
   if(args.Length!=3||!Int32.TryParse(args[1],System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out port)||!Int32.TryParse(args[2],System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out hostPid))throw new ArgumentException("Expected --verify-listener <port> <hostPid>");
   Console.WriteLine(new JavaScriptSerializer().Serialize(Verify(port,hostPid)));Console.Out.Flush();return 0;
  }catch(Exception error){Console.Error.WriteLine("Session listener verification failed: "+error.Message);return 1;}
 }
}

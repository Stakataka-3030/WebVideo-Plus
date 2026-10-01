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
[assembly: AssemblyVersion("1.1.3.0")]
[assembly: AssemblyFileVersion("1.1.3.0")]
[assembly: AssemblyInformationalVersion("1.1.3.0c")]

static class CraftStarter {
 static string Q(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
 [STAThread] static int Main(string[] args){
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
 internal static void HandleSessionOutput(string line,LaunchLog log,Action<string,bool> report){
  if(line==null)return;
  log.Write(line);
  const string prefix="WEBVIDEO_CRAFT_STATUS ";if(!line.StartsWith(prefix,StringComparison.Ordinal))return;
  try{var update=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line.Substring(prefix.Length));string stage=CraftManifestVerifier.Text(update,"stage"),message=CraftManifestVerifier.Text(update,"text");if(message.Length>0)report(message,stage=="ready");}
  catch(Exception error){log.Write("会话状态消息处理失败："+error.Message);}
 }
 static int Run(string[] args,Action<string,bool> report){
  string startupLog=Path.Combine(Path.GetTempPath(),"WebVideoCraft-Launcher-"+Guid.NewGuid().ToString("N")+".log");
  var log=new LaunchLog(startupLog);Mutex launchMutex=null;
  Action<string> record=log.Write;
  try{
   record("launcher-started");report("正在读取安装记录并校验全部启动文件…",false);
   string self=Assembly.GetExecutingAssembly().Location,home=Path.GetDirectoryName(self),statePath=null;var forwarded=new List<string>();
   for(int i=0;i<args.Length;i++){if(args[i]=="--"){forwarded.AddRange(args.Skip(i));break;}if((args[i]=="--state"||args[i]=="--config")&&i+1<args.Length){statePath=Path.GetFullPath(args[++i]);}else forwarded.Add(args[i]);}
   if(statePath==null)statePath=File.Exists(Path.Combine(home,"config.json"))?Path.Combine(home,"config.json"):Path.Combine(home,"webvideo-craft.install.json");
   // Both entry points resolve the same adapter record before expensive work.
   // The mutex only coordinates startup; it never substitutes for verification.
   string adapter=CraftManifestVerifier.Text(CraftManifestVerifier.Read(statePath),"adapterRoot");
   launchMutex=AcquireLaunchMutex(adapter);
   var state=CraftManifestVerifier.VerifyLaunch(statePath,self,message=>{record(message);report(message,false);});string root=CraftManifestVerifier.Text(state,"adapterRoot"),stateDir=CraftManifestVerifier.Text(state,"stateDir");
   if(!CraftManifestVerifier.Same(stateDir,Path.Combine(root,"state")))throw new IOException("会话目录不属于此适配器");CraftManifestVerifier.NoLinks(stateDir);Directory.CreateDirectory(Path.Combine(stateDir,"logs"));log.UsePrimary(Path.Combine(stateDir,"logs","launcher.log"));record("launcher-verified; startup log: "+startupLog);
   var package=CraftManifestVerifier.Get(state,"package");string node=CraftManifestVerifier.Under(root,CraftManifestVerifier.Text(package,"node")),script=CraftManifestVerifier.Under(root,CraftManifestVerifier.Text(package,"entry"));
   var command=new[]{script,"--state",Path.Combine(root,"config.json"),"--craft",CraftManifestVerifier.Text(state,"originalExe"),"--kernel",CraftManifestVerifier.Text(state,"kernelExe"),"--wrapper-pid",Process.GetCurrentProcess().Id.ToString()}.Concat(forwarded);
   // Only the child session configures WebView2. This wrapper never sets a
   // persistent environment variable, registry value or background service.
   report("启动文件校验完成，正在启动会话协调器…",false);
   using(var process=Process.Start(new ProcessStartInfo(node,String.Join(" ",command.Select(Q))){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true})){
    DataReceivedEventHandler append=(sender,e)=>HandleSessionOutput(e.Data,log,report);process.OutputDataReceived+=append;process.ErrorDataReceived+=append;process.BeginOutputReadLine();process.BeginErrorReadLine();process.WaitForExit();
    // The session may hand an update to an external one-shot coordinator. Exit
    // immediately so the original-name executable is no longer mapped/locked.
    if(process.ExitCode==75)return 0;
    if(process.ExitCode!=0)throw new IOException("Craft 会话启动失败（退出码 "+process.ExitCode+"）。");
    return process.ExitCode;
   }
  }catch(Exception error){record(error.ToString());throw new IOException(error.Message+"\n"+log.Diagnostic,error);}finally{if(launchMutex!=null){launchMutex.ReleaseMutex();launchMutex.Dispose();}}
 }
}

using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Linq;
using System.Drawing;
using System.Windows.Forms;
using System.ComponentModel;
[assembly: AssemblyVersion("1.1.3.0")]
[assembly: AssemblyFileVersion("1.1.3.0")]
[assembly: AssemblyInformationalVersion("1.1.3.0c")]

static class CraftSetup {
 static string DefaultTarget{get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebVideoCraft","adapter");}}
 static string DefaultCraft{get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGAL Craft","webgal-craft.exe");}}
 static string Q(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
 static string Arg(string[] args,string key,string fallback){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:fallback;}
 [STAThread] static int Main(string[] args){
  if(args.Contains("--dest"))try{Run(Arg(args,"--action","install"),Arg(args,"--dest",DefaultTarget),Arg(args,"--craft",DefaultCraft),Arg(args,"--mode","external"));return 0;}catch(Exception e){WriteError(e);return 1;}
  Application.EnableVisualStyles();
  using(var form=CreateForm(Run,(owner,text,title,icon)=>MessageBox.Show(owner,text,title,MessageBoxButtons.OK,icon)))Application.Run(form);
  return 0;
 }
 // The same form is exercised with an inert worker by the native GUI regression.
 // Worker callbacks never read controls; the complete request is captured first.
 internal static Form CreateForm(Action<string,string,string,string,Action<string>> operation,Action<IWin32Window,string,string,MessageBoxIcon> showMessage){
  var form=new Form{Text="WebVideo+ Craft · 安装与拆卸",ClientSize=new Size(640,418),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false};
  var title=new Label{Text="WebVideo+ Craft 适配器",Font=new Font("Microsoft YaHei UI",14,FontStyle.Bold),Location=new Point(22,18),AutoSize=true};
  var hint=new Label{Text="先关闭 Craft。默认使用独立启动器，不替换原程序。\n同名包装为待验证模式；官方更新后不会用旧备份覆盖新程序。",Location=new Point(24,58),Size=new Size(590,45)};
  var craft=new TextBox{Name="craftPath",Text=DefaultCraft,Location=new Point(24,127),Width=490};var craftLabel=new Label{Text="Craft 原程序",Location=new Point(24,106),AutoSize=true};var browseCraft=new Button{Name="browseCraft",Text="选择…",Location=new Point(526,125),Width=88};
  var target=new TextBox{Name="targetPath",Text=DefaultTarget,Location=new Point(24,190),Width=490};var targetLabel=new Label{Text="独立适配包目录（不可位于 Craft 目录内）",Location=new Point(24,168),AutoSize=true};var browseTarget=new Button{Name="browseTarget",Text="选择…",Location=new Point(526,188),Width=88};
  var sameName=new CheckBox{Name="sameName",Text="试验同名启动包装器（需隔离验证，保留可校验原程序备份）",Location=new Point(24,233),Width=590};
  var recover=new Button{Name="recover",Text="检查失效会话记录",Location=new Point(24,357),Width=180};var install=new Button{Name="install",Text="安装 / 更新",Location=new Point(388,357),Width=108};var remove=new Button{Name="remove",Text="拆卸并保留数据",Location=new Point(506,357),Width=108};
  var status=new Label{Name="status",Text="准备就绪",Location=new Point(24,268),Size=new Size(590,42)};
  var progress=new ProgressBar{Name="progress",Location=new Point(24,318),Size=new Size(590,16),Visible=false,MarqueeAnimationSpeed=30};
  var inputs=new Control[]{craft,target,browseCraft,browseTarget,sameName,recover,install,remove};
  var worker=new BackgroundWorker{WorkerReportsProgress=true};var timer=new Timer{Interval=1000};var elapsed=new Stopwatch();bool busy=false;string phase="",activeAction="";
  Action refreshStatus=()=>{status.Text=phase+"\n已用时 "+(int)elapsed.Elapsed.TotalSeconds+" 秒；完成前请勿退出。";};
  timer.Tick+=(sender,e)=>refreshStatus();
  browseCraft.Click+=(sender,e)=>{using(var picker=new OpenFileDialog{Filter="Craft 程序|webgal-craft.exe",FileName=craft.Text})if(picker.ShowDialog(form)==DialogResult.OK)craft.Text=picker.FileName;};
  browseTarget.Click+=(sender,e)=>{using(var picker=new FolderBrowserDialog{SelectedPath=Path.GetDirectoryName(target.Text),Description="选择适配包的上级目录"})if(picker.ShowDialog(form)==DialogResult.OK)target.Text=Path.Combine(picker.SelectedPath,"WebVideoCraft-adapter");};
  worker.DoWork+=(sender,e)=>{var request=(string[])e.Argument;operation(request[0],request[1],request[2],request[3],message=>worker.ReportProgress(0,message));};
  worker.ProgressChanged+=(sender,e)=>{phase=(string)e.UserState;refreshStatus();};
  worker.RunWorkerCompleted+=(sender,e)=>{
   timer.Stop();elapsed.Stop();progress.Visible=false;form.UseWaitCursor=false;
   if(e.Error!=null){
    status.Text="操作失败，可查看错误后重试。";string log=WriteError(e.Error);
    try{showMessage(form,e.Error.Message+(log==null?"":"\n\n错误日志："+log),"操作失败",MessageBoxIcon.Error);}finally{busy=false;foreach(var input in inputs)input.Enabled=true;}
   }else{
    status.Text="操作完成。";
    try{showMessage(form,activeAction=="install"?"安装完成。请使用适配包内的启动器；同名模式也可使用原快捷方式。":activeAction=="recover-session"?"已检查会话记录；只移除已确认对应进程全部退出的本适配器锁。":"已拆卸挂载。适配包、配置和日志保留。若官方已更新入口，新程序不会被旧备份覆盖。","WebVideo+ Craft",MessageBoxIcon.Information);}finally{busy=false;form.Close();}
   }
  };
  Action<string> start=action=>{
   if(busy)return;
   var request=new[]{action,target.Text,craft.Text,sameName.Checked?"same-name":"external"};
   busy=true;activeAction=action;foreach(var input in inputs)input.Enabled=false;
   phase="正在准备操作…";elapsed.Restart();refreshStatus();progress.Style=ProgressBarStyle.Marquee;progress.Visible=true;form.UseWaitCursor=true;timer.Start();
   worker.RunWorkerAsync(request);
  };
  // Closing an active installer could terminate its coordinator mid-transaction.
  // There is deliberately no unsafe cancel/kill or Application.DoEvents loop.
  form.FormClosing+=(sender,e)=>{if(busy){e.Cancel=true;refreshStatus();}};
  form.FormClosed+=(sender,e)=>{timer.Dispose();worker.Dispose();};
  recover.Click+=(sender,e)=>start("recover-session");install.Click+=(sender,e)=>start("install");remove.Click+=(sender,e)=>start("uninstall");
  form.Controls.AddRange(new Control[]{title,hint,craftLabel,craft,browseCraft,targetLabel,target,browseTarget,sameName,status,progress,recover,install,remove});
  return form;
 }
 static string WriteError(Exception error){try{string file=Path.Combine(Path.GetTempPath(),"WebVideoCraft-Setup-error.log");File.WriteAllText(file,error.ToString());return file;}catch{return null;}}
 static void Run(string action,string destination,string craft,string mode,Action<string> report=null){
  if(report==null)report=message=>{};
  report("正在检查路径…");
  if(!new[]{"install","uninstall","recover-session"}.Contains(action))throw new ArgumentException("仅支持 install / uninstall / recover-session");
  destination=Path.GetFullPath(destination);craft=Path.GetFullPath(craft);CraftManifestVerifier.NoLinks(destination);CraftManifestVerifier.NoLinks(craft);
  string temp=Path.Combine(Path.GetTempPath(),"WebVideoCraft-Setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
  try{
   // Coordinator runs outside both installation trees so renaming/upgrading the
   // package or releasing the host wrapper never overwrites its own executable.
   report("正在解压安装包（大包可能需要数分钟）…");Extract(temp);
   report("正在校验全部安装文件…");var manifest=CraftManifestVerifier.Verify(temp);string node=CraftManifestVerifier.Under(temp,CraftManifestVerifier.Text(manifest,"node")),manager=CraftManifestVerifier.Under(temp,"craft/installer/manage.mjs");
   var command=action=="install"?new[]{manager,"install","--package",temp,"--dest",destination,"--craft",craft,"--mode",mode,"--host-version",FileVersionInfo.GetVersionInfo(craft).ProductVersion??""}:new[]{manager,action,"--state",Path.Combine(destination,"config.json")};
   var info=new ProcessStartInfo(node,String.Join(" ",command.Select(Q))){WorkingDirectory=temp,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
   report(action=="install"?"正在安装 / 更新并校验事务…":action=="uninstall"?"正在安全拆卸…":"正在检查失效会话记录…");
   using(var process=Process.Start(info)){var stdout=process.StandardOutput.ReadToEndAsync();var stderr=process.StandardError.ReadToEndAsync();process.WaitForExit();System.Threading.Tasks.Task.WaitAll(stdout,stderr);if(process.ExitCode!=0)throw new IOException(stderr.Result+stdout.Result);}
  }finally{report("正在清理临时安装文件…");try{Directory.Delete(temp,true);}catch{}}
 }
 static void Extract(string target){
  using(var payload=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip")){
   if(payload==null)throw new IOException("安装器缺少负载");using(var zip=new ZipArchive(payload,ZipArchiveMode.Read)){
    string prefix=null;var seen=new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach(var entry in zip.Entries){string name=entry.FullName.Replace('\\','/');int slash=name.IndexOf('/');if(slash<1)throw new IOException("负载必须只有一个版本目录");string root=name.Substring(0,slash+1);if(root=="../"||root=="./"||root.IndexOf(':')>=0)throw new IOException("负载根目录无效");if(prefix==null)prefix=root;if(root!=prefix)throw new IOException("负载包含多个根目录");string relative=name.Substring(slash+1);if(relative==""||relative.EndsWith("/"))continue;if((entry.ExternalAttributes>>16&0xF000)==0xA000)throw new IOException("负载不能包含链接");if(!seen.Add(relative))throw new IOException("负载包含重复路径");string file=CraftManifestVerifier.Under(target,relative);Directory.CreateDirectory(Path.GetDirectoryName(file));using(var input=entry.Open())using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write))input.CopyTo(output);}
   }
  }
 }
}

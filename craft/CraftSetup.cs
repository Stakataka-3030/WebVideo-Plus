using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Linq;
using System.Drawing;
using System.Windows.Forms;
using System.ComponentModel;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Text;
[assembly: AssemblyVersion("1.1.12.0")]
[assembly: AssemblyFileVersion("1.1.12.0")]
[assembly: AssemblyInformationalVersion("1.1.12.0c")]


static class CraftSetup {
 static string DefaultTarget {get{return CraftSetupPaths.DefaultTarget;}}
 static string DefaultCraft {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGAL Craft","webgal-craft.exe");}}
 internal static string Q(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
 static string Arg(string[] args,string key,string fallback){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:fallback;}
 [STAThread] static int Main(string[] args){
  if(args.Contains("--dest"))try{
   var result=Run(new CraftSetupRequest{Action=Arg(args,"--action","install"),Destination=Arg(args,"--dest",DefaultTarget),Craft=Arg(args,"--craft",DefaultCraft),Mode=Arg(args,"--mode","same-name"),Cache=Arg(args,"--cache",Path.GetTempPath())},message=>{});
   return result.Status=="warning"?2:0;
  }catch(Exception error){WriteError(error);return 1;}
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  using(var form=CreateForm(Run,(owner,text,title,icon)=>MessageBox.Show(owner,text,title,MessageBoxButtons.OK,icon),
   (owner,text,title)=>MessageBox.Show(owner,text,title,MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)==DialogResult.Yes))Application.Run(form);
  return 0;
 }
 static Label TextLabel(string name,string text){return new Label{Name=name,Text=text,AutoSize=true,Dock=DockStyle.Top,Margin=new Padding(0,3,0,7),UseMnemonic=false};}
 static Button Button(string name,string text){return new Button{Name=name,Text=text,AutoSize=true,MinimumSize=new Size(90,32),Margin=new Padding(0,3,8,3)};}
 static FlowLayoutPanel Actions(params Control[] controls){var row=new FlowLayoutPanel{AutoSize=true,Dock=DockStyle.Top,WrapContents=true,Margin=new Padding(0)};row.Controls.AddRange(controls);return row;}
 static TableLayoutPanel PathRow(TextBox box,params Button[] buttons){
  var row=new TableLayoutPanel{ColumnCount=buttons.Length+1,RowCount=1,AutoSize=true,Dock=DockStyle.Top,Margin=new Padding(0,0,0,5)};
  row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));box.Dock=DockStyle.Fill;box.Margin=new Padding(0,7,8,3);row.Controls.Add(box,0,0);
  for(int i=0;i<buttons.Length;i++){row.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));row.Controls.Add(buttons[i],i+1,0);}return row;
 }
 static void AddRow(TableLayoutPanel panel,Control control){panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));panel.Controls.Add(control,0,panel.RowCount++);}
 // Dependencies are replaceable only for the isolated synthetic form regression.
 // Production operations, discovery and launch all keep their own safety checks.
 internal static Form CreateForm(Func<CraftSetupRequest,Action<string>,CraftSetupResult> operation,
  Action<IWin32Window,string,string,MessageBoxIcon> showMessage,Func<IWin32Window,string,string,bool> confirm,
  Func<string,string,string[]> discover=null,Action<string> launch=null,Action<string> openPath=null,Func<string,CraftInstallationInfo> readInstalled=null){
  discover=discover??CraftSetupPaths.FindCandidates;launch=launch??Launch;openPath=openPath??OpenPath;readInstalled=readInstalled??CraftSetupPaths.ReadInstalled;
  var form=new Form{Text="WebVideo+ Craft · 安装与管理",ClientSize=new Size(760,600),MinimumSize=new Size(560,430),StartPosition=FormStartPosition.CenterScreen,AutoScaleMode=AutoScaleMode.Font,AutoScroll=true,Font=new Font("Microsoft YaHei UI",9F)};
  var content=new TableLayoutPanel{Name="content",ColumnCount=1,RowCount=0,AutoSize=true,Dock=DockStyle.Top,Padding=new Padding(22),Margin=new Padding(0)};content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));form.Controls.Add(content);
  var title=TextLabel("title","WebVideo+ Craft 安装器");title.Font=new Font(form.Font.FontFamily,16,FontStyle.Bold);AddRow(content,title);
  AddRow(content,TextLabel("version","版本 "+Assembly.GetExecutingAssembly().GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute),false).Cast<AssemblyInformationalVersionAttribute>().First().InformationalVersion));
  AddRow(content,TextLabel("intro","选择已经安装的 Craft，然后点击安装。请先关闭 Craft。\n安装会安全备份原程序并替换原 EXE；以后仍从原 Craft 快捷方式或程序启动。"));
  AddRow(content,TextLabel("craftLabel","Craft 程序、安装文件夹或快捷方式"));
  var craft=new TextBox{Name="craftPath",Text="",AccessibleName="Craft 程序、文件夹或快捷方式"};
  var browseCraft=Button("browseCraft","选择文件…");var browseFolder=Button("browseFolder","选择文件夹…");AddRow(content,PathRow(craft,browseCraft,browseFolder));
  var find=Button("findCraft","自动查找");var installed=TextLabel("installed","尚未选择 Craft；可以自动查找，或拖入程序、文件夹和快捷方式。");var correctInstaller=Button("correctInstaller","下载对应的 Terre 安装器…");correctInstaller.Visible=false;AddRow(content,Actions(find,correctInstaller));AddRow(content,installed);
  var advancedToggle=new CheckBox{Name="advancedToggle",Text="高级设置（安装位置、安装缓存）",AutoSize=true,Dock=DockStyle.Top,Margin=new Padding(0,8,0,8)};AddRow(content,advancedToggle);
  var advanced=new TableLayoutPanel{Name="advanced",ColumnCount=1,RowCount=0,AutoSize=true,Dock=DockStyle.Top,Visible=false,Margin=new Padding(0,0,0,10),Padding=new Padding(12),BackColor=SystemColors.ControlLight};advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));AddRow(content,advanced);
  AddRow(advanced,TextLabel("targetLabel","增强组件安装位置（同时保存独立配置和日志）"));
  var target=new TextBox{Name="targetPath",Text=DefaultTarget,AccessibleName="增强组件安装位置"};var browseTarget=Button("browseTarget","选择…");AddRow(advanced,PathRow(target,browseTarget));
  AddRow(advanced,TextLabel("cacheLabel","安装准备缓存（完成或取消后清理本次临时文件）"));
  var cache=new TextBox{Name="cachePath",Text=Path.GetTempPath(),AccessibleName="安装准备缓存目录"};var browseCache=Button("browseCache","选择…");AddRow(advanced,PathRow(cache,browseCache));
  AddRow(advanced,TextLabel("cacheNote","这只改变安装器的解压位置；不会搬移既有配置，也不会改变导出工作缓存。"));
  AddRow(advanced,TextLabel("modeNote","仅使用原 Craft EXE 入口。旧版独立增强安装将迁移到原入口，保留配置和用户数据；不会自动搬移增强目录。"));
  var recover=Button("recover","检查失效会话记录");AddRow(advanced,Actions(recover));
  var shortcut=new CheckBox{Name="desktopShortcut",Text="安装完成后创建指向原 Craft EXE 的桌面快捷方式",AutoSize=true,Dock=DockStyle.Top,Margin=new Padding(0,4,0,7),Checked=false};AddRow(content,shortcut);
  var status=TextLabel("status","准备就绪");AddRow(content,status);
  var progress=new ProgressBar{Name="progress",Dock=DockStyle.Top,Height=12,Visible=false,MarqueeAnimationSpeed=30,Margin=new Padding(0,2,0,8)};AddRow(content,progress);
  var install=Button("install","安装增强组件");var repair=Button("repair","修复组件");var remove=Button("remove","卸载挂载…");var cancel=Button("cancel","退出");AddRow(content,Actions(install,repair,remove,cancel));
  var launchButton=Button("launch","启动 Craft");var folderButton=Button("openFolder","打开安装目录");var logs=Button("logs","打开本次日志");var copy=Button("copyError","复制详情");AddRow(content,Actions(launchButton,folderButton,logs,copy));
  var inputs=new Control[]{craft,target,cache,browseCraft,browseFolder,browseTarget,browseCache,recover,install,repair,remove,find,correctInstaller,advancedToggle,shortcut,launchButton,folderButton};
  bool busy=false,locating=false,changing=false,launching=false,routing=false;int selectionGeneration=0;string phase="",lastDetails="",lastLog=null;CraftSetupRequest active=null;CraftInstallationInfo info=null;
  var worker=new BackgroundWorker{WorkerReportsProgress=true};var finder=new BackgroundWorker();var ownerFinder=new BackgroundWorker();var starter=new BackgroundWorker();var router=new BackgroundWorker();var timer=new Timer{Interval=250};var detectTimer=new Timer{Interval=350};var elapsed=new Stopwatch();
  Action refreshInfo=null;Action updateButtons=()=>{
   foreach(var input in inputs)input.Enabled=!busy&&!locating&&!launching;
   install.Enabled=!busy&&!locating&&!launching&&!CraftSetupPaths.DetectProduct(craft.Text).WrongForCraft;bool owned=info!=null&&info.Valid;correctInstaller.Enabled=!busy&&!locating&&!launching&&!routing;
   repair.Enabled=!busy&&!locating&&!launching&&owned&&info.Mode=="same-name"&&info.Status=="installed"&&File.Exists(info.CraftExe);remove.Enabled=!busy&&!locating&&!launching&&owned&&info.Status!="detached";recover.Enabled=!busy&&!locating&&!launching&&owned;
   launchButton.Enabled=!busy&&!locating&&!launching&&owned&&info.Mode=="same-name"&&info.Status=="installed"&&File.Exists(info.CraftExe);
   folderButton.Enabled=!busy&&!locating&&!launching&&owned&&Directory.Exists(info.AdapterRoot);
   logs.Enabled=!String.IsNullOrEmpty(lastLog)&&File.Exists(lastLog);copy.Enabled=!String.IsNullOrEmpty(lastDetails);
   cancel.Text=busy?(active!=null&&active.CanCancel?"取消准备":"正在安全完成…"):"退出";cancel.Enabled=!launching&&(!busy||active!=null&&active.CanCancel);
  };
  refreshInfo=()=>{
   if(busy||changing)return;
   var detectedProduct=CraftSetupPaths.DetectProduct(craft.Text);
   correctInstaller.Visible=detectedProduct.Product=="terre";
   if(detectedProduct.WrongForCraft){info=null;installed.Text=detectedProduct.CraftGuidance;updateButtons();install.Enabled=false;repair.Enabled=false;launchButton.Enabled=false;return;}
   info=readInstalled(target.Text);
   string selected=null;try{selected=CraftSetupPaths.ResolveCraftSelection(craft.Text);}catch{}
   bool matchesRecordedPath=false;if(info.Valid&&!String.IsNullOrWhiteSpace(craft.Text))try{matchesRecordedPath=CraftManifestVerifier.Same(CraftSetupPaths.NormalizeFolder(craft.Text),info.CraftExe);}catch{}
   if(info.Valid&&!String.IsNullOrWhiteSpace(craft.Text)&&!matchesRecordedPath&&(selected==null||!CraftManifestVerifier.Same(selected,info.CraftExe))){info.Valid=false;info.Message="所选 Craft 与增强目录的安装记录不匹配。请选回对应程序，或在高级设置中选择独立的增强目录。";}
   if(info.Valid){
    installed.Text=info.Message;install.Text=info.Status=="installed"?"更新 / 重新检查":"重新安装";
    if(String.IsNullOrWhiteSpace(craft.Text)){changing=true;craft.Text=info.CraftExe;changing=false;}
   }else{install.Text="安装增强组件";installed.Text=info.Exists?info.Message:selected==null?"尚未识别 Craft。请选择 webgal-craft.exe、所在文件夹或它的快捷方式。":"已找到 Craft。安装时仍会核对宿主兼容性和完整性。";}
   updateButtons();
  };
  Action refreshStatus=()=>{status.Text=phase+"\n已用时 "+(int)elapsed.Elapsed.TotalSeconds+" 秒。"+(active!=null&&active.CanCancel?" 可取消准备。":" 正在完成安全事务，请勿强制退出。");updateButtons();};
  timer.Tick+=(sender,e)=>refreshStatus();
  detectTimer.Tick+=(sender,e)=>{detectTimer.Stop();refreshInfo();};
  target.TextChanged+=(sender,e)=>{if(!changing&&!busy){info=null;updateButtons();detectTimer.Stop();detectTimer.Start();}};
  craft.TextChanged+=(sender,e)=>{selectionGeneration++;correctInstaller.Visible=false;if(!changing&&!busy){info=null;updateButtons();detectTimer.Stop();detectTimer.Start();}};
  advancedToggle.CheckedChanged+=(sender,e)=>{advanced.Visible=advancedToggle.Checked;};
  Action<string> resolveOwner=null;
  Action<string> selectCraft=value=>{
   try{var product=CraftSetupPaths.DetectProduct(value);if(product.WrongForCraft){craft.Text=value;refreshInfo();showMessage(form,product.CraftGuidance,"安装器产品不匹配",MessageBoxIcon.Warning);return;}var selectedInstallation=CraftSetupPaths.ResolveInstalledSelection(value);string resolved=selectedInstallation==null?CraftSetupPaths.ResolveCraftSelection(value):selectedInstallation.CraftExe;if(resolved==null)throw new IOException("没有找到 webgal-craft.exe。请选择 Craft 安装文件夹、程序或指向它的快捷方式。");craft.Text=resolved;if(selectedInstallation!=null&&CraftManifestVerifier.Same(selectedInstallation.CraftExe,resolved))target.Text=selectedInstallation.AdapterRoot;
    // Read an adjacent ownership record only to locate metadata. The operation
    // still validates all ownership and hashes independently before any write.
    string record=Path.Combine(Path.GetDirectoryName(resolved),"webvideo-craft.install.json");
    if(File.Exists(record)){var state=CraftManifestVerifier.Read(record);string candidate=CraftManifestVerifier.Text(state,"adapterRoot");var known=CraftSetupPaths.ReadInstalled(candidate);if(known.Valid&&CraftManifestVerifier.Same(known.CraftExe,resolved))target.Text=known.AdapterRoot;}
    refreshInfo();if((info==null||!info.Valid)&&resolveOwner!=null)resolveOwner(resolved);
   }catch(Exception error){showMessage(form,error.Message,"选择 Craft",MessageBoxIcon.Warning);}
  };
  router.DoWork+=(sender,e)=>{var request=(object[])e.Argument;e.Result=new object[]{request[0],request[1],InstallerProductRouting.Fetch("terre",(string)request[2])};};
  router.RunWorkerCompleted+=(sender,e)=>{
   if(form.IsDisposed||form.Disposing)return;routing=false;updateButtons();
   if(e.Error!=null){status.Text="对应安装器下载地址查询失败，请稍后重试。";lastDetails=e.Error.Message;return;}
   var response=(object[])e.Result;if((int)response[0]!=selectionGeneration||(string)response[1]!=craft.Text)return;
   var download=(InstallerDownload)response[2];status.Text=download.Message;
   if(!String.IsNullOrEmpty(download.Url))try{Process.Start(new ProcessStartInfo(download.Url){UseShellExecute=true});}catch(Exception error){lastDetails=error.Message;showMessage(form,"无法打开下载地址："+download.Url,"下载对应安装器",MessageBoxIcon.Warning);}
  };
  correctInstaller.Click+=(sender,e)=>{
   if(busy||locating||launching||routing)return;var product=CraftSetupPaths.DetectProduct(craft.Text);if(product.Product!="terre"){refreshInfo();return;}
   string engine=CraftSetupPaths.DetectTerreEngine(craft.Text);
   if(String.IsNullOrEmpty(engine)){engine=ChooseCandidate(form,new[]{"4.6.4","4.6.5"},"无法确认此 Terre 的引擎，请选择要下载的兼容版本");if(engine==null)return;}
   routing=true;status.Text="正在查找匹配 WebGAL "+engine+" 的 Terre 正式安装器…";updateButtons();router.RunWorkerAsync(new object[]{selectionGeneration,craft.Text,engine});
  };
  browseCraft.Click+=(sender,e)=>{using(var picker=new OpenFileDialog{Filter="Craft 程序或快捷方式|*.exe;*.lnk|所有文件|*.*",CheckFileExists=true,DereferenceLinks=false,Title="选择 webgal-craft.exe 或 Craft 快捷方式"})if(picker.ShowDialog(form)==DialogResult.OK)selectCraft(picker.FileName);};
  browseFolder.Click+=(sender,e)=>{using(var picker=new FolderBrowserDialog{Description="选择包含 webgal-craft.exe 的 Craft 安装文件夹"})if(picker.ShowDialog(form)==DialogResult.OK)selectCraft(picker.SelectedPath);};
  Action<TextBox,string> chooseFolder=(box,description)=>{using(var picker=new FolderBrowserDialog{Description=description}){if(Directory.Exists(box.Text))picker.SelectedPath=box.Text;if(picker.ShowDialog(form)==DialogResult.OK)box.Text=picker.SelectedPath;}};
  browseTarget.Click+=(sender,e)=>chooseFolder(target,"选择增强组件的实际安装目录；请选择空目录或已有 WebVideo+ Craft 目录");browseCache.Click+=(sender,e)=>chooseFolder(cache,"选择安装器解压缓存位置（需有足够空闲空间）");
  craft.AllowDrop=true;craft.DragEnter+=(sender,e)=>{if(!busy&&!locating&&e.Data.GetDataPresent(DataFormats.FileDrop))e.Effect=DragDropEffects.Copy;};
  craft.DragDrop+=(sender,e)=>{var files=e.Data.GetData(DataFormats.FileDrop) as string[];if(!busy&&!locating&&files!=null&&files.Length==1)selectCraft(files[0]);};
  ownerFinder.DoWork+=(sender,e)=>{e.Result=CraftSetupPaths.FindInstallations((string)e.Argument);};
  ownerFinder.RunWorkerCompleted+=(sender,e)=>{
   if(form.IsDisposed||form.Disposing)return;locating=false;
   if(e.Error!=null){status.Text="已选择 Craft，但增强安装位置查找未完成。可在高级设置中手动选择。";lastDetails=e.Error.Message;}
   else{var owners=(CraftInstallationInfo[])e.Result;if(owners.Length==1){target.Text=owners[0].AdapterRoot;status.Text="已找到这份 Craft 的增强组件安装位置。";}else if(owners.Length>1){string chosen=ChooseCandidate(form,owners.Select(owner=>owner.AdapterRoot).ToArray(),"选择这份 Craft 的增强组件目录");if(chosen!=null)target.Text=chosen;status.Text=chosen==null?"发现多个增强目录；请确认要管理的目录。":"已选择已有增强目录。";}else status.Text="已选择 Craft。确认安装位置后即可继续。";}
   refreshInfo();updateButtons();
  };
  resolveOwner=value=>{if(busy||locating||launching)return;locating=true;status.Text="正在查找这份 Craft 对应的增强目录…";updateButtons();ownerFinder.RunWorkerAsync(value);};
  finder.DoWork+=(sender,e)=>{var values=(string[])e.Argument;e.Result=discover(values[0],values[1]);};
  finder.RunWorkerCompleted+=(sender,e)=>{
   if(form.IsDisposed||form.Disposing)return;locating=false;
   if(e.Error!=null){status.Text="自动查找未完成，请手动选择。";lastDetails=e.Error.Message;}
   else{var choices=(string[])e.Result;if(choices.Length==1){selectCraft(choices[0]);if(!locating)status.Text="已找到 Craft。确认后即可安装。";}else if(choices.Length>1){string chosen=ChooseCandidate(form,choices);if(chosen!=null)selectCraft(chosen);if(!locating)status.Text=chosen==null?"找到多份 Craft；请选择要管理的那一份。":"已选择 Craft。";}else status.Text="没有自动找到 Craft。请选择程序、文件夹或快捷方式。";}
   refreshInfo();updateButtons();
  };
  Action startFinding=()=>{if(busy||locating||launching)return;locating=true;status.Text="正在检查常见安装位置和快捷方式…";updateButtons();finder.RunWorkerAsync(new[]{craft.Text,target.Text});};find.Click+=(sender,e)=>startFinding();
  worker.DoWork+=(sender,e)=>{e.Result=operation((CraftSetupRequest)e.Argument,message=>worker.ReportProgress(0,message));};
  worker.ProgressChanged+=(sender,e)=>{phase=(string)e.UserState;refreshStatus();};
  worker.RunWorkerCompleted+=(sender,e)=>{
   timer.Stop();elapsed.Stop();progress.Visible=false;form.UseWaitCursor=false;busy=false;
   if(e.Error!=null){lastDetails=FriendlyError(e.Error)+"\n\n"+e.Error;lastLog=FindLog(e.Error)??WriteError(e.Error);status.Text=FriendlyError(e.Error)+"\n可查看日志，调整后重试。";showMessage(form,FriendlyError(e.Error)+"\n\n可点击“打开本次日志”或“复制详情”，调整后重试。","操作未完成",MessageBoxIcon.Error);}
   else{var result=(CraftSetupResult)e.Result;lastLog=result.LogFile;lastDetails=result.Message;status.Text=result.Message;}
   refreshInfo();updateButtons();
  };
  Action<string> start=action=>{
   if(busy||locating||launching)return;
   if(action=="uninstall"&&!confirm(form,"卸载这份 Craft 的增强挂载？\n\n将保留增强组件、配置、日志和用户数据；不会删除已导出视频或游戏工程。原 Craft 快捷方式可继续启动官方程序。\n\n如果官方程序已经变化，会停止并说明情况，不用旧备份覆盖它。","确认卸载挂载"))return;
   active=new CraftSetupRequest{Action=action,Destination=target.Text,Craft=craft.Text,Mode="same-name",Cache=cache.Text,DesktopShortcut=shortcut.Checked};
   busy=true;lastDetails="";phase="正在检查路径和安装记录…";elapsed.Restart();refreshStatus();progress.Style=ProgressBarStyle.Marquee;progress.Visible=true;form.UseWaitCursor=true;timer.Start();updateButtons();worker.RunWorkerAsync(active);
  };
  install.Click+=(sender,e)=>start("install");repair.Click+=(sender,e)=>start("repair");remove.Click+=(sender,e)=>start("uninstall");recover.Click+=(sender,e)=>start("recover-session");
  cancel.Click+=(sender,e)=>{if(!busy){form.Close();return;}if(active.RequestCancel()){phase="已请求取消，正在清理本次临时文件…";refreshStatus();}};
  // Close/Alt+F4 never terminate an in-flight transaction. Preparation may be
  // cancelled explicitly, after which the normal completion path unlocks UI.
  form.FormClosing+=(sender,e)=>{if(busy||launching){e.Cancel=true;if(busy)refreshStatus();}};
  starter.DoWork+=(sender,e)=>launch((string)e.Argument);starter.RunWorkerCompleted+=(sender,e)=>{launching=false;if(e.Error!=null){lastDetails=e.Error.ToString();status.Text=FriendlyError(e.Error);showMessage(form,status.Text,"启动未完成",MessageBoxIcon.Error);}else status.Text="Craft 原入口已打开；启动进度和完整性检查会在新窗口中显示。";updateButtons();};
  launchButton.Click+=(sender,e)=>{if(busy||locating||launching||info==null||!info.Valid)return;launching=true;status.Text="正在打开 Craft 原入口…";updateButtons();starter.RunWorkerAsync(info.AdapterRoot);};
  folderButton.Click+=(sender,e)=>{try{openPath(info.AdapterRoot);}catch(Exception error){showMessage(form,error.Message,"打开目录",MessageBoxIcon.Warning);}};
  logs.Click+=(sender,e)=>{try{openPath(lastLog);}catch(Exception error){showMessage(form,error.Message,"打开日志",MessageBoxIcon.Warning);}};
  copy.Click+=(sender,e)=>{try{Clipboard.SetText(lastDetails+(lastLog==null?"":"\n日志："+lastLog));}catch(Exception error){showMessage(form,error.Message,"复制详情",MessageBoxIcon.Warning);}};
  form.FormClosed+=(sender,e)=>{timer.Dispose();detectTimer.Dispose();worker.Dispose();finder.Dispose();ownerFinder.Dispose();starter.Dispose();router.Dispose();};
  form.Shown+=(sender,e)=>{var area=Screen.FromControl(form).WorkingArea;form.MinimumSize=new Size(Math.Min(form.MinimumSize.Width,area.Width),Math.Min(form.MinimumSize.Height,area.Height));form.Size=new Size(Math.Min(form.Width,area.Width),Math.Min(form.Height,area.Height));refreshInfo();if(String.IsNullOrWhiteSpace(craft.Text))startFinding();};
  bool layingOut=false;Action fitText=null;fitText=()=>{if(layingOut||form.IsDisposed)return;layingOut=true;try{
   int width=Math.Max(180,form.ClientSize.Width-SystemInformation.VerticalScrollBarWidth);content.MaximumSize=new Size(width,0);
   foreach(var panel in new[]{content,advanced})foreach(Control control in panel.Controls){if(control is Label||control is CheckBox)control.MaximumSize=new Size(Math.Max(100,panel.ClientSize.Width-panel.Padding.Horizontal-control.Margin.Horizontal),0);}
  }finally{layingOut=false;}};
  form.ClientSizeChanged+=(sender,e)=>fitText();content.SizeChanged+=(sender,e)=>fitText();advanced.SizeChanged+=(sender,e)=>fitText();form.FontChanged+=(sender,e)=>fitText();fitText();
  refreshInfo();updateButtons();return form;
 }
 static string ChooseCandidate(Form owner,string[] choices,string title="选择要管理的 Craft"){
  using(var dialog=new Form{Text=title,StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(680,280),MinimumSize=new Size(400,240),Font=owner.Font,AutoScaleMode=AutoScaleMode.Font}){
   var list=new ListBox{Dock=DockStyle.Fill,HorizontalScrollbar=true};list.Items.AddRange(choices);
   var buttons=new FlowLayoutPanel{Dock=DockStyle.Bottom,AutoSize=true,FlowDirection=FlowDirection.RightToLeft};var ok=Button("select","使用所选目录");var cancel=Button("back","返回");ok.Enabled=false;cancel.DialogResult=DialogResult.Cancel;list.SelectedIndexChanged+=(s,e)=>ok.Enabled=list.SelectedIndex>=0;ok.Click+=(s,e)=>dialog.DialogResult=DialogResult.OK;buttons.Controls.AddRange(new Control[]{cancel,ok});dialog.Controls.Add(list);dialog.Controls.Add(buttons);dialog.AcceptButton=ok;dialog.CancelButton=cancel;
   var area=Screen.FromControl(owner).WorkingArea;dialog.MinimumSize=new Size(Math.Min(dialog.MinimumSize.Width,area.Width),Math.Min(dialog.MinimumSize.Height,area.Height));dialog.Size=new Size(Math.Min(dialog.Width,area.Width),Math.Min(dialog.Height,area.Height));
   return dialog.ShowDialog(owner)==DialogResult.OK?(string)list.SelectedItem:null;
  }
 }
 static void OpenPath(string path){if(String.IsNullOrEmpty(path)||!Directory.Exists(path)&&!File.Exists(path))throw new IOException("位置已不存在。");Process.Start(new ProcessStartInfo(path){UseShellExecute=true});}
 static void Launch(string destination){
  var info=CraftSetupPaths.ReadInstalled(destination);if(!info.Valid||info.Mode!="same-name"||info.Status!="installed")throw new IOException("请先完成安装或迁移，再启动 Craft。");
  // Hashes are checked by the launched wrapper before it executes any payload.
  // Check its own recorded hash first so a substituted executable is never run.
  CraftManifestVerifier.NoLinks(info.LauncherPath);var state=CraftManifestVerifier.Read(info.StatePath);
  if(!File.Exists(info.LauncherPath)||CraftManifestVerifier.Hash(info.LauncherPath)!=CraftManifestVerifier.Text(CraftManifestVerifier.Get(state,"ownership"),"wrapperSha256"))throw new IOException("增强启动器已损坏或被替换，请先修复组件。");
  Process.Start(new ProcessStartInfo(info.LauncherPath){WorkingDirectory=Path.GetDirectoryName(info.CraftExe),UseShellExecute=false});
 }
 internal static string FriendlyError(Exception error){
  string text=error.Message;
  if(text.Contains("Session lock")||text.Contains("session process")||text.Contains("session lease"))return "Craft 或增强会话仍在运行。请先正常退出；如果已经退出，可在高级设置中检查失效会话记录。";
  if(text.Contains("Unsupported Craft host")||text.Contains("Changed/unowned executable"))return "Craft 主程序已变化，或版本尚未验证。安装器没有覆盖它；请核对官方版本及安装日志。";
  if(text.Contains("Package integrity")||text.Contains("安装文件校验失败"))return "增强组件完整性检查未通过。已安装的组件可尝试“修复组件”；若安装包本身损坏，请重新获取安装包。";
  if(text.Contains("another host/mode"))return "此增强目录属于另一份 Craft，或旧模式不能进行这项操作。请选回对应目录；旧独立安装请点击“更新 / 重新检查”迁移。";
  if(text.Contains("unowned adapter"))return "所选增强目录不属于可验证的安装。请选择新的空目录，或找回原安装目录。";
  return text;
 }
 static string FindLog(Exception error){string file=error.Data["SetupLog"] as string;return file!=null&&File.Exists(file)?file:null;}
 static string WriteError(Exception error){try{string file=Path.Combine(Path.GetTempPath(),"WebVideoCraft-Setup-error-"+Guid.NewGuid().ToString("N")+".log");File.WriteAllText(file,error.ToString());return file;}catch{return null;}}
 static string ProgressText(string stage){
  switch(stage){case "validate-source":return "正在校验安装源…";case "validate-owned":return "正在检查已有安装与所有权…";case "stage-package":return "正在准备新组件副本…";case "verify-stage":return "正在校验待安装文件…";case "preserve-state":return "正在保留配置和用户数据…";case "publish":return "正在切换已验证的组件…";case "update-host":return "正在更新启动挂载…";case "record-state":return "正在写入安装记录…";case "cleanup":return "正在清理事务文件…";case "rollback":return "操作未完成，正在安全回滚…";case "complete":return "事务已结束，正在整理结果…";default:return "正在处理安装事务…";}
 }
 static CraftSetupResult Run(CraftSetupRequest request,Action<string> report){
  CraftSetupResult outcome=null;string temp=null;string log=Path.Combine(Path.GetTempPath(),"WebVideoCraft-Setup-"+Guid.NewGuid().ToString("N")+".log");var logGate=new object();
  Action<string> record=message=>{lock(logGate){try{File.AppendAllText(log,DateTime.UtcNow.ToString("o")+" "+message+Environment.NewLine);}catch{}}};
  Action<string> phase=message=>{record(message);report(message);};
  try{
   phase("正在检查路径…");request.ThrowIfCancelled();
   if(!new[]{"install","repair","uninstall","recover-session"}.Contains(request.Action))throw new ArgumentException("仅支持 install / repair / uninstall / recover-session");
   bool installing=request.Action=="install"||request.Action=="repair";
   if(installing&&request.Mode!="same-name")throw new ArgumentException("此版本仅支持替换原 Craft EXE；旧独立入口模式已移除。");
   if(installing){var product=CraftSetupPaths.DetectProduct(request.Craft);if(product.WrongForCraft)throw new IOException(product.CraftGuidance);request.Craft=CraftSetupPaths.ResolveCraftSelection(request.Craft);if(request.Craft==null)throw new IOException("请选择可识别的 Craft 程序、文件夹或快捷方式。");request.Destination=CraftSetupPaths.Validate(request.Destination,request.Craft);}
   else {var info=CraftSetupPaths.ReadInstalled(request.Destination);if(!info.Valid)throw new IOException(info.Message);request.Destination=info.AdapterRoot;request.Craft=info.CraftExe;}
   request.Cache=CraftSetupPaths.ValidateCache(request.Cache,request.Destination,request.Craft,!installing);
   temp=Path.Combine(request.Cache,"WebVideoCraft-Setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
   phase("正在解压安装包（可取消准备）…");Extract(temp,request,phase);
   var manifest=CraftManifestVerifier.Verify(temp,false,message=>{request.ThrowIfCancelled();phase(message);});
   string node=CraftManifestVerifier.Under(temp,CraftManifestVerifier.Text(manifest,"node")),manager=CraftManifestVerifier.Under(temp,"craft/installer/manage.mjs");
   var command=installing?new[]{manager,request.Action,"--package",temp,"--dest",request.Destination,"--craft",request.Craft,"--mode",request.Mode,"--host-version",FileVersionInfo.GetVersionInfo(request.Craft).ProductVersion??""}:new[]{manager,request.Action,"--state",Path.Combine(request.Destination,"config.json")};
   var processInfo=new ProcessStartInfo(node,String.Join(" ",command.Select(Q))){WorkingDirectory=temp,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
   request.BeginMutation();phase("准备完成，正在执行安全事务（此阶段不能取消）…");
   CraftSetupResult result;
   using(var process=new Process{StartInfo=processInfo}){
    process.ErrorDataReceived+=(sender,e)=>{if(e.Data==null)return;record(e.Data);try{var value=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(e.Data);if(CraftManifestVerifier.Text(value,"type")=="progress")report(ProgressText(CraftManifestVerifier.Text(value,"stage")));}catch{}};
    process.Start();var stdout=process.StandardOutput.ReadToEndAsync();process.BeginErrorReadLine();process.WaitForExit();string output=stdout.GetAwaiter().GetResult();record(output);result=CraftSetupProtocol.ParseResult(output,process.ExitCode,request.Action);
   }
   if(result.Installed&&installing){try{phase("正在检查 Craft 原入口快捷方式…");string link=request.DesktopShortcut?CraftSetupPaths.CreateDesktopShortcut(request.Destination):CraftSetupPaths.MigrateLegacyDesktopShortcut(request.Destination);if(link!=null)result.Message+="\n桌面快捷方式："+link;}catch(Exception error){result.Status="warning";result.Message+="\n组件已安装，但桌面快捷方式未创建："+error.Message+"\n仍可点击“启动 Craft”。";record(error.ToString());}}
   result.LogFile=log;outcome=result;return outcome;
  }catch(OperationCanceledException){outcome=new CraftSetupResult{Cancelled=true,Message="已取消准备；未启动安装事务。可以调整设置后重新尝试。",LogFile=log};return outcome;}
  catch(Exception error){record(error.ToString());var failure=new IOException(FriendlyError(error)+"\n本次日志："+log,error);failure.Data["SetupLog"]=log;throw failure;}
  finally{if(temp!=null){phase("正在清理本次临时安装文件…");try{Directory.Delete(temp,true);}catch(Exception error){record("临时文件清理未完成："+temp+"；"+error.Message);if(outcome!=null){outcome.Status="warning";outcome.Message+="\n本次解压缓存未能完全清理，仍保留在："+temp+"。可在退出安装器后手动检查。";}}}}
 }
 static void Extract(string target,CraftSetupRequest request,Action<string> report){
  using(var payload=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip")){
   if(payload==null)throw new IOException("安装器缺少负载");using(var zip=new ZipArchive(payload,ZipArchiveMode.Read)){
    string prefix=null;var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=zip.Entries.Sum(entry=>entry.Length),written=0;var timer=Stopwatch.StartNew();var buffer=new byte[81920];
    foreach(var entry in zip.Entries){request.ThrowIfCancelled();string name=entry.FullName.Replace('\\','/');int slash=name.IndexOf('/');if(slash<1)throw new IOException("负载必须只有一个版本目录");string root=name.Substring(0,slash+1);if(root=="../"||root=="./"||root.IndexOf(':')>=0)throw new IOException("负载根目录无效");if(prefix==null)prefix=root;if(root!=prefix)throw new IOException("负载包含多个根目录");string relative=name.Substring(slash+1);if(relative==""||relative.EndsWith("/"))continue;if((entry.ExternalAttributes>>16&0xF000)==0xA000)throw new IOException("负载不能包含链接");if(!seen.Add(relative))throw new IOException("负载包含重复路径");string file=CraftManifestVerifier.Under(target,relative);Directory.CreateDirectory(Path.GetDirectoryName(file));
     using(var input=entry.Open())using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write)){int count;while((count=input.Read(buffer,0,buffer.Length))>0){request.ThrowIfCancelled();output.Write(buffer,0,count);written+=count;if(timer.ElapsedMilliseconds>=250){report("正在解压 "+(written/1048576)+" / "+(total/1048576)+" MB："+relative);timer.Restart();}}}
    }
   }
  }
 }
}

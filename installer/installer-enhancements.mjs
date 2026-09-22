export function applyInstallerEnhancements(source,{productVersion,internalVersion,kernelVersion}){
 let s=source;
 const replace=(a,b)=>{if(!s.includes(a))throw Error('Missing enhanced installer anchor '+a);s=s.replace(a,b);};
 const between=(a,b,t)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0)throw Error('Missing enhanced installer range '+a);s=s.slice(0,i)+t+s.slice(j);};

 between(' public void Install(', '\n}\npublic class InstallationState', ` public void Install(RuntimePlan p,string terre,string games,string output,string url,string dataDir,string workDir,string installCache,bool keepRecovery,bool force,bool start){
  Report("正在应用 WebVideo+ 模块选择…");var args=new List<string>{"install","--terre-dir",terre,"--games-root",games,"--output-dir",output,"--terre-url",url,"--state-dir",dataDir,"--work-dir",workDir,"--install-cache-dir",installCache,"--keep-recovery",keepRecovery?"true":"false","--runtime-path",p.RuntimePath,"--modules",string.Join(",",p.RequestedModules)};if(force)args.AddRange(new[]{"--force","true"});
  Run(Path.Combine(p.Payload,"WebVideoPlus.Manager.exe"),args,p.RuntimePath,p.Payload);if(start&&p.Modules.Length>0){Report("正在启动 Terre 与 WebVideo+…");Run(Path.Combine(p.Payload,"WebVideoPlus.Manager.exe"),new[]{"launch","--terre-dir",terre},p.RuntimePath,p.Payload);}Report("安装完成。",100);
 }
 public void CleanupInstallCache(bool deleteCache,bool deleteConfig){
  try{
   string registry=Path.Combine(Root,"instances.json"),defaultRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter"),marker=Path.Combine(Root,".webvideo-install-cache");
   bool isDefault=String.Equals(Path.GetFullPath(Root).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),Path.GetFullPath(defaultRoot).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),StringComparison.OrdinalIgnoreCase),markerOwned=File.Exists(marker),safeRecursiveCleanup=isDefault;
   if(markerOwned&&!isDefault)try{var ownership=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(marker));safeRecursiveCleanup=ownership.ContainsKey("safeRecursiveCleanup")&&Convert.ToBoolean(ownership["safeRecursiveCleanup"]);}catch{safeRecursiveCleanup=false;}
   bool trusted=isDefault||markerOwned||File.Exists(registry);if((deleteCache||deleteConfig)&&!trusted){Report("安装缓存目录缺少 WebVideo+ 归属标记，未自动删除："+Root);return;}
   bool shared=false;if(File.Exists(registry))try{var doc=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(registry));if(doc.ContainsKey("instances"))shared=((System.Collections.IEnumerable)doc["instances"]).Cast<object>().Any();}catch{shared=true;}
   if(deleteCache){
    foreach(var file in Directory.GetFiles(Root,"payload-*.zip"))try{File.Delete(file);}catch{}
    if(safeRecursiveCleanup){foreach(var name in new[]{"downloads","packages"}){var dir=Path.Combine(Root,name);if(Directory.Exists(dir))Directory.Delete(dir,true);}if(!shared){var tools=Path.Combine(Root,"tools");if(Directory.Exists(tools))Directory.Delete(tools,true);}}
    else Report("安装缓存位于共享或高风险目录；为避免误删其它文件，未递归删除 downloads / packages / tools。");
    if(!shared&&File.Exists(registry))try{File.Delete(registry);}catch{}
   }
   if(deleteConfig){
    if(safeRecursiveCleanup){foreach(var name in new[]{"last-install.json","installer.log"}){var file=Path.Combine(Root,name);if(File.Exists(file))try{File.Delete(file);}catch{}}if(deleteCache&&!shared&&File.Exists(marker))try{File.Delete(marker);}catch{}}
    else Report("共享或高风险安装缓存目录中的根级配置文件已保留，避免删除同名外部文件。");
   }
   if(safeRecursiveCleanup&&Directory.Exists(Root)&&!Directory.EnumerateFileSystemEntries(Root).Any())Directory.Delete(Root);
  }catch(Exception e){Report("部分安装缓存未能删除："+e.Message);}
 }
`);

 replace(' }catch{state.UpdateAvailable=false;state.Message="安装记录无法读取，请核对所选目录。";}return state;}',
         ' }catch{state.UpdateAvailable=state.ValidTerre;state.Message=state.ValidTerre?"安装记录不完整或文件已变化；仍可点击应用更改，必要时安装器会提供强制修复。":"安装记录无法读取，请核对所选目录。";}return state;}');
 replace('state.Mounted=product||File.Exists(Path.Combine(directory,"video-export-wrapper.json"));','state.Mounted=product||File.Exists(Path.Combine(directory,"video-export-wrapper.json"))||Directory.Exists(Path.Combine(directory,"video-export"))||Directory.Exists(directory)&&Directory.GetFiles(directory,"*.video-original.exe").Length>0;');

 replace('TextBox terre,games,output,url;','TextBox terre,games,output,url,dataDir,workDir,installCache;');
 replace('CheckBox advancedToggle,start,navigatorModule,selectorModule,exporterModule,aiModule;','CheckBox advancedToggle,start,navigatorModule,selectorModule,exporterModule,aiModule,keepRecovery;');
 replace('bool syncModules;','bool syncModules;string loadedInstallCachePath="";bool loadedInstallCacheFromConfig;');
 s=s.replaceAll('Size=new Size(770,280),AutoScroll=true,Visible=false','Size=new Size(770,430),AutoScroll=true,Visible=false');

 replace(
  'moduleNote=new Label{Location=new Point(30,204),Size=new Size(690,72),ForeColor=Color.DimGray};advanced.Controls.Add(moduleNote);foreach(var box in moduleBoxes.Values)box.CheckStateChanged+=(sender,eventArgs)=>{if(!syncModules)ReconcileModules();};ReconcileModules();',
  `moduleNote=new Label{Location=new Point(30,204),Size=new Size(690,52),ForeColor=Color.DimGray};advanced.Controls.Add(moduleNote);foreach(var box in moduleBoxes.Values)box.CheckStateChanged+=(sender,eventArgs)=>{if(!syncModules)ReconcileModules();};ReconcileModules();
  dataDir=Field(advanced,"WebVideo+ 数据目录",DefaultDataDirectory(terre.Text),386,true);
  workDir=Field(advanced,"导出工作缓存",Path.Combine(output.Text,".webvideo-cache"),428,true);
  installCache=Field(advanced,"安装缓存目录",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter"),470,true);
  keepRecovery=new CheckBox{Text="保留 Terre 原始文件的长期恢复备份（推荐）",Checked=true,AutoSize=true,Location=new Point(170,516)};advanced.Controls.Add(keepRecovery);advanced.Controls.Add(new Label{Text="关闭后仍会为本次安装 / 更新 / 拆卸创建临时回滚副本，操作成功后立即删除。",Location=new Point(170,544),Size=new Size(540,42),ForeColor=Color.DimGray});`
 );

 replace('if(loadedModulesPath!=terre.Text){loadedModulesPath=terre.Text;var modules=ModuleCatalog.Advanced;try{',
         'if(loadedModulesPath!=terre.Text){loadedModulesPath=terre.Text;LoadStoragePaths();var modules=ModuleCatalog.Advanced;try{');

 between(' string[] SelectedModules(){',' void ReconcileModules(){',` static string TextHash16(string text){using(var sha=SHA256.Create()){var hash=sha.ComputeHash(Encoding.UTF8.GetBytes((text??"").ToLowerInvariant()));return BitConverter.ToString(hash).Replace("-","").ToLowerInvariant().Substring(0,16);}}
 string DefaultDataDirectory(string terrePath){string path=String.IsNullOrWhiteSpace(terrePath)?"unknown":Path.GetFullPath(terrePath);return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter","instances",TextHash16(path));}
 void LoadStoragePaths(){if(dataDir==null)return;loadedInstallCacheFromConfig=false;string defaultInstall=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter");dataDir.Text=DefaultDataDirectory(terre.Text);workDir.Text=Path.Combine(output.Text,".webvideo-cache");installCache.Text=defaultInstall;keepRecovery.Checked=true;try{string configPath="";var product=Path.Combine(terre.Text,"webvideo-plus.json");if(File.Exists(product)){var p=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(product));if(p.ContainsKey("config"))configPath=Convert.ToString(p["config"]);}if(configPath==""||!File.Exists(configPath)){var wrapper=Path.Combine(terre.Text,"video-export-wrapper.json");if(File.Exists(wrapper)){var w=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(wrapper));if(w.ContainsKey("config"))configPath=Convert.ToString(w["config"]);}}if(configPath==""||!File.Exists(configPath)){var recent=Path.Combine(defaultInstall,"last-install.json");if(File.Exists(recent)){var last=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(recent));if(last.ContainsKey("terreDir")&&String.Equals(Path.GetFullPath(Convert.ToString(last["terreDir"])),Path.GetFullPath(terre.Text),StringComparison.OrdinalIgnoreCase)&&last.ContainsKey("stateDir"))configPath=Path.Combine(Convert.ToString(last["stateDir"]),"config.json");}}if(configPath!=""&&File.Exists(configPath)){loadedInstallCacheFromConfig=true;var cfg=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(configPath));dataDir.Text=Path.GetDirectoryName(configPath);if(cfg.ContainsKey("gamesRoot"))games.Text=Convert.ToString(cfg["gamesRoot"]);if(cfg.ContainsKey("outputDir"))output.Text=Convert.ToString(cfg["outputDir"]);if(cfg.ContainsKey("terreUrl"))url.Text=Convert.ToString(cfg["terreUrl"]);workDir.Text=cfg.ContainsKey("workDir")?Convert.ToString(cfg["workDir"]):Path.Combine(output.Text,".webvideo-cache");installCache.Text=cfg.ContainsKey("installCacheDir")?Convert.ToString(cfg["installCacheDir"]):defaultInstall;if(cfg.ContainsKey("keepRecoveryBackup"))keepRecovery.Checked=Convert.ToBoolean(cfg["keepRecoveryBackup"]);}}catch{}loadedInstallCachePath=installCache.Text;}
 bool PathsOverlap(string a,string b){string x=Path.GetFullPath(a).TrimEnd('\\\\','/'),y=Path.GetFullPath(b).TrimEnd('\\\\','/');return x.Equals(y,StringComparison.OrdinalIgnoreCase)||x.StartsWith(y+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||y.StartsWith(x+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
 bool PathInside(string parent,string child){string p=Path.GetFullPath(parent).TrimEnd('\\\\','/'),x=Path.GetFullPath(child).TrimEnd('\\\\','/');return !p.Equals(x,StringComparison.OrdinalIgnoreCase)&&x.StartsWith(p+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
 bool SamePath(string a,string b){return Path.GetFullPath(a).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar).Equals(Path.GetFullPath(b).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),StringComparison.OrdinalIgnoreCase);}
 bool SameOrInside(string parent,string child){string p=Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),x=Path.GetFullPath(child).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);return x.Equals(p,StringComparison.OrdinalIgnoreCase)||x.StartsWith(p+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
 string[] StoragePathWarnings(string value,string label,string terrePath,string gamesPath){
  var warnings=new List<string>();string full=Path.GetFullPath(value),normalized=full.TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),root=Path.GetPathRoot(full).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
  if(normalized.Equals(root,StringComparison.OrdinalIgnoreCase))warnings.Add(label+"使用了磁盘根目录 "+full+"。WebVideo+ 会尽量只清理能够确认归属的内容，但其它程序也可能使用这里。");
  if(SamePath(full,terrePath))warnings.Add(label+"与 Terre 安装目录相同。建议使用独立子目录，避免同名文件或清理范围发生冲突。");
  else if(PathInside(terrePath,full))warnings.Add(label+"位于 Terre 安装目录内部。可以继续使用，但建议确认不会与 Terre 自身文件混用。");
  if(SamePath(full,gamesPath))warnings.Add(label+"与游戏目录根相同。建议使用独立子目录，避免同名文件或清理范围发生冲突。");
  else if(PathInside(gamesPath,full))warnings.Add(label+"位于游戏目录内部。可以继续使用，但建议使用独立缓存子目录，避免与游戏素材混用。");
  string profile=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);if(!String.IsNullOrWhiteSpace(profile)&&SamePath(full,profile))warnings.Add(label+"使用了用户目录根。建议使用独立子目录。");
  foreach(var special in new[]{Environment.SpecialFolder.Windows,Environment.SpecialFolder.System,Environment.SpecialFolder.SystemX86}){string system=Environment.GetFolderPath(special);if(!String.IsNullOrWhiteSpace(system)&&SameOrInside(system,full)){warnings.Add(label+"位于 Windows 系统目录中。继续前请确认当前账户具有写入权限。");break;}}
  return warnings.Distinct().ToArray();
 }
 string[] InstallCacheWarnings(string value){
  string full=Path.GetFullPath(value),defaultRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter"),marker=Path.Combine(full,".webvideo-install-cache");bool isDefault=SamePath(full,defaultRoot);
  if(Directory.Exists(full)&&Directory.EnumerateFileSystemEntries(full).Any()&&!isDefault&&!File.Exists(marker)&&!File.Exists(Path.Combine(full,"instances.json")))return new[]{"安装缓存目录已经包含其它文件。WebVideo+ 可以继续使用，但卸载时不会递归删除无法确认归属的现有内容。"};
  return new string[0];
 }
 void PrepareInstallCache(string value){
  string full=Path.GetFullPath(value),marker=Path.Combine(full,".webvideo-install-cache");bool existed=Directory.Exists(full),hadEntries=existed&&Directory.EnumerateFileSystemEntries(full).Any();Directory.CreateDirectory(full);
  if(!File.Exists(marker)){var ownership=new Dictionary<string,object>{{"owner","WebVideo+"},{"schemaVersion",1},{"safeRecursiveCleanup",!hadEntries},{"createdAt",DateTime.UtcNow.ToString("o")}};File.WriteAllText(marker,new JavaScriptSerializer().Serialize(ownership),Encoding.UTF8);}
 }
 string[] SelectedModules(){return ModuleCatalog.Advanced.Where(id=>moduleBoxes[id].CheckState==CheckState.Checked).Concat(aiModule.Checked?new[]{"generativeAI"}:new string[0]).ToArray();}
`);

 between(' async Task Install(){','\n async Task Uninstall(){',` async Task Install(){
  var mounted=InstallationState.Read(terre.Text,InstallerBuild.PackageVersion);bool updating=mounted.Mounted;
  if(!File.Exists(Path.Combine(terre.Text,"public/index.html"))){MessageBox.Show(this,"没有找到 Terre 的 public/index.html，请选择 Terre 安装目录。","请核对路径");return;}
  Uri address;if(!Uri.TryCreate(url.Text,UriKind.Absolute,out address)||!new[]{"localhost","127.0.0.1"}.Contains(address.Host)){MessageBox.Show(this,"请填写本机 Terre 地址，例如 http://localhost:3001。","请核对地址");return;}
  string t=Path.GetFullPath(terre.Text),g=Path.GetFullPath(games.Text),o=Path.GetFullPath(output.Text),u=url.Text,d=Path.GetFullPath(dataDir.Text),w=Path.GetFullPath(workDir.Text),ic=Path.GetFullPath(installCache.Text);bool launch=start.Checked,keep=keepRecovery.Checked;var selected=SelectedModules();
  var pathWarnings=new List<string>();try{pathWarnings.AddRange(StoragePathWarnings(d,"WebVideo+ 数据目录",t,g));pathWarnings.AddRange(StoragePathWarnings(w,"导出工作缓存",t,g));pathWarnings.AddRange(StoragePathWarnings(ic,"安装缓存目录",t,g));pathWarnings.AddRange(InstallCacheWarnings(ic));if(PathsOverlap(d,w)||PathsOverlap(w,ic)||PathInside(d,ic)||String.Equals(d,ic,StringComparison.OrdinalIgnoreCase))pathWarnings.Add("部分 WebVideo+ 存储目录彼此重叠。功能仍可继续，但清理时会更保守，并可能保留无法确认归属的文件。");}catch(Exception pathError){MessageBox.Show(this,pathError.Message,"请核对存储路径");return;}
  if(pathWarnings.Count>0){var choice=MessageBox.Show(this,"以下路径存在风险：\\n\\n• "+string.Join("\\n• ",pathWarnings.Distinct())+"\\n\\n是否仍然使用这些路径？","路径风险提示",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2);if(choice!=DialogResult.Yes)return;}
  try{PrepareInstallCache(ic);}catch(Exception pathError){MessageBox.Show(this,pathError.Message,"无法使用存储路径");return;}
  engine=new SetupEngine(ic,Report);SetBusy(true);
  try{
   plan=await Task.Run(()=>engine.Inspect(engine.ExtractPayload(),selected));bool consent=plan.Downloads.Count==0;if(!consent){var text="需要下载并安装以下组件：\\n\\n"+string.Join("\\n",plan.Downloads.Select(x=>"• "+x))+"\\n\\n安装缓存目录：\\n"+engine.Root+"\\n\\n不会更改系统 PATH。是否同意下载并继续安装？";consent=MessageBox.Show(this,text,"允许安装缺失的运行组件？",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)==DialogResult.Yes;}if(!consent){status.Text="已取消，未下载或安装依赖。";return;}await Task.Run(()=>engine.EnsureRuntimes(plan,true));
   bool forceInstall=false;try{await Task.Run(()=>engine.Install(plan,t,g,o,u,d,w,ic,keep,false,launch));}
   catch(Exception first){if(!first.Message.Contains("[FORCE_AVAILABLE]"))throw;var choice=MessageBox.Show(this,first.Message.Replace("[FORCE_AVAILABLE]","").Trim()+"\\n\\n是否强制修复？\\n安装器会先创建事务性临时回滚副本，操作成功后立即删除。强制修复会尽量完成变更，但无法安全合并的外部修改可能被恢复为已知原版基线。","检测到安装状态不一致",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2);if(choice!=DialogResult.Yes)throw;forceInstall=true;}
   if(forceInstall)await Task.Run(()=>engine.Install(plan,t,g,o,u,d,w,ic,keep,true,launch));
   if(loadedInstallCacheFromConfig&&!String.IsNullOrWhiteSpace(loadedInstallCachePath)&&!String.Equals(Path.GetFullPath(loadedInstallCachePath).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),Path.GetFullPath(ic).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),StringComparison.OrdinalIgnoreCase)){var oldCacheEngine=new SetupEngine(loadedInstallCachePath,Report);oldCacheEngine.CleanupInstallCache(true,false);}loadedInstallCachePath=ic;loadedInstallCacheFromConfig=true;loadedModulesPath="";RefreshInstallation(true);MessageBox.Show(this,(updating?"更新 / 修复":"安装")+"完成。",updating?"操作完成":"安装完成");
  }catch(Exception e){engine.Report("安装未完成："+e.Message);MessageBox.Show(this,e.Message.Replace("[FORCE_AVAILABLE]","").Trim()+"\\n\\n可点击“打开日志”查看详情。","安装未完成");}finally{engine.CleanupPayloadArtifacts();SetBusy(false);}
 }`);

 between(' async Task Uninstall(){','\n}\npublic static class InstallerMain',` bool ShowUninstallOptions(out bool deleteCache,out bool deleteData){bool selectedCache=true,selectedData=false;using(var f=new Form{Text="卸载 WebVideo+",ClientSize=new Size(610,330),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,StartPosition=FormStartPosition.CenterParent,Font=Font,BackColor=BackColor}){
  f.Controls.Add(new Label{Text="拆卸 WebVideo+ 后将尽量恢复 Terre 原程序。请选择是否同时清理本机数据：",Location=new Point(24,24),Size=new Size(560,48)});
  var cacheBox=new CheckBox{Text="删除 WebVideo+ 缓存和临时文件",Checked=true,AutoSize=true,Location=new Point(28,92)};f.Controls.Add(cacheBox);
  f.Controls.Add(new Label{Text="包括导出工作缓存、WebView 临时数据、临时音乐，以及安装下载 / 解包 / 运行依赖缓存。",Location=new Point(52,120),Size=new Size(520,42),ForeColor=Color.DimGray});
  var dataBox=new CheckBox{Text="删除 WebVideo+ 配置和用户数据",Checked=false,AutoSize=true,Location=new Point(28,174)};f.Controls.Add(dataBox);
  f.Controls.Add(new Label{Text="包括设置、任务历史、日志、自动备份、项目内 WebVideo+ 音乐配置、滤镜 / 角色映射 / 预制效果 / AI 配置，以及长期恢复备份和旧版全局配置。",Location=new Point(52,202),Size=new Size(520,48),ForeColor=Color.DimGray});
  f.Controls.Add(new Label{Text="已导出的 MP4 和 WebGAL 游戏工程不会删除。",Location=new Point(28,258),Size=new Size(520,28),ForeColor=Color.FromArgb(20,90,145)});
  var cancelButton=new Button{Text="取消",Location=new Point(28,286),Size=new Size(90,34),DialogResult=DialogResult.Cancel};var uninstallButton=new Button{Text="卸载 WebVideo+",Location=new Point(452,286),Size=new Size(130,34)};f.Controls.Add(cancelButton);f.Controls.Add(uninstallButton);f.CancelButton=cancelButton;uninstallButton.Click+=(sender,args)=>{selectedCache=cacheBox.Checked;selectedData=dataBox.Checked;f.DialogResult=DialogResult.OK;f.Close();};bool accepted=f.ShowDialog(this)==DialogResult.OK;deleteCache=selectedCache;deleteData=selectedData;return accepted;}}
 async Task Uninstall(){bool deleteCache,deleteData;if(!ShowUninstallOptions(out deleteCache,out deleteData))return;string target=terre.Text,d=Path.GetFullPath(dataDir.Text),ic=Path.GetFullPath(installCache.Text);engine=new SetupEngine(ic,Report);SetBusy(true);try{
   string payload=await Task.Run(()=>engine.ExtractPayload());Action<bool> runForce=force=>{var args=new List<string>{"uninstall","--terre-dir",target,"--state-dir",d,"--delete-cache",deleteCache?"true":"false","--delete-data",deleteData?"true":"false"};if(force)args.AddRange(new[]{"--force","true"});engine.Run(Path.Combine(payload,"WebVideoPlus.Manager.exe"),args,"",payload);};
   bool forceUninstall=false;try{await Task.Run(()=>runForce(false));}catch(Exception first){if(!first.Message.Contains("[FORCE_AVAILABLE]"))throw;var choice=MessageBox.Show(this,first.Message.Replace("[FORCE_AVAILABLE]","").Trim()+"\\n\\n是否强制拆卸？\\n安装器会先创建事务性临时回滚副本并尽量恢复 Terre；强制拆卸可能用已知原版基线替换不一致文件。","检测到安装状态不一致",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2);if(choice!=DialogResult.Yes)throw;forceUninstall=true;}
   if(forceUninstall)await Task.Run(()=>runForce(true));
   engine.CleanupInstallCache(deleteCache,deleteData);string defaultInstallCache=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter");if(!String.Equals(Path.GetFullPath(ic).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),Path.GetFullPath(defaultInstallCache).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),StringComparison.OrdinalIgnoreCase)){var defaultEngine=new SetupEngine(defaultInstallCache,Report);defaultEngine.CleanupInstallCache(deleteCache,deleteData);}loadedModulesPath="";status.Text=deleteCache&&deleteData?"WebVideo+ 已完整卸载，缓存和用户数据已清理。":"WebVideo+ 已卸载。已导出的 MP4 和 WebGAL 游戏工程保留。";RefreshInstallation(false);MessageBox.Show(this,status.Text,"卸载完成");
  }catch(Exception e){MessageBox.Show(this,e.Message.Replace("[FORCE_AVAILABLE]","").Trim(),"卸载未完成");}finally{engine.CleanupPayloadArtifacts();SetBusy(false);}}
`);

 return s;
}

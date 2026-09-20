import fs from 'node:fs';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const internalAt=process.argv.indexOf('--internal-version'),internalVersion=internalAt>=0?process.argv[internalAt+1]:'';if(internalAt>=0&&!internalVersion)throw Error('--internal-version requires a value');
const versions=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')),productVersion=versions.productVersion,installerVersion=versions.installerVersion,kernelVersion=versions.kernelVersion;
if(!productVersion||!installerVersion||!kernelVersion)throw Error('version.json is missing required version fields');
let s=fs.readFileSync(path.join(root,'installer/Installer.base.cs'),'utf8').replaceAll('\r\n','\n');
function replace(a,b){if(!s.includes(a))throw Error('Missing installer anchor '+a);s=s.replace(a,b);}
function between(a,b,t){let i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0)throw Error(a);s=s.slice(0,i)+t+s.slice(j);}
s=s.replaceAll('WebGAL Video Exporter Setup','WebVideo+ Setup').replaceAll('WebGAL Video Exporter','WebVideo+').replaceAll('0.3.1.0',installerVersion).replaceAll('"webgal-native-exporter"','"webvideo-plus"');
replace('  return payload;',`  string manifestFile=Path.Combine(payload,"MANIFEST.json");if(!File.Exists(manifestFile)||Hash(manifestFile)!=InstallerBuild.ManifestHash)throw new Exception("安装文件清单校验失败，请重新获取安装包。");
  if(new FileInfo(manifestFile).Length>32L*1024*1024)throw new Exception("安装文件清单超过支持范围。");var inventory=new JavaScriptSerializer{MaxJsonLength=32*1024*1024,RecursionLimit=256}.Deserialize<Dictionary<string,object>>(File.ReadAllText(manifestFile));
  foreach(var item in (System.Collections.IEnumerable)inventory["files"]){var record=(Dictionary<string,object>)item;string relative=(string)record["path"],file=Path.GetFullPath(Path.Combine(payload,relative.Replace('/',Path.DirectorySeparatorChar)));if(!file.StartsWith(Path.GetFullPath(payload)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!File.Exists(file)||new FileInfo(file).Length!=Convert.ToInt64(record["bytes"])||Hash(file)!=(string)record["sha256"])throw new Exception("安装缓存校验失败："+relative+"。请移除安装器缓存后重试。");}
  return payload;`);
replace('Check();Directory.CreateDirectory(Tools);','Check();if(plan.Modules!=null&&!plan.Modules.Contains("exporter")){Report("所选模块无需额外运行环境",100);return;}Directory.CreateDirectory(Tools);');
replace('Report("运行环境准备完成，无需 Node.js 或 Electron",100);','Report("运行环境准备完成",100);');
replace('public string Native,FFmpeg,FFprobe,Payload;','public string Native,FFmpeg,FFprobe,Payload;public string[] Modules;');
replace('public RuntimePlan Inspect(string payload){','public RuntimePlan Inspect(string payload,string[] modules=null){');
replace('var plan=new RuntimePlan{Payload=payload,Native=Path.Combine(payload,"WebGAL.Video.exe")};','var plan=new RuntimePlan{Payload=payload,Native=Path.Combine(payload,"WebGAL.Video.exe"),Modules=modules??new[]{"timelineNavigator","timelineSelector","exporter"}};if(!plan.Modules.Contains("exporter")){Report("时间线模块无需额外运行环境");return plan;}');
replace('Report("正在更新 Terre 原生导出组件…");','Report("正在应用 WebVideo+ 模块选择…");');
replace('"--runtime-path",p.RuntimePath};','"--runtime-path",p.RuntimePath,"--modules",string.Join(",",p.Modules)};');
replace('Run(p.Native,args,p.RuntimePath,p.Payload);if(start){','Run(Path.Combine(p.Payload,"WebVideoPlus.Manager.exe"),args,p.RuntimePath,p.Payload);if(start&&p.Modules.Length>0){');
replace('Run(p.Native,new[]{"launch","--terre-dir",terre},p.RuntimePath,p.Payload);','Run(Path.Combine(p.Payload,"WebVideoPlus.Manager.exe"),new[]{"launch","--terre-dir",terre},p.RuntimePath,p.Payload);');
between(' public static InstallationState Read(', '\n}\npublic class SetupForm', ` public static InstallationState Read(string directory,string packageVersion){var state=new InstallationState();try{
  state.ValidTerre=File.Exists(Path.Combine(directory,"public/index.html"));string marker=Path.Combine(directory,"webvideo-plus.json");bool product=File.Exists(marker);state.Mounted=product||File.Exists(Path.Combine(directory,"video-export-wrapper.json"));
  if(!state.Mounted){state.UpdateAvailable=true;state.Message=state.ValidTerre?"默认安装全部模块；可在高级选项中调整。":"请选择有效的 Terre 安装目录。";return state;}
  if(!product){state.UpdateAvailable=true;state.Message="检测到视频导出器，可升级为 WebVideo+ 并保留导出设置。";return state;}
  var json=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(marker));state.Version=Convert.ToString(json["version"]);string installedLabel=state.Version+(json.ContainsKey("internalVersion")&&!String.IsNullOrWhiteSpace(Convert.ToString(json["internalVersion"]))?"（内部 "+Convert.ToString(json["internalVersion"])+"）":"");int comparison=CompareVersions(packageVersion,state.Version);state.UpdateAvailable=comparison>=0;
  state.Message=comparison>0?"可从 WebVideo+ "+installedLabel+" 升级至 "+packageVersion+"。":comparison==0?"已安装 WebVideo+ "+installedLabel+"；可在高级选项中添加或拆卸模块。":"已安装较新版本 "+installedLabel+"；此安装包不提供降级。";
 }catch{state.UpdateAvailable=false;state.Message="安装记录无法读取，请核对所选目录。";}return state;}
`);
replace('CheckBox advancedToggle,start;','CheckBox advancedToggle,start,navigatorModule,selectorModule,exporterModule;string loadedModulesPath="";');
replace('public SetupForm(){','public SetupForm(string settingsRoot=null){');
replace('engine=new SetupEngine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter"),Report);','engine=new SetupEngine(settingsRoot??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter"),Report);');
s=s.replaceAll('WebGAL 视频导出 · 安装','WebVideo+ · 安装').replaceAll('WebGAL 视频导出 · 管理','WebVideo+ · 管理').replaceAll('安装视频导出工具','安装 WebVideo+').replaceAll('管理视频导出工具','管理 WebVideo+');
replace('Size=new Size(770,128)','Size=new Size(770,208)');
replace('  start=new CheckBox',`  foreach(Control field in advanced.Controls)field.Top+=80;
  navigatorModule=new CheckBox{Text="剧情导航",Checked=true,Location=new Point(30,3),Size=new Size(160,27)};
  selectorModule=new CheckBox{Text="剧情选择",Checked=true,Location=new Point(210,3),Size=new Size(160,27)};
  exporterModule=new CheckBox{Text="视频导出",Checked=true,Location=new Point(390,3),Size=new Size(160,27)};
  advanced.Controls.AddRange(new Control[]{navigatorModule,selectorModule,exporterModule,new Label{Text="只安装勾选模块及其依赖；取消勾选可拆卸模块。",Location=new Point(30,36),Size=new Size(630,28),ForeColor=Color.DimGray}});
  start=new CheckBox`);
replace('【内部版本 0.3.1 · C# / WebView2】','WebVideo+ '+(internalVersion?'内部 '+internalVersion+' · 正式 '+productVersion:productVersion)+' · 导出内核 '+kernelVersion);
between(' void RefreshInstallation(', '\n void SetBusy(', ` string[] SelectedModules(){var modules=new List<string>();if(navigatorModule.Checked)modules.Add("timelineNavigator");if(selectorModule.Checked)modules.Add("timelineSelector");if(exporterModule.Checked)modules.Add("exporter");return modules.ToArray();}
 void RefreshInstallation(bool showMessage){var current=InstallationState.Read(terre.Text,InstallerBuild.PackageVersion);install.Visible=true;install.Enabled=!busy&&current.ValidTerre&&current.UpdateAvailable;install.Text=current.Mounted?(String.IsNullOrWhiteSpace(current.Version)||InstallationState.CompareVersions(InstallerBuild.PackageVersion,current.Version)>0?"更新":"应用更改"):"检测并安装";remove.Visible=current.Mounted;remove.Enabled=!busy&&current.Mounted;headline.Text=current.Mounted?"管理 WebVideo+":"安装 WebVideo+";Text=current.Mounted?"WebVideo+ · 管理":"WebVideo+ · 安装";start.Text="完成后启动 Terre";start.Visible=advancedToggle.Visible=true;
  if(loadedModulesPath!=terre.Text){loadedModulesPath=terre.Text;var modules=new[]{"timelineNavigator","timelineSelector","exporter"};try{var marker=Path.Combine(terre.Text,"webvideo-plus.json");if(File.Exists(marker)){var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(marker));modules=((System.Collections.IEnumerable)data["modules"]).Cast<object>().Select(Convert.ToString).ToArray();}}catch{}navigatorModule.Checked=modules.Contains("timelineNavigator");selectorModule.Checked=modules.Contains("timelineSelector");exporterModule.Checked=modules.Contains("exporter");}
  if(showMessage)status.Text=current.Message;
 }`);
replace('bool launch=start.Checked;SetBusy(true);','bool launch=start.Checked;var selected=SelectedModules();SetBusy(true);');
replace('engine.Inspect(engine.ExtractPayload())','engine.Inspect(engine.ExtractPayload(),selected)');
replace('导出组件会一起启动。','所选模块即可使用。');
replace('});RefreshInstallation(true);MessageBox.Show','});loadedModulesPath="";RefreshInstallation(true);MessageBox.Show');
between(' async Task Uninstall(){','\n}\npublic static class InstallerMain',` async Task Uninstall(){SetBusy(true);try{if(MessageBox.Show(this,"拆卸这份 Terre 的全部 WebVideo+ 模块？原程序将还原，视频、任务和设置保留。","拆卸全部模块",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;string target=terre.Text;await Task.Run(()=>{string payload=engine.ExtractPayload();engine.Run(Path.Combine(payload,"WebVideoPlus.Manager.exe"),new[]{"uninstall","--terre-dir",target},"",payload);});loadedModulesPath="";status.Text="已拆卸全部模块，视频、任务和设置保留。";}catch(Exception e){MessageBox.Show(this,e.Message,"拆卸未完成");}finally{SetBusy(false);}}
`);
// Applied to the generated installer; the shared native catalog owns dependency rules.
s='using NativeVideo;\n'+s;
replace('public string[] Modules;','public string[] Modules,RequestedModules;');
replace('Modules=modules??new[]{"timelineNavigator","timelineSelector","exporter"}','Modules=ModuleCatalog.Resolve(modules??ModuleCatalog.Selectable),RequestedModules=modules??ModuleCatalog.Selectable');
s=s.replaceAll('!plan.Modules.Contains("exporter")','!ModuleCatalog.NeedsKernel(plan.Modules)').replaceAll('string.Join(",",p.Modules)','string.Join(",",p.RequestedModules)');
replace('CheckBox advancedToggle,start,navigatorModule,selectorModule,exporterModule;','CheckBox advancedToggle,start,navigatorModule,selectorModule,exporterModule,aiModule;readonly Dictionary<string,CheckBox> moduleBoxes=new Dictionary<string,CheckBox>();Label moduleNote;readonly ToolTip aiInfoTip=new ToolTip{AutoPopDelay=15000,InitialDelay=300,ReshowDelay=100,ShowAlways=true};bool syncModules;');
replace('Size=new Size(770,208)','Size=new Size(770,280)');
between('  foreach(Control field in advanced.Controls)field.Top+=80;','  start=new CheckBox',`  foreach(Control field in advanced.Controls)field.Top+=260;
  int moduleIndex=0;foreach(var id in ModuleCatalog.Advanced){var box=new CheckBox{Text=ModuleCatalog.Labels[id],ThreeState=true,Checked=true,AutoSize=true,Location=new Point(30+(moduleIndex%3)*225,3+(moduleIndex/3)*32)};moduleBoxes[id]=box;advanced.Controls.Add(box);moduleIndex++;}
  navigatorModule=moduleBoxes["timelineNavigator"];selectorModule=moduleBoxes["timelineSelector"];exporterModule=moduleBoxes["exporter"];
  aiModule=new CheckBox{Text="安装生成式 AI 组件 (Beta)",Checked=false,AutoSize=true,Location=new Point(30,258),Font=new Font(Font,FontStyle.Bold)};Controls.Add(aiModule);var aiInfo=new Label{Text="ⓘ",AutoSize=true,Font=new Font("Segoe UI Symbol",12),ForeColor=Color.FromArgb(55,115,170),Cursor=Cursors.Help,AccessibleName="生成式AI组件说明",AccessibleDescription="需要自行配置 API Key，测试版本。"};Controls.Add(aiInfo);aiInfo.Location=new Point(aiModule.Right+8,aiModule.Top-2);aiModule.SizeChanged+=(sender,eventArgs)=>aiInfo.Location=new Point(aiModule.Right+8,aiModule.Top-2);aiInfoTip.SetToolTip(aiInfo,"需要自行配置 API Key，测试版本。");FormClosed+=(sender,eventArgs)=>aiInfoTip.Dispose();aiModule.CheckedChanged+=(sender,eventArgs)=>{if(!syncModules)ReconcileModules();};
  moduleNote=new Label{Location=new Point(30,204),Size=new Size(690,72),ForeColor=Color.DimGray};advanced.Controls.Add(moduleNote);foreach(var box in moduleBoxes.Values)box.CheckStateChanged+=(sender,eventArgs)=>{if(!syncModules)ReconcileModules();};ReconcileModules();
`);
between(' string[] SelectedModules(){',' void RefreshInstallation(',` string[] SelectedModules(){return ModuleCatalog.Advanced.Where(id=>moduleBoxes[id].CheckState==CheckState.Checked).Concat(aiModule.Checked?new[]{"generativeAI"}:new string[0]).ToArray();}
 void ReconcileModules(){if(syncModules)return;syncModules=true;try{var selected=SelectedModules();var resolved=ModuleCatalog.Resolve(selected);foreach(var id in ModuleCatalog.Advanced){var box=moduleBoxes[id];box.CheckState=selected.Contains(id)?CheckState.Checked:resolved.Contains(id)?CheckState.Indeterminate:CheckState.Unchecked;box.Enabled=box.CheckState!=CheckState.Indeterminate;}var dependencies=resolved.Except(selected).Select(id=>ModuleCatalog.Labels[id]);moduleNote.Text="只安装勾选模块和依赖。灰选项目为其他模块必需的依赖。"+(dependencies.Any()?"\\n自动补齐："+string.Join("、",dependencies):"");}finally{syncModules=false;}}
`);
replace('var modules=new[]{"timelineNavigator","timelineSelector","exporter"};try{','var modules=ModuleCatalog.Advanced;try{');
replace('modules=((System.Collections.IEnumerable)data["modules"]).Cast<object>().Select(Convert.ToString).ToArray();','modules=ModuleCatalog.Normalize(((System.Collections.IEnumerable)data[data.ContainsKey("requestedModules")?"requestedModules":"modules"]).Cast<object>().Select(Convert.ToString));if(InstallationState.CompareVersions(Convert.ToString(data["version"]),"0.2.0")<0)modules=modules.Concat(ModuleCatalog.Selectable.Skip(3)).Distinct().ToArray();if(InstallationState.CompareVersions(Convert.ToString(data["version"]),"0.2.1")<0)modules=modules.Concat(new[]{"compactGameTools"}).Distinct().ToArray();');
replace('navigatorModule.Checked=modules.Contains("timelineNavigator");selectorModule.Checked=modules.Contains("timelineSelector");exporterModule.Checked=modules.Contains("exporter");','syncModules=true;foreach(var id in ModuleCatalog.Advanced)moduleBoxes[id].CheckState=modules.Contains(id)?CheckState.Checked:CheckState.Unchecked;aiModule.Checked=modules.Contains("generativeAI");syncModules=false;ReconcileModules();');
s=s.replace('void SetBusy(bool value){','void SetBusy(bool value){if(aiModule!=null)aiModule.Enabled=!value;');
s=s.replaceAll('Size=new Size(770,280),Visible=false','Size=new Size(770,280),AutoScroll=true,Visible=false');
fs.writeFileSync(path.join(root,'installer/Installer.cs'),s);
console.log('WebVideo+ installer source generated.');

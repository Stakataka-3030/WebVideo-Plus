using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Reflection;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

[assembly:AssemblyTitle("WebGAL Video Exporter Setup")]
[assembly:AssemblyProduct("WebGAL Video Exporter")]
[assembly:AssemblyVersion("0.3.1.0")]
[assembly:AssemblyFileVersion("0.3.1.0")]

public class SetupProgress {
 public string Message; public int Percent;
 public SetupProgress(string message,int percent=-1){Message=message;Percent=percent;}
}
public class RuntimePlan {
 public string Native,FFmpeg,FFprobe,Payload;public bool NeedFFmpeg,NeedWebView2;
 public string RuntimePath {get{return string.Join(Path.PathSeparator.ToString(),new[]{FFmpeg,FFprobe}.Where(x=>!string.IsNullOrEmpty(x)).Select(Path.GetDirectoryName).Distinct());}}
 public List<string> Downloads {get{var a=new List<string>();if(NeedFFmpeg)a.Add("FFmpeg 9.0.1，含 ffprobe（约 106 MB）");if(NeedWebView2)a.Add("Microsoft WebView2 Runtime（由微软安装程序下载）");return a;}}
}
public class SetupEngine {
 public const string FFVersion="9.0.1";
 public readonly string Root,Tools,Cache,LogFile; readonly Action<SetupProgress> progress; readonly bool systemPaths;
 readonly object logLock=new object(); public volatile bool Canceled;
 public SetupEngine(string root,Action<SetupProgress> report,bool searchSystem=true){Root=Path.GetFullPath(root);Tools=Path.Combine(Root,"tools");Cache=Path.Combine(Root,"downloads");LogFile=Path.Combine(Root,"installer.log");progress=report;systemPaths=searchSystem;Directory.CreateDirectory(Root);}
 public void Report(string message,int percent=-1){lock(logLock)File.AppendAllText(LogFile,DateTime.Now.ToString("s")+" "+message+Environment.NewLine,Encoding.UTF8);if(progress!=null)progress(new SetupProgress(message,percent));}
 void Check(){if(Canceled)throw new OperationCanceledException("已取消；下载缓存保留，可重新安装继续。");}
 public static string Quote(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
 public static string Hash(string file){using(var sha=SHA256.Create())using(var f=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
 public string ExtractPayload(){
  Report("正在读取安装文件…");var assembly=Assembly.GetExecutingAssembly();string archive=Path.Combine(Root,"payload-"+InstallerBuild.PayloadHash+".zip");
  if(!File.Exists(archive)||Hash(archive)!=InstallerBuild.PayloadHash){using(var input=assembly.GetManifestResourceStream("payload.zip"))using(var output=File.Create(archive)){if(input==null)throw new Exception("安装包缺少组件文件");input.CopyTo(output);}}
  if(Hash(archive)!=InstallerBuild.PayloadHash)throw new Exception("安装包校验失败，请重新获取安装器。");
  string destination=Path.Combine(Root,"packages",InstallerBuild.PayloadHash.Substring(0,16)),payload=Path.Combine(destination,"webgal-native-exporter");
  if(!File.Exists(Path.Combine(destination,"ready"))){Extract(archive,destination);File.WriteAllText(Path.Combine(destination,"ready"),InstallerBuild.PayloadHash);}
  return payload;
 }
 public void CleanupPayloadArtifacts(){
  string archive=Path.Combine(Root,"payload-"+InstallerBuild.PayloadHash+".zip"),packages=Path.Combine(Root,"packages"),destination=Path.Combine(packages,InstallerBuild.PayloadHash.Substring(0,16));Exception last=null;
  for(int attempt=0;attempt<4;attempt++){
   last=null;try{if(File.Exists(archive))File.Delete(archive);}catch(Exception e){last=e;}try{if(Directory.Exists(destination))Directory.Delete(destination,true);}catch(Exception e){last=e;}
   if(!File.Exists(archive)&&!Directory.Exists(destination)){try{if(Directory.Exists(packages)&&!Directory.EnumerateFileSystemEntries(packages).Any())Directory.Delete(packages);}catch{}return;}
   System.Threading.Thread.Sleep(100*(attempt+1));
  }
  Report("临时安装 payload 未能完全清理"+(last==null?"":"："+last.Message));
 }
 public static bool IsPayloadHash(string value,int length){if(String.IsNullOrWhiteSpace(value)||value.Length!=length)return false;foreach(char ch in value)if(!((ch>='0'&&ch<='9')||(ch>='a'&&ch<='f')||(ch>='A'&&ch<='F')))return false;return true;}
 public static bool DeletePayloadFile(string file){for(int attempt=0;attempt<4;attempt++){try{if(File.Exists(file))File.Delete(file);if(!File.Exists(file))return true;}catch{}System.Threading.Thread.Sleep(100*(attempt+1));}return !File.Exists(file);}
 public static bool DeletePayloadDirectory(string directory){for(int attempt=0;attempt<4;attempt++){try{if(Directory.Exists(directory))Directory.Delete(directory,true);if(!Directory.Exists(directory))return true;}catch{}System.Threading.Thread.Sleep(100*(attempt+1));}return !Directory.Exists(directory);}
 public void CleanupStalePayloadArtifacts(){
  try{
   if(!Directory.Exists(Root))return;string defaultRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter"),marker=Path.Combine(Root,".webvideo-install-cache"),registry=Path.Combine(Root,"instances.json");
   bool trusted=String.Equals(Path.GetFullPath(Root).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),Path.GetFullPath(defaultRoot).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar),StringComparison.OrdinalIgnoreCase)||File.Exists(marker)||File.Exists(registry);if(!trusted)return;
   var prefixes=new HashSet<string>(StringComparer.OrdinalIgnoreCase);int removed=0,failed=0;
   foreach(var file in Directory.GetFiles(Root,"payload-*.zip")){string name=Path.GetFileName(file);if(name.Length!=76||!name.StartsWith("payload-",StringComparison.OrdinalIgnoreCase)||!name.EndsWith(".zip",StringComparison.OrdinalIgnoreCase))continue;string hash=name.Substring(8,64);if(!IsPayloadHash(hash,64))continue;prefixes.Add(hash.Substring(0,16));if(DeletePayloadFile(file))removed++;else failed++;}
   string packages=Path.Combine(Root,"packages");if(Directory.Exists(packages))foreach(var directory in Directory.GetDirectories(packages)){string name=Path.GetFileName(directory);if(!IsPayloadHash(name,16))continue;bool owned=prefixes.Contains(name);string ready=Path.Combine(directory,"ready");if(!owned&&File.Exists(ready))try{string hash=File.ReadAllText(ready).Trim();owned=IsPayloadHash(hash,64)&&hash.StartsWith(name,StringComparison.OrdinalIgnoreCase);}catch{}
    if(!owned)foreach(var payloadRoot in new[]{Path.Combine(directory,"webvideo-plus"),Path.Combine(directory,"webgal-"+"native-exporter")}){if(!Directory.Exists(payloadRoot))continue;if(File.Exists(Path.Combine(payloadRoot,"MANIFEST.json"))||File.Exists(Path.Combine(payloadRoot,"WebGAL.Video.exe"))||File.Exists(Path.Combine(payloadRoot,"WebVideoPlus.Manager.exe"))||Directory.Exists(Path.Combine(payloadRoot,"browser"))||Directory.Exists(Path.Combine(payloadRoot,"bin"))||Directory.Exists(Path.Combine(payloadRoot,"source"))||Directory.Exists(Path.Combine(payloadRoot,"product-ui"))){owned=true;break;}}
    if(!owned)continue;if(DeletePayloadDirectory(directory))removed++;else failed++;}
   try{if(Directory.Exists(packages)&&!Directory.EnumerateFileSystemEntries(packages).Any())Directory.Delete(packages);}catch{}
   if(removed>0||failed>0)Report("历史安装 payload 清理："+removed+" 项已删除"+(failed>0?"，"+failed+" 项仍被占用或无法删除":""));
  }catch(Exception e){Report("历史安装 payload 清理未完成："+e.Message);}
 }
 public void Extract(string archive,string destination){
  Directory.CreateDirectory(destination);string boundary=Path.GetFullPath(destination)+Path.DirectorySeparatorChar;int n=0;
  using(var zip=ZipFile.OpenRead(archive))foreach(var entry in zip.Entries){Check();string target=Path.GetFullPath(Path.Combine(destination,entry.FullName));if(!target.StartsWith(boundary,StringComparison.OrdinalIgnoreCase))throw new Exception("压缩包路径校验失败");if(entry.Name.Length==0){Directory.CreateDirectory(target);continue;}Directory.CreateDirectory(Path.GetDirectoryName(target));entry.ExtractToFile(target,true);if(++n%80==0)Report("正在解压组件… "+n+" / "+zip.Entries.Count,(int)(100L*n/zip.Entries.Count));}
 }
 string FindProgram(string name,Func<string,bool> valid){
  if(!systemPaths)return null;var dirs=(Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator).ToList();
  foreach(var dir in dirs.Distinct())try{var file=Path.Combine(dir.Trim().Trim('"'),name);if(File.Exists(file)&&valid(file))return Path.GetFullPath(file);}catch{}
  return null;
 }
 public static string Probe(string file,string args){
  using(var p=new Process()){p.StartInfo=new ProcessStartInfo(file,args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};p.Start();var output=p.StandardOutput.ReadToEndAsync();var error=p.StandardError.ReadToEndAsync();if(!p.WaitForExit(10000)){try{p.Kill();}catch{}return null;}return p.ExitCode==0?output.GetAwaiter().GetResult():null;}
 }
 static bool ValidFF(string f){try{return Probe(f,"-version")!=null;}catch{return false;}}
 public RuntimePlan Inspect(string payload){
  Report("正在检测原生运行环境…");var plan=new RuntimePlan{Payload=payload,Native=Path.Combine(payload,"WebGAL.Video.exe")};if(!File.Exists(plan.Native))throw new Exception("安装包缺少原生导出程序");
  string ff=Path.Combine(Tools,"ffmpeg-"+FFVersion+"-essentials_build","bin");plan.FFmpeg=File.Exists(Path.Combine(ff,"ffmpeg.exe"))&&ValidFF(Path.Combine(ff,"ffmpeg.exe"))?Path.Combine(ff,"ffmpeg.exe"):FindProgram("ffmpeg.exe",ValidFF);plan.FFprobe=File.Exists(Path.Combine(ff,"ffprobe.exe"))&&ValidFF(Path.Combine(ff,"ffprobe.exe"))?Path.Combine(ff,"ffprobe.exe"):FindProgram("ffprobe.exe",ValidFF);
  plan.NeedFFmpeg=plan.FFmpeg==null||plan.FFprobe==null;string result=Probe(plan.Native,"check-runtime");plan.NeedWebView2=string.IsNullOrWhiteSpace(result)||!result.Contains("webview2");return plan;
 }
 public void Download(string[] urls,string hash,string destination){
  Directory.CreateDirectory(Path.GetDirectoryName(destination));if(File.Exists(destination)&&Hash(destination)==hash){Report("使用已校验的下载缓存",100);return;}
  string partial=destination+".part";Exception last=null;ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  for(int attempt=0;attempt<urls.Length*2;attempt++){Check();try{
   string url=urls[Math.Min(attempt/2,urls.Length-1)];long offset=File.Exists(partial)?new FileInfo(partial).Length:0;var req=(HttpWebRequest)WebRequest.Create(url);req.Timeout=30000;req.ReadWriteTimeout=30000;req.UserAgent="WebVideoPlus-Setup/"+Assembly.GetExecutingAssembly().GetName().Version.ToString();if(offset>0)req.AddRange(offset);
   using(var response=(HttpWebResponse)req.GetResponse()){
    if(response.StatusCode!=HttpStatusCode.PartialContent)offset=0;else if(!String.Equals((response.Headers["Content-Range"]??"").Split('-')[0],"bytes "+offset,StringComparison.Ordinal))throw new Exception("下载续传位置不匹配");
    long total=response.ContentLength>0?offset+response.ContentLength:0,received=offset;var clock=Stopwatch.StartNew();long lastTick=-1000;
    using(var input=response.GetResponseStream())using(var output=new FileStream(partial,offset>0?FileMode.Append:FileMode.Create,FileAccess.Write,FileShare.Read)){byte[] buffer=new byte[262144];int length;while((length=input.Read(buffer,0,buffer.Length))>0){Check();output.Write(buffer,0,length);received+=length;if(clock.ElapsedMilliseconds-lastTick>=500){lastTick=clock.ElapsedMilliseconds;double speed=(received-offset)/Math.Max(.1,clock.Elapsed.TotalSeconds)/1048576;Report("正在下载 "+Path.GetFileName(destination)+"  "+(received/1048576.0).ToString("F1")+" / "+(total>0?(total/1048576.0).ToString("F1"):"?")+" MB · "+speed.ToString("F1")+" MB/s"+(total>0&&speed>.01?" · 约剩 "+((total-received)/1048576.0/speed).ToString("F0")+" 秒":""),total>0?(int)(100L*received/total):-1);if(attempt<2&&urls.Length>1&&clock.Elapsed.TotalSeconds>20&&speed<.15&&total-received>10485760)throw new IOException("下载源速度过慢，将重试或切换备用源");}}
    if(total>0&&received!=total)throw new IOException("下载长度不完整");}
   }
   Report("正在校验下载文件…");if(Hash(partial)!=hash){File.Delete(partial);throw new Exception("下载校验失败，将重新下载");}if(File.Exists(destination))File.Delete(destination);File.Move(partial,destination);Report("下载校验通过",100);return;
  }catch(OperationCanceledException){throw;}catch(Exception e){last=e;if(attempt+1<urls.Length*2)Report("下载暂时失败，保留进度并重试："+e.Message);}}
  throw new Exception("依赖下载失败。请检查网络后重试，已下载部分保留。",last);
 }
 public void EnsureRuntimes(RuntimePlan plan,bool downloadAuthorized){
  if(plan.Downloads.Count>0&&!downloadAuthorized)throw new InvalidOperationException("尚未获得下载和安装依赖的授权");Check();Directory.CreateDirectory(Tools);
  if(plan.NeedFFmpeg){string name="ffmpeg-"+FFVersion+"-essentials_build.zip",file=Path.Combine(Cache,name);Download(new[]{"https://www.gyan.dev/ffmpeg/builds/packages/"+name,"https://github.com/GyanD/codexffmpeg/releases/download/"+FFVersion+"/"+name},"fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9",file);Extract(file,Tools);string bin=Path.Combine(Tools,"ffmpeg-"+FFVersion+"-essentials_build/bin");plan.FFmpeg=Path.Combine(bin,"ffmpeg.exe");plan.FFprobe=Path.Combine(bin,"ffprobe.exe");if(!ValidFF(plan.FFmpeg)||!ValidFF(plan.FFprobe))throw new Exception("FFmpeg 安装后验证未通过");}
  if(plan.NeedWebView2){string bootstrap=Path.Combine(plan.Payload,"bin/MicrosoftEdgeWebview2Setup.exe");if(!File.Exists(bootstrap)||Hash(bootstrap)!="17debf797a6c737959bc588236e897936ffac1af5f7e515e674ab32f9edfe719")throw new Exception("WebView2 安装引导程序校验失败");Report("正在安装 Microsoft WebView2 Runtime…");Run(bootstrap,new[]{"/silent","/install"},plan.RuntimePath,plan.Payload);string result=Probe(plan.Native,"check-runtime");if(string.IsNullOrWhiteSpace(result)||!result.Contains("webview2"))throw new Exception("WebView2 Runtime 安装后未通过检测");}
  Check();Report("运行环境准备完成，无需 Node.js 或 Electron",100);
 }
 public void Run(string exe,IEnumerable<string> arguments,string runtimePath,string cwd){
  Check();var errors=new List<string>();var outputClosed=new ManualResetEventSlim(false),errorClosed=new ManualResetEventSlim(false);using(var p=new Process()){p.StartInfo=new ProcessStartInfo(exe,string.Join(" ",arguments.Select(Quote))){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=cwd,RedirectStandardOutput=true,RedirectStandardError=true};p.StartInfo.EnvironmentVariables["PATH"]=runtimePath+Path.PathSeparator+(Environment.GetEnvironmentVariable("PATH")??"");
   p.OutputDataReceived+=(s,e)=>{if(e.Data!=null)AppendProcessLog(e.Data);else outputClosed.Set();};p.ErrorDataReceived+=(s,e)=>{if(e.Data!=null){lock(errors)errors.Add(e.Data);AppendProcessLog(e.Data);}else errorClosed.Set();};p.Start();p.BeginOutputReadLine();p.BeginErrorReadLine();var clock=Stopwatch.StartNew();
   while(!p.WaitForExit(500)){if(Canceled||clock.Elapsed.TotalMinutes>15){using(var kill=Process.Start(new ProcessStartInfo("taskkill.exe","/PID "+p.Id+" /T /F"){UseShellExecute=false,CreateNoWindow=true}))kill.WaitForExit(5000);Check();throw new Exception("安装步骤超时，请查看安装日志");}}int exitCode=p.ExitCode;
   if(!outputClosed.Wait(1000))try{p.CancelOutputRead();}catch{}if(!errorClosed.Wait(1000))try{p.CancelErrorRead();}catch{}
   if(exitCode!=0){string forceError;lock(errors)forceError=errors.FirstOrDefault(line=>line.Contains("[FORCE_AVAILABLE]"));if(forceError!=null)throw new Exception(forceError);throw new Exception("安装步骤未完成（退出码 "+exitCode+"），详细原因已写入安装日志。");}}
 }
 void AppendProcessLog(string line){lock(logLock)File.AppendAllText(LogFile,line+Environment.NewLine,Encoding.UTF8);}
 public void Install(RuntimePlan p,string terre,string games,string output,string url,bool start){
  Report("正在更新 Terre 原生导出组件…");var args=new List<string>{"install","--terre-dir",terre,"--games-root",games,"--output-dir",output,"--terre-url",url,"--runtime-path",p.RuntimePath};string wrapper=Path.Combine(terre,"video-export-wrapper.json");
  if(File.Exists(wrapper)){var old=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(wrapper));if(old.ContainsKey("config")&&File.Exists(old["config"]))args.AddRange(new[]{"--state-dir",Path.GetDirectoryName(old["config"])});}
  Run(p.Native,args,p.RuntimePath,p.Payload);if(start){Report("正在启动 Terre 与原生导出组件…");Run(p.Native,new[]{"launch","--terre-dir",terre},p.RuntimePath,p.Payload);}Report("安装完成。以后照常启动 Terre 即可。",100);
 }
}
public class InstallationState {
 public bool ValidTerre,Mounted,UpdateAvailable;public string Version,Message;
 static string[] ParseVersion(string value){var m=System.Text.RegularExpressions.Regex.Match(value??"",@"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$");if(!m.Success)throw new FormatException("无法识别版本");return new[]{m.Groups[1].Value,m.Groups[2].Value,m.Groups[3].Value,m.Groups[4].Value};}
 static int NumericCompare(string a,string b){a=a.TrimStart('0');b=b.TrimStart('0');return a.Length!=b.Length?a.Length.CompareTo(b.Length):String.CompareOrdinal(a,b);}
 public static int CompareVersions(string a,string b){var x=ParseVersion(a);var y=ParseVersion(b);for(int i=0;i<3;i++){int c=NumericCompare(x[i],y[i]);if(c!=0)return c;}if(x[3]==y[3])return 0;if(x[3]=="")return 1;if(y[3]=="")return -1;var xp=x[3].Split('.');var yp=y[3].Split('.');for(int i=0;i<Math.Min(xp.Length,yp.Length);i++){bool xn=xp[i].All(Char.IsDigit),yn=yp[i].All(Char.IsDigit);int c=xn&&yn?NumericCompare(xp[i],yp[i]):xn!=yn?(xn?-1:1):String.CompareOrdinal(xp[i],yp[i]);if(c!=0)return c;}return xp.Length.CompareTo(yp.Length);}
 public static InstallationState Read(string directory,string packageVersion){var state=new InstallationState();try{
  state.ValidTerre=File.Exists(Path.Combine(directory,"public/index.html"));var marker=Path.Combine(directory,"video-export-wrapper.json");state.Mounted=File.Exists(marker);
  if(!state.Mounted){state.Message=state.ValidTerre?"尚未挂载。缺少运行依赖时会先征得您的同意。":"请选择有效的 Terre 安装目录。";return state;}
  var json=new JavaScriptSerializer();var wrapper=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(marker));object version;
  if(wrapper.TryGetValue("version",out version)&&version is string)state.Version=(string)version;
  if(String.IsNullOrWhiteSpace(state.Version)){var file=Path.Combine(directory,"video-export/package.json");if(File.Exists(file)){var p=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));if(p.TryGetValue("version",out version))state.Version=version as string;}}
  if(String.IsNullOrWhiteSpace(state.Version)){state.Message="已挂载，但无法识别版本；暂不提供更新，可卸载此挂载。";return state;}
  int comparison=CompareVersions(packageVersion,state.Version);state.UpdateAvailable=comparison>0;
  state.Message=comparison>0?"已安装 "+state.Version+"，可更新至 "+packageVersion+"。":comparison==0?"已安装当前版本 "+state.Version+"，无需更新。":"已安装 "+state.Version+"，高于本安装包 "+packageVersion+"，不提供降级。";
 }catch{state.UpdateAvailable=false;state.Message=state.Mounted?"已检测到挂载，但安装记录或版本无法读取；请查看安装目录。":"无法读取所选目录，请重新选择。";}return state;}
}
public class SetupForm:Form {
 TextBox terre,games,output,url;Label status,elapsed,headline;ProgressBar progress;Button install,cancel,remove,findTerre,selectTerre;Panel advanced;CheckBox advancedToggle,start;SetupEngine engine;RuntimePlan plan;bool busy,locatingTerre;DateTime phaseStart;string phase="";
 public SetupForm(){
  Text="WebGAL 视频导出 · 安装";ClientSize=new Size(780,510);FormBorderStyle=FormBorderStyle.Sizable;MaximizeBox=false;MinimumSize=new Size(820,550);AutoScroll=true;StartPosition=FormStartPosition.CenterScreen;Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(248,249,251);AutoScaleMode=AutoScaleMode.Dpi;
  headline=new Label{Text="安装视频导出工具",Font=new Font(Font.FontFamily,19,FontStyle.Bold),Location=new Point(28,24),Size=new Size(720,42)};Controls.Add(headline);
  Controls.Add(new Label{Text="选择已有的 Terre，安装器会检测并帮助补齐运行环境。",Location=new Point(30,104),Size=new Size(720,28),ForeColor=Color.DimGray});
  terre=Field(this,"Terre 安装目录",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGal_Terre"),138,true);
  advancedToggle=new CheckBox{Text="高级选项",Location=new Point(30,218),AutoSize=true};Controls.Add(advancedToggle);advanced=new Panel{Location=new Point(0,248),Size=new Size(770,128),Visible=false};Controls.Add(advanced);
  games=Field(advanced,"游戏目录",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".webgal_terre/games"),0,true);output=Field(advanced,"成片保存目录",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),"WebGAL Exports"),42,true);url=Field(advanced,"Terre 本机地址","http://localhost:3001",84,false);
  start=new CheckBox{Text="安装完成后启动 Terre",Checked=true,Location=new Point(30,300),AutoSize=true};Controls.Add(start);
  status=new Label{Text="就绪。缺少依赖时会先征得您的同意。",Location=new Point(30,338),Size=new Size(720,60)};Controls.Add(status);progress=new ProgressBar{Location=new Point(30,404),Size=new Size(720,9)};Controls.Add(progress);elapsed=new Label{Location=new Point(30,420),Size=new Size(720,25),ForeColor=Color.DimGray};Controls.Add(elapsed);
  var logs=new Button{Text="打开日志",Location=new Point(30,458),Size=new Size(100,34)};logs.Click+=(s,e)=>{try{if(!File.Exists(engine.LogFile))File.WriteAllText(engine.LogFile,"暂无安装日志。");Process.Start("notepad.exe",SetupEngine.Quote(engine.LogFile));}catch(Exception x){MessageBox.Show(this,x.Message);}};Controls.Add(logs);
  remove=new Button{Text="卸载 WebVideo+",Location=new Point(142,458),Size=new Size(140,34)};Controls.Add(remove);remove.Click+=async(s,e)=>await Uninstall();
  cancel=new Button{Text="取消",Location=new Point(532,458),Size=new Size(100,34),Visible=false};cancel.Click+=(s,e)=>{if(busy){engine.Canceled=true;cancel.Enabled=false;status.Text="正在取消，请稍候…";}};Controls.Add(cancel);
  install=new Button{Text="检测并安装",Location=new Point(642,458),Size=new Size(108,34),BackColor=Color.FromArgb(28,102,207),ForeColor=Color.White,FlatStyle=FlatStyle.Flat};Controls.Add(install);install.Click+=async(s,e)=>await Install();
  var lower=Controls.Cast<Control>().Where(c=>c!=advanced&&c.Top>=248).ToArray();ClientSize=new Size(780,510);advancedToggle.CheckedChanged+=(s,e)=>{advanced.Visible=advancedToggle.Checked;int delta=advanced.Height*(advancedToggle.Checked?1:-1);foreach(var c in lower)c.Top+=delta;ClientSize=new Size(780,510+(advancedToggle.Checked?advanced.Height:0));};
  Controls.Add(new Label{Text="【内部版本 0.3.1 · C# / WebView2】",Location=new Point(30,72),Size=new Size(720,26),ForeColor=Color.FromArgb(150,75,20)});
  engine=new SetupEngine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGALVideoExporter"),Report);
  try{var f=Path.Combine(engine.Root,"last-install.json");if(File.Exists(f)){var recent=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(f));terre.Text=(string)recent["terreDir"];games.Text=(string)recent["gamesRoot"];output.Text=(string)recent["outputDir"];url.Text=(string)recent["terreUrl"];}}catch{}
  var detection=new System.Windows.Forms.Timer{Interval=300};detection.Tick+=(s,e)=>{detection.Stop();if(!busy&&!locatingTerre)RefreshInstallation(true);};terre.TextChanged+=(s,e)=>{detection.Stop();detection.Start();};Shown+=async(s,e)=>await AutoFindTerre(true);FormClosed+=(s,e)=>detection.Dispose();
  var timer=new System.Windows.Forms.Timer{Interval=1000};timer.Tick+=(s,e)=>{if(busy)elapsed.Text="本步骤已用 "+(DateTime.Now-phaseStart).ToString(@"mm\:ss");};timer.Start();FormClosed+=(s,e)=>timer.Dispose();FormClosing+=(s,e)=>{if(busy){e.Cancel=true;engine.Canceled=true;status.Text="正在取消，请等待后台步骤结束。";}};
 }
 TextBox Field(Control parent,string name,string value,int top,bool browse){
  bool terreField=Object.ReferenceEquals(parent,this)&&name=="Terre 安装目录";
  parent.Controls.Add(new Label{Text=name,Location=new Point(30,top+4),AutoSize=true});
  var box=new TextBox{Text=value,Location=terreField?new Point(30,top+34):new Point(170,top),Size=terreField?new Size(510,29):new Size(browse?470:580,29)};parent.Controls.Add(box);
  if(browse){
   if(terreField){findTerre=new Button{Text="自动查找",Location=new Point(550,top+33),Size=new Size(100,30)};parent.Controls.Add(findTerre);findTerre.Click+=async(s,e)=>await AutoFindTerre(true);}
   var b=new Button{Text=terreField?"选择…":"浏览…",Location=terreField?new Point(660,top+33):new Point(650,top-1),Size=terreField?new Size(90,30):new Size(90,30)};parent.Controls.Add(b);if(terreField)selectTerre=b;
   b.Click+=(s,e)=>{if(terreField){var selected=SelectTerreManually(this);if(selected!=null)box.Text=selected;}else using(var d=new FolderBrowserDialog{Description=name,SelectedPath=box.Text})if(d.ShowDialog(this)==DialogResult.OK)box.Text=d.SelectedPath;};
  }
  return box;
 }
 static readonly string[] TerreExeNames={"WebGAL_Terre.exe","WebGAL Terre.exe"};
 static bool IsTerreExeName(string file){return System.Text.RegularExpressions.Regex.Replace(Path.GetFileNameWithoutExtension(file)??"",@"[\s_-]+","").Equals("WebGALTerre",StringComparison.OrdinalIgnoreCase);}
 static string ValidTerreRoot(string directory){try{
  if(String.IsNullOrWhiteSpace(directory))return null;directory=Path.GetFullPath(directory.Trim().Trim('"'));if(!Directory.Exists(directory)||!File.Exists(Path.Combine(directory,"public","index.html")))return null;
  if(TerreExeNames.Any(name=>File.Exists(Path.Combine(directory,name))))return directory;
  foreach(var exe in Directory.GetFiles(directory,"*.exe",SearchOption.TopDirectoryOnly))if(IsTerreExeName(exe))return directory;
 }catch{}return null;}
 static string ShortcutTarget(string link){object shell=null,shortcut=null;try{
  var type=Type.GetTypeFromProgID("WScript.Shell");if(type==null)return null;shell=Activator.CreateInstance(type);shortcut=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{link});
  return Convert.ToString(shortcut.GetType().InvokeMember("TargetPath",BindingFlags.GetProperty,null,shortcut,null));
 }catch{return null;}finally{try{if(shortcut!=null&&System.Runtime.InteropServices.Marshal.IsComObject(shortcut))System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shortcut);}catch{}try{if(shell!=null&&System.Runtime.InteropServices.Marshal.IsComObject(shell))System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);}catch{}}}
 static string ResolveTerreSelection(string selected){try{
  if(String.IsNullOrWhiteSpace(selected))return null;if(Directory.Exists(selected))return ValidTerreRoot(selected);if(!File.Exists(selected))return null;
  if(Path.GetExtension(selected).Equals(".lnk",StringComparison.OrdinalIgnoreCase)){var target=ShortcutTarget(selected);return String.IsNullOrWhiteSpace(target)?null:ResolveTerreSelection(target);}
  if(Path.GetExtension(selected).Equals(".exe",StringComparison.OrdinalIgnoreCase)&&IsTerreExeName(selected))return ValidTerreRoot(Path.GetDirectoryName(Path.GetFullPath(selected)));
 }catch{}return null;}
 static IEnumerable<string> WalkDirectories(string root,int maxDepth,int cap){
  if(String.IsNullOrWhiteSpace(root)||!Directory.Exists(root))yield break;var queue=new Queue<Tuple<string,int>>();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);queue.Enqueue(Tuple.Create(Path.GetFullPath(root),0));int visited=0;
  while(queue.Count>0&&visited<cap){var item=queue.Dequeue();if(!seen.Add(item.Item1))continue;visited++;yield return item.Item1;if(item.Item2>=maxDepth)continue;string[] children;try{children=Directory.GetDirectories(item.Item1);}catch{continue;}
   foreach(var child in children){try{if((File.GetAttributes(child)&FileAttributes.ReparsePoint)!=0)continue;}catch{continue;}queue.Enqueue(Tuple.Create(child,item.Item2+1));}
  }
 }
 static IEnumerable<string> FindShortcuts(string root,int maxDepth){foreach(var dir in WalkDirectories(root,maxDepth,2500)){string[] files;try{files=Directory.GetFiles(dir,"*.lnk",SearchOption.TopDirectoryOnly);}catch{continue;}foreach(var file in files)yield return file;}}
 static string[] DiscoverTerre(string preferred){
  var found=new List<string>();Action<string> add=value=>{var root=ResolveTerreSelection(value);if(root!=null&&!found.Contains(root,StringComparer.OrdinalIgnoreCase))found.Add(root);};
  add(preferred);if(found.Count>0)return found.ToArray();
  string local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);foreach(var known in new[]{Path.Combine(local,"WebGal_Terre"),Path.Combine(local,"Programs","WebGAL Terre"),Path.Combine(local,"Programs","WebGAL_Terre")})add(known);if(found.Count>0)return found.ToArray();
  var shortcutRoots=new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu),Environment.GetFolderPath(Environment.SpecialFolder.Programs),Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms)}.Where(x=>!String.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase);
  foreach(var root in shortcutRoots)foreach(var link in FindShortcuts(root,root.IndexOf("Start Menu",StringComparison.OrdinalIgnoreCase)>=0?5:2)){var target=ShortcutTarget(link);if(!String.IsNullOrWhiteSpace(target)&&IsTerreExeName(target))add(target);if(found.Count>=8)break;}
  if(found.Count>0)return found.ToArray();
  string user=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),programFiles=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),programFilesX86=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
  var roots=new[]{Tuple.Create(Path.Combine(local,"Programs"),3),Tuple.Create(local,2),Tuple.Create(programFiles,3),Tuple.Create(programFilesX86,3),Tuple.Create(Path.Combine(user,"Desktop"),2),Tuple.Create(Path.Combine(user,"Downloads"),2),Tuple.Create(user,1)};
  foreach(var scan in roots){foreach(var dir in WalkDirectories(scan.Item1,scan.Item2,1800)){foreach(var name in TerreExeNames){var exe=Path.Combine(dir,name);if(File.Exists(exe))add(exe);}if(found.Count>=8)break;}if(found.Count>=8)break;}
  return found.ToArray();
 }
 string ChooseTerreCandidate(string[] candidates){
  if(candidates==null||candidates.Length==0)return null;if(candidates.Length==1)return candidates[0];string selected=null;
  using(var f=new Form{Text="选择 WebGAL Terre",ClientSize=new Size(620,300),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,StartPosition=FormStartPosition.CenterParent,Font=Font,BackColor=BackColor}){
   f.Controls.Add(new Label{Text="检测到多个 WebGAL Terre，请选择要安装 WebVideo+ 的实例：",Location=new Point(24,22),Size=new Size(570,30)});
   var list=new ListBox{Location=new Point(24,58),Size=new Size(570,160)};list.Items.AddRange(candidates.Cast<object>().ToArray());list.SelectedIndex=0;f.Controls.Add(list);
   var cancelButton=new Button{Text="取消",Location=new Point(24,242),Size=new Size(90,34),DialogResult=DialogResult.Cancel};f.Controls.Add(cancelButton);
   var useButton=new Button{Text="使用此路径",Location=new Point(474,242),Size=new Size(120,34)};f.Controls.Add(useButton);useButton.Click+=(sender,args)=>{if(list.SelectedItem!=null){selected=Convert.ToString(list.SelectedItem);f.DialogResult=DialogResult.OK;f.Close();}};
   f.CancelButton=cancelButton;f.AcceptButton=useButton;f.ShowDialog(this);
  }return selected;
 }
 string SelectTerreManually(IWin32Window owner){string selected=null;
  using(var f=new Form{Text="手动选择 WebGAL Terre",ClientSize=new Size(560,250),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,StartPosition=FormStartPosition.CenterParent,Font=Font,BackColor=BackColor}){
   f.Controls.Add(new Label{Text="您可以选择 Terre 安装文件夹、WebGAL_Terre.exe 本身，或指向它的快捷方式。",Location=new Point(24,22),Size=new Size(510,48)});
   Action<string> accept=value=>{var root=ResolveTerreSelection(value);if(root==null){MessageBox.Show(f,"所选项目不是有效的 WebGAL Terre。请确认其中包含 Terre 主程序和 public/index.html。","无法识别 Terre",MessageBoxButtons.OK,MessageBoxIcon.Warning);return;}selected=root;f.DialogResult=DialogResult.OK;f.Close();};
   var folder=new Button{Text="选择 Terre 文件夹",Location=new Point(24,92),Size=new Size(155,42)};folder.Click+=(sender,args)=>{using(var d=new FolderBrowserDialog{Description="选择 WebGAL Terre 安装文件夹",SelectedPath=terre.Text})if(d.ShowDialog(f)==DialogResult.OK)accept(d.SelectedPath);};f.Controls.Add(folder);
   var exe=new Button{Text="选择 EXE",Location=new Point(202,92),Size=new Size(155,42)};exe.Click+=(sender,args)=>{using(var d=new OpenFileDialog{Title="选择 WebGAL Terre 主程序",Filter="WebGAL Terre|WebGAL_Terre.exe;WebGAL Terre.exe|可执行文件|*.exe|所有文件|*.*",CheckFileExists=true})if(d.ShowDialog(f)==DialogResult.OK)accept(d.FileName);};f.Controls.Add(exe);
   var shortcut=new Button{Text="选择快捷方式",Location=new Point(380,92),Size=new Size(155,42)};shortcut.Click+=(sender,args)=>{using(var d=new OpenFileDialog{Title="选择 WebGAL Terre 快捷方式",Filter="快捷方式|*.lnk|所有文件|*.*",CheckFileExists=true})if(d.ShowDialog(f)==DialogResult.OK)accept(d.FileName);};f.Controls.Add(shortcut);
   var cancelButton=new Button{Text="取消",Location=new Point(24,190),Size=new Size(90,34),DialogResult=DialogResult.Cancel};f.Controls.Add(cancelButton);f.CancelButton=cancelButton;f.ShowDialog(owner);
  }return selected;
 }
 string PromptMissingTerre(){
  string selected=null;using(var f=new Form{Text="未找到 WebGAL Terre",ClientSize=new Size(560,215),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,StartPosition=FormStartPosition.CenterParent,Font=Font,BackColor=BackColor}){
   f.Controls.Add(new Label{Text="未能自动扫描到您的 WebGAL Terre 安装路径，请您确认已安装 Terre 并手动选择。",Location=new Point(24,28),Size=new Size(510,70)});
   var cancelButton=new Button{Text="取消",Location=new Point(24,155),Size=new Size(90,34),DialogResult=DialogResult.Cancel};f.Controls.Add(cancelButton);
   var manual=new Button{Text="手动选择",Location=new Point(426,155),Size=new Size(110,34)};f.Controls.Add(manual);manual.Click+=(sender,args)=>{var root=SelectTerreManually(f);if(root!=null){selected=root;f.DialogResult=DialogResult.OK;f.Close();}};
   f.CancelButton=cancelButton;f.AcceptButton=manual;f.ShowDialog(this);
  }return selected;
 }
 async Task AutoFindTerre(bool promptWhenMissing){
  if(busy||locatingTerre)return;locatingTerre=true;if(findTerre!=null)findTerre.Enabled=false;status.Text="正在自动查找 WebGAL Terre…";
  try{
   string preferred=terre.Text;var candidates=await Task.Run(()=>DiscoverTerre(preferred));string selected=ChooseTerreCandidate(candidates);
   if(selected==null&&candidates.Length==0&&promptWhenMissing)selected=PromptMissingTerre();
   if(selected!=null){terre.Text=selected;RefreshInstallation(false);status.Text="已找到 WebGAL Terre："+selected;}
   else if(candidates.Length==0)status.Text="未找到 WebGAL Terre。请确认已安装 Terre，或点击“选择…”手动指定。";
   else status.Text="未选择 Terre。可以点击“自动查找”重新扫描，或点击“选择…”手动指定。";
  }finally{locatingTerre=false;if(findTerre!=null)findTerre.Enabled=true;}
 }

 void Report(SetupProgress p){if(IsDisposed)return;BeginInvoke((Action)(()=>{status.Text=p.Message;if(!p.Message.StartsWith("正在下载")&&phase!=p.Message){phase=p.Message;phaseStart=DateTime.Now;}progress.Style=p.Percent<0?ProgressBarStyle.Marquee:ProgressBarStyle.Continuous;if(p.Percent>=0)progress.Value=Math.Min(100,Math.Max(0,p.Percent));}));}
 void RefreshInstallation(bool showMessage){var current=InstallationState.Read(terre.Text,InstallerBuild.PackageVersion);install.Visible=!current.Mounted||current.UpdateAvailable;install.Enabled=!busy&&current.ValidTerre&&install.Visible;install.Text=current.Mounted?"更新":"检测并安装";remove.Visible=current.Mounted;remove.Enabled=!busy&&current.Mounted;headline.Text=current.Mounted?"管理视频导出工具":"安装视频导出工具";Text=current.Mounted?"WebGAL 视频导出 · 管理":"WebGAL 视频导出 · 安装";start.Text=current.Mounted?"更新完成后启动 Terre":"安装完成后启动 Terre";start.Visible=advancedToggle.Visible=install.Visible;if(!install.Visible)advancedToggle.Checked=false;cancel.Left=install.Visible?432:570;if(showMessage)status.Text=current.Message;}
 void SetBusy(bool value){busy=value;install.Enabled=remove.Enabled=terre.Enabled=advanced.Enabled=advancedToggle.Enabled=start.Enabled=!value;if(findTerre!=null)findTerre.Enabled=!value;if(selectTerre!=null)selectTerre.Enabled=!value;cancel.Visible=value;cancel.Enabled=true;cancel.Text="取消";if(value){engine.Canceled=false;phaseStart=DateTime.Now;}else{progress.Style=ProgressBarStyle.Continuous;elapsed.Text="";RefreshInstallation(false);}}
 async Task Install(){
  var mounted=InstallationState.Read(terre.Text,InstallerBuild.PackageVersion);if(mounted.Mounted&&!mounted.UpdateAvailable){RefreshInstallation(true);return;}bool updating=mounted.Mounted;
  if(!File.Exists(Path.Combine(terre.Text,"public/index.html"))){MessageBox.Show(this,"没有找到 Terre 的 public/index.html，请选择 Terre 安装目录。","请核对路径");return;}
  Uri address;if(!Uri.TryCreate(url.Text,UriKind.Absolute,out address)||!new[]{"localhost","127.0.0.1"}.Contains(address.Host)){MessageBox.Show(this,"请填写本机 Terre 地址，例如 http://localhost:3001。","请核对地址");return;}
  string t=Path.GetFullPath(terre.Text),g=Path.GetFullPath(games.Text),o=Path.GetFullPath(output.Text),u=url.Text;bool launch=start.Checked;SetBusy(true);
  try{plan=await Task.Run(()=>engine.Inspect(engine.ExtractPayload()));bool consent=plan.Downloads.Count==0;if(!consent){var text="需要下载并安装以下组件：\n\n"+string.Join("\n",plan.Downloads.Select(x=>"• "+x))+"\n\n安装到扩展专用目录：\n"+engine.Root+"\n\n不会更改系统 PATH。下载缓存会保留以便重试。是否同意下载并继续安装？";consent=MessageBox.Show(this,text,"允许安装缺失的运行组件？",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)==DialogResult.Yes;}if(!consent){status.Text="已取消，未下载或安装依赖。";return;}await Task.Run(()=>{engine.EnsureRuntimes(plan,true);engine.Install(plan,t,g,o,u,launch);});RefreshInstallation(true);MessageBox.Show(this,(updating?"更新":"安装")+"完成。以后正常启动 Terre，导出组件会一起启动。",updating?"更新完成":"安装完成");}
  catch(Exception e){engine.Report("安装未完成："+e.Message);MessageBox.Show(this,e.Message+"\n\n可点击“打开日志”查看详情；重新安装会复用下载缓存。","安装未完成");}finally{engine.CleanupPayloadArtifacts();engine.CleanupStalePayloadArtifacts();SetBusy(false);}
 }
 async Task Uninstall(){SetBusy(true);try{string wrapper=Path.Combine(terre.Text,"video-export-wrapper.json");if(!File.Exists(wrapper))throw new Exception("此目录没有找到导出组件的安装记录");var cfg=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(wrapper));if(MessageBox.Show(this,"卸载这份 Terre 的导出挂载？原程序将还原，视频和任务记录保留。","卸载挂载",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;string target=terre.Text;await Task.Run(()=>{string payload=engine.ExtractPayload();engine.Run(Path.Combine(payload,"WebGAL.Video.exe"),new[]{"uninstall","--terre-dir",target,"--state-dir",Path.GetDirectoryName(cfg["config"])},"",payload);});status.Text="已卸载挂载，视频和任务记录保留。";}catch(Exception e){MessageBox.Show(this,e.Message,"卸载未完成");}finally{engine.CleanupPayloadArtifacts();engine.CleanupStalePayloadArtifacts();SetBusy(false);}}
}
public static class InstallerMain {
 [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [STAThread] public static void Main(){AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);SetProcessDPIAware();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);try{Application.Run(new SetupForm());}catch(Exception e){MessageBox.Show(e.Message,"安装器无法启动");}}
}

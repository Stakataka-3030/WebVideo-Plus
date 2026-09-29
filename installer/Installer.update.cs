// Included by configure-installer.mjs after the responsive layout helpers.
public sealed class ReleaseUpdateFinding {
 public string Kind,Message,Url,LatestVersion;
 public ReleaseUpdateFinding(string kind,string message,string url=""){Kind=kind;Message=message;Url=url;}
}

public static class ReleaseUpdateCheck {
 const string Api="https://api.github.com/repos/Stakataka-3030/WebVideo-Plus/releases?per_page=100";
 const string Releases="https://github.com/Stakataka-3030/WebVideo-Plus/releases";
 static readonly string[] Legacy={"1.0.0","1.0.1","1.0.4","1.1.0"};
 static readonly System.Text.RegularExpressions.Regex Tag=new System.Text.RegularExpressions.Regex(@"^v?(\d+)\.(\d+)\.(\d+)$");
 static string Version(string tag){var match=Tag.Match(tag??"");return match.Success?match.Groups[1].Value+"."+match.Groups[2].Value+"."+match.Groups[3].Value:"";}
 static string Value(Dictionary<string,object> row,string key){object value;return row.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):"";}
 static bool Flag(Dictionary<string,object> row,string key){object value;return row.TryGetValue(key,out value)&&value!=null&&Convert.ToBoolean(value);}
 static string Url(string tag){return Version(tag)==""?"":Releases+"/tag/"+Uri.EscapeDataString(tag);}
 static string[] Supports(Dictionary<string,object> release){
  var body=Value(release,"body");var marker=System.Text.RegularExpressions.Regex.Match(body,@"<!--\s*webvideo-compat:\s*(\{[^\r\n]*\})\s*-->",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  if(marker.Success)try{var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(marker.Groups[1].Value);object values;if(data.TryGetValue("webgal",out values)&&values is System.Collections.IEnumerable)return ((System.Collections.IEnumerable)values).Cast<object>().Select(Convert.ToString).Where(value=>System.Text.RegularExpressions.Regex.IsMatch(value??"",@"^\d+\.\d+\.\d+$")).ToArray();return new string[0];}catch{return new string[0];}
  return Legacy.Contains(Version(Value(release,"tag_name")))?new[]{"4.6.4"}:new string[0];
 }
 public static ReleaseUpdateFinding Evaluate(object[] data,string engine,string current){
  if(!System.Text.RegularExpressions.Regex.IsMatch(engine??"",@"^\d+\.\d+\.\d+$"))return new ReleaseUpdateFinding("unknown","无法确认 Terre 默认 WebGAL 引擎版本，不能自动推荐安装包。");
  var releases=data.OfType<Dictionary<string,object>>().Where(row=>!Flag(row,"draft")&&!Flag(row,"prerelease")&&Version(Value(row,"tag_name"))!="").OrderByDescending(row=>new System.Version(Version(Value(row,"tag_name")))).ToArray();
  if(releases.Length==0)throw new IOException("GitHub 没有可读取的正式发行版");
  var compatible=releases.FirstOrDefault(row=>Supports(row).Contains(engine));var latest=releases[0];string latestVersion=Version(Value(latest,"tag_name"));
  if(compatible==null)return new ReleaseUpdateFinding("unsupported","WebGAL "+engine+" 暂无已发布的兼容 WebVideo+ 版本；请勿仅按版本号升级。",Releases);
  string target=Version(Value(compatible,"tag_name")),url=Url(Value(compatible,"tag_name"));
  if(releases.Any(row=>InstallationState.CompareVersions(Version(Value(row,"tag_name")),target)>0&&Supports(row).Length==0))return new ReleaseUpdateFinding("unknown","发现较新的 WebVideo+，但其发行说明没有兼容范围；请在发行页确认后再安装。",Url(Value(latest,"tag_name")));
  if(InstallationState.CompareVersions(target,current)>0)return new ReleaseUpdateFinding("update","WebGAL "+engine+" 可更新至兼容的 WebVideo+ "+target+"。"+(InstallationState.CompareVersions(latestVersion,target)>0?"更新的 "+latestVersion+" 不适配当前引擎。":""),url);
  if(InstallationState.CompareVersions(latestVersion,target)>0)return new ReleaseUpdateFinding("keep","WebGAL "+engine+" 需要保留兼容的 WebVideo+ "+target+"；较新的 "+latestVersion+" 面向其他引擎版本。",url);
  return new ReleaseUpdateFinding("current","WebGAL "+engine+" 暂无比 "+current+" 更新的兼容正式版。");
 }
 public static ReleaseUpdateFinding Fetch(string engine,string current){
  ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;var request=(HttpWebRequest)WebRequest.Create(Api);request.Timeout=7000;request.ReadWriteTimeout=7000;request.UserAgent="WebVideoPlus-Setup/"+current;request.Accept="application/vnd.github+json";
  using(var response=(HttpWebResponse)request.GetResponse())using(var stream=response.GetResponseStream())using(var reader=new StreamReader(stream,Encoding.UTF8)){
   if(response.StatusCode!=HttpStatusCode.OK||response.ContentLength>2*1024*1024)throw new IOException("GitHub 发行列表不可用");
   var text=new StringBuilder();var block=new char[4096];int count;while((count=reader.Read(block,0,block.Length))>0){text.Append(block,0,count);if(text.Length>2*1024*1024)throw new IOException("GitHub 发行列表过大");}
   var serializer=new JavaScriptSerializer{MaxJsonLength=2*1024*1024};var rows=serializer.Deserialize<object[]>(text.ToString());var result=Evaluate(rows,engine,current);result.LatestVersion=rows.OfType<Dictionary<string,object>>().Where(row=>!Flag(row,"draft")&&!Flag(row,"prerelease")&&Version(Value(row,"tag_name"))!="").Select(row=>Version(Value(row,"tag_name"))).OrderByDescending(value=>new System.Version(value)).FirstOrDefault()??current;return result;
  }
 }
}

public partial class SetupForm {
 Label updateStatus;LinkLabel updateAction,updateRetry,updateReminder;System.Windows.Forms.Timer updateTimer;string updateUrl="",updateLatest="";int updateTicket;
 void InitializeUpdateCheck(){
  updateStatus=new Label{Text="选择 Terre 后检查兼容版本。",ForeColor=Color.DimGray,AccessibleName="WebVideo+ 更新检查状态"};
  updateAction=new LinkLabel{Text="查看发行页",Visible=false,AutoSize=false,AccessibleName="打开 WebVideo+ 发行页"};
  updateRetry=new LinkLabel{Text="重新检查",AutoSize=false,AccessibleName="重新检查 WebVideo+ 更新"};
  updateReminder=new LinkLabel{Text="提醒设置",AutoSize=false,AccessibleName="更新提醒设置"};
  var reminderMenu=new ContextMenuStrip();
  foreach(var choice in new[]{Tuple.Create("next-release","下个版本前不要提醒我"),Tuple.Create("next-major","下个主要版本前不要提醒我"),Tuple.Create("never","不要提醒我"),Tuple.Create("on","恢复提醒")}){
   var mode=choice.Item1;reminderMenu.Items.Add(choice.Item2,null,(s,e)=>{try{UpdatePreferences.Save(mode,updateLatest!=""?updateLatest:InstallerBuild.PackageVersion);updateStatus.Text=mode=="on"?"已恢复自动更新提醒；可点“重新检查”立即查询。":"更新提醒设置已保存，Terre 与安装器将共用此设置。";updateUrl="";updateAction.Visible=false;}catch(Exception error){MessageBox.Show(this,error.Message,"提醒设置未保存");}});
  }
  updateReminder.LinkClicked+=(s,e)=>reminderMenu.Show(updateReminder,0,updateReminder.Height);
  Controls.Add(updateStatus);Controls.Add(updateAction);Controls.Add(updateRetry);Controls.Add(updateReminder);
  updateStatus.TextChanged+=(s,e)=>ResponsiveLayout();updateAction.VisibleChanged+=(s,e)=>ResponsiveLayout();
  updateAction.LinkClicked+=(s,e)=>{if(updateUrl!="")try{Process.Start(new ProcessStartInfo(updateUrl){UseShellExecute=true});}catch(Exception error){MessageBox.Show(this,"无法打开发行页："+error.Message,"打开链接失败");}};
  updateRetry.LinkClicked+=async(s,e)=>await CheckUpdatesAsync(true);
  updateTimer=new System.Windows.Forms.Timer{Interval=650};updateTimer.Tick+=async(s,e)=>{updateTimer.Stop();await CheckUpdatesAsync();};
  terre.TextChanged+=(s,e)=>{updateTicket++;updateTimer.Stop();updateTimer.Start();};
  Shown+=(s,e)=>{updateTimer.Stop();updateTimer.Start();};
  FormClosed+=(s,e)=>{updateTicket++;updateTimer.Dispose();};
  ResponsiveLayout();
 }
 string DefaultEngineVersion(){
  string descriptor=Path.Combine(terre.Text,"assets/templates/WebGAL_Template/webgal-engine.json");if(!File.Exists(descriptor)||new FileInfo(descriptor).Length>65536)return "";
  var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(descriptor));
  object id,version;if(!data.TryGetValue("id",out id)||Convert.ToString(id)!="open-webgal.webgal")return "";
  if(!data.TryGetValue("webgalVersion",out version))data.TryGetValue("version",out version);
  return Convert.ToString(version);
 }
 async Task CheckUpdatesAsync(bool manual=false){
  int ticket=++updateTicket;updateUrl="";updateAction.Visible=false;updateRetry.Enabled=true;
  var preference=UpdatePreferences.Read();if(!manual&&Convert.ToString(preference["mode"])=="never"){updateStatus.Text="已关闭自动更新检查；可点“重新检查”手动查询。";return;}
  if(!File.Exists(Path.Combine(terre.Text,"public/index.html"))){updateStatus.Text="选择有效的 Terre 目录后检查更新。";return;}
  string engine;try{engine=DefaultEngineVersion();}catch{engine="";}
  if(String.IsNullOrWhiteSpace(engine)){updateStatus.Text="无法确认 Terre 默认 WebGAL 引擎版本，检查更新失败；安装与启动不受影响。";return;}
  updateStatus.Text="正在检查 WebVideo+ 更新…";updateRetry.Enabled=false;
  try{var result=await Task.Run(()=>ReleaseUpdateCheck.Fetch(engine,InstallerBuild.PackageVersion));if(ticket!=updateTicket||IsDisposed)return;updateLatest=result.LatestVersion;if(!manual&&UpdatePreferences.Suppressed(preference,updateLatest)){updateStatus.Text="更新提醒已暂停；可点“重新检查”手动查询。";return;}if(Convert.ToString(preference["mode"])!="on")try{UpdatePreferences.Save("on","");}catch{}updateStatus.Text=result.Message;updateUrl=result.Url;updateAction.Visible=updateUrl!="";}
  catch{if(ticket==updateTicket&&!IsDisposed)updateStatus.Text="检查更新失败。请检查网络或稍后重试；安装与启动不受影响。";}
  finally{if(ticket==updateTicket&&!IsDisposed)updateRetry.Enabled=true;}
 }
}

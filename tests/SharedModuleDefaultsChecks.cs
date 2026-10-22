using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Web.Script.Serialization;using NativeVideo;
public static class SharedModuleDefaultsChecks {
 static readonly List<string> passed=new List<string>();
 static void Check(bool value,string name){if(!value)throw new Exception(name);passed.Add(name);}
 static void Case(string version,string internalVersion,bool add,bool uncertain,string name,string[] recorded=null){
  var before=new[]{"exporter","compactGameTools"};string note;var result=ModuleCatalog.UpgradeSharedAssetsDefault(before,version,internalVersion,recorded,out note);
  Check(result.Contains("sharedAssets")==add,name+" shared selection");Check(result.Where(x=>x!="sharedAssets").SequenceEqual(before),name+" other modules unchanged");Check((note!="")==uncertain,name+" ambiguity");Check(before.SequenceEqual(new[]{"exporter","compactGameTools"}),name+" input unchanged");
 }
 static void Marker(string directory,string version,string internalVersion,string[] requested,string[] resolved=null){Directory.CreateDirectory(directory);var data=new Dictionary<string,object>{{"version",version},{"modules",resolved??ModuleCatalog.Resolve(requested)},{"requestedModules",requested}};if(internalVersion!=null)data["internalVersion"]=internalVersion;File.WriteAllText(Path.Combine(directory,"webvideo-plus.json"),new JavaScriptSerializer().Serialize(data));}
 public static void Main(string[] args){try{Run(args);}catch(Exception error){Console.Error.WriteLine(error.Message);Environment.ExitCode=1;}}
 public static void Run(string[] args){string root=args[0];Directory.CreateDirectory(root);string note;
  var fresh=ModuleCatalog.UpgradeSharedAssetsDefault(ModuleCatalog.Advanced,null,null,null,out note);Check(fresh.Contains("sharedAssets")&&!fresh.Contains("generativeAI"),"fresh defaults retain shared enabled and AI disabled");
  Case("1.1.9",null,true,false,"formal 464");Case("1.3.3","",true,false,"formal 466");Case("1.1.9","0.8.13",true,false,"formal source internal 464");Case("1.3.3","0.9.5",true,false,"formal source internal 466");
  for(int n=1;n<=10;n++)Case("1.1.9","1.1.9-shared.464."+n,true,false,"premodule 464."+n);
  for(int n=1;n<=7;n++)Case("1.3.3","1.3.3-shared.466."+n,true,false,"premodule 466."+n);
  Case("1.1.9","0.8.14-shared.464.3",true,false,"early 464");Case("1.3.3","0.9.6-shared.466.1",true,false,"early 466");
  Case("1.1.9","1.1.9-shared.464.11",false,false,"first modular 464");Case("1.3.3","1.3.3-shared.466.8",false,false,"first modular 466");
  Case("1.1.9","1.1.9-shared.464.13",false,false,"frozen 464");Case("1.3.3","1.3.3-shared.466.9",false,false,"frozen 466");
  Case("1.1.10",null,false,false,"new formal 464");Case("1.3.4",null,false,false,"new formal 466");
  foreach(var pair in new[]{new[]{"1.2.99",""},new[]{"1.4.0",""},new[]{"2.0.0",""},new[]{"broken",""},new[]{"",""},new[]{"1.1.9","unknown-test"},new[]{"1.3.3","unknown-test"},new[]{"1.1.9","0.8.14"},new[]{"1.3.3","0.9.6"},new[]{"1.1.9","1.1.9-shared.464.0"},new[]{"1.1.9","1.1.9-shared.464.2147483648"},new[]{"1.1.9","1.1.9-shared.466.8"},new[]{"1.1.9","0.8.14-shared.464.4"},new[]{"1.3.3","1.1.9-shared.464.10"}})Case(pair[0],pair[1],false,true,"uncertain "+pair[0]+" / "+pair[1]);
  Case("broken","unknown",false,false,"recorded shared capability",new[]{"sharedAssets"});
  var explicitAi=ModuleCatalog.UpgradeSharedAssetsDefault(new[]{"generativeAI"},"1.1.9",null,null,out note);Check(explicitAi.SequenceEqual(new[]{"generativeAI","sharedAssets"}),"explicit AI choice unchanged by shared migration");
  var initial=new[]{"exporter","subtitles","layerExport","compactGameTools"};
  var dir=Path.Combine(root,"fresh");var form=new InstallerDefaultsFixture(dir);form.Refresh();Check(form.Shared&&!form.Ai,"generated fresh default");
  dir=Path.Combine(root,"old-formal");Marker(dir,"1.1.9",null,initial);form=new InstallerDefaultsFixture(dir);form.Refresh();Check(form.Shared&&!form.Ai,"generated old formal upgrade adds shared only");Check(form.Selected.Where(x=>x!="sharedAssets").OrderBy(x=>x).SequenceEqual(initial.OrderBy(x=>x)),"generated other modules remain native selection");
  form.SetShared(false);form.Refresh();Check(!form.Shared,"same-path refresh does not reapply migration after explicit change");
  Marker(dir,"1.1.10",null,initial);form=new InstallerDefaultsFixture(dir);form.Refresh();Check(!form.Shared,"modified new formal marker stays unchecked after reopen");
  foreach(var row in new[]{new[]{"1.1.9","1.1.9-shared.464.11"},new[]{"1.3.3","1.3.3-shared.466.8"}}){dir=Path.Combine(root,"modular-"+row[0]);Marker(dir,row[0],row[1],initial);form=new InstallerDefaultsFixture(dir);form.Refresh();Check(!form.Shared,"generated first modular cancellation "+row[0]);}
  dir=Path.Combine(root,"unknown");Marker(dir,"1.1.9","unknown-internal",initial);form=new InstallerDefaultsFixture(dir);form.Refresh();Check(!form.Shared&&form.Status.Contains("共享模块"),"generated unknown candidate keeps record and reports ambiguity");
  dir=Path.Combine(root,"unknown-cross-line");Marker(dir,"1.2.99",null,initial);form=new InstallerDefaultsFixture(dir);form.Refresh();Check(!form.Shared&&form.Status.Contains("无法确认旧安装"),"generated unknown numeric line keeps record");
  dir=Path.Combine(root,"capability");Marker(dir,"1.1.9","9.9.9-unknown",initial,new[]{"sharedAssets"});form=new InstallerDefaultsFixture(dir);form.Refresh();Check(!form.Shared&&!form.Status.Contains("无法确认旧安装"),"generated capability record preserves explicit requested exclusion");
  dir=Path.Combine(root,"damaged");Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"webvideo-plus.json"),"{broken");form=new InstallerDefaultsFixture(dir);form.SetShared(false);form.Refresh();Check(!form.Shared&&form.Status.Contains("安装记录无法判定"),"generated damaged marker preserves current shared checkbox");Check(form.Selected.Where(x=>x!="sharedAssets").SequenceEqual(ModuleCatalog.Advanced.Where(x=>x!="sharedAssets")),"damaged marker fallback for other modules is unchanged");Check(!form.Ai,"damaged marker does not add AI");
  dir=Path.Combine(root,"missing-version");Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"webvideo-plus.json"),"{\"modules\":[\"compactGameTools\"],\"requestedModules\":[\"compactGameTools\"]}");form=new InstallerDefaultsFixture(dir);form.Refresh();Check(!form.Shared&&form.Status.Contains("安装记录无法判定"),"missing version preserves recovered shared record");
  dir=Path.Combine(root,"old-ai");Marker(dir,"1.3.3",null,new[]{"generativeAI"});form=new InstallerDefaultsFixture(dir);form.Refresh();Check(form.Shared&&form.Ai,"generated old explicit AI remains selected");
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{passed=true,checks=passed.Count,scope="actual ModuleCatalog and generated RefreshInstallation/SelectedModules/ReconcileModules in inert controls; no installer UI or installation",tests=passed}));
 }
}
public enum CheckState {Unchecked,Checked,Indeterminate}
public sealed class FixtureControl {public string Text="";public bool Enabled,Visible;public CheckState CheckState;public bool Checked{get{return CheckState==CheckState.Checked;}set{CheckState=value?CheckState.Checked:CheckState.Unchecked;}}}
public static class InstallerBuild {public const string PackageVersion="9.0.0";}
public partial class InstallerDefaultsFixture {
 readonly Dictionary<string,FixtureControl> moduleBoxes=new Dictionary<string,FixtureControl>();
 FixtureControl terre=new FixtureControl(),install=new FixtureControl(),remove=new FixtureControl(),headline=new FixtureControl(),start=new FixtureControl(),advancedToggle=new FixtureControl(),status=new FixtureControl(),aiModule=new FixtureControl(),moduleNote=new FixtureControl();
 bool busy=false,syncModules=false,savedSharedSelection;string loadedModulesPath="",sharedModuleHistoryNote="",Text="";
 public InstallerDefaultsFixture(string directory){terre.Text=directory;foreach(var id in ModuleCatalog.Advanced)moduleBoxes[id]=new FixtureControl{Checked=true};}
 void LoadStoragePaths(){}
 public void Refresh(){RefreshInstallation(true);}public void SetShared(bool value){moduleBoxes["sharedAssets"].Checked=value;ReconcileModules();}
 public bool Shared{get{return moduleBoxes["sharedAssets"].Checked;}}public bool Ai{get{return aiModule.Checked;}}public string Status{get{return status.Text;}}public string[] Selected{get{return SelectedModules();}}
}
public partial class InstallationState {
 public bool ValidTerre=true,UpdateAvailable=true,Mounted;public string Version="1.1.9",Message="fixture";
 public static InstallationState Read(string directory,string packageVersion){return new InstallationState{Mounted=File.Exists(Path.Combine(directory,"webvideo-plus.json"))};}
}

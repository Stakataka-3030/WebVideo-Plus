using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Portable, inert fixtures exercise the production discovery/preflight source.
// No host, launcher, registry mutation or desktop shortcut is executed here.
public static class SetupPathChecks {
 static int checks;
 public static int Main(string[] args) { Run(Path.GetFullPath(args[0]));return 0; }
 static void Check(bool condition,string name) { if(!condition)throw new Exception(name);checks++; }
 static void Reject(Action action,string name) { bool rejected=false;try{action();}catch{rejected=true;}Check(rejected,"Accepted "+name); }
 static Dictionary<string,object> Read(string path) { return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(path)); }
 public static void RejectSelection(string value) { Check(CraftSetupPaths.ResolveCraftSelection(value)==null,"Accepted linked selection"); }
 public static void RejectDestination(string destination,string craft) { Reject(()=>CraftSetupPaths.Validate(destination,craft,new string[0]),"linked destination"); }
 public static void RejectRecoveryCache(string cache,string destination,string craft) { Reject(()=>CraftSetupPaths.ValidateCache(cache,destination,craft,true),"linked host path during recovery"); }
 public static void Run(string fixture) {
  string host=Path.Combine(fixture,"host"),craft=Path.Combine(host,"webgal-craft.exe"),adapter=Path.Combine(fixture,"adapter"),config=Path.Combine(adapter,"config.json"),mirror=Path.Combine(host,"webvideo-craft.install.json"),cache=Path.Combine(fixture,"cache");
  string originalConfig=File.ReadAllText(config),originalMirror=File.ReadAllText(mirror);
  Check(CraftSetupPaths.NormalizeFolder("  \""+adapter+"\"  ")==adapter,"Quoted path normalization");
  Environment.SetEnvironmentVariable("CRAFT_SETUP_TEST_ROOT",fixture);
  try{Check(CraftSetupPaths.NormalizeFolder(Path.Combine("%CRAFT_SETUP_TEST_ROOT%","adapter"))==adapter,"Environment expansion");}finally{Environment.SetEnvironmentVariable("CRAFT_SETUP_TEST_ROOT",null);}
  foreach(string bad in new[]{"","relative/path",Path.Combine(fixture,"bad."),Path.Combine(fixture,"bad:name"),Path.Combine(fixture,"con"),Path.Combine(fixture,"bad\"name")})Reject(()=>CraftSetupPaths.NormalizeFolder(bad),"unsafe path: "+bad);
  Check(CraftSetupPaths.ResolveCraftSelection(host)==craft,"Resolve exact host folder");
  Check(CraftSetupPaths.ResolveCraftSelection(craft)==craft,"Resolve exact executable");
  Check(CraftSetupPaths.ResolveCraftSelection(Path.Combine(host,"missing.exe"))==null,"Missing executable");
  string wrong=Path.Combine(host,"Craft.exe");File.WriteAllText(wrong,"inert");
  Check(CraftSetupPaths.ResolveCraftSelection(wrong)==null,"Reject similarly named executable");
  string[] links=Enumerable.Range(0,10).Select(i=>Path.Combine(fixture,"shortcut"+i+".lnk")).ToArray();foreach(string link in links)File.WriteAllText(link,"inert shortcut fixture");
  int resolutions=0;
  Check(CraftSetupPaths.ResolveCraftSelection(links[0],link=>{resolutions++;return craft;})==craft&&resolutions==1,"Resolve shortcut target");
  resolutions=0;Check(CraftSetupPaths.ResolveCraftSelection(links[0],link=>{resolutions++;return link;})==null&&resolutions==1,"Reject shortcut cycle");
  resolutions=0;Check(CraftSetupPaths.ResolveCraftSelection(links[0],link=>links[++resolutions])==null&&resolutions==8,"Bound shortcut-chain depth");
  string second=Path.Combine(fixture,"second-host");Directory.CreateDirectory(second);string secondExe=Path.Combine(second,"webgal-craft.exe");File.WriteAllText(secondExe,"inert second host");
  string[] candidates=CraftSetupPaths.CollectCandidates(new[]{wrong,host,craft,second,secondExe});
  Check(candidates.Length==2&&candidates[0]==craft&&candidates[1]==secondExe,"Return all ambiguous candidates and deduplicate");
  string externalAdapter=Path.Combine(fixture,"custom-external-adapter"),externalHost=Path.Combine(fixture,"custom-external-host","webgal-craft.exe"),externalLauncher=Path.Combine(externalAdapter,"WebVideoCraft.Launcher.exe"),externalConfig=Path.Combine(externalAdapter,"config.json");
  string originalExternalConfig=File.ReadAllText(externalConfig);
  string secondExternalAdapter=Path.Combine(fixture,"custom-external-adapter-two"),secondExternalLauncher=Path.Combine(secondExternalAdapter,"WebVideoCraft.Launcher.exe");

  Check(CraftSetupPaths.ReadInstalled(externalAdapter).Mode=="external","External fixture uses a real installation transaction");
  Check(CraftSetupPaths.ResolveCraftSelection(externalLauncher)==externalHost,"Resolve owned custom external launcher");
  Check(CraftSetupPaths.ResolveCraftSelection(links[0],link=>externalLauncher)==externalHost,"Resolve enhanced desktop shortcut to custom external host");
  Check(CraftSetupPaths.CollectCandidates(new[]{externalLauncher,externalHost}).Length==1,"Deduplicate enhanced launcher and official host candidates");
  var shortcutOwner=CraftSetupPaths.ResolveInstalledSelection(links[0],link=>externalLauncher);
  Check(shortcutOwner!=null&&shortcutOwner.AdapterRoot==externalAdapter&&shortcutOwner.CraftExe==externalHost,"Preserve custom external adapter root from enhanced shortcut");
  Check(CraftSetupPaths.ResolveInstalledSelection(externalAdapter).AdapterRoot==externalAdapter,"Resolve owned adapter directory");
  Check(CraftSetupPaths.ResolveInstalledSelection(externalLauncher).AdapterRoot==externalAdapter,"Resolve owned launcher metadata");
  Check(CraftSetupPaths.ResolveInstalledSelection(craft).AdapterRoot==adapter,"Resolve same-name host ownership metadata");
  Check(CraftSetupPaths.ResolveInstalledSelection(externalHost)==null,"External host alone must not invent an adapter association");
  var owners=CraftSetupPaths.CollectInstallations(externalHost,new[]{links[0],externalAdapter,externalLauncher,secondExternalLauncher,adapter},link=>externalLauncher);
  Check(owners.Length==2&&owners[0].AdapterRoot==externalAdapter&&owners[1].AdapterRoot==secondExternalAdapter,"Return every ambiguous matching adapter and deduplicate roots");
  Check(CraftSetupPaths.CollectInstallations(craft,new[]{externalAdapter,secondExternalAdapter}).Length==0,"Reject installation hints associated with another host");
  resolutions=0;Check(CraftSetupPaths.ResolveInstalledSelection(links[0],link=>{resolutions++;return link;})==null&&resolutions==1,"Reject ownership shortcut cycle");
  resolutions=0;Check(CraftSetupPaths.ResolveInstalledSelection(links[0],link=>links[++resolutions])==null&&resolutions==8,"Bound ownership shortcut chain");
  string unrelatedLauncher=Path.Combine(externalAdapter,"Unrelated.exe");File.WriteAllText(unrelatedLauncher,"inert unrelated executable");
  Check(CraftSetupPaths.ResolveCraftSelection(unrelatedLauncher)==null,"Reject arbitrary executable adjacent to owned config");
  Check(CraftSetupPaths.ResolveInstalledSelection(unrelatedLauncher)==null,"Reject unrelated executable as an ownership hint");
  try {
   var state=Read(externalConfig);state["installId"]=Guid.Empty.ToString();File.WriteAllText(externalConfig,new JavaScriptSerializer().Serialize(state));
   Check(CraftSetupPaths.ResolveCraftSelection(links[0],link=>externalLauncher)==null,"Reject enhanced shortcut with invalid adapter owner");
   Check(CraftSetupPaths.ResolveInstalledSelection(links[0],link=>externalLauncher)==null,"Reject invalid ownership metadata from enhanced shortcut");
  } finally { File.WriteAllText(externalConfig,originalExternalConfig); }
  try {
   var state=Read(externalConfig);((Dictionary<string,object>)state["package"])["wrapper"]="Unrelated.exe";File.WriteAllText(externalConfig,new JavaScriptSerializer().Serialize(state));
   Check(CraftSetupPaths.ResolveCraftSelection(links[0],link=>externalLauncher)==null,"Reject shortcut target that differs from recorded launcher");
   Check(CraftSetupPaths.ResolveInstalledSelection(links[0],link=>externalLauncher)==null,"Reject mismatched launcher as an ownership hint");
  } finally { File.WriteAllText(externalConfig,originalExternalConfig); }
  File.Move(externalHost,externalHost+".saved");
  try {
   Check(CraftSetupPaths.ResolveCraftSelection(links[0],link=>externalLauncher)==null,"Reject owned launcher with missing official host");
   Check(CraftSetupPaths.ReadInstalled(externalAdapter).Valid,"Missing external host retains valid structural ownership metadata");
   Check(CraftSetupPaths.ValidateCache(cache,externalAdapter,externalHost,true)==cache,"Allow structurally owned missing host for detach/recovery cache preflight");
   Reject(()=>CraftSetupPaths.ValidateCache(cache,externalAdapter,externalHost),"missing host in strict installation cache preflight");
   Reject(()=>CraftSetupPaths.ValidateCache(Path.GetDirectoryName(externalHost),externalAdapter,externalHost,true),"cache overlaps missing host directory");
   Reject(()=>CraftSetupPaths.ValidateCache(fixture,externalAdapter,externalHost,true),"cache contains missing host directory");
   Reject(()=>CraftSetupPaths.ValidateCache(cache,externalAdapter,Path.Combine(fixture,"missing.exe"),true),"wrong missing host executable name");
   Reject(()=>CraftSetupPaths.ValidateCache(cache,externalAdapter,externalAdapter,true),"directory instead of exact recovery host path");
  }
  finally { File.Move(externalHost+".saved",externalHost); }
  var installed=CraftSetupPaths.ReadInstalled(adapter);
  Check(installed.Exists&&installed.Valid&&installed.MetadataOnly&&installed.CraftExe==craft&&installed.AdapterRoot==adapter&&installed.Mode=="same-name"&&installed.Status=="installed"&&installed.Version=="test"&&installed.LauncherPath==craft&&installed.TemplatePath==Path.Combine(adapter,"WebVideoCraft.Launcher.exe"),"Read all installed metadata fields");
  Check(installed.Message.Contains("尚未校验文件完整性"),"Label metadata-only result");
  string launcher=installed.LauncherPath,before=File.ReadAllText(launcher);File.AppendAllText(launcher,"changed");
  try{Check(CraftSetupPaths.ReadInstalled(adapter).Valid,"Metadata read must not hash payloads");Reject(()=>CraftManifestVerifier.VerifyLaunch(config,launcher),"tampered launch after metadata-only read");}finally{File.WriteAllText(launcher,before);}
  var mutations=new Action<Dictionary<string,object>>[]{
   s=>s["installId"]=Guid.Empty.ToString(),s=>s["adapterRoot"]=second,s=>s["craftExe"]=wrong,s=>s["kernelExe"]=wrong,s=>s["stateDir"]=host,s=>s["originalExe"]=craft,s=>s["installMode"]="unknown",s=>s["status"]="unknown",
   s=>((Dictionary<string,object>)s["package"])["wrapper"]="../escape.exe",s=>((Dictionary<string,object>)s["package"])["node"]="state/node.exe",s=>((Dictionary<string,object>)s["ownership"])["originalSha256"]="missing",s=>((Dictionary<string,object>)s["package"])["version"]=""
  };
  foreach(var mutate in mutations)try{var state=Read(config);mutate(state);File.WriteAllText(config,new JavaScriptSerializer().Serialize(state));var invalid=CraftSetupPaths.ReadInstalled(adapter);Check(invalid.Exists&&!invalid.Valid,"Reject malformed ownership metadata");}finally{File.WriteAllText(config,originalConfig);}
  try{var state=Read(mirror);state["installId"]=Guid.NewGuid().ToString();File.WriteAllText(mirror,new JavaScriptSerializer().Serialize(state));Check(!CraftSetupPaths.ReadInstalled(adapter).Valid,"Reject foreign host mirror");}finally{File.WriteAllText(mirror,originalMirror);}
  try{File.Delete(mirror);Check(!CraftSetupPaths.ReadInstalled(adapter).Valid,"Reject missing same-name host mirror");}finally{File.WriteAllText(mirror,originalMirror);}
  try{File.WriteAllText(config,new string(' ',1024*1024+1));Check(!CraftSetupPaths.ReadInstalled(adapter).Valid,"Bound metadata file size");}finally{File.WriteAllText(config,originalConfig);}
  string absent=Path.Combine(fixture,"absent");var empty=CraftSetupPaths.ReadInstalled(absent);Check(!empty.Exists&&!empty.Valid&&empty.Status=="not-installed","Absent installation metadata");
  Check(CraftSetupPaths.Validate(absent,craft,new[]{cache})==absent,"Accept new isolated destination");
  Check(CraftSetupPaths.Validate(adapter,craft,new[]{cache})==adapter,"Accept owned matching adapter");
  Reject(()=>CraftSetupPaths.Validate(adapter,secondExe,new[]{cache}),"adapter belonging to other host");
  Reject(()=>CraftSetupPaths.Validate(host,craft,new[]{cache}),"host as destination");
  Reject(()=>CraftSetupPaths.Validate(Path.Combine(host,"child"),craft,new[]{cache}),"destination within host");
  Reject(()=>CraftSetupPaths.Validate(fixture,craft,new[]{cache}),"destination containing host");
  Reject(()=>CraftSetupPaths.Validate(cache,craft,new[]{cache}),"cache as destination");
  Reject(()=>CraftSetupPaths.Validate(Path.Combine(cache,"child"),craft,new[]{cache}),"destination in cache");
  Reject(()=>CraftSetupPaths.Validate(Path.GetPathRoot(fixture),craft,new string[0]),"filesystem root destination");
  string unrelated=Path.Combine(fixture,"unrelated");Directory.CreateDirectory(unrelated);File.WriteAllText(Path.Combine(unrelated,"keep.txt"),"keep");Reject(()=>CraftSetupPaths.Validate(unrelated,craft,new[]{cache}),"nonempty unowned directory");
  string obstructed=Path.Combine(fixture,"file");File.WriteAllText(obstructed,"keep");Reject(()=>CraftSetupPaths.Validate(Path.Combine(obstructed,"child"),craft,new[]{cache}),"file-blocked ancestor");
  Check(CraftSetupPaths.ValidateCache(cache,adapter,craft)==cache,"Accept isolated custom cache");
  Reject(()=>CraftSetupPaths.ValidateCache(host,adapter,craft),"host as cache");
  Reject(()=>CraftSetupPaths.ValidateCache(adapter,adapter,craft),"adapter as cache");
  Reject(()=>CraftSetupPaths.ValidateCache(fixture,adapter,craft),"cache containing host/adapter");
  Reject(()=>CraftSetupPaths.ValidateCache(Path.Combine(adapter,"cache"),adapter,craft),"cache inside adapter");
  Check(File.ReadAllText(Path.Combine(unrelated,"keep.txt"))=="keep","Preflight never mutates existing files");
  Console.WriteLine("PASS "+checks+" production setup path/metadata assertions; Windows COM and registry execution remain separate.");
 }
}

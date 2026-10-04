using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using NativeVideo;

// Exact real release bytes are caller-provided. Synthetic CSS/font payloads are
// copy-preservation controls only; this suite does not render or emulate a SDK.
public static class EngineAdapterDualProfileChecks {
 const string Raw464="e49e15f0db25c95556b6b1eccad89d6e77a32e284cd4e4852fad7dc9a3019902";
 const string Prepared464="d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10";
 const string Raw465="356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6";
 static readonly string[] Versions={"4.6.4","4.6.5"};
 static readonly Dictionary<string,string> Bundles=new Dictionary<string,string>{{"4.6.4","assets/index-R1tKotR6.js"},{"4.6.5","assets/index-CC7KTie-.js"}};
 static readonly Dictionary<string,string> Hashes=new Dictionary<string,string>{{"4.6.4",Raw464},{"4.6.5",Raw465}};
 static readonly Dictionary<string,string> Sources=new Dictionary<string,string>();
 static string home,prepared464;static int checks,sequence;
 static void Assert(bool condition,string message){if(!condition)throw new Exception(message);}
 static void Check(string name,Action body){body();checks++;Console.WriteLine("PASS "+name);}
 static void Reject(Action body,string message){try{body();}catch(IOException){return;}throw new Exception("Accepted "+message);}
 static object Request(string project,string expected,string template=null,bool strict=true){return J.O("project",project,"engineRoot",template,"requireRuntimeParity",strict,"expectedRuntimeVersion",expected,"settings",J.O("engine","webgal"));}
 static string NewDirectory(string name){string path=Path.Combine(home,(sequence++).ToString("D3")+"-"+name);Directory.CreateDirectory(path);return path;}
 static string Shell(string version,string name){
  string root=NewDirectory(name),source=Sources[version];
  foreach(string file in new[]{"index.html","webgal-engine.json",Bundles[version],"assets/index-Dch1g2w9.css"})Files.CopyFile(Path.Combine(source,file),Path.Combine(root,file));
  Files.Atomic(Path.Combine(root,"assets/custom-font.woff2"),"synthetic-copy-control-font");
  Files.Atomic(Path.Combine(root,"assets/custom-theme.css"),"@font-face{font-family:Fixture;src:url(custom-font.woff2)}:root{--fixture:preserve}");
  Files.Atomic(Path.Combine(root,"icons/custom.svg"),"<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  Files.Atomic(Path.Combine(root,"lib/custom-support.js"),"globalThis.fixtureSupport=true;");
  Files.Atomic(Path.Combine(root,"game/scene/not-part-of-runtime.txt"),"Private project scene must not be copied as runtime shell");
  Files.Atomic(Path.Combine(root,"index.html"),File.ReadAllText(Path.Combine(root,"index.html")).Replace("</head>","<link rel=\"stylesheet\" href=\"./assets/custom-theme.css\"></head>"));
  return root;
 }
 static void Descriptor(string root,string version,string webgalVersion,string id="open-webgal.webgal"){J.Write(Path.Combine(root,"webgal-engine.json"),J.O("id",id,"version",version,"webgalVersion",webgalVersion));}
 static Dictionary<string,string> Inventory(string root){return Directory.GetFiles(root,"*",SearchOption.AllDirectories).ToDictionary(file=>file.Substring(root.Length+1),Files.Hash);}
 static void Unchanged(string root,Dictionary<string,string> before){var after=Inventory(root);Assert(before.Count==after.Count&&before.All(item=>after.ContainsKey(item.Key)&&after[item.Key]==item.Value),"Source project was mutated");}
 static string BuildPrepared464(string manifestPath){
  // Independent known-byte fixture reconstruction; the production profile must
  // embed its patch contract and may not read this test manifest at runtime.
  var manifest=J.Read(manifestPath);Assert(J.S(manifest,"version")=="4.6.4","4.6.4 preparation manifest required");
  var bundle=J.Get(manifest,"bundle");Assert(J.S(bundle,"path")==Bundles["4.6.4"],"Wrong preparation entrypoint");
  string value=File.ReadAllText(Path.Combine(Sources["4.6.4"],Bundles["4.6.4"]));
  foreach(var patch in J.A(J.Get(bundle,"patches"))){string from=J.S(patch,"find"),to=J.S(patch,"replace");int at=value.IndexOf(from,StringComparison.Ordinal);Assert(from.Length>0&&at>=0&&value.IndexOf(from,at+from.Length,StringComparison.Ordinal)<0,"Fixture patch anchor is not unique: "+J.S(patch,"id"));value=value.Substring(0,at)+to+value.Substring(at+from.Length);}
  Assert(J.S(bundle,"bodyNewlines")=="crlf","Review fixture newline contract");
  value=Regex.Replace(value,@"\r?\n","\r\n")+J.S(bundle,"append");
  Assert(Files.HashText(value)==Prepared464,"Canonical prepared 4.6.4 fixture bytes changed");return value;
 }
 static void Probes(string patched,string version){
  foreach(string marker in new[]{"globalThis.__probeCommands","globalThis.__wgProbe","globalThis.__nativeObserve?.(e)","globalThis.__nativeBeforeNext?.()===false","globalThis.__nativeScheduleAuto??setTimeout","globalThis.__nativeAdapterInstalled=true"})Assert(patched.Contains(marker),"Missing common probe: "+marker);
  string[] versionMarkers=version=="4.6.4"?new[]{"core:I,store:Pe","parseScene:xo","stageManager:Y","nativeAuto:G$","nativeStopAuto:D_","nativeNext:dp","compileText:Os","textDelay:_P","textAnimation:xP"}:new[]{"core:R,store:Pe","parseScene:wo","stageManager:X","nativeAuto:k5","nativeStopAuto:p0","nativeNext:Lp","compileText:Na","textDelay:KC","textAnimation:JC"};
  foreach(string marker in versionMarkers)Assert(patched.Contains(marker),"Missing "+version+" profile probe: "+marker);
  Assert(!patched.Contains("audioLevelInterval:setInterval(()=>{},0)"),"Zero-interval placeholder survived");
 }
 public static int Main(string[] args){try{Assert(args.Length==4,"Pass 4.6.4 raw root, 4.6.5 raw root, 4.6.4 manifest and owned output directory");Run(args[0],args[1],args[2],args[3]);return 0;}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
 public static void Run(string root464,string root465,string manifest464,string outputRoot){
  checks=0;sequence=0;Sources.Clear();Sources["4.6.4"]=Path.GetFullPath(root464);Sources["4.6.5"]=Path.GetFullPath(root465);home=Path.GetFullPath(outputRoot);Directory.CreateDirectory(home);
  string oldRoot=Files.Root;Files.Root=NewDirectory("isolated-package-no-profile-json");
  try{
   foreach(string version in Versions)Assert(Files.Hash(Path.Combine(Sources[version],Bundles[version]))==Hashes[version],"Actual pinned raw "+version+" fixture required");
   prepared464=BuildPrepared464(Path.GetFullPath(manifest464));
   foreach(string version in Versions){
    string other=version=="4.6.4"?"4.6.5":"4.6.4",project=Shell(version,"project-"+version),template=Shell(version,"template-"+version);
    Check(version+" raw project is selected with exact engine identity",()=>{var a=EngineAdapter.Select(Request(project,version,template));Assert(a.Version==version&&a.RuntimeParity&&a.SourceKind=="project-runtime"&&a.Source==project,"Wrong bound project selection");Assert(J.S(a.Describe(),"sourceHash")==Hashes[version],"Wrong source hash");});
    Check(version+" explicit template works without a bound project",()=>{var a=EngineAdapter.Select(Request(null,version,template));Assert(a.Version==version&&a.RuntimeParity&&a.SourceKind=="terre-template"&&a.Source==template,"Wrong explicit template selection");});
    Check(version+" own raw Patch exposes the versioned common contract",()=>{var a=EngineAdapter.Select(Request(project,version));string patched=a.Patch(File.ReadAllText(Path.Combine(project,Bundles[version])));Probes(patched,version);Files.Atomic(Path.Combine(home,"patched-"+version+".mjs"),patched);});
    Check(version+" rejects another profile in Patch",()=>{var a=EngineAdapter.Select(Request(project,version));Reject(()=>a.Patch(File.ReadAllText(Path.Combine(Sources[other],Bundles[other]))),"cross-profile patch");});
    Check(version+" direct Patch rejects unverified probe-bearing text",()=>{var a=EngineAdapter.Select(Request(project,version));string spoof=File.ReadAllText(Path.Combine(project,Bundles[version]))+"\n/* globalThis.__probeCommands globalThis.__wgProbe={core:R,store:Pe} parseScene:wo stageManager:X */";Reject(()=>a.Patch(spoof),"probe markers bypassing exact source hash");});
    Check(version+" rejects already patched job output",()=>{var a=EngineAdapter.Select(Request(project,version));Reject(()=>a.Patch(File.ReadAllText(Path.Combine(home,"patched-"+version+".mjs"))),"double instrumentation");});
    Check(version+" Prepare preserves custom shell assets without mutating source",()=>{
     var before=Inventory(project);var a=EngineAdapter.Select(Request(project,version));string output=NewDirectory("prepared-"+version);a.Prepare(output);Unchanged(project,before);
     foreach(string file in new[]{"index.html","webgal-engine.json","assets/index-Dch1g2w9.css","assets/custom-theme.css","assets/custom-font.woff2","icons/custom.svg","lib/custom-support.js"})Assert(Files.Hash(Path.Combine(project,file))==Files.Hash(Path.Combine(output,file)),"Lost source bytes: "+file);
     Assert(!File.Exists(Path.Combine(output,"game/scene/not-part-of-runtime.txt")),"Runtime shell copied unrelated scene");Probes(File.ReadAllText(Path.Combine(output,Bundles[version])),version);
     var identity=J.Read(Path.Combine(output,"export-engine.json"));Assert(J.S(identity,"version")==version&&J.S(identity,"sourceKind")=="project-runtime"&&J.B(identity,"runtimeParity")&&J.S(identity,"sourceHash")==Hashes[version],"Snapshot identity changed");
    });
    foreach(string field in new[]{"version","webgalVersion"})Check(version+" rejects mismatched "+field+" despite valid hash and template",()=>{string root=Shell(version,"bad-"+field);Descriptor(root,field=="version"?other:version,field=="webgalVersion"?other:version);Reject(()=>EngineAdapter.Select(Request(root,version,template)),"incompatible bound project falling through to template");});
    Check(version+" rejects a different expectedRuntimeVersion",()=>Reject(()=>EngineAdapter.Select(Request(project,other,template)),"expected-version mismatch"));
    Check(version+" rejects a missing descriptor",()=>{string root=Shell(version,"missing-descriptor");File.Delete(Path.Combine(root,"webgal-engine.json"));Reject(()=>EngineAdapter.Select(Request(root,version,template)),"strict project without descriptor");});
    Check(version+" rejects incomplete descriptor metadata",()=>{string root=Shell(version,"missing-version");Descriptor(root,version,null);Reject(()=>EngineAdapter.Select(Request(root,version,template)),"strict project with missing webgalVersion");});
    Check(version+" rejects a different descriptor engine ID",()=>{string root=Shell(version,"wrong-id");Descriptor(root,version,version,"other.engine");Reject(()=>EngineAdapter.Select(Request(root,version,template)),"strict project with wrong ID");});
    Check(version+" rejects tampered source even when probe text is present",()=>{string root=Shell(version,"modified");File.AppendAllText(Path.Combine(root,Bundles[version]),"\n/* globalThis.__probeCommands globalThis.__wgProbe={core:R,store:Pe} parseScene:wo stageManager:X */",Files.Utf8);Reject(()=>EngineAdapter.Select(Request(root,version,template)),"tampered bound project");});
    Check(version+" rejects BOM byte tampering",()=>{string root=Shell(version,"bom");string file=Path.Combine(root,Bundles[version]);File.WriteAllText(file,File.ReadAllText(file),new System.Text.UTF8Encoding(true));Reject(()=>EngineAdapter.Select(Request(root,version,template)),"BOM hash mismatch");});
    Check(version+" rejects descriptor and bundle claiming different known profiles",()=>{string root=Shell(version,"wrong-known-profile");Descriptor(root,other,other);Reject(()=>EngineAdapter.Select(Request(root,other,template)),"valid hash bound to wrong descriptor profile");});
    Check(version+" rejects source mutation after selection",()=>{string root=Shell(version,"changed-after-selection");var a=EngineAdapter.Select(Request(root,version));File.AppendAllText(Path.Combine(root,Bundles[version]),"\n// changed",Files.Utf8);Reject(()=>a.Prepare(NewDirectory("stale-output")),"source mutation during Prepare");});
    Check(version+" rejects descriptor version mutation after selection",()=>{string root=Shell(version,"descriptor-changed");var a=EngineAdapter.Select(Request(root,version));Descriptor(root,other,other);Reject(()=>a.Prepare(NewDirectory("descriptor-changed-output")),"descriptor mutation during Prepare");});
    Check(version+" rejects descriptor deletion after strict selection",()=>{string root=Shell(version,"descriptor-deleted");var a=EngineAdapter.Select(Request(root,version));File.Delete(Path.Combine(root,"webgal-engine.json"));Reject(()=>a.Prepare(NewDirectory("descriptor-deleted-output")),"strict descriptor disappearing during Prepare");});
    Check(version+" missing bound runtime cannot fall through to template",()=>Reject(()=>EngineAdapter.Select(Request(NewDirectory("empty-project"),version,template)),"empty bound project fallback"));
   }
   foreach(string version in Versions){
    Check(version+" strict MyGO selection rejects before project or machine derivative discovery",()=>{string root=Shell(version,"strict-mygo"),machine=NewDirectory("machine-mygo");Descriptor(machine,"3.2.1","4.6.4","webgal-mygo.mygo");var request=Request(root,version);J.D(request)["settings"]=J.O("engine","mygo");J.D(request)["mygoRoot"]=machine;try{EngineAdapter.Select(request);throw new Exception("MyGO selection bypassed strict binding");}catch(IOException error){Assert(error.Message.Contains("禁止 MyGO"),"Wrong strict rejection; derivative discovery must not be attempted");}});
    Check(version+" strict MyGO project descriptor cannot change the bound engine",()=>{string root=Shell(version,"strict-project-mygo");Descriptor(root,"3.2.1","4.6.4","webgal-mygo.mygo");var request=Request(root,version);J.D(request)["settings"]=J.O("engine","mygo");try{EngineAdapter.Select(request);throw new Exception("Project MyGO bypassed strict binding");}catch(IOException error){Assert(error.Message.Contains("禁止 MyGO"),"Project derivative inspection occurred before strict engine validation");}});
    Check(version+" strict unknown engine selection is rejected globally",()=>{var request=Request(Shell(version,"strict-unknown"),version);J.D(request)["settings"]=J.O("engine","unknown");Reject(()=>EngineAdapter.Select(request),"unknown strict engine");});
    Check(version+" strict wrong bound engine ID is rejected",()=>{var request=Request(Shell(version,"strict-id"),version);J.D(request)["expectedRuntimeId"]="webgal-mygo.mygo";Reject(()=>EngineAdapter.Select(request),"wrong bound engine identity");});
    Check(version+" strict missing bound version is rejected",()=>Reject(()=>EngineAdapter.Select(Request(Shell(version,"strict-no-version"),null)),"missing strict version"));
   }
   foreach(string version in Versions){
    var bound=Request("bound-project",version);
    var valid=J.O("id","webgal","version",version,"runtimeParity",true,"sourceKind","project-runtime","sourceHash",Hashes[version]);
    Check(version+" accepts exact cached runtime contract",()=>EngineAdapter.ValidateRuntimeContract(bound,valid));
    foreach(string fault in new[]{"id","version","runtimeParity","sourceKind","sourceHash","missing"})Check(version+" rejects cached runtime contract "+fault,()=>{
     var metadata=J.O("id","webgal","version",version,"runtimeParity",true,"sourceKind","project-runtime","sourceHash",Hashes[version]);
     if(fault=="missing")metadata=null;
     else J.D(metadata)[fault]=fault=="runtimeParity"?(object)false:fault=="id"?"mygo":fault=="version"?"3.2.1":fault=="sourceKind"?"bundled-runtime":new string('0',64);
     Reject(()=>EngineAdapter.ValidateRuntimeContract(bound,metadata),"cached engine metadata "+fault);
    });
    Check(version+" accepts exact unbound template contract",()=>EngineAdapter.ValidateRuntimeContract(Request(null,version),J.O("id","webgal","version",version,"runtimeParity",true,"sourceKind","terre-template","sourceHash",Hashes[version])));
    Check(version+" rejects template contract for bound project",()=>Reject(()=>EngineAdapter.ValidateRuntimeContract(bound,J.O("id","webgal","version",version,"runtimeParity",true,"sourceKind","terre-template","sourceHash",Hashes[version])),"bound project cannot reuse template contract"));
    Check(version+" rejects stale MyGO preference even with canonical cache",()=>{var request=Request("bound-project",version);J.D(request)["settings"]=J.O("engine","mygo");Reject(()=>EngineAdapter.ValidateRuntimeContract(request,valid),"cached MyGO selected request");});
   }
   // MyGO contract acceptance is independent of a retained release fixture;
   // real bundle selection/Prepare coverage is an explicit optional suite below.
   var mygoRequest=J.O("project","bound-mygo","requireRuntimeParity",true,"expectedRuntimeId","webgal-mygo.mygo","expectedRuntimeVersion","3.2.1","expectedWebgalVersion","4.6.4","settings",J.O("engine","mygo"));
   var mygoMetadata=J.O("id","mygo","version","3.2.1","sourceHash",EngineAdapter.MygoHash,"sourceKind","mygo-project-runtime","runtimeParity",true);
   Check("strict MyGO accepts exact bound identity contract",()=>EngineAdapter.ValidateRuntimeContract(mygoRequest,mygoMetadata));
   foreach(string fault in new[]{"expectedRuntimeId","expectedRuntimeVersion","expectedWebgalVersion","settings"})Check("strict MyGO rejects request "+fault,()=>{var request=new Dictionary<string,object>(J.D(mygoRequest));request[fault]=fault=="settings"?(object)J.O("engine","webgal"):fault=="expectedRuntimeId"?"open-webgal.webgal":fault=="expectedRuntimeVersion"?"4.6.4":"4.6.5";Reject(()=>EngineAdapter.ValidateRuntimeContract(request,mygoMetadata),"incorrect MyGO request "+fault);});
   Check("strict MyGO requires explicit base version",()=>{var request=new Dictionary<string,object>(J.D(mygoRequest));request.Remove("expectedWebgalVersion");Reject(()=>EngineAdapter.ValidateRuntimeRequest(request),"missing MyGO base version");});
   foreach(string fault in new[]{"id","version","sourceHash","sourceKind","runtimeParity"})Check("strict MyGO rejects cache "+fault,()=>{var metadata=new Dictionary<string,object>(J.D(mygoMetadata));metadata[fault]=fault=="runtimeParity"?(object)false:fault=="id"?"webgal":fault=="version"?"4.6.4":fault=="sourceHash"?Raw464:"mygo-derivative-runtime";Reject(()=>EngineAdapter.ValidateRuntimeContract(mygoRequest,metadata),"incorrect MyGO cache "+fault);});
   Check("strict MyGO cannot use template or machine fallback without a bound project",()=>{var request=new Dictionary<string,object>(J.D(mygoRequest));request["project"]=null;Reject(()=>EngineAdapter.ValidateRuntimeContract(request,mygoMetadata),"unbound MyGO cache");Reject(()=>EngineAdapter.Select(request),"unbound MyGO selection");});
   foreach(string fault in new[]{"missing","id","version","webgalVersion","sourceHash"})Check("strict MyGO rejects invalid bound runtime without fallback "+fault,()=>{string root=Shell("4.6.4","mygo-invalid-"+fault);Descriptor(root,fault=="version"?"3.2.2":"3.2.1",fault=="webgalVersion"?"4.6.5":"4.6.4",fault=="id"?"open-webgal.webgal":"webgal-mygo.mygo");if(fault=="missing")File.Delete(Path.Combine(root,"webgal-engine.json"));var request=new Dictionary<string,object>(J.D(mygoRequest));request["project"]=root;request["mygoRoot"]=Sources["4.6.4"];request["engineRoot"]=Sources["4.6.5"];try{EngineAdapter.Select(request);throw new Exception("Invalid MyGO runtime was accepted");}catch(IOException error){Assert(error.Message.Contains("未改用机器"),"MyGO attempted a fallback");}});
   Check("strict MyGO startup retains verified preview and project language",()=>{
    var ctor=typeof(EngineAdapter).GetConstructors(System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Single();
    var adapter=(EngineAdapter)ctor.Invoke(new object[]{"mygo","3.2.1","unused","unused.js","mygo-project-runtime",false,true,null,EngineAdapter.MygoHash,true});
    string config=Path.Combine(NewDirectory("mygo-startup"),"config.txt");Files.Atomic(config,"Default_Language:en;\n");
    var startup=RuntimeStartup.Resolve(mygoRequest,config,adapter);Assert(J.N(startup,"language")==1&&J.S(startup,"source")=="project-default","MyGO project locale lost");RuntimeStartup.ValidateContract(mygoRequest,startup);
    var request=new Dictionary<string,object>(J.D(mygoRequest));request["runtimeStartup"]=J.O("language",2,"source","preview");startup=RuntimeStartup.Resolve(request,config,adapter);Assert(J.N(startup,"language")==2&&J.S(startup,"source")=="preview","MyGO preview locale lost");RuntimeStartup.ValidateContract(request,startup);
    Reject(()=>RuntimeStartup.ValidateContract(request,J.O("language",1,"code","en","source","project-default")),"MyGO cached locale drift");
    request.Remove("runtimeStartup");Files.Atomic(config,"Game_name:No locale;\n");Reject(()=>RuntimeStartup.Resolve(request,config,adapter),"MyGO missing locale");
    request["requireRuntimeParity"]=false;Assert(RuntimeStartup.Resolve(request,config,adapter)==null,"Legacy nonstrict MyGO startup changed");
   });
   Check("legacy nonstrict metadata validation remains a no-op",()=>EngineAdapter.ValidateRuntimeContract(J.O("requireRuntimeParity",false),null));
   foreach(string version in Versions){
    string project=Shell(version,"startup"),config=Path.Combine(project,"game/config.txt");var request=Request(project,version);var adapter=EngineAdapter.Select(request);
    string[] codes={"zh_CN","en","ja","fr","de","zh_TW","pt_BR","ko"};
    for(int index=0;index<codes.Length;index++){int language=index;Check(version+" project startup language "+codes[index],()=>{Files.Atomic(config,"Game_name:Fixture;\nDefault_Language:"+codes[language]+";\n");var startup=RuntimeStartup.Resolve(request,config,adapter);Assert(J.N(startup,"language")==language&&J.S(startup,"source")=="project-default","Incorrect pinned language mapping");RuntimeStartup.ValidateResolved(startup);Assert(RuntimeStartup.Script(startup).Contains("localStorage.setItem('lang',"),"Language seed missing");});}
    Check(version+" project language accepts optional semicolon",()=>{Files.Atomic(config,"Default_Language:en\n");Assert(J.N(RuntimeStartup.Resolve(request,config,adapter),"language")==1,"Semicolon-free official config syntax rejected");});
    Check(version+" missing project config never invents a default",()=>{File.Delete(config);Reject(()=>RuntimeStartup.Resolve(request,config,adapter),"missing actual project config");});
    Check(version+" captured preview language overrides project default including zero",()=>{Files.Atomic(config,"Default_Language:en;\n");J.D(request)["runtimeStartup"]=J.O("language",0,"source","preview");var startup=RuntimeStartup.Resolve(request,config,adapter);Assert(J.N(startup,"language")==0&&J.S(startup,"source")=="preview","Preview locale was replaced by default");J.D(request).Remove("runtimeStartup");});
    foreach(string body in new[]{"Game_name:No default;","Default_Language:unknown;","Default_Language:en;\nDefault_Language:ja;"})Check(version+" unknown or ambiguous startup language fails clearly",()=>{Files.Atomic(config,body);Reject(()=>RuntimeStartup.Resolve(request,config,adapter),"unknown startup language");});
    foreach(object bad in new object[]{-1,8,1.5,true,"en"})Check(version+" invalid captured language rejects "+bad,()=>{J.D(request)["runtimeStartup"]=J.O("language",bad,"source","preview");Reject(()=>RuntimeStartup.Resolve(request,config,adapter),"invalid preview language");J.D(request).Remove("runtimeStartup");});
    Check(version+" planned startup cannot be missing or claim another code",()=>{Reject(()=>RuntimeStartup.ValidateResolved(null),"missing cached startup");Reject(()=>RuntimeStartup.ValidateResolved(J.O("language",1,"code","ja","source","preview")),"inconsistent cached language");});
   }
   Check("cached startup matches immutable queued preview",()=>{var request=J.O("runtimeStartup",J.O("language",2,"source","preview"));RuntimeStartup.ValidateContract(request,J.O("language",2,"code","ja","source","preview"));Reject(()=>RuntimeStartup.ValidateContract(request,J.O("language",1,"code","en","source","preview")),"stale queued locale");Reject(()=>RuntimeStartup.ValidateContract(request,J.O("language",2,"code","ja","source","project-default")),"lost preview precedence");});
   Check("cached startup cannot invent absent preview evidence",()=>{RuntimeStartup.ValidateContract(J.O(),J.O("language",1,"code","en","source","project-default"));Reject(()=>RuntimeStartup.ValidateContract(J.O(),J.O("language",1,"code","en","source","preview")),"orphan cached preview locale");});
   Check("strict unrecognized expected version is rejected",()=>{string root=Shell("4.6.5","unsupported-expected");Reject(()=>EngineAdapter.Select(Request(root,"4.6.6")),"unsupported requested profile");});
   Check("canonical prepared 4.6.4 remains an exact accepted identity",()=>{string root=Shell("4.6.4","canonical-prepared");Files.Atomic(Path.Combine(root,Bundles["4.6.4"]),prepared464);var a=EngineAdapter.Select(Request(root,"4.6.4"));Assert(a.Version=="4.6.4"&&J.S(a.Describe(),"sourceHash")==Prepared464,"Prepared source identity was lost");string patched=a.Patch(prepared464);Probes(patched,"4.6.4");Files.Atomic(Path.Combine(home,"patched-4.6.4-canonical.mjs"),patched);string output=NewDirectory("prepared-canonical");a.Prepare(output);Assert(Files.Hash(Path.Combine(root,Bundles["4.6.4"]))==Prepared464,"Prepared source mutated");Assert(J.S(J.Read(Path.Combine(output,"export-engine.json")),"sourceHash")==Prepared464,"Prepared identity changed during snapshot");Probes(File.ReadAllText(Path.Combine(output,Bundles["4.6.4"])),"4.6.4");});
   Check("4.6.5 Patch rejects canonical prepared 4.6.4",()=>{string root=Shell("4.6.5","cross-prepared");var a=EngineAdapter.Select(Request(root,"4.6.5"));Reject(()=>a.Patch(prepared464),"prepared cross-profile patch");});
   Check("selection pins raw 4.6.4 rather than accepting a later prepared variant",()=>{string root=Shell("4.6.4","raw-to-prepared");var a=EngineAdapter.Select(Request(root,"4.6.4"));Files.Atomic(Path.Combine(root,Bundles["4.6.4"]),prepared464);Reject(()=>a.Prepare(NewDirectory("raw-to-prepared-output")),"supported source variant swapped after selection");});
   Check("selection pins prepared 4.6.4 rather than accepting a later raw variant",()=>{string root=Shell("4.6.4","prepared-to-raw");Files.Atomic(Path.Combine(root,Bundles["4.6.4"]),prepared464);var a=EngineAdapter.Select(Request(root,"4.6.4"));Files.CopyFile(Path.Combine(Sources["4.6.4"],Bundles["4.6.4"]),Path.Combine(root,Bundles["4.6.4"]));Reject(()=>a.Prepare(NewDirectory("prepared-to-raw-output")),"prepared source variant swapped after selection");});
   Check("generic source selection retains the explicit legacy fallback path",()=>{var a=EngineAdapter.Select(Request(NewDirectory("generic-empty"),null,null,false));Assert(a.SourceKind=="bundled-runtime"&&!a.RuntimeParity,"Generic fallback behavior unexpectedly changed");});
   foreach(string version in Versions){
    string other=version=="4.6.4"?"4.6.5":"4.6.4";
    Check(version+" nonstrict official project takes precedence over opposite template",()=>{string root=Shell(version,"legacy-project");var a=EngineAdapter.Select(Request(root,null,Sources[other],false));Assert(a.Version==version&&a.SourceKind=="project-runtime","Legacy project selection lost its actual profile");});
    Check(version+" nonstrict descriptor-less official project retains byte identity",()=>{string root=Shell(version,"legacy-no-descriptor");File.Delete(Path.Combine(root,"webgal-engine.json"));var a=EngineAdapter.Select(Request(root,null,Sources[other],false));Assert(a.Version==version&&a.SourceKind=="project-runtime","Raw official byte detection failed");});
    Check(version+" nonstrict failed project allows same-version template",()=>{string root=Shell(version,"legacy-same-template");File.AppendAllText(Path.Combine(root,Bundles[version]),"\n// altered",Files.Utf8);var a=EngineAdapter.Select(Request(root,null,Sources[version],false));Assert(a.Version==version&&a.SourceKind=="terre-template","Same-version legacy template fallback was removed");});
    Check(version+" nonstrict failed project rejects opposite-version template",()=>{string root=Shell(version,"legacy-cross-template");File.Delete(Path.Combine(root,Bundles[version]));Reject(()=>EngineAdapter.Select(Request(root,null,Sources[other],false)),"project fallback crossing declared version");});
    Check(version+" nonstrict descriptor/hash conflict cannot fall back",()=>{string root=Shell(version,"legacy-conflict");Descriptor(root,other,other);Reject(()=>EngineAdapter.Select(Request(root,null,Sources[other],false)),"descriptor/hash conflict masked by template");});
    Check(version+" source identity report rejects post-selection mutation",()=>{string root=Shell(version,"describe-mutated");var a=EngineAdapter.Select(Request(root,version));File.AppendAllText(Path.Combine(root,Bundles[version]),"\n// altered",Files.Utf8);Reject(()=>a.Describe(),"changed source mislabeled as selected identity");});
    Check(version+" explicit nonstrict binding rejects opposite version",()=>Reject(()=>EngineAdapter.Select(Request(NewDirectory("legacy-expected"),version,Sources[other],false)),"explicit version ignored for nonstrict template"));
   }
   Check("nonstrict 4.6.5 declaration never falls back to bundled 4.6.4",()=>{string root=Shell("4.6.5","legacy-declared-465");File.Delete(Path.Combine(root,Bundles["4.6.5"]));Reject(()=>EngineAdapter.Select(Request(root,null,null,false)),"declared 4.6.5 fell back to 4.6.4");});
   Check("nonstrict expected 4.6.5 never falls back to bundled 4.6.4",()=>Reject(()=>EngineAdapter.Select(Request(NewDirectory("legacy-expected-465"),"4.6.5",null,false)),"expected 4.6.5 fell back to 4.6.4"));
   Check("nonstrict failed 4.6.5 template never falls back to bundled 4.6.4",()=>{string root=Shell("4.6.5","legacy-template-465");File.Delete(Path.Combine(root,Bundles["4.6.5"]));Reject(()=>EngineAdapter.Select(Request(NewDirectory("legacy-template-game"),null,root,false)),"declared 4.6.5 template fell back to 4.6.4");});
   Check("nonstrict 4.6.4 failure retains visible same-version bundled fallback",()=>{string root=Shell("4.6.4","legacy-fallback-464");File.Delete(Path.Combine(root,Bundles["4.6.4"]));var a=EngineAdapter.Select(Request(root,null,null,false));Assert(a.Version=="4.6.4"&&a.SourceKind=="bundled-runtime"&&!string.IsNullOrWhiteSpace(a.FallbackReason),"Known 4.6.4 fallback lost its reason");});
   Check("unknown declared official version cannot use known template",()=>{string root=NewDirectory("legacy-unsupported");Descriptor(root,"4.6.6","4.6.6");Reject(()=>EngineAdapter.Select(Request(root,null,Sources["4.6.4"],false)),"unsupported declared project silently downgraded");});
   Console.WriteLine("Exact dual-profile adapter checks passed: "+checks+". Native browser/rendering validation remains separate.");
  }finally{Files.Root=oldRoot;}
 }
}

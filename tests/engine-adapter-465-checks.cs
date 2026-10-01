using System;
using System.IO;
using System.Linq;
using NativeVideo;

public static class EngineAdapter465Checks {
 const string Bundle="assets/index-CC7KTie-.js";
 const string OfficialHash="356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6";
 static int checks;
 static string home,source;
 static void Assert(bool condition,string message){if(!condition)throw new Exception(message);}
 static void Check(string name,Action body){body();checks++;Console.WriteLine("PASS "+name);}
 static object Request(string project,string template=null){return J.O("project",project,"engineRoot",template,"settings",J.O("engine","webgal"));}
 static string Shell(string name){
  string root=Path.Combine(home,name);Directory.CreateDirectory(root);
  foreach(string file in new[]{"index.html","webgal-engine.json",Bundle,"assets/index-Dch1g2w9.css"})Files.CopyFile(Path.Combine(source,file),Path.Combine(root,file));
  Files.Atomic(Path.Combine(root,"assets/custom-font.woff2"),"fixture-font-bytes-not-for-rendering");
  Files.Atomic(Path.Combine(root,"assets/custom-theme.css"),"@font-face{font-family:Fixture;src:url(custom-font.woff2)}:root{--fixture:preserve}");
  Files.Atomic(Path.Combine(root,"index.html"),File.ReadAllText(Path.Combine(root,"index.html")).Replace("</head>","<link rel=\"stylesheet\" href=\"./assets/custom-theme.css\"></head>"));
  return root;
 }
 static void Descriptor(string root,string version,string webgalVersion){J.Write(Path.Combine(root,"webgal-engine.json"),J.O("id","open-webgal.webgal","version",version,"webgalVersion",webgalVersion));}
 static void Fallback(string root){var selected=EngineAdapter.Select(Request(root));Assert(selected.SourceKind=="bundled-runtime"&&!selected.RuntimeParity,"Rejected source silently accepted");Assert(!string.IsNullOrWhiteSpace(selected.FallbackReason),"Missing fallback diagnostic");Assert(selected.Version=="4.6.5","Fallback version changed");}
 public static int Main(string[] args){try{Run(args[0]);return 0;}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
 public static void Run(string packageRoot){
  checks=0;Files.Root=Path.GetFullPath(packageRoot);source=Path.Combine(Files.Root,"runtime/web");
  Assert(Files.Hash(Path.Combine(source,Bundle))==OfficialHash,"Tests require actual pinned official 4.6.5 raw bytes");
  home=Path.Combine(Path.GetTempPath(),"webvideo-adapter-465-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(home);
  try{
   string project=Shell("project"),template=Shell("template"),empty=Path.Combine(home,"empty");Directory.CreateDirectory(empty);
   Check("official project runtime is selected with real source identity",()=>{var a=EngineAdapter.Select(Request(project,template));Assert(a.SourceKind=="project-runtime"&&a.RuntimeParity&&a.Version=="4.6.5","Project runtime not selected");Assert(J.S(a.Describe(),"sourceHash")==OfficialHash&&a.Source==project,"Project source identity differs");});
   Check("official Terre template is selected when project shell is absent",()=>{var a=EngineAdapter.Select(Request(empty,template));Assert(a.SourceKind=="terre-template"&&a.RuntimeParity&&a.Source==template,"Template runtime not selected");});
   Check("Prepare preserves source CSS/assets and does not mutate source",()=>{var a=EngineAdapter.Select(Request(project));string output=Path.Combine(home,"prepared");a.Prepare(output);Assert(Files.Hash(Path.Combine(project,Bundle))==OfficialHash,"Source bundle was modified");foreach(string path in new[]{"index.html","assets/index-Dch1g2w9.css","assets/custom-theme.css","assets/custom-font.woff2"})Assert(Files.Hash(Path.Combine(project,path))==Files.Hash(Path.Combine(output,path)),"Lost source bytes: "+path);string patched=File.ReadAllText(Path.Combine(output,Bundle));Assert(patched.Contains("__nativeAdapterInstalled")&&patched.Contains("globalThis.__probeCommands")&&patched.Contains("parseScene:wo")&&patched.Contains("stageManager:X"),"Missing actual adapter probes");Assert(J.S(J.Read(Path.Combine(output,"export-engine.json")),"sourceKind")=="project-runtime","Snapshot source was misreported");});
   foreach(string field in new[]{"version","webgalVersion"})Check("mismatched "+field+" is rejected even with correct bundle",()=>{string root=Shell("mismatch-"+field);Descriptor(root,field=="version"?"4.6.4":"4.6.5",field=="webgalVersion"?"4.6.4":"4.6.5");Fallback(root);});
   Check("missing descriptor version is rejected",()=>{string root=Shell("missing-version");Descriptor(root,"4.6.5",null);Fallback(root);});
   Check("invalid project falls through to verified template",()=>{string root=Shell("bad-project");Descriptor(root,"4.6.4","4.6.4");var a=EngineAdapter.Select(Request(root,template));Assert(a.SourceKind=="terre-template"&&a.Source==template,"Template was not used after rejecting project");});
   Check("modified raw bundle is rejected",()=>{string root=Shell("modified");File.AppendAllText(Path.Combine(root,Bundle),"\n// arbitrary change",Files.Utf8);Fallback(root);});
   Check("BOM-only raw byte changes cannot bypass official digest",()=>{string root=Shell("bom-modified");string file=Path.Combine(root,Bundle);File.WriteAllText(file,File.ReadAllText(file),new System.Text.UTF8Encoding(true));Fallback(root);});
   Check("probe strings cannot bypass official bundle digest",()=>{string root=Shell("probe-spoof");File.AppendAllText(Path.Combine(root,Bundle),"\n/* globalThis.__probeCommands globalThis.__wgProbe={core:R,store:Pe} parseScene:wo stageManager:X */",Files.Utf8);Fallback(root);});
   Check("direct Patch cannot accept unverified probe-bearing text",()=>{var a=EngineAdapter.Select(Request(project));string spoof=File.ReadAllText(Path.Combine(source,Bundle))+"\n/* globalThis.__probeCommands globalThis.__wgProbe={core:R,store:Pe} parseScene:wo stageManager:X */";bool rejected=false;try{a.Patch(spoof);}catch(IOException){rejected=true;}Assert(rejected,"Probe markers bypassed instrumentation digest");});
   Check("source changed after selection fails Prepare before accepting probe strings",()=>{string root=Shell("changed-after-selection");var a=EngineAdapter.Select(Request(root));File.AppendAllText(Path.Combine(root,Bundle),"\n// changed",Files.Utf8);bool rejected=false;try{a.Prepare(Path.Combine(home,"stale-output"));}catch(IOException){rejected=true;}Assert(rejected,"Mutable source bypassed integrity check");});
   Check("prepared job output cannot be adapted twice",()=>{string output=Path.Combine(home,"prepared");var a=EngineAdapter.Select(Request(project));bool rejected=false;try{a.Patch(File.ReadAllText(Path.Combine(output,Bundle)));}catch(IOException){rejected=true;}Assert(rejected,"Already adapted bundle accepted");});
   Check("original bundle without descriptor remains identifiable by exact hash",()=>{string root=Shell("no-descriptor");File.Delete(Path.Combine(root,"webgal-engine.json"));Assert(EngineAdapter.Select(Request(root)).SourceKind=="project-runtime","Exact raw source without optional metadata rejected");});
   Console.WriteLine("WebGAL 4.6.5 adapter checks passed: "+checks);
  }finally{Directory.Delete(home,true);}
 }
}

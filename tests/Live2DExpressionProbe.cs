using System;using System.IO;using System.Linq;using NativeVideo;
// Read exact supported engines, prepare only owned minimal shells. No WebView,
// GUI, game scripts, models, network, or installed files are changed.
public static class Live2DExpressionProbe {
 static void Assert(bool ok,string message){if(!ok)throw new Exception(message);}
 static void Reject(Action action){try{action();}catch(IOException){return;}throw new Exception("Unverified plugin was accepted");}
 public static int Main(string[] args){try{
  string source=Files.Full(args[0]),output=Files.Full(args[1]);
  Assert(!Directory.Exists(output),"Use a fresh owned output directory");Directory.CreateDirectory(output);
  var metadata=J.Read(Path.Combine(source,"webgal-engine.json"));bool mygo=J.S(metadata,"id")=="webgal-mygo.mygo";string version=J.S(metadata,"version");
  if(EngineAdapter.IsLoveLiveProject(source)){VerifyLoveLive(source,output);return 0;}
  Assert(mygo?version=="3.2.1":version=="4.6.4","Only WebGAL 4.6.4 and MyGO 3.2.1 fixtures are supported");
  var request=J.O("project",source,"engineRoot",source,"settings",J.O("engine",mygo?"mygo":"webgal"));
  var original=EngineAdapter.Select(request);
  Assert(Files.Full(original.Source)==source,"Fixture must be selected without fallback");
  string plugin="assets/"+(mygo?"index.es-Zih9sQ-u.js":"index.es-erQsk_Nn.js");
  string mainHash=Files.Hash(Path.Combine(source,original.Bundle)),pluginHash=Files.Hash(Path.Combine(source,plugin));
  string shell=Path.Combine(output,"source");
  foreach(string file in new[]{"index.html","webgal-engine.json",original.Bundle,plugin})Files.CopyFile(Path.Combine(source,file),Path.Combine(shell,file));
  Files.Atomic(Path.Combine(shell,plugin)+".gz","stale fixture compression");Files.Atomic(Path.Combine(shell,plugin)+".br","stale fixture compression");
  var copied=J.D(request);copied["project"]=shell;copied["engineRoot"]=shell;var adapter=EngineAdapter.Select(copied);
  string prepared=Path.Combine(output,"prepared");adapter.Prepare(prepared);
  if(mygo)CheckSharedMainPatches(prepared,adapter);
  Assert(Files.Hash(Path.Combine(shell,plugin))==pluginHash,"Input fixture changed");
  Assert(!File.Exists(Path.Combine(prepared,plugin)+".gz")&&!File.Exists(Path.Combine(prepared,plugin)+".br"),"Stale compression retained");
  Assert(File.Exists(Path.Combine(shell,plugin)+".gz"),"Source compression changed");
  Files.Atomic(Path.Combine(output,"native.mjs"),File.ReadAllText(Path.Combine(shell,plugin)));
  Files.Atomic(Path.Combine(output,"patched.mjs"),File.ReadAllText(Path.Combine(prepared,plugin)));
  J.Write(Path.Combine(output,"result.json"),J.O("engine",adapter.Describe(),"plugin",plugin,"sourceHash",pluginHash,"patchedHash",Files.Hash(Path.Combine(prepared,plugin))));
  Action verifyFallback=()=>{
   if(!mygo)return;
   Assert(!EngineAdapter.SupportedMygo(shell),"Unknown plugin appeared as a supported machine engine");
   var fallback=EngineAdapter.Select(J.O("project",shell,"mygoRoot",source,"settings",J.O("engine","mygo")));
   Assert(Files.Full(fallback.Source)==source&&fallback.SourceKind=="mygo-derivative-runtime"&&!string.IsNullOrEmpty(fallback.FallbackReason),"Unknown MyGO plugin lost its visible canonical fallback");
  };
  string originalPlugin=File.ReadAllText(Path.Combine(shell,plugin));
  if(mygo){
   // A user tuning an unrelated default must keep both installed-baseline and
   // per-project selection, and the setting must survive job-local patching.
   string tuned=originalPlugin.Replace("motionFadingDuration=500","motionFadingDuration=1500");
   if(!originalPlugin.Contains("motionFadingDuration=1500"))Assert(tuned!=originalPlugin,"Fixture has no expected motion fading default");
   Files.Atomic(Path.Combine(shell,plugin),tuned+"\n// compatible customization");
   Assert(EngineAdapter.SupportedMygo(shell),"Compatible customized plugin lost baseline discovery");
   var baseline=EngineAdapter.Select(J.O("project",Path.Combine(output,"legacy-project"),"mygoRoot",shell,"settings",J.O("engine","mygo")));
   string tunedOutput=Path.Combine(output,"custom-baseline");baseline.Prepare(tunedOutput);
   Assert(File.ReadAllText(Path.Combine(tunedOutput,plugin)).Contains("motionFadingDuration=1500"),"Preparation overwrote customized fading duration");
   File.AppendAllText(Path.Combine(shell,adapter.Bundle),"\n// compatible legacy derivative",Files.Utf8);
   var legacy=EngineAdapter.Select(copied);
   Assert(Files.Full(legacy.Source)==Files.Full(shell)&&legacy.SourceKind=="mygo-project-runtime","Compatible legacy main lost project selection");
   legacy.Prepare(Path.Combine(output,"legacy-known-plugin"));
   Assert(File.ReadAllText(Path.Combine(output,"legacy-known-plugin",plugin)).Contains("motionFadingDuration=1500"),"Project preparation overwrote customization");
   Files.CopyFile(Path.Combine(source,original.Bundle),Path.Combine(shell,adapter.Bundle));
   string anchor="loadExpression(t){return I(this,null,function*(){if(!this.definitions[t])";
   string[] invalid={
    originalPlugin.Replace(anchor,"loadExpression(t){return incompatible("),
    originalPlugin+anchor,
    originalPlugin.Replace("Ot as ExpressionManager","Wrong as ExpressionManager"),
    originalPlugin+";Ot as ExpressionManager",
    originalPlugin+";const __webvideoSetExpression=Ot.prototype.setExpression;"
   };
   for(int i=0;i<invalid.Length;i++){
    Files.Atomic(Path.Combine(shell,plugin),invalid[i]);verifyFallback();
    Reject(()=>adapter.Prepare(Path.Combine(output,"incompatible-output-"+i)));
    Assert(File.ReadAllText(Path.Combine(shell,plugin))==invalid[i],"Rejected source plugin changed");
   }
  }else{
   Files.Atomic(Path.Combine(shell,plugin),originalPlugin+"\n// tampered fixture");
   Reject(()=>adapter.Prepare(Path.Combine(output,"tampered-output")));
  }
  File.Delete(Path.Combine(shell,plugin));verifyFallback();Reject(()=>adapter.Prepare(Path.Combine(output,"missing-output")));
  Assert(Files.Hash(Path.Combine(source,original.Bundle))==mainHash&&Files.Hash(Path.Combine(source,plugin))==pluginHash,"Original engine changed");
  Console.WriteLine("PASS "+version+" plugin preparation, structural compatibility, source preservation, compressed copies, incompatible/missing plugin rejection");return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
 static void VerifyLoveLive(string source,string output){
  var adapter=EngineAdapter.Select(J.O("project",source,"settings",J.O("engine","webgal")));
  Assert(adapter.IsLoveLive&&Files.Full(adapter.Source)==source,"LoveLive source must be selected directly");
  string main=Path.Combine(source,adapter.Bundle),mainHash=Files.Hash(main);
  string prepared=Path.Combine(output,"prepared");
  adapter.Prepare(prepared);
  CheckSharedMainPatches(prepared,adapter);
  string[] plugins=Directory.GetFiles(Path.Combine(prepared,"assets"),"*.js")
   .Where(file=>File.ReadAllText(file).Contains("const __webvideoSetExpression=")).ToArray();
  Assert(plugins.Length==1,"The active LoveLive expression plugin must be patched exactly once");
  string plugin=Path.Combine("assets",Path.GetFileName(plugins[0])),original=Path.Combine(source,plugin);
  string pluginHash=Files.Hash(original);
  Assert(Files.Hash(main)==mainHash&&!File.ReadAllText(original).Contains("const __webvideoSetExpression="),"Original LoveLive runtime changed");
  Files.CopyFile(original,Path.Combine(output,"native.mjs"));
  Files.CopyFile(plugins[0],Path.Combine(output,"patched.mjs"));
  J.Write(Path.Combine(output,"result.json"),J.O("engine",adapter.Describe(),"plugin",plugin,"sourceHash",pluginHash,"patchedHash",Files.Hash(plugins[0])));
 }
 static void CheckSharedMainPatches(string prepared,EngineAdapter adapter){
  string main=File.ReadAllText(Path.Combine(prepared,adapter.Bundle));
  int start=main.IndexOf("task callback must be a function",StringComparison.Ordinal);
  int end=start<0?-1:main.IndexOf(".queue=function(",start,StringComparison.Ordinal);
  Assert(end>start,"Prepared Pixi queue missing in "+adapter.Id);
  string queue=main.Substring(start,end-start);
  Assert(!queue.Contains("setTimeout(")&&queue.Split(new[]{"queueMicrotask("},StringSplitOptions.None).Length==4,"Prepared Pixi queue must bypass the offline clock in "+adapter.Id);
  Assert(main.Contains("if(globalThis.__nativeAdapterInstalled===true)return;"),"Prepared autosave guard missing in "+adapter.Id);
 }
}

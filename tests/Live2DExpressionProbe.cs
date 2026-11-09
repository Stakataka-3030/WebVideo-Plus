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
  var request=J.O("project",source,"requireRuntimeParity",true,"expectedRuntimeId",J.S(metadata,"id"),"expectedRuntimeVersion",version,"expectedWebgalVersion",J.S(metadata,"webgalVersion"),"settings",J.O("engine",mygo?"mygo":"webgal"));
  var original=EngineAdapter.Select(request);
  string plugin="assets/"+(mygo?"index.es-Zih9sQ-u.js":version=="4.6.6"?"index.es-DlwKruus.js":version=="4.6.5"?"index.es-0XzJiDJZ.js":"index.es-erQsk_Nn.js");
  string mainHash=Files.Hash(Path.Combine(source,original.Bundle)),pluginHash=Files.Hash(Path.Combine(source,plugin));
  string shell=Path.Combine(output,"source");
  foreach(string file in new[]{"index.html","webgal-engine.json",original.Bundle,plugin})Files.CopyFile(Path.Combine(source,file),Path.Combine(shell,file));
  Files.Atomic(Path.Combine(shell,plugin)+".gz","stale fixture compression");Files.Atomic(Path.Combine(shell,plugin)+".br","stale fixture compression");
  var copied=J.D(request);copied["project"]=shell;var adapter=EngineAdapter.Select(copied);
  string prepared=Path.Combine(output,"prepared");adapter.Prepare(prepared);
  Assert(Files.Hash(Path.Combine(shell,plugin))==pluginHash,"Input fixture changed");
  Assert(!File.Exists(Path.Combine(prepared,plugin)+".gz")&&!File.Exists(Path.Combine(prepared,plugin)+".br"),"Stale compression retained");
  Assert(File.Exists(Path.Combine(shell,plugin)+".gz"),"Source compression changed");
  Files.Atomic(Path.Combine(output,"native.mjs"),File.ReadAllText(Path.Combine(shell,plugin)));
  Files.Atomic(Path.Combine(output,"patched.mjs"),File.ReadAllText(Path.Combine(prepared,plugin)));
  J.Write(Path.Combine(output,"result.json"),J.O("engine",adapter.Describe(),"plugin",plugin,"sourceHash",pluginHash,"patchedHash",Files.Hash(Path.Combine(prepared,plugin))));
  Files.Atomic(Path.Combine(shell,plugin),File.ReadAllText(Path.Combine(shell,plugin))+"\n// tampered fixture");
  Reject(()=>adapter.Prepare(Path.Combine(output,"tampered-output")));
  File.Delete(Path.Combine(shell,plugin));Reject(()=>adapter.Prepare(Path.Combine(output,"missing-output")));
  Assert(Files.Hash(Path.Combine(source,original.Bundle))==mainHash&&Files.Hash(Path.Combine(source,plugin))==pluginHash,"Original engine changed");
  Console.WriteLine("PASS "+version+" exact plugin preparation, source preservation, compressed copies, changed/missing plugin rejection");return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}

using System;using System.IO;using System.Linq;using System.Collections.Generic;using NativeVideo;
// Requires actual historical MyGO release bytes. Never fabricates a success fixture.
public static class EngineAdapterMygoProfileChecks {
 static int checks;static void Assert(bool ok,string error){if(!ok)throw new Exception(error);}
 static void Check(string name,Action body){body();checks++;Console.WriteLine("PASS "+name);}
 static void Reject(Action body){try{body();}catch(IOException){return;}throw new Exception("Invalid MyGO runtime was accepted");}
 static object Request(string root){return J.O("project",root,"requireRuntimeParity",true,"expectedRuntimeId","webgal-mygo.mygo","expectedRuntimeVersion","3.2.1","expectedWebgalVersion","4.6.4","settings",J.O("engine","mygo"));}
 public static int Main(string[] args){try{Run(args[0],args[1]);return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
 public static void Run(string source,string output){
  Directory.CreateDirectory(output);string original=Files.Full(source);var baseAdapter=EngineAdapter.Select(Request(original));Assert(baseAdapter.IsMygo&&baseAdapter.Version=="3.2.1"&&baseAdapter.SourceKind=="mygo-project-runtime"&&baseAdapter.RuntimeParity,"Wrong real MyGO fixture");Assert(Files.Hash(Path.Combine(original,baseAdapter.Bundle))==EngineAdapter.MygoHash,"MyGO fixture is not the canonical release");
  var inventory=Directory.GetFiles(original,"*",SearchOption.AllDirectories).ToDictionary(p=>p,Files.Hash);
  Check("real MyGO exact source selects and prepares without source mutation",()=>{string prepared=Path.Combine(output,"prepared");baseAdapter.Prepare(prepared);var metadata=J.Read(Path.Combine(prepared,"export-engine.json"));EngineAdapter.ValidateRuntimeContract(Request(original),metadata);string text=File.ReadAllText(Path.Combine(prepared,baseAdapter.Bundle));foreach(string marker in new[]{"globalThis.__probeCommands","core:R,store:Ie,stageManager:Z,parseScene:Ao","nativeAuto:yP,nativeStopAuto:$_,nativeNext:vp","__nativeAdapterInstalled=true"})Assert(text.Contains(marker),"Missing MyGO probe: "+marker);Assert(!text.Contains("audioLevelInterval:setInterval(()=>{},0)"),"Zero timer retained");Files.Atomic(Path.Combine(output,"patched-mygo.mjs"),text);});
  int sequence=0;Func<string> copy=()=>{string root=Path.Combine(output,"fixture-"+sequence++);Files.CopyTree(original,root);return root;};
  Check("real MyGO rejects changed hash before fallback",()=>{string root=copy();File.AppendAllText(Path.Combine(root,baseAdapter.Bundle),"\n// modified",Files.Utf8);Reject(()=>EngineAdapter.Select(Request(root)));});
  foreach(string field in new[]{"id","version","webgalVersion"})Check("real MyGO rejects descriptor "+field,()=>{string root=copy();var d=J.D(J.Read(Path.Combine(root,"webgal-engine.json")));d[field]=field=="id"?"open-webgal.webgal":field=="version"?"3.2.2":"4.6.5";J.Write(Path.Combine(root,"webgal-engine.json"),d);Reject(()=>EngineAdapter.Select(Request(root)));});
  Check("real MyGO rechecks bundle during Prepare",()=>{string root=copy();var a=EngineAdapter.Select(Request(root));File.AppendAllText(Path.Combine(root,a.Bundle),"\n// changed after selection",Files.Utf8);Reject(()=>a.Prepare(Path.Combine(output,"changed-output")));});
  Check("real MyGO rechecks descriptor during Prepare",()=>{string root=copy();var a=EngineAdapter.Select(Request(root));File.Delete(Path.Combine(root,"webgal-engine.json"));Reject(()=>a.Prepare(Path.Combine(output,"missing-description")));});
  Check("real MyGO direct Patch rejects changed bytes",()=>Reject(()=>baseAdapter.Patch(File.ReadAllText(Path.Combine(original,baseAdapter.Bundle))+"\n// tampered")));
  Check("real MyGO startup matches captured preview",()=>{var r=J.D(Request(original));r["runtimeStartup"]=J.O("language",2,"source","preview");var startup=RuntimeStartup.Resolve(r,Path.Combine(original,"game/config.txt"),baseAdapter);Assert(J.N(startup,"language")==2,"Preview locale lost");RuntimeStartup.ValidateContract(r,startup);});
  Assert(inventory.All(x=>File.Exists(x.Key)&&Files.Hash(x.Key)==x.Value),"Fixture source mutated");Console.WriteLine("Real MyGO byte/prepare checks passed: "+checks+". Native rendering is separate.");
 }
}

using System;
using System.IO;
using NativeVideo;

// Runs the real manager patcher without installing, starting Terre, or touching
// user state. The caller stages the product assets and compiles manager sources.
public static class TerreHostPatchChecks {
 public static void Run(string repository,string packageRoot,string outputRoot){
  string previousRoot=Files.Root;Files.Root=Path.GetFullPath(packageRoot);Directory.CreateDirectory(outputRoot);
  try{
   var selections=new[]{new[]{"compactGameTools"},new[]{"timelineNavigator","timelineSelector"},new[]{"exporter","compactGameTools"},ModuleCatalog.Advanced};
   foreach(string version in new[]{"4.6.4","4.6.5","4.6.6"}){
    string original=File.ReadAllText(Path.Combine(repository,"baseline","terre-"+version+".js"));
    for(int index=0;index<selections.Length;index++){
     string[] modules=ModuleCatalog.Resolve(selections[index]);
     foreach(bool variant in new[]{false,true}){
      string source=original+(variant?"\n// structural compatibility fixture\n":""),result=ProductIntegration.Patch(source,modules);
      if(!result.Contains("globalThis.WebVideoHostProfile="))throw new Exception("Missing host profile: "+version);
      if(!result.Contains("\"terreVersion\":\""+version+"\""))throw new Exception("Wrong host profile: "+version);
      if(!result.Contains("\"supportsFigureDiff\":"+(version!="4.6.4"?"true":"false")))throw new Exception("Wrong native diff capability: "+version);
      File.WriteAllText(Path.Combine(outputRoot,"terre-"+version+"-"+index+(variant?"-variant":"")+".mjs"),result);
      bool repeatedRejected=false;try{ProductIntegration.Patch(result,modules);}catch(IOException){repeatedRejected=true;}
      if(!repeatedRejected)throw new Exception("Repeated patch must be rejected: "+version);
     }
    }
    bool corruptRejected=false;try{ProductIntegration.Patch(original.Replace("function AddSentenceTab(){","function MissingAddSentenceTab(){"),ModuleCatalog.Resolve(new[]{"compactGameTools"}));}catch(IOException){corruptRejected=true;}
    if(!corruptRejected)throw new Exception("Missing anchor must stop patching: "+version);
   }
  }finally{Files.Root=previousRoot;}
  Console.WriteLine("Terre 4.6.4 / 4.6.5 / 4.6.6 native manager patch checks passed.");
 }
}

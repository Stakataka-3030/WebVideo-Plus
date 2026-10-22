using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

// Loads only the WebVideo+ manager. The supplied editor JS is read as text.
class FrontendCompatibilityProbe {
 static string Hash(string file) { using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(file))).Replace("-", "").ToLowerInvariant(); }
 static void AtomicJson(string file, object value) {
  string temporary=file+"."+Guid.NewGuid().ToString("N")+".tmp";
  File.WriteAllText(temporary,new JavaScriptSerializer().Serialize(value),new UTF8Encoding(false));
  if(File.Exists(file)) File.Replace(temporary,file,null); else File.Move(temporary,file);
 }
 static int Main(string[] args) {
  var result=new Dictionary<string,object>{{"layer","patch"},{"success",false}};
  try {
   var assembly=Assembly.LoadFile(Path.GetFullPath(args[0]));
   assembly.GetType("NativeVideo.Files",true).GetField("Root").SetValue(null,Path.GetFullPath(args[1]));
   var catalog=assembly.GetType("NativeVideo.ModuleCatalog",true);
   var integration=assembly.GetType("NativeVideo.ProductIntegration",true);
   string[] requested=((string[])catalog.GetField("Advanced").GetValue(null)).Where(x=>x!="sharedAssets").ToArray();
   if(args[3]=="on") requested=requested.Concat(new[]{"sharedAssets"}).ToArray();
   var modules=(string[])catalog.GetMethod("Resolve").Invoke(null,new object[]{requested});
   result["requested"]=requested;result["resolved"]=modules;result["inputSha256"]=Hash(args[2]);
   string source=File.ReadAllText(args[2]);
   if(args.Length>6) {
    // Patch-layer upgrade: exercise original selection separately from the real
    // manager CLI install/upgrade matrix in terre-release-preflight.ps1.
    string host=Path.Combine(Path.GetDirectoryName(args[4]),"record"),assets=Path.Combine(host,"public","assets");
    Directory.CreateDirectory(assets);
    string original=Path.Combine(assets,Path.GetFileName(args[2])),old=Path.Combine(assets,"webvideo-plus-1.1.7.js"),index=Path.Combine(host,"public","index.html");
    File.Copy(args[2],original);File.Copy(args[6],old);
    File.WriteAllText(index,"<script src=\"./assets/webvideo-plus-1.1.7.js\"></script>");
    var record=new Dictionary<string,object>{{"originalBundle",Path.GetFileName(original)},{"installedBundle",Path.GetFileName(old)},{"installedEntryHash",Hash(index)}};
    byte[] clean=(byte[])integration.GetMethod("ResolveOriginalIndex",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{host,index,record,host,true,false});
    var selection=new object[]{host,Encoding.UTF8.GetString(clean),Path.GetFileName(original),false,null,null};
    if(!(bool)integration.GetMethod("TryCleanBundle",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,selection)) throw new Exception("1.1.7 original selection failed");
    source=(string)selection[4];result["selectedOriginalMatchesInput"]=source==File.ReadAllText(args[2]);
    if(!(bool)result["selectedOriginalMatchesInput"]) throw new Exception("Upgrade did not select the recorded original");
   }
   string patched=(string)integration.GetMethod("Patch").Invoke(null,new object[]{source,modules,null});
   File.WriteAllText(args[4],patched,new UTF8Encoding(false));
   result["success"]=true;
  } catch(Exception error) {
   while(error is TargetInvocationException && error.InnerException!=null) error=error.InnerException;
   result["error"]=error.Message;result["errorType"]=error.GetType().FullName;
  }
  AtomicJson(args[5],result);
  return (bool)result["success"]?0:1;
 }
}

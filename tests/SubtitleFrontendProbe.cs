using System;using System.IO;using System.Linq;using System.Reflection;
class SubtitleFrontendProbe {
 static int Main(string[] args){try{
  var manager=Assembly.LoadFile(Path.GetFullPath(args[0]));manager.GetType("NativeVideo.Files",true).GetField("Root").SetValue(null,Path.GetFullPath(args[1]));var catalog=manager.GetType("NativeVideo.ModuleCatalog",true);
  string[] requested=args[3]=="all"?(string[])catalog.GetField("Advanced").GetValue(null):args[3].Split(',');var resolved=(string[])catalog.GetMethod("Resolve").Invoke(null,new object[]{requested});
  string patched=(string)manager.GetType("NativeVideo.ProductIntegration",true).GetMethod("Patch").Invoke(null,new object[]{File.ReadAllText(args[2]),resolved,null});File.WriteAllText(args[4],patched,new System.Text.UTF8Encoding(false));Console.WriteLine("PASS actual manager patch: "+args[3]+" -> "+resolved.Length+" resolved modules");return 0;
 }catch(Exception error){while(error is TargetInvocationException&&error.InnerException!=null)error=error.InnerException;Console.Error.WriteLine(error.GetType().Name+": "+error.Message);return 1;}}
}

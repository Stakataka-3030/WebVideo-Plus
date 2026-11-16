using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace NativeVideo {
 // Resource preparation must yield to the GPU without advancing story time.
 // Only the actually imported LoveLive resource chunk in the job copy is patched.
 public static class LoveLiveResourceTimers {
  const string Bridge="globalThis.__webgalOfflineExportHost.scheduleResourceTask";
  public static string Patch(string text) {
   if(text.Contains(Bridge))throw new IOException("LoveLive 资源计时器不能重复适配");
   var yield=Regex.Matches(text,@"(?<name>[$\w]+)=\(\)=>new Promise\((?<resolve>[$\w]+)=>setTimeout\(\k<resolve>,16\)\)");
   var hostYield=Regex.Matches(text,@"(?<name>[$\w]+)=\(\)=>new Promise\((?<resolve>[$\w]+)=>\{var (?<host>[$\w]+);const (?<schedule>[$\w]+)=\(\k<host>=globalThis\.__webgalOfflineExportHost\)==null\?void\s*0:\k<host>\.scheduleAssetMount;\k<schedule>\?\k<schedule>\(\k<resolve>\):setTimeout\(\k<resolve>,16\)\}\)");
   if(yield.Count+hostYield.Count!=1)
    throw new IOException("LoveLive 资源准备 yield 入口不匹配");
   bool hosted=hostYield.Count==1;
   var preparationYield=hosted?hostYield[0]:yield[0];
   if(!text.Contains("await "+preparationYield.Groups["name"].Value+"()"))
    throw new IOException("LoveLive 资源准备 yield 调用不匹配");
   var compile=Regex.Matches(text,@"compileAsync=function\([^{}]*\)\{const [^{};]+;return new Promise\([^{}]+=>\{function (?<poll>[$\w]+)\(\)\{if\([\s\S]{0,700}?setTimeout\(\k<poll>,10\)\}\w+\.get\(""KHR_parallel_shader_compile""\)!==null\?\k<poll>\(\):setTimeout\(\k<poll>,10\)\}\)\}");
   if(compile.Count!=1||Regex.Matches(compile[0].Value,@"\bsetTimeout\(").Count!=2)
    throw new IOException("LoveLive GPU 编译轮询入口不匹配");
   // Validate both before editing either. Other timers in this chunk remain native.
   string next=text.Remove(compile[0].Index,compile[0].Length).Insert(compile[0].Index,compile[0].Value.Replace("setTimeout(",Bridge+"("));
   // This engine already delegates preparation to the host's wall-clock hook.
   if(hosted)return next;
   var y=Regex.Match(next,@"(?<name>[$\w]+)=\(\)=>new Promise\((?<resolve>[$\w]+)=>setTimeout\(\k<resolve>,16\)\)");
   return next.Remove(y.Index,y.Length).Insert(y.Index,y.Value.Replace("setTimeout(",Bridge+"("));
  }
  public static void Prepare(string root,string bundle,string main) {
   var imports=Regex.Matches(main,"import\\([\"']\\./(?<file>offscreen-character-[A-Za-z0-9_-]+\\.js)[\"']\\)").Cast<Match>().Select(m=>m.Groups["file"].Value).Distinct(StringComparer.Ordinal).ToArray();
   if(imports.Length!=1)throw new IOException("LoveLive 资源模块入口不匹配");
   string file=Path.Combine(root,Path.GetDirectoryName(bundle),imports[0]);
   if(!File.Exists(file))throw new IOException("LoveLive 资源模块缺失");
   string patched=Patch(File.ReadAllText(file));
   File.WriteAllText(file,patched,new System.Text.UTF8Encoding(false));
   foreach(string extension in new[]{".gz",".br"})if(File.Exists(file+extension))File.Delete(file+extension);
  }
 }
}

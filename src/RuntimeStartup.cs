using System;using System.IO;using System.Linq;using System.Globalization;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class RuntimeStartup {
  // These integer values are identical in official 4.6.4 / 4.6.5 and MyGO 3.2.1.
  // MyGO source: ed73e55a87546cf0bc495a95061ccce2dafdf7cb, config/language.ts.
  static readonly string[] Codes={"zh_CN","en","ja","fr","de","zh_TW","pt_BR","ko"};
  static int Language(object startup){
   object raw=J.Get(startup,"language");double value;
   if(raw==null||raw is bool||!double.TryParse(Convert.ToString(raw,CultureInfo.InvariantCulture),NumberStyles.Number,CultureInfo.InvariantCulture,out value)||value<0||value>=Codes.Length||Math.Floor(value)!=value)throw new IOException("导出启动语言无效，请在项目预览中重新选择语言");
   return (int)value;
  }
  public static object Resolve(object request,string configPath,EngineAdapter adapter){
   if(adapter.IsMygo&&!J.B(request,"requireRuntimeParity",false))return null; // Keep the nonstrict legacy derivative behavior.
   object supplied=J.Get(request,"runtimeStartup");
   if(supplied!=null){int language=Language(supplied);if(J.S(supplied,"source")!="preview")throw new IOException("导出语言必须来自当前项目预览");return J.O("language",language,"code",Codes[language],"source","preview");}
   // Only the actual project config is evidence; never use Skeleton defaults.
   // Ambiguous repeated assignments are rejected rather than guessed.
   string config=File.Exists(configPath)?File.ReadAllText(configPath):"";
   var matches=Regex.Matches(config,@"(?m)^\s*Default_Language\s*:\s*([^;\r\n]*)\s*(?:;|$)").Cast<Match>().Select(m=>m.Groups[1].Value.Trim()).ToArray();
   if(matches.Length==1){int language=Array.IndexOf(Codes,matches[0]);if(language>=0)return J.O("language",language,"code",Codes[language],"source","project-default");}
   throw new IOException("项目未提供有效的 Default_Language，且没有已确认的预览语言。请在项目配置中设置 Default_Language，或从能捕获当前预览语言的入口重新导出。");
  }
  public static void ValidateResolved(object startup){
   int language=Language(startup);string source=J.S(startup,"source");
   if((source!="preview"&&source!="project-default")||J.S(startup,"code")!=Codes[language])throw new IOException("导出计划缺少已验证的启动语言，请重新规划任务");
  }
  public static void ValidateContract(object request,object startup){
   ValidateResolved(startup);object captured=J.Get(request,"runtimeStartup");
   if(captured!=null){
    if(J.S(captured,"source")!="preview"||J.S(startup,"source")!="preview"||Language(captured)!=Language(startup))throw new IOException("缓存计划的启动语言与排队时的预览语言不一致，请重新规划任务");
   }else if(J.S(startup,"source")!="project-default")throw new IOException("缓存计划声称使用预览语言，但任务没有该语言快照");
  }
  public static string Script(object startup){
   if(startup==null)return "";ValidateResolved(startup);int language=Language(startup);
   return "localStorage.setItem('lang',"+J.Text(language.ToString(CultureInfo.InvariantCulture))+");\n";
  }
  public static string ReadyExpression(object startup){
   int language=Language(startup);
   return "(()=>{const s=globalThis.__wgProbe?.store?.getState?.();return s?.userData?.optionData?.language==="+language+"&&localStorage.getItem('lang')==="+J.Text(language.ToString(CultureInfo.InvariantCulture))+"&&!document.querySelector('[class*=langWrapper_]');})()";
  }
 }
}

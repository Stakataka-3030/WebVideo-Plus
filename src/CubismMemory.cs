using System;
using System.IO;
using System.Globalization;
using System.Threading.Tasks;

namespace NativeVideo {
 public sealed partial class BrowserHost {
  int cubismCoreInitialMemoryMiB;

  public async Task InstallCubismMemory(int mib){
   if(mib==0)return;
   if(mib<16||mib>1024)throw new ArgumentOutOfRangeException("mib","Live2D Core 初始内存需在 16–1024 MiB 之间");
   cubismCoreInitialMemoryMiB=mib;
   string source=File.ReadAllText(Path.Combine(Files.Root,"browser/cubism-memory.js"))
    .Replace("__CUBISM_CORE_MEMORY_MIB__",mib.ToString(CultureInfo.InvariantCulture));
   await View.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(source);
  }

  public async Task<object> VerifyCubismMemory(string diagnosticFile=null){
   if(cubismCoreInitialMemoryMiB==0)return null;
   await Wait("globalThis.__webvideoCubismMemory?.done===true",30000);
   object state=await Eval("globalThis.__webvideoCubismMemory");
   if(!string.IsNullOrWhiteSpace(diagnosticFile))J.Write(diagnosticFile,state);
   if(J.B(state,"coreLoaded")&&!J.B(state,"applied"))
    throw new IOException("Live2D Core 初始内存设置未生效："+J.S(state,"error","运行时不支持此接口"));
   return state;
  }
 }
}

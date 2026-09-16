using System;using System.Linq;
namespace NativeVideo {
 public static partial class App {
  public static string[] Args;
  public static string Arg(string key,string fallback=""){int i=Array.IndexOf(Args,key);return i>=0&&i+1<Args.Length?Args[i+1]:fallback;}
  public static int Main(string[] args){Args=args;try{AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);ProductIntegration.Run().GetAwaiter().GetResult();return 0;}catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
 }
}

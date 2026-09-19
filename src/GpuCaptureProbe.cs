using System;using System.Diagnostics;using System.IO;using System.Linq;using System.Threading.Tasks;
namespace NativeVideo {
 public sealed class GpuCaptureProbeSession:IDisposable {
  Process process;Task<string> errorTask;bool stopped;public object Ready{get;private set;}public object Result{get;private set;}
  GpuCaptureProbeSession(Process p,Task<string> error){process=p;errorTask=error;}
  public static async Task<GpuCaptureProbeSession> Start(IntPtr hwnd){
   var p=Commands.Start(Path.Combine(Files.Root,"gpu-capture-probe.exe"),new[]{"--hwnd",unchecked((ulong)hwnd.ToInt64()).ToString()},true,true);p.StandardInput.AutoFlush=true;var error=p.StandardError.ReadToEndAsync();var session=new GpuCaptureProbeSession(p,error);
   try{var line=await BrowserHost.Timeout(p.StandardOutput.ReadLineAsync(),10000,"GPU 捕获探针启动");if(line==null||!line.StartsWith("READY "))throw new IOException("GPU 捕获探针没有返回 READY"+(p.HasExited?"："+await error:""));session.Ready=J.Parse(line.Substring(6));return session;}catch{session.Dispose();throw;}
  }
  public async Task Stop(){
   if(stopped)return;stopped=true;try{process.StandardInput.WriteLine("STOP");process.StandardInput.Close();}catch{}
   var textTask=process.StandardOutput.ReadToEndAsync();var watch=Stopwatch.StartNew();while(!process.HasExited&&watch.ElapsedMilliseconds<10000)await Task.Delay(20);if(!process.HasExited){process.Kill();throw new TimeoutException("GPU 捕获探针停止超时");}
   var text=await textTask;var error=await errorTask;var line=text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).FirstOrDefault(x=>x.StartsWith("RESULT "));if(line!=null)Result=J.O("ready",Ready,"capture",J.Parse(line.Substring(7)));else if(process.ExitCode!=0||!string.IsNullOrWhiteSpace(error))throw new IOException("GPU 捕获探针失败："+error.Trim());else throw new IOException("GPU 捕获探针没有返回结果");
  }
  public void Dispose(){if(process==null)return;try{if(!process.HasExited)process.Kill();}catch{}process.Dispose();process=null;}
 }
}

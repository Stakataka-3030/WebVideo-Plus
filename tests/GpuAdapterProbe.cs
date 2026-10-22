using System;using System.IO;using System.Drawing;using System.Windows.Forms;using NativeVideo;
class GpuAdapterProbe {
 [STAThread]static void Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);int result=1;string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
  var runner=new Form{ShowInTaskbar=false,FormBorderStyle=FormBorderStyle.None,StartPosition=FormStartPosition.Manual,Location=new Point(-32000,-32000),Size=new Size(8,8)};
  runner.Shown+=async (sender,e)=>{try{
   string page=Path.Combine(root,"page");Directory.CreateDirectory(page);Files.Atomic(Path.Combine(page,"index.html"),"<!doctype html><canvas id='c' width='16' height='16'></canvas><script>const gl=document.querySelector('canvas').getContext('webgl2');if(gl){gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}globalThis.__wgProbe={parseScene:()=>{},core:{gameplay:{pixiStage:{currentApp:{renderer:{gl}}}}}};globalThis.__probeCommands={};</script>");
   using(var browser=new BrowserHost(64,64)){await browser.Start(Path.Combine(root,"profile"),args[1],args.Length>2?args[2]:"");await browser.Navigate(page);J.Write(Path.Combine(root,"gpu-selection.json"),browser.GpuDiagnostics);if(J.S(browser.GpuDiagnostics,"verification")=="unavailable")throw new Exception("WebGL observation unavailable");if(J.B(browser.GpuDiagnostics,"exactLuidConfirmed"))throw new Exception("Probe must not claim unobserved LUID");}
   result=0;
  }catch(Exception error){Files.Atomic(Path.Combine(root,"probe-error.txt"),error.ToString());}finally{runner.Close();}};
  Application.Run(runner);Environment.ExitCode=result;
 }
}

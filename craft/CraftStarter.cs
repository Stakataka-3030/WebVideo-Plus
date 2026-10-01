using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyVersion("1.1.2.0")]
[assembly: AssemblyFileVersion("1.1.2.0")]
[assembly: AssemblyInformationalVersion("1.1.2.0c")]

static class CraftStarter {
 static string Q(string s) { return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\""; }
 [STAThread] static int Main(string[] args) {
  var headless=args.Contains("--auto-click");
  try {
   var root=AppDomain.CurrentDomain.BaseDirectory;
   var craft=File.ReadAllText(Path.Combine(root,"craft-path.txt")).Trim();
   if(!File.Exists(craft))throw new FileNotFoundException("Craft 原程序不在安装时选择的位置，请重新安装 Craft 适配包。",craft);
   var node=Path.Combine(root,"node.exe");
   var script=Path.Combine(root,"launch-injected.mjs");
   var kernel=Path.Combine(root,"WebGAL.Video.exe");
   foreach(var file in new[]{node,script,kernel})if(!File.Exists(file))throw new FileNotFoundException("Craft 适配包缺少运行文件，请重新安装。",file);
   var command=new[]{script,"--craft",craft,"--kernel",kernel}.Concat(args);
   using(var process=Process.Start(new ProcessStartInfo(node,String.Join(" ",command.Select(Q))){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true})) {
    var outputLog=Path.Combine(root,"craft-launcher-output.log");
    var logGate=new object();
    process.OutputDataReceived+=(sender,eventArgs)=>{if(eventArgs.Data!=null)lock(logGate)File.AppendAllText(outputLog,eventArgs.Data+Environment.NewLine);};
    process.ErrorDataReceived+=(sender,eventArgs)=>{if(eventArgs.Data!=null)lock(logGate)File.AppendAllText(outputLog,eventArgs.Data+Environment.NewLine);};
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();
    process.WaitForExit();
    if(process.ExitCode!=0)File.WriteAllText(Path.Combine(root,"craft-launcher-error.log"),"详见 "+outputLog);
    if(process.ExitCode!=0&&!headless)MessageBox.Show("WebVideo+ Craft 启动或导出失败。请查看安装目录中的 craft-injection.log。","WebVideo+ Craft",MessageBoxButtons.OK,MessageBoxIcon.Error);
    return process.ExitCode;
   }
  } catch(Exception error) { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"craft-launcher-error.log"),error.ToString());if(!headless)MessageBox.Show(error.Message,"WebVideo+ Craft",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1; }
 }
}

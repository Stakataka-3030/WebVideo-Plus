using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using System.Reflection;
using System.Collections.Generic;
[assembly: AssemblyVersion("1.1.2.0")]
[assembly: AssemblyFileVersion("1.1.2.0")]
[assembly: AssemblyInformationalVersion("1.1.2.0c")]

static class CraftStarter {
 static string Q(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
 [STAThread] static int Main(string[] args){
  bool headless=args.Contains("--auto-click");string logFile=null;
  try{
   string self=Assembly.GetExecutingAssembly().Location,home=Path.GetDirectoryName(self),statePath=null;var forwarded=new List<string>();
   for(int i=0;i<args.Length;i++){if(args[i]=="--"){forwarded.AddRange(args.Skip(i));break;}if((args[i]=="--state"||args[i]=="--config")&&i+1<args.Length){statePath=Path.GetFullPath(args[++i]);}else forwarded.Add(args[i]);}
   if(statePath==null)statePath=File.Exists(Path.Combine(home,"config.json"))?Path.Combine(home,"config.json"):Path.Combine(home,"webvideo-craft.install.json");
   var state=CraftManifestVerifier.VerifyLaunch(statePath,self);string root=CraftManifestVerifier.Text(state,"adapterRoot"),stateDir=CraftManifestVerifier.Text(state,"stateDir");
   if(!CraftManifestVerifier.Same(stateDir,Path.Combine(root,"state")))throw new IOException("会话目录不属于此适配器");CraftManifestVerifier.NoLinks(stateDir);Directory.CreateDirectory(Path.Combine(stateDir,"logs"));logFile=Path.Combine(stateDir,"logs","launcher.log");
   var package=CraftManifestVerifier.Get(state,"package");string node=CraftManifestVerifier.Under(root,CraftManifestVerifier.Text(package,"node")),script=CraftManifestVerifier.Under(root,CraftManifestVerifier.Text(package,"entry"));
   var command=new[]{script,"--state",Path.Combine(root,"config.json"),"--craft",CraftManifestVerifier.Text(state,"originalExe"),"--kernel",CraftManifestVerifier.Text(state,"kernelExe"),"--wrapper-pid",Process.GetCurrentProcess().Id.ToString()}.Concat(forwarded);
   // Only the child session configures WebView2. This wrapper never sets a
   // persistent environment variable, registry value or background service.
   using(var process=Process.Start(new ProcessStartInfo(node,String.Join(" ",command.Select(Q))){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true})){
    var gate=new object();DataReceivedEventHandler append=(sender,e)=>{if(e.Data!=null)lock(gate)File.AppendAllText(logFile,e.Data+Environment.NewLine);};process.OutputDataReceived+=append;process.ErrorDataReceived+=append;process.BeginOutputReadLine();process.BeginErrorReadLine();process.WaitForExit();
    // The session may hand an update to an external one-shot coordinator. Exit
    // immediately so the original-name executable is no longer mapped/locked.
    if(process.ExitCode==75)return 0;
    if(process.ExitCode!=0&&!headless)MessageBox.Show("Craft 会话启动失败。日志："+logFile,"WebVideo+ Craft",MessageBoxButtons.OK,MessageBoxIcon.Error);
    return process.ExitCode;
   }
  }catch(Exception error){try{if(logFile!=null)File.AppendAllText(logFile,error+Environment.NewLine);}catch{}if(!headless)MessageBox.Show(error.Message,"WebVideo+ Craft",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}

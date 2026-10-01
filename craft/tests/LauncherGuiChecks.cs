// Actual launcher UI + native mutex, with inert operations only. No host,
// payload, user project/profile or production adapter is opened.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Web.Script.Serialization;

static class LauncherGuiChecks {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
 [STAThread] static int Main(string[] args){
  if(args.Length==2&&args[0]=="--try-lock"){
   try{using(var lease=CraftStarter.AcquireLaunchMutex(args[1])){lease.ReleaseMutex();return 0;}}catch(IOException){return 10;}
  }
  try{
   Control.CheckForIllegalCrossThreadCalls=true;Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);Application.EnableVisualStyles();
   CheckLogging();CheckVerifier();CheckMutex();RunCase(false,false);RunCase(true,false);RunCase(false,true);
   Console.WriteLine("PASS actual launcher: responsive progress, close guard, readiness hides without exiting, no restart on reshow, visible failure and shared early mutex");return 0;
  }catch(Exception error){Console.Error.WriteLine(error);return 1;}
 }
 static void CheckLogging(){
  string root=Path.Combine(Path.GetTempPath(),"craft-launch-log-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  try{
   string primary=Path.Combine(root,"locked.log"),fallback=Path.Combine(root,"fallback.log");int ready=0;Exception failure=null;
   var log=new CraftStarter.LaunchLog(fallback);log.UsePrimary(primary);
   // Reproduce a real sharing violation on the redirected-output thread path.
   using(var locked=new FileStream(primary,FileMode.Create,FileAccess.Write,FileShare.None)){
    var output=new Thread(()=>{try{CraftStarter.HandleSessionOutput("WEBVIDEO_CRAFT_STATUS {\"stage\":\"ready\",\"text\":\"fixture ready\"}",log,(text,isReady)=>{if(isReady)ready++;});log.Write("output continues after fallback");}catch(Exception error){failure=error;}});
    output.Start();Check(output.Join(5000),"Log callback stalled on locked primary");if(failure!=null)throw failure;
    Check(ready==1,"Logging failure prevented readiness dispatch");Check(File.ReadAllText(fallback).Contains("output continues after fallback"),"Fallback did not keep subsequent output");Check(log.Diagnostic.Contains(primary)&&log.Diagnostic.Contains(fallback),"Fallback diagnostic did not identify failed/actual paths");
   }
   int attempts=0;var unavailable=new CraftStarter.LaunchLog(fallback,(file,text)=>{attempts++;throw new IOException("synthetic disk unavailable");});unavailable.UsePrimary(primary);
   for(int i=0;i<100;i++)unavailable.Write("line"+i+" "+new string('x',1024));
   CraftStarter.HandleSessionOutput("WEBVIDEO_CRAFT_STATUS {\"stage\":\"ready\",\"text\":\"fixture ready\"}",unavailable,(text,isReady)=>{if(isReady)ready++;});
   CraftStarter.HandleSessionOutput("WEBVIDEO_CRAFT_STATUS invalid",unavailable,(text,isReady)=>{});
   CraftStarter.HandleSessionOutput("WEBVIDEO_CRAFT_STATUS {\"stage\":\"ready\",\"text\":\"fixture ready\"}",unavailable,(text,isReady)=>{throw new InvalidOperationException("synthetic disposed progress");});
   string diagnostic=unavailable.Diagnostic;Check(attempts>=100&&ready==2,"Failed disk writes escaped or lost progress");Check(diagnostic.Contains("line99")&&diagnostic.Contains("synthetic disk unavailable")&&diagnostic.Length<20000,"In-memory diagnostic was missing or unbounded");
   Console.WriteLine("PASS launcher log sharing-violation fallback, all-writes-fail containment, bounded diagnostic and progress delivery");
  }finally{Directory.Delete(root,true);}
 }
 static void MustReject(Action operation,string message){try{operation();}catch(IOException){return;}throw new Exception(message);}
 static void CheckVerifier(){
  string root=Path.Combine(Path.GetTempPath(),"craft-verifier-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  try{
   var files=new List<object>();string first=null;
   for(int i=0;i<150;i++){string name="ai-runtime/node_modules/pkg"+(i/10)+"/dist/deep/file"+i+".js",file=Path.Combine(root,name.Replace('/',Path.DirectorySeparatorChar));Directory.CreateDirectory(Path.GetDirectoryName(file));File.WriteAllText(file,"inert fixture "+i);if(first==null)first=name;files.Add(new{path=name,bytes=new FileInfo(file).Length,sha256=CraftManifestVerifier.Hash(file)});}
   var manifest=new{schemaVersion=1,product="WebVideo+ Craft",supportedHosts=new[]{new{version="fixture",sha256=new string('a',64)}},entry=first,wrapper=first,node=first,kernel=first,files=files};
   File.WriteAllText(Path.Combine(root,"MANIFEST.json"),new JavaScriptSerializer().Serialize(manifest));
   string progress=null;CraftManifestVerifier.Verify(root,false,message=>progress=message);Check(progress.Contains("150"),"Verifier did not report complete hashing");
   string victim=Path.Combine(root,first.Replace('/',Path.DirectorySeparatorChar)),original=File.ReadAllText(victim);File.AppendAllText(victim,"modified");MustReject(()=>CraftManifestVerifier.Verify(root),"Verifier trusted prior success after tampering");File.WriteAllText(victim,original);
   string extra=Path.Combine(root,"unexpected.txt");File.WriteAllText(extra,"unlisted");MustReject(()=>CraftManifestVerifier.Verify(root),"Verifier accepted undeclared file");File.Delete(extra);
   File.Delete(victim);MustReject(()=>CraftManifestVerifier.Verify(root),"Verifier accepted missing declared file");
   Console.WriteLine("PASS native full verifier and tamper/missing/unlisted rejection");
  }finally{Directory.Delete(root,true);}
 }
 static int ProbeMutex(string adapter){
  using(var child=Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location,"--try-lock \""+adapter+"\""){UseShellExecute=false,CreateNoWindow=true})){
   Check(child.WaitForExit(10000),"Inert mutex child timed out");return child.ExitCode;
  }
 }
 static void CheckMutex(){
  string adapter=Path.Combine(Path.GetTempPath(),"craft-launch-mutex-"+Guid.NewGuid().ToString("N"));
  using(var lease=CraftStarter.AcquireLaunchMutex(adapter)){
   Check(ProbeMutex(adapter.ToUpperInvariant()+Path.DirectorySeparatorChar+".")==10,"Equivalent adapter path did not reject second process");
   Check(ProbeMutex(adapter+"-other")==0,"Different adapter was incorrectly blocked");lease.ReleaseMutex();
  }
  Check(ProbeMutex(adapter)==0,"Launch mutex was not released");Console.WriteLine("PASS early launch mutex");
 }
 static void RunCase(bool failBeforeReady,bool failAfterReady){
  int uiThread=Thread.CurrentThread.ManagedThreadId,calls=0,ticks=0,errors=0;bool readyReleased=false,exitReleased=false,checkedClose=false;Exception failure=null;
  using(var readyGate=new ManualResetEvent(false))using(var exitGate=new ManualResetEvent(false))using(var timer=new System.Windows.Forms.Timer{Interval=50}){
   var elapsed=Stopwatch.StartNew();var hiddenElapsed=new Stopwatch();Form form=null;
   form=CraftStarter.CreateForm(report=>{
    Interlocked.Increment(ref calls);Check(Thread.CurrentThread.ManagedThreadId!=uiThread,"Launcher work ran on UI thread");report("fixture verifying",false);
    Check(readyGate.WaitOne(10000),"UI did not release verification");if(failBeforeReady)throw new IOException("synthetic launch failure");
    report("fixture ready",true);Check(exitGate.WaitOne(10000),"UI did not release owned session");return failAfterReady?1:0;
   },(owner,message)=>{Check(Thread.CurrentThread.ManagedThreadId==uiThread,"Error dialog off UI thread");Check(form.Visible,"Failure was not made visible");errors++;});
   using(form){
    form.Shown+=(sender,e)=>{timer.Start();};
    timer.Tick+=(sender,e)=>{try{
     ticks++;Check(elapsed.Elapsed.TotalSeconds<15,"Synthetic launcher UI timed out");
     if(!readyReleased&&calls>0){
      if(!checkedClose){checkedClose=true;form.Close();Check(!form.IsDisposed&&form.Visible,"Close abandoned verification");}
      // Wait for the observable elapsed label; WinForms timers are not exact.
      string status=form.Controls["status"].Text;
      if(ticks>=10&&status.Contains("fixture verifying")&&System.Text.RegularExpressions.Regex.IsMatch(status,@"已用时 [1-9][0-9]* 秒")){
       Check(form.Controls["progress"].Visible,"Progress indicator missing");readyReleased=true;readyGate.Set();
      }
     }else if(readyReleased&&!failBeforeReady&&!form.Visible&&!exitReleased){
      if(!hiddenElapsed.IsRunning)hiddenElapsed.Start();
      Check(!form.IsDisposed,"Readiness ended wrapper lifetime");Check(calls==1,"Showing launcher started a second operation");
      if(hiddenElapsed.ElapsedMilliseconds>=250){exitReleased=true;exitGate.Set();}
     }
    }catch(Exception error){failure=error;timer.Stop();readyGate.Set();exitGate.Set();form.BeginInvoke(new Action(()=>form.Dispose()));Application.ExitThread();}};
    Application.Run(form);timer.Stop();if(failure!=null)throw failure;
    Check(calls==1,"Unexpected operation count");Check(errors==(failBeforeReady||failAfterReady?1:0),"Unexpected visible error count");Check((int)form.Tag==(failBeforeReady||failAfterReady?1:0),"Wrong launcher exit status");
    Console.WriteLine("PASS launcher "+(failBeforeReady?"failure before readiness":failAfterReady?"failure after readiness":"ready + owned session exit"));
   }
  }
 }
}

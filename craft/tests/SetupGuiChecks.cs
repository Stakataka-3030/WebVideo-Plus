// Exercises the actual Setup form with inert operations only. No payload, host,
// adapter, updater or user profile is opened by these synthetic UI checks.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

static class SetupGuiChecks {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
 static void ClickEvenIfDisabled(Button button){typeof(Button).GetMethod("OnClick",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(button,new object[]{EventArgs.Empty});}
 [STAThread] static int Main(){
  try{
   Control.CheckForIllegalCrossThreadCalls=true;Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);Application.EnableVisualStyles();
   RunCase("install",false);RunCase("remove",false);RunCase("recover",false);RunCase("install",true);
   Console.WriteLine("PASS actual Setup form: responsive progress, UI-thread callbacks, input snapshot, repeat/close guards, all actions and failure/retry");return 0;
  }catch(Exception error){Console.Error.WriteLine(error);return 1;}
 }
 static void RunCase(string buttonName,bool failFirst){
  int uiThread=Thread.CurrentThread.ManagedThreadId,calls=0,successes=0,errors=0,ticks=0;bool released=false,retried=false,checkedBusy=false;Exception failure=null;
  string expectedAction=buttonName=="remove"?"uninstall":buttonName=="recover"?"recover-session":"install";
  using(var gate=new ManualResetEvent(false))using(var clock=new System.Windows.Forms.Timer{Interval=50}){
   var elapsed=Stopwatch.StartNew();Form form=null;
   form=CraftSetup.CreateForm((action,destination,craft,mode,report)=>{
    int attempt=Interlocked.Increment(ref calls);
    Check(Thread.CurrentThread.ManagedThreadId!=uiThread,"Operation ran on the UI thread");
    Check(action==expectedAction&&destination=="fixture-adapter"&&craft=="fixture-craft.exe"&&mode=="same-name","Operation did not use captured inputs");
    report("fixture phase "+attempt);
    Check(gate.WaitOne(10000),"UI failed to release the synthetic operation");
    if(failFirst&&attempt==1)throw new InvalidOperationException("synthetic operation failure");
   },(owner,message,title,icon)=>{
    Check(Thread.CurrentThread.ManagedThreadId==uiThread,"Completion dialog ran off the UI thread");
    if(icon==MessageBoxIcon.Error){errors++;Check(message.Contains("synthetic operation failure"),"Failure detail missing");}
    else successes++;
   });
   using(form){
    var button=(Button)form.Controls[buttonName];var status=(Label)form.Controls["status"];var progress=(ProgressBar)form.Controls["progress"];
    Action prepare=()=>{form.Controls["targetPath"].Text="fixture-adapter";form.Controls["craftPath"].Text="fixture-craft.exe";((CheckBox)form.Controls["sameName"]).Checked=true;};
    prepare();
    form.Shown+=(sender,e)=>{elapsed.Restart();ticks=0;button.PerformClick();clock.Start();};
    clock.Tick+=(sender,e)=>{
     try{
      ticks++;
      Check(elapsed.Elapsed.TotalSeconds<15,"Synthetic GUI case timed out");
      if(errors==1&&!retried){
       Check(failFirst,"Unexpected operation failure");
       foreach(string name in new[]{"install","remove","recover","craftPath","targetPath","browseCraft","browseTarget","sameName"})Check(form.Controls[name].Enabled,"Failure left control disabled: "+name);
       Check(!progress.Visible,"Failure left progress active");
       Check(File.Exists(Path.Combine(Path.GetTempPath(),"WebVideoCraft-Setup-error.log")),"Failure log missing");
       retried=true;released=false;checkedBusy=false;gate.Reset();prepare();elapsed.Restart();ticks=0;button.PerformClick();
      }
      if(!released&&calls>0){
       foreach(string name in new[]{"install","remove","recover","craftPath","targetPath","browseCraft","browseTarget","sameName"})Check(!form.Controls[name].Enabled,"Busy control remained enabled: "+name);
       if(!checkedBusy){
        checkedBusy=true;int before=calls;ClickEvenIfDisabled(button);ClickEvenIfDisabled((Button)form.Controls["remove"]);Check(calls==before,"Second activation started an operation");
        form.Close();Check(!form.IsDisposed&&form.Visible,"Close interrupted active operation");
       }
       // Disabled controls cannot be edited by the user; even programmatic edits
       // must not change the immutable request already queued for the worker.
       form.Controls["targetPath"].Text="changed-after-dispatch";
       // WinForms timers are message-driven, not real-time deadlines. Wait for
       // observed stage + elapsed status instead of sampling at a fixed 1.3 s.
       // Keep the independent heartbeat assertion and a bounded failure path.
       bool statusReady=status.Text.Contains("fixture phase "+calls)&&System.Text.RegularExpressions.Regex.IsMatch(status.Text,@"已用时 [1-9][0-9]* 秒");
       Check(elapsed.ElapsedMilliseconds<8000,"Stage or elapsed status did not refresh within 8 seconds; UI ticks="+ticks+"; status="+status.Text);
       if(statusReady){
        Check(ticks>=10,"UI timer did not keep pumping during operation");
        Check(progress.Visible&&progress.Style==ProgressBarStyle.Marquee,"Busy progress indicator absent");
        released=true;gate.Set();
       }
      }
     }catch(Exception error){failure=error;clock.Stop();gate.Set();form.BeginInvoke(new Action(()=>form.Dispose()));Application.ExitThread();}
    };
    Application.Run(form);clock.Stop();
    if(failure!=null)throw failure;
    Check(successes==1&&errors==(failFirst?1:0)&&calls==(failFirst?2:1),"Unexpected operation/completion count");
    Console.WriteLine("PASS "+buttonName+(failFirst?" failure + retry":" success"));
   }
  }
 }
}

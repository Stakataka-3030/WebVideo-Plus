// Actual WinForms, inert injected operations/discovery only. No host, package,
// updater, registry, shortcut or user profile is opened by these UI checks.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

static class SetupGuiChecks {
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
 static Control Find(Form form,string name){var found=form.Controls.Find(name,true);Check(found.Length==1,"Missing/duplicate control: "+name);return found[0];}
 static void ForceClick(Control button){typeof(Button).GetMethod("OnClick",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(button,new object[]{EventArgs.Empty});}
 [STAThread] static int Main(){try{
  Control.CheckForIllegalCrossThreadCalls=true;Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);Application.EnableVisualStyles();
  RunCase("install",false,false);RunCase("remove",false,false);RunCase("recover",false,false);RunCase("repair",false,false);RunCase("install",true,false);RunCase("install",false,true);
  RunLayoutCase();RunDiscoveryDismissCase();
  Console.WriteLine("PASS actual Setup form: responsive progress, snapshot, repeated activation/close guards, transaction cancellation gate, preparation cancel, retained completion, all actions and retry");return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}

 static void RunLayoutCase(){
  using(var form=CraftSetup.CreateForm((request,report)=>new CraftSetupResult{},(owner,text,title,icon)=>{},(owner,text,title)=>false,(preferred,target)=>new string[0],target=>{},file=>{},target=>new CraftInstallationInfo{})){
   Find(form,"craftPath").Text="inert selection; no discovery";((CheckBox)Find(form,"advancedToggle")).Checked=true;
   form.Show();
   foreach(float size in new[]{9F,13.5F,18F}){
    form.Font=new System.Drawing.Font(form.Font.FontFamily,size);form.ClientSize=new System.Drawing.Size(560,430);
    Find(form,"status").Text=new string('测',160)+" C:\\long-path\\"+new string('x',180);form.PerformLayout();
    var content=Find(form,"content");Check(content.Width<=form.ClientSize.Width,"Layout widened beyond viewport at font "+size);
    foreach(string name in new[]{"intro","installed","modeNote","cacheNote","status"}){
     var label=(Label)Find(form,name);Check(label.MaximumSize.Width>0,"Label has no wrapping width: "+name);Check(label.Width<=label.Parent.ClientSize.Width,"Label exceeds parent: "+name);
    }
    Check(form.AutoScroll,"Small-screen layout cannot scroll");
   }
   form.Close();
  }
  Console.WriteLine("PASS actual form layout constraints: 560px viewport and 100/150/200 percent font sizes");
 }
 static void RunDiscoveryDismissCase(){
  using(var gate=new ManualResetEvent(false))using(var completed=new ManualResetEvent(false))using(var pulse=new System.Windows.Forms.Timer{Interval=50}){
   Form form=null;bool started=false;Exception failure=null;int ticks=0;
   form=CraftSetup.CreateForm((request,report)=>new CraftSetupResult{},(owner,text,title,icon)=>{},(owner,text,title)=>false,(preferred,target)=>{started=true;gate.WaitOne(5000);completed.Set();return new string[0];},target=>{},file=>{},target=>new CraftInstallationInfo{});
   using(form){
    form.Shown+=(s,e)=>pulse.Start();pulse.Tick+=(s,e)=>{try{if(++ticks>100)throw new Exception("Discovery close test timed out");if(started){Check(Find(form,"cancel").Enabled,"Read-only discovery disables exit");form.Close();Check(form.IsDisposed,"Read-only discovery blocks Close");}}catch(Exception error){failure=error;form.Dispose();}finally{if(form.IsDisposed){gate.Set();pulse.Stop();}}};
    Application.Run(form);gate.Set();Check(completed.WaitOne(5000),"Synthetic discovery did not finish");if(failure!=null)throw failure;
   }
  }
  Console.WriteLine("PASS read-only discovery allows close; late result is discarded");
 }

 static void RunCase(string buttonName,bool failFirst,bool cancelPreparation){
  int uiThread=Thread.CurrentThread.ManagedThreadId,calls=0,errors=0,ticks=0;bool released=false,retried=false,checkedBusy=false,started=false;Exception failure=null;
  string fixture=Path.Combine(Path.GetTempPath(),"craft-setup-ui-inert-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(fixture);string fixtureCraft=Path.Combine(fixture,"webgal-craft.exe"),fixtureAdapter=Path.Combine(fixture,"adapter"),fixtureCache=Path.Combine(fixture,"cache");File.WriteAllText(fixtureCraft,"inert fixture; never executed");
  string expectedAction=buttonName=="remove"?"uninstall":buttonName=="recover"?"recover-session":buttonName=="repair"?"repair":"install";
  using(var gate=new ManualResetEvent(false))using(var clock=new System.Windows.Forms.Timer{Interval=50}){
   var elapsed=Stopwatch.StartNew();Form form=null;
   form=CraftSetup.CreateForm((request,report)=>{
    int attempt=Interlocked.Increment(ref calls);Check(Thread.CurrentThread.ManagedThreadId!=uiThread,"Operation ran on UI thread");
    Check(request.Action==expectedAction&&request.Destination==fixtureAdapter&&request.Craft==fixtureCraft&&request.Mode=="same-name"&&request.Cache==fixtureCache,"Input snapshot changed");
    if(!cancelPreparation)request.BeginMutation();report("fixture phase "+attempt);Check(gate.WaitOne(10000),"UI did not release synthetic operation");
    if(cancelPreparation){bool cancelled=false;try{request.ThrowIfCancelled();}catch(OperationCanceledException){cancelled=true;}Check(cancelled,"Preparation did not receive cooperative cancellation");return new CraftSetupResult{Cancelled=true,Message="fixture cancelled"};}
    if(failFirst&&attempt==1)throw new InvalidOperationException("synthetic operation failure");
    return new CraftSetupResult{Message="fixture completed",Installed=expectedAction=="install"||expectedAction=="repair"};
   },(owner,message,title,icon)=>{Check(Thread.CurrentThread.ManagedThreadId==uiThread,"Dialog ran off UI thread");if(icon==MessageBoxIcon.Error){errors++;Check(message.Contains("synthetic operation failure"),"Failure detail missing");}},
    (owner,text,title)=>true,(preferred,destination)=>new string[0],destination=>{},file=>{},destination=>new CraftInstallationInfo{Exists=true,Valid=true,AdapterRoot=destination,CraftExe=fixtureCraft,Mode="same-name",Status="installed",Version="fixture",Message="fixture metadata"});
   using(form){
    var button=(Button)Find(form,buttonName);var status=(Label)Find(form,"status");var progress=(ProgressBar)Find(form,"progress");
    Action prepare=()=>{((CheckBox)Find(form,"advancedToggle")).Checked=true;Find(form,"targetPath").Text=fixtureAdapter;Find(form,"craftPath").Text=fixtureCraft;Find(form,"cachePath").Text=fixtureCache;};
    prepare();form.Shown+=(sender,e)=>{elapsed.Restart();ticks=0;clock.Start();};
    clock.Tick+=(sender,e)=>{try{
     ticks++;Check(elapsed.Elapsed.TotalSeconds<15,"Synthetic GUI timed out");
     if(!started&&ticks>=10){started=true;Check(button.Enabled,"Expected action was not available before click");button.PerformClick();}
     if(errors==1&&!retried){Check(failFirst,"Unexpected error");Check(!progress.Visible,"Failure left progress active");Check(Find(form,"install").Enabled&&Find(form,"targetPath").Enabled,"Failure did not unlock inputs");retried=true;released=false;checkedBusy=false;gate.Reset();prepare();elapsed.Restart();ticks=0;ForceClick(button);}
     if(!released&&calls>0){
      foreach(string name in new[]{"install","remove","repair","recover","craftPath","targetPath","cachePath","browseCraft","browseFolder","browseTarget","browseCache","findCraft","desktopShortcut","advancedToggle"})Check(!Find(form,name).Enabled,"Busy control enabled: "+name);
      if(!checkedBusy){checkedBusy=true;int before=calls;ForceClick(button);ForceClick(Find(form,"remove"));Check(calls==before,"Repeated activation started work");form.Close();Check(!form.IsDisposed&&form.Visible,"Close interrupted work");if(!cancelPreparation)Check(!Find(form,"cancel").Enabled,"Mutation still cancellable");}
      Find(form,"targetPath").Text="changed-after-dispatch";
      bool ready=status.Text.Contains("fixture phase "+calls)&&System.Text.RegularExpressions.Regex.IsMatch(status.Text,@"已用时 [1-9][0-9]* 秒");
      if(ready){Check(ticks>=10,"UI failed to pump during work");Check(progress.Visible&&progress.Style==ProgressBarStyle.Marquee,"Busy indicator missing");if(cancelPreparation){Check(Find(form,"cancel").Enabled,"Preparation cancellation unavailable");ForceClick(Find(form,"cancel"));}released=true;gate.Set();}
     }
     if(released&&!progress.Visible&&status.Text==(cancelPreparation?"fixture cancelled":"fixture completed")){Check(form.Visible,"Completion closed the manager");Check(calls==(failFirst?2:1)&&errors==(failFirst?1:0),"Unexpected call count");form.Close();}
    }catch(Exception error){failure=error;clock.Stop();gate.Set();form.BeginInvoke(new Action(()=>form.Dispose()));Application.ExitThread();}};
    Application.Run(form);clock.Stop();if(failure!=null)throw failure;Console.WriteLine("PASS "+buttonName+(failFirst?" failure/retry":cancelPreparation?" preparation cancel":" success"));
   }
  }
  Directory.Delete(fixture,true);
 }
}

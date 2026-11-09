using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using NativeVideo;

// Runs the production adapter, browser host, clock and timeline on supplied
// pinned engines. Instrumentation is confined to this test's owned snapshots.
public static class AutosavePlanningProbe {
 const string Guard="if(globalThis.__nativeAdapterInstalled===true)return;";
 static void Assert(bool value,string message){if(!value)throw new Exception(message);}
 [STAThread] public static int Main(string[] args){
  App.Args=args;Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
  var context=new ApplicationContext();var timer=new System.Windows.Forms.Timer{Interval=10};int code=0;
  timer.Tick+=async(s,e)=>{timer.Stop();try{await Run();}catch(Exception error){code=1;File.WriteAllText(App.Arg("--output")+".error.txt",error.ToString());}finally{context.ExitThread();}};
  timer.Start();Application.Run(context);timer.Dispose();return code;
 }
 static async Task Run(){
  string output=Files.Full(App.Arg("--output")),engine=App.Arg("--engine","webgal"),engineRoot=Files.Full(App.Arg("--engine-root"));
  Directory.CreateDirectory(Path.GetDirectoryName(output));
  var adapter=EngineAdapter.Select(J.O("project",engineRoot,"engineRoot",engineRoot,"settings",J.O("engine",engine)));
  string input=Path.Combine(engineRoot,adapter.Bundle),sourceHash=Files.Hash(input),raw=File.ReadAllText(input),patched=adapter.Patch(raw);
  Assert(Regex.Matches(patched,Regex.Escape(Guard)).Count==1,"One automatic-save guard required");
  int guardAt=patched.IndexOf(Guard,StringComparison.Ordinal),methodStart=patched.LastIndexOf("async function ",guardAt,StringComparison.Ordinal),methodEnd=patched.IndexOf("}const ",guardAt,StringComparison.Ordinal);
  Assert(methodStart>=0&&methodEnd>guardAt,"Pinned automatic-save function extraction failed");
  string method=patched.Substring(methodStart,methodEnd-methodStart+1),name=Regex.Match(method,@"async function ([\w$]+)\(").Groups[1].Value;
  Assert(method.Contains(".setFastSave(")&&method.Contains("(-1,!1)"),"Guard must precede quick-save state construction");
  var nativeMethod=method.Replace(Guard,"");Assert(raw.Contains(nativeMethod),"Non-export automatic-save body must remain byte-identical");
  var persistence=Regex.Match(raw,@"const ([\w$]+)=[\w$]+\.getState\(\)\.saveData\.quickSaveData;await ([\w$]+)\.setItem\(");
  Assert(persistence.Success,"Pinned quick-save persistence extraction failed");
  J.Write(output+".function.json",J.O("engine",adapter.Describe(),"native",nativeMethod,"guarded",method));
  if(App.Arg("--contract-only")=="true"){Files.Atomic(output+".patched.mjs",patched);J.Write(output,J.O("engine",adapter.Describe(),"sourceUnchanged",Files.Hash(input)==sourceHash,"functionContract",true));return;}
  int lines=int.Parse(App.Arg("--lines","550"));
  string script=string.Join("\n",Enumerable.Range(1,lines).Select(i=>"旁白:Planning regression "+i+"。;"));
  object expected=null;
  var results=new System.Collections.Generic.List<object>();
  // Alternating order reduces the effect of warm caches and transient load.
  int repeats=int.Parse(App.Arg("--repeats","2"));
  for(int iteration=0;iteration<repeats;iteration++)foreach(bool enabled in iteration%2==0?new[]{true,false}:new[]{false,true}){
   string run=output+".work/"+iteration+"-"+(enabled?"baseline":"fixed"),web=Path.Combine(run,"web");
   adapter.Prepare(web);
   Files.Atomic(Path.Combine(web,"game/config.txt"),"Game_name:Autosave planning regression;\nDefault_Language:zh_CN;\nStage_Width:1920;\nStage_Height:1080;\n");
   Files.Atomic(Path.Combine(web,"game/animation/animationTable.json"),"[]");
   Files.Atomic(Path.Combine(web,"game/userStyleSheet.css"),"");
   Files.Atomic(Path.Combine(web,"game/scene/start.txt"),":Fixture ready;");
   string instrumented=method.Replace("(){","(){globalThis.__autosaveMetrics.calls++;const __saveBegan=globalThis.__autosaveRealNow();").Replace(Guard,enabled?"":"if(globalThis.__nativeAdapterInstalled===true){globalThis.__autosaveMetrics.suppressed++;return;}");
   instrumented=instrumented.Replace(",await ",";globalThis.__autosaveMetrics.syncMs+=globalThis.__autosaveRealNow()-__saveBegan;await ");
   string persistenceProbe=persistence.Value.Replace(";await ",";if("+persistence.Groups[1].Value+"!=null)globalThis.__autosaveMetrics.writes++;await ");
   string testBundle=patched.Replace(method,instrumented).Replace(persistence.Value,persistenceProbe)+"\n;globalThis.__autosaveNative="+name+";\n";
   Files.Atomic(Path.Combine(web,adapter.Bundle),testBundle);
   using(var browser=new BrowserHost(960,540)){
    await browser.Start(Path.Combine(run,"profile"));
    await browser.View.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("globalThis.__autosaveRealNow=performance.now.bind(performance);globalThis.__autosaveMetrics={calls:0,suppressed:0,writes:0,syncMs:0};");
    var startup=J.O("language",0,"code","zh_CN","source","preview");
    await browser.InstallClock(false,false,startup);await browser.Navigate(web);await browser.VerifyRuntimeStartup(startup);
    await browser.RunFile("settings.js");await browser.Eval("__lockExportSettings({textSpeed:100,autoSpeed:100})");
    await browser.RunFile("timeline.js");
    var policy=J.O("renderDuringPlan",false,"captureDialogue",false,"mode","auto","holdMs",1000,"textSpeed",100,"autoSpeed",100,"durations",J.O(),"fps",30,"notendVisualTail",true);
    var watch=Stopwatch.StartNew();
    var timeline=await browser.Eval("__createNativeTimeline("+J.Text(J.O("script",script,"policy",policy))+")",240000);
    watch.Stop();await Task.Delay(200);
    var metrics=await browser.Eval("({...__autosaveMetrics,quickSavePresent:__wgProbe.store.getState().saveData.quickSaveData!==null})");
    Assert(browser.Errors.Count==0,"Unexpected browser errors: "+string.Join("; ",browser.Errors));
    Assert(J.N(metrics,"calls")>0,"Fixture must exercise autosave throttle");
    J.Write(output+"."+iteration+"-"+(enabled?"baseline":"fixed")+".metrics.json",metrics);
    Assert(enabled?J.N(metrics,"writes")>0&&J.B(metrics,"quickSavePresent"):J.N(metrics,"writes")==0&&!J.B(metrics,"quickSavePresent")&&J.N(metrics,"suppressed")>0,"Automatic-save suppression contract failed: "+J.Text(metrics));
    if(expected==null)expected=timeline;else Assert(J.Text(timeline)==J.Text(expected),"Autosave changed timeline events, timing, options or stage-exit metadata");
    // A native save remains callable when the export marker is absent.
    if(!enabled){await browser.Eval("globalThis.__nativeAdapterInstalled=false;__autosaveNative()");Assert(J.B(await browser.Eval("({saved:__wgProbe.store.getState().saveData.quickSaveData!==null})"),"saved"),"Normal automatic save was disabled outside export");}
    var result=J.O("iteration",iteration,"autosaveEnabled",enabled,"planningWallMs",watch.Elapsed.TotalMilliseconds,"metrics",metrics,"durationMs",J.N(timeline,"durationMs"),"timelineHash",Files.HashText(J.Text(timeline)),"webview2",browser.Runtime,"errors",browser.Errors.ToArray());
    results.Add(result);J.Write(output,J.O("engine",adapter.Describe(),"lines",lines,"results",results.ToArray(),"sourceUnchanged",Files.Hash(input)==sourceHash));
   }
  }
  Assert(Files.Hash(input)==sourceHash,"Original engine was changed");
 }
}

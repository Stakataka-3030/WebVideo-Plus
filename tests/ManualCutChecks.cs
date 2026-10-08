using System;using System.Linq;
namespace NativeVideo {
 public static class ManualCutChecks {
  static int checks;
  static void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
  static void Reject(Action action,string message){bool failed=false;try{action();}catch(ArgumentException){failed=true;}catch(OverflowException){failed=true;}Check(failed,message);}
  static object SettingsFor(string text){return Settings.Validate(J.O("segmentCutMode","manual","manualCutPoints",text));}
  static void Cuts(string text,int fps,params int[] expected){Check(ManualCuts.Parse(text,fps).SequenceEqual(expected),"Unexpected normalized cuts: "+text+" @ "+fps);}
  public static int Run(){
   checks=0;
   Check(J.S(Settings.Validate(null),"compatibilityCaptureFormat")=="jpeg","Existing preferences must keep JPEG");
   Check(J.S(Settings.Validate(J.O("compatibilityCaptureFormat","PNG")),"compatibilityCaptureFormat")=="png","PNG normalization failed");
   Check(CompatibilityCapture.Decoder("png")=="png"&&CompatibilityCapture.Decoder("jpeg")=="mjpeg","Capture decoder mismatch");
   Reject(()=>Settings.Validate(J.O("compatibilityCaptureFormat","webp")),"Unsupported compatibility capture was accepted");
   var captureRoundtrip=Settings.Validate(J.Parse(J.Text(Settings.Validate(J.O("compatibilityCaptureFormat","png","gpuRawMode","traditional")))));
   Check(J.S(captureRoundtrip,"compatibilityCaptureFormat")=="png","PNG setting did not survive serialization");
   Check(!ManualCuts.Enabled(Settings.Validate(null)),"Old settings must remain automatic");
   Check(!ManualCuts.Enabled(Settings.Validate(J.O("mode","manual"))),"Playback mode is independent from cut mode");
   Check(J.S(Settings.Validate(J.O("manualCutPoints","invalid but inactive")),"manualCutPoints")=="invalid but inactive","Auto mode must preserve inactive input");
   var audioRequest=Settings.Validate(J.O("segmentCutMode","auto","manualCutPoints","inactive input"));
   var previousVideo=SettingsFor("1s, 60");
   var savedAudio=ManualCuts.SavedPreferences(audioRequest,previousVideo,true);
   Check(J.S(savedAudio,"segmentCutMode")=="manual"&&J.S(savedAudio,"manualCutPoints")=="1s, 60","Audio queue lost stored video cut preferences");
   Check(J.S(audioRequest,"segmentCutMode")=="auto"&&J.S(audioRequest,"manualCutPoints")=="inactive input","Preference save mutated the queued audio request");
   Check(J.S(ManualCuts.SavedPreferences(audioRequest,previousVideo,false),"segmentCutMode")=="auto","Video queue failed to save new cut mode");
   var persisted=Settings.Validate(J.Parse(J.Text(SettingsFor("300, 1.01s"))));
   Check(ManualCuts.Enabled(persisted)&&J.S(persisted,"manualCutPoints")=="300, 1.01s","Settings/request JSON roundtrip lost manual configuration");
   Reject(()=>Settings.Validate(J.O("segmentCutMode","other")),"Unknown mode accepted");
   Reject(()=>Settings.Validate(J.O("manualCutPoints",new object[]{1})),"Non-text points accepted");
   Reject(()=>SettingsFor("nope"),"Manual input must be validated before queueing");
   Cuts("",30);Cuts(" ,， \n\t",60);
   Cuts("300, 1s，30f 00:02 1.01s 300F",30,30,31,60,300);
   Cuts("1.01s 01:02.5 01:02:03.5",60,61,3750,223410);
   Cuts("0.1s 0.10000000001s",30,3);
   Cuts("0.10001s 0.0001s",30,1,4);
   foreach(var input in new[]{"0","0s","00:00","-1","1.5","1e3","NaNs","Infinitys","1:60","1:60:00","1:02:60","2147483648","999999999999999999999999999999s","1;2","1:2","1s junk"})Reject(()=>ManualCuts.Parse(input,30),"Invalid input accepted: "+input);
   Reject(()=>ManualCuts.Resolve(SettingsFor("90"),30,90),"Output endpoint accepted");
   Reject(()=>ManualCuts.Resolve(SettingsFor("91"),30,90),"Beyond-end cut accepted");
   Check(ManualCuts.Resolve(SettingsFor("89"),30,90).Single()==89,"Last interior frame rejected");
   var plan=J.O("strictSegmentCuts",true,"events",new object[]{J.O("command","say","line",1,"atMs",20000),J.O("command","changeBg","line",2,"atMs",25000)},"replayWindows",new object[]{J.O("startMs",0,"endMs",1000000,"command","pixiPerform","rootReplay",true,"noCut",true),J.O("startMs",0,"endMs",1000000,"command","random-state","rootReplay",true,"noCut",true),J.O("startMs",0,"endMs",1000000,"command","interaction","rootReplay",true,"noCut",true),J.O("startMs",0,"endMs",1000000,"command","setTempAnimation","noCut",true)},"singleLineHints",new object[]{J.O("startMs",0,"endMs",1000000)},"live2dLifetimes",new object[]{J.O("startMs",0,"endMs",1000000)},"softCutWindows",new object[]{J.O("startMs",0,"endMs",1000000)});
   var bounds=J.O("startFrame",12000,"endFrame",12300);
   var settings=SettingsFor("299, 1, 100, 00:03, 100f");
   foreach(int workers in new[]{1,2,32}){
    var ranges=VideoWorkflow.Segments(plan,bounds,30,workers,settings);
    Check(ranges.Select(r=>(int)J.N(r,"startFrame")).SequenceEqual(new[]{12000,12001,12090,12100,12299}),"Manual boundaries changed by safety/worker settings");
    Check(ranges.Last()["endFrame"].Equals(12300),"Wrong final endpoint");
    Check(ranges.Sum(r=>J.N(r,"endFrame")-J.N(r,"startFrame"))==300,"Gaps or overlap in emitted frames");
    Check(ranges.All(r=>J.N(r,"replayFrame")==0),"Best-effort root replay was lost");
    Check(J.N(J.Get(plan,"segmentDiagnostics"),"rawReplayRatio")>100,"Fixture no longer exceeds replay-cost budget");
    Check(J.N(J.Get(plan,"segmentDiagnostics"),"effectiveWorkers")==Math.Min(workers,5),"Concurrency was confused with task count");
    Check(J.N(J.Get(plan,"segmentDiagnostics"),"automaticCutsAdded")==0,"Automatic cuts were added");
    Check(J.A(J.Get(J.Get(plan,"segmentDiagnostics"),"manualCutFrames")).Select(Convert.ToInt32).SequenceEqual(new[]{1,90,100,299}),"Relative sidecar frames changed");
   }
   var empty=VideoWorkflow.Segments(plan,bounds,30,32,SettingsFor(""));
   Check(empty.Length==1&&J.N(empty[0],"startFrame")==12000&&J.N(empty[0],"endFrame")==12300,"Empty manual input must stay single-part");
   Check(J.S(J.Get(plan,"segmentDiagnostics"),"reductionReason")=="manual-cut-count","Manual worker reduction mislabeled");
   var shortRanges=VideoWorkflow.Segments(J.O(),J.O("startFrame",0,"endFrame",3),30,1,SettingsFor("2,1"));
   Check(shortRanges.Length==3,"Minimum auto segment duration was applied to manual cuts");
   Check(shortRanges.All(r=>J.N(r,"endFrame")-J.N(r,"startFrame")==1),"Single-frame manual parts are invalid");
   var autoPlan=J.O("events",new object[]{J.O("line",1,"command","say","script","A:a;","atMs",10000),J.O("line",2,"command","say","script","B:b;","atMs",20000)});
   Check(VideoWorkflow.Segments(autoPlan,J.O("startFrame",0,"endFrame",900),30,2,Settings.Validate(null)).Length==2,"Automatic mode regressed");
   var exact=VideoWorkflow.Segments(autoPlan,J.O("startFrame",0,"endFrame",900),30,32,SettingsFor("123"));
   Check(exact.Length==2&&J.N(exact[0],"endFrame")==123,"Semantic auto candidates inserted into manual mode");
   var timing=J.O("durationSeconds",60,"storyTimeline",J.O("currentStartSeconds",10,"currentEndSeconds",30),"lineTimes",new object[]{10000,12000,15000});
   foreach(string scope in new[]{"full","fromScene","sceneOnly"}){
    var scopedBounds=VideoWorkflow.Bounds(timing,null,30,scope);
    var scoped=VideoWorkflow.Segments(J.O(),scopedBounds,30,4,SettingsFor("1s"));
    Check(J.N(scoped[0],"endFrame")==J.N(scopedBounds,"startFrame")+30,"Cut origin changed for "+scope);
   }
   var selectedBounds=VideoWorkflow.Bounds(timing,J.O("startLine",1,"endLine",1),30,"full");
   var selected=VideoWorkflow.Segments(J.O(),selectedBounds,30,4,SettingsFor("1s"));
   Check(J.N(selected[0],"startFrame")==300&&J.N(selected[0],"endFrame")==330&&J.N(selected[1],"endFrame")==360,"Selected-line output origin or endpoint is wrong");
   var statementPlan=new System.Collections.Generic.Dictionary<string,object>(J.D(plan));
   statementPlan["statementCuts"]=J.O("candidates",new object[]{J.O("source","marker","atMs",399000),J.O("source","marker","atMs",400000),J.O("source","selection","atMs",401010),J.O("source","marker","atMs",401010),J.O("source","marker","atMs",409999),J.O("source","marker","atMs",410000),J.O("source","marker","atMs",411000)},"warnings",new object[]{J.O("code","marker-no-target")});
   var statementRanges=VideoWorkflow.Segments(statementPlan,bounds,30,1,SettingsFor(""));
   Check(statementRanges.Length==2&&J.N(statementRanges[0],"endFrame")==12031,"Statement + marker union must keep the exact rounded boundary even inside unsafe windows");
   var resolution=J.Get(J.Get(statementPlan,"segmentDiagnostics"),"statementCuts");var resolved=J.A(J.Get(resolution,"candidates"));
   Check(resolved.Select(row=>J.S(row,"outcome")).SequenceEqual(new[]{"outside-range","output-start","selected","duplicate-frame","output-end","output-end","outside-range"}),"Statement scope/endpoint diagnostics are wrong");
   Check(J.A(J.Get(resolution,"warnings")).Count==1,"Marker no-op warnings were lost");
   Check(J.N(J.Get(statementPlan,"segmentDiagnostics"),"effectiveWorkers")==1,"Manual statement task count changed concurrency");
   var numericAndStatements=VideoWorkflow.Segments(statementPlan,bounds,30,32,SettingsFor("31,100"));
   Check(numericAndStatements.Length==3&&J.N(numericAndStatements[1],"endFrame")==12100,"Legacy CLI/API cuts must union and deduplicate with statement candidates");
   statementPlan["statementCuts"]=J.O("candidates",new object[]{J.O("source","marker","atMs",400000),J.O("source","marker","atMs",410000)});
   Check(VideoWorkflow.Segments(statementPlan,bounds,30,32,SettingsFor("")).Length==1,"Endpoint-only markers must not cause an automatic fallback");
   autoPlan["statementCuts"]=J.O("candidates",new object[]{J.O("atMs",double.NaN)});
   Check(VideoWorkflow.Segments(autoPlan,J.O("startFrame",0,"endFrame",900),30,2,Settings.Validate(null)).Length==2,"Auto mode must ignore statement/marker cuts completely");
   return checks;
  }
 }
}

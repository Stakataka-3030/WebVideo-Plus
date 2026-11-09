using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Reflection;using System.Text.RegularExpressions;using System.Threading.Tasks;
namespace NativeVideo {
 public static class SceneOnlyTailChecks {
  static int checks;static string home,project;static readonly List<string> parses=new List<string>();
  static void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
  static void Reject(Action action,string message){bool rejected=false;try{action();}catch(IOException){rejected=true;}catch(ArgumentException){rejected=true;}Check(rejected,message);}
  static void Put(string file,string value){Files.Atomic(Path.Combine(project,file),value);}
  // Scanner/chain inputs only. The separate exact-engine Node oracle tests
  // forwarding and preload collection without substituting those functions.
  static object Parse(string source){
   var rows=new List<object>();var lines=source.Split('\n');
   for(int i=0;i<lines.Length;i++){
    string raw=lines[i].Trim(),command="comment",content="";var args=new List<object>();
    if(raw!=""&&!raw.StartsWith(";")){
     int colon=raw.IndexOf(':');command=colon<0?raw.TrimEnd(';'):raw.Substring(0,colon);content=colon<0?"":raw.Substring(colon+1).TrimEnd(';');
     foreach(Match m in Regex.Matches(content,@"\s-([A-Za-z]\w*)(?:=([^\s;]+))?"))args.Add(J.O("key",m.Groups[1].Value,"value",m.Groups[2].Success?(object)m.Groups[2].Value:true));
     content=Regex.Split(content,@"\s-[A-Za-z]")[0];
     if(command=="A")command="say";
    }
    rows.Add(J.O("command",command=="say"?0:1,"commandRaw",command,"content",content,"args",args.ToArray(),"startLine",i,"endLine",i));
   }
   return J.O("sentenceList",rows.ToArray());
  }
  static object Build(string scene){return SceneChain.BuildTimeline(scene,Path.Combine(project,"game/scene"),(source,name)=>{parses.Add(name);return Task.FromResult(Parse(source));}).GetAwaiter().GetResult();}
  static object Request(string scene="middle.txt",string scope="sceneOnly"){return J.O("scene",scene,"storyScope",scope);}
  static object Limit(object chain,object request=null,string mode="auto"){return SceneChain.LimitPlanningTail(chain,request??Request(),J.O("mode",mode));}
  static object Copy(object value){return J.Parse(J.Text(value));}
  static ProjectAssets Assets(string script){
   var ctor=typeof(EngineAdapter).GetConstructors(BindingFlags.Instance|BindingFlags.NonPublic).Single();
   object[] required={"webgal","4.6.4",project,"unused.js","unit-test"};
   var adapter=(EngineAdapter)ctor.Invoke(ctor.GetParameters().Select((parameter,index)=>index<required.Length?required[index]:parameter.DefaultValue).ToArray());
   return new ProjectAssets(project,Path.Combine(home,"snapshot-"+Guid.NewGuid().ToString("N")),project,script,null,adapter);
  }
  public static int Run(string directory,string fixtures){
   home=directory;project=Path.Combine(home,"project");checks=0;
   const string before="changeBg:before.png;\nA:history;\nchangeScene:middle.txt;\nA:unreachable;";
   const string selected="A:target;\nwait:0;\nchangeScene:after.txt;\n; target trailing comment";
   const string after="changeFigure:missing-tail.png;\nplayVideo:missing-tail.mp4;\nA:later;";
   Put("game/scene/start.txt",before);Put("game/scene/middle.txt",selected);Put("game/scene/after.txt",after);Put("game/background/before.png","synthetic scanner image");
   object chain=Build("middle.txt");string original=J.Text(chain);object limited=Limit(chain);string script=J.S(limited,"script");int end=(int)J.N(J.Get(limited,"planningTail"),"boundaryLine");
   Check(J.Text(chain)==original,"Limiting mutated the full graph");
   Check(script==string.Join("\n",J.S(chain,"script").Split('\n').Take(end))+"\n; WebVideo+ scene-only boundary","Prefix bytes or end boundary changed");
   Check(end==before.Split('\n').Length+selected.Split('\n').Length,"Wrong target boundary");
   Check(J.A(J.Get(limited,"scenes")).Count==2&&J.N(J.Get(limited,"planningTail"),"omittedScenes")==1,"Wrong scene metadata");
   Check(J.Text(J.A(J.Get(chain,"originMap")).Take(end))==J.Text(J.A(J.Get(limited,"originMap")).Take(end)),"Previous/target line identity changed");
   Check(J.B(J.A(J.Get(limited,"originMap")).Last(),"synthetic")&&J.S(J.A(J.Get(limited,"originMap")).Last(),"scene")=="after.txt","Sentinel must have a valid, explicitly synthetic boundary origin");
   Check(J.S(chain,"dependencyHash")==J.S(limited,"dependencyHash"),"Graph cache signature changed");
   Check(parses.Contains("after.txt"),"Graph text discovery must remain explicit and intact");
   Check(J.Text(J.Get(chain,"graphScenes"))==J.Text(J.Get(limited,"graphScenes")),"Graph metadata was discarded");
   Check(J.A(J.Get(limited,"flattened")).Count==2,"Target transfer marker removed");
   foreach(string mode in new[]{"auto","manual"})Check(J.Get(Limit(chain,null,mode),"planningTail")!=null,"Expected eligible mode: "+mode);
   Check(object.ReferenceEquals(chain,Limit(chain,null,"bgm")),"BGM timing dependency must fall back");
   var music=J.D(Request());music["musicTimeline"]=J.O("tracks",new object[]{J.O("startSeconds",300,"durationSeconds",2)});Check(object.ReferenceEquals(chain,Limit(chain,music)),"Custom music timeline can change the global limiter and must fall back");
   foreach(string scope in new[]{"full","fromScene"})Check(object.ReferenceEquals(chain,Limit(chain,Request("middle.txt",scope))),"Changed "+scope);
   var range=J.D(Request());range["range"]=J.O("startLine",1,"endLine",2);Check(object.ReferenceEquals(chain,Limit(chain,range)),"Range precedence changed");
   var analysis=J.D(Request());analysis["analysisOnly"]=true;Check(object.ReferenceEquals(chain,Limit(chain,analysis)),"Analysis must retain full story");
   Check(object.ReferenceEquals(chain,Limit(chain,Request("absent.txt"))),"Absent target must not trim another scene");
   Check(object.ReferenceEquals(chain,Limit(chain,Request("after.txt"))),"Final scene natural ending changed");
   var outsideCut=J.D(Request());outsideCut["manualCutStatements"]=new object[]{J.O("scene","after.txt","line",2,"sourceHash",J.S(J.A(J.Get(chain,"scenes")).Last(),"hash"))};
   Check(object.ReferenceEquals(chain,Limit(chain,outsideCut)),"Outside-range statement cut must retain its validation/ignore contract");
   Check(J.Get(Limit(chain,Request("./game/scene/MIDDLE.TXT")),"planningTail")!=null,"Canonical/case-insensitive scene failed");
   var bad=J.D(Copy(chain));bad["originMap"]=J.A(J.Get(bad,"originMap")).Skip(1).ToArray();Reject(()=>Limit(bad),"Bad line map accepted");
   bad=J.D(Copy(chain));J.D(J.A(J.Get(bad,"originMap")).Last())["scene"]="middle.txt";Reject(()=>Limit(bad),"Noncontiguous target accepted");

   var fullAssets=Assets(J.S(chain,"script"));var fullReport=fullAssets.Scan(Parse(J.S(chain,"script")));
   Check(J.A(J.Get(fullReport,"issues")).Any(x=>J.S(x,"file").Contains("missing-tail")),"Control full scan did not inspect tail");
   var assets=Assets(script);var report=assets.Scan(Parse(script));
   Check(J.A(J.Get(report,"issues")).Count==0,"Tail assets reached limited scanner");
   Check(J.N(report,"checkedFiles")==1,"Predecessor image must still be inspected");
   Directory.CreateDirectory(Path.Combine(assets.Root,"game/animation"));assets.Snapshot().GetAwaiter().GetResult();
   Check(File.ReadAllText(Path.Combine(assets.Root,"game/background/before.png"))=="synthetic scanner image","Predecessor image omitted from snapshot");
   Check(!Directory.Exists(Path.Combine(assets.Root,"game/figure"))&&!Directory.Exists(Path.Combine(assets.Root,"game/video")),"Tail resource snapshot was prepared");
   File.Delete(Path.Combine(project,"game/background/before.png"));var missing=Assets(script).Scan(Parse(script));
   Check(J.A(J.Get(missing,"issues")).Any(x=>J.S(x,"file")=="background/before.png"),"Predecessor missing asset no longer blocks");

   // The sentinel carries the raw boundary; output still uses existing frame
   // rounding. Zero-time tail lines and a non-frame-aligned end remain exact.
   var times=Enumerable.Range(0,end+1).Select(i=>(object)(i<4?0:i<end?1010:2037)).ToArray();
   var timing=J.O("durationSeconds",Math.Ceiling(2037*30d/1000)/30,"lineTimes",times);
   var cuts=StatementCuts.Collect(script,Parse(script),timing,limited,null);
   Check(J.A(J.Get(cuts,"candidates")).All(c=>J.S(c,"targetScene")!="after.txt"),"Synthetic boundary became a statement cut");
   SceneChain.AttachTimeline(timing,limited,"middle.txt");var story=J.Get(timing,"storyTimeline");
   Check(J.N(story,"currentStartSeconds")==1.01&&J.N(story,"currentEndSeconds")==2.037,"Raw source boundary lost to frame rounding");
   var bounds=VideoWorkflow.Bounds(timing,null,30,"sceneOnly");Check(J.N(bounds,"startFrame")==31&&J.N(bounds,"endFrame")==62,"Scene output frame bounds changed");
   var legacyTiming=J.O("durationSeconds",5,"lineTimes",times.Concat(new object[]{3000,4000}).ToArray());SceneChain.AttachTimeline(legacyTiming,chain,"middle.txt");
   Check(J.Text(VideoWorkflow.Bounds(legacyTiming,null,30,"sceneOnly"))==J.Text(bounds),"Limited bounds differ from full-story crop");
   var invalidTiming=J.O("durationSeconds",3,"lineTimes",times.Take(end).ToArray());Reject(()=>SceneChain.AttachTimeline(invalidTiming,limited,"middle.txt"),"Missing sentinel event silently accepted");
   foreach(int fps in new[]{24,30,60,120})foreach(double raw in new[]{61*1000d/fps,1016.4,1016.5,2037d}){
    var result=J.O("durationMs",raw,"events",new object[]{J.O("index",end,"atMs",raw,"command","comment")});SceneChain.AlignPlanningTailDuration(result,limited);
    double rounded=Math.Floor(raw+.5);Check(J.N(result,"durationMs")==Math.Max(raw,rounded),"Duration padding must match JS Math.round without retiming");
    var roundedTimes=Enumerable.Repeat((object)0,end).Concat(new object[]{rounded}).ToArray();
    var shortTiming=J.O("durationSeconds",Math.Ceiling(J.N(result,"durationMs")*fps/1000)/fps,"lineTimes",roundedTimes);
    var fullTiming=J.O("durationSeconds",10,"lineTimes",roundedTimes.Concat(new object[]{rounded+1000,rounded+2000}).ToArray());
    SceneChain.AttachTimeline(shortTiming,limited,"middle.txt");SceneChain.AttachTimeline(fullTiming,chain,"middle.txt");
    Check(J.Text(VideoWorkflow.Bounds(shortTiming,null,fps,"sceneOnly"))==J.Text(VideoWorkflow.Bounds(fullTiming,null,fps,"sceneOnly")),"Fractional-frame boundary lost a frame at "+fps+" fps / "+raw+" ms");
   }
   var untouchedResult=J.O("durationMs",1016.5);SceneChain.AlignPlanningTailDuration(untouchedResult,chain);Check(J.N(untouchedResult,"durationMs")==1016.5,"Full-story result was padded");
   var zeroResult=J.O("durationMs",0,"events",new object[]{J.O("index",end,"atMs",0,"command","comment")});SceneChain.AlignPlanningTailDuration(zeroResult,limited);Check(J.N(zeroResult,"durationMs")==0,"Zero-time scene gained an artificial hold");
   Reject(()=>SceneChain.AlignPlanningTailDuration(J.O("durationMs",1000,"events",new object[0]),limited),"Missing boundary marker silently padded");
   var zeroTimes=Enumerable.Repeat((object)1000,end+1).ToArray();var emptyTiming=J.O("durationSeconds",1,"lineTimes",zeroTimes);SceneChain.AttachTimeline(emptyTiming,limited,"middle.txt");
   Reject(()=>VideoWorkflow.Bounds(emptyTiming,null,30,"sceneOnly"),"Zero-duration selected scene must not invent a hold");
   foreach(int workers in new[]{1,2,4,8}){
    var plan=J.O("events",new object[0],"replayWindows",new object[]{J.O("startMs",0,"endMs",2067,"rootReplay",true,"kind","history")});
    var parts=VideoWorkflow.Segments(plan,bounds,30,workers,J.O("segmentCutMode","manual","manualCutPoints","0.2s,0.5s"));
    Check(parts.Sum(p=>J.N(p,"endFrame")-J.N(p,"startFrame"))==31,"Worker frame coverage changed");
    Check(parts.All(p=>J.N(p,"replayFrame")==0),"Worker predecessor replay anchor changed");
   }

   foreach(string command in new[]{"choose","jumpLabel","callScene","return","if"}){
    Put("game/scene/middle.txt",command+":branch;\nchangeScene:after.txt;");var control=Build("middle.txt");var unchanged=Limit(control);
    Check(object.ReferenceEquals(control,unchanged),"Dynamic control unexpectedly flattened: "+command);
    Check(J.A(J.Get(Assets(J.S(unchanged,"script")).Scan(Parse(J.S(unchanged,"script"))),"issues")).Any(x=>J.S(x,"kind")=="unsupported"),"Existing control rejection lost: "+command);
   }
   Put("game/scene/middle.txt","end:;\nchangeScene:after.txt;");var terminal=Build("middle.txt");Check(object.ReferenceEquals(terminal,Limit(terminal)),"Explicit end was replaced");
   Put("game/scene/middle.txt",selected);Put("game/scene/after.txt","changeScene:start.txt;");Reject(()=>Build("middle.txt"),"Existing loop rejection lost");
   Put("game/scene/after.txt","choose:only-after-target:label;");var suffixControl=Build("middle.txt");var prefixOnly=Limit(suffixControl);
   Check(J.Get(prefixOnly,"planningTail")!=null&&!J.A(J.Get(Assets(J.S(prefixOnly,"script")).Scan(Parse(J.S(prefixOnly,"script"))),"issues")).Any(x=>J.S(x,"file")=="choose"),"An unsupported command solely after the target must not block its export");
   Put("game/scene/after.txt",after);Put("game/scene/middle.txt","changeScene:absent.txt;");Reject(()=>Build("middle.txt"),"Missing transition target validation lost");
   foreach(string source in new[]{"","; only comments","wait:0;\nchangeScene:after.txt;","changeScene:after.txt;"}){
    Put("game/scene/middle.txt",source);var small=Build("middle.txt");var shortened=Limit(small);
    Check(source.Contains("changeScene")?J.Get(shortened,"planningTail")!=null:object.ReferenceEquals(small,shortened),"Empty/zero-time scene handling changed");
   }
   if(!string.IsNullOrWhiteSpace(fixtures))J.Write(Path.GetFullPath(fixtures),J.O("full",chain,"limited",limited));
   return checks;
  }
 }
}

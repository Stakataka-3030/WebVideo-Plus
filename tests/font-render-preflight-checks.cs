using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using NativeVideo;

// Synthetic model metadata only. No proprietary SDK is supplied, loaded, or
// imitated. Missing-library descriptors inject the scanner's unit-test input;
// font-render-native.ps1 separately exercises real Skeleton/browser/export.
public static class FontPreflightChecks {
 static string home,project;
 static int count;
 static readonly string[] Both={"live2d.min.js","live2dcubismcore.min.js"};
 static void Assert(bool value,string message){if(!value)throw new Exception(message);}
 static void Put(string relative,string content){Files.Atomic(Path.Combine(project,relative),content);}
 static object Parse(string source){
  var lines=source.Replace("\r","").Split('\n');var sentences=new List<object>();
  for(int i=0;i<lines.Length;i++){
   var line=lines[i].Trim();if(line==""||line.StartsWith(";")){sentences.Add(J.O("isLineBreakHolder",true,"startLine",i,"endLine",i));continue;}
   int colon=line.IndexOf(':');string command=colon<0?"say":line.Substring(0,colon),content=colon<0?line:line.Substring(colon+1).TrimEnd(';');var args=new List<object>();
   foreach(Match match in Regex.Matches(content,@"\s-([A-Za-z]\w*)(?:=([^\s;]+))?"))args.Add(J.O("key",match.Groups[1].Value,"value",match.Groups[2].Success?(object)match.Groups[2].Value:true));
   content=Regex.Split(content,@"\s-[A-Za-z]")[0];
   // The pinned runtime's resource URL parser normalizes `none` to empty.
   if(command=="changeFigureDiff"&&content=="none")content="";
   if(!new[]{"changeFigure","changeFigureDiff","miniAvatar","changeBg","setAnimation","changeScene","callScene","return","end","customModel"}.Contains(command))command="say";
   sentences.Add(J.O("command",command=="say"?0:1,"commandRaw",command,"content",content,"args",args.ToArray(),"startLine",i,"endLine",i));
  }
  return J.O("sentenceList",sentences.ToArray());
 }
 static ProjectAssets NewAssets(string source,bool mygo=false,string[] available=null,string engine=null){
  // Scanner unit inputs explicitly select a capability profile; adapter identity
  // itself is exercised by the independent exact-runtime selection harness.
  var ctor=typeof(EngineAdapter).GetConstructors(BindingFlags.Instance|BindingFlags.NonPublic).Single();
  var adapter=(EngineAdapter)ctor.Invoke(new object[]{mygo?"mygo":"webgal",mygo?"3.2.1":"4.6.5",project,"unused.js","unit-test",false,false,null,null,false});
  var assets=new ProjectAssets(project,Path.Combine(home,"snapshot-"+Guid.NewGuid().ToString("N")),engine??project,source,null,adapter);
  var libraries=(List<object>)typeof(ProjectAssets).GetField("libraries",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(assets);
  foreach(string name in Both)libraries.Add(J.O("name",name,"found",available!=null&&available.Contains(name)));
  return assets;
 }
 static object Check(string name,string source,bool expectedModels,Action arrange=null,bool expectedMissing=false,bool mygo=false,string[] available=null,Action<ProjectAssets,object> verify=null){
  project=Path.Combine(home,"case-"+count);Directory.CreateDirectory(Path.Combine(project,"game/scene"));
  if(arrange!=null)arrange();var assets=NewAssets(source,mygo,available);var report=assets.Scan(Parse(source));
  var required=J.A(J.Get(report,"issues")).Where(x=>J.S(x,"kind")=="environment").Select(x=>J.S(x,"file")).OrderBy(x=>x).ToArray();
  Assert(required.SequenceEqual((expectedModels?Both:new string[0]).Except(available??new string[0]).OrderBy(x=>x)),name+": wrong SDK requirements: "+string.Join(",",required));
  if(expectedMissing)Assert(J.A(J.Get(report,"issues")).Any(x=>J.S(x,"kind")=="missing"),name+": missing asset error was lost");
  if(verify!=null)verify(assets,report);
  count++;Console.WriteLine("PASS "+name);return report;
 }
 static void IssueKinds(object report,params string[] expected){
  var actual=J.A(J.Get(report,"issues")).Select(x=>J.S(x,"kind")).Distinct().OrderBy(x=>x).ToArray();
  Assert(actual.SequenceEqual(expected.Distinct().OrderBy(x=>x)),"Unexpected issue kinds: "+string.Join(",",actual));
 }
 static void ImageSnapshot(ProjectAssets assets,object report,string relative,string expected){
  IssueKinds(report);Assert(J.N(report,"checkedFiles")==1,"Image diff resource was not inspected exactly once");
  assets.Snapshot().GetAwaiter().GetResult();
  Assert(File.ReadAllText(Path.Combine(assets.Root,relative))==expected,"Image diff resource was not copied into the export snapshot");
  Assert(File.ReadAllText(Path.Combine(project,relative))==expected,"Image diff scanning mutated the project resource");
 }
 public static int Main(string[] args){
  try{if(args.Length!=1)throw new ArgumentException("Pass the original package root");int passed=Run(args[0]);Console.WriteLine("Live2D preflight checks passed: "+passed);return 0;}
  catch(Exception error){Console.Error.WriteLine(error);return 1;}
 }
 public static int Run(string package){
  home=Path.Combine(Path.GetTempPath(),"webvideo-model-preflight-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(home);string oldRoot=Files.Root;Files.Root=Path.GetFullPath(package);count=0;
  try{
   var pluginPath=Path.Combine(Files.Root,"runtime/web/assets/index.es-erQsk_Nn.js");if(!File.Exists(pluginPath))pluginPath=Path.Combine(Files.Root,"runtime/web/assets/index.es-0XzJiDJZ.js");
   var plugin=File.ReadAllText(pluginPath);
   Assert(plugin.Contains("if(!window.Live2D)throw")&&plugin.Contains("if(!window.Live2DCubismCore)throw"),"Pinned combined plugin no longer requires both SDK globals; review scanner contract");
   Check("plain dialogue needs no SDK","Narrator:hello;",false);
   Check("static image needs no SDK","changeFigure:hero.png;",false,()=>Put("game/figure/hero.png","synthetic image"));
   foreach(string extension in new[]{"svg","bmp","avif"})Check("native image diff format "+extension,"changeFigureDiff:hero."+extension+" -id=hero;",false,()=>Put("game/figure/hero."+extension,"synthetic texture"),verify:(assets,report)=>ImageSnapshot(assets,report,"game/figure/hero."+extension,"synthetic texture"));
   Check("missing static image still blocks","changeFigure:missing.png;",false,null,true);
   Check("remote static image does not imply Live2D","changeFigure:https://example.invalid/hero.png;",false);
   // These are scanner tests, not runtime image decoding. The small parser
   // must keep changeFigureDiff as a command so resource and SDK checks run.
   var diffParsed=J.A(J.Get(Parse("changeFigureDiff:hero.png -id=hero;"),"sentenceList"))[0];
   Assert(J.S(diffParsed,"commandRaw")=="changeFigureDiff"&&J.N(diffParsed,"command")!=0,"Synthetic parser hid figure diff as dialogue");
   Check("image diff is inspected and copied without SDKs","changeFigureDiff:hero.png -id=hero;",false,()=>Put("game/figure/hero.png","synthetic diff image"),verify:(assets,report)=>ImageSnapshot(assets,report,"game/figure/hero.png","synthetic diff image"));
   Check("image diff query and encoded path use physical resource","changeFigureDiff:./game/figure/hero%20smile.WEBP?cache=1#pose -id=hero;",false,()=>Put("game/figure/hero smile.WEBP","encoded diff image"),verify:(assets,report)=>ImageSnapshot(assets,report,"game/figure/hero smile.WEBP","encoded diff image"));
   Check("none diff removes without resource or SDKs","changeFigureDiff:none -id=hero;",false,verify:(assets,report)=>{IssueKinds(report);Assert(J.N(report,"checkedFiles")==0,"Removal attempted to inspect a resource");Assert(J.A(J.Get(report,"actions")).Count==0,"Removal added a repair action");});
   Check("empty diff removes without resource or SDKs","changeFigureDiff: -id=hero;",false,verify:(assets,report)=>{IssueKinds(report);Assert(J.N(report,"checkedFiles")==0,"Empty removal attempted to inspect a resource");});
   Check("missing diff image retains skip-line repair","changeFigureDiff:missing.png -id=hero;",false,null,true,verify:(assets,report)=>{IssueKinds(report,"missing");Assert(J.B(report,"canContinue"),"Missing image diff must permit sanitized export");Assert(J.A(J.Get(report,"actions")).Any(x=>J.S(x,"kind")=="skip-line"&&J.N(x,"line")==1),"Missing diff lost its skip-line action");Assert(!J.S(report,"sanitizedScript").Contains("changeFigureDiff:"),"Missing diff survived sanitization");});
   Check("remote diff image warns without SDKs","changeFigureDiff:https://example.invalid/hero.png -id=hero;",false,verify:(assets,report)=>{IssueKinds(report);Assert(J.A(J.Get(report,"warnings")).Any(x=>J.S(x,"kind")=="external-resource"),"Remote diff lost its external-resource warning");Assert(J.N(report,"checkedFiles")==0,"Remote diff was treated as a local file");});
   foreach(string query in new[]{"type=spine","type=%73pine","%74ype=spine","type=spine&type=image"})Check("Spine query diff rejected: "+query,"changeFigureDiff:hero.png?"+query+";",query!="%74ype=spine",()=>Put("game/figure/hero.png","synthetic image"),verify:(assets,report)=>Assert(J.A(J.Get(report,"issues")).Any(x=>J.S(x,"kind")=="unsupported"),"Spine query escaped diff preflight"));
   foreach(string query in new[]{"type=image&type=spine","Type=spine","type=Spine"})Check("Spine query follows exact first-value semantics: "+query,"changeFigureDiff:hero.png?"+query+";",query!="type=image&type=spine",()=>Put("game/figure/hero.png","synthetic image"),verify:(assets,report)=>Assert(!J.A(J.Get(report,"issues")).Any(x=>J.S(x,"kind")=="unsupported"),"Non-Spine query falsely rejected"));
   Check("Cubism3 diff is unsupported and still requires both SDKs","changeFigureDiff:hero.model3.json -id=hero;",true,()=>{Put("game/figure/hero.model3.json","{\"FileReferences\":{\"Moc\":\"hero.moc3\"}}");Put("game/figure/hero.moc3","synthetic model");},verify:(assets,report)=>{IssueKinds(report,"unsupported","environment");Assert(J.N(report,"checkedFiles")==2,"Unsupported model diff stopped dependency inspection");Assert(!J.B(report,"canContinue"),"Unsupported model diff became skippable");});
   Check("missing model diff retains independent errors","changeFigureDiff:missing.model3.json -id=hero;",true,null,true,verify:(assets,report)=>IssueKinds(report,"missing","unsupported","environment"));
   Check("Spine diff is unsupported and conservatively requires SDKs","changeFigureDiff:hero.skel -id=hero;",true,()=>Put("game/figure/hero.skel","synthetic skeleton"),verify:(assets,report)=>IssueKinds(report,"unsupported","environment"));
   Check("video diff is unsupported without implying Live2D","changeFigureDiff:hero.webm -id=hero;",false,()=>Put("game/figure/hero.webm","synthetic video"),verify:(assets,report)=>{IssueKinds(report,"unsupported");Assert(!J.B(report,"canContinue"),"Unsupported video diff became skippable");});
   Check("MyGO selection does not allow video diff","changeFigureDiff:hero.mp4 -id=hero;",false,()=>Put("game/figure/hero.mp4","synthetic video"),mygo:true,verify:(assets,report)=>IssueKinds(report,"unsupported"));
   Check("unknown diff format fails closed","changeFigureDiff:hero.custom -id=hero;",true,()=>Put("game/figure/hero.custom","unknown"),verify:(assets,report)=>IssueKinds(report,"unsupported","environment"));
   Check("dynamic diff image remains conservative","changeFigureDiff:{hero}.png -id=hero;",true,null,true,verify:(assets,report)=>{IssueKinds(report,"missing","environment");Assert(J.A(J.Get(report,"warnings")).Any(x=>J.S(x,"kind")=="runtime-variable"),"Dynamic diff lost its interpolation warning");});
   Check("diff type query still requires conservative SDKs","changeFigureDiff:hero.png?type=customModel -id=hero;",true,()=>Put("game/figure/hero.png","synthetic image"),verify:(assets,report)=>IssueKinds(report,"environment"));
   Check("unknown custom command fails closed","customModel:hero.png;",true);
   Check("unknown figure format fails closed","changeFigure:hero.custom;",true,()=>Put("game/figure/hero.custom","unknown"));
   Check("dynamic image filename fails closed","changeFigure:{hero}.png;",true,null,true);
   Check("remote model fails closed","changeFigure:https://example.invalid/hero.model3.json;",true);
   Check("unknown type query fails closed","changeFigure:hero.png?type=customModel;",true,()=>Put("game/figure/hero.png","synthetic image"));
   Check("model-only figure argument fails closed","changeFigure:hero.png -motion=idle;",true,()=>Put("game/figure/hero.png","synthetic image"));
   Check("custom model argument fails closed","changeFigure:hero.png -customModel=avatar;",true,()=>Put("game/figure/hero.png","synthetic image"));
   Check("Cubism2 manifest requires combined SDKs","changeFigure:hero.model.json;",true,()=>{Put("game/figure/hero.model.json","{\"model\":\"hero.moc\"}");Put("game/figure/hero.moc","synthetic model data");});
   Check("Cubism3 manifest requires combined SDKs","changeFigure:hero.model3.json;",true,()=>{Put("game/figure/hero.model3.json","{\"Version\":3,\"FileReferences\":{\"Moc\":\"hero.moc3\"}}");Put("game/figure/hero.moc3","synthetic model data");});
   Check("metadata identifies unnamed model","changeFigure:avatar.json;",true,()=>{Put("game/figure/avatar.json","{\"FileReferences\":{\"Moc\":\"hero.moc3\"}}");Put("game/figure/hero.moc3","synthetic model data");});
   Check("missing model binary remains an independent error","changeFigure:hero.model3.json;",true,()=>Put("game/figure/hero.model3.json","{\"FileReferences\":{\"Moc\":\"missing.moc3\"}}"),true);
   Check("missing manifest remains an independent error","changeFigure:missing.model3.json;",true,null,true);
   Check("unknown JSON figure fails closed","changeFigure:avatar.json;",true,()=>Put("game/figure/avatar.json","{}"));
   var malformed=Check("malformed JSON figure fails closed","changeFigure:avatar.json;",true,()=>Put("game/figure/avatar.json","{"));Assert(J.A(J.Get(malformed,"issues")).Any(x=>J.S(x,"kind")=="syntax"),"Malformed model lost syntax error");
   Check("model hidden in animation table is checked","Narrator:hello;",true,()=>{Put("game/animation/animationTable.json","[\"hidden\"]");Put("game/animation/hidden.json","{\"asset\":\"hero.model3.json\"}");Put("game/animation/hero.model3.json","{\"FileReferences\":{\"Moc\":\"hero.moc3\"}}");Put("game/animation/hero.moc3","synthetic model data");});
   Check("model hidden in template CSS is checked","Narrator:hello;",true,()=>{Put("game/template/style.css",".model { background:url(hero.model3.json); }");Put("game/template/hero.model3.json","{\"FileReferences\":{\"Moc\":\"hero.moc3\"}}");Put("game/template/hero.moc3","synthetic model data");});
   Check("ordinary template font JSON is not a model","Narrator:hello;",false,()=>Put("game/template/template.json","{\"fonts\":[{\"font-family\":\"UserFont\",\"url\":\"font.ttf\"}]}"));
   Check("template JSON model reference is checked","Narrator:hello;",true,()=>{Put("game/template/template.json","{\"model\":\"hero.model3.json\"}");Put("game/template/hero.model3.json","{}");});
   Check("template JSON remote model remains conservative","Narrator:hello;",true,()=>Put("game/template/template.json","{\"modelRelativePath\":\"https://example.invalid/model\"}"));
   Check("template JSON extensionless model remains conservative","Narrator:hello;",true,()=>{Put("game/template/template.json","{\"model\":\"avatar\"}");Put("game/template/avatar","synthetic model metadata");});
   Check("template JSON resource suffix reveals model","Narrator:hello;",true,()=>{Put("game/template/config.json","{\"resources\":[\"hero.model3.json\"]}");Put("game/template/hero.model3.json","{}");});
   Check("both SDK availability descriptors satisfy requirement","changeFigure:hero.model3.json;",true,()=>Put("game/figure/hero.model3.json","{}"),false,false,Both);
   Check("only legacy SDK leaves modern missing","changeFigure:hero.model3.json;",true,()=>Put("game/figure/hero.model3.json","{}"),false,false,new[]{Both[0]});
   Check("only modern SDK leaves legacy missing","changeFigure:hero.model3.json;",true,()=>Put("game/figure/hero.model3.json","{}"),false,false,new[]{Both[1]});
   Check("aggregate children require SDKs","changeFigure:group.wmdl;",true,()=>{Put("game/figure/group.wmdl","{\"modelRelativePath\":\"one.model3.json\",\"subModels\":[{\"modelRelativePath\":\"two.model.json\"}]}");Put("game/figure/one.model3.json","{}");Put("game/figure/two.model.json","{}");},false,true);
   Check("JSONL unknown child fails closed","changeFigure:group.jsonl;",true,()=>{Put("game/figure/group.jsonl","{\"path\":\"unknown.json\"}\n");Put("game/figure/unknown.json","{}");},false,true);
   Check("recursive model references terminate conservatively","changeFigure:loop.json;",true,()=>Put("game/figure/loop.json","{\"model\":\"loop.json\"}"));
   project=Path.Combine(home,"engine-template-case");Directory.CreateDirectory(project);string engine=Path.Combine(home,"fallback-engine");
   Files.Atomic(Path.Combine(engine,"game/template/template.json"),"{\"model\":\"hero.model3.json\"}");Files.Atomic(Path.Combine(engine,"game/template/hero.model3.json"),"{}");
   var fallback=NewAssets("Narrator:hello;",false,null,engine).Scan(Parse("Narrator:hello;"));Assert(J.A(J.Get(fallback,"issues")).Count(x=>J.S(x,"kind")=="environment")==2,"Fallback engine template escaped model checks");count++;Console.WriteLine("PASS effective fallback engine template is inspected");
   for(int cssCase=0;cssCase<2;cssCase++){
    bool model=cssCase==0;project=Path.Combine(home,"engine-css-project-"+cssCase);Directory.CreateDirectory(project);string cssEngine=Path.Combine(home,"engine-css-source-"+cssCase);
    string asset=model?"game/figure/hero.model3.json":"game/template/fonts/font.ttf",url=(model?"/":"./")+asset;
    Files.Atomic(Path.Combine(cssEngine,"game/template/style.css"),".fixture { background:url("+url+"); }");Files.Atomic(Path.Combine(cssEngine,asset),model?"{}":"synthetic font data");
    var cssReport=NewAssets("Narrator:hello;",false,null,cssEngine).Scan(Parse("Narrator:hello;"));var cssIssues=J.A(J.Get(cssReport,"issues"));
    Assert(!cssIssues.Any(x=>J.S(x,"kind")=="missing"),"Engine CSS game-relative path was resolved against the wrong root");
    Assert(cssIssues.Count(x=>J.S(x,"kind")=="environment")== (model?2:0),"Engine CSS model/font classification changed");count++;Console.WriteLine("PASS engine CSS game-relative "+(model?"model":"font")+" path");
   }
   // Exercise production scene discovery/linearization, using a deliberately
   // tiny parser for this fixture's known say/changeScene/changeFigure grammar.
   project=Path.Combine(home,"cross-scene");Directory.CreateDirectory(Path.Combine(project,"game/scene"));
   Put("game/scene/start.txt","Narrator:first scene;\nchangeScene:later.txt;");Put("game/scene/later.txt","changeFigure:hero.model3.json;\nNarrator:second scene;");Put("game/figure/hero.model3.json","{}");
   var chain=SceneChain.BuildTimeline("start.txt",Path.Combine(project,"game/scene"),(source,name)=>Task.FromResult(Parse(source))).GetAwaiter().GetResult();
   Assert(J.A(J.Get(chain,"scenes")).Count==2,"SceneChain did not discover the next scene");
   var flattened=J.S(chain,"script");var multi=NewAssets(flattened).Scan(Parse(flattened));Assert(J.A(J.Get(multi,"issues")).Count(x=>J.S(x,"kind")=="environment")==2,"Later-scene model escaped SDK validation");count++;Console.WriteLine("PASS production cross-scene linearization retains SDK requirements");
   // Real Skeleton must leave optional SDK files absent so the upstream loader
   // returns false and does not import its combined plugin in a text-only game.
   project=Path.Combine(home,"skeleton");Directory.CreateDirectory(project);var skeleton=new ProjectAssets(project,Path.Combine(home,"real-skeleton"),project,"Narrator:hello;",null,EngineAdapter.Select(J.O("project",project,"settings",J.O("engine","webgal")))) ;skeleton.Skeleton();
   foreach(var name in Both)Assert(!File.Exists(Path.Combine(skeleton.Root,"lib",name)),"Skeleton fabricated missing SDK file: "+name);count++;Console.WriteLine("PASS missing SDKs remain absent in real runtime skeleton");
   foreach(string id in new[]{"webgal","mygo"}){
    project=Path.Combine(home,"legacy-raw-diff-"+id);Directory.CreateDirectory(project);
    var parsed=J.O("sentenceList",new[]{J.O("command",0,"commandRaw","changeFigureDiff","content","hero.png","args",new[]{J.O("key","speaker","value","changeFigureDiff")},"startLine",0,"endLine",0)});
    var ctor=typeof(EngineAdapter).GetConstructors(BindingFlags.Instance|BindingFlags.NonPublic).Single();var adapter=(EngineAdapter)ctor.Invoke(new object[]{id,id=="mygo"?"3.2.1":"4.6.4",project,"unused.js","unit-test",false,false,null,null,false});
    var assets=new ProjectAssets(project,Path.Combine(home,"legacy-raw-diff-snapshot-"+id),project,"changeFigureDiff:hero.png;",null,adapter);
    var report=assets.Scan(parsed);Assert(J.A(J.Get(report,"issues")).Any(x=>J.S(x,"kind")=="unsupported"),"Legacy parser silently accepted reserved diff as dialogue: "+id);count++;Console.WriteLine("PASS legacy raw diff rejected: "+id);
   }
   foreach(string version in new[]{"4.6.4","4.6.5"})foreach(string command in new[]{"changeFigureDiff","setTransform"}){
    project=Path.Combine(home,"capability-"+version+"-"+command);Directory.CreateDirectory(project);
    string source=command=="changeFigureDiff"?"changeFigureDiff:none;":"setTransform:{} -target=hero -transformFrom=default;";
    var parsed=Parse(source);if(command=="setTransform")parsed=J.O("sentenceList",new[]{J.O("command",1,"commandRaw",command,"content","{}","args",new[]{J.O("key","transformFrom","value","default")},"startLine",0,"endLine",0)});
    var ctor=typeof(EngineAdapter).GetConstructors(BindingFlags.Instance|BindingFlags.NonPublic).Single();var adapter=(EngineAdapter)ctor.Invoke(new object[]{"webgal",version,project,"unused.js","unit-test",false,false,null,null,false});
    var assets=new ProjectAssets(project,Path.Combine(home,"capability-snapshot-"+version+"-"+command),project,source,null,adapter);
    var report=assets.Scan(parsed);bool gated=J.A(J.Get(report,"issues")).Any(x=>J.S(x,"kind")=="unsupported");Assert(gated==(version=="4.6.4"),"Wrong version capability gate: "+version+" "+command);count++;Console.WriteLine("PASS capability "+version+" "+command);
   }
   return count;
  }finally{Files.Root=oldRoot;Directory.Delete(home,true);}
 }
}

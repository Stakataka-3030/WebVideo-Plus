using System;using System.IO;using System.Linq;using System.Reflection;using NativeVideo;
public static class RuntimeStartupChecks {
 static int count;static void Check(bool ok,string message){if(!ok)throw new Exception(message);count++;}
 static void Reject(Action action){bool failed=false;try{action();}catch(IOException){failed=true;}Check(failed,"Expected startup fidelity failure");}
 public static int Main(string[] args){try{Run();return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
 public static void Run(){
  count=0;string root=Path.Combine(Path.GetTempPath(),"webvideo-startup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);string config=Path.Combine(root,"config.txt");
  try{
   var ctor=typeof(EngineAdapter).GetConstructors(BindingFlags.NonPublic|BindingFlags.Instance).Single();var parameters=ctor.GetParameters();var values=parameters.Select(p=>p.IsOptional?p.DefaultValue:null).ToArray();values[0]="webgal";values[1]="4.6.5";values[2]=root;values[3]="unused.js";values[4]="unit-test";var adapter=(EngineAdapter)ctor.Invoke(values);
   var request=J.O();string[] codes={"zh_CN","en","ja","fr","de","zh_TW","pt_BR","ko"};
   for(int i=0;i<codes.Length;i++){
    Files.Atomic(config,"Default_Language:"+codes[i]+";\n");var resolved=RuntimeStartup.Resolve(request,config,adapter);Check(J.N(resolved,"language")==i&&J.S(resolved,"code")==codes[i],"Pinned enum mismatch");RuntimeStartup.ValidateContract(request,resolved);Check(RuntimeStartup.Script(resolved)=="localStorage.setItem('lang',\""+i+"\");\n","Seed must only set the bounded language key");
   }
   Files.Atomic(config,"Default_Language:en\n");Check(J.N(RuntimeStartup.Resolve(request,config,adapter),"language")==1,"Optional semicolon not accepted");
   File.Delete(config);Reject(()=>RuntimeStartup.Resolve(request,config,adapter));
   foreach(string body in new[]{"Game_name:No locale;","Default_Language:unknown;","Default_Language:en;\nDefault_Language:ja;"}){Files.Atomic(config,body);Reject(()=>RuntimeStartup.Resolve(request,config,adapter));}
   Files.Atomic(config,"Default_Language:en;\n");J.D(request)["runtimeStartup"]=J.O("language",0,"source","preview");var captured=RuntimeStartup.Resolve(request,config,adapter);Check(J.N(captured,"language")==0&&J.S(captured,"source")=="preview","Preview zero must override project default");RuntimeStartup.ValidateContract(request,captured);
   foreach(object bad in new object[]{-1,8,1.5,true,"en"}){J.D(request)["runtimeStartup"]=J.O("language",bad,"source","preview");Reject(()=>RuntimeStartup.Resolve(request,config,adapter));}
   J.D(request)["runtimeStartup"]=J.O("language",2,"source","preview");RuntimeStartup.ValidateContract(request,J.O("language",2,"code","ja","source","preview"));
   Reject(()=>RuntimeStartup.ValidateContract(request,J.O("language",1,"code","en","source","preview")));Reject(()=>RuntimeStartup.ValidateContract(request,J.O("language",2,"code","ja","source","project-default")));Reject(()=>RuntimeStartup.ValidateResolved(null));Reject(()=>RuntimeStartup.ValidateResolved(J.O("language",2,"code","en","source","preview")));
   J.D(request).Remove("runtimeStartup");Reject(()=>RuntimeStartup.ValidateContract(request,captured));
   Check(RuntimeStartup.ReadyExpression(captured).Contains("optionData?.language===0")&&RuntimeStartup.ReadyExpression(captured).Contains("langWrapper_1oupq_"),"Readiness must check actual runtime language and chooser absence");
   Console.WriteLine("Production runtime startup checks passed: "+count);
  }finally{Directory.Delete(root,true);}
 }
}

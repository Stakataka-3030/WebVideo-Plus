using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using NativeVideo;

// Actual ProjectAssets.Scan/Resolve, with parsed vocal URL values corresponding
// to the independently byte-pinned official GU/qo oracle. No parser is replaced.
// The capability constructor is injected; SDK/media decoding is not involved.
public static class ResourceUrlScanChecks {
 static void Assert(bool value,string message){if(!value)throw new Exception(message);}
 static void Put(string root,string relative){Files.Atomic(Path.Combine(root,"game/vocal",relative),"synthetic scanner resource");}
 static int Case(string home,string reference,string physical,bool rejected){
  string project=Path.Combine(home,"project-"+Guid.NewGuid().ToString("N")),snapshot=Path.Combine(home,"snapshot-"+Guid.NewGuid().ToString("N"));
  Directory.CreateDirectory(Path.Combine(project,"game/scene"));Put(project,physical);
  var ctor=typeof(EngineAdapter).GetConstructors(BindingFlags.Instance|BindingFlags.NonPublic).Single();
  var adapter=(EngineAdapter)ctor.Invoke(new object[]{"webgal","4.6.6",project,"unused.js","unit-test",false,false,null,null,false});
  const string script=":synthetic dialogue -fixture.wav  -figureId=hero;";
  string vocal="./game/vocal/"+reference;
  var parsed=J.O("sentenceList",new object[]{J.O("command",0,"commandRaw","","content","synthetic dialogue","startLine",0,"endLine",0,"args",new object[]{J.O("key","vocal","value",vocal),J.O("key","figureId","value","hero")})});
  var assets=new ProjectAssets(project,snapshot,project,script,null,adapter);
  string resolved=assets.Resolve("vocal",vocal);
  var report=assets.Scan(parsed);
  var issues=J.A(J.Get(report,"issues"));
  var copies=(Dictionary<string,string>)typeof(ProjectAssets).GetField("copies",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(assets);
  Assert(assets.Script==script,"Resource normalization mutated source dialogue");
  Assert(J.S(J.A(J.Get(parsed,"sentenceList"))[0],"content")=="synthetic dialogue","Resource normalization mutated parsed dialogue");
  if(rejected){
   Assert(resolved==null,"Encoded/path space must not alias the no-space source file: "+reference);
   Assert(issues.Count==1&&J.S(issues[0],"kind")=="unsupported"&&J.S(issues[0],"message").Contains("ASCII"),"Encoded/path space lost explicit unsupported diagnosis: "+reference);
   Assert(copies.Count==0,"Rejected URL must not copy the no-space source file: "+reference);
   Assert(J.N(report,"checkedFiles")==0,"Rejected URL inspected the aliased source: "+reference);
  }else{
   string expectedSource=Files.Full(Path.Combine(project,"game/vocal",physical)),expectedTarget=Files.Full(Path.Combine(snapshot,"game/vocal",physical));
   Assert(resolved==expectedSource,"Resolve did not preserve exactly one URL decode: "+reference);
   Assert(issues.Count==0,"Scan falsely rejected the legal physical filename: "+reference+" "+J.Text(issues));
   Assert(copies.Count==1&&copies.ContainsKey(expectedTarget)&&copies[expectedTarget]==expectedSource,"Scan/snapshot mapping did not preserve physical filename: "+reference);
   Assert(J.N(report,"checkedFiles")==1,"Legal file was not inspected exactly once: "+reference);
  }
  return 6;
 }
 public static int Run(){
  string home=Path.Combine(Path.GetTempPath(),"webvideo-resource-url-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(home);
  try {
   int count=0;
   foreach(var suffix in new[]{""," ","  ","\t ","\r\n ","\0\u001f "})count+=Case(home,"speaker/one line.wav"+suffix,"speaker/one line.wav",false);
   count+=Case(home,"speaker/one  line.wav ","speaker/one  line.wav",false);
   count+=Case(home,"speaker/one\u3000line.wav ","speaker/one\u3000line.wav",false);
   count+=Case(home,"speaker/line.wav\u3000 ","speaker/line.wav\u3000",false);
   count+=Case(home,"speaker/one%20line.wav ","speaker/one line.wav",false);
   count+=Case(home,"speaker/line.wav%2520 ","speaker/line.wav%20",false);
   count+=Case(home,"speaker%2520/line.wav ","speaker%20/line.wav",false);
   count+=Case(home,"speaker/line.wav?cache=1 ","speaker/line.wav",false);
   count+=Case(home,"speaker/line.wav#voice ","speaker/line.wav",false);
   count+=Case(home,"speaker/line.wav%20 ","speaker/line.wav",true);
   count+=Case(home,"speaker/line.wav ?cache=1","speaker/line.wav",true);
   count+=Case(home,"speaker/line.wav #voice","speaker/line.wav",true);
   count+=Case(home,"speaker%20/line.wav ","speaker/line.wav",true);
   count+=Case(home,"speaker /line.wav ","speaker/line.wav",true);
   return count;
  } finally {Directory.Delete(home,true);}
 }
}

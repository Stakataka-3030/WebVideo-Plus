using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Web.Script.Serialization;
public static class InstallerProductRoutingChecks {
 static int checks;
 static void Check(bool yes,string name){checks++;if(!yes)throw new Exception("Routing check failed: "+name);}
 static void Put(string root,string file,string value=""){string path=Path.Combine(root,file);Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllText(path,value);}
 static Dictionary<string,object> Row(string tag,string product,string engines="[\"4.6.4\",\"4.6.5\"]"){
  bool craft=product=="craft";string name=craft?"WebVideoCraft-Setup-"+tag.Replace("craft-v","")+".exe":"WebVideo+-Setup-"+tag.Substring(1)+".exe";
  return new Dictionary<string,object>{{"tag_name",tag},{"draft",false},{"prerelease",false},{"body","<!-- webvideo-compat: {\"product\":\""+product+"\",\"webgal\":"+engines+"} -->"},{"assets",new object[]{new Dictionary<string,object>{{"name",name},{"state","uploaded"},{"browser_download_url","https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/"+tag+"/"+Uri.EscapeDataString(name)}}}}};
 }
 static Dictionary<string,object> Asset(Dictionary<string,object> row){return (Dictionary<string,object>)((object[])row["assets"])[0];}
 public static void Run(string temp){
  string craft=Path.Combine(temp,"craft"),terre=Path.Combine(temp,"terre"),both=Path.Combine(temp,"both"),fake=Path.Combine(temp,"Craft-by-name-only");
  Put(craft,"webgal-craft.exe");Put(terre,"WebGAL Terre.exe");Put(terre,"public/index.html");Put(both,"webgal-craft.exe");Put(both,"WebGAL_Terre.exe");Put(both,"public/index.html");Directory.CreateDirectory(fake);
  Check(InstallerProductRouting.Detect(craft).Product=="craft","craft folder");Check(InstallerProductRouting.Detect(Path.Combine(craft,"webgal-craft.exe")).WrongForTerre,"craft exe");Check(InstallerProductRouting.Detect("\""+craft+"\"").Product=="craft","quoted path");
  Check(InstallerProductRouting.Detect(terre).WrongForCraft,"terre folder");Check(!InstallerProductRouting.Detect(terre).WrongForTerre,"terre retained");Check(InstallerProductRouting.Detect(both).Product=="ambiguous","mixed product fails closed");Check(InstallerProductRouting.Detect(fake).Product=="unknown","folder name no identity");Check(InstallerProductRouting.Detect(null).Product=="unknown","null path");
  string link=Path.Combine(temp,"host.lnk");File.WriteAllText(link,"");Check(InstallerProductRouting.Detect(link,s=>Path.Combine(craft,"webgal-craft.exe")).Product=="craft","shortcut resolved");Check(InstallerProductRouting.Detect(link,s=>s).Product=="unknown","shortcut cycle bounded");Check(InstallerProductRouting.Detect(link,s=>{throw new IOException();}).Product=="unknown","broken shortcut safe");
  bool blocked=false;try{InstallerProductRouting.RequireTerre(craft);}catch(InvalidOperationException){blocked=true;}Check(blocked,"wrong product blocks action");InstallerProductRouting.RequireTerre(terre);Check(File.ReadAllText(Path.Combine(craft,"webgal-craft.exe"))=="","host unchanged");
  string descriptor="assets/templates/WebGAL_Template/webgal-engine.json";
  Put(terre,descriptor,"{\"id\":\"open-webgal.webgal\",\"version\":\"4.6.4\",\"webgalVersion\":\"4.6.4\"}");Check(InstallerProductRouting.TerreEngine(terre)=="4.6.4","official464");
  Put(terre,descriptor,"{\"id\":\"open-webgal.webgal\",\"version\":\"4.6.5\",\"webgalVersion\":\"4.6.5\"}");Check(InstallerProductRouting.TerreEngine(terre)=="4.6.5","official465");
  Put(terre,descriptor,"{\"id\":\"open-webgal.webgal\",\"version\":\"4.6.4\",\"webgalVersion\":\"4.6.5\"}");Check(InstallerProductRouting.TerreEngine(terre)=="","inconsistent version");
  Put(terre,descriptor,"{\"id\":\"webgal-mygo.mygo\",\"version\":\"3.2.1\",\"webgalVersion\":\"4.6.4\"}");Check(InstallerProductRouting.TerreEngine(terre)=="4.6.4","MyGO321legacy");
  Put(terre,descriptor,"{\"id\":\"webgal-mygo.mygo\",\"version\":\"3.2.2\",\"webgalVersion\":\"4.6.4\"}");Check(InstallerProductRouting.TerreEngine(terre)=="","unknownMyGO");Put(terre,descriptor,new string('x',65537));Check(InstallerProductRouting.TerreEngine(terre)=="","boundeddescriptor");
  var legacy=Row("v1.1.7","terre","[\"4.6.4\"]");var next=Row("v1.2.0","terre","[\"4.6.5\"]");var c=Row("craft-v1.1.8.0c","craft");object[] rows={next,c,legacy};
  Check(InstallerProductRouting.Select(rows,"terre","4.6.4").Version=="1.1.7","464stayslegacy");Check(InstallerProductRouting.Select(rows,"terre","4.6.5").Version=="1.2.0","465latest");Check(InstallerProductRouting.Select(rows,"terre","").Url=="","unknown engine no redirect");Check(InstallerProductRouting.Select(rows,"craft").Version=="1.1.8.0","craft separate");
  Check(InstallerProductRouting.Select(new object[]{next,legacy},"craft").Url=="","no craft release unavailable");Check(InstallerProductRouting.Select(new object[0],"craft").Url=="","empty unavailable");
  foreach(string flag in new[]{"draft","prerelease"}){var bad=Row("craft-v2.0.0.0c","craft");bad[flag]=true;Check(InstallerProductRouting.Select(new object[]{bad,c},"craft").Version=="1.1.8.0",flag+" excluded");}
  foreach(string tag in new[]{"craft-v999999999999.0.0.0c","craft-v1.9.0.0c-cloud-test.1","v9.9.9"}){var bad=Row(tag,"craft");Check(InstallerProductRouting.Select(new object[]{bad,c},"craft").Version=="1.1.8.0","invalid tag "+tag);}
  foreach(string body in new[]{"","<!-- webvideo-compat: {} -->","<!-- webvideo-compat: {\"product\":\"terre\",\"webgal\":[\"4.6.4\"]} -->","<!-- webvideo-compat: {\"product\":\"craft\",\"webgal\":\"4.6.4\"} -->"}){var bad=Row("craft-v2.0.0.0c","craft");bad["body"]=body;Check(InstallerProductRouting.Select(new object[]{bad},"craft").Url=="","invalid marker");}
  foreach(string url in new[]{"https://evil.example/setup.exe","https://github.com/Stakataka-3030/WebVideo-Plus/releases/latest","https://github.com@evil.example/","https://github.com/Stakataka-3030/WebVideo-Plus/releases/download/craft-v2.0.0.0c/WebVideoCraft-Setup-2.0.0.0c.exe?redirect=1","http://github.com/Stakataka-3030/WebVideo-Plus/releases/download/craft-v2.0.0.0c/WebVideoCraft-Setup-2.0.0.0c.exe"}){var bad=Row("craft-v2.0.0.0c","craft");Asset(bad)["browser_download_url"]=url;Check(InstallerProductRouting.Select(new object[]{bad},"craft").Url=="","reject URL "+url);}
  var uploading=Row("craft-v2.0.0.0c","craft");Asset(uploading)["state"]="new";Check(InstallerProductRouting.Select(new object[]{uploading},"craft").Url=="","incomplete asset");
  Check(ReleaseUpdateCheck.Evaluate(rows,"4.6.4","1.1.6").Url.EndsWith("/v1.1.7"),"published native116 selects117");
  Check(ReleaseUpdateCheck.Evaluate(rows,"4.6.4","1.1.7").Kind=="keep","published native116 retains117");
  Check(ReleaseUpdateCheck.Evaluate(rows,"4.6.5","1.1.6").Url.EndsWith("/v1.2.0"),"published native116 selects120for465");
  Console.WriteLine("Installer product routing passed: "+checks+" assertions; no host executable was run or changed.");
 }
}

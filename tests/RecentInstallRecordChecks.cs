using System;using System.IO;using System.Reflection;using NativeVideo;
public static class RecentInstallRecordChecks {
 static int checks;
 static void Check(bool value,string name){checks++;if(!value)throw new Exception("Recent-record check failed: "+name);}
 public static void Run(string temp){
  var type=typeof(ProductIntegration);var read=type.GetMethod("ReadRecentInstall",BindingFlags.Static|BindingFlags.NonPublic);var update=type.GetMethod("UpdateRecentInstall",BindingFlags.Static|BindingFlags.NonPublic);var state=type.GetMethod("State",BindingFlags.Static|BindingFlags.NonPublic);
  string record=Path.Combine(temp,"last-install.json");int accesses=0;Func<string> path=()=>{accesses++;return record;};Func<string> forbidden=()=>{throw new Exception("Suppressed recent path was evaluated");};
  var config=J.O("terreDir",Path.Combine(temp,"host"),"stateDir",Path.Combine(temp,"data"));
  foreach(string command in new[]{"install","repair","module-switch","uninstall-preserve","uninstall-delete"}){
   App.Args=new[]{command.StartsWith("uninstall")?"uninstall":"install","--no-recent","true","--force",command=="repair"?"true":"false","--state-dir",Path.Combine(temp,"isolated-state")};
   File.WriteAllText(record,"sentinel "+command);string before=Files.Hash(record);accesses=0;
   Check(read.Invoke(null,new object[]{path})==null,command+" read suppressed");
   update.Invoke(null,new object[]{config,command=="uninstall-delete",path});
   Check(accesses==0,command+" no shared path evaluation/read/write/delete");Check(Files.Hash(record)==before,command+" sentinel unchanged");
   read.Invoke(null,new object[]{forbidden});update.Invoke(null,new object[]{config,command=="uninstall-delete",forbidden});
   Check((string)state.Invoke(null,new object[]{Path.Combine(temp,"empty-host")})==Integration.StateFor(Path.Combine(temp,"empty-host")),command+" fallback avoids shared record");
   File.Delete(record);update.Invoke(null,new object[]{config,false,path});Check(!File.Exists(record),command+" absent shared record not created");
  }
  foreach(string flag in new[]{"<absent>","false"}){
   App.Args=flag=="<absent>"?new[]{"install"}:new[]{"install","--no-recent",flag};accesses=0;
   update.Invoke(null,new object[]{config,false,path});Check(File.Exists(record),flag+" default save retained");Check(J.S(read.Invoke(null,new object[]{path}),"stateDir")==J.S(config,"stateDir"),flag+" default read retained");update.Invoke(null,new object[]{null,true,path});Check(!File.Exists(record),flag+" default delete retained");Check(accesses==3,flag+" one path per enabled operation");
  }
  Console.WriteLine("Recent-install isolation checks passed: "+checks+" assertions; all fixtures owned temporary files.");
 }
}

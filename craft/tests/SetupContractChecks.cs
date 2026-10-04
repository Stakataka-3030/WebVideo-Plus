using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
public static class SetupContractChecks {
 static int count;
 static void Check(bool value,string name){if(!value)throw new Exception(name);count++;}
 static void Reject(Action action,string name){try{action();}catch(IOException){count++;return;}throw new Exception("Accepted "+name);}
 static string Result(string action,string status,bool ok,string state,bool changed=true,string extra="") {return "{\"schemaVersion\":1,\"type\":\"result\",\"action\":\""+action+"\",\"status\":\""+status+"\",\"ok\":"+ok.ToString().ToLowerInvariant()+",\"changed\":"+changed.ToString().ToLowerInvariant()+",\"state\":{\"status\":\""+state+"\"},\"message\":\"diagnostic\""+extra+"}";}
 public static void Run(){
  var before=new CraftSetupRequest();Check(before.CanCancel,"Preparation should allow cancel");Check(before.RequestCancel(),"Cancel rejected");Check(!before.CanCancel,"Cancel still enabled");bool blocked=false;try{before.BeginMutation();}catch(OperationCanceledException){blocked=true;}Check(blocked,"Cancelled request started mutation");
  var during=new CraftSetupRequest();during.BeginMutation();Check(!during.CanCancel&&!during.RequestCancel(),"Active mutation could be cancelled");during.ThrowIfCancelled();
  for(int i=0;i<300;i++){
   var race=new CraftSetupRequest();bool cancelled=false,started=false;
   Parallel.Invoke(()=>{cancelled=race.RequestCancel();},()=>{try{race.BeginMutation();started=true;}catch(OperationCanceledException){}});
   Check(cancelled!=started,"Cancellation/start race produced invalid outcome");
  }
  foreach(string action in new[]{"install","repair"}){var r=CraftSetupProtocol.ParseResult(Result(action,"completed",true,"installed",true,action=="repair"?",\"repaired\":true":""),0,action);Check(r.Installed&&r.Status=="completed",action+" completion");}
  Check(CraftSetupProtocol.ParseResult(Result("install","unchanged",true,"installed",false),0,"install").Message.Contains("无需更改"),"No-op truth");
  var detached=CraftSetupProtocol.ParseResult(Result("uninstall","completed",true,"detached"),0,"uninstall");Check(!detached.Installed&&detached.Message.Contains("已卸载"),"Uninstall truth");
  var changed=CraftSetupProtocol.ParseResult(Result("uninstall","warning",false,"host-changed",false),2,"uninstall");Check(changed.Status=="warning"&&changed.Message.Contains("未完成卸载"),"Changed host falsely succeeded");
  Check(CraftSetupProtocol.ParseResult(Result("recover-session","unchanged",true,"",false),0,"recover-session").Message.Contains("没有需要"),"No stale lock truth");
  Check(CraftSetupProtocol.ParseResult(Result("recover-session","completed",true,""),0,"recover-session").Message.Contains("已移除"),"Recovered truth");
  var retained=CraftSetupProtocol.ParseResult(Result("install","warning",false,"installed",true,",\"retainedRecovery\":\"fixture recovery\""),2,"install");Check(retained.Installed&&retained.Status=="warning"&&retained.Message.Contains("fixture recovery"),"Retained recovery must remain visible");
  Reject(()=>CraftSetupProtocol.ParseResult("not JSON",0),"malformed JSON");Reject(()=>CraftSetupProtocol.ParseResult("null",0),"null result");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("install","completed",true,"installed"),1),"failure exit with success JSON");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("install","error",true,"installed"),0),"invalid success status");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("uninstall","completed",true,"host-changed"),0),"false completed changed host");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("install","completed",true,"detached"),0),"false installed state");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("install","completed",true,"installed"),0,"repair"),"wrong action");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("uninstall","warning",true,"host-changed"),2),"contradictory warning");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("install","completed",true,"installed").Replace("\"ok\":true","\"ok\":\"True\""),0),"string boolean");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("recover-session","completed",true,"",false),0),"inconsistent changed flag");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("recover-session","unchanged",true,"",false).Replace("\"changed\":false,",""),0),"missing changed flag");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("recover-session","unchanged",true,"",false).Replace("\"changed\":false","\"changed\":\"false\""),0),"string changed flag");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("repair","completed",true,"installed"),0),"missing repaired proof");
  Reject(()=>CraftSetupProtocol.ParseResult(Result("repair","unchanged",true,"installed",false),0),"unchanged repair");
  Console.WriteLine("PASS actual Setup contracts: "+count+" assertions including 300 cancellation races and typed action outcomes");
 }
}

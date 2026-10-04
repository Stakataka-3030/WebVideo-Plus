using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Cancellation is cooperative and only allowed before the transaction starts.
// The lock closes the race between the last UI cancellation and coordinator start.
internal sealed class CraftSetupRequest {
 internal string Action, Destination, Craft, Mode, Cache;
 internal bool DesktopShortcut;
 readonly object gate=new object(); bool cancelled,mutationStarted;
 internal bool CanCancel {get {lock(gate)return !mutationStarted&&!cancelled;}}
 internal bool RequestCancel(){lock(gate){if(mutationStarted)return false;cancelled=true;return true;}}
 internal void ThrowIfCancelled(){lock(gate){if(cancelled)throw new OperationCanceledException("已取消准备，安装记录和 Craft 主程序未改变。");}}
 internal void BeginMutation(){lock(gate){ThrowIfCancelled();mutationStarted=true;}}
}
internal sealed class CraftSetupResult {
 internal string Status="completed",Message="操作完成。",LogFile;
 internal bool Installed,Cancelled;
}


internal static class CraftSetupProtocol {
 internal static CraftSetupResult ParseResult(string output,int exitCode,string expectedAction=null){
  Dictionary<string,object> data;try{data=new JavaScriptSerializer{MaxJsonLength=16*1024*1024}.Deserialize<Dictionary<string,object>>(output.Trim());}catch{throw new IOException("安装协调器没有返回有效结果（退出码 "+exitCode+"）。请查看本次日志。");}
  if(data==null||CraftManifestVerifier.Text(data,"type")!="result"||CraftManifestVerifier.Text(data,"schemaVersion")!="1")throw new IOException("安装协调器结果格式不匹配。");
  string action=CraftManifestVerifier.Text(data,"action"),status=CraftManifestVerifier.Text(data,"status"),diagnostic=CraftManifestVerifier.Text(data,"message");
  if(expectedAction!=null&&action!=expectedAction)throw new IOException("安装协调器返回了另一项操作的结果，未声明完成。");
  object ok=CraftManifestVerifier.Get(data,"ok");bool warning=status=="warning"&&exitCode==2&&ok is bool&&!(bool)ok;
  bool success=exitCode==0&&ok is bool&&(bool)ok&&(status=="completed"||status=="unchanged");
  if(!warning&&!success)throw new IOException(String.IsNullOrEmpty(diagnostic)?"安装协调器未确认完成，请查看日志。":diagnostic);
  var state=CraftManifestVerifier.Get(data,"state");string stateStatus=CraftManifestVerifier.Text(state,"status"),message;
  object changedValue=CraftManifestVerifier.Get(data,"changed");
  if(!(changedValue is bool))throw new IOException("安装协调器缺少明确的变更结果。");
  bool changed=(bool)changedValue;
  if(status=="completed"&&!changed||status=="unchanged"&&changed)throw new IOException("安装协调器的状态与变更结果不一致。");
  if(action=="repair"&&(!changed||!(CraftManifestVerifier.Get(data,"repaired") is bool)||!(bool)CraftManifestVerifier.Get(data,"repaired")))throw new IOException("安装协调器没有确认组件修复完成。");
  if(action=="install"||action=="repair"){
   if(stateStatus!="installed")throw new IOException("安装协调器没有确认已安装状态，未声明完成。");
   message=action=="repair"?"组件修复完成，配置和用户数据已保留。":changed?"安装完成。请点击“启动 Craft”，以后仍从原 Craft 快捷方式或程序启动。":"当前组件已经安装，无需更改。可点击“启动 Craft”。";
  }else if(action=="uninstall"){
   if(stateStatus=="host-changed"&&warning)message="Craft 入口已被官方更新或其他程序改变，未完成卸载。新程序和恢复记录已保留；安装器没有用旧备份覆盖它。请查看日志核对。";
   else if(stateStatus=="detached"&&success)message=changed?"增强挂载已卸载。组件、配置、日志和用户数据已保留；官方 Craft、游戏工程和视频不受影响。":"增强挂载已经卸载，无需重复操作。组件和数据仍保留。";
   else throw new IOException("卸载结果没有确认已拆卸状态，请查看日志。");
  }else if(action=="recover-session")message=changed?(!String.IsNullOrEmpty(CraftManifestVerifier.Text(data,"updateId"))?"已确认官方更新助手及已观察的安装器均已退出，并移除本安装的过期协调锁。可重新检查安装。":"已移除确认失效的本适配器会话锁。可以重新尝试安装或启动。"):"没有需要清理的失效会话锁；未更改任何记录。";
  else throw new IOException("安装协调器返回了不支持的操作结果。");
  string retained=CraftManifestVerifier.Text(data,"retainedRecovery");
  if(!String.IsNullOrEmpty(retained))message+="\n恢复目录出现其他改动，已保留供核对："+retained;
  else if(warning&&stateStatus!="host-changed")message+="\n仍有事项需要核对，请打开本次日志："+diagnostic;
  return new CraftSetupResult{Status=status,Message=message,Installed=stateStatus=="installed"};
 }
}

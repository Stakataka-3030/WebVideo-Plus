using System;
using System.IO;
using System.Collections.Generic;
public static class OfficialInstallerContractChecks {
 static int count;
 static void Check(bool value,string message){count++;if(!value)throw new Exception(message);}
 static void Reject(Action action,string message){try{action();}catch(IOException){count++;return;}catch(ArgumentException){count++;return;}throw new Exception(message);}
 public static void Run(){
  Check(!OfficialInstallerLauncher.HostCloseGraceExpired(TimeSpan.FromMilliseconds(29999)),"Close grace expired early");
  Check(OfficialInstallerLauncher.HostCloseGraceExpired(TimeSpan.FromMilliseconds(30000)),"Thirty-second close grace did not expire");
  Check(OfficialInstallerLauncher.HostCloseGraceExpired(TimeSpan.FromMilliseconds(60000)),"Expired close grace was reopened");
  string root=Path.Combine(Path.GetTempPath(),"inert-official-contract"),craft=Path.Combine(root,"webgal-craft.exe"),uninstall=Path.Combine(root,"uninstall.exe");
  object[] good={root,root,uninstall,"webgal-craft.exe","WebGAL Craft","Akirami","1.0.0-beta.2"};
  Action<object[]> validate=v=>OfficialInstallerLauncher.ValidateRegistryValues(craft,"1.0.0-beta.2",v[0],v[1],v[2],v[3],v[4],v[5],v[6]);
  validate(good);count++;
  var quoted=(object[])good.Clone();quoted[0]="\""+root+"\"";quoted[2]="\""+uninstall+"\"";validate(quoted);count++;
  for(int i=0;i<good.Length;i++){var bad=(object[])good.Clone();bad[i]=i<3?Path.Combine(root,"other"):"wrong";Reject(()=>validate(bad),"Mismatched official registry value accepted: "+i);}
  Reject(()=>OfficialInstallerLauncher.RegistryPath("relative.exe"),"Relative registry path accepted");
  Reject(()=>OfficialInstallerLauncher.RegistryPath("\""+uninstall+"\" /S"),"Registry command accepted as a path");
  Reject(()=>OfficialInstallerLauncher.RegistryPath(null),"Missing registry path accepted");
  Check(OfficialInstallerLauncher.ConflictingMachineProduct("WebGAL Craft","Akirami"),"Matching machine registration ignored");
  Check(OfficialInstallerLauncher.ConflictingMachineProduct("webgal craft","akirami"),"Case variant machine registration ignored");
  Check(!OfficialInstallerLauncher.ConflictingMachineProduct("Other","Akirami"),"Unrelated product blocked");
  Check(!OfficialInstallerLauncher.ConflictingMachineProduct("WebGAL Craft","Other"),"Unrelated publisher blocked");
  Check(OfficialInstallerLauncher.EscapeNsisArgument("")=="\"\"","Empty argument escaped incorrectly");
  Check(OfficialInstallerLauncher.EscapeNsisArgument("plain")=="plain","Plain argument escaped incorrectly");
  Check(OfficialInstallerLauncher.EscapeNsisArgument("a b")=="\"a b\"","Space argument escaped incorrectly");
  Check(OfficialInstallerLauncher.EscapeNsisArgument("/S")=="\"/S\"","Host argument became NSIS switch");
  Check(OfficialInstallerLauncher.EscapeNsisArgument("a\"b")=="a\\\"b","Quote argument escaped incorrectly");
  Check(OfficialInstallerLauncher.EscapeNsisArgument("a b\\")=="\"a b\\\\\"","Trailing slash argument escaped incorrectly");
  Check(OfficialInstallerLauncher.EscapeNsisArgument("汉字")=="汉字","Unicode argument changed");
  foreach(string value in new[]{"a\rb","a\nb","a\0b"})Reject(()=>OfficialInstallerLauncher.EscapeNsisArgument(value),"Control character argument accepted");
  Reject(()=>OfficialInstallerLauncher.EscapeNsisArgument(null),"Null host argument accepted");
  string[] names={"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS","WEBVIEW2_USER_DATA_FOLDER","WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER"};var saved=new Dictionary<string,string>();
  try{foreach(string name in names){saved[name]=Environment.GetEnvironmentVariable(name);Environment.SetEnvironmentVariable(name,"inert-fixture",EnvironmentVariableTarget.Process);}OfficialInstallerLauncher.CleanEnvironment();foreach(string name in names)Check(Environment.GetEnvironmentVariable(name)==null,"Leaked WebView2 variable: "+name);}
  finally{foreach(var entry in saved)Environment.SetEnvironmentVariable(entry.Key,entry.Value,EnvironmentVariableTarget.Process);}
  Console.WriteLine("PASS actual official-launcher contracts: "+count+" assertions; no registry read/write or native process execution");
 }
}

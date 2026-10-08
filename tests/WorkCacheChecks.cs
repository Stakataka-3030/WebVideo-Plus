using System;using System.IO;using System.Threading;using System.Threading.Tasks;using System.Diagnostics;using NativeVideo;
public static class WorkCacheChecks {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 public static void Main(string[] args){
  string root=Path.GetFullPath(args[0]),profileParent=Path.Combine(root,"profile-test"),profile=Path.Combine(profileParent,"profile");Directory.CreateDirectory(profile);
  var stream=new FileStream(Path.Combine(profile,"lockfile"),FileMode.Create,FileAccess.ReadWrite,FileShare.None);
  var release=Task.Run(()=>{Thread.Sleep(450);stream.Dispose();});
  WorkCache.CleanupBrowserProfile(profileParent);release.Wait();Check(!Directory.Exists(profile),"Profile remained after transient Windows lock release");
  string cache=Path.Combine(root,"cache"),work=Path.Combine(cache,"job"),record=Path.Combine(root,"record");Directory.CreateDirectory(Path.Combine(work,"profile"));Directory.CreateDirectory(record);File.WriteAllText(Path.Combine(record,"status.json"),"keep");
  stream=new FileStream(Path.Combine(work,"profile","lockfile"),FileMode.Create,FileAccess.ReadWrite,FileShare.None);release=Task.Run(()=>{Thread.Sleep(450);stream.Dispose();});
  WorkCache.CleanupCompleted(J.O("jobDir",work,"recordDir",record,"cacheRoot",cache));release.Wait();Check(!Directory.Exists(work),"Completed analysis cache remained after transient Windows lock release");Check(File.ReadAllText(Path.Combine(record,"status.json"))=="keep","Lightweight record changed");
  string outside=Path.Combine(root,"outside");Directory.CreateDirectory(outside);File.WriteAllText(Path.Combine(outside,"keep.txt"),"keep");var timer=Stopwatch.StartNew();
  try{WorkCache.CleanupCompleted(J.O("jobDir",outside,"recordDir",record,"cacheRoot",cache));throw new Exception("Out-of-root cache was accepted");}catch(IOException){}
  Check(timer.ElapsedMilliseconds<1000,"Path rejection should precede lock retries");Check(File.Exists(Path.Combine(outside,"keep.txt")),"Outside path changed");
  Console.WriteLine("PASS production WorkCache: transient profile/completed-cache locks, preserved records, immediate outside-root rejection (5 assertions).");
 }
}

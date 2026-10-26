using System;using System.IO;using System.Linq;using System.Reflection;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Web.Script.Serialization;
public static class InstallerLongPathChecks {
 const string Relative="ai-runtime/node_modules/@aws-sdk/core/dist-es/submodules/client/middleware-recursion-detection/recursionDetectionMiddleware.browser.js";
 const string Expected="f0b209f78394c92c67be615acf1352e94624490f8780e2c3e9a4ad112d325cc0";
 static Type engineType;static string payloadHash,baseRoot,currentRoot,stageTarget;static object engine;static bool cancelAtMedia,materializedBeforeCancel,nativeRejected;static int passed;
 static readonly List<object> checks=new List<object>(),cases=new List<object>();static readonly Dictionary<string,string> roots=new Dictionary<string,string>();
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFileAttributesW(string file);
 static string Io(string p){p=Path.GetFullPath(p);return p.StartsWith(@"\\?\",StringComparison.Ordinal)?p:p.StartsWith(@"\\",StringComparison.Ordinal)?@"\\?\UNC\"+p.Substring(2):@"\\?\"+p;}
 static object Call(object instance,string method,params object[] args){try{return engineType.GetMethod(method,BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Static|BindingFlags.Instance).Invoke(instance,args);}catch(TargetInvocationException e){throw e.InnerException;}}
 static void Check(bool condition,string name){if(!condition)throw new Exception(name);passed++;checks.Add(new{name=name,status="PASS"});Console.WriteLine("PASS "+name);}
 static string NewRoot(int length){int n=length-baseRoot.Length-1;if(n<8)throw new Exception("Choose a shorter writable BaseRoot; the reported cache-root length must not be changed to make this test pass.");for(int attempt=0;attempt<10;attempt++){string id=Guid.NewGuid().ToString("N"),name=("wvp"+id+new string('x',n)).Substring(0,n),root=Path.Combine(baseRoot,name);if(Directory.Exists(root))continue;Directory.CreateDirectory(root);File.WriteAllText(Path.Combine(root,".longpath-test-owner"),id);roots.Add(root,id);return root;}throw new IOException("Cannot create a fresh owned fixture");}
 static object New(string root){var constructor=engineType.GetConstructors().Single();var callback=Delegate.CreateDelegate(constructor.GetParameters()[1].ParameterType,typeof(InstallerLongPathChecks).GetMethod("Report"));return constructor.Invoke(new object[]{root,callback,false});}
 public static void Report(object progress){string message=Convert.ToString(progress.GetType().GetField("Message").GetValue(progress));if(!message.StartsWith("正在释放",StringComparison.Ordinal))return;
  string packages=Path.Combine(currentRoot,"packages");var stages=Directory.GetDirectories(packages,payloadHash.Substring(0,16)+".stage-*");if(stages.Length!=1)throw new Exception("Expected one actual production staging directory");stageTarget=Path.Combine(stages[0],"webvideo-plus",Relative.Replace('/',Path.DirectorySeparatorChar));
  if(message.StartsWith("正在释放媒体",StringComparison.Ordinal)){
   if(!File.Exists(Io(stageTarget)))throw new Exception("Actual deep component must be materialized before validation/cancel");nativeRejected=GetFileAttributesW(stageTarget)==uint.MaxValue;
   if(cancelAtMedia){materializedBeforeCancel=true;engineType.GetField("Canceled").SetValue(engine,true);}
  }
 }
 public static int Main(string[] args){
  AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);
  bool success=false;string error=null;byte[] sample=null;try{
   var assembly=Assembly.LoadFile(Path.GetFullPath(args[0]));engineType=assembly.GetType("SetupEngine",true);payloadHash=(string)assembly.GetType("InstallerBuild",true).GetField("PayloadHash").GetRawConstantValue();baseRoot=Path.GetFullPath(args[1]).TrimEnd('\\');Directory.CreateDirectory(baseRoot);
   foreach(int length in new[]{45,46,48,78}){
    currentRoot=NewRoot(length);engine=New(currentRoot);stageTarget=null;nativeRejected=false;string payload=(string)Call(engine,"ExtractPayload");string target=Path.Combine(payload,Relative.Replace('/',Path.DirectorySeparatorChar)),ready=Path.Combine(Path.GetDirectoryName(payload),"ready");
    Check(stageTarget!=null&&stageTarget.Length==length+214,"actual staging target retains length "+(length+214));
    Check(length<46?!nativeRejected:nativeRejected,"Win32 long-path restriction is active at boundary "+(length+214));
    Check((string)Call(null,"Hash",Io(target))==Expected,"actual deep file has manifest hash at staging length "+(length+214));
    Check(File.ReadAllText(ready)==payloadHash,"ready published after complete production verification "+length);
    DateTime stamp=File.GetLastWriteTimeUtc(Path.Combine(payload,"WebGAL.Video.exe"));string reused=(string)Call(engine,"ExtractPayload");Check(reused==payload&&File.GetLastWriteTimeUtc(Path.Combine(payload,"WebGAL.Video.exe"))==stamp,"verified cache reused without rewriting "+length);
    cases.Add(new{rootLength=length,stageTargetLength=stageTarget.Length,normalRootPassedToEngine=true,nativeLongPathOptIn=false,ready=true,cacheReuse=true});
    if(length==46){sample=File.ReadAllBytes(Io(target));
     File.Delete(ready);cancelAtMedia=true;materializedBeforeCancel=false;string archive=Directory.GetFiles(currentRoot,"payload-*.zip").Single();DateTime archiveStamp=File.GetLastWriteTimeUtc(archive);bool canceled=false;
     try{Call(engine,"ExtractPayload");}catch(OperationCanceledException){canceled=true;}finally{cancelAtMedia=false;}
     Check(canceled&&materializedBeforeCancel,"cancel after real long-path component materialization");Check(Directory.GetDirectories(Path.Combine(currentRoot,"packages"),"*.stage-*").Length==0&&!File.Exists(ready),"canceled long staging fully removed without publishing ready");
     Check((string)Call(null,"Hash",Io(target))==Expected,"canceled replacement preserves previous payload");engineType.GetField("Canceled").SetValue(engine,false);Check((string)Call(engine,"ExtractPayload")==payload&&File.GetLastWriteTimeUtc(archive)==archiveStamp,"retry reuses archive and atomically publishes after cancel");
     string wanted=Io(target);byte[] original=File.ReadAllBytes(wanted);File.WriteAllText(wanted,"tamper");bool rejected=false;try{Call(engine,"ExtractPayload");}catch(IOException){rejected=true;}Check(rejected,"cached long-path hash mismatch rejected");File.WriteAllBytes(wanted,original);
    }
    Call(engine,"CleanupPayloadArtifacts");Check(!Directory.Exists(Path.Combine(currentRoot,"packages")),"complete payload cleanup under Win32 restriction "+length);
   }
   currentRoot=NewRoot(46);engine=New(currentRoot);string flat=Path.Combine(currentRoot,"flat.zip"),flatDest=Path.Combine(currentRoot,"packages",payloadHash.Substring(0,16)+".stage-"+Guid.NewGuid().ToString("N"),"webvideo-plus");
   using(var zip=System.IO.Compression.ZipFile.Open(flat,System.IO.Compression.ZipArchiveMode.Create)){var entry=zip.CreateEntry(Relative);using(var output=entry.Open())output.Write(sample,0,sample.Length);}Call(engine,"Extract",flat,flatDest);Check((string)Call(null,"Hash",Io(Path.Combine(flatDest,Relative.Replace('/',Path.DirectorySeparatorChar))))==Expected,"flat ZIP extraction retains actual long-path bytes");
   string unsafeZip=Path.Combine(currentRoot,"unsafe.zip");using(var zip=System.IO.Compression.ZipFile.Open(unsafeZip,System.IO.Compression.ZipArchiveMode.Create)){zip.CreateEntry("../escaped.txt");}bool unsafeRejected=false;try{Call(engine,"Extract",unsafeZip,flatDest);}catch(Exception e){unsafeRejected=e.Message.Contains("路径校验失败");}Check(unsafeRejected&&!File.Exists(Path.Combine(Path.GetDirectoryName(flatDest),"escaped.txt")),"flat ZIP still rejects parent traversal");
   currentRoot=NewRoot(46);engine=New(currentRoot);File.WriteAllText(Path.Combine(currentRoot,".webvideo-install-cache"),"owned fixture");string prefix=Path.Combine(currentRoot,"packages",payloadHash.Substring(0,16)),owned=prefix+".stage-"+Guid.NewGuid().ToString("N"),foreign=prefix+".stage-"+Guid.NewGuid().ToString("N");
   foreach(string stage in new[]{owned,foreign}){string file=Path.Combine(stage,"webvideo-plus",Relative.Replace('/',Path.DirectorySeparatorChar));Directory.CreateDirectory(Io(Path.GetDirectoryName(file)));File.WriteAllText(Io(file),"owned test data");}File.WriteAllText(Path.Combine(owned,"stage-owner"),payloadHash);
   Call(engine,"CleanupStalePayloadArtifacts");Check(!Directory.Exists(owned)&&File.Exists(Io(Path.Combine(foreign,"webvideo-plus",Relative.Replace('/',Path.DirectorySeparatorChar)))),"owned long crash stage reclaimed; unmarked directory preserved");success=true;
  }catch(Exception e){error=e.ToString();Console.Error.WriteLine(error);}finally{
   foreach(var row in roots){try{string root=Path.GetFullPath(row.Key);if(!root.StartsWith(baseRoot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||(File.GetAttributes(root)&FileAttributes.ReparsePoint)!=0||File.ReadAllText(Path.Combine(root,".longpath-test-owner"))!=row.Value)throw new Exception("Fixture cleanup ownership mismatch");Directory.Delete(Io(root),true);}catch(Exception e){success=false;error=(error??"")+"\nFixture cleanup: "+e.Message;}}
   var output=new{success=success,passed=passed,cases=cases,checks=checks,error=error,systemSettingsChanged=false,scope="Actual installer payload with an opt-out test process; no product or system manifest/registry changes"};string json=new JavaScriptSerializer{MaxJsonLength=8*1024*1024}.Serialize(output);File.WriteAllText(Path.GetFullPath(args[2]),json);Console.WriteLine(json);
  }return success?0:1;
 }
}

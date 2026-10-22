using System;using System.IO;using System.Linq;using System.Text;using System.Collections;using System.Collections.Generic;using System.Diagnostics;using System.Globalization;using System.Security.Cryptography;using System.Threading;using System.Threading.Tasks;using System.Web.Script.Serialization;
namespace NativeVideo {
 public static class J {
  public static JavaScriptSerializer Serializer(){return new JavaScriptSerializer{MaxJsonLength=int.MaxValue,RecursionLimit=256};}
  public static object Parse(string text){return Serializer().DeserializeObject(text.TrimStart('\uFEFF'));}
  public static string Text(object value){return Serializer().Serialize(value);}
  public static Dictionary<string,object> D(object value){return value as Dictionary<string,object>??new Dictionary<string,object>();}
  public static object Get(object value,string key,object fallback=null){object result;return D(value).TryGetValue(key,out result)?result:fallback;}
  public static string S(object value,string key,string fallback=""){object x=Get(value,key);return x==null?fallback:Convert.ToString(x,CultureInfo.InvariantCulture);}
  public static double N(object value,string key,double fallback=0){object x=Get(value,key);double n;return x!=null&&double.TryParse(Convert.ToString(x,CultureInfo.InvariantCulture),NumberStyles.Float,CultureInfo.InvariantCulture,out n)?n:fallback;}
  public static bool B(object value,string key,bool fallback=false){object x=Get(value,key);return x==null?fallback:x is bool?(bool)x:Convert.ToString(x)=="true";}
  public static List<object> A(object value){var e=value as IEnumerable;return value==null||value is string||value is IDictionary?new List<object>():e==null?new List<object>():e.Cast<object>().ToList();}
  public static Dictionary<string,object> O(params object[] values){var d=new Dictionary<string,object>();for(int i=0;i<values.Length;i+=2)d[(string)values[i]]=values[i+1];return d;}
  public static object Read(string file){for(int attempt=0;;attempt++)try{using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))using(var reader=new StreamReader(stream,Encoding.UTF8,true))return Parse(reader.ReadToEnd());}catch(IOException){if(attempt>=2)throw;Thread.Sleep(10);}}
  public static object TryRead(string file){try{return Read(file);}catch{return null;}}
  public static void Write(string file,object value){Files.Atomic(file,Text(value));}
  public static string Num(double value){return value.ToString("0.###############",CultureInfo.InvariantCulture);}
 }
 public static class VersionInfo {
  static object Manifest(){foreach(var name in new[]{"MANIFEST.json","product.json"}){var data=J.TryRead(Path.Combine(Files.Root,name));if(data!=null)return data;}throw new IOException("WebVideo+ 版本清单缺失，请重新构建或重新安装组件。");}
  public static string Product{get{var value=J.S(Manifest(),"version");if(value=="")throw new IOException("WebVideo+ 产品版本缺失，请重新构建或重新安装组件。");return value;}}
  public static string Internal{get{return J.S(Manifest(),"internalVersion");}}
  public static string Kernel{get{var value=J.S(Manifest(),"kernelVersion");if(value=="")throw new IOException("WebVideo+ 内核版本缺失，请重新构建或重新安装组件。");return value;}}
 }
 public static class Files {
  public static readonly Encoding Utf8=new UTF8Encoding(false);
  public static string Root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
  public static string Exe{get{return Path.Combine(Root,"WebGAL.Video.exe");}}
  public static string Full(string file){return Path.GetFullPath(file);}
  public static bool Within(string root,string target,bool allowRoot=false){root=Full(root).TrimEnd('\\','/');target=Full(target);return allowRoot&&target.Equals(root,StringComparison.OrdinalIgnoreCase)||target.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
  public static string Under(string root,string relative){var p=Full(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));if(!Within(root,p))throw new IOException("路径超出指定目录");return p;}
  public static void EnsureParent(string file){Directory.CreateDirectory(Path.GetDirectoryName(Full(file)));}
  public static bool LongPathsEnabled{get{bool legacy,blocked;return AppContext.TryGetSwitch("Switch.System.IO.UseLegacyPathHandling",out legacy)&&!legacy&&AppContext.TryGetSwitch("Switch.System.IO.BlockLongPaths",out blocked)&&!blocked;}}
  public static void CheckAtomicPath(string file){string full=Full(file);if(!LongPathsEnabled&&full.Length>=260||Path.GetFileName(full).Length>255)throw new PathTooLongException("文件路径过长："+full);}
  public static void Atomic(string file,string text){AtomicBytes(file,Utf8.GetBytes(text));}
  public static void AtomicBytes(string file,byte[] bytes){
   file=Full(file);CheckAtomicPath(file);string parent=Path.GetDirectoryName(file);int available=LongPathsEnabled?255:259-parent.Length-1;
   if(available<1)throw new PathTooLongException("临时文件路径过长："+file);
   EnsureParent(file);string temporary=null;
   for(int attempt=0;attempt<32;attempt++){
    string candidate=Path.Combine(parent,Guid.NewGuid().ToString("N").Substring(0,Math.Min(12,available)));FileStream stream;
    try{stream=new FileStream(candidate,FileMode.CreateNew,FileAccess.Write,FileShare.None);}catch(IOException){if(!File.Exists(candidate))throw;continue;}
    temporary=candidate;
    try{using(stream)stream.Write(bytes,0,bytes.Length);}catch{try{File.Delete(temporary);}catch{}throw;}
    break;
   }
   if(temporary==null)throw new IOException("无法创建临时文件："+file);
   try{for(int attempt=0;;attempt++)try{if(File.Exists(file))File.Replace(temporary,file,null);else File.Move(temporary,file);break;}catch(IOException){if(attempt>=20)throw;Thread.Sleep(25);}}
   finally{if(File.Exists(temporary))File.Delete(temporary);}
  }
  public static void Append(string file,object value){EnsureParent(file);lock(App.LogLock)File.AppendAllText(file,J.Text(value)+"\n",Utf8);}
  public static string Hash(string file){using(var s=File.OpenRead(file))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
  public static string HashText(string text){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(Utf8.GetBytes(text))).Replace("-","").ToLowerInvariant();}
  public static void CopyFile(string source,string target){EnsureParent(target);if(File.Exists(target))File.Delete(target);File.Copy(source,target);}
  public static void CopyTree(string source,string target,Action<string,long> copied=null){if(!Directory.Exists(source))return;if(Within(source,target,true))throw new IOException("副本目录必须位于源目录之外");Directory.CreateDirectory(target);foreach(var d in Directory.GetDirectories(source)){if((File.GetAttributes(d)&FileAttributes.ReparsePoint)!=0)throw new IOException("素材目录不能包含目录链接："+d);CopyTree(d,Path.Combine(target,Path.GetFileName(d)),copied);}foreach(var f in Directory.GetFiles(source)){CopyFile(f,Path.Combine(target,Path.GetFileName(f)));if(copied!=null)copied(f,new FileInfo(f).Length);}}
  public static void DeleteTree(string allowedRoot,string target){target=Full(target);if(!Within(allowedRoot,target))throw new IOException("拒绝删除指定根目录以外的路径");if(Directory.Exists(target)){if((File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0){Directory.Delete(target);return;}foreach(var d in Directory.GetDirectories(target))DeleteTree(allowedRoot,d);foreach(var f in Directory.GetFiles(target))File.Delete(f);Directory.Delete(target);}}
 }
 public static class TerreUserData {
  public static string DefaultGamesRoot{get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".webgal_terre","games");}}
  public static bool SamePath(string left,string right){return !string.IsNullOrWhiteSpace(left)&&!string.IsNullOrWhiteSpace(right)&&Files.Full(left).TrimEnd('\\','/').Equals(Files.Full(right).TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase);}
  // Terre 4.6 selects install/data in portable mode; otherwise config.json in
  // ~/.webgal_terre may redirect the active user data root to any directory.
  public static string GamesRoot(string terreDir,string configRoot=null){
   string app=Files.Full(terreDir),config=Files.Full(configRoot??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".webgal_terre")),portable=Path.Combine(app,"data");
   if(Directory.Exists(portable))return Path.Combine(portable,"games");
   string configured=J.S(J.TryRead(Path.Combine(config,"config.json")),"userDataPath");
   if(!string.IsNullOrWhiteSpace(configured))try{return Path.Combine(Files.Full(Path.IsPathRooted(configured)?configured:Path.Combine(app,configured)),"games");}catch{}
   return Path.Combine(config,"games");
  }
  public static string ScenePath(string gamesRoot,string game,string scene){string project=Files.Under(gamesRoot,game);return Files.Under(Path.Combine(project,"game","scene"),scene);}
  public static Dictionary<string,string> FindScene(string configuredGamesRoot,string detectedGamesRoot,string game,string scene){
   foreach(var root in new[]{detectedGamesRoot,configuredGamesRoot}.Where(x=>!string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase)){
    string file=ScenePath(root,game,scene);if(File.Exists(file))return new Dictionary<string,string>{{"root",Files.Full(root)},{"project",Files.Under(root,game)},{"file",file}};
   }
   return null;
  }
 }
 public static class WorkCache {
  public static void CleanupBrowserProfile(string parent){string profile=Path.Combine(parent,"profile");try{if(Directory.Exists(profile))Files.DeleteTree(parent,profile);}catch{}}
  public static void CleanupProfiles(object request){
   string work=J.S(request,"jobDir");if(string.IsNullOrWhiteSpace(work)||!Directory.Exists(work))return;
   CleanupBrowserProfile(Path.Combine(work,"planning"));string parts=Path.Combine(work,"parts");if(Directory.Exists(parts))foreach(var part in Directory.GetDirectories(parts))CleanupBrowserProfile(part);
  }
  public static void CleanupCompleted(object request){
   string work=J.S(request,"jobDir"),record=J.S(request,"recordDir",work);if(string.IsNullOrWhiteSpace(work)||!Directory.Exists(work))return;
   if(!Files.Full(work).Equals(Files.Full(record),StringComparison.OrdinalIgnoreCase)){
    string root=J.S(request,"cacheRoot");if(!string.IsNullOrWhiteSpace(root)&&Files.Within(root,work)){Files.DeleteTree(root,work);return;}
    throw new IOException("工作缓存目录不在记录的缓存根目录内，未自动删除："+work);
   }
   foreach(var name in new[]{"parts","planning","music-snapshot","subtitle-snapshot"}){string path=Path.Combine(work,name);if(Directory.Exists(path))Files.DeleteTree(work,path);}
   foreach(var name in new[]{"audio.wav","concat.txt","mix.log","subtitle.log"}){string path=Path.Combine(work,name);if(File.Exists(path))File.Delete(path);}
  }
  public static void DeleteAll(object request,string recordRoot,string recordDir){
   string work=J.S(request,"jobDir",recordDir);if(!string.IsNullOrWhiteSpace(work)&&Directory.Exists(work)&&!Files.Full(work).Equals(Files.Full(recordDir),StringComparison.OrdinalIgnoreCase)){string root=J.S(request,"cacheRoot");if(string.IsNullOrWhiteSpace(root)||!Files.Within(root,work))throw new IOException("拒绝删除未验证的工作缓存目录："+work);Files.DeleteTree(root,work);}
   if(Directory.Exists(recordDir))Files.DeleteTree(recordRoot,recordDir);
  }
 }
 public sealed class CommandResult {public int Code;public string Text,Error;public byte[] Bytes;}
 public static class Commands {
  public static string RuntimePath="";
  public static string Quote(string s){return "\""+System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(s,@"(\\*)""","$1$1\\\""),@"(\\+)$","$1$1")+"\"";}
  public static string Resolve(string name){if(Path.IsPathRooted(name)){if(!File.Exists(name))throw new FileNotFoundException("缺少运行文件",name);return name;}string n=Path.HasExtension(name)?name:name+".exe";foreach(var d in new[]{Path.Combine(Files.Root,"bin"),RuntimePath,Files.Root}.Concat((Environment.GetEnvironmentVariable("PATH")??"").Split(';')).Where(x=>!string.IsNullOrWhiteSpace(x))){var f=Path.Combine(d.Trim('"'),n);if(File.Exists(f))return f;}throw new FileNotFoundException("缺少 "+n+"，请重新安装导出组件");}
  public static Process Start(string exe,IEnumerable<string> args,bool guard=true,bool input=false){exe=Resolve(exe);var values=args.ToArray();if(guard){values=new[]{Process.GetCurrentProcess().Id.ToString(),exe}.Concat(values).ToArray();exe=Path.Combine(Files.Root,"process-guard.exe");}var p=new Process{StartInfo=new ProcessStartInfo(exe,string.Join(" ",values.Select(Quote))){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=input,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=Files.Root,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8}};if(!string.IsNullOrEmpty(RuntimePath))p.StartInfo.EnvironmentVariables["PATH"]=RuntimePath+";"+p.StartInfo.EnvironmentVariables["PATH"];p.Start();return p;}
  public static void Observe(Task task){task.ContinueWith(t=>{var observed=t.Exception;},TaskContinuationOptions.OnlyOnFaulted);}
  public static void Stop(Process process){try{if(!process.HasExited)process.Kill();}catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){}}
  public static async Task Await(Task task,int timeoutMs,string operation,CancellationToken cancellation=default(CancellationToken)){using(var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation)){var delay=Task.Delay(timeoutMs,deadline.Token);if(await Task.WhenAny(task,delay)!=task){Observe(task);cancellation.ThrowIfCancellationRequested();throw new TimeoutException(operation+"超时");}deadline.Cancel();await task;}}
  public static async Task<string> ErrorText(Task<string> error){try{await Await(error,5000,"编码器错误输出关闭");return await error;}catch(TimeoutException){return "编码器错误输出未及时关闭。";}}
  public static async Task WriteInput(Process process,Task<string> error,byte[] bytes,int timeoutMs=60000){try{if(process.HasExited)throw new IOException("编码器提前退出："+await ErrorText(error));await Await(process.StandardInput.BaseStream.WriteAsync(bytes,0,bytes.Length),timeoutMs,"编码器接收一帧");}catch{Stop(process);throw;}}
  public static async Task<string> FinishInput(Process process,Task stdout,Task<string> error,int timeoutMs=120000,int drainTimeoutMs=5000){try{var watch=Stopwatch.StartNew();await Await(Task.Run(()=>process.StandardInput.Close()),timeoutMs,"编码器输入关闭");while(!process.HasExited){if(watch.ElapsedMilliseconds>=timeoutMs)throw new TimeoutException("编码器收尾超时");await Task.Delay(20);}await Await(Task.WhenAll(stdout,error),drainTimeoutMs,"编码进程退出后输出排空");return await error;}catch{Stop(process);Observe(stdout);Observe(error);throw;}}
  public static async Task<CommandResult> Run(string exe,IEnumerable<string> args,string log=null,int timeoutMs=120000,CancellationToken cancellation=default(CancellationToken),bool binary=false){using(var p=Start(exe,args))using(var mem=new MemoryStream())using(var timeout=new CancellationTokenSource(timeoutMs))using(var linked=CancellationTokenSource.CreateLinkedTokenSource(timeout.Token,cancellation)){var err=p.StandardError.ReadToEndAsync();var data=p.StandardOutput.BaseStream.CopyToAsync(mem);try{while(!p.HasExited){linked.Token.ThrowIfCancellationRequested();await Task.Delay(50,linked.Token);}await Await(Task.WhenAll(data,err),Timeout.Infinite,"进程输出排空",linked.Token);var error=await err;var bytes=mem.ToArray();var text=binary?null:Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF');if(log!=null)Files.Atomic(log,(text??"")+error);var result=new CommandResult{Code=p.ExitCode,Text=text,Bytes=bytes,Error=error};if(p.ExitCode!=0)throw new IOException(Path.GetFileName(exe)+" 执行失败："+(error.Length>4000?error.Substring(error.Length-4000):error));return result;}catch(OperationCanceledException){Stop(p);if(cancellation.IsCancellationRequested)throw;throw new TimeoutException(Path.GetFileName(exe)+" 执行超时");}finally{Stop(p);Observe(data);Observe(err);}}}
  public static async Task<object> Probe(string file,bool full=false){var args=new List<string>{"-v","error","-threads",full?"8":"2"};if(full)args.Add("-count_frames");args.AddRange(new[]{"-show_entries","format=duration,size:stream=codec_type,nb_frames,nb_read_frames,width,height,r_frame_rate,duration,pix_fmt,color_range,color_space,color_transfer,color_primaries:stream_tags=alpha_mode","-of","json",file});return J.Parse((await Run("ffprobe",args,null,full?7200000:15000)).Text);}
  public static async Task<double> Duration(string file){var p=await Probe(file);var d=J.N(J.Get(p,"format"),"duration");if(d<=0)throw new IOException("无法读取媒体时长："+Path.GetFileName(file));return d*1000;}
  public static bool Alive(int pid){try{return pid>0&&!Process.GetProcessById(pid).HasExited;}catch(System.ComponentModel.Win32Exception e){return e.NativeErrorCode==5;}catch{return false;}}
 }
 public static class GpuEncoding {
  public const string UnavailableMarker="[ENCODER_UNAVAILABLE]";
  static readonly string[] Hardware=new[]{"nvenc","amf","qsv"};static readonly object gate=new object();static readonly Dictionary<string,bool> availability=new Dictionary<string,bool>(StringComparer.OrdinalIgnoreCase);
  public static bool IsHardware(string codec){return Hardware.Contains((codec??"").ToLowerInvariant());}
  public static string NormalizeMode(string mode){mode=(mode??"").Trim().ToLowerInvariant();if(mode==""||mode=="auto"||mode=="off")return "recommended";if(mode=="x264rgb")return "lossless";if(mode=="nvenc"||mode=="amf"||mode=="qsv"||mode=="x264")return "quality";if(new[]{"recommended","quality","lossless","traditional"}.Contains(mode))return mode;throw new ArgumentException("视频编码模式无效："+mode);}
  public static int Quality(string mode){return NormalizeMode(mode)=="quality"?18:21;}
  public static string Filter(string codec){codec=(codec??"").ToLowerInvariant();if(codec=="x264rgb")return "vflip,format=rgb24";return "vflip,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format="+(codec=="x264"?"yuv420p":"nv12");}
  public static void AddEncoderArgs(List<string> args,string codec,string mode){
   codec=(codec??"").ToLowerInvariant();mode=NormalizeMode(mode);int q=Quality(mode);
   if(codec=="x264rgb"){args.AddRange(new[]{"-c:v","libx264rgb","-preset","ultrafast","-crf","0","-pix_fmt","rgb24","-color_range","pc","-x264-params","fullrange=on:colorprim=bt709:transfer=iec61966-2-1","-threads","2"});return;}
   if(codec=="nvenc")args.AddRange(new[]{"-c:v","h264_nvenc","-preset",mode=="quality"?"p5":"p4","-tune","hq","-rc","vbr","-cq",q.ToString(CultureInfo.InvariantCulture),"-b:v","0"});
   else if(codec=="amf")args.AddRange(new[]{"-c:v","h264_amf","-quality",mode=="quality"?"quality":"balanced","-rc","cqp","-qp_i",q.ToString(CultureInfo.InvariantCulture),"-qp_p",q.ToString(CultureInfo.InvariantCulture),"-qp_b",Math.Min(51,q+2).ToString(CultureInfo.InvariantCulture)});
   else if(codec=="qsv")args.AddRange(new[]{"-c:v","h264_qsv","-preset",mode=="quality"?"medium":"veryfast","-global_quality",q.ToString(CultureInfo.InvariantCulture)});
   else if(codec=="x264")args.AddRange(new[]{"-c:v","libx264","-preset",mode=="quality"?"fast":"veryfast","-crf",q.ToString(CultureInfo.InvariantCulture),"-threads","2"});
   else throw new ArgumentException("不支持的视频编码器："+codec);
   args.AddRange(new[]{"-pix_fmt","yuv420p","-color_range","tv","-colorspace","bt709","-color_primaries","bt709","-color_trc","iec61966-2-1"});
  }
  static async Task Probe(string codec,string mode,int width,int height,int fps,int frames=1,bool fullPipeline=false){
   string filter=fullPipeline?"format=rgba,"+Filter(codec):codec=="x264rgb"?"format=rgb24":codec=="x264"?"format=yuv420p":"format=nv12";
   var args=new List<string>{"-v","error","-f","lavfi","-i","color=c=black:s="+width+"x"+height+":r="+fps,"-frames:v",Math.Max(1,frames).ToString(CultureInfo.InvariantCulture),"-vf",filter};AddEncoderArgs(args,codec,mode);args.AddRange(new[]{"-f","null","-"});await Commands.Run("ffmpeg",args,null,frames>1?30000:15000);
  }
  public static async Task<bool> Available(string codec){codec=(codec??"").ToLowerInvariant();lock(gate){bool cached;if(availability.TryGetValue(codec,out cached))return cached;}bool ok=false;try{await Probe(codec,codec=="x264rgb"?"lossless":"recommended",640,360,30);ok=true;}catch{}lock(gate)availability[codec]=ok;return ok;}
  public static async Task<string> ResolveCodec(string mode,string preferred=""){
   mode=NormalizeMode(mode);if(mode=="traditional")return "";if(mode=="lossless")return "x264rgb";
   preferred=(preferred??"").ToLowerInvariant();if(preferred!=""){if(!new[]{"nvenc","amf","qsv","x264"}.Contains(preferred))throw new ArgumentException("指定编码器无效："+preferred);if(await Available(preferred))return preferred;return "x264";}
   var probes=Hardware.Select(codec=>Available(codec)).ToArray();var available=await Task.WhenAll(probes);for(int i=0;i<Hardware.Length;i++)if(available[i])return Hardware[i];return "x264";
  }
  public static bool IsCompatibilityError(string message){return new[]{"required nvenc API version","minimum required Nvidia driver","Cannot load nvcuda","Cannot load nvEncodeAPI","No NVENC capable devices","Unknown encoder","AMF failed","CreateComponent","MFX_ERR","unsupported device","device creation failed","no device available"}.Any(x=>(message??"").IndexOf(x,StringComparison.OrdinalIgnoreCase)>=0);}
  public static IOException EncoderError(string codec,string message){return new IOException((IsHardware(codec)?UnavailableMarker+" 当前硬件编码器 "+codec+" 无法继续，WebVideo+ 将尝试回退到 CPU H.264。\n":"")+message);}
  public static async Task<string> CheckRequest(object request){
   if(J.B(request,"analysisOnly")||!J.B(request,"gpuRawExport"))return null;string codec=J.S(request,"gpuRawCodec"),mode=J.S(request,"gpuRawMode",J.S(J.Get(request,"settings"),"gpuRawMode","recommended"));if(!IsHardware(codec))return null;var settings=J.Get(request,"settings");
   try{await Probe(codec,mode,(int)J.N(settings,"width",1920),(int)J.N(settings,"height",1080),(int)J.N(settings,"fps",30),3,true);return null;}catch(Exception error){return error.Message;}
  }
  public static async Task<string> CheckConcurrentRequest(object request,int parallel){
   if(parallel<=1||J.B(request,"analysisOnly")||!J.B(request,"gpuRawExport"))return null;string codec=J.S(request,"gpuRawCodec"),mode=J.S(request,"gpuRawMode",J.S(J.Get(request,"settings"),"gpuRawMode","recommended"));if(!IsHardware(codec))return null;var settings=J.Get(request,"settings");int width=(int)J.N(settings,"width",1920),height=(int)J.N(settings,"height",1080),fps=(int)J.N(settings,"fps",30),count=Math.Max(2,Math.Min(32,parallel));
   try{var probes=Enumerable.Range(0,count).Select(_=>Probe(codec,mode,width,height,fps,8,true)).ToArray();await Task.WhenAll(probes);return null;}catch(Exception error){return "并发硬件编码预检失败（"+count+" 路 "+codec+"，"+width+"x"+height+" @ "+fps+"fps）："+error.Message;}
  }
  public static Task<string> Resolve(string mode){return Task.FromResult(NormalizeMode(mode));}
 }
 public static class Settings {
  public const int DefaultCubismCoreInitialMemoryMiB=128;
  static string NormalizeGpuAdapterLuid(object value){
   if(!(value is string))throw new ArgumentException("GPU 设备编号需要是文本");string text=(string)value;if(string.IsNullOrWhiteSpace(text))return "";var parts=text.Split(',');int high;uint low;
   if(!System.Text.RegularExpressions.Regex.IsMatch(text,@"^-?\d+,\d+$")||parts.Length!=2||!int.TryParse(parts[0],NumberStyles.AllowLeadingSign,CultureInfo.InvariantCulture,out high)||!uint.TryParse(parts[1],NumberStyles.None,CultureInfo.InvariantCulture,out low)||high==0&&low==0)throw new ArgumentException("GPU 设备编号无效，请重新选择设备");
   return high.ToString(CultureInfo.InvariantCulture)+","+low.ToString(CultureInfo.InvariantCulture);
  }
  public static Dictionary<string,object> Validate(object supplied){var d=J.O("width",1920,"height",1080,"fps",30,"mode","auto","bgmBaseMode","auto","workers",4,"textSpeed",50,"autoSpeed",50,"holdSeconds",1,"gpu","auto","gpuAdapterLuid","","engine","webgal","gpuRawMode","recommended","gpuRawPreferenceVersion",2,"gpuRawDom",true,"alphaCaptureMode","fast","preciseTextboxLoopAnimations",false,"allowDecorativePixiCuts",false,"notendVisualTail",true,"strictSegmentCuts",false,"segmentCutMode","auto","manualCutPoints","","cubismCoreInitialMemoryMiB",DefaultCubismCoreInitialMemoryMiB);foreach(var k in d.Keys.ToArray())if(J.Get(supplied,k)!=null)d[k]=J.Get(supplied,k);d["gpuAdapterLuid"]=NormalizeGpuAdapterLuid(J.D(supplied).ContainsKey("gpuAdapterLuid")?J.Get(supplied,"gpuAdapterLuid"):"");if(!new[]{"webgal","mygo"}.Contains(J.S(d,"engine")))throw new ArgumentException("导出引擎无效");int w=(int)J.N(d,"width"),h=(int)J.N(d,"height");if(!new[]{"1280x720","1920x1080","2560x1440","3840x2160"}.Contains(w+"x"+h)||!new[]{30d,60d}.Contains(J.N(d,"fps")))throw new ArgumentException("分辨率或帧率无效");double workers=J.N(d,"workers");if(workers<1||workers>32||workers!=Math.Truncate(workers))throw new ArgumentException("并行数需要填写 1–32 的整数");if(!new[]{"auto","manual","bgm"}.Contains(J.S(d,"mode"))||!new[]{"auto","manual"}.Contains(J.S(d,"bgmBaseMode"))||!new[]{"auto","high","low"}.Contains(J.S(d,"gpu"))||!new[]{"auto","off","recommended","quality","lossless","traditional","x264rgb","nvenc","amf","qsv","x264"}.Contains(J.S(d,"gpuRawMode"))||!new[]{"fast","screenshot"}.Contains(J.S(d,"alphaCaptureMode")))throw new ArgumentException("导出模式、GPU 或编码管线选项无效");d["gpuRawMode"]=GpuEncoding.NormalizeMode(J.S(d,"gpuRawMode"));foreach(var key in new[]{"textSpeed","autoSpeed"})if(J.N(d,key)<-500||J.N(d,key)>100)throw new ArgumentException("播放速度需要在 -500–100 之间，推荐 0–100");if(J.N(d,"holdSeconds")<0||J.N(d,"holdSeconds")>60)throw new ArgumentException("等待时长无效");d["preciseTextboxLoopAnimations"]=J.B(d,"preciseTextboxLoopAnimations",false);d["allowDecorativePixiCuts"]=J.B(d,"allowDecorativePixiCuts",false);d["notendVisualTail"]=J.B(d,"notendVisualTail",true);d["strictSegmentCuts"]=J.B(d,"strictSegmentCuts",false);if(!new[]{"auto","manual"}.Contains(J.S(d,"segmentCutMode")))throw new ArgumentException("切点模式无效");if(!(d["manualCutPoints"] is string))throw new ArgumentException("手动切点需填写文本");if(ManualCuts.Enabled(d))ManualCuts.Parse(J.S(d,"manualCutPoints"),(int)J.N(d,"fps"));double memoryMiB=J.N(d,"cubismCoreInitialMemoryMiB",-1);if(memoryMiB<0||memoryMiB>1024||memoryMiB!=Math.Truncate(memoryMiB)||memoryMiB>0&&memoryMiB<16)throw new ArgumentException("Live2D Core 初始内存需填写 16–1024 MiB 的整数，或使用默认值");d["cubismCoreInitialMemoryMiB"]=(int)memoryMiB;return d;}
 }

 public static class ProcessIdentity {
  public static object Capture(int pid){
   try{
    using(var process=Process.GetProcessById(pid)){
     return J.O("pid",pid,"createdUtcTicks",process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture),"exe",Files.Full(process.MainModule.FileName));
    }
   }
   catch{
    return null;
   }
  }
  public static bool Matches(object identity,string expectedExe=""){
   int pid=(int)J.N(identity,"pid");
   if(pid<=0||J.S(identity,"createdUtcTicks")==""||J.S(identity,"exe")=="")return false;
   var current=Capture(pid);
   return current!=null&&J.S(current,"createdUtcTicks")==J.S(identity,"createdUtcTicks")&&TerreUserData.SamePath(J.S(current,"exe"),J.S(identity,"exe"))&&(expectedExe==""||TerreUserData.SamePath(J.S(current,"exe"),expectedExe));
  }
  public static bool Kill(object identity,string expectedExe){
   if(!Matches(identity,expectedExe))return false;
   using(var process=Process.GetProcessById((int)J.N(identity,"pid"))){
    if(process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture)!=J.S(identity,"createdUtcTicks"))return false;
    process.Kill();
    return process.WaitForExit(5000);
   }
  }
 }
 public sealed class FileSetTransaction {
  readonly string folder,journal;
  readonly Dictionary<string,byte[]> before=new Dictionary<string,byte[]>(StringComparer.OrdinalIgnoreCase);
  readonly Dictionary<string,string> after=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
#if LIFECYCLE_TESTS
  internal static Action<string> Fault=null;
#endif
  [Conditional("LIFECYCLE_TESTS")]
  static void Inject(string file){
#if LIFECYCLE_TESTS
   if(Fault!=null)Fault(file);
#endif
  }
  public FileSetTransaction(string root,IEnumerable<string> targets){
   folder=Path.Combine(root,"r"+Guid.NewGuid().ToString("N").Substring(0,12));
   journal=Path.Combine(folder,"files.json");
   var selected=targets.Distinct(StringComparer.OrdinalIgnoreCase).Select(Files.Full).ToArray();Files.CheckAtomicPath(journal);for(int number=0;number<selected.Length;number++){Files.CheckAtomicPath(selected[number]);Files.CheckAtomicPath(Path.Combine(folder,number.ToString(CultureInfo.InvariantCulture)+".bin"));}
   Directory.CreateDirectory(folder);
   int index=0;
   var entries=new List<object>();
   foreach(string target in selected){
    string path=Files.Full(target);
    byte[] bytes=File.Exists(path)?File.ReadAllBytes(path):null;
    before[path]=bytes;
    string copy=(index++).ToString(CultureInfo.InvariantCulture)+".bin";
    if(bytes!=null)File.WriteAllBytes(Path.Combine(folder,copy),bytes);
    entries.Add(J.O("target",path,"copy",copy,"existed",bytes!=null,"hash",bytes==null?"":Files.Hash(Path.Combine(folder,copy))));
   }
   J.Write(journal,J.O("schemaVersion",1,"state","prepared","entries",entries));
  }
  public string Folder{
   get{
    return folder;
   }
  }
  public void Write(string file,string text){
   file=Files.Full(file);
   if(!before.ContainsKey(file))throw new IOException("事务目标未登记");
   string current=File.Exists(file)?Files.Hash(file):null;
   byte[] bytes=before[file];
   string expected=after.ContainsKey(file)?after[file]:bytes==null?null:Hash(bytes);
   if(current!=expected)throw new IOException("文件已变化，未覆盖："+file);
   var doc=J.D(J.Read(journal));
   foreach(var entry in J.A(J.Get(doc,"entries")))if(J.S(entry,"target")==file)J.D(entry)["expectedAfter"]=Files.HashText(text);
   J.Write(journal,doc);
   Inject(file);
   Files.Atomic(file,text);
   after[file]=Files.Hash(file);
  }
  static string Hash(byte[] bytes){
   using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();
  }
  public void Commit(){
   var doc=J.D(J.Read(journal));
   doc["state"]="committed";
   J.Write(journal,doc);
   try{
    Files.DeleteTree(Path.GetDirectoryName(folder),folder);
   }
   catch(IOException){
   }
   catch(UnauthorizedAccessException){
   }
  }
  public void Rollback(){
   var failures=new List<string>();
   foreach(var pair in before.Reverse()){
    try{
     string expected;
     string current=File.Exists(pair.Key)?Files.Hash(pair.Key):null;
     expected=after.ContainsKey(pair.Key)?after[pair.Key]:pair.Value==null?null:Hash(pair.Value);
     if(current!=expected)throw new IOException("恢复目标被其它写入更改");
     if(pair.Value==null){
      if(File.Exists(pair.Key))File.Delete(pair.Key);
     }
     else{
      Files.EnsureParent(pair.Key);
      Inject("rollback:"+pair.Key);
      Files.AtomicBytes(pair.Key,pair.Value);
     }
    }
    catch(Exception error){
     failures.Add(pair.Key+": "+error.Message);
    }
   }
   if(failures.Count>0)throw new IOException("恢复未完成，副本保留于 "+folder+"；"+string.Join("；",failures));
   Files.DeleteTree(Path.GetDirectoryName(folder),folder);
  }
  public static void Recover(string root,string allowedRoot){
   if(!Directory.Exists(root))return;
   foreach(string folder in Directory.GetDirectories(root)){
    string journal=Path.Combine(folder,"files.json");
    if(!File.Exists(journal))continue;
    var doc=J.Read(journal);
    if(J.N(doc,"schemaVersion")!=1)throw new IOException("事务记录版本无效："+folder);
    if(J.S(doc,"state")=="committed"){
     Files.DeleteTree(root,folder);
     continue;
    }
    var entries=J.A(J.Get(doc,"entries"));
    foreach(var item in entries){
     string target=J.S(item,"target"),copy=J.S(item,"copy");
     if(!Files.Within(allowedRoot,target)||Path.GetFileName(copy)!=copy)throw new IOException("恢复记录路径无效："+folder);
     string source=Files.Under(folder,copy);
     if(J.B(item,"existed")&&(!File.Exists(source)||Files.Hash(source)!=J.S(item,"hash")))throw new IOException("恢复副本校验失败："+folder);
     string current=File.Exists(target)?Files.Hash(target):"",beforeHash=J.S(item,"hash"),expectedAfter=J.S(item,"expectedAfter");
     if(current!=beforeHash&&current!=expectedAfter)throw new IOException("恢复目标已变化，副本保留于 "+folder);
    }
    foreach(var item in entries){
     string target=J.S(item,"target");
     if(J.B(item,"existed")){
      Files.AtomicBytes(target,File.ReadAllBytes(Files.Under(folder,J.S(item,"copy"))));
     }
     else if(File.Exists(target))File.Delete(target);
    }
    Files.DeleteTree(root,folder);
   }
  }
 }
 public static class RecoverableSettings {
  static Dictionary<string,object> Apply(Dictionary<string,object> current,object supplied,params string[] keys){
   var candidate=new Dictionary<string,object>(current);
   foreach(string key in keys)if(J.Get(supplied,key)!=null)candidate[key]=J.Get(supplied,key);
   try{
    return Settings.Validate(candidate);
   }
   catch(ArgumentException){
    return current;
   }
  }
  public static Dictionary<string,object> Load(string file){
   object stored=J.TryRead(file);
   try{
    return Settings.Validate(stored);
   }
   catch(ArgumentException){
    if(File.Exists(file)){
     string copy=file+".invalid-"+DateTime.UtcNow.ToString("yyyyMMddHHmmssfff")+"-"+Guid.NewGuid().ToString("N")+".json";
     File.Copy(file,copy);
    }
    var recovered=Settings.Validate(null);
    foreach(string key in recovered.Keys.ToArray())if(!new[]{
     "width","height","segmentCutMode","manualCutPoints"
    }
    .Contains(key))recovered=Apply(recovered,stored,key);
    recovered=Apply(recovered,stored,"width","height");
    recovered=Apply(recovered,stored,"segmentCutMode","manualCutPoints");
    J.Write(file,recovered);
    return recovered;
   }
  }
 }
 public static partial class App {public static readonly object LogLock=new object();}
}

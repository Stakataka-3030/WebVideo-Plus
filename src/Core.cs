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
  public static void Atomic(string file,string text){EnsureParent(file);var temp=file+".tmp-"+Guid.NewGuid().ToString("N");File.WriteAllText(temp,text,Utf8);try{for(int i=0;;i++)try{if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);break;}catch(IOException){if(i>=20)throw;Thread.Sleep(25);}}finally{if(File.Exists(temp))File.Delete(temp);}}
  public static void Append(string file,object value){EnsureParent(file);lock(App.LogLock)File.AppendAllText(file,J.Text(value)+"\n",Utf8);}
  public static string Hash(string file){using(var s=File.OpenRead(file))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
  public static string HashText(string text){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(Utf8.GetBytes(text))).Replace("-","").ToLowerInvariant();}
  public static void CopyFile(string source,string target){EnsureParent(target);if(File.Exists(target))File.Delete(target);File.Copy(source,target);}
  public static void CopyTree(string source,string target,Action<string,long> copied=null){if(!Directory.Exists(source))return;if(Within(source,target,true))throw new IOException("副本目录必须位于源目录之外");Directory.CreateDirectory(target);foreach(var d in Directory.GetDirectories(source)){if((File.GetAttributes(d)&FileAttributes.ReparsePoint)!=0)throw new IOException("素材目录不能包含目录链接："+d);CopyTree(d,Path.Combine(target,Path.GetFileName(d)),copied);}foreach(var f in Directory.GetFiles(source)){CopyFile(f,Path.Combine(target,Path.GetFileName(f)));if(copied!=null)copied(f,new FileInfo(f).Length);}}
  public static void DeleteTree(string allowedRoot,string target){target=Full(target);if(!Within(allowedRoot,target))throw new IOException("拒绝删除指定根目录以外的路径");if(Directory.Exists(target)){if((File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0){Directory.Delete(target);return;}foreach(var d in Directory.GetDirectories(target))DeleteTree(allowedRoot,d);foreach(var f in Directory.GetFiles(target))File.Delete(f);Directory.Delete(target);}}
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
  public static async Task<CommandResult> Run(string exe,IEnumerable<string> args,string log=null,int timeoutMs=120000,CancellationToken cancellation=default(CancellationToken),bool binary=false){using(var p=Start(exe,args))using(var mem=new MemoryStream())using(var timeout=new CancellationTokenSource(timeoutMs))using(var linked=CancellationTokenSource.CreateLinkedTokenSource(timeout.Token,cancellation)){var err=p.StandardError.ReadToEndAsync();var data=p.StandardOutput.BaseStream.CopyToAsync(mem);try{while(!p.HasExited){linked.Token.ThrowIfCancellationRequested();await Task.Delay(50,linked.Token);}await data;var error=await err;var bytes=mem.ToArray();var text=binary?null:Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF');if(log!=null)Files.Atomic(log,(text??"")+error);var result=new CommandResult{Code=p.ExitCode,Text=text,Bytes=bytes,Error=error};if(p.ExitCode!=0)throw new IOException(Path.GetFileName(exe)+" 执行失败："+(error.Length>4000?error.Substring(error.Length-4000):error));return result;}catch(OperationCanceledException){if(!p.HasExited)p.Kill();if(cancellation.IsCancellationRequested)throw;throw new TimeoutException(Path.GetFileName(exe)+" 执行超时");}finally{if(!p.HasExited)p.Kill();}}}
  public static async Task<object> Probe(string file,bool full=false){var args=new List<string>{"-v","error","-threads",full?"8":"2"};if(full)args.Add("-count_frames");args.AddRange(new[]{"-show_entries","format=duration,size:stream=codec_type,nb_frames,nb_read_frames,width,height,r_frame_rate,duration,pix_fmt,color_range,color_space,color_transfer,color_primaries","-of","json",file});return J.Parse((await Run("ffprobe",args,null,full?7200000:15000)).Text);}
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
  static async Task Probe(string codec,string mode,int width,int height,int fps){
   var args=new List<string>{"-v","error","-f","lavfi","-i","color=c=black:s="+width+"x"+height+":r="+fps,"-frames:v","1","-vf",codec=="x264rgb"?"format=rgb24":codec=="x264"?"format=yuv420p":"format=nv12"};AddEncoderArgs(args,codec,mode);args.AddRange(new[]{"-f","null","-"});await Commands.Run("ffmpeg",args,null,15000);
  }
  public static async Task<bool> Available(string codec){codec=(codec??"").ToLowerInvariant();lock(gate){bool cached;if(availability.TryGetValue(codec,out cached))return cached;}bool ok=false;try{await Probe(codec,codec=="x264rgb"?"lossless":"recommended",64,64,30);ok=true;}catch{}lock(gate)availability[codec]=ok;return ok;}
  public static async Task<string> ResolveCodec(string mode,string preferred=""){
   mode=NormalizeMode(mode);if(mode=="traditional")return "";if(mode=="lossless")return "x264rgb";
   preferred=(preferred??"").ToLowerInvariant();if(preferred!=""){if(!new[]{"nvenc","amf","qsv","x264"}.Contains(preferred))throw new ArgumentException("指定编码器无效："+preferred);if(await Available(preferred))return preferred;return "x264";}
   var probes=Hardware.Select(codec=>Available(codec)).ToArray();var available=await Task.WhenAll(probes);for(int i=0;i<Hardware.Length;i++)if(available[i])return Hardware[i];return "x264";
  }
  public static bool IsCompatibilityError(string message){return new[]{"required nvenc API version","minimum required Nvidia driver","Cannot load nvcuda","Cannot load nvEncodeAPI","No NVENC capable devices","Unknown encoder","AMF failed","CreateComponent","MFX_ERR","unsupported device","device creation failed","no device available"}.Any(x=>(message??"").IndexOf(x,StringComparison.OrdinalIgnoreCase)>=0);}
  public static IOException EncoderError(string codec,string message){return new IOException((IsHardware(codec)?UnavailableMarker+" 当前硬件编码器 "+codec+" 无法继续，WebVideo+ 将尝试回退到 CPU H.264。\n":"")+message);}
  public static async Task<string> CheckRequest(object request){
   if(J.B(request,"analysisOnly")||!J.B(request,"gpuRawExport"))return null;string codec=J.S(request,"gpuRawCodec"),mode=J.S(request,"gpuRawMode",J.S(J.Get(request,"settings"),"gpuRawMode","recommended"));if(!IsHardware(codec))return null;var settings=J.Get(request,"settings");
   try{await Probe(codec,mode,(int)J.N(settings,"width",1920),(int)J.N(settings,"height",1080),(int)J.N(settings,"fps",30));return null;}catch(Exception error){return error.Message;}
  }
  public static Task<string> Resolve(string mode){return Task.FromResult(NormalizeMode(mode));}
 }
 public static class Settings {
  public static Dictionary<string,object> Validate(object supplied){var d=J.O("width",1920,"height",1080,"fps",30,"mode","auto","bgmBaseMode","auto","workers",4,"textSpeed",50,"autoSpeed",50,"holdSeconds",1,"gpu","auto","engine","webgal","gpuRawMode","recommended","gpuRawPreferenceVersion",2,"gpuRawDom",true);foreach(var k in d.Keys.ToArray())if(J.Get(supplied,k)!=null)d[k]=J.Get(supplied,k);if(!new[]{"webgal","mygo"}.Contains(J.S(d,"engine")))throw new ArgumentException("导出引擎无效");int w=(int)J.N(d,"width"),h=(int)J.N(d,"height");if(!new[]{"1280x720","1920x1080","2560x1440","3840x2160"}.Contains(w+"x"+h)||!new[]{30d,60d}.Contains(J.N(d,"fps")))throw new ArgumentException("分辨率或帧率无效");double workers=J.N(d,"workers");if(workers<1||workers>32||workers!=Math.Truncate(workers))throw new ArgumentException("并行数需要填写 1–32 的整数");if(!new[]{"auto","manual","bgm"}.Contains(J.S(d,"mode"))||!new[]{"auto","manual"}.Contains(J.S(d,"bgmBaseMode"))||!new[]{"auto","high","low"}.Contains(J.S(d,"gpu"))||!new[]{"auto","off","recommended","quality","lossless","traditional","x264rgb","nvenc","amf","qsv","x264"}.Contains(J.S(d,"gpuRawMode")))throw new ArgumentException("导出模式、GPU 或编码管线选项无效");d["gpuRawMode"]=GpuEncoding.NormalizeMode(J.S(d,"gpuRawMode"));foreach(var key in new[]{"textSpeed","autoSpeed"})if(J.N(d,key)<-500||J.N(d,key)>100)throw new ArgumentException("播放速度需要在 -500–100 之间，推荐 0–100");if(J.N(d,"holdSeconds")<0||J.N(d,"holdSeconds")>60)throw new ArgumentException("等待时长无效");return d;}
 }
 public static partial class App {public static readonly object LogLock=new object();}
}

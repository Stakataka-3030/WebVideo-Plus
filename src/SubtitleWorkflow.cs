using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Globalization;using System.Text.RegularExpressions;using System.Threading.Tasks;
namespace NativeVideo {
 public static class SubtitleWorkflow {
  static readonly string[] Extensions=new[]{".srt",".ass",".ssa"};
  public static string ValidateSource(string value){
   if(string.IsNullOrWhiteSpace(value))throw new ArgumentException("请选择字幕文件");
   string file=Files.Full(value),ext=Path.GetExtension(file).ToLowerInvariant();if(!Extensions.Contains(ext))throw new ArgumentException("字幕仅支持 SRT、ASS 和 SSA");
   if(!File.Exists(file))throw new FileNotFoundException("字幕文件不存在",file);if(new FileInfo(file).Length>16L*1024*1024)throw new ArgumentException("字幕文件超过 16 MB");
   return file;
  }
  static double Number(object value,string message,double min,double max){
   double n;if(value==null||!double.TryParse(Convert.ToString(value,CultureInfo.InvariantCulture),NumberStyles.Float,CultureInfo.InvariantCulture,out n)||double.IsNaN(n)||double.IsInfinity(n)||n<min||n>max)throw new ArgumentException(message);return n;
  }
  static object NormalizeAnchor(object value){
   string type=J.S(value,"type","video");if(!new[]{"video","timeline","music","manual"}.Contains(type))throw new ArgumentException("字幕时间基准无效");
   if(type=="video")return J.O("type","video");
   if(type=="manual")return J.O("type","manual","seconds",Number(J.Get(value,"seconds"),"手动字幕时间无效",0,86400));
   if(type=="music"){
    string id=J.S(value,"musicId");if(string.IsNullOrWhiteSpace(id)||id.Length>128)throw new ArgumentException("请选择作为字幕基准的成片音乐");
    return J.O("type","music","musicId",id);
   }
   string scene=SceneChain.NormalizeScene(J.S(value,"scene"));double line=J.N(value,"line");if(scene==null||line<1||line!=Math.Truncate(line))throw new ArgumentException("字幕时间线语句位置无效");
   string sourceHash=J.S(value,"sourceHash");if(sourceHash!=""&&!Regex.IsMatch(sourceHash,"^[0-9a-fA-F]{64}$"))throw new ArgumentException("字幕时间线语句校验值无效");
   return J.O("type","timeline","scene",scene,"line",(int)line,"sourceHash",sourceHash,"label",J.S(value,"label"));
  }
  public static object Snapshot(object supplied,string jobDir,bool enabled){
   if(!enabled||supplied==null)return null;string source=ValidateSource(J.S(supplied,"sourcePath")),mode=J.S(supplied,"mode","soft");if(!new[]{"soft","burn"}.Contains(mode))throw new ArgumentException("字幕输出方式无效");
   string folder=Path.Combine(jobDir,"subtitle-snapshot");Directory.CreateDirectory(folder);string target=Path.Combine(folder,"subtitle"+Path.GetExtension(source).ToLowerInvariant());Files.CopyFile(source,target);
   return J.O("file",target,"name",Path.GetFileName(source),"mode",mode,"anchor",NormalizeAnchor(J.Get(supplied,"anchor")));
  }
  static double Relative(double value,object bounds,string description){
   double start=J.N(bounds,"startSeconds"),duration=J.N(bounds,"durationSeconds"),relative=value-start;if(relative<-.001)throw new ArgumentException(description+"位于本次导出范围之前");if(relative>duration+.001)throw new ArgumentException(description+"位于本次导出范围之后");return Math.Max(0,Math.Min(duration,relative));
  }
  public static double ResolveAnchor(object subtitle,object timing,object bounds,object musicTimeline){
   var anchor=J.Get(subtitle,"anchor");string type=J.S(anchor,"type","video");if(type=="video")return 0;
   double duration=J.N(bounds,"durationSeconds");
   if(type=="manual"){double seconds=Number(J.Get(anchor,"seconds"),"手动字幕时间无效",0,86400);if(seconds>duration+.001)throw new ArgumentException("手动字幕时间位于成片结尾之后");return seconds;}
   if(type=="music"){
    if(musicTimeline==null)throw new ArgumentException("字幕基准使用了成片音乐，但本次导出未启用成片音乐");
    string id=J.S(anchor,"musicId");var track=J.A(J.Get(musicTimeline,"tracks")).FirstOrDefault(item=>J.S(item,"id")==id);if(track==null)throw new ArgumentException("作为字幕基准的成片音乐已不存在，请重新选择");
    double start=J.N(track,"startSeconds");string legacy=J.S(track,"legacyScene");if(legacy!=""){var legacyScene=J.A(J.Get(J.Get(timing,"storyTimeline"),"scenes")).FirstOrDefault(item=>J.S(item,"scene").Equals(legacy,StringComparison.OrdinalIgnoreCase));if(legacyScene==null)throw new ArgumentException("旧版成片音乐所属场景不在本次故事时间线中，请先重新保存音乐配置");start+=J.N(legacyScene,"startSeconds");}
    return Relative(start,bounds,"所选成片音乐");
   }
   if(type=="timeline"){
    string scene=J.S(anchor,"scene");int line=(int)J.N(anchor,"line");var story=J.Get(timing,"storyTimeline");var item=J.A(J.Get(story,"scenes")).FirstOrDefault(x=>J.S(x,"scene").Equals(scene,StringComparison.OrdinalIgnoreCase));if(item==null)throw new ArgumentException("所选字幕时间线语句不在本次故事时间线中");
    string expected=J.S(anchor,"sourceHash");if(expected!=""&&!J.S(item,"hash").Equals(expected,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("所选字幕时间线语句所在场景已经变化，请重新选择");
    var times=J.A(J.Get(item,"lineTimes"));if(line<1||line>times.Count||times[line-1]==null)throw new ArgumentException("所选 WebGAL 语句没有可定位的执行时间，请选择实际执行的语句");
    double ms=Number(times[line-1],"所选 WebGAL 语句时间无效",0,86400000);return Relative(ms/1000,bounds,"所选 WebGAL 语句");
   }
   throw new ArgumentException("字幕时间基准无效");
  }
  static double ParseSrtTime(string value){
   var m=Regex.Match(value,@"^(\d+):(\d{2}):(\d{2})[,.](\d{3})$");if(!m.Success)throw new FormatException("SRT 时间格式无效");
   return int.Parse(m.Groups[1].Value,CultureInfo.InvariantCulture)*3600+int.Parse(m.Groups[2].Value,CultureInfo.InvariantCulture)*60+int.Parse(m.Groups[3].Value,CultureInfo.InvariantCulture)+int.Parse(m.Groups[4].Value,CultureInfo.InvariantCulture)/1000.0;
  }
  static string SrtTime(double value,char separator){
   long ms=(long)Math.Round(Math.Max(0,value)*1000,MidpointRounding.AwayFromZero),hours=ms/3600000;ms%=3600000;long minutes=ms/60000;ms%=60000;long seconds=ms/1000,millis=ms%1000;
   return hours.ToString("00",CultureInfo.InvariantCulture)+":"+minutes.ToString("00",CultureInfo.InvariantCulture)+":"+seconds.ToString("00",CultureInfo.InvariantCulture)+separator+millis.ToString("000",CultureInfo.InvariantCulture);
  }
  static void ShiftSrt(string source,string target,double offset){
   string text=File.ReadAllText(source),pattern=@"(?m)(?<a>\d+:\d{2}:\d{2}[,.]\d{3})(?<sep>[ \t]*-->[ \t]*)(?<b>\d+:\d{2}:\d{2}[,.]\d{3})";int count=0;
   string shifted=Regex.Replace(text,pattern,m=>{count++;string a=m.Groups["a"].Value,b=m.Groups["b"].Value;return SrtTime(ParseSrtTime(a)+offset,a.Contains(",")?',':'.')+m.Groups["sep"].Value+SrtTime(ParseSrtTime(b)+offset,b.Contains(",")?',':'.');});
   if(count==0)throw new ArgumentException("SRT 中没有可识别的时间轴");Files.Atomic(target,shifted);
  }
  static double ParseAssTime(string value){
   var p=value.Trim().Split(':');double seconds;if(p.Length!=3||!double.TryParse(p[2],NumberStyles.Float,CultureInfo.InvariantCulture,out seconds))throw new FormatException("ASS 时间格式无效");
   return int.Parse(p[0],CultureInfo.InvariantCulture)*3600+int.Parse(p[1],CultureInfo.InvariantCulture)*60+seconds;
  }
  static string AssTime(double value){
   long cs=(long)Math.Round(Math.Max(0,value)*100,MidpointRounding.AwayFromZero),hours=cs/360000;cs%=360000;long minutes=cs/6000;cs%=6000;long seconds=cs/100,centis=cs%100;
   return hours.ToString(CultureInfo.InvariantCulture)+":"+minutes.ToString("00",CultureInfo.InvariantCulture)+":"+seconds.ToString("00",CultureInfo.InvariantCulture)+"."+centis.ToString("00",CultureInfo.InvariantCulture);
  }
  static void ShiftAss(string source,string target,double offset){
   var lines=File.ReadAllLines(source).ToList();bool events=false;string[] format=null;int start=-1,end=-1,count=0;
   for(int i=0;i<lines.Count;i++){
    string trimmed=lines[i].Trim();if(trimmed.StartsWith("[")&&trimmed.EndsWith("]")){events=trimmed.Equals("[Events]",StringComparison.OrdinalIgnoreCase);format=null;continue;}if(!events)continue;
    if(trimmed.StartsWith("Format:",StringComparison.OrdinalIgnoreCase)){format=trimmed.Substring(trimmed.IndexOf(':')+1).Split(',').Select(x=>x.Trim()).ToArray();start=Array.FindIndex(format,x=>x.Equals("Start",StringComparison.OrdinalIgnoreCase));end=Array.FindIndex(format,x=>x.Equals("End",StringComparison.OrdinalIgnoreCase));continue;}
    if(format==null||start<0||end<0||!trimmed.StartsWith("Dialogue:",StringComparison.OrdinalIgnoreCase))continue;int colon=lines[i].IndexOf(':');string prefix=lines[i].Substring(0,colon+1),payload=lines[i].Substring(colon+1).TrimStart();var fields=payload.Split(new[]{','},format.Length,StringSplitOptions.None);if(fields.Length!=format.Length)continue;
    fields[start]=AssTime(ParseAssTime(fields[start])+offset);fields[end]=AssTime(ParseAssTime(fields[end])+offset);lines[i]=prefix+" "+string.Join(",",fields);count++;
   }
   if(count==0)throw new ArgumentException("ASS/SSA 中没有可识别的 Dialogue 时间轴");Files.Atomic(target,string.Join(Environment.NewLine,lines));
  }
  static string ShiftForBurn(string source,double offset){
   if(offset<=.0005)return source;string target=Path.Combine(Path.GetDirectoryName(source),"shifted"+Path.GetExtension(source).ToLowerInvariant());if(Path.GetExtension(source).Equals(".srt",StringComparison.OrdinalIgnoreCase))ShiftSrt(source,target,offset);else ShiftAss(source,target,offset);return target;
  }
  static string FilterPath(string value){
   string p=Files.Full(value).Replace('\\','/');return p.Replace(":","\\:").Replace("'","\\'").Replace("[","\\[").Replace("]","\\]").Replace(",","\\,").Replace(";","\\;");
  }
  static async Task<string> Burn(string input,string target,string subtitle,double duration,object request,string log){
   string codec=J.S(request,"gpuRawCodec");if(string.IsNullOrWhiteSpace(codec))codec="x264";string mode=J.S(request,"gpuRawMode",J.S(J.Get(request,"settings"),"gpuRawMode","recommended"));if(mode=="traditional")mode="recommended";
   Func<string,Task> run=async selected=>{var args=new List<string>{"-v","error","-y","-i",input,"-vf","subtitles=filename='"+FilterPath(subtitle)+"'","-map","0:v:0","-map","0:a?"};GpuEncoding.AddEncoderArgs(args,selected,selected=="x264rgb"?"lossless":mode);args.AddRange(new[]{"-c:a","copy","-t",J.Num(duration),"-movflags","+faststart",target});await Commands.Run("ffmpeg",args,log,7200000);};
   try{await run(codec);return codec;}catch(Exception e){if(!GpuEncoding.IsHardware(codec)||!GpuEncoding.IsCompatibilityError(e.Message))throw;}if(File.Exists(target))File.Delete(target);await run("x264");return "x264";
  }
  public static async Task<object> Apply(string input,string target,object subtitle,object timing,object bounds,object musicTimeline,object request,string log){
   string source=J.S(subtitle,"file");if(!File.Exists(source))throw new FileNotFoundException("任务字幕快照已丢失");double anchor=ResolveAnchor(subtitle,timing,bounds,musicTimeline),duration=J.N(bounds,"durationSeconds");string mode=J.S(subtitle,"mode","soft"),codec="copy";
   if(mode=="soft"){
    var args=new List<string>{"-v","error","-y","-i",input,"-itsoffset",J.Num(anchor),"-i",source,"-map","0:v:0","-map","0:a?","-map","1:0","-c:v","copy","-c:a","copy","-c:s","mov_text","-t",J.Num(duration),"-movflags","+faststart",target};await Commands.Run("ffmpeg",args,log,600000);
   }else if(mode=="burn")codec=await Burn(input,target,ShiftForBurn(source,anchor),duration,request,log);else throw new ArgumentException("字幕输出方式无效");
   var probe=await Commands.Probe(target);var video=J.A(J.Get(probe,"streams")).FirstOrDefault(x=>J.S(x,"codec_type")=="video");var settings=J.Get(request,"settings");if(video==null||J.N(video,"width")!=J.N(settings,"width")||J.N(video,"height")!=J.N(settings,"height"))throw new IOException("字幕后处理后的画面尺寸不符");double actual=J.N(J.Get(probe,"format"),"duration");if(actual<=0||Math.Abs(actual-duration)>.35)throw new IOException("字幕后处理后的成片时长不符");
   return J.O("mode",mode,"anchorSeconds",anchor,"source",J.S(subtitle,"name",Path.GetFileName(source)),"codec",codec,"subtitleCodec",mode=="soft"?"mov_text":"burned","assStylePreserved",mode=="burn"&&new[]{".ass",".ssa"}.Contains(Path.GetExtension(source).ToLowerInvariant()));
  }
 }
}

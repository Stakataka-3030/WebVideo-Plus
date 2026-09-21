using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Threading.Tasks;
namespace NativeVideo {
 public static class VideoWorkflow {
  public static string CanonicalSource(string text){return (text??"").TrimStart('\uFEFF').Replace("\r\n","\n");}
  public static object ValidateRange(object range,string source){
   if(range==null)return null;int count=CanonicalSource(source).Split('\n').Length;
   double start=J.N(range,"startLine"),end=J.N(range,"endLine");if(start!=Math.Truncate(start)||end!=Math.Truncate(end)||start<1||end<start||end>count)throw new ArgumentException("选区行号无效或超过当前剧本");
   string expected=J.S(range,"sourceHash");if(expected!=""&&expected!=Files.HashText(CanonicalSource(source)))throw new ArgumentException("选区对应的剧本已经变化，请重新选择");
   return J.O("startLine",start,"endLine",end,"sourceHash",Files.HashText(CanonicalSource(source)));
  }
  public static string PlanningSource(object request,string source){var range=ValidateRange(J.Get(request,"range"),source);return range==null?source:string.Join("\n",CanonicalSource(source).Split('\n').Take((int)J.N(range,"endLine")));}
  public static object LinearTimelineSource(string source,object parsed){
   var lines=CanonicalSource(source).Split('\n');var ignored=new List<object>();
   var controls=new HashSet<string>(new[]{"changeScene","callScene","return","choose","chooseLabel","jumpLabel","getUserInput","if","setVar","showVars"});
   var sentences=J.A(J.Get(parsed,"sentenceList"));for(int index=0;index<sentences.Count;index++){
    var sentence=sentences[index];if(J.B(sentence,"isLineBreakHolder"))continue;
    string command=J.N(sentence,"command",-1)==0?"say":J.S(sentence,"commandRaw");var args=new Dictionary<string,object>();foreach(var arg in J.A(J.Get(sentence,"args")))args[J.S(arg,"key")]=J.Get(arg,"value");
    if((!controls.Contains(command)||ProjectAssets.SingleLineHint(command,sentence,args))&&!J.B(args,"userForward")&&!args.ContainsKey("when"))continue;
    int first=(int)J.N(sentence,"startLine",index),last=(int)J.N(sentence,"endLine",first);if(first<0||last<first||last>=lines.Length)throw new ArgumentException("时间分析语句边界无效");
    for(int line=first;line<=last;line++){lines[line]="; WebVideo+ timeline skips interactive/control logic";ignored.Add(line+1);}
   }
   return J.O("script",string.Join("\n",lines),"ignoredLines",ignored);
  }
  public static Dictionary<string,object> Bounds(object timing,object range,int fps){return Bounds(timing,range,fps,"full");}
  public static Dictionary<string,object> Bounds(object timing,object range,int fps,string storyScope){
   double duration=J.N(timing,"durationSeconds"),scopeStart=J.N(J.Get(timing,"storyTimeline"),"currentStartSeconds",0),scopeEnd=J.N(J.Get(timing,"storyTimeline"),"currentEndSeconds",duration);int full=(int)Math.Round(duration*fps),scopeFirst=(int)Math.Ceiling(scopeStart*fps-1e-7),scopeLast=(int)Math.Ceiling(scopeEnd*fps-1e-7);
   if(range==null){int first=0,last=full;if(storyScope=="fromScene")first=scopeFirst;else if(storyScope=="sceneOnly"){first=scopeFirst;last=scopeLast;}else if(storyScope!="full")throw new ArgumentException("导出故事范围无效");first=Math.Max(0,Math.Min(first,full));last=Math.Max(first,Math.Min(last,full));if(last<=first)throw new ArgumentException("所选故事范围没有可导出的时长");return J.O("startFrame",first,"endFrame",last,"totalFrames",last-first,"startSeconds",first/(double)fps,"durationSeconds",(last-first)/(double)fps,"storyScope",storyScope);}
   var times=J.A(J.Get(timing,"lineTimes"));int begin=(int)J.N(range,"startLine")-1,end=(int)J.N(range,"endLine");double? startMs=null,endMs=null;
   for(int i=begin;i<Math.Min(end,times.Count);i++)if(times[i]!=null){startMs=Convert.ToDouble(times[i]);break;}
   for(int i=end;i<times.Count;i++)if(times[i]!=null){endMs=Convert.ToDouble(times[i]);break;}
   if(startMs==null)throw new ArgumentException("所选范围没有实际执行的语句");int rangeFirst=(int)Math.Ceiling(startMs.Value*fps/1000-1e-7),rangeLast=endMs.HasValue?(int)Math.Ceiling(endMs.Value*fps/1000-1e-7):scopeLast;rangeLast=Math.Min(Math.Max(rangeLast,rangeFirst),full);
   if(rangeLast<=rangeFirst)throw new ArgumentException("所选范围没有可导出的时长，请包含对白或等待语句");return J.O("startFrame",rangeFirst,"endFrame",rangeLast,"totalFrames",rangeLast-rangeFirst,"startSeconds",rangeFirst/(double)fps,"durationSeconds",(rangeLast-rangeFirst)/(double)fps,"storyScope","range");
  }
  public static Dictionary<string,object>[] Segments(object plan,object bounds,int fps,int workers){
   int start=(int)J.N(bounds,"startFrame"),end=(int)J.N(bounds,"endFrame");var ranges=SegmentPlan.Create(plan,end,fps,workers).Where(r=>J.N(r,"endFrame")>start&&J.N(r,"startFrame")<end).ToArray();
   for(int i=0;i<ranges.Length;i++){ranges[i]["index"]=i;ranges[i]["startFrame"]=Math.Max(start,(int)J.N(ranges[i],"startFrame"));ranges[i]["endFrame"]=Math.Min(end,(int)J.N(ranges[i],"endFrame"));}
   return ranges;
  }
  static double Number(object track,string key,double fallback,double min,double max){double n=fallback;if(J.D(track).ContainsKey(key)&&!double.TryParse(Convert.ToString(J.Get(track,key),System.Globalization.CultureInfo.InvariantCulture),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out n))throw new ArgumentException("音乐参数必须为数字："+key);if(double.IsNaN(n)||double.IsInfinity(n)||n<min||n>max)throw new ArgumentException("音乐参数无效："+key);return n;}
  public static Task<object> SnapshotMusic(string project,string jobDir,bool enabled,string legacyScene){return SnapshotMusic(project,jobDir,enabled);}
  public static async Task<object> SnapshotMusic(string project,string jobDir,bool enabled){
   if(!enabled)return null;string file=Path.Combine(project,"video-project.json");if(!File.Exists(file))return null;var data=J.Read(file);if(!J.B(data,"enabled",false))return null;int version=(int)J.N(data,"schemaVersion",1);if(version!=1&&version!=2)throw new ArgumentException("成片音乐文件版本不受支持");
   var result=new List<object>();var occupied=new Dictionary<string,List<Tuple<double,double>>>(StringComparer.OrdinalIgnoreCase);var tracks=J.A(J.Get(data,"tracks"));if(tracks.Count>64)throw new ArgumentException("成片音乐时间线最多包含 64 个片段");
   foreach(var track in tracks){if(!J.B(track,"enabled",true))continue;string relative=J.S(track,"file");if(Path.IsPathRooted(relative)||relative.Replace('\\','/').Split('/').Any(s=>s==".."))throw new ArgumentException("音乐必须位于当前项目内");string source=Files.Under(project,relative);if(!File.Exists(source))throw new FileNotFoundException("找不到成片音乐："+relative);if(new FileInfo(source).Length>128L*1024*1024)throw new ArgumentException("单个成片音乐文件超过 128 MB");
    string ext=Path.GetExtension(source).ToLowerInvariant();if(!new[]{".wav",".mp3",".ogg",".flac",".m4a",".aac",".webm",".opus"}.Contains(ext))throw new ArgumentException("不支持的成片音乐格式");
    double sourceDuration=await Commands.Duration(source)/1000,offset=Number(track,"offsetSeconds",0,0,86400),length=Number(track,"durationSeconds",sourceDuration,.001,86400),start=Number(track,"startSeconds",0,0,86400),fadeIn=Number(track,"fadeInSeconds",0,0,length),fadeOut=Number(track,"fadeOutSeconds",0,0,length),volume=Number(track,"volume",100,0,100);bool loop=J.B(track,"loop");string legacyScene=version==1?J.S(track,"scene").Replace('\\','/'):"";
    if(J.B(track,"fullLength")){offset=0;length=sourceDuration;loop=false;fadeIn=0;fadeOut=0;int lane=(int)Number(track,"lane",0,0,63);string laneKey=legacyScene+"|"+lane;List<Tuple<double,double>> intervals;if(!occupied.TryGetValue(laneKey,out intervals)){intervals=new List<Tuple<double,double>>();occupied[laneKey]=intervals;}if(intervals.Any(interval=>start<interval.Item2-.001&&start+length>interval.Item1+.001))throw new ArgumentException("同一播放器行中的音乐不能重叠，请移动音乐或增加播放器行");intervals.Add(Tuple.Create(start,start+length));}
    if(fadeIn+fadeOut>length+.001)throw new ArgumentException("淡入淡出长度超过音乐片段长度");if(!loop&&(offset>=sourceDuration||length>sourceDuration-offset+.1))throw new ArgumentException("音乐片段超出音源长度，请缩短片段或启用循环");if(loop)offset%=sourceDuration;
    string copy=Path.Combine(jobDir,"music-snapshot",Guid.NewGuid().ToString("N")+ext);Files.CopyFile(source,copy);result.Add(J.O("file",copy,"originalFile",relative,"id",J.S(track,"id"),"name",J.S(track,"name",Path.GetFileName(relative)),"legacyScene",legacyScene,"startSeconds",start,"offsetSeconds",offset,"durationSeconds",length,"volume",volume,"fadeInSeconds",fadeIn,"fadeOutSeconds",fadeOut,"loop",loop));
   }return J.O("schemaVersion",2,"sourceSchemaVersion",version,"replaceGameBgm",result.Count>0&&J.B(data,"replaceGameBgm",true),"tracks",result);
  }
  public static void AddMusic(object plan,object request,object timing){
   var music=J.Get(request,"musicTimeline");if(music==null)return;var audio=J.A(J.Get(plan,"audio"));if(J.B(music,"replaceGameBgm"))audio=audio.Where(a=>J.S(a,"kind")!="bgm"||J.S(a,"origin")=="playlist").ToList();
   var offsets=new Dictionary<string,double>(StringComparer.OrdinalIgnoreCase);foreach(var item in J.A(J.Get(J.Get(timing,"storyTimeline"),"scenes")))offsets[J.S(item,"scene")]=J.N(item,"startSeconds");
   foreach(var t in J.A(J.Get(music,"tracks"))){string legacy=J.S(t,"legacyScene");double baseStart=0;if(legacy!=""&&!offsets.TryGetValue(legacy,out baseStart))continue;double start=(baseStart+J.N(t,"startSeconds"))*1000,length=J.N(t,"durationSeconds")*1000;audio.Add(J.O("kind","video-music","path",J.S(t,"file"),"atMs",start,"endMs",start+length,"sourceOffsetMs",J.N(t,"offsetSeconds")*1000,"volume",J.N(t,"volume")/100,"fadeMs",J.N(t,"fadeInSeconds")*1000,"fadeOutMs",J.N(t,"fadeOutSeconds")*1000,"loop",J.B(t,"loop")));}
   J.D(plan)["audio"]=audio;
  }
 }
}

using System;using System.Linq;using System.Collections.Generic;using System.Globalization;using System.Text.RegularExpressions;
namespace NativeVideo {
 // Cut frames are relative to the selected output, not the project's global timeline.
 public static class ManualCuts {
  public const string Rounding="ceil(seconds * fps - 1e-7)";
  public static bool Enabled(object settings){return J.S(settings,"segmentCutMode","auto")=="manual";}
  public static int[] Parse(string input,int fps){
   if(fps<=0)throw new ArgumentException("手动切点的帧率无效");
   var frames=new SortedSet<int>();
   foreach(string token in Regex.Split((input??"").Trim(),@"[\s,，]+")){
    if(token=="")continue;double value;bool time=false;
    if(Regex.IsMatch(token,@"\A[0-9]+[fF]?\z"))value=double.Parse(token.TrimEnd('f','F'),CultureInfo.InvariantCulture);
    else if(Regex.IsMatch(token,@"\A[0-9]+(?:\.[0-9]+)?[sS]\z")){value=double.Parse(token.Substring(0,token.Length-1),CultureInfo.InvariantCulture);time=true;}
    else if(Regex.IsMatch(token,@"\A[0-9]+:[0-9]{2}(?::[0-9]{2})?(?:\.[0-9]+)?\z")){
     var parts=token.Split(':').Select(p=>double.Parse(p,CultureInfo.InvariantCulture)).ToArray();
     if(parts.Last()>=60||parts.Length==3&&parts[1]>=60)throw new ArgumentException("手动切点时间中的分、秒需小于 60："+token);
     value=parts.Length==3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];time=true;
    }else throw new ArgumentException("手动切点格式无效："+token+"。请用整数帧、带 s 的秒数或 MM:SS / HH:MM:SS。");
    double frame=time?Math.Ceiling(value*fps-1e-7):value;
    if(double.IsNaN(frame)||double.IsInfinity(frame)||frame<1||frame>int.MaxValue)throw new ArgumentException("手动切点必须是大于 0 的有效帧："+token);
    frames.Add((int)frame);
   }
   return frames.ToArray();
  }
  public static Dictionary<string,object> SavedPreferences(object requested,object previous,bool audioOnly){
   var result=new Dictionary<string,object>(J.D(requested));
   if(audioOnly){result["segmentCutMode"]=J.S(previous,"segmentCutMode","auto");result["manualCutPoints"]=J.S(previous,"manualCutPoints");}
   return result;
  }
  public static int[] Resolve(object settings,int fps,int total){
   var frames=Parse(J.S(settings,"manualCutPoints"),fps);
   foreach(int frame in frames)if(frame>=total)throw new ArgumentException("手动切点 "+frame+" 超出当前成片内部范围（需满足 0 < 切点 < "+total+" 帧）；起点和终点由导出器自动包含。");
   return frames;
  }
 }
}

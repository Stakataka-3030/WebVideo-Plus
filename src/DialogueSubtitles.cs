using System;using System.IO;using System.Linq;using System.Text;using System.Globalization;using System.Collections.Generic;
namespace NativeVideo {
 public static class DialogueSubtitles {
  public static bool Is(object request){return J.S(request,"exportKind")=="subtitles";}
  sealed class Cue {public double Start,End;public string Text,Speaker;}
  static string Plain(object value){return Convert.ToString(value,CultureInfo.InvariantCulture).Replace("\r\n","\n").Replace('\r','\n');}
  static string Escape(string text){return string.Join("\n",text.Replace("&","&amp;").Replace("<","&lt;").Replace(">","&gt;").Split('\n').Select(line=>line==""?"\u00a0":line));}
  static string Stamp(long ms){return (ms/3600000).ToString("D2")+":"+(ms/60000%60).ToString("D2")+":"+(ms/1000%60).ToString("D2")+","+(ms%1000).ToString("D3");}
  public static string Build(object timing,object bounds,bool includeSpeaker,out int count){
   if(J.N(timing,"dialogueSchemaVersion")!=1)throw new IOException("时序计划尚未包含对白字幕，请重新创建字幕任务");
   double begin=J.N(bounds,"startSeconds")*1000,end=Math.Min(J.N(timing,"durationSeconds")*1000,begin+J.N(bounds,"durationSeconds")*1000);
   var cues=new List<Cue>();Cue active=null;string previousText="",previousKey="",previousSpeaker="";bool previousVisible=false;
   foreach(var e in J.A(J.Get(timing,"sourceEvents")).OrderBy(e=>J.N(e,"atMs"))){
    var d=J.Get(e,"dialogue");if(d==null)continue;
    double at=J.N(e,"atMs");string text=Plain(J.Get(d,"text")),key=J.S(d,"key"),speaker=Plain(J.Get(d,"speaker")).Trim();bool visible=J.B(d,"visible");
    bool changed=text!=previousText||key!=previousKey||visible!=previousVisible||(includeSpeaker&&speaker!=previousSpeaker);
    if(!changed)continue;
    string body=text;
    if(visible&&previousVisible&&key==previousKey&&(!includeSpeaker||speaker==previousSpeaker)&&J.B(d,"append")&&text.StartsWith(previousText,StringComparison.Ordinal))body=text.Substring(previousText.Length);
    if(active!=null)active.End=at;
    if(visible&&!string.IsNullOrWhiteSpace(body)){
     // A synchronous -next chain has one visible state at this timestamp.
     if(active!=null&&active.Start==at&&J.B(d,"append")&&active.Speaker==speaker){active.Text+=body;active.End=end;}
     else {active=new Cue{Start=at,End=end,Text=body,Speaker=speaker};cues.Add(active);}
    }else active=null;
    previousText=text;previousKey=key;previousSpeaker=speaker;previousVisible=visible;
   }
   var output=new StringBuilder();count=0;
   foreach(var cue in cues){long first=(long)Math.Round(Math.Max(begin,cue.Start)-begin,MidpointRounding.AwayFromZero),last=(long)Math.Round(Math.Min(end,cue.End)-begin,MidpointRounding.AwayFromZero);if(last<=first||first<0)continue;
    string text=(includeSpeaker&&cue.Speaker!=""?cue.Speaker+"：":"")+cue.Text;
    output.Append(++count).Append("\r\n").Append(Stamp(first)).Append(" --> ").Append(Stamp(last)).Append("\r\n").Append(Escape(text).Replace("\n","\r\n")).Append("\r\n\r\n");
   }return output.ToString();
  }
  public static object Write(object timing,object bounds,object request,string output){
   int count;string text=Build(timing,bounds,J.B(request,"includeSpeaker"),out count);Files.EnsureParent(output);
   string partial=Path.Combine(Path.GetDirectoryName(output),".webvideo-subtitles-"+Guid.NewGuid().ToString("N")+".partial.srt");
   try{File.WriteAllText(partial,text,new UTF8Encoding(false));File.Move(partial,output);}finally{if(File.Exists(partial))File.Delete(partial);}
   return J.O("exportKind","subtitles","format","srt","cueCount",count,"includeSpeaker",J.B(request,"includeSpeaker"),"durationSeconds",J.N(bounds,"durationSeconds"),"sourceStartSeconds",J.N(bounds,"startSeconds"),"storyScope",J.S(bounds,"storyScope"));
  }
 }
}

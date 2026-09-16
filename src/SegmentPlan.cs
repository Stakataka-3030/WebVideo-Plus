using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class SegmentPlan {
  public static Dictionary<string,object>[] Create(object plan,int total,int fps,int workers){
   if(total<=60*fps)return Enumerable.Range(0,Math.Min(workers,total)).Select(i=>J.O("index",i,"startFrame",(int)((long)i*total/Math.Min(workers,total)),"endFrame",(int)((long)(i+1)*total/Math.Min(workers,total)),"replayFrame",0)).ToArray();
   var events=J.A(J.Get(plan,"events")).Where(e=>J.N(e,"line")>0&&!J.S(e,"command").StartsWith("__")).ToList();var groups=new List<int>();int previous=-1;
   for(int i=0;i<events.Count;i++){var e=events[i];if(J.S(e,"command")!="say"||Regex.IsMatch(J.S(e,"script"),@"^\s*:\s*;\s*$"))continue;int frame=(int)Math.Ceiling(J.N(events[previous+1],"atMs")*fps/1000);groups.Add(frame);previous=i;}
   var cuts=new List<KeyValuePair<int,int>>{new KeyValuePair<int,int>(0,0)};for(int frame=60*fps;frame<total;frame+=60*fps){int group=groups.FindLastIndex(f=>f<=frame);if(group>=0&&groups[group]>cuts.Last().Key&&groups[group]<total)cuts.Add(new KeyValuePair<int,int>(groups[group],group));}
   return cuts.Select((c,i)=>J.O("index",i,"startFrame",c.Key,"endFrame",i+1<cuts.Count?cuts[i+1].Key:total,"replayFrame",i==0||groups.Count==0?0:groups[Math.Max(0,c.Value-1)])).ToArray();
  }
 }
 public sealed class ProgressAccumulator {
  readonly Dictionary<int,int> frames=new Dictionary<int,int>();
  public int Read(int part,int length,object current,bool accepted){int old;frames.TryGetValue(part,out old);int value=accepted?length:current==null?old:(int)J.N(current,"outputFrames");value=Math.Max(old,Math.Max(0,Math.Min(length,value)));frames[part]=value;return value;}
 }
}

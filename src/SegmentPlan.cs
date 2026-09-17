using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class SegmentPlan {
  public static Dictionary<string,object>[] Create(object plan,int total,int fps,int workers){
   if(total<=0)return new Dictionary<string,object>[0];
   workers=Math.Max(1,Math.Min(workers,total));
   if(total<=60*fps)return Enumerable.Range(0,workers).Select(i=>J.O("index",i,"startFrame",(int)((long)i*total/workers),"endFrame",(int)((long)(i+1)*total/workers),"replayFrame",0)).ToArray();
   var events=J.A(J.Get(plan,"events")).Where(e=>J.N(e,"line")>0&&!J.S(e,"command").StartsWith("__")).ToList();var groups=new List<int>();int previous=-1;
   for(int i=0;i<events.Count;i++){var e=events[i];if(J.S(e,"command")!="say"||Regex.IsMatch(J.S(e,"script"),@"^\s*:\s*;\s*$"))continue;int frame=(int)Math.Ceiling(J.N(events[previous+1],"atMs")*fps/1000);if(frame>0&&frame<total&&(groups.Count==0||groups.Last()!=frame))groups.Add(frame);previous=i;}
   if(workers<=1||groups.Count==0)return new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0)};
   int targetParts=Math.Min(workers,groups.Count+1);var chosen=new List<int>();int minGroup=0;
   for(int part=1;part<targetParts;part++){
    int target=(int)((long)part*total/targetParts);int maxGroup=groups.Count-(targetParts-part);int best=minGroup;long bestDistance=Math.Abs((long)groups[best]-target);
    for(int group=minGroup+1;group<=maxGroup;group++){long distance=Math.Abs((long)groups[group]-target);if(distance<bestDistance){best=group;bestDistance=distance;}else if(groups[group]>target)break;}
    chosen.Add(best);minGroup=best+1;
   }
   var cuts=new List<KeyValuePair<int,int>>{new KeyValuePair<int,int>(0,0)};cuts.AddRange(chosen.Select(group=>new KeyValuePair<int,int>(groups[group],group)));
   return cuts.Select((c,i)=>J.O("index",i,"startFrame",c.Key,"endFrame",i+1<cuts.Count?cuts[i+1].Key:total,"replayFrame",i==0?0:groups[Math.Max(0,c.Value-1)])).ToArray();
  }
 }
 public sealed class ProgressAccumulator {
  readonly Dictionary<int,int> frames=new Dictionary<int,int>();
  public int Read(int part,int length,object current,bool accepted){int old;frames.TryGetValue(part,out old);int value=accepted?length:current==null?old:(int)J.N(current,"outputFrames");value=Math.Max(old,Math.Max(0,Math.Min(length,value)));frames[part]=value;return value;}
 }
}

using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class SegmentPlan {
  const double DomRefreshFrameCost=12d;
  public static Dictionary<string,object>[] Create(object plan,int total,int fps,int workers){
   if(total<=0)return new Dictionary<string,object>[0];
   workers=Math.Max(1,Math.Min(workers,total));
   var protectedWindows=J.A(J.Get(plan,"singleLineHints")).Select(h=>new{Start=Math.Max(0,Math.Min(total,(int)Math.Floor(J.N(h,"startMs")*fps/1000))),End=Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(h,"endMs")*fps/1000)))}).Where(w=>w.End>w.Start).OrderBy(w=>w.Start).ToArray();Func<int,bool> safeCut=frame=>!protectedWindows.Any(w=>frame>w.Start&&frame<w.End);Func<int,int> snapCut=frame=>{foreach(var w in protectedWindows)if(frame>w.Start&&frame<w.End)frame=frame-w.Start<=w.End-frame?w.Start:w.End;return Math.Max(0,Math.Min(total,frame));};
   var events=J.A(J.Get(plan,"events")).Where(e=>J.N(e,"line")>0&&!J.S(e,"command").StartsWith("__")).ToList();var groups=new List<int>();int previous=-1;
   for(int i=0;i<events.Count;i++){var e=events[i];if(J.S(e,"command")!="say"||Regex.IsMatch(J.S(e,"script"),@"^\s*:\s*;\s*$"))continue;int frame=(int)Math.Ceiling(J.N(events[previous+1],"atMs")*fps/1000);if(frame>0&&frame<total&&safeCut(frame)&&(groups.Count==0||groups.Last()!=frame))groups.Add(frame);previous=i;}
   var workload=J.A(J.Get(plan,"domWorkload")).Select(x=>new{Frame=Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(x,"atMs")*fps/1000))),Units=Math.Max(0,J.N(x,"units",1))}).OrderBy(x=>x.Frame).ToArray();
   var costPoints=new List<KeyValuePair<int,double>>();double cumulativeUnits=0;foreach(var w in workload){cumulativeUnits+=w.Units;costPoints.Add(new KeyValuePair<int,double>(w.Frame,cumulativeUnits));}
   Func<int,double> costAt=frame=>{frame=Math.Max(0,Math.Min(total,frame));double units=0;for(int i=0;i<costPoints.Count;i++){if(costPoints[i].Key>=frame)break;units=costPoints[i].Value;}return frame+units*DomRefreshFrameCost;};
   if(workers<=1)return new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0,"estimatedCost",costAt(total))};
   if(groups.Count==0){var cutFrames=new List<int>{0};for(int i=1;i<workers;i++){int frame=snapCut((int)((long)i*total/workers));if(frame>cutFrames.Last()&&frame<total)cutFrames.Add(frame);}if(cutFrames.Last()!=total)cutFrames.Add(total);return cutFrames.Take(cutFrames.Count-1).Select((frame,i)=>J.O("index",i,"startFrame",frame,"endFrame",cutFrames[i+1],"replayFrame",0)).ToArray();}
   int targetParts=Math.Min(workers,groups.Count+1);var chosen=new List<int>();int minGroup=0;double totalCost=costAt(total);
   for(int part=1;part<targetParts;part++){
    double target=part*totalCost/targetParts;int maxGroup=groups.Count-(targetParts-part);int best=minGroup;double bestDistance=Math.Abs(costAt(groups[best])-target);
    for(int group=minGroup+1;group<=maxGroup;group++){double distance=Math.Abs(costAt(groups[group])-target);if(distance<bestDistance){best=group;bestDistance=distance;}else if(costAt(groups[group])>target)break;}
    chosen.Add(best);minGroup=best+1;
   }
   var cuts=new List<KeyValuePair<int,int>>{new KeyValuePair<int,int>(0,0)};cuts.AddRange(chosen.Select(group=>new KeyValuePair<int,int>(groups[group],group)));
   return cuts.Select((c,i)=>{int end=i+1<cuts.Count?cuts[i+1].Key:total;return J.O("index",i,"startFrame",c.Key,"endFrame",end,"replayFrame",i==0||groups.Count==0?0:groups[Math.Max(0,c.Value-1)],"estimatedCost",Math.Max(0,costAt(end)-costAt(c.Key)));}).ToArray();
  }
 }
 public sealed class ProgressAccumulator {
  readonly Dictionary<int,int> frames=new Dictionary<int,int>();
  public int Read(int part,int length,object current,bool accepted){int old;frames.TryGetValue(part,out old);int value=accepted?length:current==null?old:(int)J.N(current,"outputFrames");value=Math.Max(old,Math.Max(0,Math.Min(length,value)));frames[part]=value;return value;}
 }
}

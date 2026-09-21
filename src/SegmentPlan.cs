using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class SegmentPlan {
  const double DomRefreshFrameCost=12d,MinSegmentSeconds=5d,MinReplayWarmupSeconds=1d;
  public static Dictionary<string,object>[] Create(object plan,int total,int fps,int workers){
   if(total<=0)return new Dictionary<string,object>[0];
   workers=Math.Max(1,Math.Min(workers,total));
   int minSegmentFrames=Math.Max(1,(int)Math.Ceiling(fps*MinSegmentSeconds)),minReplayWarmupFrames=Math.Max(1,(int)Math.Ceiling(fps*MinReplayWarmupSeconds));
   workers=Math.Min(workers,Math.Max(1,total/minSegmentFrames));
   var protectedWindows=J.A(J.Get(plan,"singleLineHints")).Select(h=>new{Start=Math.Max(0,Math.Min(total,(int)Math.Floor(J.N(h,"startMs")*fps/1000))),End=Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(h,"endMs")*fps/1000)))}).Where(w=>w.End>w.Start).OrderBy(w=>w.Start).ToArray();
   Func<int,bool> safeCut=frame=>!protectedWindows.Any(w=>frame>w.Start&&frame<w.End);
   Func<int,int> snapCut=frame=>{foreach(var w in protectedWindows)if(frame>w.Start&&frame<w.End)frame=frame-w.Start<=w.End-frame?w.Start:w.End;return Math.Max(0,Math.Min(total,frame));};
   var events=J.A(J.Get(plan,"events")).Where(e=>J.N(e,"line")>0&&!J.S(e,"command").StartsWith("__")).ToList();var groups=new List<int>();int previous=-1;
   for(int i=0;i<events.Count;i++){var e=events[i];if(J.S(e,"command")!="say"||Regex.IsMatch(J.S(e,"script"),@"^\s*:\s*;\s*$"))continue;int frame=(int)Math.Ceiling(J.N(events[previous+1],"atMs")*fps/1000);if(frame>0&&frame<total&&safeCut(frame)&&(groups.Count==0||groups.Last()!=frame))groups.Add(frame);previous=i;}
   var workload=J.A(J.Get(plan,"domWorkload")).Select(x=>new{Frame=Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(x,"atMs")*fps/1000))),Units=Math.Max(0,J.N(x,"units",1))}).OrderBy(x=>x.Frame).ToArray();
   var costPoints=new List<KeyValuePair<int,double>>();double cumulativeUnits=0;foreach(var w in workload){cumulativeUnits+=w.Units;costPoints.Add(new KeyValuePair<int,double>(w.Frame,cumulativeUnits));}
   Func<int,double> costAt=frame=>{frame=Math.Max(0,Math.Min(total,frame));double units=0;for(int i=0;i<costPoints.Count;i++){if(costPoints[i].Key>=frame)break;units=costPoints[i].Value;}return frame+units*DomRefreshFrameCost;};
   Func<Dictionary<string,object>[]> single=()=>new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0,"estimatedCost",costAt(total))};
   if(workers<=1)return single();
   if(groups.Count==0){
    for(int parts=workers;parts>=2;parts--){
     var cutFrames=new List<int>{0};bool valid=true;
     for(int part=1;part<parts;part++){
      int minFrame=cutFrames.Last()+minSegmentFrames,maxFrame=total-(parts-part)*minSegmentFrames,target=(int)((long)part*total/parts);
      var candidates=new List<int>{target,snapCut(target),minFrame,snapCut(minFrame),maxFrame,snapCut(maxFrame)};
      foreach(var w in protectedWindows){if(w.Start>=minFrame&&w.Start<=maxFrame)candidates.Add(w.Start);if(w.End>=minFrame&&w.End<=maxFrame)candidates.Add(w.End);}
      int best=-1;long bestDistance=long.MaxValue;
      foreach(int candidate in candidates.Distinct()){if(candidate<minFrame||candidate>maxFrame||candidate<=0||candidate>=total||!safeCut(candidate))continue;long distance=Math.Abs((long)candidate-target);if(distance<bestDistance){best=candidate;bestDistance=distance;}}
      if(best<0){valid=false;break;}cutFrames.Add(best);
     }
     if(!valid)continue;
     cutFrames.Add(total);
     return cutFrames.Take(cutFrames.Count-1).Select((frame,i)=>J.O("index",i,"startFrame",frame,"endFrame",cutFrames[i+1],"replayFrame",0,"estimatedCost",Math.Max(0,costAt(cutFrames[i+1])-costAt(frame)))).ToArray();
    }
    return single();
   }
   Func<int,int> replayForGroup=group=>{int cut=groups[group];for(int i=group-1;i>=0;i--)if(cut-groups[i]>=minReplayWarmupFrames)return groups[i];return 0;};
   var candidateGroups=Enumerable.Range(0,groups.Count).Where(group=>groups[group]>=minSegmentFrames&&groups[group]<=total-minSegmentFrames&&groups[group]-replayForGroup(group)>=minReplayWarmupFrames).ToArray();
   int requestedParts=Math.Min(workers,candidateGroups.Length+1);double totalCost=costAt(total);List<int> chosen=null;
   for(int parts=requestedParts;parts>=2&&chosen==null;parts--){
    var attempt=new List<int>();int lastCut=0,nextPosition=0;bool valid=true;
    for(int part=1;part<parts;part++){
     int minFrame=lastCut+minSegmentFrames,maxFrame=total-(parts-part)*minSegmentFrames,bestGroup=-1,bestPosition=-1;double target=part*totalCost/parts,bestDistance=double.MaxValue;
     for(int position=nextPosition;position<candidateGroups.Length;position++){
      int group=candidateGroups[position],frame=groups[group];if(frame<minFrame)continue;if(frame>maxFrame)break;double distance=Math.Abs(costAt(frame)-target);
      if(distance<bestDistance){bestGroup=group;bestPosition=position;bestDistance=distance;}else if(bestGroup>=0&&costAt(frame)>target)break;
     }
     if(bestGroup<0){valid=false;break;}attempt.Add(bestGroup);lastCut=groups[bestGroup];nextPosition=bestPosition+1;
    }
    if(valid)chosen=attempt;
   }
   if(chosen==null)return single();
   var cuts=new List<KeyValuePair<int,int>>{new KeyValuePair<int,int>(0,-1)};cuts.AddRange(chosen.Select(group=>new KeyValuePair<int,int>(groups[group],group)));
   return cuts.Select((c,i)=>{int end=i+1<cuts.Count?cuts[i+1].Key:total,replay=i==0?0:replayForGroup(c.Value);return J.O("index",i,"startFrame",c.Key,"endFrame",end,"replayFrame",replay,"estimatedCost",Math.Max(0,costAt(end)-costAt(c.Key)));}).ToArray();
  }
 }
 public sealed class ProgressAccumulator {
  readonly Dictionary<int,int> frames=new Dictionary<int,int>();
  public int Read(int part,int length,object current,bool accepted){int old;frames.TryGetValue(part,out old);int value=accepted?length:current==null?old:(int)J.N(current,"outputFrames");value=Math.Max(old,Math.Max(0,Math.Min(length,value)));frames[part]=value;return value;}
 }
}

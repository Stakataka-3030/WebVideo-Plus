using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class SegmentPlan {
  const double DomRefreshFrameCost=12d,MinSegmentSeconds=5d,MinReplayWarmupSeconds=1d,ReplayPenaltyWeight=.35d,MaxReplayOverheadRatio=.60d;
  sealed class ReplayWindow { public int Start;public int End;public bool Root;public bool NoCut;public ReplayWindow(int start,int end,bool root=false,bool noCut=false){Start=start;End=end;Root=root;NoCut=noCut;} }

  static ReplayWindow[] ReplayWindows(object plan,int total,int fps){
   return J.A(J.Get(plan,"replayWindows")).Select(w=>new ReplayWindow(
    Math.Max(0,Math.Min(total,(int)Math.Floor(J.N(w,"startMs")*fps/1000))),
    Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(w,"endMs")*fps/1000))),
    J.B(w,"rootReplay"),J.B(w,"noCut")
   )).Where(w=>w.End>w.Start).OrderBy(w=>w.Start).ToArray();
  }

  static ReplayWindow[] DomAnimationWindows(object plan,int total,int fps){
   int margin=Math.Max(1,(int)Math.Ceiling(fps*.25)),mergeGap=Math.Max(1,(int)Math.Ceiling(fps*.20));
   var frames=J.A(J.Get(plan,"domWorkload")).Where(x=>J.S(x,"reason")=="animation")
    .Select(x=>Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(x,"atMs")*fps/1000)))).Distinct().OrderBy(x=>x).ToArray();
   if(frames.Length==0)return new ReplayWindow[0];
   var result=new List<ReplayWindow>();int first=frames[0],last=frames[0];
   for(int i=1;i<frames.Length;i++){
    if(frames[i]-last<=mergeGap){last=frames[i];continue;}
    result.Add(new ReplayWindow(Math.Max(0,first-margin),Math.Min(total,last+margin)));first=last=frames[i];
   }
   result.Add(new ReplayWindow(Math.Max(0,first-margin),Math.Min(total,last+margin)));
   return result.Where(w=>w.End>w.Start).ToArray();
  }

  static IEnumerable<int> Nearest(IEnumerable<int> values,int target,int min,int max,int limit){
   return values.Where(v=>v>=min&&v<=max).OrderBy(v=>Math.Abs((long)v-target)).Take(limit);
  }

  static int ReplayAnchor(int cut,int minWarmupFrames,ReplayWindow[] windows){
   int anchor=Math.Max(0,cut-minWarmupFrames);
   // A future replay window may explicitly request story-root replay when its
   // runtime state cannot be reconstructed from a local anchor.
   if(windows.Any(w=>w.Root&&w.Start<=cut&&w.End>anchor))return 0;
   // Windows are start-sorted. Walking backwards computes the transitive overlap
   // closure in one pass: once anchor moves earlier, already-visited later windows
   // are automatically covered by the longer replay interval.
   for(int i=windows.Length-1;i>=0;i--){
    var w=windows[i];if(w.Start>=anchor)continue;
    if(w.End>anchor)anchor=w.Start;
   }
   return Math.Max(0,Math.Min(cut,anchor));
  }

  public static Dictionary<string,object>[] Create(object plan,int total,int fps,int workers){
   if(total<=0)return new Dictionary<string,object>[0];
   workers=Math.Max(1,Math.Min(workers,total));
   int minSegmentFrames=Math.Max(1,(int)Math.Ceiling(fps*MinSegmentSeconds)),minReplayWarmupFrames=Math.Max(1,(int)Math.Ceiling(fps*MinReplayWarmupSeconds));
   workers=Math.Min(workers,Math.Max(1,total/minSegmentFrames));
   if(workers<=1)return new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0,"warmupFrames",0,"estimatedCost",(double)total)};

   var protectedWindows=J.A(J.Get(plan,"singleLineHints")).Select(h=>new ReplayWindow(
    Math.Max(0,Math.Min(total,(int)Math.Floor(J.N(h,"startMs")*fps/1000))),
    Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(h,"endMs")*fps/1000)))
   )).Where(w=>w.End>w.Start).OrderBy(w=>w.Start).ToArray();
   var replayOnly=ReplayWindows(plan,total,fps).Concat(DomAnimationWindows(plan,total,fps)).OrderBy(w=>w.Start).ToArray(),noCutWindows=replayOnly.Where(w=>w.NoCut).ToArray(),cutProtected=protectedWindows.Concat(noCutWindows).OrderBy(w=>w.Start).ToArray();
   Func<int,bool> safeCut=frame=>!cutProtected.Any(w=>frame>w.Start&&frame<w.End);
   Func<int,int> snapCut=frame=>{
    foreach(var w in cutProtected)if(frame>w.Start&&frame<w.End)frame=frame-w.Start<=w.End-frame?w.Start:w.End;
    return Math.Max(0,Math.Min(total,frame));
   };

   var replayWindows=replayOnly.Concat(protectedWindows).OrderBy(w=>w.Start).ToArray();
   Func<int,int> replayFor=cut=>ReplayAnchor(cut,minReplayWarmupFrames,replayWindows);

   var events=J.A(J.Get(plan,"events")).Where(e=>J.N(e,"line")>0&&!J.S(e,"command").StartsWith("__")).ToList();
   var preferredCuts=events.Where(e=>J.S(e,"command")=="say"&&!Regex.IsMatch(J.S(e,"script"),@"^\s*:\s*;\s*$"))
    .Select(e=>(int)Math.Ceiling(J.N(e,"atMs")*fps/1000)).Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();
   var replayBoundaries=replayWindows.SelectMany(w=>new[]{w.Start,w.End}).Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();

   var workload=J.A(J.Get(plan,"domWorkload")).Select(x=>new{Frame=Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(x,"atMs")*fps/1000))),Units=Math.Max(0,J.N(x,"units",1))}).OrderBy(x=>x.Frame).ToArray();
   var costPoints=new List<KeyValuePair<int,double>>();double cumulativeUnits=0;
   foreach(var w in workload){cumulativeUnits+=w.Units;costPoints.Add(new KeyValuePair<int,double>(w.Frame,cumulativeUnits));}
   Func<int,double> costAt=frame=>{
    frame=Math.Max(0,Math.Min(total,frame));double units=0;int lo=0,hi=costPoints.Count-1,best=-1;
    while(lo<=hi){int mid=lo+(hi-lo)/2;if(costPoints[mid].Key<frame){best=mid;lo=mid+1;}else hi=mid-1;}
    if(best>=0)units=costPoints[best].Value;
    return frame+units*DomRefreshFrameCost;
   };

   Func<List<int>,Dictionary<string,object>[]> buildRanges=cuts=>{
    var frames=new List<int>{0};frames.AddRange(cuts);frames.Add(total);
    return frames.Take(frames.Count-1).Select((start,i)=>{
     int end=frames[i+1],replay=start==0?0:replayFor(start),warmup=Math.Max(0,start-replay);
     double estimate=Math.Max(0,costAt(end)-costAt(start))+Math.Max(0,costAt(start)-costAt(replay));
     return J.O("index",i,"startFrame",start,"endFrame",end,"replayFrame",replay,"warmupFrames",warmup,"estimatedCost",estimate);
    }).ToArray();
   };

   double totalCost=costAt(total);
   for(int parts=workers;parts>=2;parts--){
    var cuts=new List<int>();int lastCut=0;bool valid=true;
    for(int part=1;part<parts;part++){
     int minFrame=lastCut+minSegmentFrames,maxFrame=total-(parts-part)*minSegmentFrames;
     if(maxFrame<minFrame){valid=false;break;}
     double targetCost=part*totalCost/parts;
     int targetFrame=(int)((long)part*total/parts);
     var candidates=new List<int>{snapCut(targetFrame),snapCut(minFrame),snapCut(maxFrame)};
     candidates.AddRange(Nearest(preferredCuts,targetFrame,minFrame,maxFrame,12));
     candidates.AddRange(Nearest(preferredCuts,minFrame,minFrame,maxFrame,4));
     candidates.AddRange(Nearest(preferredCuts,maxFrame,minFrame,maxFrame,4));
     candidates.AddRange(Nearest(replayBoundaries,targetFrame,minFrame,maxFrame,12));
     candidates.AddRange(Nearest(replayBoundaries,minFrame,minFrame,maxFrame,4));
     candidates.AddRange(Nearest(replayBoundaries,maxFrame,minFrame,maxFrame,4));
     int best=-1;double bestScore=double.MaxValue;
     foreach(int candidate in candidates.Distinct()){
      if(candidate<minFrame||candidate>maxFrame||candidate<=lastCut||candidate<=0||candidate>=total||!safeCut(candidate))continue;
      int replay=replayFor(candidate);
      double balance=Math.Abs(costAt(candidate)-targetCost),replayPenalty=Math.Max(0,costAt(candidate)-costAt(replay))*ReplayPenaltyWeight;
      double score=balance+replayPenalty;
      if(score<bestScore){best=candidate;bestScore=score;}
     }
     if(best<0){valid=false;break;}
     cuts.Add(best);lastCut=best;
    }
    if(!valid)continue;
    var ranges=buildRanges(cuts);
    long warmup=ranges.Sum(r=>(long)J.N(r,"warmupFrames"));
    if(warmup>total*MaxReplayOverheadRatio)continue;
    return ranges;
   }

   return new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0,"warmupFrames",0,"estimatedCost",costAt(total))};
  }
 }
 public sealed class ProgressAccumulator {
  readonly Dictionary<int,int> frames=new Dictionary<int,int>();
  public int Read(int part,int length,object current,bool accepted){int old;frames.TryGetValue(part,out old);int value=accepted?length:current==null?old:(int)J.N(current,"outputFrames");value=Math.Max(old,Math.Max(0,Math.Min(length,value)));frames[part]=value;return value;}
 }
}

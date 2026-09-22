using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class SegmentPlan {
  const double DomRefreshFrameCost=12d,MinSegmentSeconds=2.5d,MinReplayWarmupSeconds=1d,ReplayPenaltyWeight=.35d,MaxReplayOverheadRatio=1.50d;
  sealed class ReplayWindow {
   public int Start;public int End;public bool Root;public bool NoCut;public string Kind;
   public ReplayWindow(int start,int end,bool root=false,bool noCut=false,string kind="perform"){Start=start;End=end;Root=root;NoCut=noCut;Kind=kind??"perform";}
  }

  static ReplayWindow[] ReplayWindows(object plan,int total,int fps){
   return J.A(J.Get(plan,"replayWindows")).Select(w=>new ReplayWindow(
    Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(w,"startMs")*fps/1000))),
    Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(w,"endMs")*fps/1000))),
    J.B(w,"rootReplay"),J.B(w,"noCut"),J.S(w,"command","perform")
   )).Where(w=>w.End>w.Start).OrderBy(w=>w.Start).ToArray();
  }

  static ReplayWindow[] SoftCutWindows(object plan,int total,int fps){
   return J.A(J.Get(plan,"softCutWindows")).Select(w=>new ReplayWindow(
    Math.Max(0,Math.Min(total,(int)Math.Floor(J.N(w,"startMs")*fps/1000))),
    Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(w,"endMs")*fps/1000))),
    false,false,J.S(w,"reason","soft-state-change")
   )).Where(w=>w.End>w.Start).OrderBy(w=>w.Start).ToArray();
  }

  static ReplayWindow[] DomAnimationWindows(object plan,int total,int fps){
   int margin=Math.Max(1,(int)Math.Ceiling(fps*.25)),mergeGap=Math.Max(1,(int)Math.Ceiling(fps*.20));
   var frames=J.A(J.Get(plan,"domWorkload")).Where(x=>J.S(x,"reason")=="animation")
    .Select(x=>Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(x,"atMs")*fps/1000)))).Distinct().OrderBy(x=>x).ToArray();
   if(frames.Length==0)return new ReplayWindow[0];
   var result=new List<ReplayWindow>();int first=frames[0];int last=frames[0];
   for(int i=1;i<frames.Length;i++){
    if(frames[i]-last<=mergeGap){last=frames[i];continue;}
    result.Add(new ReplayWindow(Math.Max(0,first-margin),Math.Min(total,last+margin),false,false,"dom-animation"));first=frames[i];last=frames[i];
   }
   result.Add(new ReplayWindow(Math.Max(0,first-margin),Math.Min(total,last+margin),false,false,"dom-animation"));
   return result.Where(w=>w.End>w.Start).ToArray();
  }

  static IEnumerable<int> Nearest(IEnumerable<int> values,int target,int min,int max,int limit){
   return values.Where(v=>v>=min&&v<=max).OrderBy(v=>Math.Abs((long)v-target)).Take(limit);
  }

  static int ReplayAnchor(int cut,int minWarmupFrames,ReplayWindow[] windows){
   int anchor=Math.Max(0,cut-minWarmupFrames);
   if(windows.Any(w=>w.Root&&w.Start<=cut&&w.End>anchor))return 0;
   for(int i=windows.Length-1;i>=0;i--){
    var w=windows[i];if(w.Start>=anchor)continue;
    if(w.End>anchor)anchor=w.Start;
   }
   return Math.Max(0,Math.Min(cut,anchor));
  }

  static string ReductionReason(ReplayWindow[] noCutWindows,ReplayWindow[] protectedWindows,bool replayRejected){
   if(replayRejected)return "replay-overhead";
   if(noCutWindows.Any(w=>w.Kind=="changeFigure-phase"))return "strict-live2d-active";
   if(noCutWindows.Any(w=>w.Kind=="pixiPerform"))return "pixi-perform-active";
   if(protectedWindows.Length>0)return "protected-hint";
   return "insufficient-safe-cuts";
  }

  public static Dictionary<string,object>[] Create(object plan,int total,int fps,int workers){
   int requestedWorkers=Math.Max(1,workers);
   var diagnostics=J.O("schemaVersion",1,"requestedWorkers",requestedWorkers,"totalFrames",total,"fps",fps,"attempts",new List<object>());
   J.D(plan)["segmentPlanAttempt"]=diagnostics;
   if(total<=0){diagnostics["selectedParts"]=0;diagnostics["reductionReason"]="empty";return new Dictionary<string,object>[0];}
   workers=Math.Max(1,Math.Min(workers,total));
   int minSegmentFrames=Math.Max(1,(int)Math.Ceiling(fps*MinSegmentSeconds));
   int minReplayWarmupFrames=Math.Max(1,(int)Math.Ceiling(fps*MinReplayWarmupSeconds));
   int durationCap=Math.Max(1,total/minSegmentFrames);
   workers=Math.Min(workers,durationCap);
   diagnostics["durationWorkerCap"]=durationCap;
   if(workers<=1){
    diagnostics["selectedParts"]=1;diagnostics["reductionReason"]=requestedWorkers>1?"duration-too-short":"";
    return new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0,"warmupFrames",0,"estimatedCost",(double)total,"replayKinds",new object[0])};
   }

   var protectedWindows=J.A(J.Get(plan,"singleLineHints")).Select(h=>new ReplayWindow(
    Math.Max(0,Math.Min(total,(int)Math.Floor(J.N(h,"startMs")*fps/1000))),
    Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(h,"endMs")*fps/1000))),
    false,false,"single-line-hint"
   )).Where(w=>w.End>w.Start).OrderBy(w=>w.Start).ToArray();
   var replayOnly=ReplayWindows(plan,total,fps).Concat(DomAnimationWindows(plan,total,fps)).OrderBy(w=>w.Start).ToArray();
   var softWindows=SoftCutWindows(plan,total,fps);bool strictSegmentCuts=J.B(plan,"strictSegmentCuts",false);
   var noCutWindows=replayOnly.Where(w=>w.NoCut).ToArray();
   var cutProtected=protectedWindows.Concat(noCutWindows).OrderBy(w=>w.Start).ToArray();
   diagnostics["hardNoCutWindows"]=noCutWindows.Select(w=>(object)J.O("startFrame",w.Start,"endFrame",w.End,"kind",w.Kind)).ToArray();
   diagnostics["protectedHintWindows"]=protectedWindows.Length;
   diagnostics["softCutWindows"]=softWindows.Select(w=>(object)J.O("startFrame",w.Start,"endFrame",w.End,"kind",w.Kind)).ToArray();
   diagnostics["relaxedDecorativePixi"]=J.Get(plan,"relaxedDecorativePixi")??new object[0];diagnostics["strictSegmentCuts"]=strictSegmentCuts;
   Func<int,bool> strictSoftCut=frame=>strictSegmentCuts&&softWindows.Any(w=>frame>=w.Start&&frame<w.End);
   Func<int,bool> safeCut=frame=>!cutProtected.Any(w=>frame>w.Start&&frame<w.End)&&!strictSoftCut(frame);
   Func<int,bool> softCut=frame=>softWindows.Any(w=>frame>w.Start&&frame<w.End);
   Func<int,int> snapCut=frame=>{
    foreach(var w in cutProtected)if(frame>w.Start&&frame<w.End)frame=frame-w.Start<=w.End-frame?w.Start:w.End;
    return Math.Max(0,Math.Min(total,frame));
   };

   var replayWindows=replayOnly.Concat(protectedWindows).OrderBy(w=>w.Start).ToArray();
   Func<int,int> replayFor=cut=>ReplayAnchor(cut,minReplayWarmupFrames,replayWindows);

   var events=J.A(J.Get(plan,"events")).Where(e=>J.N(e,"line")>0&&!J.S(e,"command").StartsWith("__")).ToList();
   var preferredCuts=events.Where(e=>J.S(e,"command")=="say"&&!Regex.IsMatch(J.S(e,"script"),@"^\s*:\s*;\s*$"))
    .Select(e=>(int)Math.Ceiling(J.N(e,"atMs")*fps/1000)).Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();
   var eventCuts=events.Select(e=>(int)Math.Ceiling(J.N(e,"atMs")*fps/1000))
    .Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();
   var preferredCutSet=new HashSet<int>(preferredCuts);
   diagnostics["semanticCutCount"]=eventCuts.Count;diagnostics["preferredDialogueCutCount"]=preferredCuts.Count;

   var workload=J.A(J.Get(plan,"domWorkload")).Select(x=>new{Frame=Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(x,"atMs")*fps/1000))),Units=Math.Max(0,J.N(x,"units",1))}).OrderBy(x=>x.Frame).ToArray();
   var costPoints=new List<KeyValuePair<int,double>>();double cumulativeUnits=0;
   foreach(var w in workload){cumulativeUnits+=w.Units;costPoints.Add(new KeyValuePair<int,double>(w.Frame,cumulativeUnits));}
   Func<int,double> costAt=frame=>{
    frame=Math.Max(0,Math.Min(total,frame));double units=0;int lo=0;int hi=costPoints.Count-1;int best=-1;
    while(lo<=hi){int mid=lo+(hi-lo)/2;if(costPoints[mid].Key<frame){best=mid;lo=mid+1;}else hi=mid-1;}
    if(best>=0)units=costPoints[best].Value;
    return frame+units*DomRefreshFrameCost;
   };

   Func<List<int>,Dictionary<string,object>[]> buildRanges=cuts=>{
    var frames=new List<int>{0};frames.AddRange(cuts);frames.Add(total);
    return frames.Take(frames.Count-1).Select((start,i)=>{
     int end=frames[i+1];int replay=start==0?0:replayFor(start);int warmup=Math.Max(0,start-replay);
     double estimate=Math.Max(0,costAt(end)-costAt(start))+Math.Max(0,costAt(start)-costAt(replay));
     var replayKinds=replayWindows.Where(w=>start>0&&w.Start<start&&w.End>replay).Select(w=>w.Kind).Distinct().ToArray();
     return J.O("index",i,"startFrame",start,"endFrame",end,"replayFrame",replay,"warmupFrames",warmup,"estimatedCost",estimate,"replayKinds",replayKinds);
    }).ToArray();
   };

   double totalCost=costAt(total);bool replayRejectedAny=false;bool safeCutRejectedAny=false;
   var attemptRows=(List<object>)J.Get(diagnostics,"attempts");
   for(int parts=workers;parts>=2;parts--){
    var cuts=new List<int>();int lastCut=0;bool valid=true;int unsafeRejected=0;int softAvoided=0;int candidateCount=0;
    for(int part=1;part<parts;part++){
     int minFrame=lastCut+minSegmentFrames;int maxFrame=total-(parts-part)*minSegmentFrames;
     if(maxFrame<minFrame){valid=false;break;}
     double targetCost=part*totalCost/parts;
     int targetFrame=(int)((long)part*total/parts);
     var candidates=new List<int>();
     candidates.AddRange(Nearest(preferredCuts,targetFrame,minFrame,maxFrame,16));
     candidates.AddRange(Nearest(preferredCuts,minFrame,minFrame,maxFrame,6));
     candidates.AddRange(Nearest(preferredCuts,maxFrame,minFrame,maxFrame,6));
     candidates.AddRange(Nearest(eventCuts,targetFrame,minFrame,maxFrame,24));
     candidates.AddRange(Nearest(eventCuts,minFrame,minFrame,maxFrame,8));
     candidates.AddRange(Nearest(eventCuts,maxFrame,minFrame,maxFrame,8));
     var distinct=candidates.Distinct().Where(candidate=>candidate>=minFrame&&candidate<=maxFrame&&candidate>lastCut&&candidate>0&&candidate<total).ToArray();
     candidateCount+=distinct.Length;unsafeRejected+=distinct.Count(candidate=>!safeCut(candidate));
     var safe=distinct.Where(safeCut).ToArray();
     if(safe.Length==0){safeCutRejectedAny=true;valid=false;break;}
     var preferred=safe.Where(candidate=>!softCut(candidate)).ToArray();
     var usable=preferred.Length>0?preferred:safe;
     if(preferred.Length>0)softAvoided+=safe.Length-preferred.Length;
     var dialogueCuts=usable.Where(candidate=>preferredCutSet.Contains(candidate)).ToArray();
     if(dialogueCuts.Length>0)usable=dialogueCuts;
     int best=-1;double bestScore=double.MaxValue;
     foreach(int candidate in usable){
      int replay=replayFor(candidate);
      double balance=Math.Abs(costAt(candidate)-targetCost);
      double replayPenalty=Math.Max(0,costAt(candidate)-costAt(replay))*ReplayPenaltyWeight;
      double score=balance+replayPenalty;
      if(score<bestScore){best=candidate;bestScore=score;}
     }
     if(best<0){valid=false;break;}
     cuts.Add(best);lastCut=best;
    }
    if(!valid){attemptRows.Add(J.O("parts",parts,"outcome","no-safe-cut","candidateCount",candidateCount,"unsafeRejected",unsafeRejected,"softAvoided",softAvoided));continue;}
    var ranges=buildRanges(cuts);
    long warmup=ranges.Sum(r=>(long)J.N(r,"warmupFrames"));
    if(warmup>total*MaxReplayOverheadRatio){replayRejectedAny=true;attemptRows.Add(J.O("parts",parts,"outcome","replay-overhead","warmupFrames",warmup,"maxWarmupFrames",total*MaxReplayOverheadRatio,"candidateCount",candidateCount,"unsafeRejected",unsafeRejected,"softAvoided",softAvoided));continue;}
    attemptRows.Add(J.O("parts",parts,"outcome","selected","warmupFrames",warmup,"candidateCount",candidateCount,"unsafeRejected",unsafeRejected,"softAvoided",softAvoided));
    diagnostics["selectedParts"]=parts;
    diagnostics["reductionReason"]=parts<workers?ReductionReason(noCutWindows,protectedWindows,replayRejectedAny):parts<requestedWorkers?"duration-too-short":"";
    diagnostics["safeCutRejected"]=safeCutRejectedAny;
    diagnostics["replayRejected"]=replayRejectedAny;
    return ranges;
   }

   diagnostics["selectedParts"]=1;
   diagnostics["safeCutRejected"]=safeCutRejectedAny;
   diagnostics["replayRejected"]=replayRejectedAny;
   diagnostics["reductionReason"]=workers>1?ReductionReason(noCutWindows,protectedWindows,replayRejectedAny):requestedWorkers>workers?"duration-too-short":ReductionReason(noCutWindows,protectedWindows,replayRejectedAny);
   return new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0,"warmupFrames",0,"estimatedCost",costAt(total),"replayKinds",new object[0])};
  }
 }
 public sealed class ProgressAccumulator {
  readonly Dictionary<int,int> frames=new Dictionary<int,int>();
  public int Read(int part,int length,object current,bool accepted){int old;frames.TryGetValue(part,out old);int value=accepted?length:current==null?old:(int)J.N(current,"outputFrames");value=Math.Max(old,Math.Max(0,Math.Min(length,value)));frames[part]=value;return value;}
 }
}

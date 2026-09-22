using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class SegmentPlan {
  const double DomRefreshFrameCost=12d,MinSegmentSeconds=2.5d,MinReplayWarmupSeconds=1d,Live2DPhysicsWarmupSeconds=3d;
  public const double ReplayPenaltyWeight=.35d,MaxWeightedReplayOverheadRatio=1.50d;
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

  static ReplayWindow[] Live2DLifetimes(object plan,int total,int fps){
   return J.A(J.Get(plan,"live2dLifetimes")).Select(w=>new ReplayWindow(
    Math.Max(0,Math.Min(total,(int)Math.Floor(J.N(w,"startMs")*fps/1000))),
    Math.Max(0,Math.Min(total,(int)Math.Ceiling(J.N(w,"endMs")*fps/1000))),
    false,false,"live2d-lifetime"
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

  static int ReplayAnchor(int cut,int minWarmupFrames,ReplayWindow[] windows){
   int anchor=Math.Max(0,cut-minWarmupFrames);
   if(windows.Any(w=>w.Root&&w.Start<=cut&&w.End>anchor))return 0;
   for(int i=windows.Length-1;i>=0;i--){
    var w=windows[i];if(w.Start>=anchor)continue;
    if(w.End>anchor)anchor=w.Start;
   }
   return Math.Max(0,Math.Min(cut,anchor));
  }

  static string ReductionReason(ReplayWindow[] noCutWindows,ReplayWindow[] protectedWindows,ReplayWindow[] strictLive2dWindows,bool replayRejected){
   if(replayRejected)return "replay-overhead";
   if(strictLive2dWindows.Length>0)return "strict-live2d-active";
   if(noCutWindows.Any(w=>w.Kind=="pixiPerform"))return "pixi-perform-active";
   if(protectedWindows.Length>0)return "protected-hint";
   return "insufficient-safe-cuts";
  }

  public static Dictionary<string,object>[] Create(object plan,int total,int fps,int workers){
   int requestedWorkers=Math.Max(1,workers);
   var diagnostics=J.O("schemaVersion",1,"requestedWorkers",requestedWorkers,"totalFrames",total,"fps",fps,"replayCostWeight",ReplayPenaltyWeight,"maxWeightedReplayOverheadRatio",MaxWeightedReplayOverheadRatio,"attempts",new List<object>());
   J.D(plan)["segmentPlanAttempt"]=diagnostics;
   if(total<=0){diagnostics["selectedParts"]=0;diagnostics["reductionReason"]="empty";return new Dictionary<string,object>[0];}
   workers=Math.Max(1,Math.Min(workers,total));
   int minSegmentFrames=Math.Max(1,(int)Math.Ceiling(fps*MinSegmentSeconds));
   int minReplayWarmupFrames=Math.Max(1,(int)Math.Ceiling(fps*MinReplayWarmupSeconds));
   int live2dPhysicsWarmupFrames=Math.Max(minReplayWarmupFrames,(int)Math.Ceiling(fps*Live2DPhysicsWarmupSeconds));
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
   var live2dLifetimes=Live2DLifetimes(plan,total,fps);
   var softWindows=SoftCutWindows(plan,total,fps);bool strictSegmentCuts=J.B(plan,"strictSegmentCuts",false);
   var noCutWindows=replayOnly.Where(w=>w.NoCut).ToArray();
   var strictLive2dWindows=strictSegmentCuts?live2dLifetimes:new ReplayWindow[0];
   var cutProtected=protectedWindows.Concat(noCutWindows).Concat(strictLive2dWindows).OrderBy(w=>w.Start).ToArray();
   diagnostics["hardNoCutWindows"]=noCutWindows.Select(w=>(object)J.O("startFrame",w.Start,"endFrame",w.End,"kind",w.Kind)).ToArray();
   diagnostics["protectedHintWindows"]=protectedWindows.Length;
   diagnostics["live2dLifetimeWindows"]=live2dLifetimes.Select(w=>(object)J.O("startFrame",w.Start,"endFrame",w.End,"kind",w.Kind)).ToArray();
   diagnostics["live2dPhysicsWarmupFrames"]=live2dPhysicsWarmupFrames;
   diagnostics["live2dPhysicsWarmupSeconds"]=live2dPhysicsWarmupFrames/(double)fps;
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
   Func<int,bool> live2dActive=cut=>live2dLifetimes.Any(w=>cut>w.Start&&cut<w.End);
   Func<int,int> replayFor=cut=>ReplayAnchor(cut,live2dActive(cut)?live2dPhysicsWarmupFrames:minReplayWarmupFrames,replayWindows);

   var allEvents=J.A(J.Get(plan,"events")).ToList();
   var events=allEvents.Where(e=>J.N(e,"line")>0&&!J.S(e,"command").StartsWith("__")).ToList();
   var preferredCuts=events.Where(e=>J.S(e,"command")=="say"&&!Regex.IsMatch(J.S(e,"script"),@"^\s*:\s*;\s*$"))
    .Select(e=>(int)Math.Ceiling(J.N(e,"atMs")*fps/1000)).Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();
   var eventCuts=events.Select(e=>(int)Math.Ceiling(J.N(e,"atMs")*fps/1000))
    .Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();
   var controlCuts=allEvents.Where(e=>J.S(e,"command").StartsWith("__")).Select(e=>(int)Math.Ceiling(J.N(e,"atMs")*fps/1000))
    .Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();
   var protectedBoundaryCuts=cutProtected.Select(w=>w.End).Concat(strictSegmentCuts?softWindows.Select(w=>w.End):Enumerable.Empty<int>())
    .Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToList();
   var preferredCutSet=new HashSet<int>(preferredCuts);var eventCutSet=new HashSet<int>(eventCuts);var controlCutSet=new HashSet<int>(controlCuts);var protectedBoundaryCutSet=new HashSet<int>(protectedBoundaryCuts);
   var candidatePool=eventCuts.Concat(controlCuts).Concat(protectedBoundaryCuts).Where(frame=>frame>0&&frame<total).Distinct().OrderBy(frame=>frame).ToArray();
   diagnostics["semanticCutCount"]=eventCuts.Count;diagnostics["preferredDialogueCutCount"]=preferredCuts.Count;diagnostics["controlCutCount"]=controlCuts.Count;diagnostics["protectedBoundaryCutCount"]=protectedBoundaryCuts.Count;diagnostics["candidatePoolCount"]=candidatePool.Length;diagnostics["plannerMode"]="global-safe-dp";

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
     var replayKinds=replayWindows.Where(w=>start>0&&w.Start<start&&w.End>replay).Select(w=>w.Kind).Concat(live2dActive(start)?new[]{"live2d-physics"}:new string[0]).Distinct().ToArray();
     return J.O("index",i,"startFrame",start,"endFrame",end,"replayFrame",replay,"warmupFrames",warmup,"estimatedCost",estimate,"replayKinds",replayKinds);
    }).ToArray();
   };

   double totalCost=costAt(total);bool replayRejectedAny=false;bool safeCutRejectedAny=false;
   var attemptRows=(List<object>)J.Get(diagnostics,"attempts");
   Func<int,int,List<int>,bool> planCuts=(parts,pass,outCuts)=>{
    outCuts.Clear();int need=parts-1;if(need<=0)return true;
    bool allowSoft=pass>0;
    var pool=candidatePool.Where(frame=>safeCut(frame)&&(allowSoft||!softCut(frame))).ToArray();
    if(pool.Length<need)return false;
    int m=pool.Length;var previous=new double[m];var current=new double[m];var back=new int[need,m];
    for(int i=0;i<m;i++){previous[i]=double.PositiveInfinity;current[i]=double.PositiveInfinity;for(int j=0;j<need;j++)back[j,i]=-1;}
    Func<int,int,double> cutScore=(frame,part)=>{
     double targetCost=part*totalCost/parts,balance=Math.Abs(costAt(frame)-targetCost);
     int replay=replayFor(frame);double replayPenalty=Math.Max(0,costAt(frame)-costAt(replay))*ReplayPenaltyWeight;
     double sourcePenalty=preferredCutSet.Contains(frame)?0:eventCutSet.Contains(frame)?totalCost*.002:controlCutSet.Contains(frame)?totalCost*.004:protectedBoundaryCutSet.Contains(frame)?totalCost*.006:totalCost*.01;
     double softPenalty=softCut(frame)?totalCost*.25:0;
     return balance+replayPenalty+sourcePenalty+softPenalty;
    };
    for(int i=0;i<m;i++){int frame=pool[i];if(frame<minSegmentFrames||frame>total-(parts-1)*minSegmentFrames)continue;previous[i]=cutScore(frame,1);}
    for(int part=2;part<=need;part++){
     for(int i=0;i<m;i++)current[i]=double.PositiveInfinity;
     double bestPrev=double.PositiveInfinity;int bestPrevIndex=-1,pointer=0;
     for(int i=0;i<m;i++){
      int frame=pool[i],minFrame=part*minSegmentFrames,maxFrame=total-(parts-part)*minSegmentFrames;
      while(pointer<m&&pool[pointer]<=frame-minSegmentFrames){if(previous[pointer]<bestPrev){bestPrev=previous[pointer];bestPrevIndex=pointer;}pointer++;}
      if(frame<minFrame||frame>maxFrame||bestPrevIndex<0||double.IsInfinity(bestPrev))continue;
      current[i]=bestPrev+cutScore(frame,part);back[part-1,i]=bestPrevIndex;
     }
     var swap=previous;previous=current;current=swap;
    }
    double best=double.PositiveInfinity;int endIndex=-1;
    for(int i=0;i<m;i++){if(total-pool[i]<minSegmentFrames)continue;if(previous[i]<best){best=previous[i];endIndex=i;}}
    if(endIndex<0||double.IsInfinity(best))return false;
    var selected=new int[need];int index=endIndex;
    for(int part=need;part>=1;part--){selected[part-1]=pool[index];if(part>1){index=back[part-1,index];if(index<0)return false;}}
    outCuts.AddRange(selected);return true;
   };
   for(int parts=workers;parts>=2;parts--){
    var cuts=new List<int>();bool valid=planCuts(parts,0,cuts);bool usedSoftCuts=false;
    if(!valid){cuts.Clear();valid=planCuts(parts,1,cuts);usedSoftCuts=valid;}
    int candidateCount=candidatePool.Length,unsafeRejected=candidatePool.Count(candidate=>!safeCut(candidate)),safeCandidateCount=candidatePool.Count(safeCut),softCandidateCount=candidatePool.Count(candidate=>safeCut(candidate)&&softCut(candidate));
    if(!valid){safeCutRejectedAny=true;attemptRows.Add(J.O("parts",parts,"outcome","no-safe-cut","candidateCount",candidateCount,"safeCandidateCount",safeCandidateCount,"unsafeRejected",unsafeRejected,"softCandidateCount",softCandidateCount,"usedSoftCuts",false));continue;}
    var ranges=buildRanges(cuts);
    long warmup=ranges.Sum(r=>(long)J.N(r,"warmupFrames"));
    double weightedReplayFrames=warmup*ReplayPenaltyWeight,maxWeightedReplayFrames=total*MaxWeightedReplayOverheadRatio;
    double rawReplayRatio=total>0?warmup/(double)total:0,weightedReplayRatio=total>0?weightedReplayFrames/total:0;
    if(weightedReplayFrames>maxWeightedReplayFrames){replayRejectedAny=true;attemptRows.Add(J.O("parts",parts,"outcome","replay-overhead","warmupFrames",warmup,"rawReplayRatio",rawReplayRatio,"weightedReplayFrames",weightedReplayFrames,"weightedReplayRatio",weightedReplayRatio,"maxWeightedReplayFrames",maxWeightedReplayFrames,"candidateCount",candidateCount,"safeCandidateCount",safeCandidateCount,"unsafeRejected",unsafeRejected,"softCandidateCount",softCandidateCount,"usedSoftCuts",usedSoftCuts));continue;}
    attemptRows.Add(J.O("parts",parts,"outcome","selected","warmupFrames",warmup,"rawReplayRatio",rawReplayRatio,"weightedReplayFrames",weightedReplayFrames,"weightedReplayRatio",weightedReplayRatio,"maxWeightedReplayFrames",maxWeightedReplayFrames,"candidateCount",candidateCount,"safeCandidateCount",safeCandidateCount,"unsafeRejected",unsafeRejected,"softCandidateCount",softCandidateCount,"usedSoftCuts",usedSoftCuts,"cuts",cuts.ToArray()));
    diagnostics["selectedParts"]=parts;
    diagnostics["reductionReason"]=parts<workers?ReductionReason(noCutWindows,protectedWindows,strictLive2dWindows,replayRejectedAny):parts<requestedWorkers?"duration-too-short":"";
    diagnostics["safeCutRejected"]=safeCutRejectedAny;
    diagnostics["replayRejected"]=replayRejectedAny;
    return ranges;
   }

   diagnostics["selectedParts"]=1;
   diagnostics["safeCutRejected"]=safeCutRejectedAny;
   diagnostics["replayRejected"]=replayRejectedAny;
   diagnostics["reductionReason"]=workers>1?ReductionReason(noCutWindows,protectedWindows,strictLive2dWindows,replayRejectedAny):requestedWorkers>workers?"duration-too-short":ReductionReason(noCutWindows,protectedWindows,strictLive2dWindows,replayRejectedAny);
   return new[]{J.O("index",0,"startFrame",0,"endFrame",total,"replayFrame",0,"warmupFrames",0,"estimatedCost",costAt(total),"replayKinds",new object[0])};
  }
 }
 public sealed class ProgressAccumulator {
  readonly Dictionary<int,int> frames=new Dictionary<int,int>();
  public int Read(int part,int length,object current,bool accepted){int old;frames.TryGetValue(part,out old);int value=accepted?length:current==null?old:(int)J.N(current,"outputFrames");value=Math.Max(old,Math.Max(0,Math.Min(length,value)));frames[part]=value;return value;}
 }
}

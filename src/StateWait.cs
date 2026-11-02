using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace NativeVideo {
 public sealed class StateWaitTimeoutException : TimeoutException {
  public readonly object LastState;
  public readonly bool QueryPending;
  public StateWaitTimeoutException(object state,bool pending,Exception inner=null)
   : base("等待前置场景恢复超时",inner) { LastState=state;QueryPending=pending; }
 }

 // One in-flight evaluation owns the remaining deadline. A slow CDP response is
 // awaited rather than abandoned in favour of another request on the same page.
 public static class StateWait {
  public static async Task<object> Run(Func<int,Task<object>> evaluate,Func<object,bool> ready,int milliseconds,CancellationToken cancellation=default(CancellationToken)) {
   if(milliseconds<=0)throw new ArgumentOutOfRangeException("milliseconds");
   var elapsed=Stopwatch.StartNew();object last=null;
   while(true) {
    cancellation.ThrowIfCancellationRequested();
    int remaining=milliseconds-(int)elapsed.ElapsedMilliseconds;
    if(remaining<=0)throw new StateWaitTimeoutException(last,false);
    var query=evaluate(remaining);
    using(var timer=CancellationTokenSource.CreateLinkedTokenSource(cancellation)) {
     var deadline=Task.Delay(remaining,timer.Token);
     if(await Task.WhenAny(query,deadline)!=query) {
      query.ContinueWith(t=>{var ignored=t.Exception;},TaskContinuationOptions.OnlyOnFaulted|TaskContinuationOptions.ExecuteSynchronously);
      cancellation.ThrowIfCancellationRequested();
      throw new StateWaitTimeoutException(last,true);
     }
     timer.Cancel();
    }
    cancellation.ThrowIfCancellationRequested();
    try { last=await query; }
    catch(TimeoutException error) { throw new StateWaitTimeoutException(last,true,error); }
    cancellation.ThrowIfCancellationRequested();
    if(elapsed.ElapsedMilliseconds>=milliseconds)throw new StateWaitTimeoutException(last,false);
    if(ready(last))return last;
    remaining=milliseconds-(int)elapsed.ElapsedMilliseconds;
    if(remaining<=0)throw new StateWaitTimeoutException(last,false);
    await Task.Delay(Math.Min(20,remaining),cancellation);
   }
  }
 }
}

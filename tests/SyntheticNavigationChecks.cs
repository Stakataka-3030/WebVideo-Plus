using System;
using System.IO;
using System.Linq;
using NativeVideo;

public static class SyntheticNavigationChecks {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static object Request(string id,string url,string document){return J.O("requestId",id,"request",J.O("url",url),"documentURL",document,"loaderId","loader-1");}
 public static int Main(string[] args){try{
  string file=Path.Combine(args[0],"recorder-checks.jsonl");if(File.Exists(file))File.Delete(file);
  var trace=new SyntheticNavigationRecorder(file,new[]{"/index.html","/game/config.txt"});
  trace.Starting("http://127.0.0.1:10001/index.html","1");
  trace.Request(Request("request.1","http://127.0.0.1:10001/game/config.txt?secret=never","http://127.0.0.1:10001/index.html"));
  trace.Starting("http://127.0.0.1:10002/index.html","2");
  trace.Message("http://127.0.0.1:10001/index.html","AxiosError: Network Error private-data");
  trace.Failed(J.O("requestId","request.1","errorText","net::ERR_CONNECTION_REFUSED","canceled",false));
  var rows=File.ReadAllLines(file).Select(J.Parse).ToArray();
  Check(rows.Length==4,"Expected both navigations, page error and request failure");
  Check(J.N(rows[3],"navigationSequence")==2,"Failure lost current navigation sequence");
  var failed=J.Get(J.Get(rows[3],"detail"),"request");
  Check(J.N(failed,"requestNavigationSequence")==1,"Old pending request lost its original navigation sequence");
  Check(J.S(failed,"url")=="http://127.0.0.1:10001/game/config.txt","Request URL/query sanitation failed");
  Check(J.S(J.Get(rows[2],"detail"),"source")=="http://127.0.0.1:10001/index.html","Old page message source was lost");
  Check(!File.ReadAllText(file).Contains("private-data")&&!File.ReadAllText(file).Contains("secret"),"Private payload was recorded");
  Check(trace.SafeUrl("https://example.com/private")=="[redacted]","External URL was recorded");
  Check(trace.SafeUrl("file:///C:/private.txt")=="[redacted]","Filesystem URL was recorded");
  Check(trace.SafeUrl("http://127.0.0.1:10001/private/name")=="http://127.0.0.1:10001/[unlisted-path]","Unlisted path was recorded");
  Check(trace.SafeUrl("http://user:secret@127.0.0.1:10001/index.html")=="[redacted]","Credential URL was recorded");
  for(int i=0;i<1000;i++)trace.Request(Request("r"+i,"http://127.0.0.1:10002/game/config.txt","http://127.0.0.1:10002/index.html"));
  Check(trace.PendingCount<=SyntheticNavigationRecorder.MaxRequests,"Pending request memory was unbounded");
  trace.Finished("r999");Check(trace.PendingCount<SyntheticNavigationRecorder.MaxRequests,"Completed request was not removed");
  trace.Failed(J.O("requestId","unknown","errorText","private error text","canceled",true));
  Check(!File.ReadAllText(file).Contains("private error text"),"Unrecognized network error text was recorded");
  for(int i=0;i<300;i++)trace.Completed("2",true,"Unknown");
  var bounded=File.ReadAllLines(file);
  Check(bounded.Length==SyntheticNavigationRecorder.MaxRecords+1,"Diagnostic line limit failed");
  Check(J.S(J.Parse(bounded.Last()),"kind")=="limit","Missing truncation marker");
  Console.WriteLine("PASS synthetic navigation recorder: old/new origins, pending request correlation, privacy allowlist, completed request cleanup and record/memory bounds; no browser or GUI started.");return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}

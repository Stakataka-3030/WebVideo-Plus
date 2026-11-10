using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.WinForms;
using NativeVideo;

// Test-only observer. This file is never included by build.ps1 or shipped.
// No error is removed, ignored, retried or reclassified by this observer.
public sealed class SyntheticNavigationRecorder {
 public const int MaxRecords=128,MaxRequests=256;
 readonly string output;
 readonly HashSet<string> allowed;
 readonly Dictionary<string,object> requests=new Dictionary<string,object>();
 readonly Queue<string> order=new Queue<string>();
 int records,sequence;
 string current="";
 bool truncated;
 public int PendingCount {get{return requests.Count;}}
 public SyntheticNavigationRecorder(string output,IEnumerable<string> allowedPaths){this.output=output;allowed=new HashSet<string>(allowedPaths,StringComparer.Ordinal);}
 public string SafeUrl(string value){
  Uri uri;
  if(!Uri.TryCreate(value,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.UserInfo.Length!=0)return "[redacted]";
  return uri.GetLeftPart(UriPartial.Authority)+(allowed.Contains(uri.AbsolutePath)?uri.AbsolutePath:"/[unlisted-path]");
 }
 static string Token(string value){return Regex.IsMatch(value??"","^[A-Za-z0-9_.:-]{1,80}$")?value:"[redacted]";}
 public void Write(string kind,object detail){
  if(records>=MaxRecords){if(!truncated){truncated=true;Append("limit",J.O("maxRecords",MaxRecords));}return;}
  records++;Append(kind,detail);
 }
 void Append(string kind,object detail){File.AppendAllText(output,J.Text(J.O("atUtc",DateTime.UtcNow.ToString("o"),"kind",kind,"navigationSequence",sequence,"currentUrl",current,"detail",detail))+Environment.NewLine,new UTF8Encoding(false));}
 public void Starting(string url,string id){string previous=current;current=SafeUrl(url);sequence++;Write("navigation-starting",J.O("navigationId",Token(id),"previousUrl",previous,"url",current));}
 public void Completed(string id,bool success,string status){Write("navigation-completed",J.O("navigationId",Token(id),"success",success,"status",Token(status)));}
 public void Message(string source,string message){Write("page-error",J.O("source",SafeUrl(source),"networkError",(message??"").Contains("Network Error")));}
 public void Request(object value){
  string id=J.S(value,"requestId");
  if(!requests.ContainsKey(id)){
   while(requests.Count>=MaxRequests&&order.Count>0)requests.Remove(order.Dequeue());
   order.Enqueue(id);
  }
  requests[id]=J.O("requestId",Token(id),"url",SafeUrl(J.S(J.Get(value,"request"),"url")),"documentUrl",SafeUrl(J.S(value,"documentURL")),"loaderId",Token(J.S(value,"loaderId")),"requestNavigationSequence",sequence);
  // Completed requests can leave stale queue entries. Bound both structures.
  if(order.Count>MaxRequests*2){order.Clear();foreach(string key in requests.Keys)order.Enqueue(key);}
 }
 public void Finished(string id){requests.Remove(id);}
 public void Failed(object value){
  string id=J.S(value,"requestId"),error=J.S(value,"errorText");object request;
  requests.TryGetValue(id,out request);requests.Remove(id);
  Write("request-failed",J.O("request",request??J.O("requestId",Token(id),"notTracked",true),"errorText",Regex.IsMatch(error,"^net::ERR_[A-Z0-9_]+$")?error:"[redacted]","canceled",J.B(value,"canceled")));
 }
}

public static class SyntheticNavigationTrace {
 public static async Task Attach(WebView2 view){
  string configFile=App.Arg("--synthetic-navigation-trace");
  if(configFile=="")return;
  // The fixture generates this allowlist. Do not collect arbitrary page paths,
  // query strings, headers, bodies, JavaScript stacks, profiles or model files.
  var config=J.Read(configFile);
  var paths=new List<string>();foreach(object item in J.A(J.Get(config,"allowedPaths")))paths.Add(Convert.ToString(item));
  string output=Path.ChangeExtension(configFile,"jsonl");
  var trace=new SyntheticNavigationRecorder(output,paths);
  var core=view.CoreWebView2;
  core.NavigationStarting+=(s,e)=>trace.Starting(e.Uri,e.NavigationId.ToString());
  core.NavigationCompleted+=(s,e)=>trace.Completed(e.NavigationId.ToString(),e.IsSuccess,e.WebErrorStatus.ToString());
  core.WebMessageReceived+=(s,e)=>{
   try{var message=J.Parse(e.WebMessageAsJson);if(J.S(message,"type")=="error")trace.Message(e.Source,J.S(message,"message"));}
   catch(Exception error){trace.Write("observer-error",J.O("exceptionType",error.GetType().Name));}
  };
  core.GetDevToolsProtocolEventReceiver("Network.requestWillBeSent").DevToolsProtocolEventReceived+=(s,e)=>{
   try{trace.Request(J.Parse(e.ParameterObjectAsJson));}catch(Exception error){trace.Write("observer-error",J.O("exceptionType",error.GetType().Name));}
  };
  core.GetDevToolsProtocolEventReceiver("Network.loadingFinished").DevToolsProtocolEventReceived+=(s,e)=>{
   try{trace.Finished(J.S(J.Parse(e.ParameterObjectAsJson),"requestId"));}catch(Exception error){trace.Write("observer-error",J.O("exceptionType",error.GetType().Name));}
  };
  core.GetDevToolsProtocolEventReceiver("Network.loadingFailed").DevToolsProtocolEventReceived+=(s,e)=>{
   try{trace.Failed(J.Parse(e.ParameterObjectAsJson));}catch(Exception error){trace.Write("observer-error",J.O("exceptionType",error.GetType().Name));}
  };
  await core.CallDevToolsProtocolMethodAsync("Network.enable","{}");
  trace.Write("observer-ready",J.O("maxRecords",SyntheticNavigationRecorder.MaxRecords,"maxPendingRequests",SyntheticNavigationRecorder.MaxRequests));
 }
}

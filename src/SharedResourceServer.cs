using System;using System.IO;using System.Linq;using System.Net.Sockets;using System.Text.RegularExpressions;using System.Collections.Generic;using System.Threading.Tasks;
namespace NativeVideo {
 public sealed partial class SharedAssets {
  object httpSnapshot;
  object HttpState {get{return snapshot!=null?httpSnapshot:J.TryRead(registry+".http.json");}}
  public string HttpPrefix {get{var state=HttpState;int port=(int)J.N(state,"port");string id=J.S(state,"id");return port>0&&Regex.IsMatch(id,"^[a-f0-9]{32}$")?"http://127.0.0.1:"+port+"/webvideo-shared/"+id+"/":null;}}
  public int ResourcePort {get{return (int)J.N(HttpState,"port");}}
  public void SaveResourcePort(int port){lock(gate){var state=HttpState;J.Write(registry+".http.json",J.O("schemaVersion",1,"port",port,"id",J.S(state,"id",Guid.NewGuid().ToString("N"))));}}
  public string ResourceReference(string url){string prefix=HttpPrefix;if(prefix==null||url==null||!url.StartsWith(prefix,StringComparison.Ordinal))return null;return Relative(Prefix+Uri.UnescapeDataString(Regex.Split(url.Substring(prefix.Length),"[?#]")[0]));}
  public string ResourceUrl(string kind,string reference){Resolve(kind,reference);if(HttpPrefix==null)throw new IOException("共享资源服务尚未就绪，请重新启动 Terre");return HttpPrefix+string.Join("/",reference.Substring(Prefix.Length).Split('/').Select(Uri.EscapeDataString));}
  public string ResourceFile(string reference){reference=Relative(reference);if(!reference.StartsWith(Prefix,StringComparison.Ordinal))throw new IOException("共享素材路径无效");string id=reference.Substring(Prefix.Length).Split('/')[0],kind=KindForId(id);if(kind==null)throw new IOException("共享素材来源未登记");return Resolve(kind=="all"?"figure":kind,reference);}
  IEnumerable<string> HttpReferences(string source){string prefix=HttpPrefix;if(prefix!=null)foreach(Match m in Regex.Matches(source??"",Regex.Escape(prefix)+@"[^\s;\""'<>|]+")){string reference=ResourceReference(m.Value);if(reference!=null)yield return reference;}}
  public SharedAssets ForHttpSource(string source){
   var ids=new HashSet<string>(HttpReferences(source).Select(r=>r.Substring(Prefix.Length).Split('/')[0]));if(ids.Count==0)return this;
   var frozen=FromSnapshot(Export());frozen.snapshot=frozen.snapshot.Select(l=>(object)new Dictionary<string,object>(J.D(l))).ToList();
   // An HTTP resource can be used by different commands; category tags remain
   // unchanged in the registry and only the prepared copy permits those uses.
   foreach(var library in frozen.snapshot)if(ids.Contains(J.S(library,"id")))J.D(library)["kind"]="all";return frozen;
  }
  public IEnumerable<string> SourceReferences(string source){
   foreach(string reference in HttpReferences(source))yield return reference;
   foreach(Match m in Regex.Matches(source??"",@"__shared/[a-f0-9]{32}/[^;\r\n\""'|]+")){string value=Regex.Split(m.Value,@"\s+-[A-Za-z]")[0].TrimEnd();if(value!="")yield return value;}
  }
  public string LocalizeSource(string source){string prefix=HttpPrefix;if(prefix==null)return source;return Regex.Replace(source??"",Regex.Escape(prefix)+@"[^\s;\""'<>|]+",m=>ResourceReference(m.Value)+new Uri(m.Value).Query+new Uri(m.Value).Fragment);}
  public string UpgradeSource(string source){return Regex.Replace(source??"",@"__shared/([a-f0-9]{32})/([^;\r\n\""'|]+)",m=>{string value=Regex.Split(m.Value,@"\s+-[A-Za-z]")[0].TrimEnd();string kind=KindForId(m.Groups[1].Value);if(kind==null)throw new IOException("共享素材来源未登记，暂不能转换引用");return ResourceUrl(kind=="all"?"figure":kind,value)+m.Value.Substring(value.Length);});}
 }
 public sealed class SharedResourceServer:IDisposable {
  readonly SharedAssets store;readonly ExternalEngines engines;readonly HashSet<string> origins;readonly object startGate=new object();HttpServer server;public string Error{get;private set;}
  public SharedResourceServer(SharedAssets store,IEnumerable<string> origins,ExternalEngines engines=null){this.store=store;this.engines=engines;this.origins=new HashSet<string>(origins,StringComparer.OrdinalIgnoreCase);Start();}
  public void Start(){lock(startGate){if(server!=null)return;try{server=new HttpServer(Handle,store.ResourcePort);if(store.ResourcePort==0)store.SaveResourcePort(server.Port);Error=null;}catch(SocketException){Error="共享资源端口 "+store.ResourcePort+" 被占用，请关闭占用程序后重试";}catch(Exception e){if(server!=null){server.Dispose();server=null;}Error=e.Message;}}}
  bool Allowed(HttpRequest r){string host;if(!r.Headers.TryGetValue("Host",out host)||!(host=="127.0.0.1:"+store.ResourcePort||host=="localhost:"+store.ResourcePort))return false;string origin;if(r.Headers.TryGetValue("Origin",out origin))return origins.Contains(origin);string referer;if(r.Headers.TryGetValue("Referer",out referer)){Uri uri;return Uri.TryCreate(referer,UriKind.Absolute,out uri)&&origins.Contains(uri.GetLeftPart(UriPartial.Authority));}string site;return !r.Headers.TryGetValue("Sec-Fetch-Site",out site)||site!="cross-site";}
  Task<HttpResponse> Handle(HttpRequest r){HttpResponse result;try{
   if(!Allowed(r))return Task.FromResult(HttpResponse.Data(J.O("error","共享资源来源无效"),403));
   if(!new[]{"GET","HEAD","OPTIONS"}.Contains(r.Method))return Task.FromResult(HttpResponse.Data(J.O("error","共享素材为只读"),405));
   string prefix=new Uri(store.HttpPrefix).AbsolutePath;bool engineResource=engines!=null&&r.Path.StartsWith(new Uri(engines.Prefix).AbsolutePath,StringComparison.Ordinal);if(!engineResource&&!r.Path.StartsWith(prefix,StringComparison.Ordinal))return Task.FromResult(HttpResponse.Data(null,404));
   if(r.Method=="OPTIONS")result=new HttpResponse{Status=204,Bytes=new byte[0]};
   else{string reference=store.ResourceReference("http://127.0.0.1:"+store.ResourcePort+r.Path),file=engineResource?engines.FileFor(r.Path):store.ResourceFile(reference);result=SnapshotServer.FileResponse(r,file);result.Headers["X-Content-Type-Options"]="nosniff";result.Headers["Content-Security-Policy"]="sandbox";var stamp=new FileInfo(file);string etag="\""+Files.HashText(file).Substring(0,16)+"-"+stamp.Length.ToString("x")+"-"+stamp.LastWriteTimeUtc.Ticks.ToString("x")+"\"",incoming;if(result.Status==200&&r.Headers.TryGetValue("If-None-Match",out incoming)&&incoming==etag)result=new HttpResponse{Status=304,Bytes=new byte[0]};result.Headers["ETag"]=etag;result.Headers["Cache-Control"]="private, no-cache";}
   string origin;if(r.Headers.TryGetValue("Origin",out origin))result.Headers["Access-Control-Allow-Origin"]=origin;
   result.Headers["Vary"]="Origin";result.Headers["Access-Control-Allow-Methods"]="GET, HEAD, OPTIONS";result.Headers["Access-Control-Allow-Headers"]="Range, If-None-Match";result.Headers["Access-Control-Expose-Headers"]="Content-Length, Content-Range, ETag, Accept-Ranges";
  }catch(Exception e){result=HttpResponse.Data(J.O("error",e.Message),404);}return Task.FromResult(result);}
  public void Dispose(){lock(startGate){if(server!=null){server.Dispose();server=null;}}}
 }
}

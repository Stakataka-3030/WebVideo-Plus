using System;using System.IO;using System.Net;using System.Net.Http;using System.Net.Sockets;using System.Linq;using System.Threading.Tasks;using System.Collections.Generic;using NativeVideo;
class SharedResourceChecks {
 static int count;static void Check(bool ok,string name){if(!ok)throw new Exception(name);count++;Console.WriteLine("PASS "+name);}
 static async Task<HttpResponseMessage> Get(HttpClient client,string url,string method="GET",string origin=null,string range=null,string etag=null){var request=new HttpRequestMessage(new HttpMethod(method),url);if(origin!=null)request.Headers.Add("Origin",origin);if(range!=null)request.Headers.TryAddWithoutValidation("Range",range);if(etag!=null)request.Headers.TryAddWithoutValidation("If-None-Match",etag);return await client.SendAsync(request);}
 static void Main(string[] args){Run(args[0]).GetAwaiter().GetResult();}
 static async Task Run(string root){Directory.CreateDirectory(root);string library=Path.Combine(root,"shared 中文"),file=Path.Combine(library,"人物 空格/model.model3.json"),registry=Path.Combine(root,"state/shared-assets.json");Directory.CreateDirectory(Path.GetDirectoryName(file));Directory.CreateDirectory(Path.Combine(library,"公共"));File.WriteAllText(file,"{\"FileReferences\":{\"Textures\":[\"../公共/贴图.png\"]}}");File.WriteAllBytes(Path.Combine(library,"公共/贴图.png"),new byte[]{1,2,3,4,5,6,7,8});string original=Files.Hash(file);var store=new SharedAssets(registry);string id=J.S(store.Add(library,"all","共享"),"id"),reference="__shared/"+id+"/人物 空格/model.model3.json",url,prefix;int port;
  using(var client=new HttpClient(new HttpClientHandler{UseProxy=false}){Timeout=TimeSpan.FromSeconds(5)}){
   using(var server=new SharedResourceServer(store,new[]{"http://localhost:3001"})){
    Check(server.Error==null,"resource start");url=store.ResourceUrl("figure",reference);prefix=store.HttpPrefix;port=store.ResourcePort;Check(url.Contains("%20")&&url.Contains("%E4"),"UTF-8 and spaces encoded");
    using(var r=await Get(client,url,origin:"http://localhost:3001")){Check(r.StatusCode==HttpStatusCode.OK,"allowed editor read");Check(r.Headers.GetValues("Access-Control-Allow-Origin").Single()=="http://localhost:3001","scoped CORS");Check(await r.Content.ReadAsStringAsync()==File.ReadAllText(file),"resource bytes");string etag=r.Headers.ETag.Tag;using(var cached=await Get(client,url,etag:etag)){Check(cached.StatusCode==HttpStatusCode.NotModified&&(await cached.Content.ReadAsByteArrayAsync()).Length==0,"conditional cache");}}
    string child=new Uri(new Uri(url),"../公共/贴图.png").AbsoluteUri;
    using(var r=await Get(client,child,range:"bytes=1-3")){Check(r.StatusCode==HttpStatusCode.PartialContent&&(await r.Content.ReadAsByteArrayAsync()).SequenceEqual(new byte[]{2,3,4}),"relative model dependency and Range");}
    using(var r=await Get(client,child,range:"bytes=-2")){Check(r.StatusCode==HttpStatusCode.PartialContent&&(await r.Content.ReadAsByteArrayAsync()).SequenceEqual(new byte[]{7,8}),"suffix Range");}
    using(var r=await Get(client,child,"HEAD")){Check(r.Content.Headers.ContentLength==8&&(await r.Content.ReadAsByteArrayAsync()).Length==0,"HEAD streams no bytes");}
    foreach(string range in new[]{"bytes=999-","bytes=-0","bytes=3-1","bytes=0-1,3-4","bytes=999999999999999999999999-"})using(var r=await Get(client,child,range:range)){Check((int)r.StatusCode==416,"invalid Range "+range);}
    using(var r=await Get(client,url,"POST")){Check((int)r.StatusCode==405,"write denied");}
    using(var r=await Get(client,url,origin:"https://example.invalid")){Check((int)r.StatusCode==403,"nonlocal origin denied");}
    using(var r=await Get(client,url.Replace(id,new string('f',32)))){Check((int)r.StatusCode==404,"unregistered root denied");}
    Check(store.LocalizeSource("changeFigure:"+url+";")=="changeFigure:"+reference+";","snapshot references localized");
    Check(SharedAssets.FromSnapshot(store.Export()).ResourceReference(url)==reference,"queued endpoint identity frozen");
    File.AppendAllText(file," ");using(var r=await Get(client,url)){Check((await r.Content.ReadAsStringAsync()).EndsWith(" "),"source update visible");}
   }
   var persisted=new SharedAssets(registry);var blocker=new TcpListener(IPAddress.Loopback,port);try{blocker.Start();using(var unavailable=new SharedResourceServer(persisted,new[]{"http://localhost:3001"})){Check(unavailable.Error!=null&&persisted.HttpPrefix==prefix,"occupied port retains stable URL");}}finally{blocker.Stop();}
   using(var restarted=new SharedResourceServer(persisted,new[]{"http://localhost:3001"})){Check(restarted.Error==null&&persisted.ResourceUrl("figure",reference)==url,"restart retains URL");using(var r=await Get(client,url)){Check((int)r.StatusCode==200,"restart serves existing reference");}persisted.Remove(id);using(var r=await Get(client,url)){Check((int)r.StatusCode==404,"deregistration invalidates resource");}}
  }
  Console.WriteLine("Shared resource checks passed: "+count);
 }
}

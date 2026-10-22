using System;using System.IO;using System.Collections.Generic;using System.Text.RegularExpressions;using System.Threading.Tasks;
namespace NativeVideo {
 public static class SnapshotServer {
  public static HttpResponse FileResponse(HttpRequest r,string file){
   long size=new FileInfo(file).Length,start=0,end=size-1;int status=200;string range;
   if(r.Headers.TryGetValue("Range",out range)){
    var m=Regex.Match(range,@"^bytes=(\d*)-(\d*)$");long a,b;
    if(!m.Success||m.Groups[1].Value==""&&m.Groups[2].Value=="")return InvalidRange(size);
    if(m.Groups[1].Value!=""){
     if(!long.TryParse(m.Groups[1].Value,out a))return InvalidRange(size);start=a;
     if(m.Groups[2].Value!=""){if(!long.TryParse(m.Groups[2].Value,out b))return InvalidRange(size);end=Math.Min(end,b);}
    }else{if(!long.TryParse(m.Groups[2].Value,out a)||a<=0)return InvalidRange(size);start=Math.Max(0,size-a);}
    if(size==0||start>end||start>=size)return InvalidRange(size);status=206;
   }
   string mime,extension=Path.GetExtension(file).ToLowerInvariant();Mime.TryGetValue(extension,out mime);
   if(extension==".js"||extension==".mjs")mime="application/javascript";else if(extension==".wasm")mime="application/wasm";else if(extension==".woff2")mime="font/woff2";else if(extension==".svg")mime="image/svg+xml";else if(extension==".opus")mime="audio/ogg";else if(extension==".m4a")mime="audio/mp4";else if(extension==".flac")mime="audio/flac";
   var result=new HttpResponse{Status=status,FilePath=file,Offset=start,Length=Math.Max(0,end-start+1),ContentType=mime??"application/octet-stream"};result.Headers["Accept-Ranges"]="bytes";if(status==206)result.Headers["Content-Range"]="bytes "+start+"-"+end+"/"+size;return result;
  }
  static HttpResponse InvalidRange(long size){var result=new HttpResponse{Status=416,Bytes=new byte[0]};result.Headers["Content-Range"]="bytes */"+size;return result;}
  static readonly Dictionary<string,string> Mime=new Dictionary<string,string>{{".html","text/html; charset=utf-8"},{".js","text/javascript"},{".css","text/css"},{".scss","text/plain"},{".json","application/json"},{".txt","text/plain; charset=utf-8"},{".png","image/png"},{".jpg","image/jpeg"},{".jpeg","image/jpeg"},{".webp","image/webp"},{".gif","image/gif"},{".wav","audio/wav"},{".mp3","audio/mpeg"},{".ogg","audio/ogg"},{".ttf","font/ttf"},{".otf","font/otf"},{".woff","font/woff"},{".woff2","font/woff2"},{".mp4","video/mp4"},{".webm","video/webm"},{".mkv","video/x-matroska"}};
  public static HttpServer Start(string root){return new HttpServer(r=>{try{string name=Uri.UnescapeDataString(r.Path).TrimStart('/');if(name=="")name="index.html";string file=Files.Under(root,name);if(!File.Exists(file))return Task.FromResult(HttpResponse.Data(J.O("error","not found"),404));long size=new FileInfo(file).Length,start=0,end=size-1;int status=200;string range;if(r.Headers.TryGetValue("Range",out range)){var m=Regex.Match(range,@"^bytes=(\d*)-(\d*)$");if(m.Success){if(m.Groups[1].Value!=""){start=long.Parse(m.Groups[1].Value);if(m.Groups[2].Value!="")end=Math.Min(end,long.Parse(m.Groups[2].Value));}else start=Math.Max(0,size-long.Parse(m.Groups[2].Value));status=206;}}if(start>end&&size>0||start>=size&&size>0){var invalid=HttpResponse.Data(null,416);invalid.Headers["Content-Range"]="bytes */"+size;return Task.FromResult(invalid);}string mime;Mime.TryGetValue(Path.GetExtension(file).ToLowerInvariant(),out mime);var result=new HttpResponse{Status=status,FilePath=file,Offset=start,Length=Math.Max(0,end-start+1),ContentType=mime??"application/octet-stream"};result.Headers["Accept-Ranges"]="bytes";if(status==206)result.Headers["Content-Range"]="bytes "+start+"-"+end+"/"+size;return Task.FromResult(result);}catch(Exception e){return Task.FromResult(HttpResponse.Data(J.O("error",e.Message),400));}});}
 }
}

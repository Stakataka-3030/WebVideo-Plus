using System;using System.IO;using System.Reflection;using System.Threading.Tasks;using NativeVideo;
public static class CommonPortChecks {
 static int checks;static void Check(bool ok,string name){if(!ok)throw new Exception(name);checks++;}
 public static int Main(string[] args){try{
  string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);string snapshot=Path.Combine(root,"source.txt");
  var hash=typeof(QueueService).GetMethod("TimingSourceHash",BindingFlags.NonPublic|BindingFlags.Static);
  string canonical="Alice:hello;\n",digest=Files.HashText(canonical);File.WriteAllText(snapshot,"\uFEFFAlice:hello;\r\n");
  Check((string)hash.Invoke(null,new object[]{J.O("sourceSnapshot",snapshot)})==digest,"legacy canonical hash fallback");
  var request=J.O("sourceSnapshot",snapshot,"sourceHash",digest);File.Delete(snapshot);
  Check((string)hash.Invoke(null,new object[]{request})==digest,"stored hash survives snapshot cleanup");
  Check((string)hash.Invoke(null,new object[]{J.O("sourceSnapshot",snapshot)})=="","missing legacy snapshot does not throw");
  var store=new SharedAssets(Path.Combine(root,"shared.json"));using(var server=new SharedResourceServer(store,new[]{"http://localhost:34321"})){
   Check(server.Error==null,"isolated shared server starts");var handle=typeof(SharedResourceServer).GetMethod("Handle",BindingFlags.NonPublic|BindingFlags.Instance);
   var uri=new Uri(store.HttpPrefix);var missing=new HttpRequest{Method="GET",Path=uri.AbsolutePath+new string('a',32)+"/missing.png",Body=new byte[0]};missing.Headers["Host"]=uri.Authority;missing.Headers["Origin"]="http://localhost:34321";
   var response=((Task<HttpResponse>)handle.Invoke(server,new object[]{missing})).GetAwaiter().GetResult();
   Check(response.Status==404,"missing shared resource is 404");Check(response.Headers["Access-Control-Allow-Origin"]=="http://localhost:34321","allowed-origin error keeps CORS");Check(response.Headers["Vary"]=="Origin","error response varies by origin");
   missing.Headers["Origin"]="https://untrusted.invalid";response=((Task<HttpResponse>)handle.Invoke(server,new object[]{missing})).GetAwaiter().GetResult();Check(response.Status==403&&!response.Headers.ContainsKey("Access-Control-Allow-Origin"),"untrusted origin still rejected without CORS grant");
  }
  Console.WriteLine("PASS "+checks+" production timing and CORS checks");return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
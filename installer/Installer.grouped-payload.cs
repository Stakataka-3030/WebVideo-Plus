public partial class SetupEngine {
 const string DecoderExeHash="__7ZIP_EXE_SHA256__",DecoderDllHash="__7ZIP_DLL_SHA256__",DecoderLicenseHash="__7ZIP_LICENSE_SHA256__";
 const string PayloadFolder="webgal-native-exporter";
 static bool MediaTool(string path){return path.Equals("bin/ffmpeg.exe",StringComparison.OrdinalIgnoreCase)||path.Equals("bin/ffprobe.exe",StringComparison.OrdinalIgnoreCase);}
 public static string SafePayloadRelative(string path){
  if(String.IsNullOrWhiteSpace(path)||path.StartsWith("/")||path.StartsWith("\\")||path.IndexOf(':')>=0||path.Any(c=>c<32))throw new IOException("组件路径不安全："+path);
  path=path.Replace('\\','/');
  if(path.Split('/').Any(p=>p.Length==0||p=="."||p==".."||p.EndsWith(".")||p.EndsWith(" ")||p.IndexOfAny(new[]{'<','>','\"','|','?','*'})>=0))throw new IOException("组件路径不安全："+path);
  return path;
 }
 Dictionary<string,long> PayloadRecords(string manifest){
  if(!File.Exists(manifest)||Hash(manifest)!=InstallerBuild.ManifestHash)throw new IOException("安装文件清单校验失败，请重新获取安装包。");
  if(new FileInfo(manifest).Length>32L*1024*1024)throw new IOException("安装文件清单超过支持范围。");
  var document=new JavaScriptSerializer{MaxJsonLength=32*1024*1024,RecursionLimit=256}.Deserialize<Dictionary<string,object>>(File.ReadAllText(manifest));
  var records=new Dictionary<string,long>(StringComparer.OrdinalIgnoreCase);
  foreach(var item in (System.Collections.IEnumerable)document["files"]){var row=(Dictionary<string,object>)item;string relative=SafePayloadRelative((string)row["path"]);long size=Convert.ToInt64(row["bytes"]);if(size<0||records.ContainsKey(relative)||relative.Equals("MANIFEST.json",StringComparison.OrdinalIgnoreCase))throw new IOException("安装清单存在重复或无效条目");records.Add(relative,size);}
  return records;
 }
 IEnumerable<string> PayloadFiles(string directory){
  if((File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0)throw new IOException("组件根目录包含目录链接");
  foreach(var child in Directory.GetDirectories(directory)){if((File.GetAttributes(child)&FileAttributes.ReparsePoint)!=0)throw new IOException("组件目录包含目录链接："+child);foreach(var file in PayloadFiles(child))yield return file;}
  foreach(var file in Directory.GetFiles(directory)){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new IOException("组件包含文件链接："+file);yield return file;}
 }
 void ValidatePayload(string payload){
  var payloadFiles=PayloadFiles(payload).ToArray();string manifest=Path.Combine(payload,"MANIFEST.json");var records=PayloadRecords(manifest);
  var document=new JavaScriptSerializer{MaxJsonLength=32*1024*1024,RecursionLimit=256}.Deserialize<Dictionary<string,object>>(File.ReadAllText(manifest));
  string prefix=Path.GetFullPath(payload).TrimEnd('\\','/')+Path.DirectorySeparatorChar;
  foreach(var item in (System.Collections.IEnumerable)document["files"]){Check();var row=(Dictionary<string,object>)item;string relative=SafePayloadRelative((string)row["path"]),file=Path.GetFullPath(Path.Combine(payload,relative.Replace('/',Path.DirectorySeparatorChar)));if(!file.StartsWith(prefix,StringComparison.OrdinalIgnoreCase)||!File.Exists(file)||new FileInfo(file).Length!=records[relative]||Hash(file)!=(string)row["sha256"])throw new IOException("安装缓存校验失败："+relative+"。请移除安装器缓存后重试。");}
  if(payloadFiles.Length!=records.Count+1)throw new IOException("安装组件包含清单外文件");
 }
 public static void ValidateGroupListing(string listing,IDictionary<string,long> expected){
  if(listing.Length>32*1024*1024)throw new IOException("压缩组清单超过支持范围");
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var row=new Dictionary<string,string>(StringComparer.Ordinal);
  Action finish=()=>{
   if(row.Count==0)return;string raw;if(!row.TryGetValue("Path",out raw))throw new IOException("压缩组条目缺少路径");string relative=SafePayloadRelative(raw);long size;
   if(!seen.Add(relative)||!expected.ContainsKey(relative)||!row.ContainsKey("Size")||!long.TryParse(row["Size"],out size)||size!=expected[relative])throw new IOException("压缩组清单不匹配："+relative);
   string attributes;if(row.TryGetValue("Attributes",out attributes)&&!System.Text.RegularExpressions.Regex.IsMatch(attributes,@"^[RAHS]*$"))throw new IOException("压缩组包含非普通文件："+relative);
   string folder;if(row.TryGetValue("Folder",out folder)&&folder!="-")throw new IOException("压缩组包含目录条目："+relative);
   string encrypted;if(row.TryGetValue("Encrypted",out encrypted)&&encrypted!="-")throw new IOException("压缩组包含加密条目");
   if(row.Keys.Any(k=>k.IndexOf("Link",StringComparison.OrdinalIgnoreCase)>=0||k.IndexOf("Reparse",StringComparison.OrdinalIgnoreCase)>=0))throw new IOException("压缩组包含链接条目："+relative);
   row.Clear();
  };
  foreach(var line in listing.Replace("\r\n","\n").Split('\n')){if(line.Length==0){finish();continue;}int split=line.IndexOf(" = ",StringComparison.Ordinal);if(split<1)throw new IOException("压缩组清单格式不匹配");string key=line.Substring(0,split);if(row.ContainsKey(key))throw new IOException("压缩组条目属性重复");row.Add(key,line.Substring(split+3));}finish();
  if(seen.Count!=expected.Count)throw new IOException("压缩组缺少组件文件");
 }
 string RunDecoder(string support,IEnumerable<string> arguments){
  Check();string exe=Path.Combine(support,"7z.exe"),dll=Path.Combine(support,"7z.dll"),license=Path.Combine(support,"License.txt");
  using(var exeLock=File.Open(exe,FileMode.Open,FileAccess.Read,FileShare.Read))using(var dllLock=File.Open(dll,FileMode.Open,FileAccess.Read,FileShare.Read)){
   if(Hash(exe)!=DecoderExeHash||Hash(dll)!=DecoderDllHash||Hash(license)!=DecoderLicenseHash)throw new IOException("安装包解压组件校验失败");
   using(var process=new Process()){
    process.StartInfo=new ProcessStartInfo(exe,string.Join(" ",arguments.Select(Quote))){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=support,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
    process.Start();var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
    try{while(!process.WaitForExit(100)){if(Canceled){process.Kill();process.WaitForExit();throw new OperationCanceledException("已取消组件释放，临时文件已清理。");}}Check();string stdout=output.GetAwaiter().GetResult(),stderr=error.GetAwaiter().GetResult();if(process.ExitCode!=0)throw new IOException("组件解压失败（"+process.ExitCode+"）："+(stderr.Length>1200?stderr.Substring(0,1200):stderr));return stdout;}
    finally{if(!process.HasExited){try{process.Kill();process.WaitForExit();}catch{}}}
   }
  }
 }
 void ExpandInstallerPayload(string archive,string stage){
  string packed=Path.Combine(stage,"packed");Extract(archive,packed);string root=Path.Combine(packed,PayloadFolder),manifest=Path.Combine(root,"MANIFEST.json"),index=Path.Combine(root,"GROUPS.json"),payload=Path.Combine(stage,PayloadFolder);
  if(!File.Exists(index)){Directory.Move(root,payload);return;}
  var expected=PayloadRecords(manifest);
  var allowed=new HashSet<string>(new[]{"MANIFEST.json","GROUPS.json","installer-support/7z.exe","installer-support/7z.dll","installer-support/License.txt","groups/components.7z","groups/ffmpeg.7z"},StringComparer.OrdinalIgnoreCase);
  foreach(var file in PayloadFiles(root)){string relative=file.Substring(root.Length+1).Replace('\\','/');if(!allowed.Remove(relative))throw new IOException("安装载荷包含未登记文件："+relative);}if(allowed.Count!=0)throw new IOException("安装载荷文件不完整");
  if(new FileInfo(index).Length>65536)throw new IOException("压缩组索引超过支持范围");var doc=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(index));
  if(Convert.ToInt32(doc["schemaVersion"])!=1||Convert.ToString(doc["decoderVersion"])!="__7ZIP_VERSION__")throw new IOException("压缩组版本不匹配");
  Directory.CreateDirectory(payload);File.Copy(manifest,Path.Combine(payload,"MANIFEST.json"));var groups=((System.Collections.IEnumerable)doc["groups"]).Cast<Dictionary<string,object>>().ToArray();
  if(groups.Length!=2||groups.Select(g=>Convert.ToString(g["id"])).Distinct().Count()!=2)throw new IOException("压缩组索引不匹配");
  foreach(string id in new[]{"components","ffmpeg"}){
   var group=groups.SingleOrDefault(g=>Convert.ToString(g["id"])==id);if(group==null||Convert.ToString(group["path"])!="groups/"+id+".7z")throw new IOException("压缩组路径不匹配");
   string file=Path.Combine(root,"groups",id+".7z"),hash=Convert.ToString(group["sha256"]);if(!IsPayloadHash(hash,64)||new FileInfo(file).Length!=Convert.ToInt64(group["bytes"])||Hash(file)!=hash)throw new IOException("压缩组校验失败："+id);
   var subset=expected.Where(p=>MediaTool(p.Key)==(id=="ffmpeg")).ToDictionary(p=>p.Key,p=>p.Value,StringComparer.OrdinalIgnoreCase);if(subset.Count==0||id=="ffmpeg"&&subset.Count!=2)throw new IOException("压缩组组件范围不匹配");
   string support=Path.Combine(root,"installer-support");ValidateGroupListing(RunDecoder(support,new[]{"l","-slt","-ba","-sccUTF-8","--",file}),subset);
   Report(id=="ffmpeg"?"正在释放媒体工具…":"正在释放组件…");RunDecoder(support,new[]{"x","-y","-bd","-sccUTF-8","-o"+payload,"--",file});
  }
 }
 string ReadInstallerPayload(){
  Check();Report("正在读取安装文件…");string archive=Path.Combine(Root,"payload-"+InstallerBuild.PayloadHash+".zip");
  if(!File.Exists(archive)||Hash(archive)!=InstallerBuild.PayloadHash){string partial=archive+".part-"+Guid.NewGuid().ToString("N");try{
    using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))using(var output=new FileStream(partial,FileMode.CreateNew,FileAccess.Write,FileShare.None)){if(input==null)throw new IOException("安装包缺少组件文件");byte[] buffer=new byte[65536];int count;while((count=input.Read(buffer,0,buffer.Length))>0){Check();output.Write(buffer,0,count);}}
    if(Hash(partial)!=InstallerBuild.PayloadHash)throw new IOException("安装包校验失败，请重新获取安装器。");Check();if(File.Exists(archive))File.Delete(archive);File.Move(partial,archive);
   }finally{if(File.Exists(partial))File.Delete(partial);}}
  string destination=Path.Combine(Root,"packages",InstallerBuild.PayloadHash.Substring(0,16)),payload=Path.Combine(destination,PayloadFolder),ready=Path.Combine(destination,"ready");
  if(File.Exists(ready)&&File.ReadAllText(ready)==InstallerBuild.PayloadHash){ValidatePayload(payload);return payload;}
  string stage=destination+".stage-"+Guid.NewGuid().ToString("N");Directory.CreateDirectory(stage);File.WriteAllText(Path.Combine(stage,"stage-owner"),InstallerBuild.PayloadHash);
  try{ExpandInstallerPayload(archive,stage);ValidatePayload(Path.Combine(stage,PayloadFolder));DeletePayloadDirectory(Path.Combine(stage,"packed"));Check();File.WriteAllText(Path.Combine(stage,"ready"),InstallerBuild.PayloadHash);
   if(Directory.Exists(destination)&&!DeletePayloadDirectory(destination))throw new IOException("原安装缓存仍被占用，请关闭后重试。");Directory.Move(stage,destination);
  }finally{if(Directory.Exists(stage))DeletePayloadDirectory(stage);}
  return payload;
 }
}

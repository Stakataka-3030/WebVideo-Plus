using System;using System.IO;using System.Text.RegularExpressions;
namespace NativeVideo {
 // A stopped worker cannot run its finally. Persist the exact temporary-file
 // lease before starting FFmpeg; never enumerate/delete output-folder patterns.
 public static class OwnedTemporaryOutput {
  public static string Create(object request,string prefix,string extension){
   string output=Files.Full(J.S(request,"output")),record=J.S(request,"recordDir",J.S(request,"jobDir")),nonce=Guid.NewGuid().ToString("N");
   string file=Path.Combine(Path.GetDirectoryName(output),prefix+nonce+".partial"+extension);if(File.Exists(file))throw new IOException("临时输出已存在，未覆盖");
   if(!String.IsNullOrEmpty(record))J.Write(Path.Combine(record,"temporary-output-"+nonce+".json"),J.O("schemaVersion",1,"jobId",J.S(request,"id"),"output",output,"path",file,"nonce",nonce,"prefix",prefix,"extension",extension));
   return file;
  }
  public static void Cleanup(object request){
   string record=J.S(request,"recordDir",J.S(request,"jobDir"));if(String.IsNullOrEmpty(record)||!Directory.Exists(record))return;
   string output=Files.Full(J.S(request,"output")),folder=Path.GetDirectoryName(output);
   foreach(string leaseFile in Directory.GetFiles(record,"temporary-output-*.json")){
    var lease=J.Read(leaseFile);string nonce=J.S(lease,"nonce"),prefix=J.S(lease,"prefix"),extension=J.S(lease,"extension"),file=J.S(lease,"path");
    if(J.N(lease,"schemaVersion")!=1||J.S(lease,"jobId")!=J.S(request,"id")||J.S(lease,"output")!=output||!Regex.IsMatch(nonce,@"^[a-f0-9]{32}$")||prefix!=".webvideo-"&&prefix!=".webvideo-subtitle-"||!Regex.IsMatch(extension,@"^\.(mp4|mov|webm|wav)$")||Path.GetFileName(leaseFile)!="temporary-output-"+nonce+".json"||Files.Full(file)!=Files.Full(Path.Combine(folder,prefix+nonce+".partial"+extension)))throw new IOException("临时输出归属不匹配，未删除");
    if(File.Exists(file)){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new IOException("临时输出包含链接，未删除");File.Delete(file);}File.Delete(leaseFile);
   }
  }
 }
}

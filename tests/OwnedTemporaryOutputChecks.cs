using System;using System.IO;using NativeVideo;
class OwnedTemporaryOutputChecks {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static int Main(string[] args){string root=args[0],record=Path.Combine(root,"record"),output=Path.Combine(root,"output","video.mp4");Directory.CreateDirectory(record);Directory.CreateDirectory(Path.GetDirectoryName(output));
  var request=J.O("id",Guid.NewGuid().ToString(),"recordDir",record,"output",output);
  File.WriteAllText(output,"completed-user-output");string neighbor=Path.Combine(Path.GetDirectoryName(output),".webvideo-neighbor.partial.mp4");File.WriteAllText(neighbor,"unrelated-file");
  string temp=OwnedTemporaryOutput.Create(request,".webvideo-",".mp4");File.WriteAllText(temp,"unfinished-owned-output");OwnedTemporaryOutput.Cleanup(request);
  Check(!File.Exists(temp),"Owned partial retained");Check(File.ReadAllText(output)=="completed-user-output","Completed output changed");Check(File.ReadAllText(neighbor)=="unrelated-file","Neighbor output changed");
  temp=OwnedTemporaryOutput.Create(request,".webvideo-subtitle-",".mp4");File.WriteAllText(temp,"owned");string leaseFile=Directory.GetFiles(record,"temporary-output-*.json")[0];var lease=J.D(J.Read(leaseFile));lease["path"]=neighbor;J.Write(leaseFile,lease);bool refused=false;try{OwnedTemporaryOutput.Cleanup(request);}catch(IOException){refused=true;}
  Check(refused,"Forged path was accepted");Check(File.ReadAllText(neighbor)=="unrelated-file","Forged path deleted a neighbor");Check(File.Exists(temp),"Forged record did not preserve recovery material");
  Console.WriteLine("PASS actual temporary-output leases: owned deletion, completed/neighbor preservation, forged-path refusal");return 0;
 }
}

using System;using System.IO;using NativeVideo;
public static class AuthoringFilesChecks {
 static int count;static void Check(bool value,string message){count++;if(!value)throw new Exception(message);}
 static void Reject(Action action,string message){bool rejected=false;try{action();}catch(ArgumentException){rejected=true;}catch(IOException){rejected=true;}Check(rejected,message);}
 public static int Main(string[] args){string root=args[0],project=Path.Combine(root,"fixture"),directory=Path.Combine(project,".webvideo-plus");Directory.CreateDirectory(directory);string relative=".webvideo-plus/authoring.json",file=Path.Combine(directory,"authoring.json");
  Check(!J.B(AuthoringFiles.Read(root,J.O("project","fixture","path",relative)),"exists"),"Missing private file");
  string text="{\r\n  \"raw\": \"中文 rgb(1,2,3)\u200b末字\"\r\n}\n";File.WriteAllText(file,text,Files.Utf8);var read=AuthoringFiles.Read(root,J.O("project","fixture","path",relative));Check(J.B(read,"exists")&&J.S(read,"text")==text,"Exact text including CRLF, trailing LF and zero width");
  string backups=Path.Combine(directory,"backups");Directory.CreateDirectory(backups);foreach(string name in new[]{"automatic-open.json","automatic-ten-minute.json","music-1234.json","a-b.c.json"}){File.WriteAllText(Path.Combine(backups,name),text,Files.Utf8);Check(J.S(AuthoringFiles.Read(root,J.O("project","fixture","path",".webvideo-plus/backups/"+name)),"text")==text,"Backup "+name);}
  foreach(string path in new[]{"game/scene/start.txt","video-project.json",".webvideo-plus/other.json",".webvideo-plus/backups/../authoring.json",".webvideo-plus/backups/a/b.json",".webvideo-plus/backups/a.txt",".webvideo-plus/backups/.json",".webvideo-plus/backups/a.json\n",".webvideo-plus\\authoring.json","../fixture/.webvideo-plus/authoring.json",".webvideo-plus/authoring.json?x=1"})Reject(()=>AuthoringFiles.Read(root,J.O("project","fixture","path",path)),"Reject "+path);
  foreach(string game in new[]{"..","../fixture","fixture/x","fixture\\x","C:","%2e%2e","missing"})Reject(()=>AuthoringFiles.Read(root,J.O("project",game,"path",relative)),"Reject game "+game);
  Console.WriteLine("PASS "+count+" production AuthoringFiles checks");return 0;
 }
}

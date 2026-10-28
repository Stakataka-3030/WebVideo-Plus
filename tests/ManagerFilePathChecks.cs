using System;using System.IO;using System.Linq;using System.Reflection;using System.Collections.Generic;using NativeVideo;
class ManagerFilePathChecks {
 static int count;static void Check(bool ok,string text){count++;if(!ok)throw new Exception(text);Console.WriteLine("PASS "+text);}
 static void Reject(Action action,string text){bool failed=false;try{action();}catch(IOException){failed=true;}Check(failed,text);}
 static void Rollback(string state,string source,string[] keep){try{typeof(ProductIntegration).GetMethod("RollbackMigration",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{state,source,keep});}catch(TargetInvocationException error){throw error.InnerException;}}
 public static int Main(string[] args){try{Run(args);return 0;}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
 static void Run(string[] args){string root=Path.GetFullPath(args[0]),report=Path.GetFullPath(args[1]);Directory.CreateDirectory(root);string longFile="";
  try{
   Check(Files.LongPathsEnabled,"startup configuration enables managed long-path handling without changing Windows");
   string plain=Path.Combine(root,"long","state.json");int padding=292-plain.Length-1;Check(padding>0&&padding<200,"fixture fits one ordinary directory component");
   longFile=Path.Combine(root,"long",new string('p',padding),"state.json");Check(longFile.Length==292,"actual file path is exactly 292 characters");
   J.Write(longFile,J.O("tag","initial"));Check(J.S(J.Read(longFile),"tag")=="initial","long-path JSON atomic write and read");
   J.Write(longFile,J.O("tag","replacement"));Check(J.S(J.Read(longFile),"tag")=="replacement","long-path atomic replacement");
   string other=Path.Combine(Path.GetDirectoryName(longFile),"other.json");Files.CopyFile(longFile,other);Check(Files.Hash(other)==Files.Hash(longFile),"long-path copy and integrity hash");
   string log=Path.Combine(Path.GetDirectoryName(longFile),"trace.jsonl");Files.Append(log,J.O("tag","append"));Check(J.S(J.Parse(File.ReadAllText(@"\\?\"+log)),"tag")=="append","long-path append preserves the journal payload");
   string source=Path.Combine(root,"long"),copy=Path.Combine(root,"clone");var names=new List<string>();Files.CopyTree(source,copy,(file,bytes)=>names.Add(file));
   Check(names.Count==3&&names.All(file=>file.StartsWith(source+Path.DirectorySeparatorChar)&&!file.StartsWith(@"\\?\")),"copy callback retains canonical logical paths");
   Check(Files.Hash(Path.Combine(copy,new string('p',padding),"state.json"))==Files.Hash(longFile),"recursive copy retains long file bytes");
   Reject(()=>Files.CopyTree(source,Path.Combine(source,"child")),"copy still rejects its own subtree");Reject(()=>Files.DeleteTree(root,root),"cleanup still rejects the allowed root itself");
   Files.DeleteTree(root,copy);Check(!Directory.Exists(copy),"recursive long-path cleanup completes");
   string missing=Path.Combine(root,"missing"),target=Path.Combine(root,"empty-state"),keep=Path.Combine(target,"keep.txt");Files.Atomic(keep,"retained");Rollback(target,missing,new[]{keep});Check(!Directory.Exists(missing)&&File.ReadAllText(keep)=="retained","missing migration source does not mask failure or remove retained files");
   string original=Path.Combine(root,"source-state"),originalFile=Path.Combine(original,"settings.json"),adopt=Path.Combine(root,"state-copy"),copied=Path.Combine(adopt,"settings.json"),retained=Path.Combine(adopt,"keep.txt");Files.Atomic(originalFile,"source");Files.CopyFile(originalFile,copied);Files.Atomic(retained,"retained");Rollback(adopt,original,new[]{retained});Check(!File.Exists(copied)&&File.ReadAllText(originalFile)=="source"&&File.ReadAllText(retained)=="retained","ordinary rollback removes only the matching copied files");
   Files.CopyFile(originalFile,copied);Files.Atomic(copied,"changed");Reject(()=>Rollback(adopt,original,new[]{retained}),"changed migration copy is preserved and rejected");Check(File.ReadAllText(copied)=="changed","changed copy remains available for recovery");
  }finally{if(Directory.Exists(root))Files.DeleteTree(Path.GetDirectoryName(root),root);}
  Check(!Directory.Exists(root),"owned scratch including all long files is removed");J.Write(report,J.O("passed",true,"checks",count,"longFileLength",longFile.Length,"systemSettingsChanged",false,"scope","actual Manager assembly, local owned files, no HTTP/host/browser"));Console.WriteLine("Manager file-path checks passed: "+count);
 }
}

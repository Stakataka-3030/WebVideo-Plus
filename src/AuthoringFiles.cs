using System;using System.IO;using System.Text.RegularExpressions;
namespace NativeVideo {
 public static class AuthoringFiles {
  // Terre's public game router may use the shared engine and never serve private
  // project files. Keep this authenticated read contract limited to our documents.
  public static object Read(string gamesRoot,object request){
   string game=J.S(request,"project"),relative=J.S(request,"path");
   if(string.IsNullOrWhiteSpace(game)||game=="."||game==".."||game.IndexOfAny(new[]{'/','\\',':','%'})>=0)throw new ArgumentException("项目名称无效");
   if(!Regex.IsMatch(relative,@"\A\.webvideo-plus/(?:authoring\.json|backups/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.json)\z",RegexOptions.CultureInvariant))throw new ArgumentException("制作文件路径无效");
   string root=Files.Under(gamesRoot,game);if(!Directory.Exists(root))throw new DirectoryNotFoundException("项目不存在");
   string file=Files.Under(root,relative);for(string current=file;current!=null&&Files.Within(gamesRoot,current);current=Path.GetDirectoryName(current))if((File.Exists(current)||Directory.Exists(current))&&(File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("制作文件路径包含链接");
   if(!File.Exists(file))return J.O("exists",false,"text",null);
   if(new FileInfo(file).Length>128L*1024*1024)throw new IOException("制作文件超过读取限制");
   return J.O("exists",true,"text",File.ReadAllText(file));
  }
 }
}

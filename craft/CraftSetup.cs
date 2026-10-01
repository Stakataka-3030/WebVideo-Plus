using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyVersion("1.1.2.0")]
[assembly: AssemblyFileVersion("1.1.2.0")]
[assembly: AssemblyInformationalVersion("1.1.2.0c")]

static class CraftSetup {
 const string PackageFolder="WebVideoCraft-Setup-1.1.2.0c/";
 static string DefaultTarget { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebVideoCraft","1.1.2.0c"); } }
 static string DefaultCraft { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebGAL Craft","webgal-craft.exe"); } }

 [STAThread] static int Main(string[] args) {
  if(args.Length>=2 && args[0]=="--dest") {
   var craft=args.Length>=4&&args[2]=="--craft"?args[3]:DefaultCraft;
   try { Install(args[1],craft); return 0; } catch(Exception error) { File.WriteAllText(Path.Combine(Path.GetTempPath(),"WebVideoCraft-Setup-error.log"),error.ToString()); return 1; }
  }
  Application.EnableVisualStyles();
  using(var form=new Form { Text="WebVideo+ Craft · 安装",ClientSize=new Size(600,280),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false }) {
   var title=new Label { Text="安装 WebVideo+ Craft 1.1.2.0c",Font=new Font("Microsoft YaHei UI",14,FontStyle.Bold),Location=new Point(22,20),AutoSize=true };
   var hint=new Label { Text="通过启动包装器在 Craft 中注入导出按钮；不修改 Craft 原程序。\n请先关闭正在运行的 Craft。FFmpeg 需位于系统 PATH。",Location=new Point(24,60),Size=new Size(552,42) };
   var craftLabel=new Label { Text="Craft 原程序",Location=new Point(24,108),AutoSize=true };
   var craftPath=new TextBox { Text=DefaultCraft,Location=new Point(24,131),Width=455 };
   var craftBrowse=new Button { Text="选择…",Location=new Point(488,129),Width=85 };
   var targetLabel=new Label { Text="适配包安装位置",Location=new Point(24,172),AutoSize=true };
   var target=new TextBox { Text=DefaultTarget,Location=new Point(24,195),Width=455 };
   var browse=new Button { Text="选择…",Location=new Point(488,193),Width=85 };
   var install=new Button { Text="安装",Location=new Point(488,236),Width=85 };
   craftBrowse.Click+=(sender,eventArgs)=>{using(var picker=new OpenFileDialog { Filter="Craft 程序|webgal-craft.exe|程序|*.exe",FileName=craftPath.Text }) if(picker.ShowDialog(form)==DialogResult.OK)craftPath.Text=picker.FileName;};
   browse.Click+=(sender,eventArgs)=>{using(var picker=new FolderBrowserDialog { Description="选择安装位置的上级文件夹",SelectedPath=Path.GetDirectoryName(target.Text) }) if(picker.ShowDialog(form)==DialogResult.OK)target.Text=Path.Combine(picker.SelectedPath,"WebVideoCraft-1.1.2.0c");};
   install.Click+=(sender,eventArgs)=>{install.Enabled=false;try { Install(target.Text,craftPath.Text);MessageBox.Show(form,"安装完成。请从适配包目录启动：\n"+Path.Combine(target.Text,"WebVideoCraft.Launcher.exe"),"WebVideo+ Craft",MessageBoxButtons.OK,MessageBoxIcon.Information);form.Close();}catch(Exception error){MessageBox.Show(form,error.Message,"安装失败",MessageBoxButtons.OK,MessageBoxIcon.Error);install.Enabled=true;}};
   form.Controls.AddRange(new Control[]{title,hint,craftLabel,craftPath,craftBrowse,targetLabel,target,browse,install});
   Application.Run(form);
  }
  return 0;
 }

 static void Install(string destination,string craftPath) {
  craftPath=Path.GetFullPath(craftPath);
  if(!File.Exists(craftPath)||!String.Equals(Path.GetFileName(craftPath),"webgal-craft.exe",StringComparison.OrdinalIgnoreCase))throw new IOException("请选择有效的 webgal-craft.exe。");
  var target=Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar);
  if(Directory.Exists(target))throw new IOException("目标目录已存在。请选择新目录，避免覆盖现有文件。");
  var parent=Path.GetDirectoryName(target);
  Directory.CreateDirectory(parent);
  var stage=target+".stage-"+Guid.NewGuid().ToString("N");
  Directory.CreateDirectory(stage);
  try {
   using(var payload=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
   using(var zip=new ZipArchive(payload,ZipArchiveMode.Read)) {
    foreach(var entry in zip.Entries) {
     if(!entry.FullName.StartsWith(PackageFolder,StringComparison.Ordinal))continue;
     var relative=entry.FullName.Substring(PackageFolder.Length).Replace('/',Path.DirectorySeparatorChar);
     if(relative.Length==0 || relative.EndsWith(Path.DirectorySeparatorChar.ToString()))continue;
     var file=Path.GetFullPath(Path.Combine(stage,relative));
     if(!file.StartsWith(stage+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new IOException("安装包包含越界路径");
     Directory.CreateDirectory(Path.GetDirectoryName(file));
     using(var input=entry.Open())using(var output=File.Create(file))input.CopyTo(output);
    }
   }
   Verify(stage);
   File.WriteAllText(Path.Combine(stage,"craft-path.txt"),craftPath);
   Directory.Move(stage,target);
  } finally { if(Directory.Exists(stage))Directory.Delete(stage,true); }
 }

 static void Verify(string root) {
  var manifest=new JavaScriptSerializer { MaxJsonLength=32*1024*1024 }.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(root,"MANIFEST.json")));
  if(Convert.ToString(manifest["installerVersion"])!="1.1.2.0c" || Convert.ToString(manifest["kernelVersion"])!="0.6.46c")throw new IOException("Craft 安装包版本不匹配");
  using(var sha=SHA256.Create())foreach(Dictionary<string,object> record in (IEnumerable)manifest["files"]) {
   var relative=Convert.ToString(record["path"]).Replace('/',Path.DirectorySeparatorChar);
   var file=Path.GetFullPath(Path.Combine(root,relative));
   if(!file.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!File.Exists(file))throw new IOException("安装文件缺失："+relative);
   using(var stream=File.OpenRead(file)) {
    var hash=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
    if(stream.Length!=Convert.ToInt64(record["bytes"])||hash!=Convert.ToString(record["sha256"]))throw new IOException("安装文件校验失败："+relative);
   }
  }
 }
}

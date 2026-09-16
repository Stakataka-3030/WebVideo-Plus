using System;using System.IO;using System.Linq;using System.Reflection;using System.Collections.Generic;
namespace NativeVideo {
 public sealed class PresetEffectStore {
  readonly object gate=new object();readonly string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WebVideoPlus","preset-effects","effects.json");
  object[] Saved(){if(!File.Exists(file))return new object[0];if(new FileInfo(file).Length>8*1024*1024)throw new IOException("预制效果库过大。");var doc=J.Read(file);if(J.N(doc,"schemaVersion")!=1||!(J.Get(doc,"effects") is object[]))throw new IOException("预制效果库格式错误，原文件未被覆盖。");return J.A(J.Get(doc,"effects")).ToArray();}
  object[] Presets(){using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("preset-effects.factory.json")){if(stream==null)return new object[0];using(var reader=new StreamReader(stream))return J.A(J.Get(J.Parse(reader.ReadToEnd()),"effects")).ToArray();}}
  public object List(){lock(gate)return J.O("presets",Presets(),"saved",Saved());}
  public object Save(object request){lock(gate){string name=J.S(request,"name").Trim(),code=J.S(request,"code").Trim();if(name.Length==0||name.Length>200)throw new ArgumentException("请输入名称（最多200字）。");if(code.Length==0||code.Length>65536)throw new ArgumentException("请输入预制效果语句（最多64KB）。");var saved=Saved().ToList();if(saved.Count>=2000)throw new IOException("手动添加的预制效果已达到2000项。");if(!saved.Any(item=>J.S(item,"name")==name&&J.S(item,"code")==code))saved.Add(J.O("id",Guid.NewGuid().ToString(),"name",name,"code",code,"category","手动添加","createdAt",DateTime.UtcNow.ToString("o")));Directory.CreateDirectory(Path.GetDirectoryName(file));J.Write(file,J.O("schemaVersion",1,"effects",saved));return J.O("presets",Presets(),"saved",saved);}}
 }
}

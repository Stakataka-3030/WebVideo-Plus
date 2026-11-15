using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace NativeVideo {
 // Consume the planner's existing audio-args.json, including cached plans. All
 // graphs go to disk; input lists are independently bounded after Windows quoting
 // and process-guard overhead. Never send the original unbounded argv to Start.
 public static class AudioMixer {
  public const int CommandLimit=24000, FanIn=32;
  sealed class Input { public List<string> Args; public string Filter; }
  static int CommandLength(IEnumerable<string> args) {
   var values=new[]{System.Diagnostics.Process.GetCurrentProcess().Id.ToString(),Commands.Resolve("ffmpeg")}.Concat(args);
   return Commands.Quote(Path.Combine(Files.Root,"process-guard.exe")).Length+1+string.Join(" ",values.Select(Commands.Quote)).Length+1;
  }
  static string Sum(int count) {return string.Concat(Enumerable.Range(0,count).Select(i=>"[a"+i+"]"))+"amix=inputs="+count+":duration=longest:normalize=0";}
  static List<string> Arguments(IEnumerable<Input> inputs,string script,string output,bool final,double duration) {
   var args=new List<string>{"-v","error","-y"};
   foreach(var input in inputs)args.AddRange(input.Args);
   args.AddRange(new[]{"-/filter_complex",script,"-map","[out]","-c:a","pcm_f64le"});
   if(final)args.AddRange(new[]{"-ar","48000","-t",J.Num(duration),"-rf64","auto","-f","wav"});
   else args.AddRange(new[]{"-f","w64"});
   args.Add(output);return args;
  }
  static List<List<Input>> Groups(List<Input> inputs,string script,string output,bool final,double duration) {
   var groups=new List<List<Input>>();var group=new List<Input>();
   foreach(var input in inputs) {
    var trial=group.Concat(new[]{input}).ToList();
    if(group.Count>0&&(trial.Count>FanIn||CommandLength(Arguments(trial,script,output,final,duration))>CommandLimit-128)) {groups.Add(group);group=new List<Input>();}
    group.Add(input);
    if(CommandLength(Arguments(group,script,output,final,duration))>CommandLimit)throw new IOException("音频单条输入路径或参数过长，无法在 Windows 命令行限制内启动 FFmpeg");
   }
   if(group.Count>0)groups.Add(group);return groups;
  }
  public static async Task Run(IEnumerable<string> arguments,double duration,string output,string dir) {
   var args=arguments.ToList();if(args.Count==0)return;
   int graphIndex=args.IndexOf("-filter_complex");
   if(graphIndex<0||graphIndex+1>=args.Count)throw new IOException("音频混合计划缺少滤镜图");
   if(!args.Skip(graphIndex+2).SequenceEqual(new[]{"-map","[out]","-ar","48000"})||duration<=0||double.IsNaN(duration)||double.IsInfinity(duration))throw new IOException("音频混合计划的输出参数或时长无效");
   string graph=args[graphIndex+1];var chains=graph.Split(';');var inputs=new List<Input>();var pending=new List<string>();
   for(int i=0;i<graphIndex;i++) {
    string option=args[i];
    if(!new[]{"-i","-t","-ss","-stream_loop"}.Contains(option)||i+1>=graphIndex)throw new IOException("音频混合计划的输入参数无效");
    pending.Add(option);pending.Add(args[++i]);
    if(option=="-i") {inputs.Add(new Input{Args=pending});pending=new List<string>();}
   }
   if(pending.Count>0||inputs.Count==0||chains.Length!=inputs.Count+1||!chains.Last().StartsWith(Sum(inputs.Count),StringComparison.Ordinal)||!chains.Last().EndsWith("[out]",StringComparison.Ordinal))throw new IOException("音频混合计划的输入与滤镜不一致");
   for(int i=0;i<inputs.Count;i++) {
    string prefix="["+i+":a]",suffix="[a"+i+"]";
    if(!chains[i].StartsWith(prefix,StringComparison.Ordinal)||!chains[i].EndsWith(suffix,StringComparison.Ordinal))throw new IOException("音频混合计划的音轨标签无效");
    inputs[i].Filter=chains[i].Substring(prefix.Length,chains[i].Length-prefix.Length-suffix.Length);
   }
   string tail=chains.Last().Substring(Sum(inputs.Count).Length);
   string run=Guid.NewGuid().ToString("N"),scratch=Path.Combine(dir,"audio-mix-"+run),logs=Path.Combine(dir,"audio-mix-logs",run);
   Directory.CreateDirectory(scratch);Directory.CreateDirectory(logs);int step=0;bool completed=false;
   try {
    string script=Path.Combine(scratch,"filter.txt"),intermediate=Path.Combine(scratch,"stage.w64");
    // A short job needs no resampling or extra pass. Its original graph is kept
    // unchanged, while the full mix remains floating point until delivery.
    if(inputs.Count<=FanIn&&CommandLength(Arguments(inputs,script,output,true,duration))<=CommandLimit) {
     await Execute(inputs,graph,script,output,true,duration,logs,step++);completed=true;return;
    }
    // amix negotiates layout from the first input. An explicit tagged-loop
    // resampler pins the shared rate to 48 kHz, even in a later batch. Otherwise
    // FFmpeg selects the first input's rate. Match this in EVERY leaf.
    var probe=J.Parse((await Commands.Run("ffprobe",new[]{"-v","error","-select_streams","a:0","-show_entries","stream=sample_rate,channels,channel_layout","-of","json",inputs[0].Args.Last()},Path.Combine(logs,"format.log"))).Text);
    var stream=J.A(J.Get(probe,"streams")).FirstOrDefault();int channels=(int)J.N(stream,"channels");
    string rate=inputs.Any(x=>x.Filter.StartsWith("aresample=48000,",StringComparison.Ordinal))?"48000":J.S(stream,"sample_rate"),layout=J.S(stream,"channel_layout");
    if(channels<1||rate=="")throw new IOException("无法确定首条音轨的采样率与声道");
    if(layout=="")layout=channels+"c";
    string format="aformat=sample_fmts=fltp:sample_rates="+rate+":channel_layouts="+layout;
    foreach(var input in inputs) {
     // The original amix negotiates backwards through trim/fade/delay. Pin that
     // format BEFORE those filters, or resampling later changes fade envelopes,
     // delay rounding and frame-based mute enable times. A tagged loop is the
     // exception: its explicit 48 kHz clock stays in place until after the chain.
     if(input.Filter.StartsWith("aresample=48000,",StringComparison.Ordinal))input.Filter="aresample=48000,aformat=sample_fmts=fltp:channel_layouts="+layout+","+input.Filter.Substring("aresample=48000,".Length);
     else input.Filter=format+","+input.Filter;
     input.Filter+=","+format+",aformat=sample_fmts=dbl";
    }
    while(true) {
     string budgetOutput=Commands.Quote(output).Length>Commands.Quote(intermediate).Length?output:intermediate;
     var groups=Groups(inputs,script,budgetOutput,true,duration);
     if(groups.Count==1) {await Execute(inputs,Graph(inputs,tail),script,output,true,duration,logs,step++);completed=true;return;}
     var next=new List<Input>();
     foreach(var group in groups) {
      string file=Path.Combine(scratch,step.ToString("D6")+".w64");
      await Execute(group,Graph(group,"[out]"),script,file,false,duration,logs,step++);
      next.Add(new Input{Args=new List<string>{"-i",file},Filter="anull"});
     }
     // The next level must shrink even when unusually long paths forced tiny leaves.
     if(next.Count>=inputs.Count&&next.Sum(x=>string.Join(" ",x.Args.Select(Commands.Quote)).Length)>=inputs.Sum(x=>string.Join(" ",x.Args.Select(Commands.Quote)).Length))throw new IOException("音频混合路径过长，分批后仍无法缩短命令行");
     inputs=next;
    }
   } finally {
    if(!completed&&File.Exists(output))File.Delete(output);
    Files.DeleteTree(dir,scratch);
   }
  }
  static string Graph(List<Input> inputs,string tail) {
   return string.Join(";",inputs.Select((input,i)=>"["+i+":a]"+input.Filter+"[a"+i+"]"))+";"+Sum(inputs.Count)+tail;
  }
  static async Task Execute(List<Input> inputs,string graph,string script,string output,bool final,double duration,string logs,int step) {
   // input-side seeking can make FFmpeg emit overlapping amix timestamps. Bound
   // the physical output by its sample clock as well as the original time trim.
   if(final)graph=graph.Substring(0,graph.Length-"[out]".Length)+",asetpts=N/SR/TB,atrim=duration="+J.Num(duration)+"[out]";
   Files.Atomic(script,graph);var args=Arguments(inputs,script,output,final,duration);int length=CommandLength(args);
   if(length>CommandLimit)throw new IOException("音频混合命令行超过安全长度："+length);
   string log=Path.Combine(logs,step.ToString("D6")+".log"),record=Path.Combine(logs,"steps.jsonl");
   Files.Append(record,J.O("step",step,"inputs",inputs.Count,"commandLength",length,"graphLength",graph.Length,"final",final,"log",log));
   try {await Commands.Run("ffmpeg",args,log,600000);}
   catch(Exception error) {Files.Atomic(Path.Combine(logs,step.ToString("D6")+".filter.txt"),graph);J.Write(Path.Combine(logs,step.ToString("D6")+".args.json"),args);Files.Append(record,J.O("step",step,"error",error.Message));throw new IOException("音频混合第 "+(step+1)+" 步失败，诊断日志："+log+"\n"+error.Message,error);}
  }
 }
}

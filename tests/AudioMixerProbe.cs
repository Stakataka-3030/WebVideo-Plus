using System;using System.IO;using System.Linq;using NativeVideo;
class AudioMixerProbe {
 static int Main(string[] args) {
  Console.OutputEncoding=new System.Text.UTF8Encoding(false);
  try {
   Commands.RuntimePath=args[0];
   var request=J.Read(args[1]);string dir=J.S(request,"dir"),output=J.S(request,"output");Directory.CreateDirectory(dir);
   if(J.S(request,"entry")=="audio") {
    string planning=Path.Combine(dir,"planning");Directory.CreateDirectory(planning);J.Write(Path.Combine(planning,"audio-args.json"),J.Get(request,"args"));
    LayerExport.ExportAudio(J.O("durationSeconds",J.N(request,"duration")),J.O("startSeconds",J.N(request,"start"),"durationSeconds",J.N(request,"length",J.N(request,"duration"))),planning,dir,output).GetAwaiter().GetResult();
   } else AudioMixer.Run(J.A(J.Get(request,"args")).Select(Convert.ToString),J.N(request,"duration"),output,dir).GetAwaiter().GetResult();
   return 0;
  } catch(Exception error) {Console.Error.WriteLine(error.ToString());return 1;}
 }
}

using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Diagnostics;using System.Threading.Tasks;
namespace NativeVideo {
 public static class LayerExport {
  public const string TransparentBackground="__webvideo_transparent.png";
  static readonly byte[] TransparentPng=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=");
  public static string Kind(object request){string value=J.S(request,"exportKind","full");return new[]{"full","stage","dialog","audio"}.Contains(value)?value:"full";}
  public static bool IsStage(object request){return Kind(request)=="stage";}
  public static bool IsDialog(object request){return Kind(request)=="dialog";}
  public static bool IsAudio(object request){return Kind(request)=="audio";}
  public static bool IsVisualOnly(object request){string kind=Kind(request);return kind=="stage"||kind=="dialog";}
  public static bool IncludeBackground(object request){return !IsStage(request)||J.B(request,"includeBackground",true);}
  public static bool SuppressBackground(object request){return IsStage(request)&&!IncludeBackground(request);}
  public static bool TransparentVideo(object request){return IsDialog(request)||SuppressBackground(request);}
  public static string RequiredExtension(string kind,bool includeBackground){if(kind=="audio")return ".wav";if(kind=="dialog"||(kind=="stage"&&!includeBackground))return ".mov";return ".mp4";}
  public static string PartFile(object request){return TransparentVideo(request)?"video.mov":"video.mp4";}
  public static string Label(object request){string kind=Kind(request);return kind=="stage"?"舞台":kind=="dialog"?"对话框":kind=="audio"?"WebGAL 音轨":"视频";}

  static string RewriteChangeBg(string source){
   if(string.IsNullOrWhiteSpace(source))return source;int colon=source.IndexOf(':');if(colon<0)return source;int semi=source.LastIndexOf(';');if(semi<=colon)return source;int end=semi;
   for(int i=colon+1;i+2<semi;i++)if(char.IsWhiteSpace(source[i])&&source[i+1]=='-'&&(char.IsLetter(source[i+2])||source[i+2]=='_')){end=i;break;}
   return source.Substring(0,colon+1)+TransparentBackground+source.Substring(end);
  }
  public static string SuppressBackgroundSource(string source,object parsed){
   if(string.IsNullOrEmpty(source))return source;string normalized=source.Replace("\r\n","\n").Replace("\r","\n");var lines=normalized.Split(new[]{'\n'});var sentences=J.A(J.Get(parsed,"sentenceList"));
   foreach(var sentence in sentences){
    if(J.B(sentence,"isLineBreakHolder"))continue;string command=J.N(sentence,"command",-1)==0?"say":J.S(sentence,"commandRaw");if(command!="changeBg")continue;
    int first=Math.Max(0,(int)J.N(sentence,"startLine",-1)),last=Math.Max(first,(int)J.N(sentence,"endLine",first));if(first>=lines.Length||last>=lines.Length)continue;
    string snippet=string.Join("\n",lines.Skip(first).Take(last-first+1).ToArray()),rewritten=RewriteChangeBg(snippet);var replacement=rewritten.Split(new[]{'\n'});if(replacement.Length!=last-first+1)throw new IOException("背景替换没有保持剧本行号");
    for(int i=0;i<replacement.Length;i++)lines[first+i]=replacement[i];
   }
   return string.Join("\n",lines);
  }
  public static void WriteTransparentBackground(string root){string folder=Path.Combine(root,"game/background");Directory.CreateDirectory(folder);File.WriteAllBytes(Path.Combine(folder,TransparentBackground),TransparentPng);}
  public static void MarkPlan(object request,object plan){if(!SuppressBackground(request))return;J.D(plan)["backgroundSuppressed"]=true;J.D(plan)["backgroundReplacement"]=TransparentBackground;}

  public static async Task<object> MakeStageTransparent(BrowserHost browser){
   return await browser.Eval("(()=>{const app=__wgProbe.core.gameplay.pixiStage.currentApp,r=app.renderer,a=r.gl.getContextAttributes();try{if(r.background){r.background.alpha=0;if('color' in r.background)r.background.color=0;}}catch{}try{if('backgroundAlpha' in r)r.backgroundAlpha=0;}catch{}try{r.gl.clearColor(0,0,0,0);}catch{}return {alpha:!!a.alpha,premultipliedAlpha:!!a.premultipliedAlpha,backgroundAlpha:Number(r.background?.alpha??r.backgroundAlpha??0)};})()");
  }

  static void Stop(Process process){try{if(!process.HasExited)process.Kill();}catch{}}
  static async Task WritePipe(Process process,Task<string> error,byte[] bytes){
   if(process.HasExited)throw new IOException("透明视频编码器提前退出："+await error);var write=process.StandardInput.BaseStream.WriteAsync(bytes,0,bytes.Length);if(await Task.WhenAny(write,Task.Delay(60000))!=write){Stop(process);throw new TimeoutException("透明视频编码器连续 60 秒未接收完一帧");}await write;
  }
  static async Task<string> ErrorText(Task<string> error){return await Task.WhenAny(error,Task.Delay(5000))==error?await error:"编码器错误输出未及时关闭。";}

  static readonly byte[] UnpremultiplyTable=BuildUnpremultiplyTable();
  static byte[] BuildUnpremultiplyTable(){var table=new byte[65536];for(int alpha=1;alpha<256;alpha++)for(int channel=0;channel<256;channel++)table[alpha*256+channel]=(byte)Math.Min(255,(channel*255+alpha/2)/alpha);return table;}
  static void Unpremultiply(byte[] frame){for(int i=0;i+3<frame.Length;i+=4){int alpha=frame[i+3];if(alpha==255)continue;if(alpha==0){frame[i]=0;frame[i+1]=0;frame[i+2]=0;continue;}int offset=alpha*256;frame[i]=UnpremultiplyTable[offset+frame[i]];frame[i+1]=UnpremultiplyTable[offset+frame[i+1]];frame[i+2]=UnpremultiplyTable[offset+frame[i+2]];}}
  static int CopyShared(Microsoft.Web.WebView2.Core.CoreWebView2SharedBuffer shared,byte[] frame){int copied=0;using(var stream=shared.OpenStream()){while(copied<frame.Length){int n=stream.Read(frame,copied,frame.Length-copied);if(n<=0)break;copied+=n;}}return copied;}

  static async Task RenderTransparentScreenshot(BrowserHost browser,object request,object settings,string part,object gpu,int width,int height,int fps,int start,int end,int first,Stopwatch began,double browserStartupSeconds,double navigationSeconds,double setupSeconds,double restoreSeconds,string fallbackReason){
   string captureMode=IsStage(request)?"stage":"normal",pipeline=IsStage(request)?"transparent-stage-screenshot":"transparent-dom-screenshot",output=Path.Combine(part,"video.mov");double stepSeconds=0,captureSeconds=0,pipeSeconds=0,finalizeSeconds=0;long pngBytes=0;object rendererScale=null,transparency=null;
   if(IsStage(request)){transparency=await MakeStageTransparent(browser);rendererScale=await browser.Eval("__gpuReadbackRendererScale("+width+","+height+")",30000);}
   for(int frame=first;frame<start;frame++){long mark=Stopwatch.GetTimestamp();await browser.Eval("__webviewStep("+frame+")",30000);stepSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;}
   var args=new List<string>{"-v","error","-y","-f","image2pipe","-vcodec","png","-framerate",fps.ToString(),"-i","pipe:0","-an","-c:v","prores_ks","-profile:v","4","-pix_fmt","yuva444p10le","-vendor","apl0","-frames:v",(end-start).ToString(),output};
   var rendering=Stopwatch.StartNew();double last=-1;using(var process=Commands.Start("ffmpeg",args,true,true)){var error=process.StandardError.ReadToEndAsync();var stdout=process.StandardOutput.ReadToEndAsync();try{
    for(int frame=start;frame<end;frame++){
     long mark=Stopwatch.GetTimestamp();await browser.Eval("__webviewStep("+frame+")",30000);stepSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
     mark=Stopwatch.GetTimestamp();string encoded=await browser.CaptureDomOverlayPngBase64(captureMode);byte[] png=Convert.FromBase64String(encoded);captureSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;pngBytes+=png.Length;
     mark=Stopwatch.GetTimestamp();await WritePipe(process,error,png);pipeSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
     if(rendering.Elapsed.TotalSeconds-last>.5||frame==end-1){last=rendering.Elapsed.TotalSeconds;J.Write(Path.Combine(part,"progress.json"),J.O("phase","rendering","frame",frame,"startFrame",start,"endFrame",end,"outputFrames",frame-start+1,"elapsedSeconds",rendering.Elapsed.TotalSeconds,"pipeline",pipeline,"codec","prores4444"));}
     if(browser.Errors.Count>0)throw new IOException(string.Join("; ",browser.Errors));
    }
    J.Write(Path.Combine(part,"progress.json"),J.O("phase","encoder-finalizing","startFrame",start,"endFrame",end,"outputFrames",end-start,"elapsedSeconds",rendering.Elapsed.TotalSeconds,"pipeline",pipeline,"codec","prores4444"));
    long finalizeMark=Stopwatch.GetTimestamp();process.StandardInput.Close();while(!process.HasExited){if((Stopwatch.GetTimestamp()-finalizeMark)/(double)Stopwatch.Frequency>120){Stop(process);throw new TimeoutException("透明视频帧已提交，但 ProRes 编码器在 120 秒内未完成收尾："+await ErrorText(error));}await Task.Delay(20);}await stdout;string message=await ErrorText(error);finalizeSeconds=(Stopwatch.GetTimestamp()-finalizeMark)/(double)Stopwatch.Frequency;if(process.ExitCode!=0)throw new IOException("透明 ProRes 4444 编码失败："+message);
   }finally{Stop(process);}}
   var media=await Commands.Probe(output,true);var video=J.A(J.Get(media,"streams")).FirstOrDefault(x=>J.S(x,"codec_type")=="video");double frames=Math.Max(J.N(video,"nb_frames"),J.N(video,"nb_read_frames"));if(frames!=end-start||J.N(video,"width")!=width||J.N(video,"height")!=height)throw new IOException("透明视频片段帧数或尺寸不符");
   double renderSeconds=rendering.Elapsed.TotalSeconds;J.Write(Path.Combine(part,"result.json"),J.O("pipeline",pipeline,"alphaCaptureMode","screenshot","alphaFallbackReason",fallbackReason,"codec","prores4444","totalFrames",end-start,"startFrame",start,"endFrame",end,"renderSeconds",renderSeconds,"totalSeconds",began.Elapsed.TotalSeconds,"browserStartupSeconds",browserStartupSeconds,"navigationSeconds",navigationSeconds,"setupSeconds",setupSeconds,"restoreSeconds",restoreSeconds,"stepSeconds",stepSeconds,"captureSeconds",captureSeconds,"pipeSeconds",pipeSeconds,"encoderFinalizeSeconds",finalizeSeconds,"pngBytes",pngBytes,"rendererScale",rendererScale,"transparency",transparency,"gpu",gpu,"runtime",browser.Runtime,"errors",browser.Errors,"media",media));
  }

  static async Task RenderTransparentFast(BrowserHost browser,object request,object settings,string part,object gpu,int width,int height,int fps,int start,int end,int first,Stopwatch began,double browserStartupSeconds,double navigationSeconds,double setupSeconds,double restoreSeconds,object transparency){
   bool dialog=IsDialog(request),premultiplied=J.B(transparency,"premultipliedAlpha",true);string pipeline=dialog?"transparent-dom-gpu":"transparent-stage-gpu",output=Path.Combine(part,"video.mov");double stepSeconds=0,readbackSeconds=0,hostCopySeconds=0,pipeSeconds=0,finalizeSeconds=0,domCaptureSeconds=0,domUploadSeconds=0,domAnimationSeconds=0;long hostBytes=0,domOverlayBytes=0;int domCaptureCount=0,domRefreshCount=0,domFullRefreshCount=0,domBaseOnlyRefreshCount=0;object domInstall=null,domLastUpdate=null,domAnimation=null,domCapturePlan=null,dialogRender=null;
   if(dialog)domInstall=await browser.Eval("__gpuDomInstall()");
   for(int frame=first;frame<start;frame++){long mark=Stopwatch.GetTimestamp();await browser.Eval((dialog?"__webviewWarmupStep(":"__webviewStep(")+frame+")",30000);stepSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;}
   var rendererScale=await browser.Eval("__gpuReadbackRendererScale("+width+","+height+")",30000);int frameBytes=checked(checked(width*height)*4);var shared=await browser.CreateGpuReadbackBuffer(frameBytes);await browser.Eval("__gpuReadbackPrepare("+width+","+height+")",30000);byte[] hostFrame=new byte[frameBytes];
   var args=new List<string>{"-v","error","-y","-f","rawvideo","-pix_fmt","rgba","-video_size",width+"x"+height,"-framerate",fps.ToString(),"-i","pipe:0","-vf","vflip","-an","-c:v","prores_ks","-profile:v","4","-pix_fmt","yuva444p10le","-vendor","apl0","-frames:v",(end-start).ToString(),output};
   var rendering=Stopwatch.StartNew();double last=-1;Exception failure=null;
   try{using(var process=Commands.Start("ffmpeg",args,true,true)){var error=process.StandardError.ReadToEndAsync();var stdout=process.StandardOutput.ReadToEndAsync();try{
    for(int frame=start;frame<end;frame++){
     long mark=Stopwatch.GetTimestamp();await browser.Eval("__webviewStep("+frame+")",30000);stepSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
     if(dialog){
      domCapturePlan=await browser.Eval("__gpuDomCapturePlan()");
      if(J.B(domCapturePlan,"needed")){
       string captureScope=J.S(domCapturePlan,"scope","full");
       if(captureScope=="base"){
        mark=Stopwatch.GetTimestamp();string domBase=await browser.CaptureDomOverlayPngBase64("base");domCaptureSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;domOverlayBytes+=(long)domBase.Length*3/4;
        mark=Stopwatch.GetTimestamp();domLastUpdate=await browser.Eval("__gpuDomOverlayUpdateBase("+J.Text(domBase)+")",60000);domUploadSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;domCaptureCount++;domRefreshCount++;domBaseOnlyRefreshCount++;if(J.B(domLastUpdate,"fallbackFull"))captureScope="full";
       }
       if(captureScope!="base"){
        mark=Stopwatch.GetTimestamp();string domBase=await browser.CaptureDomOverlayPngBase64("base"),domTextbox=await browser.CaptureDomOverlayPngBase64("textbox"),domFinal=await browser.CaptureDomOverlayPngBase64("final");var atlasPlan=await browser.Eval("__gpuDomPrepareTextAtlas()",30000);int atlasPages=Math.Max(0,(int)J.N(atlasPlan,"pages"));var domAtlas=new List<string>();for(int atlasPage=0;atlasPage<atlasPages;atlasPage++)domAtlas.Add(await browser.CaptureDomOverlayPngBase64("atlas:"+atlasPage));domCaptureSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;domOverlayBytes+=(long)(domBase.Length+domTextbox.Length+domFinal.Length)*3/4+domAtlas.Sum(x=>(long)x.Length)*3/4;
        string atlasArg="["+string.Join(",",domAtlas.Select(x=>J.Text(x)))+"]";mark=Stopwatch.GetTimestamp();domLastUpdate=await browser.Eval("__gpuDomOverlayUpdate("+J.Text(domBase)+","+J.Text(domTextbox)+","+J.Text(domFinal)+","+atlasArg+")",60000);domUploadSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;domCaptureCount+=3+domAtlas.Count;domRefreshCount++;domFullRefreshCount++;
       }
      }
      mark=Stopwatch.GetTimestamp();domAnimation=await browser.Eval("__gpuDomApplyAnimations()",30000);dialogRender=await browser.Eval("__gpuDomRenderOnly()",30000);domAnimationSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
     }
     mark=Stopwatch.GetTimestamp();await browser.Eval("__gpuReadbackShared("+width+","+height+")",30000);readbackSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
     mark=Stopwatch.GetTimestamp();int copied=CopyShared(shared,hostFrame);hostCopySeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;hostBytes+=copied;if(copied!=frameBytes)throw new EndOfStreamException("透明 GPU RGBA SharedBuffer host copy 不完整："+copied+"/"+frameBytes);if(premultiplied)Unpremultiply(hostFrame);
     mark=Stopwatch.GetTimestamp();await WritePipe(process,error,hostFrame);pipeSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
     if(rendering.Elapsed.TotalSeconds-last>.5||frame==end-1){last=rendering.Elapsed.TotalSeconds;J.Write(Path.Combine(part,"progress.json"),J.O("phase","rendering","frame",frame,"startFrame",start,"endFrame",end,"outputFrames",frame-start+1,"elapsedSeconds",rendering.Elapsed.TotalSeconds,"pipeline",pipeline,"codec","prores4444","domRefreshes",domRefreshCount));}
     if(browser.Errors.Count>0)throw new IOException(string.Join("; ",browser.Errors));
    }
    J.Write(Path.Combine(part,"progress.json"),J.O("phase","encoder-finalizing","startFrame",start,"endFrame",end,"outputFrames",end-start,"elapsedSeconds",rendering.Elapsed.TotalSeconds,"pipeline",pipeline,"codec","prores4444"));
    long finalizeMark=Stopwatch.GetTimestamp();process.StandardInput.Close();while(!process.HasExited){if((Stopwatch.GetTimestamp()-finalizeMark)/(double)Stopwatch.Frequency>120){Stop(process);throw new TimeoutException("透明 GPU RGBA 帧已提交，但 ProRes 编码器在 120 秒内未完成收尾："+await ErrorText(error));}await Task.Delay(20);}await stdout;string message=await ErrorText(error);finalizeSeconds=(Stopwatch.GetTimestamp()-finalizeMark)/(double)Stopwatch.Frequency;if(process.ExitCode!=0)throw new IOException("透明 GPU RGBA ProRes 4444 编码失败："+message);
   }finally{Stop(process);}}}catch(Exception e){failure=e;}
   try{await browser.ReleaseGpuReadbackBuffer();}catch(Exception e){if(failure==null)failure=e;}if(failure!=null)throw failure;
   var media=await Commands.Probe(output,true);var video=J.A(J.Get(media,"streams")).FirstOrDefault(x=>J.S(x,"codec_type")=="video");double frames=Math.Max(J.N(video,"nb_frames"),J.N(video,"nb_read_frames"));if(frames!=end-start||J.N(video,"width")!=width||J.N(video,"height")!=height)throw new IOException("透明 GPU RGBA 片段帧数或尺寸不符");
   object domStats=dialog?await browser.Eval("__gpuDomStats()"):null;double renderSeconds=rendering.Elapsed.TotalSeconds;J.Write(Path.Combine(part,"result.json"),J.O("pipeline",pipeline,"alphaCaptureMode","fast","codec","prores4444","totalFrames",end-start,"startFrame",start,"endFrame",end,"renderSeconds",renderSeconds,"totalSeconds",began.Elapsed.TotalSeconds,"browserStartupSeconds",browserStartupSeconds,"navigationSeconds",navigationSeconds,"setupSeconds",setupSeconds,"restoreSeconds",restoreSeconds,"stepSeconds",stepSeconds,"captureSeconds",readbackSeconds+hostCopySeconds+domCaptureSeconds+domUploadSeconds+domAnimationSeconds,"readbackSeconds",readbackSeconds,"hostCopySeconds",hostCopySeconds,"hostBytes",hostBytes,"pipeSeconds",pipeSeconds,"encoderFinalizeSeconds",finalizeSeconds,"premultipliedAlpha",premultiplied,"unpremultipliedOnHost",premultiplied,"rendererScale",rendererScale,"transparency",transparency,"domOverlay",dialog,"domInstall",domInstall,"domRefreshCount",domRefreshCount,"domFullRefreshCount",domFullRefreshCount,"domBaseOnlyRefreshCount",domBaseOnlyRefreshCount,"domCaptureCount",domCaptureCount,"domCapturePlan",domCapturePlan,"domCaptureSeconds",domCaptureSeconds,"domUploadSeconds",domUploadSeconds,"domAnimationSeconds",domAnimationSeconds,"domOverlayBytes",domOverlayBytes,"domLastUpdate",domLastUpdate,"domAnimation",domAnimation,"dialogRender",dialogRender,"domStats",domStats,"gpu",gpu,"runtime",browser.Runtime,"errors",browser.Errors,"media",media));
  }

  public static async Task RenderTransparent(BrowserHost browser,object request,object settings,string part,object gpu,int width,int height,int fps,int start,int end,int first,Stopwatch began,double browserStartupSeconds,double navigationSeconds,double setupSeconds,double restoreSeconds){
   string mode=J.S(settings,"alphaCaptureMode","fast");if(mode=="screenshot"){await RenderTransparentScreenshot(browser,request,settings,part,gpu,width,height,fps,start,end,first,began,browserStartupSeconds,navigationSeconds,setupSeconds,restoreSeconds,"user-selected");return;}object transparency=await MakeStageTransparent(browser),support=IsDialog(request)?await browser.Eval("typeof globalThis.__gpuDomRenderOnly==='function'"):true;bool alpha=J.B(transparency,"alpha"),dialogSupport=!IsDialog(request)||(support is bool&&(bool)support);if(!alpha||!dialogSupport){await RenderTransparentScreenshot(browser,request,settings,part,gpu,width,height,fps,start,end,first,began,browserStartupSeconds,navigationSeconds,setupSeconds,restoreSeconds,!alpha?"webgl-context-has-no-alpha":"dom-render-only-unavailable");return;}await RenderTransparentFast(browser,request,settings,part,gpu,width,height,fps,start,end,first,began,browserStartupSeconds,navigationSeconds,setupSeconds,restoreSeconds,transparency);
  }

  public static async Task<object> ExportAudio(object timing,object bounds,string planning,string dir,string output){
   var mix=J.A(J.Read(Path.Combine(planning,"audio-args.json"))).Select(Convert.ToString).ToList();double fullDuration=J.N(timing,"durationSeconds"),start=J.N(bounds,"startSeconds"),duration=J.N(bounds,"durationSeconds");string full=Path.Combine(dir,"webgal-audio-full.wav");
   if(mix.Count>0)await Commands.Run("ffmpeg",new[]{"-v","error","-y"}.Concat(mix).Concat(new[]{"-t",J.Num(fullDuration),full}),Path.Combine(dir,"mix.log"),600000);
   Files.EnsureParent(output);string partial=Path.Combine(Path.GetDirectoryName(output),".webvideo-"+Guid.NewGuid().ToString("N")+".partial.wav");try{
    if(mix.Count>0)await Commands.Run("ffmpeg",new[]{"-v","error","-y","-ss",J.Num(start),"-i",full,"-t",J.Num(duration),"-map","0:a:0","-c:a","pcm_s16le","-ar","48000",partial},Path.Combine(dir,"audio-export.log"),600000);
    else await Commands.Run("ffmpeg",new[]{"-v","error","-y","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t",J.Num(duration),"-c:a","pcm_s16le",partial},Path.Combine(dir,"audio-export.log"),600000);
    var media=await Commands.Probe(partial,false);double actual=J.N(J.Get(media,"format"),"duration");if(Math.Abs(actual-duration)>.12)throw new IOException("WebGAL 音轨导出时长不符");File.Move(partial,output);return media;
   }finally{if(File.Exists(partial))File.Delete(partial);}
  }
 }
}

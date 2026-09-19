using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Diagnostics;using System.Threading.Tasks;
namespace NativeVideo {
 public static class GpuRawExport {
  public static async Task Run(BrowserHost browser,object request,object settings,string part,object gpu,int width,int height,int fps,int start,int end,int first,Stopwatch began,double browserStartupSeconds,double navigationSeconds,double setupSeconds,double restoreSeconds){
   string codec=J.S(request,"gpuRawCodec","x264rgb").ToLowerInvariant();if(codec!="x264rgb"&&codec!="nvenc")throw new ArgumentException("gpuRawCodec 仅支持 x264rgb 或 nvenc");
   bool domOverlay=J.B(request,"gpuRawDom",true);double stepSeconds=0,readbackSeconds=0,hostCopySeconds=0,pipeSeconds=0,encoderFinalizeSeconds=0,domCaptureSeconds=0,domUploadSeconds=0,domAnimationSeconds=0;long hostBytes=0,domOverlayBytes=0;int domCaptureCount=0,domRefreshCount=0;object domInstall=null,domLastUpdate=null,domAnimation=null;
   for(int frame=first;frame<start;frame++){long mark=Stopwatch.GetTimestamp();await browser.Eval("__webviewStep("+frame+")",30000);stepSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;}
   var rendererScale=await browser.Eval("__gpuReadbackRendererScale("+width+","+height+")",30000);var colorInfo=await browser.Eval("(()=>{const gl=__wgProbe.core.gameplay.pixiStage.currentApp.renderer.gl,a=gl.getContextAttributes();return {alpha:!!a.alpha,premultipliedAlpha:!!a.premultipliedAlpha,preserveDrawingBuffer:!!a.preserveDrawingBuffer,antialias:!!a.antialias,drawingBufferColorSpace:String(gl.drawingBufferColorSpace||''),unpackColorSpaceConversion:gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL)};})()");
   if(domOverlay)domInstall=await browser.Eval("__gpuDomInstall()");
   int frameBytes=checked(checked(width*height)*4);var shared=await browser.CreateGpuReadbackBuffer(frameBytes);await browser.Eval("__gpuReadbackPrepare("+width+","+height+")",30000);byte[] hostFrame=new byte[frameBytes];string output=Path.Combine(part,"video.mp4");
   var ffargs=new List<string>{"-v","error","-y","-f","rawvideo","-pix_fmt","rgba","-video_size",width+"x"+height,"-framerate",fps.ToString(),"-i","pipe:0","-vf",codec=="x264rgb"?"vflip,format=rgb24":"vflip,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=nv12"};
   if(codec=="x264rgb")ffargs.AddRange(new[]{"-c:v","libx264rgb","-preset","ultrafast","-crf","0","-pix_fmt","rgb24","-color_range","pc","-x264-params","fullrange=on:colorprim=bt709:transfer=iec61966-2-1","-threads","2"});
   else ffargs.AddRange(new[]{"-c:v","h264_nvenc","-preset","p1","-tune","hq","-rc","vbr","-cq","19","-b:v","0","-pix_fmt","yuv420p","-color_range","tv","-colorspace","bt709","-color_primaries","bt709","-color_trc","iec61966-2-1"});
   ffargs.AddRange(new[]{"-an","-frames:v",(end-start).ToString(),output});
   var rendering=Stopwatch.StartNew();double last=-1;Exception failure=null;
   try{
    using(var p=Commands.Start("ffmpeg",ffargs,true,true)){var err=p.StandardError.ReadToEndAsync();var stdout=p.StandardOutput.ReadToEndAsync();try{
     for(int frame=start;frame<end;frame++){
      long mark=Stopwatch.GetTimestamp();await browser.Eval("__webviewStep("+frame+")",30000);stepSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
      if(domOverlay){
       var needDom=await browser.Eval("__gpuDomCaptureNeeded()");
       if(needDom is bool&&(bool)needDom){
        mark=Stopwatch.GetTimestamp();string domBase=await browser.CaptureDomOverlayPngBase64("base"),domTextbox=await browser.CaptureDomOverlayPngBase64("textbox"),domFinal=await browser.CaptureDomOverlayPngBase64("final");domCaptureSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;domOverlayBytes+=(long)(domBase.Length+domTextbox.Length+domFinal.Length)*3/4;
        mark=Stopwatch.GetTimestamp();domLastUpdate=await browser.Eval("__gpuDomOverlayUpdate("+J.Text(domBase)+","+J.Text(domTextbox)+","+J.Text(domFinal)+")",60000);domUploadSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;domCaptureCount+=3;domRefreshCount++;
       }
       mark=Stopwatch.GetTimestamp();domAnimation=await browser.Eval("__gpuDomApplyAnimations()",30000);domAnimationSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
      }
      mark=Stopwatch.GetTimestamp();await browser.Eval("__gpuReadbackShared("+width+","+height+")",30000);readbackSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
      mark=Stopwatch.GetTimestamp();int copied=0;using(var stream=shared.OpenStream()){while(copied<frameBytes){int n=stream.Read(hostFrame,copied,frameBytes-copied);if(n<=0)break;copied+=n;}}hostCopySeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;hostBytes+=copied;if(copied!=frameBytes)throw new EndOfStreamException("SharedBuffer host copy 不完整："+copied+"/"+frameBytes);
      mark=Stopwatch.GetTimestamp();try{await p.StandardInput.BaseStream.WriteAsync(hostFrame,0,frameBytes);}catch(IOException writeError){try{if(!p.HasExited)p.Kill();}catch{}string pipeError="";try{pipeError=err.GetAwaiter().GetResult();}catch{}throw new IOException("GPU raw 编码管道提前结束："+pipeError,writeError);}pipeSeconds+=(Stopwatch.GetTimestamp()-mark)/(double)Stopwatch.Frequency;
      if(rendering.Elapsed.TotalSeconds-last>.5||frame==end-1){last=rendering.Elapsed.TotalSeconds;J.Write(Path.Combine(part,"progress.json"),J.O("phase","rendering","frame",frame,"startFrame",start,"endFrame",end,"outputFrames",frame-start+1,"elapsedSeconds",rendering.Elapsed.TotalSeconds,"pipeline","gpu-raw","codec",codec,"domRefreshes",domRefreshCount));}
      if(browser.Errors.Count>0)throw new IOException(string.Join("; ",browser.Errors));
     }
     long finalMark=Stopwatch.GetTimestamp();p.StandardInput.Close();while(!p.HasExited)await Task.Delay(20);await stdout;var message=await err;encoderFinalizeSeconds=(Stopwatch.GetTimestamp()-finalMark)/(double)Stopwatch.Frequency;if(p.ExitCode!=0)throw new IOException("GPU raw 编码失败："+message);
    }finally{if(!p.HasExited)p.Kill();}}
   }catch(Exception e){failure=e;}
   try{await browser.ReleaseGpuReadbackBuffer();}catch(Exception e){if(failure==null)failure=e;}
   if(failure!=null)throw failure;
   var media=await Commands.Probe(output,true);var video=J.A(J.Get(media,"streams")).FirstOrDefault(x=>J.S(x,"codec_type")=="video");double frames=Math.Max(J.N(video,"nb_frames"),J.N(video,"nb_read_frames"));if(frames!=end-start||J.N(video,"width")!=width||J.N(video,"height")!=height)throw new IOException("GPU raw 片段帧数或尺寸不符");
   object domStats=domOverlay?await browser.Eval("__gpuDomStats()"):null;double renderSeconds=rendering.Elapsed.TotalSeconds;
   J.Write(Path.Combine(part,"result.json"),J.O("pipeline","gpu-raw","codec",codec,"totalFrames",end-start,"startFrame",start,"endFrame",end,"renderSeconds",renderSeconds,"totalSeconds",began.Elapsed.TotalSeconds,"browserStartupSeconds",browserStartupSeconds,"navigationSeconds",navigationSeconds,"setupSeconds",setupSeconds,"restoreSeconds",restoreSeconds,"stepSeconds",stepSeconds,"captureSeconds",readbackSeconds+hostCopySeconds+domCaptureSeconds+domUploadSeconds+domAnimationSeconds,"readbackSeconds",readbackSeconds,"readbackFps",readbackSeconds>0?(end-start)/readbackSeconds:0,"hostCopySeconds",hostCopySeconds,"hostCopyFps",hostCopySeconds>0?(end-start)/hostCopySeconds:0,"hostCopyGigabytesPerSecond",hostCopySeconds>0?hostBytes/hostCopySeconds/1000000000d:0,"pipeSeconds",pipeSeconds,"encoderFinalizeSeconds",encoderFinalizeSeconds,"frameBytes",frameBytes,"domOverlay",domOverlay,"domInstall",domInstall,"domRefreshCount",domRefreshCount,"domCaptureCount",domCaptureCount,"domCaptureSeconds",domCaptureSeconds,"domUploadSeconds",domUploadSeconds,"domAnimationSeconds",domAnimationSeconds,"domOverlayBytes",domOverlayBytes,"domLastUpdate",domLastUpdate,"domAnimation",domAnimation,"domStats",domStats,"rendererScale",rendererScale,"colorInfo",colorInfo,"gpu",gpu,"runtime",browser.Runtime,"errors",browser.Errors,"media",media));
  }
 }
}
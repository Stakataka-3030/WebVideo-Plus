using System;
using System.IO;
namespace NativeVideo {
 // Exact official bundle identities and profile-specific preparatory patches.
 // 4.6.4 literals mirror build/runtime-patches.json; their result is hash-checked.
 internal sealed class WebgalEngineProfile {
  public const string Raw464="e49e15f0db25c95556b6b1eccad89d6e77a32e284cd4e4852fad7dc9a3019902";
  public const string Prepared464="d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10";
  public const string Raw465="356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6";
  public readonly string Version,Core,Observe,Next,AutoCallback,Exports;
  WebgalEngineProfile(string version,string core,string observe,string next,string auto,string exports){Version=version;Core=core;Observe=observe;Next=next;AutoCallback=auto;Exports=exports;}
  static readonly WebgalEngineProfile V464=new WebgalEngineProfile("4.6.4","I","bP","dp","JAe","nativeAuto:G$,nativeStopAuto:D_,nativeNext:dp,compileText:Os,textDelay:_P,textAnimation:xP");
  static readonly WebgalEngineProfile V465=new WebgalEngineProfile("4.6.5","R","tO","Lp","kPe","nativeAuto:k5,nativeStopAuto:p0,nativeNext:Lp,compileText:Na,textDelay:KC,textAnimation:JC");
  public static WebgalEngineProfile FromHash(string hash){return hash==Raw464||hash==Prepared464?V464:hash==Raw465?V465:null;}
  public static WebgalEngineProfile ForVersion(string version){return version=="4.6.4"?V464:version=="4.6.5"?V465:null;}
  static string ReplaceOnce(string text,string from,string to){int at=text.IndexOf(from,StringComparison.Ordinal);if(at<0||text.IndexOf(from,at+from.Length,StringComparison.Ordinal)>=0)throw new IOException("WebGAL profile patch anchor mismatch");return text.Substring(0,at)+to+text.Substring(at+from.Length);}
  public string Instrument(string text){
   string hash=Files.HashText(text);var identity=FromHash(hash);
   if(identity==null||identity.Version!=Version)throw new IOException("WebGAL bundle bytes do not match selected exact engine profile");
   if(Version=="4.6.5"){
    text=ReplaceOnce(text,"Ge={\"preview.command.sync-scene\"","Ge=globalThis.__probeCommands={\"preview.command.sync-scene\"");
    text=ReplaceOnce(text,"audioLevelInterval:setInterval(()=>{},0)","audioLevelInterval:null");
    return text+"\n;globalThis.__wgProbe={core:R,store:Pe};\nObject.assign(globalThis.__wgProbe,{parseScene:wo});\nObject.assign(globalThis.__wgProbe,{stageManager:X});\n";
   }
   if(hash==Prepared464)return text;
   text=ReplaceOnce(text,@"if(n.started=!0,i==null&&n.idle()){setTimeout(function(){return n.drain()},1)",@"if(n.started=!0,i==null&&n.idle()){queueMicrotask(function(){return n.drain()},1)");
   text=ReplaceOnce(text,@"o?n._tasks.unshift(s):n._tasks.push(s),setTimeout(n.process,1)},this.process=function(){for(",@"o?n._tasks.unshift(s):n._tasks.push(s),queueMicrotask(n.process,1)},this.process=function(){for(");
   text=ReplaceOnce(text,@"return}i?setTimeout(function(){r(t[o++],s)},1):r(t[o++],s)}s()},e.queue=function(t,r){return new e(t,r)},e}(),gS=100,pxe=/(#[\w-]+)?$/,Mc=function(){function e(t,r){var n=this",@"return}i?queueMicrotask(function(){r(t[o++],s)},1):r(t[o++],s)}s()},e.queue=function(t,r){return new e(t,r)},e}(),gS=100,pxe=/(#[\w-]+)?$/,Mc=function(){function e(t,r){var n=this");
   text=ReplaceOnce(text,@"const c=()=>{setTimeout(()=>{var v,g",@"const c=()=>{queueMicrotask(()=>{var v,g");
   text=ReplaceOnce(text,@"E.scale.x=S,E.scale.y=S,E.anchor.set(.5),E.position.y=this.stageHeight/2,i.setBaseX(this.stageWidth/2),i.setBaseY(this.stageHeight/2),i.pivot.set(0,this.stageHeight/2),i.addChild(E),this.notifyTargetReferenceBoxChanged(t),this.requestRender()}},0)}",@"E.scale.x=S,E.scale.y=S,E.anchor.set(.5),E.position.y=this.stageHeight/2,i.setBaseX(this.stageWidth/2),i.setBaseY(this.stageHeight/2),i.pivot.set(0,this.stageHeight/2),i.addChild(E),this.notifyTargetReferenceBoxChanged(t),this.requestRender()}})}");
   text=ReplaceOnce(text,@"const l=()=>{setTimeout(()=>{console.debug(""start loaded video: ""+r)",@"const l=()=>{queueMicrotask(()=>{console.debug(""start loaded video: ""+r)");
   text=ReplaceOnce(text,@"S.scale.x=b,S.scale.y=b,S.anchor.set(.5),S.position.y=this.stageHeight/2,i.setBaseX(this.stageWidth/2),i.setBaseY(this.stageHeight/2),i.pivot.set(0,this.stageHeight/2),i.addChild(S),this.notifyTargetReferenceBoxChanged(t)})},0)}",@"S.scale.x=b,S.scale.y=b,S.anchor.set(.5),S.position.y=this.stageHeight/2,i.setBaseX(this.stageWidth/2),i.setBaseY(this.stageHeight/2),i.pivot.set(0,this.stageHeight/2),i.addChild(S),this.notifyTargetReferenceBoxChanged(t)})})}");
   text=ReplaceOnce(text,@"const d=()=>{setTimeout(()=>{var x,m",@"const d=()=>{queueMicrotask(()=>{var x,m");
   text=ReplaceOnce(text,@"o.setBaseY(this.stageHeight/2),D<this.stageHeight&&o.setBaseY(this.stageHeight/2+(this.stageHeight-D)/2),o.setBaseX(X1(n,this.stageWidth,O)),o.pivot.set(0,this.stageHeight/2),o.addChild(T),this.notifyTargetReferenceBoxChanged(t),this.requestRender()}},0)}",@"o.setBaseY(this.stageHeight/2),D<this.stageHeight&&o.setBaseY(this.stageHeight/2+(this.stageHeight-D)/2),o.setBaseX(X1(n,this.stageWidth,O)),o.pivot.set(0,this.stageHeight/2),o.addChild(T),this.notifyTargetReferenceBoxChanged(t),this.requestRender()}})}");
   text=ReplaceOnce(text,@"return setTimeout(()=>{I.sceneManager.resetScene()},5),bTe(),sy(),Yo(r).then(n=>{I.sceneManager.sceneData.currentScene=xo(n,""start.txt"",r)}),t(Ot({component:""showTitle"",visibility:!0})),IT(Pe.getState().GUI.titleBgm),Ar()},wTe=e=>(jU(e.content),Ar()),ETe=e=>(ee.warn(""pixi 被脚本重新初始化""),I.gameplay.performController.unmountPerformByPrefix(""PixiPerform"",!0),Y.removeAllPixiPerforms(),Ar()),Ct={audioContext:null,source:null,analyser:void 0,dataArray:void 0,audioLevelInterval:setInterval(()=>{},0),blinkTimerID:setTimeout(()=>{},0),maxAudioLevel:0},ATe=async()=>{if(!Ct.audioContext){const e=window.AudioContext??window.webkitAudioContext",@"return setTimeout(()=>{I.sceneManager.resetScene()},5),bTe(),sy(),Yo(r).then(n=>{I.sceneManager.sceneData.currentScene=xo(n,""start.txt"",r)}),t(Ot({component:""showTitle"",visibility:!0})),IT(Pe.getState().GUI.titleBgm),Ar()},wTe=e=>(jU(e.content),Ar()),ETe=e=>(ee.warn(""pixi 被脚本重新初始化""),I.gameplay.performController.unmountPerformByPrefix(""PixiPerform"",!0),Y.removeAllPixiPerforms(),Ar()),Ct={audioContext:null,source:null,analyser:void 0,dataArray:void 0,audioLevelInterval:null,blinkTimerID:setTimeout(()=>{},0),maxAudioLevel:0},ATe=async()=>{if(!Ct.audioContext){const e=window.AudioContext??window.webkitAudioContext");
   text=ReplaceOnce(text,@"return}Y.updateEffectAndCommit({target:ne.target,transform:rt})},it={""preview.command.sync-scene"":ne=>(Oe(ne),{}),""preview.command.run-scene-content"":ne=>(me(ne),{}),""preview.command.run-snippet"":ne=>(he(ne),{}),""preview.command.reload-templates"":()=>(ae(),{}),""preview.command.set-effect"":ne=>(Ze(ne),{}),""preview.command.set-component-visibility"":ne=>(Ie(ne),{}),""preview.command.set-font-optimization"":ne=>(xe(ne),{}),""preview.command.set-text-read-mode"":ne=>(Ue(ne),{})},gt=ne=>QCe(ne.type),Ae=ne=>{switch(ne.type){case""preview.query.reference-box"":TPe(ne,I.gameplay.pixiStage).then(Be=>{m.send(Be)}).catch(Be=>{ee.error(`执行编辑器同步 V1 请求失败：${ne.type}`,Be),T(ne,""internal-error"",""预览运行时无法安全完成该请求"")})",@"return}Y.updateEffectAndCommit({target:ne.target,transform:rt})},it=globalThis.__probeCommands={""preview.command.sync-scene"":ne=>(Oe(ne),{}),""preview.command.run-scene-content"":ne=>(me(ne),{}),""preview.command.run-snippet"":ne=>(he(ne),{}),""preview.command.reload-templates"":()=>(ae(),{}),""preview.command.set-effect"":ne=>(Ze(ne),{}),""preview.command.set-component-visibility"":ne=>(Ie(ne),{}),""preview.command.set-font-optimization"":ne=>(xe(ne),{}),""preview.command.set-text-read-mode"":ne=>(Ue(ne),{})},gt=ne=>QCe(ne.type),Ae=ne=>{switch(ne.type){case""preview.query.reference-box"":TPe(ne,I.gameplay.pixiStage).then(Be=>{m.send(Be)}).catch(Be=>{ee.error(`执行编辑器同步 V1 请求失败：${ne.type}`,Be),T(ne,""internal-error"",""预览运行时无法安全完成该请求"")})");
   text=text.Replace("\r\n","\n").Replace("\r","\n").Replace("\n","\r\n");
   text+="\r\n;globalThis.__wgProbe={core:I,store:Pe};\r\n\nObject.assign(globalThis.__wgProbe,{parseScene:xo});\n\nObject.assign(globalThis.__wgProbe,{stageManager:Y});\n";
   if(Files.HashText(text)!=Prepared464)throw new IOException("4.6.4 preparatory patch digest mismatch");
   return text;
  }
 }
}

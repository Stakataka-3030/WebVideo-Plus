// Real pinned Pixi/WebGL pixel regression in Chromium/Edge. No Live2D SDK or
// copyrighted model required: the actual pinned plugin _render method operates
// on synthetic model/update/draw collaborators. This verifies GPU compositing,
// not SDK-specific physics or Windows WebView2 encoding.
// Usage: node tests/figure-export-render.mjs <prepared-runtime> <upstream-root> [out]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const serveOnly=process.argv.includes('--serve');
const [runtimeArg='package/runtime/web',upstreamArg='.build/webgal-source',outArg='.build/figure-export']=process.argv.slice(2).filter(value=>value!=='--serve'),runtime=path.resolve(runtimeArg),upstream=path.resolve(upstreamArg),out=path.resolve(outArg);
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const profiles=[
 {version:'4.6.4',bundle:'index-R1tKotR6.js',bundleHash:'d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10',plugin:'index.es-erQsk_Nn.js',pluginHash:'46590e11b6fb9877524fbb27525734d5208b67b3d28b4afb226d849bc95d7505'},
 {version:'4.6.5',bundle:'index-CC7KTie-.js',bundleHash:'356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6',plugin:'index.es-0XzJiDJZ.js',pluginHash:'8b6c11ea8b4724dd8254d61a009c4d0e7cc7389f31f76570dac354c56b11a724'}
];
const profileInfo=profiles.find(p=>fs.existsSync(path.join(runtime,'assets',p.bundle)));assert.ok(profileInfo,'Unsupported runtime fixture');
const bundle=fs.readFileSync(path.join(runtime,'assets',profileInfo.bundle),'utf8'),plugin=fs.readFileSync(path.join(runtime,'assets',profileInfo.plugin),'utf8');
assert.equal(hash(bundle),profileInfo.bundleHash);assert.equal(hash(plugin),profileInfo.pluginHash);
const start=plugin.indexOf('onTickerUpdate(){this.update(G.shared.deltaMS)}'),end=plugin.indexOf('destroy(t){',start);assert.ok(start>0&&end>start);const live2dMethods=plugin.slice(start,end);
const renderSource=fs.readFileSync(path.join(root,'browser/render.js'),'utf8');
const filter=renderSource.slice(renderSource.indexOf('globalThis.__exportInstallFigureOutputFilter='),renderSource.indexOf('globalThis.__exportTextSettleApplies='));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browserPath=[process.env.CHROMIUM_PATH,'/usr/bin/chromium',`${process.env.ProgramFiles}/Google/Chrome/Application/chrome.exe`,`${process.env['ProgramFiles(x86)']}/Microsoft/Edge/Application/msedge.exe`].find(p=>p&&fs.existsSync(p));assert.ok(browserPath,'Chromium/Edge missing; set CHROMIUM_PATH');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'webvideo-figure-browser-'));
const fixtureExpression=`(async()=>{
  ${filter}
  globalThis.__wgProbe?.core?.gameplay?.pixiStage?.currentApp?.stop();
  const G={shared:{deltaMS:1000/60}},Ze=new PIXI.Matrix();
  class Model extends PIXI.Container {${live2dMethods}}
  const run=(background,includeFigures,kind)=>{
   const app=new PIXI.Application({width:128,height:64,backgroundAlpha:0,antialias:false,autoStart:false,preserveDrawingBuffer:true});app.stop();
   const stage={currentApp:app,figureObjects:[]},gl=app.renderer.gl;
   const rect=(color,x,y,w,h)=>new PIXI.Graphics().beginFill(color).drawRect(x,y,w,h).endFill();
   const parent=new PIXI.Container();app.stage.addChild(parent);
   if(background)parent.addChild(rect(0x0000ff,0,0,128,64));
   const figure=new PIXI.Container();parent.addChild(figure);stage.figureObjects.push({key:'actor',pixiContainer:figure});
   let updates=0,draws=0,elapsed=0,aux=[],model;
   if(kind==='sprite'||kind==='filters'||kind==='mask')figure.addChild(rect(0xff0000,16,16,32,32));
   else{
    model=new Model();figure.addChild(model);const paint=rect(0xff0000,16,16,32,32);model.addChild(paint);paint.renderable=false;
    const texture=gl.createTexture(),fb=gl.createFramebuffer();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    Object.assign(model,{deltaTime:0,elapsedTime:0,glContextID:app.renderer.CONTEXT_UID,textures:[],checkAlphaChange(){},registerInteraction(){},internalModel:{
     update(delta,time){updates++;elapsed=time;},updateTransform(){},
     draw(){draws++;const old=gl.getParameter(gl.FRAMEBUFFER_BINDING),clear=gl.getParameter(gl.COLOR_CLEAR_VALUE);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.colorMask(true,true,true,true);gl.clearColor(1,1,0,1);gl.clear(gl.COLOR_BUFFER_BIT);const pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);aux=Array.from(pixel);gl.bindFramebuffer(gl.FRAMEBUFFER,old);gl.clearColor(...clear);gl.colorMask(true,true,true,true);paint._render(app.renderer);}
    }});
   }
   if(kind==='filters'){figure.filters=[new PIXI.filters.AlphaFilter(.7)];parent.filters=[new PIXI.filters.AlphaFilter(.8)];}
   if(kind==='mask'){const mask=rect(0xffffff,16,16,16,32);figure.addChild(mask);figure.mask=mask;}
   const effect=rect(0x00ff00,96,0,32,64);parent.addChild(effect);
   __exportInstallFigureOutputFilter(stage,includeFigures);
   const snapshots=[];for(let frame=0;frame<6;frame++){
    model?.onTickerUpdate();app.render();const pixels=new Uint8Array(128*64*4);gl.readPixels(0,0,128,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const pixel=(x,y)=>Array.from(pixels.slice((y*128+x)*4,(y*128+x)*4+4));snapshots.push({background:pixel(4,32),figure:pixel(24,32),effect:pixel(110,32),maskedEdge:pixel(40,32)});
   }
   const result={background,includeFigures,kind,updates,draws,elapsed,aux,snapshots,alpha:figure.alpha,visible:figure.visible,renderable:figure.renderable,maskedDraws:app.renderer.__webvideoFigureOutput?.maskedDraws||0};app.destroy(true,{children:true,texture:true,baseTexture:true});return result;
  };
  const rows=[];for(const background of [true,false])for(const includeFigures of [true,false])for(const kind of ['sprite','filters','mask','live2d-plugin'])rows.push(run(background,includeFigures,kind));return {pixiVersion:PIXI.VERSION,rows};
 })()`;
function validate(report){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'raw-report.json'),JSON.stringify(report,null,2)+'\n');
 assert.equal(report.rows?.length,16,'Expected all four layer selections and four renderer cases');
 assert.equal(new Set(report.rows.map(r=>JSON.stringify([r.background,r.includeFigures,r.kind]))).size,16,'Duplicate or missing selection');
 for(const row of report.rows){
  const paired=report.rows.find(other=>other.background===row.background&&other.kind===row.kind&&other.includeFigures!==row.includeFigures);
  assert.ok(paired,'Missing matching figure visibility case');
  assert.deepEqual([row.updates,row.draws,row.elapsed],[paired.updates,paired.draws,paired.elapsed],`${row.kind}: model updates changed`);
  assert.equal(row.snapshots.length,6);assert.equal(row.alpha,1);assert.equal(row.visible,true);assert.equal(row.renderable,true);
  if(row.kind==='live2d-plugin'){assert.equal(row.updates,6);assert.equal(row.draws,6);assert.deepEqual(row.aux,[255,255,0,255],`${row.kind}: mask framebuffer lost writes`);}
  for(const frame of row.snapshots){
   assert.ok(frame.effect[1]>150&&frame.effect[3]>150,`${row.kind}: unrelated stage effect lost`);
   if(row.includeFigures)assert.ok(frame.figure[0]>100,`${row.kind}: included figure missing ${JSON.stringify(frame)}`);
   else assert.deepEqual(frame.figure,frame.background,`${row.kind}: excluded figure pixels remain`);
   if(row.kind==='mask')assert.deepEqual(frame.maskedEdge,frame.background,'stencil mask must clip the figure edge');
   if(!row.background&&!row.includeFigures)assert.deepEqual(frame.background,[0,0,0,0],`${row.kind}: empty stage alpha lost`);
  }
 }
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`PASS ${report.rows.length} pinned Pixi ${report.pixiVersion} RGBA scenarios; six frames each, unchanged model update/draw counts, private masks, figure/parent filters, stencil masks, all four background/figure combinations`);
}
const server=http.createServer((req,res)=>{
 if(req.url==='/report'&&req.method==='POST'){let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{try{const report=JSON.parse(data);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'raw-report.json'),JSON.stringify(report,null,2));if(report.error)throw Error(report.error);validate(report);res.end('PASS');}catch(error){console.error(error);res.statusCode=500;res.end(String(error));}});return;}
 if(req.url==='/fixture.html'){
  const html=fs.readFileSync(path.join(runtime,'index.html'),'utf8');
  const script=`<script>(async()=>{const show=text=>{document.body.style.cssText='overflow:auto;background:white;color:black';let result=document.getElementById('figure-test-result');if(!result){result=document.createElement('pre');result.id='figure-test-result';result.style.cssText='position:fixed;inset:0;z-index:99999;background:white;color:black;overflow:auto;padding:20px';document.body.appendChild(result);}result.textContent=text;};try{for(let i=0;i<200&&!globalThis.PIXI;i++)await new Promise(r=>setTimeout(r,100));show('Running pinned Pixi export tests');const report=await ${fixtureExpression};const response=await fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});show(await response.text());}catch(e){show(String(e.stack||e));await fetch('/report',{method:'POST',body:JSON.stringify({error:String(e.stack||e)})});}})();</script>`;
  res.setHeader('Content-Type','text/html');res.end(html.replace('</body>',script+'</body>'));return;
 }
 try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/index.html';const candidates=[runtime,upstream].map(dir=>path.resolve(dir,'.'+name));const file=candidates.find((file,i)=>file.startsWith([runtime,upstream][i]+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile());if(!file)throw Error('404');res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.txt':'text/plain','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
if(serveOnly){console.log(`Figure test page: http://127.0.0.1:${server.address().port}/fixture.html`);await new Promise(()=>{});}
const child=spawn(browserPath,['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let log='',socket;child.stderr.on('data',d=>log+=d);
try{
 const endpoint=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Browser startup timed out '+log)),20000);child.on('error',reject);child.stderr.on('data',()=>{const match=log.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let serial=0;const pending=new Map();
 socket.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evalJs=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`},sessionId);
 for(let i=0;i<100&&!await evalJs('!!globalThis.PIXI');i++)await sleep(100);assert.equal(await evalJs('!!globalThis.PIXI'),true,'Pinned Pixi did not load');
 const report=await evalJs(fixtureExpression);
 validate(report);
 await send('Browser.close');
}catch(error){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'browser.log'),log+'\n'+String(error.stack||error));throw error;}finally{socket?.close();child.kill();await new Promise(resolve=>server.close(resolve));await sleep(150);fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}

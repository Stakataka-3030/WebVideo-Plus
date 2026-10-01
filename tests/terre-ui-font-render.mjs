// Browser-computed CSS regression; no font binaries or external sites involved.
// node tests/terre-ui-font-render.mjs [--browser PATH] [--out .build/terre-ui-font]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function validateUiFontReport(report){
 assert.equal(report.ok,true,report.error||'Fixture did not complete');
 assert.ok(report.phases.length>=4,'Missing dynamic host phases');
 assert.deepEqual(report.phases[0].hostWith,report.before,'Injected CSS changed unrelated host typography');
 for(const phase of report.phases){
  assert.deepEqual(phase.hostWith,phase.hostWithout,phase.name+' changed unrelated host controls');
  if(phase.expectedNoticeParent)assert.equal(phase.noticeParent,phase.expectedNoticeParent,phase.name+' notice did not follow provider');
  for(const node of phase.nodes)assert.equal(node.style.fontFamily,node.expected,`${phase.name}: ${node.id} font inheritance`);
 }
 const [initial,changed,tokenOnly]=report.phases;
 assert.notEqual(initial.bodyFamily,changed.bodyFamily,'Fixture did not exercise a host change');
 assert.equal(changed.bodyFamily,tokenOnly.bodyFamily,'Base token should not replace actual body typography');
 assert.notEqual(initial.monoFamily,changed.monoFamily,'Fixture did not change mono token');
 assert.equal(report.phases.at(-1).monoFamily,'monospace','Missing host token must fall back to generic monospace');
 return true;
}
function findBrowser(explicit) {
  const candidates=[explicit,process.env.CHROMIUM_PATH,...(process.platform==='win32'?[
    `${process.env.ProgramFiles}/Google/Chrome/Application/chrome.exe`,
    `${process.env['ProgramFiles(x86)']}/Microsoft/Edge/Application/msedge.exe`,
    `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`
  ]:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'])];
  const result=candidates.find(candidate=>candidate&&fs.existsSync(candidate));
  assert.ok(result,'Chromium/Edge missing; supply --browser or CHROMIUM_PATH');return result;
}

async function launchBrowser(executable) {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'webvideo-font-browser-'));
  const child=spawn(executable,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--force-device-scale-factor=1','--hide-scrollbars',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let log='';child.stderr.on('data',data=>{log+=data;});
  try {
    const endpoint=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Chromium DevTools startup timed out: '+log)),20000);
      child.on('error',error=>{clearTimeout(timeout);reject(error);});
      child.on('exit',code=>{clearTimeout(timeout);reject(Error('Chromium exited '+code+': '+log));});
      child.stderr.on('data',()=>{const match=log.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
    });
    const socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let next=0;const pending=new Map();
    socket.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);clearTimeout(waiter.timer);message.error?waiter.reject(Error(JSON.stringify(message.error))):waiter.resolve(message.result);};
    const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,sessionId}));});
    return {send,close:async()=>{try{await send('Browser.close');}catch{}socket.close();child.kill();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Browser closed'));}await sleep(150);fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}};
  } catch(error) {child.kill();fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});throw error;}
}


async function main(){
 const options={},args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){assert.ok(['--out','--browser'].includes(args[i])&&args[i+1],'Unknown or missing argument');options[args[i].slice(2)]=args[i+1];}
 const out=path.resolve(options.out||path.join(root,'.build/terre-ui-font'));fs.mkdirSync(out,{recursive:true});
 const allowed=new Set(['timeline.css','timeline-theme.css','toolbar.css','tools.css','update-check.js']);
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://localhost');let file;
  if(url.pathname==='/')file=path.join(here,'fixtures/terre-ui-font.html');
  else if(url.pathname.startsWith('/browser/')&&allowed.has(url.pathname.slice(9)))file=path.join(root,url.pathname.slice(1));
  if(!file){response.statusCode=404;response.end();return;}
  response.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');response.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await launchBrowser(findBrowser(options.browser));
  for(const mode of ['combined','toolbar','tools']){
   const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
   try{
    const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params)=>browser.send(method,params,sessionId);
    await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1200,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?mode=${mode}`});
    let report;const deadline=Date.now()+30000;
    while(Date.now()<deadline){const result=await send('Runtime.evaluate',{expression:'window.terreUiFontResult',returnByValue:true});report=result.result?.value;if(report)break;await sleep(50);}
    assert.ok(report,'UI font fixture timed out');report.browser=await browser.send('Browser.getVersion');
    fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(report,null,2)+'\n');
    const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,mode+'.png'),Buffer.from(data,'base64'));
    validateUiFontReport(report);console.log(`PASS ${mode}: ${report.phases.length} host states, ${report.phases[0].nodes.length} UI nodes each`);
   }finally{await browser.send('Target.closeTarget',{targetId});}
  }
  console.log('Terre UI font inheritance passed: '+out);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});

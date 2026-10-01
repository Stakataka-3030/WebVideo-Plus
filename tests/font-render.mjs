// Dependency-free Chromium/Edge CSS + font regression. Node 22+.
// node tests/font-render.mjs --runtime package/runtime/web [--baseline OLD_RUNTIME]
//   [--browser /path/to/chromium] [--out .build/font-render]
// This fixture uses actual runtime CSS but does not boot the game. The separate
// font-render-native.ps1 test exercises the Windows WebView2 export pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(here,'fixtures/font-render');
const sampleIds=['zh','zhHant','ja','digits','latin','wrap','explicitBreak','rounded'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function runtimeStyles(root) {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const links=[...html.matchAll(/<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi)];
  assert.equal(links.length,1,'Expected one pinned runtime stylesheet');
  const cssPath=links[0][1].replace(/^\.\//,'').replace(/^\//,'');
  assert.ok(!cssPath.split('/').includes('..'),'Runtime CSS must be local');
  const css=fs.readFileSync(path.join(root,cssPath),'utf8');
  const faces=[...css.matchAll(/@font-face\s*\{([^}]+)\}/gi)];
  const face=faces.find(match=>/font-family\s*:\s*["']?WebgalUI["']?\s*;/i.test(match[1]));
  assert.ok(face,'Missing WebgalUI @font-face');
  const url=/url\(\s*["']?([^"')]+)["']?\s*\)/.exec(face[1])?.[1];
  assert.ok(url&&!/^(?:\w+:|\/\/)/.test(url),'Expected local WebgalUI font');
  const fontPath=path.resolve(root,path.dirname(cssPath),url);
  assert.ok(fontPath.startsWith(path.resolve(root)+path.sep),'Font must be inside runtime');
  const bytes=fs.readFileSync(fontPath);
  return {cssPath,font:path.relative(root,fontPath).replaceAll('\\','/'),fontSha256:sha256(bytes),fontBytes:bytes.length};
}

export function validateMeasurement(report,{allowExistingFallback=false}={}) {
  assert.equal(report.ok,true,report.error||'Fixture did not finish');
  assert.deepEqual(report.viewport,{width:1920,height:1080});
  for(const id of sampleIds) {
    const sample=report.samples[id];assert.ok(sample,`Missing sample ${id}`);
    assert.ok(sample.advance>0,`${id} has no measurable text`);
    assert.ok(sample.lines.length>=1,`${id} has no lines`);
    assert.ok(sample.scrollWidth<=sample.clientWidth+1,`${id} has horizontal overflow`);
    assert.ok(sample.box.y+sample.box.height<710,`${id} overlaps dialogue`);
    for(const line of sample.lines) assert.ok(line.width<=sample.clientWidth+1,`${id} line is too wide`);
    assert.ok(report.platformFonts[id]?.length,`${id} has no rendered platform font`);
    if(!allowExistingFallback) for(const font of report.platformFonts[id]) assert.equal(font.isCustomFont,true,`${id} silently fell back to ${font.familyName}`);
  }
  assert.equal(report.samples.explicitBreak.lines.length,2,'Explicit line break changed');
  assert.ok(report.samples.wrap.lines.length>=2,'Wrapping fixture no longer wraps');
  for(const id of ['zh','zhHant','ja','digits','latin','wrap','explicitBreak','dialogue','speaker']) {
    assert.match(report.samples[id].font,/WebgalUI/,`${id} is not exercising the UI face`);
    assert.ok(report.platformFonts[id]?.length,`${id} has no rendered font`);
    if(!allowExistingFallback) for(const font of report.platformFonts[id]) assert.equal(font.isCustomFont,true,`${id} uses fallback ${font.familyName}`);
  }
  const dialogue=report.samples.dialogue;
  assert.ok(dialogue.scrollWidth<=dialogue.clientWidth+1,'Dialogue clips horizontally');
  assert.ok(dialogue.scrollHeight<=dialogue.clientHeight+1,'Dialogue clips vertically');
  assert.equal(dialogue.layers.length,2);
  for(const layer of dialogue.layers) {
    assert.ok(layer.x>=0&&layer.y>=710,'Dialogue outside expected stage area');
    assert.ok(layer.x+layer.width<=1920&&layer.y+layer.height<=1080,'Dialogue leaves frame');
  }
  return true;
}

export function compareMeasurements(before,after) {
  const comparison={};
  for(const id of sampleIds) {
    const old=before.samples[id], current=after.samples[id];
    comparison[id]={oldAdvance:old.advance,newAdvance:current.advance,advanceChangePercent:100*(current.advance/old.advance-1),oldLines:old.lines.map(line=>line.text),newLines:current.lines.map(line=>line.text)};
    // This replacement is intentionally not pixel-identical. Catch severe layout
    // regressions while reporting exact mixed Latin/numeric wrap differences.
    assert.ok(Math.abs(comparison[id].advanceChangePercent)<15,`${id} advance changed by >=15%`);
    assert.ok(Math.abs(current.lines.length-old.lines.length)<=1,`${id} gained/lost more than one line`);
  }
  assert.ok(Math.abs(comparison.rounded.advanceChangePercent)<0.01,'Unchanged rounded font control moved');
  assert.deepEqual(comparison.rounded.oldLines,comparison.rounded.newLines,'Rounded font wrapping changed');
  if(before.samples.extended&&after.samples.extended) comparison.extended={reportedOnly:true,note:'The replacement is not a Unicode coverage superset; platform fallback is expected for some extended Latin/Cyrillic/subscript/superscript glyphs.',oldAdvance:before.samples.extended.advance,newAdvance:after.samples.extended.advance,oldFonts:before.platformFonts.extended,newFonts:after.platformFonts.extended};
  return comparison;
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

async function render(browser,runtime,label,out) {
  const styles=runtimeStyles(runtime);
  const requests=[];
  const server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const type={'.css':'text/css','.html':'text/html','.json':'application/json','.ttf':'font/ttf','.otf':'font/otf'};
    try {
      if(pathname==='/') {response.setHeader('Content-Type','text/html; charset=utf-8');response.end(fs.readFileSync(path.join(fixture,'specimen.html'),'utf8').replace('__RUNTIME_CSS__','/runtime/'+styles.cssPath));return;}
      const file=pathname==='/samples.json'?path.join(fixture,'samples.json'):pathname.startsWith('/runtime/')?path.resolve(runtime,pathname.slice(9)):null;
      assert.ok(file&&(pathname==='/samples.json'||file.startsWith(path.resolve(runtime)+path.sep)),'Invalid request');
      response.setHeader('Content-Type',(type[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');response.end(fs.readFileSync(file));requests.push({path:pathname,status:200});
    } catch {requests.push({path:pathname,status:404});response.statusCode=404;response.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let targetId;
  try {
    ({targetId}=await browser.send('Target.createTarget',{url:'about:blank'}));
    const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});
    const send=(method,params)=>browser.send(method,params,sessionId);
    await send('Page.enable');await send('DOM.enable');await send('CSS.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    let report;const deadline=Date.now()+30000;
    while(Date.now()<deadline) {const result=await send('Runtime.evaluate',{expression:'globalThis.fontRenderResult',returnByValue:true});report=result.result?.value;if(report)break;await sleep(50);}
    assert.ok(report,'Fixture timed out');assert.equal(report.ok,true,report.error);
    const {root}=await send('DOM.getDocument');report.platformFonts={};
    for(const id of [...sampleIds,'dialogue','speaker','extended']) {
      // CDP only reports fonts for immediate text nodes. Dialogue's visible
      // gradient layers contain the text; querying its wrapper returns [].
      const selector=id==='dialogue'?'#dialogue ._outer_p1zxt_64':'#'+id;
      const {nodeIds}=await send('DOM.querySelectorAll',{nodeId:root.nodeId,selector});
      assert.equal(nodeIds.length,id==='dialogue'?2:1,`Missing text-bearing node: ${id}`);
      const collected=[];
      for(const nodeId of nodeIds) {
        const {fonts}=await send('CSS.getPlatformFontsForNode',{nodeId});
        assert.ok(fonts.length,`No rendered font in ${id} text layer`);collected.push(...fonts);
      }
      report.platformFonts[id]=collected;
    }
    report.runtime=styles;report.browser=await browser.send('Browser.getVersion');report.requests=requests;
    const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(data,'base64'));
    fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2)+'\n');
    assert.ok(requests.some(request=>request.path==='/runtime/'+styles.font),'UI font was not requested');
    assert.ok(!requests.some(request=>request.status!==200&&request.path!=='/favicon.ico'),'Runtime asset request failed');
    // The legacy OPPO font already used system fallback for Japanese; record
    // that baseline accurately without weakening replacement coverage checks.
    validateMeasurement(report,{allowExistingFallback:label==='baseline'});return report;
  } finally {if(targetId)await browser.send('Target.closeTarget',{targetId});await new Promise(resolve=>server.close(resolve));}
}

async function main() {
  const args=process.argv.slice(2),options={};
  for(let index=0;index<args.length;index+=2){assert.ok(['--runtime','--baseline','--browser','--out'].includes(args[index])&&args[index+1],'Unknown/missing option '+args[index]);options[args[index].slice(2)]=args[index+1];}
  const runtime=path.resolve(options.runtime||path.join(here,'../package/runtime/web'));
  const out=path.resolve(options.out||path.join(here,'../.build/font-render'));fs.mkdirSync(out,{recursive:true});
  const browser=await launchBrowser(findBrowser(options.browser));
  try {
    const expected=JSON.parse(fs.readFileSync(path.join(here,'../build/dependencies.lock.json'),'utf8')).sourceHanSans;
    assert.equal(runtimeStyles(runtime).fontSha256,expected.sha256,'Replacement runtime font hash differs from dependency lock');
    const result=await render(browser,runtime,'replacement',out);
    if(options.baseline) {const before=await render(browser,path.resolve(options.baseline),'baseline',out);const comparison=compareMeasurements(before,result);fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(comparison,null,2)+'\n');console.log(JSON.stringify(comparison,null,2));}
    console.log(`Font rendering passed: ${result.runtime.font}; screenshots and metrics: ${out}`);
  } finally {await browser.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exitCode=1;});

/** Optional real-Chromium regression runner; does not claim native Windows acceptance.
 * npm install --no-save playwright (in your test tool environment), then:
 * node craft/tests/render-native-layout.mjs --out /absolute/evidence/directory
 * CHROMIUM_PATH may name an already installed Chromium. Never uploads evidence.
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../..',import.meta.url));
const at=process.argv.indexOf('--out');
if(at<0||!path.isAbsolute(process.argv[at+1]||''))throw Error('--out must be an explicit absolute evidence directory');
const out=process.argv[at+1];await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!/^\/craft\/(ui|features|tests\/ui-fixture)\//.test(name)||name.split('/').includes('..'))throw Error('not found');
    const file=path.join(root,name),content=await fs.readFile(file);
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(content);
  }catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const evidence=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/craft/tests/ui-fixture/index.html`;
  await page.goto(url);await page.waitForFunction(()=>window.fixtureUI?.state().mounted);
  const triggers={id:'batchMenu',expression:'batchMenu',next:'batchMenu',exits:'batchMenu',filter:'batchMenu',filterEdit:'batchMenu',selection:'productionMenu',checks:'productionMenu',backups:'productionMenu',anogo:'productionMenu',novel:'productionMenu',timing:'productionMenu',music:'mediaMenu',export:'mediaMenu',characterMap:'settingsMenu',ai:'settingsMenu',updates:'settingsMenu'};
  async function openTool(id){
    if(id==='presets'||id==='hint')await page.locator(`[data-wvc-entry="${id}"]`).click();
    else{await page.locator(`[data-wvc-entry="${triggers[id]}"]`).click();await page.locator(`.wvc-menu [data-wvc-tool="${id}"]`).click()}
    await page.waitForFunction(id=>window.fixtureUI.state().open&&window.fixtureUI.state().tool===id,id);
  }
  async function capture(name){await page.screenshot({path:path.join(out,name+'.png')});}
  async function bounds(){return page.evaluate(()=>{
    const rect=selector=>{const {x,y,width,height}=document.querySelector(selector).getBoundingClientRect();return{x,y,width,height}};
    return{dock:rect('.wvc-dock'),editor:rect('[data-tour="editor-area"]'),preview:rect('.native-preview'),body:{width:document.body.scrollWidth,height:document.body.scrollHeight},bottom:document.querySelector('.wvc-dock-host').classList.contains('wvc-dock-bottom'),viewport:{width:innerWidth,height:innerHeight}};
  })}
  for(const [width,height] of [[1752,1108],[1280,800],[1024,768],[960,720]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>fixtureUI.close());await capture(`${width}x${height}-closed`);
    await openTool('expression');await page.waitForTimeout(100);const b=await bounds();
    assert.ok(b.editor.width>=220&&b.editor.height>=180,JSON.stringify(b));
    assert.ok(b.dock.x>=b.preview.x+b.preview.width-1,'dock must not cover preview');
    if(b.bottom)assert.ok(b.editor.y+b.editor.height<=b.dock.y+1,'bottom dock must not cover editor');
    else assert.ok(b.editor.x+b.editor.width<=b.dock.x+1,'side dock must not cover editor');
    assert.ok(b.dock.x+b.dock.width<=width+1&&b.dock.y+b.dock.height<=height+1,'dock remains inside viewport');
    assert.equal(await page.locator('dialog').count(),0);
    assert.equal(await page.getByRole('button',{name:'撤销',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'重做',exact:true}).count(),0);
    await capture(`${width}x${height}-expression`);evidence.push({width,height,bounds:b});
  }
  await page.setViewportSize({width:1752,height:1108});
  for(const tool of await page.evaluate(()=>fixtureUI.tools())){
    await openTool(tool.id);assert.equal(await page.locator('.wvc-panel:not([hidden])').count(),1);
    assert.ok(await page.locator('.wvc-dock').isVisible());
    await capture(`tool-${tool.id}`);
  }
  // Host theme variables are OKLCH channel tuples. Invalid raw tuple use becomes transparent.
  const color=await page.locator('.wvc-dock').evaluate(node=>getComputedStyle(node).backgroundColor);
  assert.ok(/^(oklch|rgb)/.test(color)&&color!=='rgba(0, 0, 0, 0)',color);
  // Native EditorDrawer teleports a positioned sheet into the same content anchor.
  await page.evaluate(()=>{const sheet=document.createElement('section');sheet.id='fixture-native-effect-drawer';sheet.style.cssText='position:absolute;right:0;top:0;width:432px;height:120px';document.querySelector('.wvc-dock-host').append(sheet)});
  await openTool('expression');
  const nativeDrawer=await page.locator('#fixture-native-effect-drawer').evaluate(node=>({width:node.getBoundingClientRect().width,owned:node.classList.contains('wvc-native-editor-layout')}));
  assert.equal(nativeDrawer.width,432);assert.equal(nativeDrawer.owned,false);
  await page.locator('#fixture-native-effect-drawer').evaluate(node=>node.remove());
  await openTool('expression');await page.getByRole('button',{name:'选择范围…',exact:true}).click();
  await page.getByRole('button',{name:'全选当前筛选',exact:true}).click();await page.getByRole('button',{name:'使用所选范围',exact:true}).click();
  assert.equal(await page.evaluate(()=>fixtureUI.state().tool),'expression');assert.ok(await page.evaluate(()=>fixtureUI.state().selected.length)>1);
  await page.getByRole('button',{name:'关闭工具面板',exact:true}).click();assert.equal(await page.locator('.wvc-dock').isVisible(),false);
  await openTool('id');await page.getByRole('button',{name:'预览全场补全',exact:true}).click();
  await page.waitForFunction(()=>fixtureUI.state().pending);await page.evaluate(()=>fixtureChangeScene());
  await page.waitForFunction(()=>!fixtureUI.state().pending);assert.equal(await page.getByRole('button',{name:'应用到编辑缓冲区',exact:true}).isEnabled(),false);
  // Vue-like header replacement and repeated remount cannot duplicate entry points.
  await page.evaluate(()=>{const header=document.querySelector('#app>.native-header');for(const node of header.querySelectorAll('[data-wvc-entry]'))node.remove();const copy=header.cloneNode(true);header.replaceWith(copy)});
  await page.waitForFunction(()=>document.querySelectorAll('[data-wvc-entry="mediaMenu"]').length===1);
  assert.equal(await page.locator('[data-wvc-entry="batchMenu"]').count(),1);
  await page.evaluate(()=>document.documentElement.classList.add('dark'));await openTool('filter');await capture('1752x1108-dark-filter');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'layout-results.json'),JSON.stringify({passed:true,scope:'Isolated DOM/Chromium fixture only; not actual Windows Craft',evidence,tools:await page.evaluate(()=>fixtureUI.tools())},null,2));
  console.log(`Passed Chromium fixture checks; inspect actual PNGs in ${out}. Native Windows compatibility remains a separate check.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

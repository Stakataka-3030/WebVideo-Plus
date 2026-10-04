/** Optional real-Chromium visual fixture; not Windows Craft acceptance. */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../..',import.meta.url)),at=process.argv.indexOf('--out'),out=process.argv[at+1];
if(at<0||!path.isAbsolute(out||''))throw Error('--out requires an absolute evidence path');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!/^\/craft\/(ui|features|tests\/export-fixture)\//.test(name)||name.split('/').includes('..'))throw Error('not found');const content=await fs.readFile(path.join(root,name));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(content)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height] of [[1280,800],[960,720],[640,720]])for(const dark of [false,true]){
  await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${server.address().port}/craft/tests/export-fixture/index.html`);if(dark)await page.locator('html').evaluate(n=>n.classList.add('dark'));
  await page.screenshot({path:path.join(out,`${width}x${height}-${dark?'dark':'light'}-platform.png`)});
  for(const kind of ['full','stage','dialog','audio']){
   await page.locator(`[data-wvc-export-kind="${kind}"]`).click();const dialog=page.getByRole('dialog');
   const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
   assert.equal(await page.locator('.wvc-export-form').count(),1);await page.getByRole('button',{name:'加入导出队列',exact:true}).scrollIntoViewIfNeeded();
   assert.ok(await page.getByRole('button',{name:'加入导出队列',exact:true}).isVisible());await page.getByRole('button',{name:'← 返回导出类型'}).scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`${width}x${height}-${dark?'dark':'light'}-${kind}.png`)});await page.getByRole('button',{name:'← 返回导出类型'}).click();
   assert.equal(await page.locator('.native-platforms').isVisible(),true);assert.equal(await page.locator('[data-wvc-export-kind]').count(),4);
  }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,scope:'isolated HTML/Chromium fixture; not Windows Craft'}));
}finally{await browser?.close();await new Promise(r=>server.close(r))}

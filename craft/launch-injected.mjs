// Local proof of concept: inject one export button into a released Craft
// WebView2 window and connect Craft's own Web export to the WebVideo+ kernel.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.join(here, 'craft-injection.log');
const report = data => {
  fs.appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...data })}\n`);
  console.log(JSON.stringify(data));
};
const option = key => { const at = process.argv.indexOf(key); return at >= 0 ? process.argv[at + 1] : undefined; };
const craft = option('--craft');
const kernel = option('--kernel');
if (!craft || !kernel || !fs.existsSync(craft) || !fs.existsSync(kernel)) throw Error('需要 --craft EXE 和 --kernel WebGAL.Video.exe');
const test = option('--test-config') ? JSON.parse(fs.readFileSync(option('--test-config'), 'utf8')) : undefined;
const autoClick = process.argv.includes('--auto-click');
const exitAfterJob = process.argv.includes('--exit-after-job');
const profile = option('--profile');
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const port = await freePort();
const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}` };
if (profile) env.WEBVIEW2_USER_DATA_FOLDER = profile;
const app = spawn(craft, [], { cwd: path.dirname(craft), env, windowsHide: true, stdio: 'ignore' });
let socket;
let lastJobResult = 1;
let nextId = 0;
const pending = new Map();
function call(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function notify(state, message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  await call('Runtime.evaluate', { expression: `window.__wvCraftNotify?.(${JSON.stringify({ state, message })})` }).catch(() => {});
}
async function runJob(job) {
  const work = `${job.output}.native-work-${crypto.randomUUID()}`;
  const args = ['export', '--project', job.site, '--scene', job.scene, '--out', job.output,
    '--work-dir', work, '--width', String(job.width), '--height', String(job.height),
    '--fps', String(job.fps), '--workers', String(job.workers)];
  const child = spawn(kernel, args, { cwd: path.dirname(kernel), windowsHide: true, stdio: 'ignore' });
  const poll = setInterval(() => {
    try {
      const status = JSON.parse(fs.readFileSync(path.join(work, 'status.json'), 'utf8'));
      void notify(status.state, status.message || status.phase);
    } catch { /* status is written after initial preparation */ }
  }, 500);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', exitCode => resolve(exitCode));
  }).catch(error => { console.error(error.message); return -1; });
  clearInterval(poll);
  let status;
  try { status = JSON.parse(fs.readFileSync(path.join(work, 'status.json'), 'utf8')); } catch { status = {}; }
  const success = code === 0 && status.state === 'completed' && fs.existsSync(job.output);
  if (success) {
    const site = path.resolve(job.site);
    const output = path.resolve(job.output);
    if (path.dirname(site) === path.dirname(output) && site.startsWith(`${output}.craft-site-`)) {
      try { fs.rmSync(site, { recursive: true }); }
      catch (error) { report({ cleanupWarning: error.message, site }); }
    }
  }
  lastJobResult = success ? 0 : 1;
  await notify(success ? 'completed' : 'failed', success ? '视频导出完成' : (status.message || `导出失败，日志：${work}`));
  report({ state: success ? 'completed' : 'failed', frames: status.totalFrames, output: job.output, work });
  if (exitAfterJob) {
    app.kill();
    socket.close();
    process.exitCode = lastJobResult;
  }
}
async function connect() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && app.exitCode === null) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find(item => item.type === 'page' && item.url.startsWith('http://tauri.localhost'));
      if (target) return target.webSocketDebuggerUrl;
    } catch { /* WebView2 is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw Error('Craft WebView2 页面未启动');
}
try {
  const websocketUrl = await connect();
  socket = new WebSocket(websocketUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (packet.id && pending.has(packet.id)) {
      const waiter = pending.get(packet.id); pending.delete(packet.id);
      if (packet.error) waiter.reject(Error(packet.error.message)); else waiter.resolve(packet.result);
    }
    if (packet.method === 'Runtime.consoleAPICalled') {
      const values = packet.params?.args || [];
      if (values[0]?.value === '__WV_CRAFT_JOB__' && typeof values[1]?.value === 'string') {
        void runJob(JSON.parse(values[1].value));
      }
    }
  });
  await call('Page.enable');
  await call('Runtime.enable');
  const injection = `${test ? `window.__WV_CRAFT_TEST_CONFIG=${JSON.stringify(test)};` : ''}\n${fs.readFileSync(path.join(here, 'inject-ui.js'), 'utf8')}`;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: injection });
  await call('Runtime.evaluate', { expression: injection });
  if (autoClick) {
    let mounted = false;
    for (let attempt = 0; attempt < 40 && !mounted; attempt++) {
      const value = await call('Runtime.evaluate', { expression: 'Boolean(document.querySelector("[data-webvideo-craft=export]"))', returnByValue: true });
      mounted = value.result?.value === true;
      if (!mounted) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!mounted) throw Error('导出按钮未挂载');
    await call('Runtime.evaluate', { expression: 'document.querySelector("[data-webvideo-craft=export]").click()' });
  }
  report({ injected: true, port, pid: app.pid });
  app.once('exit', () => { socket.close(); process.exitCode = lastJobResult; });
} catch (error) {
  report({ state: 'failed', message: error.message });
  console.error(error.message);
  app.kill();
  process.exitCode = 1;
}

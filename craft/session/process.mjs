import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';

export async function waitForExit(child, milliseconds) {
 if (!child || !child.pid || child.exitCode !== null || child.signalCode) return true;
 return new Promise(resolve => {
  const exited = () => finish(true);
  const timer = setTimeout(() => finish(false), milliseconds);
  function finish(value) { clearTimeout(timer); child.removeListener('exit', exited); resolve(value); }
  child.once('exit', exited);
  if (child.exitCode !== null || child.signalCode) finish(true);
 });
}

// The packaged guard creates its child suspended, assigns a kill-on-close Job
// Object, then resumes it. Killing the owned guard closes the entire service tree.
export function spawnService(kernel, args, options) {
 if (process.platform !== 'win32') return spawn(kernel, args, options);
 return spawn(path.join(path.dirname(kernel), 'process-guard.exe'), [String(process.pid), kernel, ...args], options);
}

export async function ownsService(child, pid) {
 if (!Number.isSafeInteger(pid) || pid <= 0) return false;
 if (child.pid === pid) return true;
 if (process.platform !== 'win32') return false;
 const script = '$p=' + pid + ';$owner=' + child.pid + ';for($i=0;$i -lt 20 -and $p -gt 0;$i++){if($p -eq $owner){exit 0};$row=Get-CimInstance Win32_Process -Filter ("ProcessId="+$p);if(!$row){exit 1};$p=$row.ParentProcessId};exit 1';
 try { await promisify(execFile)('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {timeout:10000,windowsHide:true}); return true; }
 catch { return false; }
}

export async function terminateService(child, graceMs=3000) {
 if (await waitForExit(child, graceMs)) return;
 child.kill();
 if (!await waitForExit(child, 5000)) throw Error('Craft 内核尚未退出，请等待后重试');
}

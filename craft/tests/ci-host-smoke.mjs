// Real, unchanged official host. Execution is restricted to a disposable hosted
// Windows CI runner. Importing this file is inert; unit tests exercise guards only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {verifyPackage, assertNoLinks, fileHash} from '../installer/transaction.mjs';
import {CdpConnection} from '../session/rpc.mjs';
import {safeText, processFailure, failureSummary, targetSummary, lifecycleSummary, nativeLogSummary} from './ci-host-diagnostics.mjs';

const execute = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OFFICIAL_HOST_SHA256 = '0de472c44f642c8f140e16bcc040a171519af59d245ae88b1b4a47987cf2756c';
// CIM CreationDate has microsecond precision; Process.StartTime has 100 ns.
// Compare the exact common precision, never a loose time window.
export const PROCESS_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.ffffff'Z'";
export function assertHostedWindows(env = process.env, platform = process.platform) {
  assert.equal(platform, 'win32', 'Windows CI only');
  assert.equal(env.GITHUB_ACTIONS, 'true', 'GitHub Actions only; never run on a personal computer');
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted', 'A disposable GitHub-hosted runner is required');
  assert.equal(env.RUNNER_OS, 'Windows');
  assert.equal(env.WEBVIDEO_CRAFT_HOST_SMOKE, '1', 'Explicit CI host-smoke opt-in is required');
  assert.match(env.GITHUB_RUN_ID || '', /^\d+$/);
  for (const key of ['RUNNER_TEMP', 'GITHUB_WORKSPACE']) assert.ok(env[key], 'Missing ' + key);
}
export function childPath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Path must be inside the owned test root');
  return path.resolve(candidate);
}
export function validateLease(lease, wrapperPid, original) {
  assert.equal(lease.schemaVersion, 1);
  assert.equal(lease.wrapperPid, wrapperPid, 'Lease belongs to the launched original-name entry');
  assert.equal(path.resolve(lease.hostExe).toLowerCase(), path.resolve(original).toLowerCase());
  assert.match(lease.sessionId || '', /^[0-9a-f-]{36}$/);
  for (const key of ['hostPid', 'coordinatorPid']) assert.ok(Number.isSafeInteger(lease[key]) && lease[key] > 0);
  return lease;
}
export function validateListener(result, port, hostPid) {
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
  assert.ok(Number.isSafeInteger(hostPid) && hostPid > 0);
  assert.equal(result.schemaVersion, 1); assert.equal(result.verified, true);
  assert.equal(result.source, 'native-listener-table');
  assert.equal(result.port, port); assert.equal(result.hostPid, hostPid);
  assert.ok(Number.isSafeInteger(result.ownerPid) && result.ownerPid > 0);
  assert.ok(Array.isArray(result.addresses) && result.addresses.length > 0);
  assert.ok(result.addresses.every(address => address === '127.0.0.1' || address === '::1'));
  assert.equal(new Set(result.addresses).size, result.addresses.length);
}
export function selectTarget(targets, port) {
  const matches = targets.filter(target => {
    try { return target.type === 'page' && new URL(target.url).origin === 'http://tauri.localhost'; } catch { return false; }
  });
  assert.equal(matches.length, 1, 'Require exactly one official Craft page');
  const target = matches[0], ws = new URL(target.webSocketDebuggerUrl);
  assert.equal(ws.protocol, 'ws:');
  assert.ok(['127.0.0.1', 'localhost'].includes(ws.hostname));
  assert.equal(Number(ws.port), port); assert.equal(ws.username, ''); assert.equal(ws.password, '');
  return target;
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
// The producer can still be appending. Only newline-terminated events count.
const readLines = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(0, -1).filter(Boolean) : [];
const events = file => readLines(file).map(line => JSON.parse(line));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitUntil(description, probe, timeout = 90000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = await probe(); if (value) return value; await delay(250); }
  throw Error('Timed out: ' + description);
}
export async function powershell(script) {
  const encoded = Buffer.from("$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" + script, 'utf16le').toString('base64');
  const result = await diagnosticExecute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], 20000);
  return result.stdout.trim() ? JSON.parse(result.stdout.replace(/^\uFEFF/, '')) : null;
}
export async function diagnosticExecute(file, args, timeoutMs) {
  const started = Date.now(), signal = AbortSignal.timeout(timeoutMs);
  try { return await execute(file, args, {windowsHide: true, signal, maxBuffer: 8 * 1024 * 1024}); }
  catch (error) {
    const failure = new Error('Diagnostic subprocess failed; see structured process failure');
    failure.processFailure = processFailure(error, {timedOut: signal.aborted && signal.reason?.name === 'TimeoutError', elapsedMs: Date.now() - started, timeoutMs});
    throw failure;
  }
}
export async function processes(includeCommandLine = false) {
  const result = await powershell(`@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,${includeCommandLine ? 'CommandLine,' : ''}@{n="Started";e={if($_.CreationDate){$_.CreationDate.ToUniversalTime().ToString("${PROCESS_TIME_FORMAT}")}else{""}}}) | ConvertTo-Json -Compress`);
  return Array.isArray(result) ? result : result ? [result] : [];
}
export function descendants(rows, rootPid) {
  const ids = new Set([rootPid]), byPid = new Map(rows.map(row => [row.ProcessId, row]));
  const validTime = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value || '');
  // A Windows parent PID can survive the parent and then be reused. A child
  // predating the currently observed parent cannot belong to that process.
  for (let i = 0; i < rows.length; i++) for (const row of rows) {
    const parent = byPid.get(row.ParentProcessId);
    if (ids.has(row.ParentProcessId) && parent && validTime(row.Started) && validTime(parent.Started) && row.Started >= parent.Started) ids.add(row.ProcessId);
  }
  return rows.filter(row => ids.has(row.ProcessId));
}
export async function actOnOwnedProcess(row, action) {
  assert.ok(['close', 'kill'].includes(action));
  const payload = Buffer.from(JSON.stringify({ProcessId: row.ProcessId, Started: row.Started, ExecutablePath: row.ExecutablePath})).toString('base64');
  return powershell(`$r=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json;try{$p=[Diagnostics.Process]::GetProcessById([int]$r.ProcessId)}catch{return};try{$null=$p.Handle;if($p.StartTime.ToUniversalTime().ToString("${PROCESS_TIME_FORMAT}")-ne$r.Started -or $p.MainModule.FileName-ne$r.ExecutablePath){throw 'Process identity changed; refusing cleanup'};` +
    (action === 'close' ? '$p.CloseMainWindow()|ConvertTo-Json' : '$p.Kill();$p.WaitForExit(10000)|ConvertTo-Json') + '}finally{$p.Dispose()}');
}

export async function runHostSmoke({packageRoot, hostSource, evidenceRoot}) {
  assertHostedWindows();
  assert.equal(path.resolve(process.env.GITHUB_WORKSPACE).toLowerCase(), repo.toLowerCase());
  const versions = readJson(path.join(repo, 'craft/version.json'));
  assert.equal(path.resolve(packageRoot).toLowerCase(), path.join(repo, 'dist', 'WebVideoCraft-Setup-' + versions.installerVersion).toLowerCase());
  childPath(process.env.RUNNER_TEMP, hostSource); childPath(repo, evidenceRoot);
  assertNoLinks(hostSource); assert.equal(fileHash(hostSource), OFFICIAL_HOST_SHA256);
  const manifest = verifyPackage(packageRoot);
  assert.ok(manifest.supportedHosts.some(host => host.version === '1.0.0' && host.sha256 === OFFICIAL_HOST_SHA256));
  const prior = await processes();
  assert.ok(!prior.some(p => /^(webgal-craft(?:\.webvideo-original)?|WebVideoCraft\.Launcher)\.exe$/i.test(p.Name)), 'CI runner already has a Craft host; do not interfere');
  const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'webvideo-craft-host-smoke-'));
  fs.writeFileSync(path.join(root, '.owned-ci-host-smoke'), crypto.randomUUID());
  fs.mkdirSync(evidenceRoot, {recursive: true});
  const host = path.join(root, 'host/webgal-craft.exe'), original = path.join(root, 'host/webgal-craft.webvideo-original.exe'), adapter = path.join(root, 'adapter');
  fs.mkdirSync(path.dirname(host)); fs.copyFileSync(hostSource, host);
  const report = {schemaVersion: 1, status: 'RUNNING', hostSha256: OFFICIAL_HOST_SHA256, manifestSha256: manifest.manifestSha256,
    packageVersion: manifest.version, startedAt: new Date().toISOString(), scope: 'Real host startup, verified injection and normal-close lifecycle only',
    editor: 'NOT_RUN', preview: 'NOT_RUN', export: 'NOT_RUN', officialNsis: 'NOT_RUN', checks: [], cleanup: [],
    diagnostics: {targetSamples: [], hostStates: [], collectionErrors: [], limits: {targetSamples: 18, targetRowsPerSample: 32, nativeLogBytes: 65536}, nativeStdoutStderrCaptured: false}};
  let wrapper, wrapperExit, lease, cdp, owned = [], failure;
  let nextTargetSampleAt = 0;
  const nativeLog = path.join(process.env.LOCALAPPDATA, 'com.akirami.webgalcraft/logs/WebGAL Craft.log');
  const nativeLogBefore = fs.existsSync(nativeLog) ? fs.statSync(nativeLog).size : 0;
  const state = path.join(adapter, 'state'), leaseFile = path.join(state, 'session.json');
  const sessionLogPath = () => lease ? childPath(state, path.join(state, 'sessions', lease.sessionId, 'session.log')) : null;
  const prepared = path.join(evidenceRoot, 'prepared-inputs.json');
  if (fs.existsSync(prepared)) report.diagnostics.preparedWebView2Version = safeText(readJson(prepared).webView2Version, 80);
  const record = (name, value = true) => { assert.ok(value, name); report.checks.push({name, passed: true}); };
  async function sampleTargets(phase, force = false) {
    if (!lease || report.diagnostics.targetSamples.length >= 18 || !force && Date.now() < nextTargetSampleAt) return;
    nextTargetSampleAt = Date.now() + 2000;
    const started = events(sessionLogPath()).find(event => event.event === 'host-started');
    if (!started) return;
    assert.equal(started.hostPid, lease.hostPid); assert.ok(Number.isInteger(started.port) && started.port > 0 && started.port <= 65535);
    const sample = {at: new Date().toISOString(), phase, port: started.port, hostPid: lease.hostPid, owner: {verified: false}, endpointAttempted: false};
    report.diagnostics.targetSamples.push(sample);
    try {
      // Diagnostic GETs are allowed only after the same strict native ownership
      // verification. This never supplies a target or extends production waits.
      const verified = await diagnosticExecute(path.join(packageRoot, manifest.wrapper), ['--verify-listener', String(started.port), String(lease.hostPid)], 5000);
      const owner = JSON.parse(verified.stdout); validateListener(owner, started.port, lease.hostPid);
      sample.owner = {verified: true, source: owner.source, ownerPid: owner.ownerPid, addresses: owner.addresses};
      sample.endpointAttempted = true;
      const response = await fetch(`http://127.0.0.1:${started.port}/json/list`, {signal: AbortSignal.timeout(1500), redirect: 'error'});
      sample.httpStatus = response.status;
      if (!response.ok) { sample.endpointError = 'non-success HTTP response'; return; }
      const text = await response.text(); if (Buffer.byteLength(text) > 131072) throw Error('Target response exceeded diagnostic bound');
      let targets; try { targets = JSON.parse(text); } catch { throw Error('Target endpoint returned invalid JSON'); }
      sample.result = targetSummary(targets);
      if (!report.diagnostics.browserVersion) {
        const version = await fetch(`http://127.0.0.1:${started.port}/json/version`, {signal: AbortSignal.timeout(1500), redirect: 'error'});
        if (version.ok) {
          const raw = await version.text(); if (Buffer.byteLength(raw) > 32768) throw Error('Version response exceeded diagnostic bound');
          let value; try { value = JSON.parse(raw); } catch { throw Error('Version endpoint returned invalid JSON'); }
          report.diagnostics.browserVersion = {
            browser: /^[A-Za-z][A-Za-z0-9 -]{0,30}\/[0-9][0-9A-Za-z.+_-]{0,50}$/.test(value.Browser) ? value.Browser : '<unrecognized-version-format>',
            protocol: /^\d{1,3}\.\d{1,3}$/.test(value['Protocol-Version']) ? value['Protocol-Version'] : '<unrecognized-version-format>'};
        }
      }
    } catch (error) { sample.failure = failureSummary(error); }
  }
  async function captureFailureContext(phase) {
    if (lease) {
      report.diagnostics.lifecycle = lifecycleSummary(events(sessionLogPath()));
      report.diagnostics.launcherStages = readLines(path.join(state, 'logs/launcher.log')).flatMap(line => {
        const at = line.indexOf('WEBVIDEO_CRAFT_STATUS '); if (at < 0) return [];
        try { const event = JSON.parse(line.slice(at + 22)); return [{at: safeText(event.at, 40), stage: safeText(event.stage, 30)}]; } catch { return []; }
      }).slice(-16);
      await sampleTargets(phase, true);
    }
    if (wrapper) {
      const rows = await processes(), tree = descendants(rows, wrapper.pid);
      report.diagnostics.hostStates.push({at: new Date().toISOString(), phase, wrapperExit: wrapperExit || null,
        processes: tree.map(row => ({pid: row.ProcessId, parentPid: row.ParentProcessId, name: safeText(row.Name, 60), started: row.Started,
          ...(row.ProcessId === lease?.hostPid ? {expectedHostPath: row.ExecutablePath?.toLowerCase() === original.toLowerCase()} : {})}))});
    }
    if (!fs.existsSync(nativeLog)) { report.diagnostics.nativeLog = {available: false}; return; }
    assertNoLinks(nativeLog); const size = fs.statSync(nativeLog).size;
    if (size < nativeLogBefore) { report.diagnostics.nativeLog = {available: true, rotatedOrTruncated: true, rawLinesRetained: false}; return; }
    const offset = Math.max(nativeLogBefore, size - 65536), buffer = Buffer.alloc(size - offset), fd = fs.openSync(nativeLog, 'r');
    try { fs.readSync(fd, buffer, 0, buffer.length, offset); } finally { fs.closeSync(fd); }
    report.diagnostics.nativeLog = {available: true, appendedBytes: size - nativeLogBefore, truncated: offset > nativeLogBefore, ...nativeLogSummary(buffer.toString('utf8'))};
  }
  async function manager(action) {
    const args = [path.join(packageRoot, 'craft/installer/manage.mjs'), action, ...(action === 'uninstall' ? ['--state', path.join(adapter, 'config.json')] : ['--package', packageRoot, '--dest', adapter, '--craft', host, '--mode', 'same-name', '--host-version', '1.0.0'])];
    const result = await execute(path.join(packageRoot, manifest.node), args, {windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024});
    const terminal = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)).filter(item => item.type === 'result');
    assert.equal(terminal.length, 1); assert.equal(terminal[0].ok, true);
    return terminal[0];
  }
  try {
    const installed = await manager('install'); record('Complete verified package installed by its shipped CLI', installed.changed);
    record('Exact original preserved', fileHash(original) === OFFICIAL_HOST_SHA256);
    const env = {...process.env, WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview-profile')};
    // Known Folder native settings remain runner-local. Do not claim that these
    // environment overrides isolate the unchanged host on a personal computer.
    for (const name of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) { env[name] = path.join(root, name.toLowerCase()); fs.mkdirSync(env[name], {recursive: true}); }
    wrapper = spawn(host, ['--isolated-test', '--profile', env.WEBVIEW2_USER_DATA_FOLDER], {cwd: path.dirname(host), env, windowsHide: true, stdio: 'ignore'});
    let spawnError; wrapper.once('error', error => { spawnError = error; });
    wrapper.once('exit', (code, signal) => { wrapperExit = {code, signal}; });
    lease = await waitUntil('owned host session', () => {
      if (spawnError) throw spawnError; if (wrapperExit) throw Error('Original-name entry exited before a session was created');
      if (!fs.existsSync(leaseFile)) return null;
      let value; try { value = readJson(leaseFile); } catch (error) { if (error instanceof SyntaxError || error.code === 'ENOENT') return null; throw error; }
      return validateLease(value, wrapper.pid, original);
    });
    owned = descendants(await processes(), wrapper.pid);
    assert.ok(owned.some(p => p.ProcessId === lease.hostPid && p.ExecutablePath?.toLowerCase() === original.toLowerCase()));
    assert.ok(owned.some(p => p.ProcessId === lease.coordinatorPid && p.ParentProcessId === wrapper.pid));
    const sessionLog = childPath(state, path.join(state, 'sessions', lease.sessionId, 'session.log'));
    const launcherLog = path.join(state, 'logs/launcher.log');
    const injected = await waitUntil('real enhanced interface injection', async () => {
      if (wrapperExit) throw Error('Original-name entry exited before injection');
      await sampleTargets('waiting');
      const entries = events(sessionLog), failed = entries.find(e => e.event === 'failed');
      if (failed) throw Error('Craft injection failed: ' + failed.error);
      const ready = readLines(launcherLog).some(line => { const at = line.indexOf('WEBVIDEO_CRAFT_STATUS '); if (at < 0) return false; return JSON.parse(line.slice(at + 22)).stage === 'ready'; });
      const entry = entries.find(e => e.event === 'injected'); return ready && entry ? entry : null;
    });
    record('Native launcher reported ready');
    record('Injected payload returned mounted/UI', injected.result?.mounted === true && injected.result?.ui === true);
    record('Production launcher verified loopback ownership', injected.listener === 'verified-loopback-owned');
    const started = events(sessionLog).find(e => e.event === 'host-started');
    assert.equal(started.hostPid, lease.hostPid); assert.ok(Number.isSafeInteger(started.port) && started.port > 0 && started.port <= 65535);
    owned = descendants(await processes(), wrapper.pid);
    assert.ok(owned.some(p => p.ProcessId === lease.hostPid && p.ExecutablePath?.toLowerCase() === original.toLowerCase()));
    assert.ok(owned.some(p => p.ProcessId === lease.coordinatorPid && p.ParentProcessId === wrapper.pid));
    const listener = await execute(path.join(packageRoot, manifest.wrapper), ['--verify-listener', String(started.port), String(lease.hostPid)], {windowsHide: true, timeout: 15000});
    validateListener(JSON.parse(listener.stdout), started.port, lease.hostPid); record('Independent native listener verification before CDP');
    const response = await fetch(`http://127.0.0.1:${started.port}/json/list`, {signal: AbortSignal.timeout(5000)}); assert.ok(response.ok);
    const target = selectTarget(await response.json(), started.port), socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.close(); reject(Error('CDP connect timeout')); }, 10000); socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once: true}); socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('CDP connection failed')); }, {once: true}); });
    cdp = new CdpConnection(socket);
    const evaluation = await cdp.call('Runtime.evaluate', {expression: `(()=>{const b=window.WebVideoCraftBootstrap;return {origin:location.origin,mounted:b?.mounted===true,ui:b?.ui===true,bridge:typeof window.WebVideoCraftBridge?.snapshot==='function',dom:!!document.querySelector('[data-webvideo-craft="tools"]'),diagnostics:b?.diagnostics?.map(x=>({component:x.component,message:x.message}))||[]};})()`, returnByValue: true});
    assert.ok(!evaluation.exceptionDetails); const actual = evaluation.result?.value;
    record('Actual official WebView contains enhanced bridge and DOM', actual?.origin === 'http://tauri.localhost' && actual.mounted && actual.ui && actual.bridge && actual.dom);
    report.bootstrap = actual; cdp.close(); cdp = null;
    owned = descendants(await processes(), wrapper.pid);
    const hostProcess = owned.find(p => p.ProcessId === lease.hostPid);
    record('Normal close requested for exact owned host', await actOnOwnedProcess(hostProcess, 'close') === true);
    await waitUntil('wrapper exits after normal host close', () => wrapperExit, 45000);
    record('Wrapper exited successfully', wrapperExit.code === 0);
    record('Lease closed', !!readJson(leaseFile).closedAt);
    record('Session lock released', !fs.existsSync(path.join(state, 'session.lock')));
    await waitUntil('owned host/coordinator/WebView descendants exit', async () => !(await processes()).some(p => owned.some(o => p.ProcessId === o.ProcessId && p.Started === o.Started)), 20000);
    record('Owned host/coordinator/WebView descendants exited');
    const detached = await manager('uninstall'); record('Component unmounted', detached.state?.status === 'detached');
    record('Original host restored byte-for-byte', fileHash(host) === OFFICIAL_HOST_SHA256);
    record('Input package unchanged', verifyPackage(packageRoot).manifestSha256 === manifest.manifestSha256);
    record('Official input unchanged', fileHash(hostSource) === OFFICIAL_HOST_SHA256);
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL'; report.error = error.processFailure ? 'Diagnostic subprocess failed' : safeText(error.message);
    report.failure = failureSummary(error); failure = new Error(report.error);
    try { await captureFailureContext('before-cleanup'); } catch (contextError) { report.diagnostics.collectionErrors.push(failureSummary(contextError)); }
  }
  finally {
    cdp?.close();
    if (wrapper && report.status !== 'PASS') {
      // Only the exact spawned tree may be cleaned up. Revalidate executable and
      // creation time through a retained Process handle before each termination.
      try {
        const rows = await processes(), liveWrapper = rows.find(p => p.ProcessId === wrapper.pid && p.ExecutablePath?.toLowerCase() === host.toLowerCase());
        if (liveWrapper) owned = descendants(rows, wrapper.pid);
        else {
          // A previously verified surviving child remains an ownership anchor
          // even after the wrapper exits. Never infer ownership from PID alone.
          const retained = owned.filter(o => rows.some(p => p.ProcessId === o.ProcessId && p.Started === o.Started && p.ExecutablePath === o.ExecutablePath));
          owned = [...new Map(retained.flatMap(p => descendants(rows, p.ProcessId)).map(p => [p.ProcessId, p])).values()];
        }
        for (const row of [...owned].reverse()) {
          if (!rows.some(p => p.ProcessId === row.ProcessId && p.Started === row.Started)) continue;
          try { report.cleanup.push({pid: row.ProcessId, name: safeText(row.Name, 60), killed: await actOnOwnedProcess(row, 'kill')}); }
          catch (error) { report.cleanup.push({pid: row.ProcessId, name: safeText(row.Name, 60), failure: failureSummary(error)}); }
        }
        const remaining = await processes();
        report.diagnostics.remainingOwnedProcesses = owned.filter(row => remaining.some(p => p.ProcessId === row.ProcessId && p.Started === row.Started))
          .map(row => ({pid: row.ProcessId, name: safeText(row.Name, 60)}));
      } catch (error) { report.cleanup.push({failure: failureSummary(error)}); }
    }
    // Do not upload a profile, full native/global logs, environment, projects, or
    // arbitrary runner files. This allowlisted report contains only CI test data.
    const scrub = value => {
      if (typeof value === 'string') return value.split(root).join('<owned-ci-root>').split(root.replaceAll('\\', '\\\\')).join('<owned-ci-root>').split(repo).join('<checkout>');
      if (Array.isArray(value)) return value.map(scrub);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
      return value;
    };
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceRoot, 'host-smoke.json'), JSON.stringify(scrub(report), null, 2) + '\n');
    console.log(JSON.stringify({status: report.status, checks: report.checks.length, editor: report.editor, preview: report.preview, export: report.export, error: report.error}));
  }
  if (failure) throw failure;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [packageRoot, hostSource, evidenceRoot] = process.argv.slice(2);
  if (!packageRoot || !hostSource || !evidenceRoot) throw Error('Usage: node ci-host-smoke.mjs <complete package> <pinned official EXE> <evidence directory>');
  await runHostSmoke({packageRoot: path.resolve(packageRoot), hostSource: path.resolve(hostSource), evidenceRoot: path.resolve(evidenceRoot)});
}

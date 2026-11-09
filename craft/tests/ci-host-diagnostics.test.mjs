// No native process, GUI, network, filesystem mutation, or host execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {safeText, shortStderr, processFailure, failureSummary, targetSummary, lifecycleSummary, nativeLogSummary} from './ci-host-diagnostics.mjs';

test('target evidence distinguishes zero, multiple and changed origins without secrets', () => {
  assert.deepEqual(targetSummary([]), {total: 0, candidateCount: 0, omitted: 0, targets: []});
  const rows = [
    {id: 'secret-id', type: 'page', title: 'private title', url: 'http://tauri.localhost/?secret=query#fragment', webSocketDebuggerUrl: 'ws://127.0.0.1:3333/devtools/page/secret-token'},
    {type: 'page', url: 'https://tauri.localhost/editor?secret=another#hidden'},
    {type: 'service_worker', url: 'http://tauri.localhost/service'},
    {type: 'page', url: 'data:text/plain,private-payload'},
    {type: 'page', url: 'file:///C:/private/project.txt'},
  ];
  const result = targetSummary(rows);
  assert.equal(result.candidateCount, 1); assert.equal(result.total, 5);
  assert.deepEqual(result.targets[0], {type: 'page', origin: 'http://tauri.localhost', path: '/'});
  assert.deepEqual(result.targets[1], {type: 'page', origin: 'https://tauri.localhost', path: '/editor'});
  assert.doesNotMatch(JSON.stringify(result), /secret|private|fragment|hidden|webSocket|title|payload/);
  assert.equal(targetSummary([rows[0], rows[0]]).candidateCount, 2);
  assert.equal(targetSummary([null, {type: 'page', url: 'invalid'}]).candidateCount, 0);
  assert.throws(() => targetSummary({targets: rows}));
});
test('bounded target output still counts candidates beyond the retained rows', () => {
  const summary = targetSummary(Array.from({length: 40}, () => ({type: 'page', url: 'http://tauri.localhost/'})));
  assert.equal(summary.targets.length, 32); assert.equal(summary.candidateCount, 40); assert.equal(summary.omitted, 8);
});
test('process errors retain outcome fields, not command lines or encoded payloads', () => {
  const encoded = 'Q'.repeat(2048), stderr = '#< CLIXML\n<Objs><Obj S="progress"><AV>Preparing modules for first use.</AV></Obj></Objs>';
  const error = Object.assign(new Error('Command failed: powershell.exe -EncodedCommand ' + encoded), {cmd: encoded, code: 'ABORT_ERR', signal: 'SIGTERM', killed: true, stderr});
  const summary = processFailure(error, {timedOut: true, elapsedMs: 20003, timeoutMs: 20000});
  assert.equal(summary.code, 'ABORT_ERR'); assert.equal(summary.signal, 'SIGTERM'); assert.equal(summary.killed, true); assert.equal(summary.timedOut, true);
  assert.equal(summary.stderr.errorRecords, 0); assert.doesNotMatch(JSON.stringify(summary), /EncodedCommand|Q{20}|<Objs|Preparing modules/);
  assert.doesNotMatch(JSON.stringify(failureSummary(error)), /EncodedCommand|Q{20}/);
  assert.deepEqual(failureSummary({processFailure: summary}), summary);
  assert.equal(processFailure({code: 1, killed: false, stderr: 'identity mismatch'}, {timedOut: false}).timedOut, false);
});
test('PowerShell error XML is decoded briefly; query and WebSocket tokens are removed', () => {
  const result = shortStderr('#< CLIXML\n<Objs><S S="Error">failed &lt;identity&gt;_x000D__x000A_</S></Objs>');
  assert.equal(result.errorRecords, 1); assert.match(result.text, /failed <identity>/);
  assert.equal(safeText('http://user:pass@tauri.localhost/a?token=private#secret ws://127.0.0.1:33/devtools/page/hidden'), 'http://tauri.localhost/a <websocket-url>');
  assert.equal(failureSummary(Object.assign(new TypeError('fetch failed'), {cause: {code: 'ECONNREFUSED'}})).causeCode, 'ECONNREFUSED');
});
test('lifecycle and native logs use an allowlist, without raw user data', () => {
  const summary = lifecycleSummary([{event: 'host-started', at: 'now', port: 50, hostPid: 12, hostExe: 'private-path'}, {event: 'failed', error: 'No unique page'}, {event: 'arbitrary', secret: 'private'}]);
  assert.equal(summary.length, 2); assert.doesNotMatch(JSON.stringify(summary), /hostExe|private|arbitrary/);
  const log = nativeLogSummary('[INFO] 初始化开始 private-project\n[ERROR] WebView2 failed 0x80004005 private-user\nthread panicked at private-source\n[INFO] normal private-text');
  assert.deepEqual(log.events.map(x => x.category), ['initialization-start', 'webview-error', 'panic-or-fatal']);
  assert.deepEqual(log.events[1].codes, ['0x80004005']); assert.equal(log.rawLinesRetained, false);
  assert.doesNotMatch(JSON.stringify(log), /private|normal/);
});
test('diagnostics never replace target selection or weaken the native owner check', () => {
  const source = fs.readFileSync(new URL('./ci-host-smoke.mjs', import.meta.url), 'utf8');
  assert.match(source, /validateListener\(owner, started\.port, lease\.hostPid\)/);
  assert.match(source, /sampleTargets\('waiting'\)/);
  assert.match(source, /selectTarget\(await response\.json\(\), started\.port\)/);
  assert.match(source, /report\.diagnostics\.remainingOwnedProcesses/);
  assert.doesNotMatch(source, /continue-on-error|--no-sandbox|SwitchDesktop|SetThreadDesktop/);
});

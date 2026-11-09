// Pure guards plus one owned hidden-console identity check on Windows.
// No GUI, network request, installation, or Craft host is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {assertHostedWindows, childPath, validateLease, validateListener, selectTarget, OFFICIAL_HOST_SHA256, PROCESS_TIME_FORMAT} from './ci-host-smoke.mjs';

const ci = {GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows', WEBVIDEO_CRAFT_HOST_SMOKE: '1', GITHUB_RUN_ID: '123456', RUNNER_TEMP: 'temporary', GITHUB_WORKSPACE: 'checkout'};
test('host smoke requires explicit disposable Windows hosted CI', () => {
  assert.doesNotThrow(() => assertHostedWindows(ci, 'win32'));
  for (const key of Object.keys(ci)) assert.throws(() => assertHostedWindows({...ci, [key]: ''}, 'win32'), key);
  assert.throws(() => assertHostedWindows(ci, 'linux'));
  assert.throws(() => assertHostedWindows({...ci, RUNNER_ENVIRONMENT: 'self-hosted'}, 'win32'));
  assert.throws(() => assertHostedWindows({...ci, GITHUB_RUN_ID: 'not-an-id'}, 'win32'));
});
test('owned paths cannot name root or escape it', () => {
  const root = path.join(os.tmpdir(), 'craft-guard-test');
  assert.equal(childPath(root, path.join(root, 'state/session.json')), path.join(root, 'state/session.json'));
  for (const invalid of [root, path.dirname(root), root + '-other/host.exe', path.join(root, '../outside')]) assert.throws(() => childPath(root, invalid));
});
const host = path.resolve('owned-ci-host/webgal-craft.webvideo-original.exe');
const lease = {schemaVersion: 1, wrapperPid: 10, hostPid: 11, coordinatorPid: 12, hostExe: host, sessionId: '12345678-1234-1234-1234-123456789abc'};
test('lease is bound to exact launched wrapper and original host', () => {
  assert.equal(validateLease(lease, 10, host), lease);
  for (const change of [{wrapperPid: 9}, {hostExe: host + '.other'}, {sessionId: '../../foreign'}, {hostPid: 0}, {coordinatorPid: 1.2}]) assert.throws(() => validateLease({...lease, ...change}, 10, host));
});
const listener = {schemaVersion: 1, verified: true, source: 'native-listener-table', port: 53211, hostPid: 11, ownerPid: 15, addresses: ['127.0.0.1', '::1']};
test('CDP access requires exact native-owned loopback result', () => {
  assert.doesNotThrow(() => validateListener(listener, 53211, 11));
  for (const change of [{verified: false}, {source: 'command-line'}, {port: 53212}, {hostPid: 16}, {ownerPid: 0}, {addresses: []}, {addresses: ['0.0.0.0']}, {addresses: ['127.0.0.1', '127.0.0.1']}]) assert.throws(() => validateListener({...listener, ...change}, 53211, 11));
  assert.throws(() => validateListener({...listener, port: 0}, 0, 11));
});
const target = {type: 'page', url: 'http://tauri.localhost/', webSocketDebuggerUrl: 'ws://127.0.0.1:53211/devtools/page/owned'};
test('only one official page on the verified local endpoint is selected', () => {
  assert.equal(selectTarget([target], 53211), target);
  assert.throws(() => selectTarget([target, {...target}], 53211));
  assert.throws(() => selectTarget([{...target, url: 'https://foreign.example'}], 53211));
  assert.throws(() => selectTarget([{...target, type: 'worker'}], 53211));
  for (const url of ['ws://foreign.example:53211/devtools/page/id', 'ws://127.0.0.1:53212/devtools/page/id', 'wss://127.0.0.1:53211/devtools/page/id', 'ws://user:pass@127.0.0.1:53211/devtools/page/id']) assert.throws(() => selectTarget([{...target, webSocketDebuggerUrl: url}], 53211));
});
test('minimal smoke reports unexecuted authoring/export and does not weaken the launcher', () => {
  assert.equal(OFFICIAL_HOST_SHA256, '0de472c44f642c8f140e16bcc040a171519af59d245ae88b1b4a47987cf2756c');
  const source = fs.readFileSync(fileURLToPath(new URL('./ci-host-smoke.mjs', import.meta.url)), 'utf8');
  assert.match(source, /editor: 'NOT_RUN', preview: 'NOT_RUN', export: 'NOT_RUN'/);
  assert.match(source, /--verify-listener/);
  assert.match(source, /listener === 'verified-loopback-owned'/);
  assert.match(source, /actOnOwnedProcess\(hostProcess, 'close'\)/);
  assert.doesNotMatch(source, /SwitchDesktop|CreateDesktop|--no-sandbox|taskkill|Stop-Process -Name/);
});
test('host and static extraction tools use fixed public inputs, without NSIS execution', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./ci-host-inputs.lock.json', import.meta.url), 'utf8'));
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.host.extractedSha256, OFFICIAL_HOST_SHA256);
  for (const item of [fixture.host, fixture.extractor]) {
    assert.match(item.url, /^https:\/\/github\.com\//);
    assert.doesNotMatch(item.url, /\/latest\//);
    assert.match(item.sha256, /^[a-f0-9]{64}$/); assert.ok(item.bytes > 0);
    assert.doesNotMatch(item.file, /[/\\:]/);
  }
  assert.deepEqual(Object.keys(fixture.extractor.files).sort(), ['7z.dll', '7z.exe', 'License.txt'].sort());
  const prepare = fs.readFileSync(new URL('./prepare-ci-host.ps1', import.meta.url), 'utf8');
  assert.match(prepare, /Get-PinnedBuildInput \$lock\.host/);
  assert.match(prepare, /Get-PinnedBuildInput \$lock\.extractor/);
  assert.match(prepare, /\$env:RUNNER_ENVIRONMENT-ne'github-hosted'/);
  assert.doesNotMatch(prepare, /& \$hostArchive|Start-Process|\/UPDATE|\/S\b/);
});
test('CIM and native process identities use exact common microsecond precision', {skip: process.platform !== 'win32'}, async () => {
  assert.equal(PROCESS_TIME_FORMAT, "yyyy-MM-dd'T'HH:mm:ss.ffffff'Z'");
  // This is an owned hidden console process, not Craft or another GUI. Query its
  // own identity only, and keep the Process handle open throughout comparison.
  const script = `$ErrorActionPreference='Stop';$c=Get-CimInstance Win32_Process -Filter ("ProcessId="+$PID);$p=[Diagnostics.Process]::GetCurrentProcess();try{$null=$p.Handle;$cim=$c.CreationDate.ToUniversalTime().ToString("${PROCESS_TIME_FORMAT}");$native=$p.StartTime.ToUniversalTime().ToString("${PROCESS_TIME_FORMAT}");[ordered]@{pid=$PID;nativePid=$p.Id;cim=$cim;native=$native;pathMatches=($p.MainModule.FileName-eq$c.ExecutablePath);same=($cim-eq$native)}|ConvertTo-Json -Compress}finally{$p.Dispose()}`;
  const {stdout} = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {windowsHide: true, timeout: 20000});
  const result = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  assert.equal(result.pid, result.nativePid); assert.equal(result.pathMatches, true);
  assert.match(result.cim, /\.\d{6}Z$/); assert.equal(result.cim, result.native); assert.equal(result.same, true);
});

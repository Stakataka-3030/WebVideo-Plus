import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {debugSwitchSummary, stderrSummary, fixtureEnvironment, runPortDiagnostic, retainOwned} from './ci-host-port-diagnostic.mjs';
import {processes, descendants} from './ci-host-smoke.mjs';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
test('process ownership excludes reused parent PIDs and missing creation identities', () => {
  const at = second => `2026-11-09T15:34:${String(second).padStart(2, '0')}.000000Z`;
  const rows = [
    {ProcessId: 1, ParentProcessId: 99, Started: at(10)},
    {ProcessId: 2, ParentProcessId: 1, Started: at(9)}, // old child of a previous PID 1
    {ProcessId: 3, ParentProcessId: 2, Started: at(11)},
    {ProcessId: 4, ParentProcessId: 1, Started: at(11)},
    {ProcessId: 5, ParentProcessId: 4, Started: at(12)},
    {ProcessId: 6, ParentProcessId: 1, Started: ''},
  ];
  assert.deepEqual(descendants(rows, 1).map(row => row.ProcessId), [1, 4, 5]);
});
test('known orphan identities survive snapshots and never adopt a reused PID', () => {
  const row = (pid, parent, time) => ({ProcessId: pid, ParentProcessId: parent, Started: `2026-11-09T15:34:${time}.000000Z`, ExecutablePath: 'C:\\owned.exe'});
  const host = row(1, 99, '10'), child = row(2, 1, '11'), orphan = row(3, 2, '12');
  let known = retainOwned([], [host, child, orphan], host);
  const later = row(4, 3, '15'); known = retainOwned(known, [orphan, later], host);
  assert.deepEqual(known.map(x => x.ProcessId), [1, 2, 3, 4]);
  const reused = row(3, 99, '20'), foreignChild = row(5, 3, '21');
  assert.deepEqual(retainOwned(known, [reused, foreignChild], host), known);
});
test('browser flags report only matching booleans, role and counts, never values', () => {
  const value = debugSwitchSummary('"C:\\runtime\\msedgewebview2.exe" --remote-debugging-port=50307 --remote-debugging-address=127.0.0.1 --user-data-dir="D:\\private profile" --token=private-secret', 50307, 'D:\\private profile');
  assert.equal(value.portMatches, true); assert.equal(value.addressIsLoopback, true); assert.equal(value.profileMatches, true); assert.equal(value.role, 'browser');
  assert.doesNotMatch(JSON.stringify(value), /50307|127\.0|private|token|runtime/);
  const duplicate = debugSwitchSummary('--remote-debugging-port=50307 --remote-debugging-port=8 --user-data-dir=elsewhere --type=renderer', 50307, 'D:\\expected');
  assert.equal(duplicate.portMatches, false); assert.equal(duplicate.profileMatches, false); assert.equal(duplicate.role, 'renderer');
  assert.equal(debugSwitchSummary('--type=private-role --remote-debugging-port=secret', 4, 'profile').role, 'other');
});
test('native output never retains text, WebSocket tokens or paths', () => {
  const value = stderrSummary('DevTools listening on ws://127.0.0.1:123/devtools/private-token\nRemote debugging is disallowed for elevated hosts\n[ERROR] WebView failed C:\\private 0x80004005');
  assert.equal(value.devToolsListening, true); assert.equal(value.debuggingDisallowed, true); assert.equal(value.rawTextRetained, false);
  assert.doesNotMatch(JSON.stringify(value), /private|ws:|123\/|C:/);
});
test('two variants differ only in explicit temporary folder overrides', () => {
  const original = {APPDATA: 'old-a', LOCALAPPDATA: 'old-l', TEMP: 'old-t', TMP: 'old-m', PATH: 'keep'};
  const root = path.resolve(os.tmpdir(), 'nonexecuted-profile');
  const a = fixtureEnvironment(root, 'fixture-env', 50307, original), b = fixtureEnvironment(root, 'profile-only', 50307, original);
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) { assert.notEqual(a[key], original[key]); assert.equal(b[key], original[key]); }
  assert.equal(a.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, b.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS);
  assert.equal(a.WEBVIEW2_USER_DATA_FOLDER, b.WEBVIEW2_USER_DATA_FOLDER); assert.equal(a.PATH, 'keep'); assert.equal(original.TEMP, 'old-t');
  assert.throws(() => fixtureEnvironment(root, 'relax-policy', 50307, original));
});
test('local entry refuses before reading inputs or starting any host', async () => {
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.WEBVIDEO_CRAFT_HOST_SMOKE === '1') return;
  await assert.rejects(runPortDiagnostic('missing.json', os.tmpdir()));
});
test('diagnostic keeps ownership, original SHA, hosted guard, serial variants and bounded evidence', () => {
  const source = read('./ci-host-port-diagnostic.mjs'), prepare = read('./prepare-ci-host-port-diagnostic.ps1');
  assert.match(source, /assertHostedWindows\(\)/); assert.match(source, /validateListener\(owner, port, child\.pid\)/);
  assert.ok(source.indexOf('validateListener(owner') < source.indexOf('const response = await fetch'));
  assert.match(source, /same\(anchor, live\)/); assert.match(source, /remainingOwned.length, 0/); assert.match(source, /DIAGNOSTIC_COMPLETED/);
  assert.match(source, /subarray\(-65536\)/); assert.match(source, /samples.length >= 13/);
  assert.match(prepare, /Get-PinnedBuildInput \$lock.host/); assert.match(prepare, /Get-PinnedBuildInput \$lock.extractor/);
  assert.match(prepare, /GetValue\(\$name,\$null/); assert.doesNotMatch(prepare, /Get-ChildItem.*HK|Set-ItemProperty|SetValue|New-LocalUser|icacls|Set-ExecutionPolicy/);
  assert.doesNotMatch(source + prepare, /--no-sandbox|remote-allow-origins|SwitchDesktop|SetThreadDesktop|SetEnvironmentVariable/);
  // Diagnostic source is retained for historical evidence, with no executable workflow entry.
  assert.equal(fs.existsSync(new URL('../../.github/workflows/craft-host-port-diagnostic.yml', import.meta.url)), false);
});
test('token helper is query-only and its actual own-process identity check works without a GUI', {skip: process.platform !== 'win32', timeout: 20000}, async () => {
  const source = read('./CiHostToken.cs');
  assert.doesNotMatch(source, /CreateRestrictedToken|SetTokenInformation|CreateProcess|AdjustTokenPrivileges|Registry|SetSecurity/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-readonly-token-')), output = path.join(root, 'ReadOnlyToken.exe');
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const built = spawnSync(compiler, ['/nologo', '/platform:x64', '/target:exe', '/out:' + output, '/r:System.Web.Extensions.dll', fileURLToPath(new URL('./CiHostToken.cs', import.meta.url))], {encoding: 'utf8', windowsHide: true, timeout: 10000});
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const own = (await processes()).find(row => row.ProcessId === process.pid); assert.ok(own);
  const result = spawnSync(output, [String(process.pid), own.ExecutablePath, own.Started], {encoding: 'utf8', windowsHide: true, timeout: 5000});
  assert.equal(result.status, 0, result.stderr); const token = JSON.parse(result.stdout);
  assert.equal(token.pid, process.pid); assert.equal(typeof token.elevated, 'boolean'); assert.ok([1, 2, 3].includes(token.elevationType)); assert.ok(Number.isInteger(token.integrityRid)); assert.equal(typeof token.linkedTokenAvailable, 'boolean');
  const rejected = spawnSync(output, [String(process.pid), own.ExecutablePath, 'incorrect-time'], {encoding: 'utf8', windowsHide: true, timeout: 5000});
  assert.equal(rejected.status, 1); assert.doesNotMatch(rejected.stderr, /incorrect-time|C:\\/);
});

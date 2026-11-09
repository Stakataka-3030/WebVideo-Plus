// Direct official-host investigation, NOT installation/injection acceptance.
// All GUI execution is restricted to an explicitly enabled disposable CI VM.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertNoLinks, fileHash} from '../installer/transaction.mjs';
import {assertHostedWindows, OFFICIAL_HOST_SHA256, childPath, processes, descendants, actOnOwnedProcess, diagnosticExecute, validateListener, powershell} from './ci-host-smoke.mjs';
import {failureSummary, nativeLogSummary, targetSummary} from './ci-host-diagnostics.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const same = (a, b) => a.ProcessId === b.ProcessId && a.Started === b.Started && a.ExecutablePath?.toLowerCase() === b.ExecutablePath?.toLowerCase();
export function retainOwned(known, rows, anchor) {
  const liveAnchors = [...known, ...(anchor ? [anchor] : [])].filter(old => rows.some(row => same(old, row)));
  const additions = liveAnchors.flatMap(row => descendants(rows, row.ProcessId));
  // Keep proven orphans even after an intermediate parent exits. Reused PIDs
  // never become anchors without their original executable/start identity.
  return [...new Map([...known, ...additions].map(row => [JSON.stringify([row.ProcessId, row.Started, row.ExecutablePath?.toLowerCase()]), row])).values()];
}
export function debugSwitchSummary(commandLine, port, profile) {
  const source = String(commandLine || '');
  const ports = [...source.matchAll(/(?:^|\s)--remote-debugging-port=(?:"(\d+)"|(\d+))(?=\s|$)/g)].map(x => Number(x[1] || x[2]));
  const addresses = [...source.matchAll(/(?:^|\s)--remote-debugging-address=(?:"([^"]*)"|(\S+))/g)].map(x => x[1] || x[2]);
  const profiles = [...source.matchAll(/(?:^|\s)--user-data-dir=(?:"([^"]*)"|(\S+))/g)].map(x => x[1] || x[2]);
  const role = /(?:^|\s)--type=(?:"([^"]*)"|(\S+))/.exec(source);
  return {debugPortSwitchPresent: /(?:^|\s)--remote-debugging-port(?:=|\s|$)/.test(source),
    numericPortCount: ports.length, portMatches: ports.length === 1 && ports[0] === port,
    addressSwitchPresent: addresses.length > 0, addressIsLoopback: addresses.length === 1 && ['127.0.0.1', '::1'].includes(addresses[0]),
    profileSwitchPresent: profiles.length > 0, profileMatches: profiles.length === 1 && path.win32.resolve(profiles[0]).toLowerCase() === path.win32.resolve(profile).toLowerCase(),
    role: !role ? 'browser' : ['renderer', 'utility', 'gpu-process', 'crashpad-handler'].includes(role[1] || role[2]) ? role[1] || role[2] : 'other'};
}
export function stderrSummary(text) {
  return {...nativeLogSummary(text), debuggingDisallowed: /(?:remote )?debugging.{0,100}(?:disallow|not allow|disable|elevat)|(?:elevat|high.integrity).{0,100}debug/i.test(text),
    devToolsListening: /DevTools listening on/i.test(text), rawTextRetained: false};
}
export function fixtureEnvironment(root, variant, port, inherited = process.env) {
  assert.ok(['fixture-env', 'profile-only'].includes(variant));
  const env = {...inherited, WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview-profile'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`};
  if (variant === 'fixture-env') for (const name of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) env[name] = path.join(root, name.toLowerCase());
  return env;
}
async function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
}
async function tokenOf(helper, row) {
  const result = await diagnosticExecute(helper, [String(row.ProcessId), row.ExecutablePath, row.Started], 10000);
  const value = JSON.parse(result.stdout); assert.equal(value.pid, row.ProcessId);
  return value;
}
export async function runPortDiagnostic(inputFile, evidenceRoot) {
  assertHostedWindows(); assert.equal(path.resolve(process.env.GITHUB_WORKSPACE).toLowerCase(), repo.toLowerCase());
  childPath(repo, evidenceRoot);
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(input.diagnosticOnly, true); assert.equal(input.hostSha256, OFFICIAL_HOST_SHA256);
  for (const file of [input.hostSource, input.verifier, input.tokenHelper]) { childPath(process.env.RUNNER_TEMP, file); assertNoLinks(file); }
  assert.equal(fileHash(input.hostSource), OFFICIAL_HOST_SHA256);
  const prior = await processes(); assert.ok(!prior.some(row => /^webgal-craft(?:\.webvideo-original)?\.exe$/i.test(row.Name)), 'Do not coexist with another Craft instance');
  const self = prior.find(row => row.ProcessId === process.pid); assert.ok(self);
  const report = {schemaVersion: 1, scope: 'Direct fixed official-host port diagnostic only; no package/installation/injection acceptance',
    status: 'RUNNING', hostSha256: OFFICIAL_HOST_SHA256, parentToken: await tokenOf(input.tokenHelper, self), policies: input.policies, variants: []};
  fs.mkdirSync(evidenceRoot, {recursive: true});
  const save = () => fs.writeFileSync(path.join(evidenceRoot, 'host-port-diagnostic.json'), JSON.stringify(report, null, 2) + '\n');
  try {
    for (const variant of ['fixture-env', 'profile-only']) {
      const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'webvideo-port-' + variant + '-'));
      // Match the production launcher's unchanged original-file basename.
      const host = path.join(root, 'webgal-craft.webvideo-original.exe'); fs.copyFileSync(input.hostSource, host);
      const port = await freePort(), env = fixtureEnvironment(root, variant, port), profile = env.WEBVIEW2_USER_DATA_FOLDER;
      fs.mkdirSync(profile);
      if (variant === 'fixture-env') for (const name of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) fs.mkdirSync(env[name]);
      const record = {variant, port, startedAt: new Date().toISOString(), samples: [], processFlags: [], cleanup: [], stderr: null};
      report.variants.push(record); save();
      let child, exited, owned = [], anchor, output = Buffer.alloc(0), outputBytes = 0;
      const collect = chunk => { outputBytes += chunk.length; output = Buffer.concat([output, chunk]).subarray(-65536); };
      try {
        child = spawn(host, [], {cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
        let spawnError; child.once('error', error => { spawnError = error; }); child.once('exit', (code, signal) => { exited = {code, signal}; });
        child.stdout.on('data', collect); child.stderr.on('data', collect);
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline && !exited) {
          if (spawnError) throw spawnError;
          const rows = await processes(true), live = rows.find(row => row.ProcessId === child.pid && row.ExecutablePath?.toLowerCase() === host.toLowerCase());
          if (live) {
            if (anchor) assert.ok(same(anchor, live), 'Host identity changed'); else { anchor = live; record.hostToken = await tokenOf(input.tokenHelper, live); }
            owned = retainOwned(owned, rows, anchor);
          }
          const sample = {at: new Date().toISOString(), ownerVerified: false, endpointAttempted: false}; record.samples.push(sample);
          try {
            const query = await diagnosticExecute(input.verifier, ['--verify-listener', String(port), String(child.pid)], 5000);
            const owner = JSON.parse(query.stdout); validateListener(owner, port, child.pid); assert.ok(anchor);
            sample.ownerVerified = true; sample.owner = owner; sample.endpointAttempted = true;
            const response = await fetch(`http://127.0.0.1:${port}/json/list`, {signal: AbortSignal.timeout(1500), redirect: 'error'});
            sample.httpStatus = response.status;
            if (response.ok) { const text = await response.text(); assert.ok(Buffer.byteLength(text) <= 131072); sample.targets = targetSummary(JSON.parse(text)); }
          } catch (error) { sample.failure = failureSummary(error); }
          if (sample.ownerVerified || record.samples.length >= 13) break;
          await sleep(1500);
        }
        record.exitBeforeClose = exited || null;
        const rows = await processes(true), live = rows.find(row => anchor && same(row, anchor));
        owned = retainOwned(owned, rows, anchor);
        for (const row of owned.filter(row => row.Name.toLowerCase() === 'msedgewebview2.exe')) {
          const item = {pid: row.ProcessId, parentPid: row.ParentProcessId, ...debugSwitchSummary(row.CommandLine, port, profile)};
          if (item.role === 'browser') {
            try { item.token = await tokenOf(input.tokenHelper, row); } catch (error) { item.tokenFailure = failureSummary(error); }
            const encoded = Buffer.from(row.ExecutablePath, 'utf8').toString('base64');
            const version = await powershell(`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));(Get-Item -LiteralPath $p).VersionInfo.FileVersion|ConvertTo-Json`);
            item.runtimeVersion = /^\d+(?:\.\d+){3}$/.test(version) ? version : '<unrecognized>';
          }
          record.processFlags.push(item);
        }
      } catch (error) { record.failure = failureSummary(error); }
      finally {
        record.stderr = {...stderrSummary(output.toString('utf8')), bytes: outputBytes, truncated: outputBytes > 65536};
        if (anchor) {
          const rows = await processes(), live = rows.find(row => same(row, anchor));
          owned = retainOwned(owned, rows, anchor);
          if (live) { try { record.normalCloseRequested = await actOnOwnedProcess(live, 'close'); } catch (error) { record.closeFailure = failureSummary(error); } }
          const until = Date.now() + 10000;
          while (!exited && Date.now() < until) await sleep(100);
          const current = await processes();
          owned = retainOwned(owned, current, anchor);
          // Retain only exact identities captured while the original host lived.
          for (const row of [...owned].reverse()) if (current.some(p => same(row, p))) {
            try { record.cleanup.push({pid: row.ProcessId, killed: await actOnOwnedProcess(row, 'kill')}); } catch (error) { record.cleanup.push({pid: row.ProcessId, failure: failureSummary(error)}); }
          }
          const remaining = await processes(); record.remainingOwned = owned.filter(row => remaining.some(p => same(row, p))).map(row => row.ProcessId);
          assert.equal(record.remainingOwned.length, 0, 'Owned processes remain; stop before next variant');
        } else if (child?.pid && !exited) throw Error('Host identity was never confirmed; no guessed cleanup or second launch');
        record.exit = exited || null; record.completedAt = new Date().toISOString(); save();
      }
      assert.equal(fileHash(host), OFFICIAL_HOST_SHA256);
      assert.ok(!(await processes()).some(row => /^webgal-craft(?:\.webvideo-original)?\.exe$/i.test(row.Name)), 'Stop if any Craft instance remains');
    }
    report.status = report.variants.some(record => record.failure || !record.hostToken) ? 'DIAGNOSTIC_INCOMPLETE' : 'DIAGNOSTIC_COMPLETED';
  } catch (error) { report.status = 'DIAGNOSTIC_BLOCKED'; report.failure = failureSummary(error); throw error; }
  finally { report.completedAt = new Date().toISOString(); save(); }
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error('Expected prepared input record and evidence directory');
  const result = await runPortDiagnostic(path.resolve(process.argv[2]), path.resolve(process.argv[3]));
  console.log(JSON.stringify({status: result.status, variants: result.variants.map(v => ({variant: v.variant, listener: v.samples.some(s => s.ownerVerified), token: v.hostToken}))}));
  if (result.status !== 'DIAGNOSTIC_COMPLETED') process.exitCode = 1;
}

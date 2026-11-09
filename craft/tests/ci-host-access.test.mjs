import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const file = fileURLToPath(new URL('./CiHostAccess.cs', import.meta.url));
const source = fs.readFileSync(file, 'utf8');
test('current-object evidence only simulates DACL checks using temporary QUERY tokens', () => {
  assert.match(source, /DuplicateTokenEx\(primary, 8, IntPtr.Zero, 2, 2, out impersonation\)/);
  assert.match(source, /AccessCheck\(descriptor, impersonation, 0x02000000/);
  assert.match(source, /Security\(handle, 7\)/); // owner/group/DACL
  assert.match(source, /Security\(handle, 16\)/); // mandatory label only
  assert.match(source, /CloseHandle\(impersonation\)/);
  assert.doesNotMatch(source, /SetSecurity|SetNamedSecurity|SetUserObject|SetThreadToken|ImpersonateLoggedOnUser|SetThreadDesktop|SetProcessWindowStation|OpenDesktop|CreateDesktop|SwitchDesktop|AdjustToken|CreateProcessWithToken/);
  assert.doesNotMatch(source, /CloseHandle\(handle\)/); // borrowed user32 handles
  assert.match(source, /No error message, SID, ACL or object name/);
  assert.match(source, /DACL simulation excludes MIC/);
});
test('diagnostic records the already-used no-console flags and session/logon preservation', () => {
  const runner = fs.readFileSync(new URL('./CiRestrictedRunner.cs', import.meta.url), 'utf8');
  assert.match(runner, /false,0x08000404,environment/);
  assert.match(runner, /report\["createNoWindow"\]=true/);
  assert.match(runner, /sourceLogons.SequenceEqual\(reducedLogons\)/);
  assert.match(runner, /Scalar\(source,12\)==Scalar\(reduced,12\)/);
  assert.ok(runner.indexOf('CiHostAccess.Summary(source,reduced)') < runner.indexOf('Require(CreateProcessAsUser('));
  assert.ok(runner.indexOf('report["status"]="ACCESS_DIAGNOSTIC_COMPLETED"') < runner.indexOf('Require(CreateProcessAsUser('));
  assert.match(runner, /report\["childCreated"\]=false;return 0/);
  const workflow = fs.readFileSync(new URL('../../.github/workflows/craft-host-port-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /WEBVIDEO_CRAFT_ACCESS_DIAGNOSTIC_ONLY: '1'/);
  assert.match(workflow, /if \(\$env:WEBVIDEO_CRAFT_ACCESS_DIAGNOSTIC_ONLY -ne '1'\)/);
});
test('mandatory-label parsing uses synthetic descriptors only, never desktop APIs', {skip: process.platform !== 'win32', timeout: 15000}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-access-parse-'));
  const harness = path.join(directory, 'PureLabel.cs'), exe = path.join(directory, 'PureLabel.exe');
  fs.writeFileSync(harness, `using System; using System.Security.AccessControl; using System.Web.Script.Serialization; static class PureLabel {
    static byte[] SD(string text) {var sd=new RawSecurityDescriptor(text);var data=new byte[sd.BinaryLength];sd.GetBinaryForm(data,0);return data;}
    static int Main(){var json=new JavaScriptSerializer();Console.WriteLine(json.Serialize(CiHostAccess.Label(SD("O:SYG:SYD:(A;;GA;;;SY)S:(ML;;NW;;;ME)"))));Console.WriteLine(json.Serialize(CiHostAccess.Label(SD("O:SYG:SYD:(A;;GA;;;SY)"))));try{CiHostAccess.Label(new byte[0]);return 3;}catch(ArgumentException){return 0;}}
  }`);
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const built = spawnSync(compiler, ['/nologo', '/platform:x64', '/target:exe', '/r:System.Web.Extensions.dll', '/out:' + exe, file, harness], {encoding: 'utf8', windowsHide: true, timeout: 10000});
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const checked = spawnSync(exe, [], {encoding: 'utf8', windowsHide: true, timeout: 5000});
  assert.equal(checked.status, 0, checked.stderr);
  const values = checked.stdout.trim().split(/\r?\n/).map(JSON.parse);
  assert.deepEqual(values, [{read: true, present: true, integrityRid: 8192, policyMask: 1}, {read: true, present: false}]);
});

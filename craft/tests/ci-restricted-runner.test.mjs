// No local token creation/adjustment or process-as-user launch. Only compile,
// argument/guard checks, query-only membership, static contracts and JS assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {requireMedium} from './ci-host-port-diagnostic.mjs';
const sourceFile = fileURLToPath(new URL('./CiRestrictedRunner.cs', import.meta.url));
const source = fs.readFileSync(sourceFile, 'utf8');

test('observer and host medium checks reject elevated or high/unknown tokens', () => {
  assert.doesNotThrow(() => requireMedium({elevated: false, integrityRid: 8192}));
  for (const value of [null, {}, {elevated: true, integrityRid: 8192}, {elevated: false, integrityRid: 12288}, {elevated: false, integrityRid: 4096}]) assert.throws(() => requireMedium(value));
});
test('restricted runner never mutates source token, accounts, persistent ACLs or security policy', () => {
  assert.match(source, /OpenProcessToken\(Process.GetCurrentProcess\(\).Handle,0x008B,out source\)/);
  assert.match(source, /CreateRestrictedToken\(source,4,1,/);
  assert.match(source, /Privileges\(source\).Where\(p=>!Equal\(p.Luid,notify\)\)/);
  assert.match(source, /SetTokenInformation\(reduced,25,/);
  assert.doesNotMatch(source, /SetTokenInformation\(source|AdjustTokenPrivileges|LogonUser|CreateAccount|SetNamedSecurityInfo|SetSecurityInfo|RegistryKey|SetValue|ShellExecute/);
  assert.match(source, /Integrity\(token\)!=8192\|\|Scalar\(token,20\)!=0\|\|Administrator\(token\)/);
  assert.match(source, /!User\(token\).Equals\(expected\)/);
  assert.match(source, /Privileges\(token\).Any\(p=>!Equal\(p.Luid,notify\)\)/);
  assert.match(source, /Info\(token,2\)/); assert.match(source, /group.Attributes&4/); assert.match(source, /group.Attributes&16/);
  assert.doesNotMatch(source, /new WindowsPrincipal|new WindowsIdentity/);
});
test('child is suspended and token verified before owned job assignment and resume', () => {
  const created = source.indexOf('Require(CreateProcessAsUser('), checked = source.indexOf('AssertReduced(actual,user,notify)'), assigned = source.indexOf('Require(AssignProcessToJobObject('), resumed = source.indexOf('Require(ResumeThread(');
  assert.ok(created > 0 && checked > created && assigned > checked && resumed > assigned);
  assert.match(source, /false,0x08000404,environment/); // no handle inheritance, suspended + Unicode + no console window
  assert.match(source, /limits.Basic.Flags=0x2000/); // KILL_ON_JOB_CLOSE; never BREAKAWAY_OK
  assert.match(source, /TerminateProcess\(child.Process,1\)/); assert.match(source, /CloseHandle\(job\)/);
  assert.doesNotMatch(source, /Process.GetProcessesByName|Process.GetProcessById|taskkill|Kill\(/);
  assert.match(source, /WaitForSingleObject\(child.Process,180000\)/);
});
test('hosted guard and fully validated paths precede any mutation or token work', () => {
  assert.ok(source.indexOf('Guard();') < source.indexOf('Require(OpenProcessToken('));
  assert.match(source, /RUNNER_ENVIRONMENT"\)!="github-hosted"/);
  assert.match(source, /WEBVIDEO_CRAFT_HOST_SMOKE"\)!="1"/);
  assert.ok(source.indexOf('foreach(string p in new[]{workspace,node,script,input,evidence})NoLinks(p)') < source.indexOf('evidenceValidated=true'));
  assert.match(source, /if\(evidenceValidated\)\{NoLinks\(Path.Combine\(evidence,"restricted-launch.json"\)\)/);
  assert.match(source, /SortedDictionary<string,string>\(StringComparer.OrdinalIgnoreCase\)/);
  assert.match(source, /String.Join\("\\0",variables.Select/); assert.match(source, /\+"\\0\\0"/);
  assert.match(source, /variables\["WEBVIDEO_CRAFT_EXPECT_MEDIUM"\]="1"/);
});
test('diagnostic workflow compares high and reduced tokens without modifying release build', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/craft-host-port-diagnostic.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('node craft/tests/ci-host-port-diagnostic.mjs') < workflow.indexOf('& $inputs.restrictedRunner'));
  assert.match(workflow, /craft-port-medium/); assert.match(workflow, /do not change permissions or security policy/);
  assert.doesNotMatch(workflow, /icacls|New-LocalUser|EnableLUA|Set-ItemProperty|build\.ps1/);
  const probe = fs.readFileSync(new URL('./ci-host-port-diagnostic.mjs', import.meta.url), 'utf8');
  assert.match(probe, /requireMedium\(report.parentToken\)/); assert.match(probe, /requireMedium\(record.hostToken\)/);
});
test('native helper compiles; quote/guard and QUERY-only membership harness never calls its launch entry', {skip: process.platform !== 'win32', timeout: 20000}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-restricted-compile-'));
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const harness = path.join(directory, 'PureChecks.cs'), exe = path.join(directory, 'PureChecks.exe');
  fs.writeFileSync(harness, `using System; using System.IO; using System.Diagnostics; using System.Runtime.InteropServices; using System.Security.Principal; using System.Web.Script.Serialization; static class PureChecks { [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token); [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle); static int Main() { Console.WriteLine(new JavaScriptSerializer().Serialize(new[]{CiRestrictedRunner.Quote("plain"),CiRestrictedRunner.Quote(@"C:\\a b\\"),CiRestrictedRunner.Quote("a\\\"b")})); try { CiRestrictedRunner.Guard(); Console.WriteLine("guard-accepted"); } catch(IOException) { Console.WriteLine("guard-rejected"); } IntPtr query; if(!OpenProcessToken(Process.GetCurrentProcess().Handle,8,out query))return 2; try { bool actual=CiRestrictedRunner.Administrator(query); using(var identity=WindowsIdentity.GetCurrent()){bool expected=new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator); if(actual!=expected)return 3;} Console.WriteLine("query-only-membership-verified"); } finally {CloseHandle(query);} return 0; } }`);
  const common = ['/nologo', '/platform:x64', '/r:System.Web.Extensions.dll', sourceFile];
  const standalone = spawnSync(compiler, ['/target:exe', '/out:' + path.join(directory, 'RestrictedCiRunner.exe'), ...common], {encoding: 'utf8', windowsHide: true, timeout: 10000});
  assert.equal(standalone.status, 0, standalone.stdout + standalone.stderr); // compiled only; never launched locally
  const built = spawnSync(compiler, ['/target:exe', '/main:PureChecks', '/out:' + exe, ...common, harness], {encoding: 'utf8', windowsHide: true, timeout: 10000});
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const checked = spawnSync(exe, [], {encoding: 'utf8', windowsHide: true, timeout: 5000, env: {...process.env, GITHUB_ACTIONS: 'false'}});
  assert.equal(checked.status, 0, checked.stderr);
  const lines = checked.stdout.trim().split(/\r?\n/);
  assert.deepEqual(JSON.parse(lines[0]), ['"plain"', '"C:\\a b\\\\"', '"a\\"b"']);
  assert.equal(lines[1], 'guard-rejected');
  assert.equal(lines[2], 'query-only-membership-verified');
});

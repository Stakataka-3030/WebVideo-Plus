// CI-only static identity record. This never executes an installer or host,
// promotes an asset, or substitutes an independent test for host acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertNoLinks} from '../installer/transaction.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export function assertCandidateInstallerList(names, expected) {
  assert.deepEqual(names.filter(name => /^WebVideoCraft-Setup-.*\.exe$/i.test(name)), [expected]);
}
export function candidateRecord({identity, versions, installer, sourceCommit, runId}) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(runId, /^\d+$/);
  assert.equal(identity.status, 'PASS');
  assert.equal(identity.sourceCommit, sourceCommit);
  assert.equal(identity.source, 'current-craft-installer-payload');
  assert.equal(identity.installerExecuted, false);
  assert.equal(identity.fullManifestVerified, true);
  assert.equal(identity.installerPayloadVerified, true);
  assert.equal(identity.packageVersion, versions.productVersion);
  assert.equal(identity.installerVersion, versions.installerVersion);
  assert.equal(identity.kernelVersion, versions.kernelVersion);
  for (const key of ['installerSha256', 'manifestSha256', 'kernelSha256']) assert.match(identity[key], /^[a-f0-9]{64}$/);
  assert.ok(Buffer.isBuffer(installer) && installer.length > 0);
  assert.equal(sha256(installer), identity.installerSha256, 'Installer changed after payload verification');
  return {schemaVersion: 1, status: 'HOST_UNACCEPTED', releaseAccepted: false,
    purpose: 'Isolated CLI acceptance only; not a release-accepted artifact',
    hostGate: 'NOT_RUN_AT_CAPTURE', independentGates: 'PASS_BEFORE_CAPTURE',
    sourceCommit, ciRunId: runId, productVersion: versions.productVersion,
    installerVersion: versions.installerVersion, kernelVersion: versions.kernelVersion,
    installer: {file: `WebVideoCraft-Setup-${versions.installerVersion}.exe`, bytes: installer.length, sha256: identity.installerSha256},
    manifestSha256: identity.manifestSha256, kernelSha256: identity.kernelSha256};
}
export function writeCandidate(env = process.env) {
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(env.RUNNER_OS, 'Windows'); assert.equal(env.OS, 'Windows_NT');
  assert.equal(path.resolve(env.GITHUB_WORKSPACE).toLowerCase(), root.toLowerCase());
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000}).trim();
  assert.equal(commit, env.GITHUB_SHA);
  const versions = JSON.parse(fs.readFileSync(path.join(root, 'craft/version.json'), 'utf8'));
  const installer = path.join(root, 'dist', `WebVideoCraft-Setup-${versions.installerVersion}.exe`);
  // The upload glob must contain exactly the one installer bound by this record.
  assertCandidateInstallerList(fs.readdirSync(path.join(root, 'dist')), path.basename(installer));
  const evidence = path.join(root, '.build/ci-native-tests/scene-tail/package-identity.json');
  const output = path.join(root, '.build/ci-native-tests/craft-host-unaccepted/candidate.json');
  for (const file of [installer, evidence, output]) assertNoLinks(file);
  const identity = JSON.parse(fs.readFileSync(evidence, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(path.resolve(identity.installer).toLowerCase(), installer.toLowerCase());
  const record = candidateRecord({identity, versions, installer: fs.readFileSync(installer), sourceCommit: commit, runId: env.GITHUB_RUN_ID});
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
  return record;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'This CI record takes no path overrides');
  console.log(JSON.stringify(writeCandidate()));
}

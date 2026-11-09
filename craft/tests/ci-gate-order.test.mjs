import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {assertCandidateInstallerList, candidateRecord, writeCandidate} from './write-host-unaccepted-candidate.mjs';
const workflow = fs.readFileSync(new URL('../../.github/workflows/native-smoke.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const steps = workflow.split(/(?=^      - (?:name|uses):)/m).slice(1);
const named = name => {const found = steps.filter(step => step.startsWith('      - name: ' + name + '\n')); assert.equal(found.length, 1, name); return found[0];};
const index = name => steps.indexOf(named(name));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hostName = 'Verify real Craft host startup and normal-close lifecycle on disposable CI';

test('every independent complete-build/native/scene-tail gate precedes the unchanged host gate', () => {
  const ordered = [
    'Build the complete Craft installer and verify its static payload',
    'Run production settings, persistence and process regressions against the complete build',
    'Run native readiness and browser-death capture regressions in an isolated package',
    'Compare scene-only tail planning with the full-story native crop',
    'Record host-unaccepted candidate identity after independent gates',
    'Preserve host-unaccepted candidate for isolated CLI acceptance only', hostName,
    'Preserve production regression evidence including failures and NA',
    'Preserve the verified Craft test installer',
  ].map(index);
  for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i] > ordered[i - 1]);
  // Exact normalized step from 239aa965: commands, conditions, timeout, failures and cleanup unchanged.
  assert.equal(hash(named(hostName).trim()), 'bbe214f7b1f61e0d3d80e1dbc63c47574aaf0efa424f842ef32d19e1c03a001c');
  assert.doesNotMatch(workflow, /continue-on-error|RestrictedCiRunner|WEBVIDEO_CRAFT_EXPECT_MEDIUM/);
});
test('candidate is separate and default-success-only; regular release artifact remains behind host', () => {
  for (const name of ['Record host-unaccepted candidate identity after independent gates', 'Preserve host-unaccepted candidate for isolated CLI acceptance only', hostName, 'Preserve the verified Craft test installer']) {
    assert.doesNotMatch(named(name), /^        if:/m); // implicit success(), never always/failure/NA
  }
  const candidate = named('Preserve host-unaccepted candidate for isolated CLI acceptance only');
  assert.match(candidate, /name: webvideo-craft-host-unaccepted-candidate/);
  assert.match(candidate, /craft-host-unaccepted\/candidate.json/);
  assert.doesNotMatch(candidate, /webvideo-release.json|gh release/);
  const regular = named('Preserve the verified Craft test installer');
  assert.match(regular, /name: webvideo-craft-windows-test-installer/);
  assert.match(regular, /dist\/webvideo-release.json/);
  assert.match(named('Preserve production regression evidence including failures and NA'), /if: always\(\)/);
});
const installer = Buffer.from('synthetic bytes, never executable');
const versions = {productVersion: '1.2.2c', installerVersion: '1.2.2.0c', kernelVersion: '0.6.66'};
const sourceCommit = 'a'.repeat(40);
const identity = {status: 'PASS', sourceCommit, source: 'current-craft-installer-payload', installerExecuted: false,
  fullManifestVerified: true, installerPayloadVerified: true, packageVersion: versions.productVersion,
  installerVersion: versions.installerVersion, kernelVersion: versions.kernelVersion,
  installerSha256: hash(installer), manifestSha256: 'b'.repeat(64), kernelSha256: 'c'.repeat(64)};
const input = {identity, versions, installer, sourceCommit, runId: '123'};
test('candidate records exact source/bytes/version hashes without claiming host or release acceptance', () => {
  const record = candidateRecord(input);
  assert.equal(record.status, 'HOST_UNACCEPTED'); assert.equal(record.releaseAccepted, false);
  assert.equal(record.hostGate, 'NOT_RUN_AT_CAPTURE'); assert.equal(record.sourceCommit, sourceCommit);
  assert.equal(record.installer.sha256, hash(installer)); assert.equal(record.installer.bytes, installer.length);
  assert.equal(record.installer.file, 'WebVideoCraft-Setup-1.2.2.0c.exe');
});
test('candidate rejects unverified, stale, mismatched or changed payload evidence', () => {
  for (const patch of [{status: 'NA'}, {status: 'FAIL'}, {sourceCommit: 'd'.repeat(40)}, {fullManifestVerified: false},
    {installerPayloadVerified: false}, {installerExecuted: true}, {packageVersion: 'old'}, {kernelVersion: 'old'},
    {installerVersion: 'old'}, {installerSha256: 'd'.repeat(64)}, {manifestSha256: 'invalid'}]) {
    assert.throws(() => candidateRecord({...input, identity: {...identity, ...patch}}));
  }
  assert.throws(() => candidateRecord({...input, installer: Buffer.from('changed')}));
  assert.throws(() => candidateRecord({...input, runId: 'not-a-run'}));
});
test('local entry refuses before filesystem, git or host access', () => {
  assert.throws(() => writeCandidate({}));
});
test('candidate upload glob cannot include any additional or unbound installer', () => {
  const file = 'WebVideoCraft-Setup-1.2.2.0c.exe';
  assert.doesNotThrow(() => assertCandidateInstallerList([file, 'webvideo-release.json', 'WebVideoCraft-Setup-1.2.2.0c'], file));
  for (const names of [[], ['WebVideoCraft-Setup-old.exe'], [file, 'WebVideoCraft-Setup-old.exe'], [file, 'WEBVIDEOCRAFT-SETUP-OTHER.EXE']]) {
    assert.throws(() => assertCandidateInstallerList(names, file));
  }
});

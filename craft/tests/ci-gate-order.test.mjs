import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {assertCandidateInstallerList, candidateRecord, writeCandidate} from './write-ci-candidate.mjs';
const workflows = new URL('../../.github/workflows/', import.meta.url);
const workflow = fs.readFileSync(new URL('native-smoke.yml', workflows), 'utf8').replaceAll('\r\n', '\n');
const steps = workflow.split(/(?=^      - (?:name|uses):)/m).slice(1);
const named = name => {const found = steps.filter(step => step.startsWith('      - name: ' + name + '\n')); assert.equal(found.length, 1, name); return found[0];};
const index = name => steps.indexOf(named(name));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const recordName = 'Record CI candidate identity and explicit coverage after independent gates';
const artifactName = 'Preserve the Craft candidate with build and native coverage only';
// Normalized steps from f4527338: retiring editor-host CI must not weaken any
// build, package, logic, native WebView, scene-tail, audio or evidence gate.
const preserved = {
  "Prepare pinned ffprobe for Craft audio regressions": "34db966fabbf00b2d1b60483e5b014ae3c45b0acc03dccd9637b8c0058bd188e",
  "Prepare Windows process ownership queries": "5a8143d30c540a1dec4fbd6b254e602949e1c4e6439f0ee2b41538ce1875408e",
  "Verify complete Craft and shared Node regressions": "a903a150f0a1aeadaf531967fedd45eadfca5be5289e9257e6e356d7adf8dddc",
  "Verify composed Craft feature preflight": "15cc63a3fc12dec2a303006fe9f02079ff00d1a9d91d677ea09c8aad5a3f7cc8",
  "Prepare pinned upstream inputs from a clean checkout and repeat offline": "529f50bc04f7176f85d72887fb6463d6c00b47ba957b1639460e219298d1f391",
  "Verify requested-expression and automatic-save contracts on exact engines": "7d215130b963cf278f96712425e6e65b4e54efb33af4d25f78483c2192b6a4e6",
  "Restore locked AI dependencies without lifecycle scripts": "2be210fb0c2b76c28959cc26738b723878ab2ae1b457cb0009ead266930c8b5c",
  "Compile native exporter and run lifecycle regressions": "c3907342f05d38d6a5da62c4b49a7d83cd2d36c42c8f808e7fc11fd9c5dfc06f",
  "Verify semantic worker segmentation": "3888b1439c3974cbda78908cac618fe31bf12be4d6d1dc0e9d8ba0f9cc421d9c",
  "Verify Terre integration anchors": "a9ca0e492f09332ce4b11da68ae7e0967a9cec33b78dc64f6601775773e550de",
  "Build the complete Craft installer and verify its static payload": "73d252d90c4900d4b0722c6f0a14bba0b723ac250b9029d1200df75c58757096",
  "Run production settings, persistence and process regressions against the complete build": "707c9a7f9479ba7810e64f832c20a0e94b719a0a0399bfedd2c778240002c1a3",
  "Run native readiness and browser-death capture regressions in an isolated package": "8c9ff0105d093e5e3e50cb1dedab690d51fc75616d583a31b18bfc54c6325f68",
  "Compare scene-only tail planning with the full-story native crop": "8ab48539fe125d3abb1d6beda0f11f4089b4c44e8c2096bdd327b4bec1707cca",
  "Preserve production regression evidence including failures and NA": "a8048f4bba83eba818a0c4bb78fc808b491af980effbe952ca469be22cd6f487"
};

test('all independent gates and failure evidence remain unchanged and ordered', () => {
  const ordered = Object.keys(preserved).map(index);
  for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i] > ordered[i - 1]);
  for (const [name, expected] of Object.entries(preserved)) assert.equal(hash(named(name).trim()), expected, name);
  assert.ok(index(recordName) > index('Compare scene-only tail planning with the full-story native crop'));
  assert.ok(index(recordName) < index('Preserve production regression evidence including failures and NA'));
  assert.ok(index(artifactName) > index('Preserve production regression evidence including failures and NA'));
  assert.doesNotMatch(workflow, /continue-on-error|RestrictedCiRunner|WEBVIDEO_CRAFT_EXPECT_MEDIUM/);
});

test('active workflows have no remote editor host smoke or diagnostic launch entry', () => {
  assert.equal(fs.existsSync(new URL('craft-host-port-diagnostic.yml', workflows)), false);
  for (const file of fs.readdirSync(workflows).filter(file => /\.ya?ml$/.test(file))) {
    const source = fs.readFileSync(new URL(file, workflows), 'utf8');
    assert.doesNotMatch(source, /WEBVIDEO_CRAFT_HOST_SMOKE|prepare-ci-host|ci-host-(?:smoke|port-diagnostic)\.mjs|Verify real Craft host|webgal-craft(?:\.webvideo-original)?\.exe/, file);
  }
});

test('one standard candidate artifact is success-only and includes explicit CI coverage', () => {
  for (const name of [recordName, artifactName]) assert.doesNotMatch(named(name), /^        if:/m);
  assert.match(named(recordName), /node craft\/tests\/write-ci-candidate.mjs/);
  assert.match(named(recordName), /real editor host acceptance: NOT_RUN/);
  const candidate = named(artifactName);
  assert.match(candidate, /name: webvideo-craft-windows-test-installer/);
  assert.match(candidate, /dist\/WebVideoCraft-Setup-\*\.exe/);
  assert.match(candidate, /dist\/webvideo-release.json/);
  assert.match(candidate, /craft-candidate\/candidate.json/);
  assert.match(candidate, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /host-unaccepted|Preserve the verified Craft|gh release/);
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
  assert.equal(record.schemaVersion, 2); assert.equal(record.status, 'CI_BUILD_NATIVE_VERIFIED');
  assert.equal(record.releaseAccepted, false); assert.equal(record.sourceCommit, sourceCommit);
  assert.equal(record.independentGates, 'PASS_BEFORE_CAPTURE');
  assert.deepEqual(record.coverage, {buildAndNativeRegressions: 'PASS',
    officialHostStartupInjectionClose: 'NOT_RUN_IN_CI', officialHostEditorPreviewExport: 'NOT_RUN_IN_CI',
    officialNsisUpgrade: 'NOT_RUN'});
  assert.match(record.purpose, /no remote editor host acceptance or release approval/);
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

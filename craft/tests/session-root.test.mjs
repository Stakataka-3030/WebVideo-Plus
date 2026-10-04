import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SessionStorage} from '../session/storage.mjs';

const launcher = await fs.readFile(new URL('../launch-injected.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

// Execute the launcher's real initialization fragment without starting Craft.
// The separate wiring assertion ensures both services consume its pinned root.
function initializeSessionRoot(stateDir, sessionId) {
  const initialization = launcher.match(/const sessionRoot\s*=\s*path\.join\(stateDir,\s*['"]sessions['"],\s*sessionId\);[\s\S]*?const root\s*=\s*await fs\.realpath\(sessionRoot\);/);
  assert.ok(initialization, 'launcher must pin the newly created session root');
  assert.match(initialization[0], /await fs\.mkdir\(sessionRoot,\s*\{recursive:\s*true\}\);/);
  return new AsyncFunction('fs', 'path', 'stateDir', 'sessionId', initialization[0] + '\nreturn root;')(fs, path, stateDir, sessionId);
}

async function sandbox(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'craft-session-root-')));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return root;
}

async function allocateSnapshot(root, stateRoot = path.join(root, 'state')) {
  const projectPath = path.join(root, 'project');
  await fs.mkdir(projectPath);
  await fs.writeFile(path.join(projectPath, 'source'), 'source unchanged');
  await fs.mkdir(stateRoot, {recursive: true});
  const storage = new SessionStorage(await fs.realpath(stateRoot));
  const snapshot = await storage.allocate({id: 'p', path: projectPath}, [projectPath]);
  await fs.mkdir(path.join(snapshot.site, 'game', 'scene'), {recursive: true});
  await fs.writeFile(path.join(snapshot.site, 'index.html'), 'owned snapshot');
  await fs.writeFile(path.join(snapshot.site, 'game', 'scene', 'start.txt'), 'story');
  return {storage, snapshot, projectPath};
}

async function assertUnchanged(file, expected) {
  assert.equal(await fs.readFile(file, 'utf8'), expected);
}

async function discardOwned(storage, id) {
  const realRoot = await fs.realpath(storage.root);
  const realParent = await fs.realpath(path.join(storage.root, 'games'));
  const recordedParent = path.dirname(storage.snapshots.get(id).site);
  // Keep diagnostics useful on Windows without logging absolute user paths.
  const diagnostics = {
    platform: process.platform,
    rootMatchesRealPath: storage.root === realRoot,
    rootCaseEquivalent: storage.root.toLowerCase() === realRoot.toLowerCase(),
    parentMatchesRealPath: recordedParent === realParent,
    parentCaseEquivalent: recordedParent.toLowerCase() === realParent.toLowerCase()
  };
  await assert.doesNotReject(() => storage.discard(id), 'snapshot ownership diagnostics: ' + JSON.stringify(diagnostics));
}

test('launcher creates and canonicalizes the session root before sharing it with storage and kernel', () => {
  const create = launcher.indexOf('const sessionRoot');
  const resolve = launcher.search(/const root\s*=\s*await fs\.realpath\(sessionRoot\);/);
  const consumers = launcher.search(/new SessionStorage\(root\)\s*,\s*service\s*=\s*new KernelSession\(\{kernel,root,storage,/);
  assert.ok(create >= 0 && resolve > create && consumers > resolve, 'both services must receive the resolved root');
  const initialization = launcher.slice(create, resolve);
  assert.match(initialization, /await fs\.mkdir\(sessionRoot,\s*\{recursive:\s*true\}\);/);
});

test('canonical owned snapshot discard preserves sources and refuses unknown or repeated IDs', async t => {
  const root = await sandbox(t);
  const {storage, snapshot, projectPath} = await allocateSnapshot(root);
  await storage.ready(snapshot.snapshotId);
  await assert.rejects(storage.discard('not-owned'), /unknown-owned-snapshot/);
  await assertUnchanged(path.join(snapshot.site, 'index.html'), 'owned snapshot');
  await discardOwned(storage, snapshot.snapshotId);
  await assert.rejects(fs.access(snapshot.site), {code: 'ENOENT'});
  assert.equal(storage.snapshots.has(snapshot.snapshotId), false);
  await assert.rejects(storage.discard(snapshot.snapshotId), /unknown-owned-snapshot/);
  await assertUnchanged(path.join(projectPath, 'source'), 'source unchanged');
});

test('launcher pins a directory alias before allocating snapshots and ignores later alias retargeting', async t => {
  const root = await sandbox(t);
  const original = path.join(root, 'original-state');
  const alias = path.join(root, 'state-alias');
  await fs.mkdir(original);
  await fs.symlink(original, alias, 'junction');
  const sessionRoot = await initializeSessionRoot(alias, 'owned-session');
  assert.equal(sessionRoot, await fs.realpath(path.join(original, 'sessions', 'owned-session')));
  const {storage, snapshot, projectPath} = await allocateSnapshot(root, sessionRoot);
  const replacement = path.join(root, 'replacement-state');
  const foreignSnapshot = path.join(replacement, 'sessions', 'owned-session', 'games', snapshot.snapshotId);
  await fs.mkdir(foreignSnapshot, {recursive: true});
  await fs.writeFile(path.join(foreignSnapshot, 'keep'), 'foreign snapshot');
  await fs.unlink(alias);
  await fs.symlink(replacement, alias, 'junction');
  await discardOwned(storage, snapshot.snapshotId);
  await assert.rejects(fs.access(snapshot.site), {code: 'ENOENT'});
  await assertUnchanged(path.join(foreignSnapshot, 'keep'), 'foreign snapshot');
  await assertUnchanged(path.join(projectPath, 'source'), 'source unchanged');
});

test('Windows launcher resolves a legitimate same-directory case alias before allocating snapshots', {skip: process.platform !== 'win32'}, async t => {
  const root = await sandbox(t);
  const stateDir = path.join(root, 'MiXeD-State');
  await fs.mkdir(stateDir);
  const alias = path.join(root, 'mIxEd-sTATE');
  assert.notEqual(alias, stateDir);
  assert.equal(await fs.realpath(alias), await fs.realpath(stateDir));
  const sessionRoot = await initializeSessionRoot(alias, 'owned-session');
  assert.equal(sessionRoot, await fs.realpath(path.join(stateDir, 'sessions', 'owned-session')));
  const {storage, snapshot, projectPath} = await allocateSnapshot(root, sessionRoot);
  await discardOwned(storage, snapshot.snapshotId);
  await assert.rejects(fs.access(snapshot.site), {code: 'ENOENT'});
  await assertUnchanged(path.join(projectPath, 'source'), 'source unchanged');
});

test('snapshot discard refuses a recorded site outside its owned parent', async t => {
  const root = await sandbox(t);
  const {storage, snapshot, projectPath} = await allocateSnapshot(root);
  const foreign = path.join(root, 'foreign', snapshot.snapshotId);
  await fs.mkdir(foreign, {recursive: true});
  await fs.writeFile(path.join(foreign, 'keep'), 'foreign snapshot');
  storage.snapshots.get(snapshot.snapshotId).site = foreign;
  await assert.rejects(storage.discard(snapshot.snapshotId), /snapshot-owner-mismatch/);
  assert.equal(storage.snapshots.has(snapshot.snapshotId), true);
  await assertUnchanged(path.join(foreign, 'keep'), 'foreign snapshot');
  await assertUnchanged(path.join(snapshot.site, 'index.html'), 'owned snapshot');
  await assertUnchanged(path.join(projectPath, 'source'), 'source unchanged');
});

for (const component of ['root', 'games']) {
  test(`snapshot discard refuses a retargeted ${component} directory junction`, async t => {
    const root = await sandbox(t);
    const {storage, snapshot, projectPath} = await allocateSnapshot(root);
    const replaced = component === 'root' ? storage.root : path.join(storage.root, 'games');
    const moved = path.join(root, component + '-original');
    const foreign = path.join(root, 'foreign');
    const suffix = component === 'root' ? path.join('games', snapshot.snapshotId) : snapshot.snapshotId;
    const foreignSnapshot = path.join(foreign, suffix);
    await fs.mkdir(foreignSnapshot, {recursive: true});
    await fs.writeFile(path.join(foreignSnapshot, 'keep'), 'foreign snapshot');
    await fs.rename(replaced, moved);
    await fs.symlink(foreign, replaced, 'junction');
    await assert.rejects(storage.discard(snapshot.snapshotId), /snapshot-owner-mismatch/);
    assert.equal(storage.snapshots.has(snapshot.snapshotId), true);
    await assertUnchanged(path.join(foreignSnapshot, 'keep'), 'foreign snapshot');
    await assertUnchanged(path.join(moved, suffix, 'index.html'), 'owned snapshot');
    await assertUnchanged(path.join(projectPath, 'source'), 'source unchanged');
  });
}

test('snapshot discard refuses a junction replacing the snapshot leaf', async t => {
  const root = await sandbox(t);
  const {storage, snapshot, projectPath} = await allocateSnapshot(root);
  const moved = path.join(root, 'snapshot-original');
  const foreign = path.join(root, 'foreign');
  await fs.mkdir(foreign);
  await fs.writeFile(path.join(foreign, 'keep'), 'foreign snapshot');
  await fs.rename(snapshot.site, moved);
  await fs.symlink(foreign, snapshot.site, 'junction');
  await assert.rejects(storage.discard(snapshot.snapshotId), /snapshot-link-denied/);
  assert.equal(storage.snapshots.has(snapshot.snapshotId), true);
  await assertUnchanged(path.join(foreign, 'keep'), 'foreign snapshot');
  await assertUnchanged(path.join(moved, 'index.html'), 'owned snapshot');
  await assertUnchanged(path.join(projectPath, 'source'), 'source unchanged');
});

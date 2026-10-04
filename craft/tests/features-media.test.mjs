import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const code = await readFile(new URL('../features/media.js', import.meta.url), 'utf8');
const context = { crypto: webcrypto, TextEncoder, setTimeout }; vm.createContext(context); vm.runInContext(code, context);
for (const file of ['vendor/webgal-parser-4.6.5.js', 'script.js']) vm.runInContext(await readFile(new URL('../features/' + file, import.meta.url), 'utf8'), context);
const { createController, normalizeMusic, availableStart, resolveSubtitleAnchor } = context.WebVideoCraftMedia;
const track = (id, lane = 0, start = 0, duration = 10) => ({ id, file: `game/bgm/${id}.ogg`, lane, startSeconds: start, durationSeconds: duration, volume: 100 });
const config = tracks => ({ schemaVersion: 2, enabled: true, players: 2, tracks });
function fixture() {
  const snap = { projectId: 'p', projectPath: 'C:/p', path: 'game/scene/start.txt', sceneRelativePath: 'start.txt', source: 'Alice:Hello;\nwait:500;\nBob:Bye;', revision: 1 };
  let speeds = { textSpeed: 50, autoSpeed: 50 }, dep = 'dependency-one', text = JSON.stringify(config([track('a')])), calls = [], jobs = new Map(), failBackup = false, durationModel = () => 20;
  const bridge = {
    capabilities: () => ({ timing: true, music: true, projectFiles: true, previewSettings: true, audioImport: true }),
    snapshot: () => structuredClone(snap),
    readPreviewSettings: () => ({ ...speeds }),
    writePreviewSettings: (values, options) => { assert.equal(JSON.stringify(options.expected), JSON.stringify(speeds)); speeds = { ...speeds, ...values }; calls.push(['speed', values]); },
    timingDependencyHash: () => dep,
    readProjectFile: () => text,
    writeProjectFile: (path, value, options) => { calls.push([path, value, options]); if (failBackup && path.includes('backups')) throw Error('backup failed'); if (path === 'video-project.json') { assert.equal(options.expectedText, text); text = value; } },
    importAudio: files => files.map(name => ({ file: `game/bgm/${name}`, name })),
    service: async (endpoint, data) => {
      calls.push([endpoint, data]);
      if (endpoint === '/api/config') return { settings: {} };
      if (endpoint === '/api/music/duration') return { durationSeconds: data.file.endsWith('/a.ogg') ? 10 : 7 };
      if (endpoint === '/api/timing') { const id = String(jobs.size + 1); jobs.set(id, data); return { id }; }
      if (endpoint.startsWith('/api/jobs/')) return {};
      const request = jobs.get(endpoint.split('/').at(-1));
      const hash = createHash('sha256').update(request.sourceText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')).digest('hex');
      const seconds = durationModel(request.settings);
      return { job: { state: 'completed' }, sourceHash: hash, timing: { durationSeconds: seconds, storyTimeline: { durationSeconds: seconds, dependencyHash: dep, scenes: [{ scene: 'start.txt', hash, startSeconds: 0, endSeconds: seconds, lineTimes: [0, 5000, 10000] }] } } };
    }
  };
  return { bridge, snap, calls, setDependency: v => dep = v, setText: v => text = v, setSpeeds: v => speeds = v, getSpeeds: () => speeds, failBackup: () => failBackup = true, durationModel: fn => durationModel = fn };
}
test('schema 2 retains parallel lanes, original length and unknown metadata', () => {
  const input = { ...config([track('a'), track('b', 1)]), replaceGameBgm: true, futureField: 8 };
  const result = normalizeMusic(input);
  assert.equal(result.tracks[0].durationSeconds, 10); assert.equal(result.replaceGameBgm, true); assert.equal(result.futureField, 8);
  assert.throws(() => normalizeMusic(config([track('a'), track('b', 0, 3)])), /重叠/);
  assert.throws(() => normalizeMusic(config([{ ...track('a'), loop: true }])), /完整时长/);
  assert.throws(() => normalizeMusic(config([track('a'), track('a', 1)])), /重复/);
  assert.throws(() => normalizeMusic(config([{ ...track('a'), file: '../escape.wav' }])), /路径/);
  assert.throws(() => normalizeMusic(config([{ ...track('a'), durationSeconds: NaN }])), /时长/);
  assert.equal(availableStart([track('a'), track('b', 0, 12)], 0, 8, 5), 22);
});
test('music controller imports actual durations and saves CAS after backup only', async () => {
  const f = fixture(), c = createController(f.bridge); await c.loadMusic();
  await c.addTracks(['new.ogg'], { lane: 0, startSeconds: 2 });
  const added = c.state().music.tracks[1]; assert.equal(added.startSeconds, 10); assert.equal(added.durationSeconds, 7);
  await c.moveTrack(added.id, 1, 0); await c.updateTrack(added.id, { volume: 30 });
  await c.saveMusic();
  const writes = f.calls.filter(x => x[0].includes('.json'));
  assert.match(writes[0][0], /backups/); assert.equal(writes[1][0], 'video-project.json');
  assert.equal(JSON.parse(writes[1][1]).tracks[1].durationSeconds, 7);
});
test('failed backup, stale project and unsupported capability never write configuration', async () => {
  const f = fixture(), c = createController(f.bridge); await c.loadMusic(); f.failBackup();
  await assert.rejects(c.saveMusic(), /backup failed/); assert.equal(f.calls.filter(x => x[0] === 'video-project.json').length, 0);
  f.snap.projectId = 'other'; await assert.rejects(c.addPlayer(), /先读取/);
  f.bridge.capabilities = () => ({}); await assert.rejects(c.measure(), /未绑定/);
});
test('actual timing shares valid cache; source, speeds and full dependencies invalidate', async () => {
  const f = fixture(), c = createController(f.bridge); await c.measure(); await c.measure();
  assert.equal(f.calls.filter(x => x[0] === '/api/timing').length, 1);
  assert.equal((await c.getTiming()).seconds, 20);
  f.setDependency('changed'); await assert.rejects(c.getTiming(), /依赖/); await c.measure();
  f.setSpeeds({ textSpeed: 60, autoSpeed: 50 }); await assert.rejects(c.getTiming(), /速度/);
  await c.measure(); f.snap.revision++; await assert.rejects(c.getTiming(), /已变化/);
});
test('missing dependency capability cannot silently label stale timing fresh', async () => {
  const f = fixture(); delete f.bridge.timingDependencyHash; const c = createController(f.bridge);
  await c.measure(); await c.measure(); assert.equal(f.calls.filter(x => x[0] === '/api/timing').length, 2);
  await assert.rejects(c.getTiming(), /无法确认/);
});
test('source change, cancellation and foreign source hash reject measurement', async () => {
  for (const mutation of ['source', 'abort', 'hash']) {
    const f = fixture(), c = createController(f.bridge), abort = new AbortController(), original = f.bridge.service;
    f.bridge.service = async (endpoint, data) => { const result = await original(endpoint, data); if (/\/api\/timing\//.test(endpoint)) { if (mutation === 'source') f.snap.source += 'changed'; if (mutation === 'abort') abort.abort(); if (mutation === 'hash') result.sourceHash = 'wrong'; } return result; };
    await assert.rejects(c.measure({ signal: abort.signal }), /取消|变化|不一致/);
    assert.ok(f.calls.some(x => /\/cancel$/.test(x[0])));
  }
});
test('segment selections retain exact source/revision including CRLF and arbitrary sets', async () => {
  const f = fixture(); f.snap.source = '\uFEFFsay:A;\r\nwait:1;\r\nsay:B;'; const c = createController(f.bridge); await c.measure();
  const selected = await c.selectSegments([{ startLine: 3, endLine: 3 }, { startLine: 1, endLine: 1 }]);
  assert.equal(selected.revision, 1); assert.equal(selected.ranges.length, 2);
  assert.equal(selected.source.slice(selected.ranges[0].startOffset, selected.ranges[0].endOffset), '\uFEFFsay:A;\r\n');
  await assert.rejects(c.selectSegments([{ startLine: 1, endLine: 2 }, { startLine: 2, endLine: 3 }]), /重叠/);
});
test('subtitle anchors require measured hash and executed line, respect trimmed export bounds', () => {
  const timing = { storyTimeline: { scenes: [{ scene: 'start.txt', hash: 'hash', lineTimes: [null, 7000] }] } }, bounds = { startSeconds: 5, durationSeconds: 10 };
  assert.equal(resolveSubtitleAnchor({ type: 'timeline', scene: 'start.txt', sourceHash: 'hash', line: 2 }, timing, bounds), 2);
  assert.throws(() => resolveSubtitleAnchor({ type: 'timeline', scene: 'start.txt', sourceHash: 'changed', line: 2 }, timing, bounds), /变化/);
  assert.throws(() => resolveSubtitleAnchor({ type: 'timeline', scene: 'start.txt', sourceHash: 'hash', line: 1 }, timing, bounds), /实测/);
  assert.equal(resolveSubtitleAnchor({ type: 'music', musicId: 'a' }, null, bounds, config([track('a', 0, 8)])), 3);
  assert.throws(() => resolveSubtitleAnchor({ type: 'manual', seconds: 12 }, null, bounds), /无效/);
  assert.equal(resolveSubtitleAnchor({ type: 'video' }, null, bounds), 0);
});
test('fit calibrates with actual execution only; does not alter music duration or unselected speed', async () => {
  const f = fixture(); f.durationModel(s => 30 - s.autoSpeed / 5); const c = createController(f.bridge); await c.loadMusic();
  const result = await c.fitToMusic({ textSpeed: false, autoSpeed: true });
  assert.equal(c.state().music.tracks[0].durationSeconds, 10); assert.equal(f.getSpeeds().textSpeed, 50);
  assert.equal(result.seconds, 10); assert.equal(result.matched, true);
  assert.ok(f.calls.filter(x => x[0] === '/api/timing').length <= 3);
});
test('legacy scene-relative tracks migrate using measured scene offsets and probed duration', async () => {
  const f = fixture(); f.setText(JSON.stringify({ schemaVersion: 1, enabled: true, tracks: [{ ...track('a'), scene: 'start.txt', startSeconds: 3 }] }));
  const c = createController(f.bridge); await c.measure(); const migrated = await c.loadMusic();
  assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.tracks[0].startSeconds, 3); assert.equal(migrated.tracks[0].durationSeconds, 10);
  assert.equal(f.calls.filter(x => x[0] === 'video-project.json').length, 0);
});
test('repeat clicks are serialized and stale music loads do not replace current state', async () => {
  const f = fixture(), c = createController(f.bridge); await c.loadMusic();
  let release; f.bridge.readProjectFile = () => new Promise(resolve => { release = resolve; });
  const pending = c.loadMusic({ reload: true }); await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(c.addPlayer(), /进行中/);
  f.snap.projectId = 'other'; release(JSON.stringify(config([track('other')])));
  await assert.rejects(pending, /已变化/); assert.equal(c.state().music.tracks[0].id, 'a');
});
test('save rejects invented or externally changed audio duration before creating backup', async () => {
  const f = fixture(), c = createController(f.bridge); await c.loadMusic();
  const changed = c.state().music; changed.tracks[0].durationSeconds = 99;
  await assert.rejects(c.saveMusic(changed), /时长已变化/);
  assert.equal(f.calls.filter(x => x[0].includes('.json')).length, 0);
});
test('segment durations come from executed line times and source revision remains bound', async () => {
  const f = fixture(), c = createController(f.bridge); await c.measure();
  const selected = await c.selectSegments([{ startLine: 2, endLine: 2 }]);
  assert.equal(selected.ranges[0].startSeconds, 5); assert.equal(selected.ranges[0].durationSeconds, 5);
  f.snap.source += '\nwait:0;'; await assert.rejects(c.selectSegments([{ startLine: 2, endLine: 2 }]), /已变化/);
});
test('video/manual subtitle anchors do not require a music configuration', async () => {
  const f = fixture(), c = createController(f.bridge);
  assert.equal(await c.resolveSubtitle({ type: 'video' }, { startSeconds: 20, durationSeconds: 10 }), 0);
  assert.equal(await c.resolveSubtitle({ type: 'manual', seconds: 2 }, { startSeconds: 20, durationSeconds: 10 }), 2);
});
test('manual preview speeds use engine adapter, validate range and invalidate actual timing', async () => {
  const f = fixture(), c = createController(f.bridge); await c.measure();
  await assert.rejects(c.writeSpeeds({ textSpeed: 101 }), /无效/);
  const result = await c.writeSpeeds({ textSpeed: 75 }); assert.equal(result.textSpeed, 75); assert.equal(result.autoSpeed, 50);
  await assert.rejects(c.getTiming(), /先测量/);
});

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.fail('condition did not settle'); }
const timingStarts = f => f.calls.filter(call => call[0] === '/api/timing');
const timingCancels = f => f.calls.filter(call => /\/cancel$/.test(call[0]));

test('Actual Time and Music share one timing task and independent progress/abort consumers', async () => {
  const f = fixture(), poll = deferred(), original = f.bridge.service, a = new AbortController(), b = new AbortController();
  f.bridge.service = async (...args) => { if (/^\/api\/timing\//.test(args[0])) await poll.promise; return original(...args); };
  const c = createController(f.bridge), updates = [], firstProgress = [], secondProgress = [];
  const unsubscribe = c.subscribe(state => updates.push(state));
  const first = c.measure({ signal: a.signal, force: true, onProgress: p => firstProgress.push(p) });
  const second = c.measure({ signal: b.signal, force: true, onProgress: p => secondProgress.push(p) });
  await until(() => firstProgress.length && secondProgress.length && timingStarts(f).length);
  a.abort(); await assert.rejects(first, /取消/);
  assert.equal(timingStarts(f).length, 1); assert.equal(timingCancels(f).length, 0);
  assert.equal(c.state().measuring, true); poll.resolve();
  assert.equal((await second).seconds, 20); assert.equal(secondProgress.at(-1).state, 'completed');
  assert.equal(c.state().measuring, false); assert.equal(c.state().timing.seconds, 20);
  assert.equal(c.peekTiming(f.snap).seconds, 20);
  assert.ok(updates.some(s => s.measuring)); assert.ok(updates.some(s => s.timing?.seconds === 20));
  unsubscribe(); const count = updates.length; await c.readSpeeds(); assert.equal(updates.length, count);
});

test('last consumer abort cancels an already running timing job once and never publishes it', async () => {
  const f = fixture(), poll = deferred(), original = f.bridge.service, a = new AbortController(), b = new AbortController();
  f.bridge.service = async (...args) => { if (/^\/api\/timing\//.test(args[0])) await poll.promise; return original(...args); };
  const c = createController(f.bridge); let joined = 0;
  const first = c.measure({ signal: a.signal, onProgress: () => joined++ });
  const second = c.measure({ signal: b.signal, onProgress: () => joined++ });
  await until(() => joined >= 2 && timingStarts(f).length);
  a.abort(); await assert.rejects(first, /取消/); b.abort(); await assert.rejects(second, /取消/);
  assert.equal(timingCancels(f).length, 1); poll.resolve();
  await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(c.state().timing, null); assert.equal(timingCancels(f).length, 1);
});

test('abort while a queued job ID is pending cancels that job as soon as it is returned', async () => {
  const f = fixture(), queue = deferred(), original = f.bridge.service, abort = new AbortController();
  f.bridge.service = async (...args) => { const result = await original(...args); if (args[0] === '/api/timing') await queue.promise; return result; };
  const c = createController(f.bridge), pending = c.measure({ signal: abort.signal });
  await until(() => timingStarts(f).length); abort.abort(); await assert.rejects(pending, /取消/);
  assert.equal(timingCancels(f).length, 0); queue.resolve(); await until(() => timingCancels(f).length);
  assert.equal(timingCancels(f).length, 1); assert.equal(c.state().timing, null);
  await c.measure(); assert.equal(timingStarts(f).length, 2);
});

test('controller-wide cancel rejects every consumer, including one still preparing', async () => {
  const f = fixture(), dep = deferred(), original = f.bridge.timingDependencyHash;
  f.bridge.timingDependencyHash = async () => { await dep.promise; return original(); };
  const c = createController(f.bridge), first = c.measure(), second = c.measure();
  await new Promise(resolve => setTimeout(resolve, 1)); await c.cancel(); dep.resolve();
  await assert.rejects(first, /取消/); await assert.rejects(second, /取消/); assert.equal(timingStarts(f).length, 0);
});

test('late old-source result cannot replace the current-source cache', async () => {
  const f = fixture(), old = deferred(), original = f.bridge.service;
  f.bridge.service = async (...args) => { if (args[0] === '/api/timing/1') await old.promise; return original(...args); };
  const c = createController(f.bridge), first = c.measure(); const failed = assert.rejects(first, /已变化/);
  await until(() => timingStarts(f).length); f.snap.source += '\nAlice:New;'; f.snap.revision++;
  const second = await c.measure(); old.resolve(); await failed;
  assert.equal(c.state().timing.snapshot.source, f.snap.source); assert.equal(c.peekTiming(f.snap).sourceHash, second.sourceHash);
  assert.equal(timingStarts(f).length, 2); assert.equal(timingCancels(f).length, 1);
});

test('runtime binding, speed, full settings and dependency changes invalidate measured cache', async () => {
  for (const kind of ['binding', 'speed', 'config', 'dependency', 'sceneHash']) {
    const f = fixture(), poll = deferred(), original = f.bridge.service; let extra = 1;
    f.bridge.service = async (...args) => {
      if (args[0] === '/api/config') return { settings: { voiceVolume: extra } };
      if (/^\/api\/timing\//.test(args[0])) await poll.promise;
      const result = await original(...args);
      if (kind === 'sceneHash' && /^\/api\/timing\//.test(args[0])) result.timing.storyTimeline.scenes[0].hash = 'foreign';
      return result;
    };
    const c = createController(f.bridge), pending = c.measure();
    if (kind !== 'config') {
      const rejected = assert.rejects(pending, /变化|不一致/); await until(() => timingStarts(f).length);
      if (kind === 'binding') f.snap.runtimeBindingSignature = 'different-runtime';
      if (kind === 'speed') f.setSpeeds({ textSpeed: 60, autoSpeed: 50 });
      if (kind === 'dependency') f.setDependency('different-scene');
      poll.resolve(); await rejected; assert.equal(c.peekTiming(f.snap), null);
    } else {
      poll.resolve(); await pending; extra = 2;
      await assert.rejects(c.getTiming(), /设置已变化/); assert.equal(c.peekTiming(f.snap), null);
      await c.measure(); assert.equal(timingStarts(f).length, 2);
    }
  }
});

test('dirty music survives remeasure, same-project source edits and ordinary reopen; discard restores baseline', async () => {
  const f = fixture(), c = createController(f.bridge); await c.loadMusic(); assert.equal(c.state().dirty, false);
  await c.updateTrack('a', { volume: 23 }); assert.equal(c.state().dirty, true);
  await c.measure(); f.snap.source += '\nwait:10;'; f.snap.revision++; await c.measure();
  await c.loadMusic(); assert.equal(c.state().music.tracks[0].volume, 23); assert.equal(c.state().dirty, true);
  await assert.rejects(c.loadMusic({ reload: true }), /尚未保存/);
  c.discardMusic(); assert.equal(c.state().music.tracks[0].volume, 100); assert.equal(c.state().dirty, false);
  await c.moveTrack('a', 0, 0); assert.equal(c.state().dirty, false);
  await c.addPlayer(); assert.equal(c.state().dirty, true); await c.saveMusic(); assert.equal(c.state().dirty, false);
  assert.equal(f.calls.filter(call => call[0] === 'video-project.json').length, 1);
});

test('music drafts are scoped to project path and retained when returning to the original project', async () => {
  const f = fixture(), c = createController(f.bridge); await c.loadMusic(); await c.updateTrack('a', { volume: 20 });
  f.snap.projectPath = 'C:/other-copy'; f.setText(JSON.stringify(config([track('b')])));
  await assert.rejects(c.saveMusic(), /先读取/); await c.loadMusic();
  assert.equal(c.state().music.tracks[0].id, 'b'); assert.equal(c.state().dirty, false);
  f.snap.projectPath = 'C:/p'; await c.loadMusic();
  assert.equal(c.state().music.tracks[0].volume, 20); assert.equal(c.state().dirty, true);
});

test('failed backup or external CAS conflict leaves dirty draft and unknown metadata intact', async () => {
  for (const failure of ['backup', 'cas']) {
    const f = fixture(); f.setText(JSON.stringify({ ...config([{ ...track('a'), futureTrack: { keep: true } }]), futureTop: { keep: 'yes' } }));
    const c = createController(f.bridge); await c.loadMusic(); await c.updateTrack('a', { volume: 42 });
    if (failure === 'backup') f.failBackup(); else f.setText(JSON.stringify(config([])));
    await assert.rejects(c.saveMusic());
    assert.equal(c.state().dirty, true); assert.equal(c.state().music.tracks[0].volume, 42);
    assert.equal(c.state().music.futureTop.keep, 'yes'); assert.equal(c.state().music.tracks[0].futureTrack.keep, true);
  }
});

test('fit uses Terre dialogue formula before measured refinement and publishes exact matching timing', async () => {
  const f = fixture(); f.snap.source = 'Alice:' + 'A'.repeat(100) + ';';
  const duration = values => (100 * (3 + (100 - values.textSpeed) * 1.5) + 200 + (100 - values.textSpeed) * 15 + 250 + (100 - values.autoSpeed) * 15) / 1000;
  f.durationModel(duration); const original = f.bridge.service;
  f.bridge.service = async (...args) => {
    if (args[0] === '/api/music/duration') return { durationSeconds: 7.75 };
    const result = await original(...args);
    if (/^\/api\/timing\//.test(args[0])) { result.timing.lineTimes = [0]; result.timing.elasticWindows = [{}]; result.timing.storyTimeline.scenes[0].lineTimes = [0]; }
    return result;
  };
  const c = createController(f.bridge); await c.loadMusic(); await c.updateTrack('a', { volume: 30 });
  const result = await c.fitToMusic({ textSpeed: true, autoSpeed: false });
  assert.equal(timingStarts(f).length, 2); assert.equal(timingStarts(f)[1][1].settings.textSpeed, 62.122);
  assert.equal(f.getSpeeds().autoSpeed, 50); assert.equal(result.matched, true); assert.ok(Math.abs(result.seconds - 7.75) < .001);
  assert.equal(c.state().dirty, true); assert.equal(c.state().music.tracks[0].durationSeconds, 7.75);
  const cached = await c.getTiming(); assert.equal(cached.seconds, result.seconds); assert.equal(c.peekTiming(f.snap).settings.textSpeed, 62.122);
  await c.measure(); assert.equal(timingStarts(f).length, 2);
});

test('fit performs at most two actual refinements and retains a measured best candidate', async () => {
  const f = fixture(); f.snap.source = 'Alice:' + 'A'.repeat(100) + ';';
  f.durationModel(values => 40 - values.textSpeed * .05);
  const original = f.bridge.service;
  f.bridge.service = async (...args) => {
    if (args[0] === '/api/music/duration') return { durationSeconds: 36.12 };
    const result = await original(...args);
    if (/^\/api\/timing\//.test(args[0])) { result.timing.lineTimes = [0]; result.timing.elasticWindows = [{}]; result.timing.storyTimeline.scenes[0].lineTimes = [0]; }
    return result;
  };
  const c = createController(f.bridge); await c.loadMusic(); const result = await c.fitToMusic({ textSpeed: true, autoSpeed: false });
  assert.ok(timingStarts(f).length <= 3); assert.equal(result.refinementsLimit, 2);
  assert.equal((await c.getTiming()).seconds, result.seconds); assert.equal(result.settings.autoSpeed, 50);
  assert.ok(timingStarts(f).some(call => call[1].settings.textSpeed === result.settings.textSpeed));
});

test('successful CAS followed by a project switch records saved baseline for the original project', async () => {
  const f = fixture(), c = createController(f.bridge); await c.loadMusic(); await c.updateTrack('a', { volume: 40 });
  const write = f.bridge.writeProjectFile;
  f.bridge.writeProjectFile = async (...args) => { const result = await write(...args); if (args[0] === 'video-project.json') f.snap.projectId = 'other'; return result; };
  await assert.rejects(c.saveMusic(), /已变化/);
  assert.equal(c.state().dirty, false); assert.equal(c.state().music.tracks[0].volume, 40);
  await c.loadMusic(); assert.equal(c.state().projectId, 'other');
  f.snap.projectId = 'p'; await c.loadMusic(); await c.updateTrack('a', { volume: 45 });
  f.bridge.writeProjectFile = write; await c.saveMusic(); assert.equal(c.state().dirty, false);
  assert.equal(c.state().music.tracks[0].volume, 45);
});

test('timing-relevant config changes while a measurement runs reject the stale result', async () => {
  const f = fixture(), poll = deferred(), original = f.bridge.service; let fps = 30;
  f.bridge.service = async (...args) => { if (args[0] === '/api/config') return { settings: { fps } }; if (/^\/api\/timing\//.test(args[0])) await poll.promise; return original(...args); };
  const c = createController(f.bridge), pending = c.measure(), rejected = assert.rejects(pending, /计时设置已变化/);
  await until(() => timingStarts(f).length); fps = 60; poll.resolve(); await rejected;
  assert.equal(c.state().timing, null);
});

test('discarding a schema-1 migration clears close guard without writing the original file', async () => {
  const f = fixture(); f.setText(JSON.stringify({ schemaVersion: 1, enabled: true, tracks: [{ ...track('a'), scene: 'start.txt', startSeconds: 3 }], future: 'keep' }));
  const c = createController(f.bridge); await c.measure(); await c.loadMusic(); assert.equal(c.state().dirty, true);
  await c.updateTrack('a', { volume: 12 }); c.discardMusic();
  assert.equal(c.state().dirty, false); assert.equal(c.state().music.tracks[0].volume, 100); assert.equal(c.state().music.future, 'keep');
  await c.loadMusic(); assert.equal(c.state().dirty, false); assert.equal(f.calls.filter(call => call[0] === 'video-project.json').length, 0);
  await c.saveMusic(); assert.equal(c.state().music.schemaVersion, 2);
});

test('one consumer can abort during shared dependency preparation without waiting or stopping the other', async () => {
  const f = fixture(), dep = deferred(), original = f.bridge.timingDependencyHash, a = new AbortController(); let preparing = 0;
  f.bridge.timingDependencyHash = async () => { preparing++; await dep.promise; return original(); };
  const c = createController(f.bridge), first = c.measure({ signal: a.signal }), second = c.measure();
  await until(() => preparing); a.abort(); await assert.rejects(first, /取消/);
  assert.equal(timingStarts(f).length, 0); dep.resolve(); assert.equal((await second).seconds, 20);
  assert.equal(timingStarts(f).length, 1); assert.equal(timingCancels(f).length, 0);
});

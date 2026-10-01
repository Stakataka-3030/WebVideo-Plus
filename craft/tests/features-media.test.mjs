import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const code = await readFile(new URL('../features/media.js', import.meta.url), 'utf8');
const context = { crypto: webcrypto, TextEncoder, setTimeout }; vm.createContext(context); vm.runInContext(code, context);
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
  const pending = c.loadMusic(); await new Promise(resolve => setTimeout(resolve, 0));
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

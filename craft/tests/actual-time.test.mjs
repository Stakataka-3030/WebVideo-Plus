import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Node, makeDocument } from './ui-dom.mjs';

// Official beta.2 DOM contract fixture, not a rendered WebView2 acceptance test.
class NativeNode extends Node {
  insertBefore(node, next) {
    node.remove(); const index = this.children.indexOf(next);
    assert.ok(index >= 0); this.children.splice(index, 0, node); node.parentNode = this;
  }
}
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const copy = value => JSON.parse(JSON.stringify(value));
const identity = s => JSON.stringify([s.projectId, s.projectPath, s.path, s.source, s.revision, s.engineId, s.runtimeBindingSignature]);
function fixture({ source = 'A:first;\nB:second;', cached = false, pending = false, capabilities = {}, controllerMissing = false, partial = false } = {}) {
  const dom = makeDocument(), { document } = dom;
  document.createElement = tag => { const node = new NativeNode(tag); node.ownerDocument = document; return node; };
  const node = (tag, attributes = {}) => {
    const result = document.createElement(tag); for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value); return result;
  };
  const nativeContent = node('div', { 'data-visual-editor-content': '' }), list = node('div', { role: 'listbox' });
  nativeContent.append(list); dom.editorArea.append(nativeContent);
  let current = { projectId: 'project-one', projectPath: 'C:/Project', path: 'C:/Project/game/scene/a.txt', sceneRelativePath: 'a.txt', source, revision: '1', engineId: 'official', runtimeBindingSignature: 'binding', runtimeCapabilities: { multilineStatements: true, changeFigureDiff: true, transformFrom: true, ...capabilities } };
  const bridgeListeners = new Set(), mediaListeners = new Set(), calls = { measure: [], full: 0, speeds: 0, cancel: 0, mutations: 0 }, intervals = new Map(), observers = [];
  const storage = new Map(); let validationWait = null, preserveValidationCache = false;
  let nextInterval = 0, state = { measuring: false, progress: null }, result = null, rejectValidation = null, rejectSpeeds = null, jobs = [];
  const context = vm.createContext({ console, document, AbortController, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    setInterval: fn => { intervals.set(++nextInterval, fn); return nextInterval; }, clearInterval: key => intervals.delete(key),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
      disconnect() { this.disconnected = true; }
    },
  }); context.window = context;
  for (const file of ['features/vendor/webgal-parser-4.6.5.js', 'features/script.js', 'ui/actual-time.js']) vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  const makeTiming = (captured = current, times = captured.source.split('\n').map((_, i) => i * 1500)) => ({ seconds: 12, timing: { storyTimeline: { durationSeconds: 12, scenes: [{ scene: captured.sceneRelativePath, hash: 'source-hash', startSeconds: 0, endSeconds: 12, lineTimes: times }] } }, sourceHash: 'source-hash', dependencyHash: 'dependencies', settings: { textSpeed: 0, autoSpeed: 0 }, snapshot: copy(captured) });
  function notifyMedia() { for (const callback of mediaListeners) callback(state); }
  function setTiming(times) { result = makeTiming(current, times); notifyMedia(); }
  if (cached) result = makeTiming();
  const controller = {
    state: () => copy(state), subscribe: fn => { mediaListeners.add(fn); return () => mediaListeners.delete(fn); },
    peekTiming: snapshot => result && snapshot && identity(result.snapshot) === identity(snapshot) ? copy(result) : null,
    async getTiming() { calls.full++; if (validationWait) await validationWait; if (rejectValidation) { if (!preserveValidationCache) result = null; throw Error(rejectValidation); } return copy(result); },
    async readSpeeds() { calls.speeds++; if (rejectSpeeds) { notifyMedia(); throw Error(rejectSpeeds); } return { textSpeed: 0, autoSpeed: 0 }; },
    measure(options) {
      calls.measure.push(options); const captured = copy(current); state.measuring = true; state.progress = { message: '正在运行场景' }; notifyMedia(); options.onProgress?.(state.progress);
      return new Promise((resolve, reject) => {
        const job = {
          complete(times) { result = makeTiming(captured, times); state.measuring = false; state.progress = null; notifyMedia(); resolve(copy(result)); },
          fail(message) { state.measuring = false; state.progress = null; notifyMedia(); reject(Error(message)); },
        };
        jobs.push(job);
        options.signal.addEventListener('abort', () => { state.measuring = false; state.progress = null; notifyMedia(); reject(Error('操作已取消')); }, { once: true });
        if (!pending) job.complete();
      });
    },
    cancel() { calls.cancel++; },
  };
  const bridge = { snapshot: async () => copy(current), capabilities: () => ({ timing: true, previewSettings: true }), subscribe: fn => { bridgeListeners.add(fn); return () => bridgeListeners.delete(fn); }, navigate() { calls.mutations++; }, commit() { calls.mutations++; } };
  function addRow(index) {
    const wrapper = node('div', { 'data-index': index }), sort = node('div'), update = node('div'), relative = node('div'), card = node('div', { role: 'option', 'aria-selected': index === 0 ? 'true' : 'false', tabindex: '-1' });
    const header = node('div'), drag = node('div', { 'data-statement-drag-handle': '' }), grip = node('div'), ordinal = node('div'), stripe = node('div'), copy = node('div'), actions = node('div'), play = node('button'), collapse = node('button');
    ordinal.textContent = String(index + 1).padStart(2, '0'); drag.append(grip, ordinal); actions.append(play, collapse); header.append(drag, stripe, copy, actions); card.append(header); relative.append(card); update.append(relative); sort.append(update); wrapper.append(sort); list.append(wrapper);
    return { wrapper, card, header, drag, ordinal, actions, play, collapse };
  }
  const cards = [addRow(0), addRow(1)];
  let api = context.WebVideoCraftActualTime.mount({ bridge, controller: controllerMissing ? null : partial ? { state: () => ({}) } : controller });
  const elements = () => ({ input: document.querySelector('input'), refresh: document.querySelector('.wvc-time-refresh'), status: document.querySelector('.wvc-time-status') });
  return { ...dom, node, nativeContent, list, context, controller, bridge, cards, addRow, calls, storage, observers, intervals, bridgeListeners, mediaListeners,
    get api() { return api; }, get jobs() { return jobs; }, get snapshot() { return current; }, elements,
    badges: () => document.querySelectorAll('.wvc-time-badge').map(n => n.textContent),
    setTiming, notifyMedia,
    invalidateSpeeds(message = '预览速度已变化，请重新测量') { rejectSpeeds = message; },
    recoverSpeeds() { rejectSpeeds = null; },
    rejectValidation(message, preserveCache = false) { rejectValidation = message; preserveValidationCache = preserveCache; },
    waitValidation(promise) { validationWait = promise; },
    update(patch) { current = { ...current, ...patch }; for (const callback of bridgeListeners) callback(); },
    async toggle(value) { const { input } = elements(); input.checked = value; await input.emit('change'); await flush(); },
    async tick() { for (const fn of intervals.values()) fn(); await flush(); },
    mutate(records = []) { observers.at(-1)?.callback(records); },
    mountAgain() { api = context.WebVideoCraftActualTime.mount({ bridge, controller }); },
  };
}

test('checkbox and refresh mount once in native toolbar; default off does no measurement or selection', async () => {
  const f = fixture(); await flush();
  assert.equal(f.document.querySelector('.wvc-time-controls').parentElement, f.toolbar);
  assert.equal(f.elements().input.checked, false); assert.equal(f.elements().refresh.hidden, true);
  assert.equal(f.calls.measure.length, 0); assert.deepEqual(f.badges(), []);
  await f.api.remount(); assert.equal(f.document.querySelectorAll('.wvc-time-controls').length, 1);
  assert.equal(f.calls.mutations, 0); f.api.dispose();
});

test('enabling uses real global story start and duration, including blank/comment/multiline native indices', async () => {
  const f = fixture({ source: 'A:line\n  -next;\n\n; comment\nB:last;\n', pending: true });
  f.addRow(2); f.addRow(3); f.addRow(4); await flush(); await f.toggle(true);
  assert.equal(f.calls.measure.length, 1); assert.deepEqual(f.badges(), []);
  f.jobs[0].complete([61200, null, null, null, 63000, null]); await flush();
  // Last statement must end at the actual scene boundary, not a guessed default.
  f.setTiming([1200, null, null, null, 3000, null]); await flush();
  assert.deepEqual(f.badges(), ['00:01.2 · 1.8s', '—', '—', '00:03.0 · 9.0s', '—']);
  assert.equal(f.cards[0].header.children.at(-1), f.cards[0].actions); assert.equal(f.cards[0].card.getAttribute('aria-selected'), 'true');
  assert.equal(f.calls.mutations, 0); f.api.dispose();
});

test('4.6.4 line mode preserves native blank rows and does not collapse continuation-looking lines', async () => {
  const f = fixture({ source: 'A:first;\n  -next;\n\nB:last;', cached: true, capabilities: { multilineStatements: false } });
  f.addRow(2); f.addRow(3); await flush(); await f.toggle(true);
  f.setTiming([60000, 60000, null, 61250]); await flush();
  // Invalid end-before-start is hidden instead of manufacturing a duration.
  assert.deepEqual(f.badges(), ['01:00.0 · 0.0s', '01:00.0 · 1.3s', '—']); f.api.dispose();
});

test('cached result is fully validated on enable; timer only reads cheap speed state', async () => {
  const f = fixture({ cached: true }); await flush(); await f.toggle(true);
  assert.equal(f.calls.full, 1); assert.equal(f.calls.measure.length, 0);
  assert.deepEqual(f.badges(), ['00:00.0 · 1.5s', '00:01.5 · 10.5s']);
  await f.tick(); await f.tick(); assert.equal(f.calls.speeds, 2); assert.equal(f.calls.full, 1);
  f.update({ line: 2 }); await flush(); assert.equal(f.calls.full, 1); assert.equal(f.calls.measure.length, 0); f.api.dispose();
});

test('source edits hide stale times without automatic retry and explicit refresh recomputes once', async () => {
  const f = fixture({ cached: true, pending: true }); await flush(); await f.toggle(true);
  f.update({ source: 'A:edited;\nB:second;', revision: '2' }); await flush();
  assert.deepEqual(f.badges(), []); assert.equal(f.calls.measure.length, 0); assert.match(f.elements().status.textContent, /重新计算/);
  await f.elements().refresh.click(); await f.elements().refresh.click(); await flush();
  assert.equal(f.calls.measure.length, 1); assert.equal(f.calls.measure[0].force, true); assert.equal(f.elements().refresh.disabled, true);
  f.jobs[0].complete([1000, 2000]); await flush(); assert.deepEqual(f.badges(), ['00:01.0 · 1.0s', '00:02.0 · 10.0s']); f.api.dispose();
});

test('speed changes invalidate badges and dependency rejection never displays an estimate', async () => {
  const f = fixture({ cached: true, pending: true }); await flush(); await f.toggle(true);
  f.invalidateSpeeds(); await f.tick(); assert.deepEqual(f.badges(), []); assert.match(f.elements().status.textContent, /预览速度/); assert.equal(f.calls.measure.length, 0); f.api.dispose();
  const g = fixture({ cached: true, pending: true }); await flush(); g.rejectValidation('其他场景已变化'); await g.toggle(true);
  assert.deepEqual(g.badges(), []); assert.equal(g.calls.measure.length, 1); g.jobs[0].fail('请先保存 Craft 文档'); await flush();
  assert.match(g.elements().status.textContent, /请先保存/); g.api.dispose();
});

test('project preference follows scene switches and project changes abort only own consumer', async () => {
  const f = fixture({ cached: true, pending: true }); await flush(); await f.toggle(true);
  const keys = [...f.storage.keys()]; assert.equal(keys.length, 1); assert.doesNotMatch(keys[0], /a\.txt/);
  f.update({ path: 'C:/Project/game/scene/b.txt', sceneRelativePath: 'b.txt' }); await flush();
  assert.equal(f.elements().input.checked, true); assert.equal(f.calls.measure.length, 1);
  f.update({ projectId: 'two', projectPath: 'C:/Other', path: 'C:/Other/game/scene/a.txt' }); await flush();
  assert.equal(f.calls.measure[0].signal.aborted, true); assert.equal(f.calls.cancel, 0); assert.equal(f.elements().input.checked, false); assert.deepEqual(f.badges(), []);
  f.api.dispose();
});

test('virtualized rows are keyed by verified data-index and ordinal, never DOM position', async () => {
  const f = fixture({ source: 'A:first;\nB:second;\nC:third;', cached: true }); await flush(); await f.toggle(true);
  f.cards[0].wrapper.setAttribute('data-index', '2'); f.mutate(); assert.deepEqual(f.badges(), ['00:01.5 · 1.5s']);
  f.cards[0].ordinal.textContent = '03'; f.mutate(); assert.deepEqual(f.badges(), ['00:03.0 · 9.0s', '00:01.5 · 1.5s']);
  f.cards[1].wrapper.remove(); f.addRow(0); f.mutate(); assert.deepEqual(f.badges(), ['00:03.0 · 9.0s', '00:00.0 · 1.5s']);
  f.api.dispose(); assert.deepEqual(f.badges(), []);
});

test('toolbar and visual DOM replacement remount cleanly; missing native anchors remove badges', async () => {
  const f = fixture({ cached: true }); await flush(); await f.toggle(true);
  const oldControl = f.document.querySelector('.wvc-time-controls');
  const newToolbar = f.node('div'), mode = f.document.querySelector('[data-tour="mode-switch"]');
  f.toolbar.parentElement.append(newToolbar); newToolbar.append(mode); f.mutate();
  assert.equal(oldControl.parentElement, newToolbar); assert.equal(f.document.querySelectorAll('.wvc-time-controls').length, 1);
  mode.remove(); f.mutate(); assert.equal(f.document.querySelectorAll('.wvc-time-controls').length, 0); assert.deepEqual(f.badges(), []); f.api.dispose();
});

test('uncheck and disposal abort only widget signal and remove subscriptions, observer, timer, badges', async () => {
  const f = fixture({ pending: true }); await flush(); await f.toggle(true); await f.toggle(false);
  assert.equal(f.calls.measure[0].signal.aborted, true); assert.equal(f.calls.cancel, 0); assert.deepEqual(f.badges(), []);
  await f.toggle(true); assert.equal(f.calls.measure.length, 2); f.api.dispose(); await flush();
  assert.equal(f.calls.measure[1].signal.aborted, true); assert.equal(f.calls.cancel, 0);
  assert.equal(f.bridgeListeners.size, 0); assert.equal(f.mediaListeners.size, 0); assert.equal(f.intervals.size, 0); assert.equal(f.observers[0].disconnected, true);
  assert.equal(f.document.querySelectorAll('.wvc-time-controls').length, 0);
  f.jobs[1].complete(); await flush(); assert.deepEqual(f.badges(), []);
});

test('duplicate mount disposes previous widget and persisted project preference survives remount', async () => {
  const f = fixture({ cached: true }); await flush(); await f.toggle(true); f.mountAgain(); await flush();
  assert.equal(f.document.querySelectorAll('.wvc-time-controls').length, 1); assert.equal(f.elements().input.checked, true);
  assert.equal(f.bridgeListeners.size, 1); assert.equal(f.mediaListeners.size, 1); assert.equal(f.intervals.size, 1);
  f.api.dispose();
});

test('missing controller is inert; older partial controller shows disabled unavailable controls', async () => {
  const f = fixture({ controllerMissing: true }); await flush(); assert.equal(f.document.querySelectorAll('.wvc-time-controls').length, 0); f.api.dispose();
  const g = fixture({ partial: true }); await flush(); assert.equal(g.elements().input.disabled, true); assert.equal(g.elements().status.hidden, false); assert.match(g.elements().status.textContent, /尚未提供/); g.api.dispose();
});


test('slow full validation hides old cached badges across controller emissions and resolves once proven', async () => {
  const f = fixture({ cached: true }); await flush();
  let resolve; f.waitValidation(new Promise(done => { resolve = done; }));
  await f.toggle(true);
  assert.equal(f.calls.full, 1); assert.deepEqual(f.badges(), []);
  f.notifyMedia(); assert.deepEqual(f.badges(), []);
  resolve(); await flush(); assert.deepEqual(f.badges(), ['00:00.0 · 1.5s', '00:01.5 · 10.5s']);
  f.api.dispose();
});


test('speed read failure suppresses even an unchanged controller cache until a successful validation', async () => {
  const f = fixture({ cached: true }); await flush(); await f.toggle(true);
  f.invalidateSpeeds('无法读取预览设置'); await f.tick();
  assert.ok(f.controller.peekTiming(f.snapshot)); assert.deepEqual(f.badges(), []);
  f.notifyMedia(); f.mutate(); assert.deepEqual(f.badges(), []); assert.match(f.elements().status.textContent, /无法读取/);
  await f.tick(); assert.deepEqual(f.badges(), []);
  f.recoverSpeeds(); await f.tick();
  assert.deepEqual(f.badges(), ['00:00.0 · 1.5s', '00:01.5 · 10.5s']); f.api.dispose();
});


test('failed dependency proof remains blocked across successful speed polls until refreshed measurement', async () => {
  const f = fixture({ cached: true, pending: true }); await flush();
  f.rejectValidation('依赖校验暂时不可用', true); await f.toggle(true);
  assert.ok(f.controller.peekTiming(f.snapshot)); assert.deepEqual(f.badges(), []); assert.equal(f.calls.measure.length, 0);
  await f.tick(); f.notifyMedia(); assert.deepEqual(f.badges(), []); assert.match(f.elements().status.textContent, /依赖校验/);
  await f.elements().refresh.click(); f.jobs[0].complete([1000, 2000]); await flush();
  assert.deepEqual(f.badges(), ['00:01.0 · 1.0s', '00:02.0 · 10.0s']); f.api.dispose();
});

test('late full validation cannot revive a disposed or newly remounted widget', async () => {
  const f = fixture({ cached: true }); await flush();
  let resolve; f.waitValidation(new Promise(done => { resolve = done; })); await f.toggle(true);
  f.api.dispose(); resolve(); await flush(); f.notifyMedia();
  assert.deepEqual(f.badges(), []); assert.equal(f.document.querySelectorAll('.wvc-time-controls').length, 0);
});

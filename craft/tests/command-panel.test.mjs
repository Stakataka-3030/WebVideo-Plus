import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Event propagation/DOM-contract fixture. This does not claim WebView2 pixel acceptance.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
    this.attrs = {}; this.className = ''; this._text = ''; this.events = new Map();
  }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set textContent(value) { this._text = value; this.children.forEach(n => { n.parentElement = null; }); this.children = []; }
  get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
  get isConnected() { return this.tagName === '#DOCUMENT' || !!this.parentElement?.isConnected; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  append(...children) { children.forEach(child => { child.remove(); this.children.push(child); child.parentElement = this; }); }
  insertBefore(child, next) {
    child.remove(); const index = next ? this.children.indexOf(next) : this.children.length;
    assert.ok(index >= 0); this.children.splice(index, 0, child); child.parentElement = this;
  }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; }
  matches(selector) {
    return selector.split(',').some(value => {
      const s = value.trim();
      if (!s.startsWith('[')) return this.tagName === s.toUpperCase();
      const parts = [...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
      return parts.length > 0 && parts.every(([, key, value]) => value === undefined ? this.getAttribute(key) !== null : this.getAttribute(key) === value);
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  addEventListener(type, fn, capture = false) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push({ fn, capture }); }
  removeEventListener(type, fn, capture = false) { this.events.set(type, (this.events.get(type) || []).filter(e => e.fn !== fn || e.capture !== capture)); }
  dispatch(type, values = {}) {
    const event = { type, target: this, currentTarget: null, detail: 0, button: 0, pointerId: 1, isPrimary: true,
      defaultPrevented: false, stopped: false, immediate: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.immediate = true; this.stopped = true; }, ...values };
    const path = []; for (let n = this; n; n = n.parentElement) path.push(n);
    const invoke = (node, capture) => {
      event.currentTarget = node;
      for (const listener of [...(node.events.get(type) || [])]) {
        if (listener.capture === capture) listener.fn(event);
        if (event.immediate) break;
      }
    };
    for (const node of [...path].reverse()) { invoke(node, true); if (event.stopped) return event; }
    for (const node of path) { invoke(node, false); if (event.stopped) return event; }
    return event;
  }
}
function fixture(types = [7, 4, 23, 24, 32, 10, 17]) {
  const document = new Element('#document'), body = new Element('body'), panel = new Element('section');
  document.body = body; document.append(body); body.append(panel); panel.setAttribute('data-tour', 'command-panel');
  document.createElement = tag => new Element(tag); document.createElementNS = (_, tag) => new Element(tag);
  const categories = new Element('div'), grid = new Element('div'); panel.append(categories, grid);
  const categoryButton = new Element('button'); categories.append(categoryButton); categoryButton.textContent = 'Display / 任意语言';
  const confirmations = [], timerCallbacks = new Map(), observers = [], native = { inserted: [], pointers: [], favorites: 0, defaults: 0 };
  let answer = true, nextTimer = 0, hintCount = 0;
  const windowEvents = new Element('window');
  const context = vm.createContext({ document, console,
    confirm: message => { confirmations.push(message); return answer; },
    setTimeout: fn => { timerCallbacks.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timerCallbacks.delete(id),
    addEventListener: (...args) => windowEvents.addEventListener(...args),
    removeEventListener: (...args) => windowEvents.removeEventListener(...args),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
      disconnect() { this.disconnected = true; }
    },
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(new URL('../ui/command-panel.js', import.meta.url), 'utf8'), context);
  const cards = new Map();
  function card(type, label = `Translated title ${type}`) {
    const node = new Element('div'), stripe = new Element('div'), copy = new Element('div');
    node.className = 'group text-left border rounded-lg bg-card w-full cursor-pointer';
    node.setAttribute('data-command-panel-drag-kind', 'command'); node.setAttribute('data-command-panel-command-type', type);
    node.setAttribute('role', 'button'); node.setAttribute('tabindex', 0);
    stripe.className = 'w-1 bg-gradient-to-b from-teal-500 to-teal-300';
    copy.className = 'py-1.75 pl-4 pr-2 flex gap-2.5 min-w-0 items-center';
    const icon = new Element('div'), title = new Element('div'); icon.className = 'p-1 rounded-md text-teal-500';
    title.className = 'text-sm font-medium truncate'; title.textContent = label; copy.append(icon, title);
    const actions = new Element('div'), favorite = new Element('button'), defaults = new Element('button');
    favorite.setAttribute('title', 'Favorite'); defaults.setAttribute('title', 'Edit defaults');
    actions.append(defaults, favorite); node.append(stripe, copy, actions);
    for (const type of ['click', 'keydown', 'pointerdown']) actions.addEventListener(type, e => e.stopPropagation());
    favorite.addEventListener('click', () => { native.favorites++; }); defaults.addEventListener('click', () => { native.defaults++; });
    node.addEventListener('click', () => { native.inserted.push(Number(type)); });
    node.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); native.inserted.push(Number(type)); } });
    node.addEventListener('pointerdown', () => { native.pointers.push(Number(type)); });
    grid.append(node); cards.set(type, { node, title, icon, actions, favorite, defaults }); return cards.get(type);
  }
  types.forEach(type => card(type));
  let api = context.WebVideoCraftCommandPanel.mount({ openHint: () => { hintCount++; } });
  const flushTimers = () => { const callbacks = [...timerCallbacks.values()]; timerCallbacks.clear(); callbacks.forEach(fn => fn()); };
  return { context, document, body, panel, categories, grid, categoryButton, cards, native, confirmations, observers,
    card, windowEvents, flushTimers, get api() { return api; }, get hintCount() { return hintCount; },
    get hints() { return document.querySelectorAll('[data-wvc-command="hint"]'); },
    answer(value) { answer = value; }, remount() { return api.remount(); },
    mountAgain() { api = context.WebVideoCraftCommandPanel.mount({ openHint: () => { hintCount++; } }); },
    pointerClick(type) { const n = cards.get(type).title; n.dispatch('pointerdown'); n.dispatch('pointerup'); n.dispatch('click', { detail: 1 }); flushTimers(); },
  };
}

test('hint is a native display-grid card beside video, with host typography and no drag metadata', () => {
  const f = fixture(); const hint = f.hints[0];
  assert.equal(f.hints.length, 1); assert.equal(hint.parentElement, f.grid); assert.equal(f.cards.get(4).node.nextElementSibling, hint);
  assert.equal(f.categories.children.length, 1); assert.equal(hint.className, f.cards.get(4).node.className);
  assert.equal(hint.children[1].children[1].className, 'text-sm font-medium truncate');
  assert.equal(hint.getAttribute('data-command-panel-command-type'), null); assert.equal(hint.getAttribute('aria-disabled'), null);
  hint.dispatch('click'); hint.dispatch('keydown', { key: 'Enter' }); hint.dispatch('keydown', { key: ' ', repeat: true });
  assert.equal(f.hintCount, 2); assert.deepEqual(f.native.inserted, []); f.api.dispose();
});

test('only export-blocked IDs are marked; static changeScene and native controls remain normal', () => {
  const f = fixture(Array.from({ length: 37 }, (_, i) => i));
  const expected = [10, 15, 16, 17, 18, 19, 20, 31, 35];
  assert.deepEqual([...f.cards].filter(([, c]) => c.node.getAttribute('data-wvc-export-unsupported')).map(([id]) => id), expected);
  for (const { node, favorite, defaults } of f.cards.values()) {
    assert.equal(node.getAttribute('aria-disabled'), null); assert.equal(node.getAttribute('tabindex'), '0');
    assert.equal(favorite.getAttribute('disabled'), null); assert.equal(defaults.getAttribute('disabled'), null);
  }
  const source = fs.readFileSync(new URL('../../src/ProjectAssets.cs', import.meta.url), 'utf8');
  const forbidden = source.match(/var forbidden=new HashSet<string>\(new\[\]\{([^}]+)\}\)/)[1].match(/"([^"]+)"/g).map(s => s.slice(1, -1)).filter(name => name !== 'changeScene').sort();
  const chain = fs.readFileSync(new URL('../../src/SceneChain.cs', import.meta.url), 'utf8');
  assert.match(chain, /WebVideo\+ flattened changeScene/);
  f.pointerClick(9); assert.equal(f.confirmations.length, 0);
  assert.deepEqual([...f.cards.values()].map(c => c.node.getAttribute('data-wvc-export-unsupported')).filter(Boolean).sort(), forbidden);
  f.api.dispose();
});

test('mouse confirmation approves the original native event once; cancel blocks pointer and click insertion', () => {
  const f = fixture(); f.answer(false); f.pointerClick(10);
  assert.equal(f.confirmations.length, 1); assert.deepEqual(f.native.pointers, []); assert.deepEqual(f.native.inserted, []);
  f.answer(true); f.pointerClick(10);
  assert.equal(f.confirmations.length, 2); assert.deepEqual(f.native.pointers, [10]); assert.deepEqual(f.native.inserted, [10]);
  f.pointerClick(7); assert.equal(f.confirmations.length, 2); assert.deepEqual(f.native.inserted, [10, 7]); f.api.dispose();
});

test('native favorites, edit defaults, action-padding and other editor controls retain their behavior', () => {
  const f = fixture(), c = f.cards.get(10); f.answer(false);
  c.favorite.dispatch('pointerdown'); c.favorite.dispatch('click'); c.defaults.dispatch('click');
  c.actions.dispatch('pointerdown'); c.actions.dispatch('keydown', { key: 'Enter' });
  c.favorite.dispatch('keydown', { key: 'Enter' }); f.categoryButton.dispatch('click');
  const editor = new Element('div'); f.body.append(editor); c.node.remove(); editor.append(c.node);
  c.title.dispatch('click');
  assert.equal(f.confirmations.length, 0); assert.equal(f.native.favorites, 1); assert.equal(f.native.defaults, 1);
  assert.deepEqual(f.native.inserted, [10]); f.api.dispose();
});

test('keyboard Enter/Space requires approval, suppresses repeats and follow-on synthetic click', () => {
  const f = fixture(), c = f.cards.get(17).node; f.answer(false);
  c.dispatch('keydown', { key: 'Enter' }); c.dispatch('keydown', { key: 'Enter', repeat: true });
  c.dispatch('keyup', { key: 'Enter' }); c.dispatch('click'); f.flushTimers();
  assert.equal(f.confirmations.length, 1); assert.deepEqual(f.native.inserted, []);
  f.answer(true); c.dispatch('keydown', { key: ' ' }); c.dispatch('keydown', { key: ' ', repeat: true });
  c.dispatch('keyup', { key: ' ' }); c.dispatch('click'); f.flushTimers();
  assert.equal(f.confirmations.length, 2); assert.deepEqual(f.native.inserted, [17]);
  c.dispatch('click'); assert.equal(f.confirmations.length, 3); assert.deepEqual(f.native.inserted, [17, 17]); f.api.dispose();
});

test('pointer-driven native drag and alternate dragstart cannot bypass warning or prompt twice', () => {
  const f = fixture(), c = f.cards.get(10).node; f.answer(false);
  assert.equal(c.dispatch('pointerdown').defaultPrevented, true);
  assert.equal(c.dispatch('dragstart').defaultPrevented, true); assert.equal(f.confirmations.length, 1);
  c.dispatch('pointercancel'); f.answer(true);
  assert.equal(c.dispatch('pointerdown').defaultPrevented, false);
  assert.equal(c.dispatch('dragstart').defaultPrevented, false); assert.equal(f.confirmations.length, 2);
  c.dispatch('dragend'); f.flushTimers(); f.answer(false);
  assert.equal(c.dispatch('dragstart').defaultPrevented, true); assert.equal(f.confirmations.length, 3);
  assert.deepEqual(f.native.pointers, [10]); f.api.dispose();
});

test('gesture approval never leaks across cards, cancelled gestures, focus loss or later clicks', () => {
  const f = fixture(), a = f.cards.get(10).node, b = f.cards.get(17).node;
  a.dispatch('pointerdown'); f.answer(false); b.dispatch('click', { detail: 1 });
  assert.equal(f.confirmations.length, 2); assert.deepEqual(f.native.inserted, []);
  f.answer(true); a.dispatch('pointerdown'); a.dispatch('pointerup'); f.flushTimers();
  f.answer(false); a.dispatch('click', { detail: 1 }); assert.deepEqual(f.native.inserted, []);
  f.answer(true); a.dispatch('pointerdown'); f.windowEvents.dispatch('blur'); f.answer(false); a.dispatch('click', { detail: 1 });
  assert.deepEqual(f.native.inserted, []); f.api.dispose();
});

test('remount follows category, language, card ID and route replacements without duplicates', () => {
  const f = fixture(); f.remount(); f.remount(); assert.equal(f.hints.length, 1);
  f.cards.get(4).node.remove(); f.remount(); assert.equal(f.cards.get(7).node.nextElementSibling, f.hints[0]);
  f.cards.get(7).node.remove(); f.observers[0].callback([]); assert.equal(f.hints.length, 0);
  const added = f.card(4, '再生 / Play movie'); f.observers[0].callback([]); assert.equal(added.node.nextElementSibling, f.hints[0]);
  const c = f.cards.get(10).node; c.setAttribute('data-command-panel-command-type', '33'); f.remount();
  assert.equal(c.getAttribute('data-wvc-export-unsupported'), null);
  f.panel.remove(); f.remount(); assert.equal(f.hints.length, 0); assert.equal(f.remount(), false); f.api.dispose();
});

test('new unsupported cards are guarded before observer decoration; groups and invalid IDs are untouched', () => {
  const f = fixture(), added = f.card(35); f.answer(false); added.title.dispatch('click');
  assert.equal(f.confirmations.length, 1); assert.deepEqual(f.native.inserted, []);
  for (const raw of ['', '10x', '010', '999']) {
    added.node.setAttribute('data-command-panel-command-type', raw); added.title.dispatch('click');
  }
  added.node.setAttribute('data-command-panel-command-type', '10'); added.node.setAttribute('data-command-panel-drag-kind', 'group'); added.title.dispatch('click');
  assert.equal(f.confirmations.length, 1); assert.equal(f.native.inserted.length, 5); f.api.dispose();
});

test('disposal restores original host attributes and all listeners; remounting replaces a previous mount', () => {
  const f = fixture(), c = f.cards.get(10).node;
  f.api.dispose(); c.setAttribute('title', 'Original title'); c.setAttribute('aria-description', 'Original help');
  f.mountAgain(); f.mountAgain(); assert.equal(f.hints.length, 1);
  assert.equal((f.document.events.get('click') || []).length, 1);
  f.answer(false); f.pointerClick(10); assert.equal(f.confirmations.length, 1);
  c.setAttribute('title', 'New native title'); f.api.dispose(); f.api.dispose();
  assert.equal(c.getAttribute('title'), 'New native title'); assert.equal(c.getAttribute('aria-description'), 'Original help');
  assert.equal(c.getAttribute('data-wvc-export-unsupported'), null); assert.equal(f.hints.length, 0);
  for (const listeners of f.document.events.values()) assert.equal(listeners.length, 0);
  assert.equal(f.observers.every(o => o.disconnected), true); c.dispatch('click'); assert.deepEqual(f.native.inserted, [10]);
});

 test('unavailable or throwing native confirmation fails closed', () => {
  const f = fixture(), c = f.cards.get(10).node;
  f.context.confirm = undefined; assert.equal(c.dispatch('click').defaultPrevented, true);
  f.context.confirm = () => { throw Error('Dialog unavailable'); };
  assert.equal(c.dispatch('pointerdown').defaultPrevented, true);
  assert.equal(c.dispatch('keydown', { key: 'Enter' }).defaultPrevented, true);
  assert.deepEqual(f.native.inserted, []); assert.deepEqual(f.native.pointers, []); f.api.dispose();
});

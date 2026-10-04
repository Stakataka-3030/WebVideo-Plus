/* Craft beta.2 command cards: keep host insertion, favorites and defaults native. */
(function (root) {
  'use strict';
  const PANEL = '[data-tour="command-panel"]';
  const CARD = '[data-command-panel-drag-kind="command"][data-command-panel-command-type]';
  // webgal-parser 4.6.5 commandType IDs; ProjectAssets.Scan forbidden minus the
  // static changeScene path flattened by SceneChain.Expand before preflight.
  // Conditional parameters/assets remain the export preflight's responsibility.
  const unsupported = new Map([
    [10, 'choose'], [15, 'jumpLabel'], [16, 'chooseLabel'],
    [17, 'setVar'], [18, 'if'], [19, 'callScene'], [20, 'showVars'],
    [31, 'getUserInput'], [35, 'return'],
  ]);
  const mounts = new WeakMap();
  function mount({ openHint } = {}) {
    const document = root.document;
    mounts.get(document)?.dispose();
    let disposed = false, observer = null, pointer = null, keyboard = null;
    let pointerTimer = null, keyboardTimer = null;
    const decorated = new Map(), hints = new Map(), listeners = [];
    function listen(target, name, handler) {
      if (typeof target?.addEventListener !== 'function') return;
      target.addEventListener(name, handler, true);
      listeners.push(() => target.removeEventListener(name, handler, true));
    }
    function stop(event) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    }
    function clearPointer() {
      if (pointerTimer !== null) root.clearTimeout(pointerTimer);
      pointerTimer = null; pointer = null;
    }
    function clearKeyboard() {
      if (keyboardTimer !== null) root.clearTimeout(keyboardTimer);
      keyboardTimer = null; keyboard = null;
    }
    function finishPointer(event) {
      if (!pointer || (event.pointerId !== undefined && pointer.id !== event.pointerId)) return;
      if (pointerTimer !== null) root.clearTimeout(pointerTimer);
      // A native click is dispatched immediately after pointerup; one gesture, one warning.
      pointerTimer = root.setTimeout(clearPointer, 0);
    }
    function command(event) {
      const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
      const card = target?.closest?.(CARD);
      if (!card || !card.closest(PANEL)) return null;
      const raw = card.getAttribute('data-command-panel-command-type');
      if (!/^(0|[1-9]\d*)$/.test(raw || '')) return null;
      const name = unsupported.get(Number(raw));
      if (!name) return null;
      // CommandPanelCard.vue puts native action slots in its third direct child.
      // Do not intercept their own click/keydown/pointerdown.stop handlers, even on padding.
      if (card.children[2]?.contains(target)) return null;
      for (let node = target; node && node !== card; node = node.parentElement) {
        if (node.matches('button,a,input,textarea,select,[role="button"],[role="menuitem"],[contenteditable]')) return null;
      }
      return { card, name };
    }
    function warning(name) {
      return `“${name}” 属于游戏控制／交互命令，当前视频导出不支持。插入后仍可在 Craft 中编辑，但导出检查可能会阻止成片。\n\n仍要插入此命令吗？`;
    }
    function confirm(command) {
      // A dismissed/unavailable native dialog must never count as approval.
      try { return typeof root.confirm === 'function' && root.confirm(warning(command.name)) === true; }
      catch { return false; }
    }
    function onPointerDown(event) {
      clearPointer(); clearKeyboard();
      if (event.button !== 0 || event.isPrimary === false) return;
      const item = command(event);
      if (!item) return;
      const allowed = confirm(item);
      pointer = { card: item.card, name: item.name, id: event.pointerId, allowed };
      if (!allowed) stop(event);
    }
    function onClick(event) {
      const item = command(event);
      if (!item) return;
      // Native div cards insert on keydown. Swallow any follow-on synthetic click.
      if (keyboard?.card === item.card && keyboard.name === item.name && event.detail === 0) {
        clearKeyboard(); stop(event); return;
      }
      const sameGesture = pointer?.card === item.card && pointer.name === item.name && event.detail > 0;
      const allowed = sameGesture ? pointer.allowed : confirm(item);
      clearPointer();
      if (!allowed) stop(event);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') { clearPointer(); clearKeyboard(); return; }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = command(event);
      if (!item) return;
      if (event.repeat) { stop(event); return; }
      clearPointer(); clearKeyboard();
      const allowed = confirm(item);
      keyboard = { card: item.card, name: item.name, key: event.key, allowed };
      if (!allowed) stop(event);
    }
    function onKeyUp(event) {
      if (!keyboard || event.key !== keyboard.key) return;
      if (keyboardTimer !== null) root.clearTimeout(keyboardTimer);
      keyboardTimer = root.setTimeout(clearKeyboard, 0);
    }
    function onDragStart(event) {
      const item = command(event);
      if (!item) return;
      const sameGesture = pointer?.card === item.card && pointer.name === item.name;
      const allowed = sameGesture ? pointer.allowed : confirm(item);
      if (!sameGesture) pointer = { card: item.card, name: item.name, allowed };
      if (!allowed) stop(event);
    }
    function restore(card, state) {
      if (card.getAttribute('data-wvc-export-unsupported') === state.name) card.removeAttribute('data-wvc-export-unsupported');
      for (const [name, value] of Object.entries(state.before)) {
        if (card.getAttribute(name) !== state.written[name]) continue;
        if (value === null) card.removeAttribute(name); else card.setAttribute(name, value);
      }
    }
    function decorate(card, name) {
      const current = decorated.get(card);
      if (current?.name === name) return;
      if (current) restore(card, current);
      const before = { title: card.getAttribute('title'), 'aria-description': card.getAttribute('aria-description') };
      const description = '视频导出不支持；确认后仍可插入并编辑';
      const written = { title: [before.title, description].filter(Boolean).join(' · '), 'aria-description': [before['aria-description'], description].filter(Boolean).join('。') };
      card.setAttribute('data-wvc-export-unsupported', name);
      for (const [key, value] of Object.entries(written)) card.setAttribute(key, value);
      decorated.set(card, { name, before, written });
    }
    function element(tag, className) {
      const node = document.createElement(tag); node.className = className || ''; return node;
    }
    function createHint(anchor) {
      // Copy only the native presentation classes, never its drag data, Vue attrs or actions.
      const card = element('div', anchor.className);
      card.setAttribute('data-wvc-command', 'hint'); card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0'); card.setAttribute('aria-label', '单行提示');
      card.setAttribute('title', '分支横条样式的时间／地点提示，可设置时长后自动继续');
      const stripe = element('div', anchor.children[0]?.className);
      const body = element('div', anchor.children[1]?.className);
      const icon = element('div', anchor.children[1]?.children[0]?.className);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [name, value] of Object.entries({ width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'aria-hidden': 'true' })) svg.setAttribute(name, value);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M4 5h16v12H8l-4 4V5M8 9h8M8 13h5'); svg.append(path); icon.append(svg);
      const label = element('div', anchor.children[1]?.children[1]?.className); label.textContent = '单行提示';
      body.append(icon, label); card.append(stripe, body);
      card.addEventListener('click', () => { if (!disposed) openHint?.(); });
      card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); if (!disposed && !event.repeat) openHint?.();
      });
      return card;
    }
    function remount() {
      if (disposed) return false;
      const panels = new Set(document.querySelectorAll(PANEL));
      const cards = new Set();
      for (const panel of panels) {
        const entries = [...panel.querySelectorAll(CARD)];
        for (const card of entries) {
          const raw = card.getAttribute('data-command-panel-command-type');
          const name = /^(0|[1-9]\d*)$/.test(raw || '') && unsupported.get(Number(raw));
          if (name) { cards.add(card); decorate(card, name); }
        }
        // Verified display registry order: intro, video, filmMode, setTextbox, applyStyle.
        // The anchors live in the command grid, never the unrelated category-button bar.
        const anchor = entries.find(card => card.getAttribute('data-command-panel-command-type') === '4')
          || entries.find(card => card.getAttribute('data-command-panel-command-type') === '7');
        let hint = hints.get(panel);
        if (!anchor) { hint?.remove(); hints.delete(panel); continue; }
        if (!hint) { hint = createHint(anchor); hints.set(panel, hint); }
        if (anchor.nextElementSibling !== hint) anchor.parentElement.insertBefore(hint, anchor.nextElementSibling);
      }
      for (const [card, state] of decorated) if (!cards.has(card)) { restore(card, state); decorated.delete(card); }
      for (const [panel, hint] of hints) if (!panels.has(panel)) { hint.remove(); hints.delete(panel); }
      return panels.size > 0;
    }
    listen(document, 'pointerdown', onPointerDown);
    listen(document, 'pointerup', finishPointer);
    listen(document, 'pointercancel', clearPointer);
    listen(document, 'click', onClick);
    listen(document, 'keydown', onKeyDown);
    listen(document, 'keyup', onKeyUp);
    listen(document, 'dragstart', onDragStart);
    listen(document, 'dragend', finishPointer);
    listen(root, 'blur', () => { clearPointer(); clearKeyboard(); });
    if (typeof root.MutationObserver === 'function' && document.body) {
      observer = new root.MutationObserver(remount);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-command-panel-command-type', 'data-command-panel-drag-kind', 'data-tour'] });
    }
    const api = { remount, dispose() {
      if (disposed) return;
      disposed = true; observer?.disconnect(); clearPointer(); clearKeyboard();
      for (const remove of listeners) remove();
      for (const hint of hints.values()) hint.remove(); hints.clear();
      for (const [card, state] of decorated) restore(card, state); decorated.clear();
      if (mounts.get(document) === api) mounts.delete(document);
    } };
    mounts.set(document, api); remount(); return api;
  }
  root.WebVideoCraftCommandPanel = { mount };
})(typeof window !== 'undefined' ? window : globalThis);

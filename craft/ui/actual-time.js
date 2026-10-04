/* Actual-time presentation uses the same validated controller as export music.
 * Native anchors verified against A-kirami/webgal-craft v1.0.0-beta.2:
 * VisualEditorScene.vue, VisualEditorStatementCard.vue, EditorToolbar.vue and
 * domain/script/sentence.ts. Virtual data-index includes blank/comment entries;
 * it is NOT the filtered navigation index and is never a native selection ID. */
(function (root) {
  'use strict';
  const mounts = new WeakMap();
  const identity = value => value && JSON.stringify([value.projectId, value.projectPath, value.path, value.source, value.revision, value.engineId, value.runtimeBindingSignature]);
  const sceneIdentity = value => value && JSON.stringify([value.projectId, value.projectPath, value.path]);
  const projectIdentity = value => value && JSON.stringify([value.projectId, value.projectPath]);
  const preferenceKey = value => 'webvideo-craft.show-actual-time.v1:' + projectIdentity(value);
  const format = milliseconds => {
    const tenths = Math.round(milliseconds / 100), minutes = Math.floor(tenths / 600), seconds = (tenths % 600) / 10;
    return String(minutes).padStart(2, '0') + ':' + seconds.toFixed(1).padStart(4, '0');
  };
  function nativeRows(snapshot) {
    if (!snapshot.source) return [];
    const lines = snapshot.source.replace(/\r\n/g, '\n').split('\n');
    const model = root.WebVideoCraftScript.parse(snapshot.source, { path: snapshot.path, capabilities: snapshot.runtimeCapabilities });
    const starts = new Map(model.rows.map(row => [row.startLine, row])), rows = [];
    for (let line = 1; line <= lines.length;) {
      const row = starts.get(line);
      if (row) { rows.push(row); line = row.endLine + 1; }
      else {
        // Craft preserves empty entries, including the final line after a newline.
        // Refuse a nonempty parser gap rather than placing another row's time here.
        if (lines[line - 1].trim()) throw Error('Craft 语句范围无法核对，未显示时间');
        rows.push({ startLine: line, endLine: line, id: 'empty:' + line }); line++;
      }
    }
    return rows;
  }
  function rowTime(row, measured, snapshot) {
    const scene = measured?.timing?.storyTimeline?.scenes?.find(item => item.scene === snapshot.sceneRelativePath);
    if (!scene || scene.hash !== measured.sourceHash || !Array.isArray(scene.lineTimes)) return null;
    const start = scene.lineTimes.slice(row.startLine - 1, row.endLine).find(Number.isFinite);
    if (start === undefined) return '—';
    const end = scene.lineTimes.slice(row.endLine).find(Number.isFinite) ?? scene.endSeconds * 1000;
    if (start < 0 || !Number.isFinite(end) || end < start) return null;
    return format(start) + ' · ' + ((end - start) / 1000).toFixed(1) + 's';
  }
  function mount({ bridge, controller } = {}) {
    const document = root.document;
    if (!document || !bridge?.snapshot || !controller) return { dispose() {}, remount() {} };
    const supported = !!(controller.measure && controller.peekTiming && controller.getTiming && root.WebVideoCraftScript?.parse);
    mounts.get(document)?.dispose();
    let disposed = false, checked = false, ready = false, snapshot = null, rows = [], statusText = '', toolbar = null;
    let blockedProof = '', wasMeasuring = !!controller.state?.().measuring;
    let validationPending = false, ownRequest = null, requestSerial = 0, syncSerial = 0, syncing = null, resync = false, revalidate = '', observer = null, refreshTimer = null;
    const badges = new Map(), cleanups = [];
    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      node.setAttribute('data-wvc-actual-time', '');
      return node;
    }
    const controls = element('div', undefined, 'wvc-time-controls');
    const label = element('label', undefined, 'wvc-time-toggle');
    const input = element('input'); input.type = 'checkbox'; input.setAttribute('aria-label', '显示实际时间');
    label.append(input, element('span', '显示实际时间'));
    const refresh = element('button', '↻', 'wvc-time-refresh'); refresh.type = 'button';
    refresh.setAttribute('aria-label', '重新计算实际时间'); refresh.title = '重新读取预览设置并计算时间';
    const status = element('small', '', 'wvc-time-status'); status.setAttribute('role', 'status');
    controls.append(label, refresh, status);
    function listen(target, event, listener) {
      target.addEventListener(event, listener);
      cleanups.push(() => target.removeEventListener(event, listener));
    }
    function removeBadges() { for (const badge of badges.values()) badge.remove(); badges.clear(); }
    function abortOwnRequest() {
      ++requestSerial;
      ownRequest?.abort(); ownRequest = null;
    }
    function mountControls() {
      const mode = document.querySelector('[data-tour="mode-switch"]');
      const next = mode?.parentElement;
      if (!next || !document.querySelector('[data-tour="editor-area"]')) {
        controls.remove(); toolbar = null; removeBadges(); return false;
      }
      if (toolbar !== next || !controls.isConnected) { next.append(controls); toolbar = next; }
      return true;
    }
    function render() {
      if (disposed) return;
      const mounted = mountControls(), state = controller.state?.() || {}, measured = checked && snapshot && supported && !blockedProof && !validationPending && !state.measuring ? controller.peekTiming(snapshot) : null;
      input.checked = checked; input.disabled = !ready;
      refresh.hidden = !checked; refresh.disabled = !ready || !!ownRequest || !!state.measuring;
      const message = state.measuring ? (state.progress?.message || '正在计算实际时间…') : (statusText === '时间已更新' && !measured ? '' : statusText) || (measured ? '时间已更新' : '设置或剧本已改变，请重新计算');
      status.hidden = ready ? !checked || !message : !snapshot; if (status.textContent !== message) status.textContent = message;
      status.title = message;
      if (!mounted || !checked || !ready || !measured) { removeBadges(); return; }
      const seen = new Set();
      const editor = document.querySelector('[data-tour="editor-area"]');
      for (const content of editor.querySelectorAll('[data-visual-editor-content]')) {
        const list = [...content.children].find(node => node.getAttribute('role') === 'listbox');
        for (const wrapper of list?.children || []) {
          const raw = wrapper.getAttribute('data-index');
          if (!/^(0|[1-9]\d*)$/.test(raw || '')) continue;
          const index = Number(raw), row = rows[index];
          if (!row) continue;
          const card = wrapper.querySelector('[role="option"]'), drag = card?.querySelector('[data-statement-drag-handle]'), header = drag?.parentElement;
          // Exact beta.2 header structure and ordinal guard protect recycled rows.
          if (!header || card.firstElementChild !== header || header.firstElementChild !== drag || drag.lastElementChild?.textContent.trim() !== String(index + 1).padStart(2, '0')) continue;
          const actions = header.lastElementChild;
          if (!actions || actions === drag || actions.getAttribute('data-wvc-actual-time') !== null) continue;
          const value = rowTime(row, measured, snapshot);
          if (value === null) continue;
          let badge = badges.get(card);
          if (!badge || badge.parentElement !== header) {
            badge?.remove(); badge = element('span', undefined, 'wvc-time-badge');
            header.insertBefore(badge, actions); badges.set(card, badge);
          }
          if (badge.textContent !== value) badge.textContent = value;
          badge.title = value === '—' ? '这条语句没有实际执行时间' : '实际起点 · 持续时间';
          seen.add(card);
        }
      }
      for (const [card, badge] of badges) if (!seen.has(card)) { badge.remove(); badges.delete(card); }
    }
    async function measure(force = false) {
      if (disposed || !checked || !ready || ownRequest) return;
      const serial = ++requestSerial, captured = snapshot, abort = new root.AbortController();
      ownRequest = abort; statusText = ''; removeBadges(); render();
      try {
        await controller.measure({ force, signal: abort.signal, onProgress: progress => {
          if (!disposed && serial === requestSerial) { statusText = progress?.message || '正在计算实际时间…'; render(); }
        } });
        if (disposed || serial !== requestSerial || identity(snapshot) !== identity(captured)) return;
        blockedProof = ''; statusText = '时间已更新';
      } catch (error) {
        if (!disposed && serial === requestSerial && !abort.signal.aborted) statusText = error.message || String(error);
      } finally {
        if (!disposed && serial === requestSerial) { ownRequest = null; render(); void sync(); }
      }
    }
    async function sync(validate = '') {
      if (disposed) return;
      if (validate === 'full') validationPending = true;
      if (validate === 'full' || !revalidate) revalidate = validate;
      if (syncing) { resync = true; return syncing; }
      const ticket = ++syncSerial;
      syncing = (async () => {
        do {
          resync = false; const shouldValidate = revalidate; revalidate = '';
          try {
            const next = await bridge.snapshot(), caps = await bridge.capabilities();
            if (disposed || ticket !== syncSerial) return;
            const projectChanged = projectIdentity(next) !== projectIdentity(snapshot), sceneChanged = sceneIdentity(next) !== sceneIdentity(snapshot), sourceChanged = identity(next) !== identity(snapshot);
            if (sourceChanged) { abortOwnRequest(); removeBadges(); statusText = ''; blockedProof = ''; rows = nativeRows(next); }
            snapshot = next;
            if (projectChanged) {
              checked = false;
              try { checked = root.localStorage?.getItem(preferenceKey(next)) === 'true'; } catch {}
            }
            ready = supported && caps.timing === true && caps.previewSettings === true;
            if (!ready) statusText = caps.reason || '当前 Craft 尚未提供实际时间计算';
            if (checked && ready && (shouldValidate || sceneChanged)) {
              try {
                // A full dependency proof exports the VFS; never run that on a timer.
                if ((shouldValidate === 'full' || sceneChanged) && controller.peekTiming(next)) {
                  validationPending = true; removeBadges(); await controller.getTiming(); blockedProof = ''; statusText = '';
                }
                else if (shouldValidate === 'speeds') {
                  await controller.readSpeeds?.();
                  if (blockedProof === 'speeds') { blockedProof = ''; statusText = ''; }
                }
              }
              catch (error) { if (!disposed && ticket === syncSerial) {
                blockedProof = shouldValidate === 'full' || sceneChanged || blockedProof === 'full' ? 'full' : 'speeds';
                statusText = error.message || String(error); removeBadges();
              } }
              if (disposed || ticket !== syncSerial) return;
            }
            render();
            if (checked && ready && sceneChanged && !controller.peekTiming(next)) void measure();
          } catch (error) {
            if (disposed || ticket !== syncSerial) return;
            ready = false; snapshot = null; rows = []; abortOwnRequest(); removeBadges();
            statusText = error.message || String(error); render();
          }
        } while (resync && !disposed);
      })();
      try { await syncing; } finally {
        if (ticket === syncSerial) { syncing = null; validationPending = false; render(); }
      }
    }
    listen(input, 'change', () => {
      checked = !!input.checked;
      try { if (snapshot) root.localStorage?.setItem(preferenceKey(snapshot), String(checked)); } catch {}
      statusText = ''; validationPending = checked;
      if (!checked) abortOwnRequest();
      render();
      if (checked) void (async () => {
        await sync('full');
        if (!disposed && checked && ready && !controller.peekTiming(snapshot)) void measure();
      })();
    });
    listen(refresh, 'click', () => { if (!refresh.disabled) void measure(true); });
    cleanups.push(bridge.subscribe?.(() => { ready = false; removeBadges(); void sync(); }));
    cleanups.push(controller.subscribe?.(() => {
      const measuring = !!controller.state?.().measuring, finished = wasMeasuring && !measuring; wasMeasuring = measuring;
      if (!blockedProof && checked && snapshot && supported && controller.peekTiming(snapshot)) statusText = '时间已更新';
      render();
      // A different UI may have completed a shared computation after our proof failed.
      if (finished && blockedProof && checked && !ownRequest) void sync('full');
    }));
    if (root.MutationObserver) {
      observer = new root.MutationObserver(records => {
        const owned = node => {
          for (let current = node?.nodeType === 3 ? node.parentElement : node; current; current = current.parentElement) if (current.getAttribute?.('data-wvc-actual-time') !== null && current.getAttribute?.('data-wvc-actual-time') !== undefined) return true;
          return false;
        };
        if (records.length && records.every(record => owned(record.target) || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(owned)))) return;
        render();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-index', 'data-tour'], characterData: true });
    }
    refreshTimer = root.setInterval(() => { if (checked) void sync('speeds'); }, 700);
    const api = {
      remount() { render(); return sync(); },
      dispose() {
        if (disposed) return;
        disposed = true; ++syncSerial; abortOwnRequest();
        observer?.disconnect(); root.clearInterval(refreshTimer);
        for (const cleanup of cleanups) cleanup?.();
        controls.remove(); removeBadges();
        if (mounts.get(document) === api) mounts.delete(document);
      },
    };
    mounts.set(document, api); render(); void sync('full'); return api;
  }
  root.WebVideoCraftActualTime = { mount };
})(typeof window === 'undefined' ? globalThis : window);

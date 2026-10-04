/* Craft beta.2 ExportPlatformSelector extension. Never replaces native export handlers. */
(function (root) {
  'use strict';
  const modes = [
    ['full', '导出视频', '完整舞台、对话框与音频 · MP4', 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4'],
    ['stage', '导出舞台', '背景、立绘与舞台效果 · 可选透明背景', 'M3 4h18v14H3zM7 22l5-4 5 4M7 9l3 3 3-4 4 5'],
    ['dialog', '导出对话框与 DOM', '对话框、角色名、文字与界面 · 透明视频', 'M3 4h18v13H8l-5 4V4M7 8h10M7 12h7'],
    ['audio', '仅导出音轨', 'WebGAL BGM、语音、音效与视频原声 · WAV', 'M9 18V5l12-2v13M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2M21 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2'],
  ];
  function mount({ bridge, mediaPanel }) {
    if (!mediaPanel?.attachExport) return { dispose() {}, refresh() {} };
    const bindings = new Map(); let disposed = false, observer = null, pending = null;
    const el = (tag, text, attrs = {}) => { const node = document.createElement(tag); if (text != null) node.textContent = text; for (const [key, value] of Object.entries(attrs)) { if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } return node; };
    function candidate(dialog) {
      if (dialog.getAttribute('data-state') === 'closed') return null;
      for (const group of dialog.querySelectorAll('div')) {
        const children = [...group.children];
        // Inspected v1.0.0-beta.2 selector: exactly three native sibling buttons.
        if (children.length !== 3 || !children.every(n => n.tagName === 'BUTTON')) continue;
        const [web, desktop, android] = children;
        if (!/^Web/.test(web.textContent.trim()) || !/^Android/.test(android.textContent.trim())) continue;
        if (web.getAttribute('aria-pressed') === null || desktop.getAttribute('aria-pressed') === null || !android.disabled) continue;
        return { group, web, desktop, android };
      }
      return null;
    }
    function restore(binding) {
      binding.detach?.(); binding.detach = null;
      binding.form?.remove(); binding.form = null;
      for (const [node, hidden] of binding.hidden) { node.hidden = hidden; node.removeAttribute('data-wvc-export-hidden'); }
      binding.hidden = [];
      binding.section.hidden = false;
    }
    function remove(binding) { restore(binding); binding.section.remove(); bindings.delete(binding.dialog); }
    function refresh() {
      if (disposed) return;
      for (const binding of bindings.values()) if (!binding.dialog.isConnected || !binding.group.isConnected || binding.dialog.getAttribute('data-state') === 'closed') remove(binding);
      for (const dialog of document.querySelectorAll('[role="dialog"]')) {
        if (bindings.has(dialog)) continue;
        const found = candidate(dialog); if (!found) continue;
        const section = el('section', null, { className: 'wvc-export-platforms', 'aria-label': '视频与分层导出', 'data-wvc-export-platforms': 'true' });
        section.append(el('h3', '视频与分层导出', { className: 'wvc-export-label' }));
        const binding = { dialog, ...found, section, form: null, detach: null, hidden: [] }; bindings.set(dialog, binding);
        for (const [kind, title, description, path] of modes) {
          const card = el('button', null, { type: 'button', className: 'wvc-export-platform', 'data-wvc-export-kind': kind });
          const icon = el('span', null, { className: 'wvc-export-icon', 'aria-hidden': 'true' });
          icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
          const label = el('span', null, { className: 'wvc-export-platform-text' }); label.append(el('strong', title), el('span', description)); card.append(icon, label);
          card.addEventListener('click', () => {
            if (mediaPanel.busy?.()) return;
            // Preserve header and the native direct Close button. Own only our configuration view.
            const header = dialog.firstElementChild;
            binding.hidden = [...dialog.children].filter(n => n !== header && n.tagName !== 'BUTTON' && n !== section).map(n => [n, n.hidden]);
            for (const [node] of binding.hidden) { node.hidden = true; node.setAttribute('data-wvc-export-hidden', 'true'); }
            section.hidden = true;
            const form = el('section', null, { className: 'wvc-native-export-config', 'aria-label': title });
            const back = el('button', '← 返回导出类型', { type: 'button', className: 'wvc-export-back' });
            back.addEventListener('click', () => { if (mediaPanel.busy?.()) return; restore(binding); card.focus?.(); });
            form.append(back); binding.form = form; dialog.append(form);
            try { binding.detach = mediaPanel.attachExport(form, kind); back.focus?.(); }
            catch (error) { restore(binding); const note = el('p', error.message, { role: 'alert' }); section.append(note); }
          });
          section.append(card);
        }
        found.group.parentElement.append(section);
      }
    }
    if (root.MutationObserver) { observer = new root.MutationObserver(() => { if (pending !== null || disposed) return; pending = setTimeout(() => { pending = null; refresh(); }, 40); }); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] }); }
    refresh();
    return { refresh, dispose() { disposed = true; observer?.disconnect(); if (pending !== null) clearTimeout(pending); for (const binding of [...bindings.values()]) remove(binding); } };
  }
  root.WebVideoCraftExportDialog = { mount };
})(typeof window !== 'undefined' ? window : globalThis);

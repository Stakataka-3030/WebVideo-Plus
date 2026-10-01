(() => {
  if (window.__webvideoCraftInjected) return;
  window.__webvideoCraftInjected = true;
  let button;

  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const getRecord = (db, table, key) => new Promise((resolve, reject) => {
    const request = db.transaction(table, 'readonly').objectStore(table).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const getAll = (db, table) => new Promise((resolve, reject) => {
    const request = db.transaction(table, 'readonly').objectStore(table).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('WebGALCraft');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function currentProject() {
    const match = location.pathname.match(/^\/edit\/([^/]+)/);
    if (!match) throw new Error('请先打开 Craft 工程');
    const db = await openDb();
    try {
      const game = await getRecord(db, 'games', decodeURIComponent(match[1]));
      if (!game) throw new Error('当前工程记录不存在');
      const config = await invoke('read_project_config_cmd', { projectPath: game.path });
      const engines = await getAll(db, 'engines');
      let engine = game.engineId && engines.find(item => item.id === game.engineId);
      if (!engine && config.engine) engine = engines.find(item => item.engineId === config.engine.id && item.version === config.engine.version);
      if (!engine) throw new Error('当前工程绑定的引擎不可用');
      let templatePath;
      if (!config.template || config.template.kind === 'engineBuiltin') {
        const templateEngine = config.template?.kind === 'engineBuiltin'
          ? engines.find(item => item.engineId === config.template.engine.id && item.version === config.template.engine.version)
          : engine;
        if (templateEngine) templatePath = `${templateEngine.path.replace(/[\\/]$/, '')}/game/template`;
      } else if (config.template.kind === 'standalone') {
        const templates = await getAll(db, 'templates');
        templatePath = templates.find(item => item.metadata?.name === config.template.name && item.status === 'created')?.path;
      }
      return { gamePath: game.path, enginePath: engine.path, templatePath, gameName: game.metadata?.name || 'WebGAL' };
    } finally { db.close(); }
  }
  function notify(message) {
    if (button) button.textContent = message;
  }
  window.__wvCraftNotify = data => {
    notify(data?.message || '导出视频');
    if (data?.state === 'completed' || data?.state === 'failed') {
      if (button) button.disabled = false;
      if (data.state === 'failed') alert(data.message || '视频导出失败');
    }
  };

  async function begin() {
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const test = window.__WV_CRAFT_TEST_CONFIG;
      const project = test || await currentProject();
      const output = test?.output || await invoke('plugin:dialog|save', {
        options: { defaultPath: 'video.mp4', filters: [{ name: 'MP4 视频', extensions: ['mp4'] }] },
      });
      if (!output) { button.disabled = false; notify('导出视频'); return; }
      const site = `${output}.craft-site-${crypto.randomUUID()}`;
      notify('正在整理工程…');
      await invoke('export_web', {
        exportId: crypto.randomUUID(), enginePath: project.enginePath,
        gamePath: project.gamePath, templatePath: project.templatePath,
        outputPath: site, gameName: project.gameName, replaceExisting: false,
      });
      notify('已加入视频导出');
      console.log('__WV_CRAFT_JOB__', JSON.stringify({
        site, output, scene: test?.scene || 'start.txt',
        width: test?.width || 1280, height: test?.height || 720,
        fps: test?.fps || 30, workers: test?.workers || 1,
      }));
    } catch (error) {
      button.disabled = false;
      notify('导出视频');
      alert(`视频导出未开始：${error?.message || String(error)}`);
    }
  }
  function mount() {
    if (button?.isConnected) return;
    let anchor;
    if (window.__WV_CRAFT_TEST_CONFIG) anchor = document.querySelector('header button');
    else if (/^\/edit\//.test(location.pathname)) {
      anchor = [...document.querySelectorAll('header button')]
        .find(item => /^(导出|匯出|Export|エクスポート)$/.test(item.textContent.trim()));
    }
    if (!anchor) return;
    button = anchor.cloneNode(false);
    button.dataset.webvideoCraft = 'export';
    button.removeAttribute('disabled');
    button.textContent = '导出视频';
    button.addEventListener('click', begin);
    anchor.after(button);
  }
  function startObserving() {
    if (!document.documentElement) {
      addEventListener('DOMContentLoaded', startObserving, { once: true });
      return;
    }
    new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
    mount();
  }
  startObserving();
})();

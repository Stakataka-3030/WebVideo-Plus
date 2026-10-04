(function (root) {
  'use strict';
  root.WebVideoCraftCreateOwnUpdates = function ({rpc, getStores, readLocalState, onState = () => {}}) {
    let status = 'idle', update = null, busy = false, verified = false;
    const publish = (next, details = {}) => { status = next; onState({status, update, ...details}); };
    const assertKnownLocalBlockers = () => {
      let state;
      if (readLocalState === undefined) {
        // Legacy/test integrations stay conservative; a missing task store is
        // not sufficient evidence to open an installer without the pinned reader.
        const stores = getStores();
        state = {hasUnsavedDocuments: stores?.editor?.hasUnsavedDocuments, hasBlockingTasks: stores?.runtimeTask?.hasBlockingTasks};
      } else {
        if (typeof readLocalState !== 'function') throw Error('Craft 本机更新状态连接无效');
        // Production supplies the pinned-host predicate. Its result covers
        // known local work only; backend install must still verify session and
        // authoritative WebVideo jobs before opening normal Setup.
        state = readLocalState();
        if (state?.coverage !== 'known-work-only') throw Error('Craft 本机更新状态范围无法确认');
      }
      if (typeof state?.hasUnsavedDocuments !== 'boolean' || typeof state?.hasBlockingTasks !== 'boolean') throw Error('无法确认 Craft 保存和已知任务状态，请稍后重试');
      if (state.hasUnsavedDocuments || state.hasBlockingTasks) throw Error('请先保存所有文档并等待运行任务完成');
    };
    async function run(next, operation) {
      if (busy) throw Error('WebVideo+ 更新操作正在进行');
      if (status === 'opened') throw Error('安装器已经打开，请保存并正常关闭 Craft 后继续安装');
      busy = true; publish(next);
      try { return await operation(); }
      catch (error) { publish('failed', {error: error.message}); throw error; }
      finally { busy = false; }
    }
    return {
      state: () => ({status, busy, update: update ? {...update} : null}),
      check: () => run('checking', async () => {
        update = null; verified = false; update = await rpc('ownUpdate.check', {});
        publish(update ? 'available' : 'up-to-date'); return update;
      }),
      download: () => run('downloading', async () => {
        if (!update) throw Error('请先检查 WebVideo+ Craft 更新');
        verified = false;
        const result = await rpc('ownUpdate.download', {});
        if (result?.verified !== true || result.version !== update.version) throw Error('安装器未通过完整性校验');
        verified = true; publish('verified'); return result;
      }),
      install: async () => {
        assertKnownLocalBlockers();
        if (!verified) throw Error('请先下载并校验 WebVideo+ Craft 安装器');
        return run('opening', async () => {
          const app = root.document.querySelector('#app'), previous = app?.inert;
          if (app) app.inert = true;
          try {
            assertKnownLocalBlockers();
            const result = await rpc('ownUpdate.install', {});
            if (result?.opened !== true || result.installed !== false) throw Error('安装器尚未确认打开');
            publish('opened'); return result;
          } finally { if (app) app.inert = previous; }
        });
      },
      reveal: () => run('revealing', async () => {
        if (!verified) throw Error('请先下载并校验 WebVideo+ Craft 安装器');
        const result = await rpc('ownUpdate.reveal', {});
        if (result?.revealed !== true) throw Error('安装器文件夹尚未打开');
        publish('verified'); return result;
      }),
    };
  };
})(globalThis);

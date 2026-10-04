/* Read-only state contract for the exact official Craft beta.2 executable.
 * Source: A-kirami/webgal-craft@edccdf0d10572a31a3ee8619ad3b43d2ce5c91aa.
 * The caller must verify the executable before supplying its profile. This
 * function validates observable blockers; it does not prove universal native
 * quiescence. In particular desktop archive extraction has no public task
 * ledger. Opening our installer must retain its normal live-host install lock.
 */
(function (root) {
  'use strict';
  // Keep this function closure-free: the backend evaluates this exact function
  // in the owned main WebView, while the browser calls the same implementation.
  function readPinnedCraftUpdateState(pinia, profile) {
    const fail = detail => { throw Error('无法确认 Craft 保存和任务状态：' + detail); };
    if (profile?.version !== '1.0.0-beta.2'
      || profile?.sha256 !== '3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d') {
      fail('宿主精确版本未验证');
    }
    const isMap = value => value != null && Object.prototype.toString.call(value) === '[object Map]'
      && typeof value.get === 'function' && typeof value.has === 'function'
      && Number.isSafeInteger(value.size) && value.size >= 0;
    const stores = pinia?._s;
    if (!isMap(stores)) fail('Pinia 存储不可用');
    const required = id => {
      const store = stores.get(id);
      if (!stores.has(id) || !store || typeof store !== 'object') fail(id + ' 存储未就绪');
      return store;
    };
    const boolean = (value, label) => {
      if (typeof value !== 'boolean') fail(label + ' 格式不匹配');
      return value;
    };
    const map = (value, label) => {
      if (!isMap(value)) fail(label + ' 格式不匹配');
      return value;
    };
    const editor = required('editor'), modal = required('modal'), resource = required('resource');
    const hasUnsavedDocuments = boolean(editor.hasUnsavedDocuments, 'editor.hasUnsavedDocuments');
    const blockers = [], absentLazyStores = [];
    // Native export progress is private to ExportDialog, not runtime-task.
    // Its normal close path refuses while busy. Block retained entries as well
    // as open ones; do not inspect production Vue component internals.
    if (map(modal.modalStack, 'modal.modalStack').size) blockers.push('native-modal');
    if (map(resource.activeProgress, 'resource.activeProgress').size) blockers.push('native-resource-progress');
    for (const kind of ['games', 'engines', 'templates']) {
      const rows = resource[kind];
      if (!Array.isArray(rows)) fail('resource.' + kind + ' 尚未加载');
      let creating = false;
      for (const row of rows) {
        if (!row || typeof row !== 'object' || !['created', 'creating', 'error'].includes(row.status)) {
          fail('resource.' + kind + '.status 格式不匹配');
        }
        if (row.status === 'creating') creating = true;
      }
      if (creating) blockers.push('native-' + kind + '-creating');
    }
    // These stores are created synchronously before their tracked operations.
    // No production beta.2 call site disposes them. Absence means only that this
    // particular ledger has never been created, not that other work is idle.
    for (const [id, key, reason] of [
      ['runtime-task', 'hasBlockingTasks', 'native-runtime-task'],
      ['managed-import', 'isBusy', 'native-managed-import'],
      ['backup', 'restoring', 'native-backup-restore'],
    ]) {
      if (!stores.has(id)) { absentLazyStores.push(id); continue; }
      if (boolean(required(id)[key], id + '.' + key)) blockers.push(reason);
    }
    // Timeline loading first prunes backup history. The dialog may close while
    // that awaited operation continues, so its retained store is also checked.
    if (stores.has('backup') && boolean(required('backup').loading, 'backup.loading')) {
      blockers.push('native-backup-loading');
    }
    return {
      hasUnsavedDocuments,
      hasBlockingTasks: blockers.length > 0,
      blockers,
      absentLazyStores,
      coverage: 'known-work-only',
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = { readPinnedCraftUpdateState };
  else root.WebVideoCraftReadUpdateState = readPinnedCraftUpdateState;
})(globalThis);

/* Native DOM media panel; no host files or engine state bypass the Craft bridge. */
(function (root) {
  'use strict';
  function mount(container, { bridge, controller, run, notify, getSnapshot, getSelection }) {
    let disposed = false, working = false, selection = null, subtitlePath = '', caps = {}, exportJobs = [];
    const buttons = [], disposers = [];
    const el = (tag, text, attrs = {}) => { const node = document.createElement(tag); if (text != null) node.textContent = text; for (const [key, value] of Object.entries(attrs)) { if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } return node; };
    const on = (node, event, fn) => { node.addEventListener(event, fn); disposers.push(() => node.removeEventListener(event, fn)); };
    const panel = el('div', null, { className: 'wvc-media' }); container.append(panel);
    const status = el('p', '读取配乐配置、打开游戏预览后，可使用实测时间和速度工具', { className: 'wvc-help', role: 'status' });
    const message = value => { if (disposed) return; status.textContent = String(value); notify(String(value)); };
    function refreshCapabilities() { for (const input of exportCard?.querySelectorAll?.('input,select') || []) input.disabled = working; if (!working) replaceBgm.disabled = !useMusic.checked; caps = bridge.capabilities() || {}; for (const b of buttons) { const missing = b.required.find(key => caps[key] !== true); b.node.disabled = (working && !b.cancel) || !!missing; b.node.title = missing ? caps[missing + 'Reason'] || caps.reason || `${missing} 尚未绑定，请先打开支持的 Craft 工程/游戏预览` : ''; } }
    async function action(fn) { return run(async () => { if (disposed || working) return; working = true; refreshCapabilities(); try { await fn(); } catch (error) { if (disposed) return; exportStatus.textContent = error.message || String(error); message(exportStatus.textContent); throw error; } finally { working = false; if (!disposed) refreshCapabilities(); } }); }
    function button(parent, text, fn, required = [], cancel = false) { const node = el('button', text, { type: 'button' }); buttons.push({ node, required, cancel }); on(node, 'click', () => { if (cancel) Promise.resolve(fn()).catch(e => message(e.message)); else action(fn); }); parent.append(node); return node; }
    function field(parent, label, value = '', type = 'text') { const box = el('label', null, { className: 'wvc-field' }), input = el('input', null, { type, value, 'aria-label': label }); box.append(el('span', label), input); parent.append(box); return input; }
    function select(parent, label, choices) { const box = el('label', null, { className: 'wvc-field' }), input = el('select', null, { 'aria-label': label }); for (const [value, text] of choices) input.append(el('option', text, { value })); box.append(el('span', label), input); parent.append(box); return input; }
    function check(parent, label, checked = false) { const box = el('label'), input = el('input', null, { type: 'checkbox', checked, 'aria-label': label }); box.append(input, document.createTextNode(label)); parent.append(box); return input; }
    function card(title) { const node = el('section', null, { className: 'wvc-card' }); node.append(el('h3', title)); panel.append(node); return node; }
    const row = parent => { const node = el('div', null, { className: 'wvc-actions' }); parent.append(node); return node; };
    const finite = (input, name, min, max) => { if (String(input.value).trim() === '') throw Error(`${name}不能为空`); const value = Number(input.value); if (!Number.isFinite(value) || value < min || value > max) throw Error(`${name}应在 ${min} 到 ${max} 之间`); return value; };
    const musicCard = card('设置导出音乐');
    const musicUI = root.WebVideoCraftMusicUI?.mount(musicCard, { bridge, controller, notify: message });
    if (!musicUI) musicCard.append(el('p', '音乐时间轴界面尚未加载', { className: 'wvc-help' }));
    const timeCard = card('实际时间');
    timeCard.append(el('p', '勾选编辑器工具栏的“显示实际时间”，即可在语句旁查看开始时间与持续时间；与导出音乐共享同一份实测结果。', { className: 'wvc-help' }));
    function drawMusic() { musicUI?.refresh?.(); }
    // The same form is used by the editor dock and the native Export dialog.
    const exportCard = card('导出视频'); exportCard.className += ' wvc-export-form';
    const exportHeading = exportCard.children[0];
    const exportKinds = [ ['full', '完整视频'], ['stage', '舞台'], ['dialog', '对话框与 DOM'], ['audio', '仅音轨'] ];
    const kind = select(exportCard, '导出内容', exportKinds);
    const kindNote = el('p', '', { className: 'wvc-help' }); exportCard.append(kindNote, el('p', '按 WebGAL 自动放映导出；开始时读取当前游戏预览的文字与自动播放速度，请先打开预览。', { className: 'wvc-help' }));
    const stageRow = row(exportCard), includeBackground = check(stageRow, '包含背景', true), includeFigures = check(stageRow, '包含立绘', true);
    const transparentRow = row(exportCard), transparentFormat = select(transparentRow, '透明视频格式', [['mov', 'MOV · ProRes 4444'], ['webm', 'WebM · VP9 Alpha']]);
    const transparentNote = el('p', '', { className: 'wvc-help' }); transparentRow.append(transparentNote);
    const rangeRow = row(exportCard), scope = select(rangeRow, '故事范围', [['full', '全篇（从故事开头）'], ['fromScene', '由当前场景开始'], ['sceneOnly', '仅当前场景'], ['selection', '只导出所选片段']]);
    const rangeInfo = el('p', '', { className: 'wvc-help' });
    rangeRow.append(rangeInfo);
    const rangePicker = el('div', null, { className: 'wvc-export-ranges', 'aria-label': '选择导出语句' }); rangeRow.append(rangePicker);
    let pickerSnapshot = null, pickerRows = [], pickedRows = new Set(); const pickerDisposers = [];
    async function sourceHash(source) { const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))); return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join(''); }
    function drawExportRows() {
      for (const remove of pickerDisposers.splice(0)) remove();
      rangePicker.replaceChildren();
      if (!pickerRows.length) { rangePicker.append(el('p', '点击「读取当前场景」加载可选择的剧情语句', { className: 'wvc-help' })); return; }
      for (const item of pickerRows) {
        const line = el('label'), input = el('input', null, { type: 'checkbox', checked: pickedRows.has(item.id), 'aria-label': `导出第 ${item.startLine} 行` });
        const change = () => { input.checked ? pickedRows.add(item.id) : pickedRows.delete(item.id); selection = null; updateRange(); };
        input.addEventListener('change', change); pickerDisposers.push(() => input.removeEventListener('change', change));
        line.append(input, el('span', `${item.startLine} · ${item.title}${item.summary ? ' · ' + item.summary : ''}`)); rangePicker.append(line);
      }
    }
    const pickerActions = row(rangeRow);
    button(pickerActions, '读取当前场景', async () => { pickerSnapshot = await bridge.snapshot(); pickerRows = root.WebVideoCraftFeatures.navigation(pickerSnapshot); pickedRows = new Set(); selection = null; drawExportRows(); updateRange(); }, ['snapshot']);
    button(pickerActions, '全选语句', async () => { pickedRows = new Set(pickerRows.map(r => r.id)); selection = null; drawExportRows(); updateRange(); });
    button(pickerActions, '锁定导出片段', async () => {
      const now = await bridge.snapshot();
      if (!pickerSnapshot || now.projectId !== pickerSnapshot.projectId || now.path !== pickerSnapshot.path || now.revision !== pickerSnapshot.revision || now.source !== pickerSnapshot.source) throw Error('场景已变化，请重新读取当前场景');
      const rows = pickerRows.filter(r => pickedRows.has(r.id)); if (!rows.length) throw Error('请勾选要导出的语句');
      const ranges = []; for (const r of rows) { const previous = ranges[ranges.length - 1]; if (previous && r.startLine <= previous.endLine + 1) previous.endLine = Math.max(previous.endLine, r.endLine); else ranges.push({ startLine: r.startLine, endLine: r.endLine }); }
      selection = { ...now, sourceHash: await sourceHash(now.source), ranges }; scope.value = 'selection'; updateRange(); message('片段已锁定；开始导出时会再次校验剧本');
    }, ['snapshot']);
    drawExportRows();
    const videoRow = row(exportCard), resolution = select(videoRow, '分辨率', [['1280x720', '720p'], ['1920x1080', '1080p（推荐）'], ['2560x1440', '1440p'], ['3840x2160', '2160p（4K）']]); resolution.value = '1920x1080';
    const fps = select(videoRow, '帧率', [['30', '30 fps'], ['60', '60 fps']]);
    const workers = field(videoRow, '并行数（1–32）', 4, 'number'); workers.min = 1; workers.max = 32; workers.step = 1;
    const qualityRow = row(exportCard), quality = select(qualityRow, '导出质量', [['recommended', '推荐 / 高质量'], ['quality', '超高质量'], ['lossless', '完全无损'], ['traditional', '传统 / 兼容（完整视频）']]);
    const qualityNote = el('p', '', { className: 'wvc-help' }); qualityRow.append(qualityNote);
    const musicExportRow = row(exportCard), useMusic = check(musicExportRow, '使用已保存成片配乐', true), replaceBgm = check(musicExportRow, '成片配乐替换游戏 BGM', true);
    const outputRow = row(exportCard), output = field(outputRow, '保存目录（留空使用内核默认目录）'), fileName = field(outputRow, '文件名', 'video.mp4');
    button(outputRow, '选择保存目录…', async () => { const value = await bridge.service('/api/dialog/folder', {}); if (!value.canceled && value.path) output.value = value.path; }, ['service']);
    const post = el('details', null, { className: 'wvc-export-advanced' }); post.append(el('summary', '字幕后处理（可选）')); exportCard.append(post);
    const subtitleRow = row(post), subtitleOn = check(subtitleRow, '附加字幕', false), subtitleLabel = el('span', '未选择字幕', { className: 'wvc-help' });
    button(subtitleRow, '选择 SRT / ASS / SSA…', async () => { const value = await bridge.service('/api/dialog/subtitle', {}); if (!value.canceled && value.path) { subtitlePath = value.path; subtitleLabel.textContent = value.name || value.path; subtitleOn.checked = true; updateSubtitle(); } }, ['service']); subtitleRow.append(subtitleLabel);
    const subtitleSettings = row(post), subtitleMode = select(subtitleSettings, '字幕输出', [['soft', '可开关软字幕（MP4 / mov_text）'], ['burn', '烧录到画面（保留 ASS 样式）']]);
    const anchorType = select(subtitleSettings, '字幕时间基准', [['video', '字幕自身时间，对齐视频起点'], ['timeline', '对齐所选 WebGAL 语句'], ['music', '对齐已保存配乐开始'], ['manual', '手动指定成片时间']]);
    const manualRow = row(post), manual = field(manualRow, '字幕开始时间（秒）', 0, 'number');
    const anchorRow = row(post), anchorChoice = select(anchorRow, '基准语句', [['', '请读取当前场景语句']]), anchorInfo = el('p', '尚未选择字幕基准语句', { className: 'wvc-help' }); let subtitleStatement = null;
    button(anchorRow, '读取当前场景语句', async () => {
      const snap = await bridge.snapshot(), rows = root.WebVideoCraftFeatures.navigation(snap);
      anchorChoice.replaceChildren(...rows.map(item => el('option', `${item.startLine} · ${item.title}${item.summary ? ' · ' + item.summary : ''}`, { value: String(item.startLine) })));
      subtitleStatement = rows.length ? { ...snap, line: rows[0].startLine } : null;
      anchorInfo.textContent = rows.length ? '选择要与字幕起点对齐的语句' : '当前场景没有可选择语句';
    }, ['snapshot']);
    on(anchorChoice, 'change', () => { if (subtitleStatement) subtitleStatement.line = Number(anchorChoice.value); });
    anchorRow.append(anchorInfo);
    const musicAnchorRow = row(post), musicId = select(musicAnchorRow, '基准配乐', [['', '请读取已保存配乐']]);
    button(musicAnchorRow, '读取已保存配乐', async () => { await controller.loadMusic(); drawMusic(); updateMusicChoices(); }, ['projectFiles', 'music']);
    post.append(el('p', '软字幕不保证保留 ASS 的复杂样式；烧录会再编码一次。字幕失败时内核保留基础视频。', { className: 'wvc-help' }));
    const jobInfo = el('div', '', { className: 'wvc-export-jobs', role: 'status', 'aria-live': 'polite' });
    const exportActions = row(exportCard); let cancelRequested = false, queueProject = null, jobsRefreshing = false, queueSerial = 0;
    const exportStatus = el('p', '', { className: 'wvc-help', role: 'status' });
    function extension() { return kind.value === 'audio' ? '.wav' : kind.value === 'dialog' || kind.value === 'stage' && !includeBackground.checked ? '.' + transparentFormat.value : '.mp4'; }
    function updateRange() {
      const chosen = scope.value === 'selection'; rangePicker.hidden = !chosen; pickerActions.hidden = !chosen;
      rangeInfo.textContent = chosen ? selection ? selection.ranges.map(r => `第 ${r.startLine}–${r.endLine} 行`).join('；') + '（不连续片段分别导出）' : '尚未锁定片段，请选择剧情语句后点击「锁定导出片段」' : ({ full: '从故事开头导出；当前打开的场景不限制起点。', fromScene: '从当前场景开始，继续导出后续剧情。', sceneOnly: '仅导出当前场景。' })[scope.value];
    }
    function updateMusicChoices() {
      const previous = musicId.value, saved = controller.state().music.tracks.filter(t => t.enabled !== false);
      musicId.replaceChildren(...(saved.length ? saved.map(t => el('option', `${t.name || t.file} · ${t.startSeconds.toFixed(2)} 秒开始`, { value: t.id })) : [el('option', '暂无已保存配乐', { value: '' })]));
      if (saved.some(t => t.id === previous)) musicId.value = previous;
    }
    function updateSubtitle() {
      subtitleSettings.hidden = !subtitleOn.checked;
      manualRow.hidden = !subtitleOn.checked || anchorType.value !== 'manual';
      anchorRow.hidden = !subtitleOn.checked || anchorType.value !== 'timeline';
      musicAnchorRow.hidden = !subtitleOn.checked || anchorType.value !== 'music';
    }
    function updateExport({ rename = false } = {}) {
      const full = kind.value === 'full', audio = kind.value === 'audio', transparent = kind.value === 'dialog' || kind.value === 'stage' && !includeBackground.checked;
      exportHeading.textContent = ({ full: '导出视频', stage: '导出舞台', dialog: '导出对话框与 DOM', audio: '仅导出音轨' })[kind.value];
      kindNote.textContent = ({ full: '完整舞台、对话框与声音，输出 MP4。', stage: '只导出舞台，不含对话框等 DOM；可独立保留背景和立绘。取消背景后输出带透明通道的视频。', dialog: '只导出实际渲染的对话框、角色名、富文本及其他 DOM UI，舞台透明。', audio: '导出 WebGAL 剧本中的 BGM、语音、音效和视频原声，输出 48 kHz WAV。' })[kind.value];
      stageRow.hidden = kind.value !== 'stage'; transparentRow.hidden = !transparent;
      videoRow.hidden = audio; qualityRow.hidden = audio || transparent;
      for (const option of quality.children) if (option.value === 'traditional') option.disabled = !full;
      musicExportRow.hidden = !full; post.hidden = !full; replaceBgm.disabled = !useMusic.checked;
      if (!full && quality.value === 'traditional') quality.value = 'recommended';
      qualityNote.textContent = ({ recommended: '自动使用可用硬件编码器；兼顾画质、体积与速度。', quality: '降低压缩损失，文件会更大。', lossless: 'RGB 完全无损，文件可能很大；部分播放器不兼容。', traditional: '旧版兼容链路，导出速度较慢。' })[quality.value] + (resolution.value === '3840x2160' ? ' 4K 会使用更多显存、内存和处理时间；并行数请按设备情况调整。' : '');
      transparentNote.textContent = transparentFormat.value === 'webm' ? 'VP9 Alpha 文件较小；部分剪辑软件需要额外支持。' : 'ProRes 4444 保留透明通道，适合后期，文件体积较大。';
      if (rename) fileName.value = (fileName.value.trim() || 'video').replace(/\.(?:mp4|mov|webm|wav)$/i, '') + extension();
      updateRange(); updateSubtitle();
    }
    async function buildSubtitle(snap) {
      if (kind.value !== 'full' || !subtitleOn.checked) return undefined;
      if (!subtitlePath) throw Error('请先选择字幕文件');
      const anchor = { type: anchorType.value };
      if (anchor.type === 'manual') anchor.seconds = finite(manual, '字幕秒数', 0, 86400);
      if (anchor.type === 'music') { anchor.musicId = musicId.value; if (!anchor.musicId) throw Error('请读取并选择已保存配乐'); if (!useMusic.checked) throw Error('配乐字幕锚点要求启用成片配乐'); }
      if (anchor.type === 'timeline') {
        if (!subtitleStatement || subtitleStatement.projectId !== snap.projectId || subtitleStatement.path !== snap.path || subtitleStatement.revision !== snap.revision || subtitleStatement.source !== snap.source) throw Error('字幕基准语句已变化或未选择，请重新选择');
        anchor.scene = snap.sceneRelativePath; anchor.line = subtitleStatement.line; anchor.sourceHash = await sourceHash(snap.source);
      }
      return { sourcePath: subtitlePath, mode: subtitleMode.value, anchor };
    }
    const integer = (input, label, min, max) => { const value = finite(input, label, min, max); if (!Number.isInteger(value)) throw Error(`${label}必须为整数`); return value; };
    const snapshotKeys = ['projectId', 'projectPath', 'path', 'source', 'revision', 'engineId', 'runtimeBindingSignature'];
    async function queueSnapshotCurrent(captured) {
      if (disposed || cancelRequested) return false;
      const current = await bridge.snapshot();
      if (disposed || cancelRequested) return false;
      if (snapshotKeys.some(key => current[key] !== captured[key])) throw Error('工程、剧本或运行时已变化，请重新打开导出设置');
      return true;
    }
    button(exportActions, '加入导出队列', async () => {
      ++queueSerial; cancelRequested = false;
      const snap = await bridge.snapshot();
      if (disposed || cancelRequested) return;
      const current = attached ? null : getSnapshot();
      if (current && (current.projectId !== snap.projectId || current.path !== snap.path)) throw Error('工程/场景已切换，请刷新剧情列表');
      const selected = scope.value === 'selection';
      if (selected && !selection) throw Error('请先锁定所选片段');
      if (selected && (selection.projectId != null && selection.projectId !== snap.projectId || selection.path !== snap.path || selection.revision !== snap.revision || selection.source !== snap.source)) throw Error('片段对应的剧本已变化，请重新锁定');
      const name = fileName.value.trim(), ext = extension();
      if (!name || /[\\/:*?"<>|\x00-\x1f]/.test(name) || !name.toLowerCase().endsWith(ext)) throw Error(`文件名需要以 ${ext} 结尾，且不能包含路径或非法字符`);
      const full = kind.value === 'full', audio = kind.value === 'audio';
      if (!audio && !['1280x720', '1920x1080', '2560x1440', '3840x2160'].includes(resolution.value)) throw Error('请选择受支持的分辨率');
      const size = audio ? [1920, 1080] : resolution.value.split('x').map(Number);
      const parallel = audio ? 1 : integer(workers, '并行数', 1, 32);
      const config = await bridge.service('/api/config');
      if (disposed || cancelRequested) return;
      const speeds = await controller.readSpeeds();
      if (disposed || cancelRequested) return;
      const subtitle = await buildSubtitle(snap);
      if (disposed || cancelRequested) return;
      const settings = { ...config.settings, ...speeds, width: size[0], height: size[1], fps: Number(fps.value), workers: parallel, gpuRawMode: !full && quality.value === 'traditional' ? 'recommended' : quality.value, mode: 'auto', bgmBaseMode: 'auto' };
      const ranges = selected ? selection.ranges : [null]; let submitted = 0;
      if (queueProject !== snap.projectId) { exportJobs = []; queueProject = snap.projectId; }
      for (let index = 0; index < ranges.length; index++) {
        if (!await queueSnapshotCurrent(snap)) break;
        const range = ranges[index];
        const options = { scene: snap.sceneRelativePath, sourceText: snap.source, settings, storyScope: selected ? 'sceneOnly' : scope.value, exportKind: kind.value, includeBackground: kind.value !== 'stage' || includeBackground.checked, includeFigures: kind.value !== 'stage' || includeFigures.checked, transparentFormat: kind.value === 'dialog' || kind.value === 'stage' && !includeBackground.checked ? transparentFormat.value : 'mov', fileName: ranges.length > 1 ? name.slice(0, -ext.length) + `-${index + 1}` + ext : name, useMusicTimeline: full && useMusic.checked, replaceGameBgm: full && useMusic.checked && replaceBgm.checked };
        if (output.value.trim()) options.outputDir = output.value.trim(); if (subtitle) options.subtitle = subtitle;
        if (range) options.range = { startLine: range.startLine, endLine: range.endLine, sourceHash: selection.sourceHash };
        const job = await bridge.exportVideo({ ...options, snapshot: snap }); if (!job?.id) throw Error('导出服务未返回任务 ID');
        exportJobs.push(job.id); submitted++;
        // An already queued job remains independent of this UI. Only a job whose
        // submission was interrupted here is canceled when its ID finally arrives.
        if (disposed || cancelRequested) await bridge.cancelJob(job.id);
        if (disposed) return;
        jobInfo.textContent = `已加入 ${submitted} 个任务，等待渲染`;
      }
      if (disposed) return;
      const text = cancelRequested ? '已请求取消导出；未提交的片段已停止' : `已加入 ${submitted} 个导出任务，可以关闭窗口继续编辑`;
      exportStatus.textContent = text; message(text);
    }, ['exportVideo', 'service', 'previewSettings']).className = 'wvc-primary';
    async function refreshJobs() {
      if (jobsRefreshing || !exportJobs.length) return;
      jobsRefreshing = true;
      try {
        const jobs = await bridge.service('/api/jobs'); if (disposed) return;
        const states = { queued: '排队中', running: '导出中', completed: '已完成', failed: '失败', canceled: '已取消', cancelled: '已取消', needs_attention: '需要处理', deleting: '正在清理' };
        const rows = (Array.isArray(jobs) ? jobs : jobs.jobs || []).filter(job => exportJobs.includes(job.id));
        jobInfo.replaceChildren(...rows.map(job => {
          const entry = el('div', null, { className: 'wvc-export-job' });
          entry.append(el('strong', (job.output || job.title || '导出任务').split(/[\\/]/).pop()), el('p', `${states[job.state] || job.state}${Number.isFinite(job.progress) ? ' · ' + Math.round(job.progress * 100) + '%' : ''}${job.message ? ' · ' + job.message : ''}`, { className: 'wvc-help' }));
          return entry;
        }));
      } finally { jobsRefreshing = false; }
    }
    button(exportActions, '刷新导出状态', refreshJobs, ['service']);
    button(exportActions, '取消本面板导出任务', async () => {
      if (disposed) return;
      cancelRequested = true;
      const serial = queueSerial, targets = [...exportJobs];
      try { for (const id of targets) await bridge.cancelJob(id); }
      catch (error) { if (!disposed && serial === queueSerial) throw error; return; }
      if (disposed || serial !== queueSerial) return;
      exportStatus.textContent = '已请求取消导出任务'; message(exportStatus.textContent);
    }, ['exportVideo'], true);
    exportCard.append(exportStatus, jobInfo);
    for (const input of [kind, includeBackground, transparentFormat]) on(input, 'change', () => updateExport({ rename: true }));
    for (const input of [resolution, quality, useMusic, scope]) on(input, 'change', () => updateExport());
    for (const input of [subtitleOn, anchorType]) on(input, 'change', updateSubtitle);
    updateExport(); updateMusicChoices();
    drawMusic(); refreshCapabilities();
    const interval = setInterval(() => { if (!disposed) { refreshCapabilities(); if (!working && !exportCard.hidden && exportJobs.length) refreshJobs().catch(e => { exportStatus.textContent = e.message; }); } }, 1500);
    let attached = false, activeView = null;
    function detachExport() { if (!attached) return; attached = false; panel.append(exportCard); exportCard.hidden = activeView !== 'export'; }
    return {
      show(view) { activeView = view; musicCard.hidden = view !== 'music'; timeCard.hidden = view !== 'time'; musicUI?.show?.(view === 'music'); if (!attached) exportCard.hidden = view !== 'export'; },
      canLeave() { return activeView !== 'music' || musicUI?.canLeave?.() !== false; },
      attachExport(host, exportKind = 'full') {
        if (working) throw Error('正在处理导出，请稍候');
        if (activeView === 'music' && musicUI?.canLeave?.() === false) throw Error('请先保存音乐配置，或确认放弃修改后再导出');
        if (!exportKinds.some(([key]) => key === exportKind)) throw Error('未知导出内容');
        attached = true; kind.value = exportKind; includeBackground.checked = true; includeFigures.checked = true; transparentFormat.value = 'mov'; post.open = false;
        scope.value = 'full'; selection = null; pickerSnapshot = null; pickerRows = []; pickedRows.clear(); drawExportRows();
        subtitleOn.checked = false; subtitlePath = ''; subtitleLabel.textContent = '未选择字幕'; subtitleStatement = null; anchorType.value = 'video';
        updateExport({ rename: true }); host.append(exportCard); exportCard.hidden = false;
        return detachExport;
      },
      busy: () => working,
      dispose() { disposed = true; clearInterval(interval); for (const remove of [...disposers, ...pickerDisposers]) remove(); musicUI?.dispose?.(); exportCard.remove(); panel.remove(); }
    };

  }
  root.WebVideoCraftMediaUI = { mount };
})(typeof window !== 'undefined' ? window : globalThis);

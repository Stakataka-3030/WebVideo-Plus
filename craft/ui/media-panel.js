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
    const progress = el('progress', null, { max: 1, hidden: true });
    const message = value => { if (disposed) return; status.textContent = String(value); notify(String(value)); };
    function refreshCapabilities() { caps = bridge.capabilities() || {}; for (const b of buttons) { const missing = b.required.find(key => caps[key] !== true); b.node.disabled = (working && !b.cancel) || !!missing; b.node.title = missing ? caps[missing + 'Reason'] || caps.reason || `${missing} 尚未绑定，请先打开支持的 Craft 工程/游戏预览` : ''; } }
    async function action(fn) { return run(async () => { if (disposed || working) return; working = true; refreshCapabilities(); try { await fn(); } finally { working = false; progress.hidden = true; if (!disposed) refreshCapabilities(); } }); }
    function button(parent, text, fn, required = [], cancel = false) { const node = el('button', text, { type: 'button' }); buttons.push({ node, required, cancel }); on(node, 'click', () => { if (cancel) Promise.resolve(fn()).catch(e => message(e.message)); else action(fn); }); parent.append(node); return node; }
    function field(parent, label, value = '', type = 'text') { const box = el('label', null, { className: 'wvc-field' }), input = el('input', null, { type, value }); box.append(el('span', label), input); parent.append(box); return input; }
    function select(parent, label, choices) { const box = el('label', null, { className: 'wvc-field' }), input = el('select'); for (const [value, text] of choices) input.append(el('option', text, { value })); box.append(el('span', label), input); parent.append(box); return input; }
    function check(parent, label, checked = false) { const box = el('label'), input = el('input', null, { type: 'checkbox', checked }); box.append(input, document.createTextNode(label)); parent.append(box); return input; }
    function card(title) { const node = el('section', null, { className: 'wvc-card' }); node.append(el('h3', title)); panel.append(node); return node; }
    const row = parent => { const node = el('div', null, { className: 'wvc-actions' }); parent.append(node); return node; };
    const finite = (input, name, min, max) => { if (String(input.value).trim() === '') throw Error(`${name}不能为空`); const value = Number(input.value); if (!Number.isFinite(value) || value < min || value > max) throw Error(`${name}应在 ${min} 到 ${max} 之间`); return value; };
    function onProgress(data) { if (disposed) return; progress.hidden = false; if (Number.isFinite(data?.progress)) progress.value = Math.min(1, Math.max(0, data.progress)); else progress.removeAttribute('value'); status.textContent = data?.message || data?.phase || '实际测量中…'; }
    const musicCard = card('成片配乐 · 保持音频原长');
    musicCard.append(el('p', '同一播放器顺序播放，不同播放器可并行。改动需点击保存配置；删除仅移除配乐配置。', { className: 'wvc-help' }));
    const musicActions = row(musicCard), tracks = el('div', null, { className: 'wvc-music-tracks' });
    const lane = field(musicActions, '播放器（从 1 开始）', 1, 'number'), start = field(musicActions, '导入起点（秒；留空接在末尾）', '', 'number');
    function drawMusic() {
      tracks.replaceChildren(); const state = controller.state();
      for (const track of state.music.tracks) {
        const item = el('div', null, { className: 'wvc-card' }), inputs = row(item);
        item.append(el('strong', `${track.name || track.file} · 原长 ${track.durationSeconds.toFixed(3)} 秒 · ID: ${track.id}`));
        const tLane = field(inputs, '播放器', track.lane + 1, 'number'), tStart = field(inputs, '起点（秒）', track.startSeconds, 'number'), volume = field(inputs, '音量', track.volume, 'number');
        const enabled = check(inputs, '启用', track.enabled !== false);
        button(inputs, '更新位置/音量', async () => { const v = finite(volume, '音量', 0, 100), l = finite(tLane, '播放器', 1, state.music.players), s = finite(tStart, '起点', 0, 86400); await controller.moveTrack(track.id, l - 1, s); await controller.updateTrack(track.id, { volume: v, enabled: enabled.checked }); drawMusic(); message('配乐已调整，尚未保存'); }, ['projectFiles']);
        button(inputs, '移除', async () => { await controller.removeTrack(track.id); drawMusic(); message('已移除配置，音频文件保留；请保存'); }, ['projectFiles']); tracks.append(item);
      }
      musicInfo.textContent = state.loaded ? `${state.music.players} 个播放器，${state.music.tracks.length} 首配乐` : '尚未读取当前项目配置';
      refreshCapabilities();
    }
    button(musicActions, '读取配乐', async () => { await controller.loadMusic(); selection = null; drawMusic(); message('已读取并校验音频原长'); }, ['projectFiles', 'music']);
    button(musicActions, '导入音频…', async () => { await controller.addTracks(undefined, { lane: finite(lane, '播放器', 1, controller.state().music.players) - 1, startSeconds: String(start.value).trim() === '' ? null : finite(start, '起点', 0, 86400) }); drawMusic(); message('音频已导入；请保存配乐配置'); }, ['audioImport', 'music']);
    button(musicActions, '增加播放器', async () => { await controller.addPlayer(); drawMusic(); }, ['projectFiles']);
    button(musicActions, '删除所选播放器及其配乐', async () => { if (!root.confirm('移除指定播放器及其配乐配置？音频文件仍会保留。')) return; await controller.removePlayer(finite(lane, '播放器', 1, controller.state().music.players) - 1); drawMusic(); }, ['projectFiles']);
    button(musicActions, '保存配乐配置', async () => { await controller.saveMusic({ ...controller.state().music, enabled: true }); message('配乐配置已启用并保存，保留修改前备份'); }, ['projectFiles', 'music']);
    const musicInfo = el('p', '', { className: 'wvc-help' }); musicCard.append(musicInfo, tracks);
    const timeCard = card('实际时间、片段和速度'), speedRow = row(timeCard);
    const textSpeed = field(speedRow, '文字速度', 50, 'number'), autoSpeed = field(speedRow, '自动播放速度', 50, 'number');
    button(speedRow, '读取预览速度', async () => { const value = await controller.readSpeeds(); textSpeed.value = value.textSpeed; autoSpeed.value = value.autoSpeed; message('已读取当前游戏预览的实际速度'); }, ['previewSettings']);
    button(speedRow, '应用预览速度', async () => { const value = await controller.writeSpeeds({ textSpeed: finite(textSpeed, '文字速度', -100, 100), autoSpeed: finite(autoSpeed, '自动播放速度', -100, 100) }); textSpeed.value = value.textSpeed; autoSpeed.value = value.autoSpeed; selection = null; message('本次预览会话速度已更新；原计时已失效'); }, ['previewSettings']);
    const timeRow = row(timeCard), timingInfo = el('p', '尚未测量', { className: 'wvc-help' });
    function showTiming(result) { timingInfo.textContent = `实际故事时长 ${result.seconds.toFixed(3)} 秒；${result.timing.storyTimeline.scenes.length} 个场景。交互/手动分支按服务返回的线性时间线处理。`; }
    button(timeRow, '测量实际时间', async () => { const result = await controller.measure({ force: true, onProgress }); selection = null; showTiming(result); message('实际时间测量完成'); }, ['timing', 'previewSettings']);
    button(timeRow, '验证已缓存时间', async () => { showTiming(await controller.getTiming()); message('已校验剧本、速度和完整工程依赖'); }, ['timing', 'previewSettings']);
    button(timeRow, '取消测量/匹配', () => controller.cancel().then(() => message('已请求取消')), [], true);
    const fitText = check(timeRow, '匹配文字速度', true), fitAuto = check(timeRow, '匹配自动速度', true);
    button(timeRow, '调整故事速度匹配配乐', async () => { const result = await controller.fitToMusic({ textSpeed: fitText.checked, autoSpeed: fitAuto.checked, onProgress }); textSpeed.value = result.settings.textSpeed; autoSpeed.value = result.settings.autoSpeed; selection = null; showTiming(result); message(`${result.matched ? '已匹配' : '两次实测校准后采用最接近结果'}，误差 ${result.errorSeconds.toFixed(3)} 秒；应用于本次预览会话，音乐原长不变`); }, ['timing', 'previewSettings']);
    const selectionInfo = el('p', '尚未锁定片段', { className: 'wvc-help' });
    button(timeRow, '从剧情勾选行锁定片段', async () => { const selected = getSelection(); selection = await controller.selectSegments(selected.map(item => ({ startLine: item.startLine, endLine: item.endLine }))); selectionInfo.textContent = selection.ranges.map(r => `${r.startLine}–${r.endLine} 行：${r.startSeconds.toFixed(3)} 秒起，${r.durationSeconds.toFixed(3)} 秒`).join('；'); message('片段已锁定到当前剧本版本；不连续片段导出为独立任务'); }, ['timing', 'previewSettings']);
    button(timeRow, '清除片段', async () => { selection = null; selectionInfo.textContent = '尚未锁定片段'; });
    timeCard.append(timingInfo, selectionInfo, progress);
    const exportCard = card('字幕与视频导出'), subtitleRow = row(exportCard);
    const subtitleOn = check(subtitleRow, '附加字幕', false), subtitleLabel = el('span', '未选择字幕');
    button(subtitleRow, '选择 SRT / ASS / SSA…', async () => { const value = await bridge.service('/api/dialog/subtitle', {}); if (!value.canceled && value.path) { subtitlePath = value.path; subtitleLabel.textContent = value.name || value.path; subtitleOn.checked = true; } }, ['service']); subtitleRow.append(subtitleLabel);
    const subtitleMode = select(subtitleRow, '字幕输出', [['soft', '软字幕（MP4 转 mov_text）'], ['burn', '烧录（libass，可保留 ASS 样式）']]);
    const anchorType = select(subtitleRow, '字幕基准', [['video', '视频起点'], ['manual', '视频内秒数'], ['timeline', '当前场景实测行'], ['music', '成片配乐起点']]);
    const manual = field(subtitleRow, '手动秒数', 0, 'number'), anchorLine = field(subtitleRow, '场景行号', 1, 'number'), musicId = field(subtitleRow, '配乐 ID（从配置中复制）');
    const exportRow = row(exportCard), output = field(exportRow, '输出文件夹（留空用内核默认目录）'), fileName = field(exportRow, '文件名', 'video.mp4');
    button(exportRow, '选择输出文件夹…', async () => { const value = await bridge.service('/api/dialog/folder', {}); if (!value.canceled && value.path) output.value = value.path; }, ['service']);
    const width = field(exportRow, '宽', 1280, 'number'), height = field(exportRow, '高', 720, 'number'), fps = field(exportRow, 'FPS', 30, 'number');
    const workers = field(exportRow, '并行工作进程', 1, 'number');
    const scope = select(exportRow, '故事范围', [['full', '完整故事'], ['fromScene', '从当前场景开始'], ['sceneOnly', '仅当前场景']]), useMusic = check(exportRow, '使用已保存成片配乐', true), replaceBgm = check(exportRow, '成片配乐替换游戏 BGM', true);
    const jobInfo = el('p', '', { className: 'wvc-help' });
    async function buildSubtitle() {
      if (!subtitleOn.checked) return undefined;
      if (!subtitlePath) throw Error('请先选择字幕文件');
      let anchor = { type: anchorType.value };
      if (anchor.type === 'manual') anchor.seconds = finite(manual, '字幕秒数', 0, 86400);
      if (anchor.type === 'music') { anchor.musicId = musicId.value.trim(); if (!anchor.musicId) throw Error('请输入配乐 ID'); if (!useMusic.checked) throw Error('配乐字幕锚点要求启用成片配乐'); }
      if (anchor.type === 'timeline') { const measured = await controller.getTiming(); anchor.scene = measured.snapshot.sceneRelativePath; anchor.line = finite(anchorLine, '字幕行号', 1, measured.snapshot.source.split('\n').length); anchor.sourceHash = measured.sourceHash; }
      return { sourcePath: subtitlePath, mode: subtitleMode.value, anchor };
    }
    button(exportRow, '加入导出队列', async () => {
      const snap = await bridge.snapshot(), current = getSnapshot();
      if (current && (current.projectId !== snap.projectId || current.path !== snap.path)) throw Error('工程/场景已切换，请刷新剧情列表');
      if (selection && (selection.path !== snap.path || selection.revision !== snap.revision || selection.source !== snap.source)) throw Error('片段对应的剧本已变化，请重新锁定');
      const config = await bridge.service('/api/config'), speeds = await controller.readSpeeds(), subtitle = await buildSubtitle();
      const settings = { ...config.settings, ...speeds, width: finite(width, '宽度', 16, 16384), height: finite(height, '高度', 16, 16384), fps: finite(fps, 'FPS', 1, 120), workers: finite(workers, '并行工作进程', 1, 32), mode: 'auto', bgmBaseMode: 'auto' };
      const ranges = selection?.ranges || [null]; exportJobs = [];
      for (let index = 0; index < ranges.length; index++) {
        const range = ranges[index], name = fileName.value.trim(); if (!/\.mp4$/i.test(name)) throw Error('完整视频文件名需要以 .mp4 结尾');
        const options = { scene: snap.sceneRelativePath, settings, storyScope: scope.value, exportKind: 'full', fileName: ranges.length > 1 ? name.replace(/\.mp4$/i, `-${index + 1}.mp4`) : name, useMusicTimeline: useMusic.checked, replaceGameBgm: replaceBgm.checked };
        if (output.value.trim()) options.outputDir = output.value.trim(); if (subtitle) options.subtitle = subtitle;
        if (range) options.range = { startLine: range.startLine, endLine: range.endLine, sourceHash: selection.sourceHash };
        const job = await bridge.exportVideo(options); exportJobs.push(job.id); jobInfo.textContent = `已加入 ${exportJobs.length} 个任务：${exportJobs.join('，')}`;
      }
      message(`已加入 ${exportJobs.length} 个视频导出任务，尚未完成渲染`);
    }, ['exportVideo', 'service', 'previewSettings']);
    button(exportRow, '刷新导出状态', async () => { const jobs = await bridge.service('/api/jobs'); jobInfo.textContent = (Array.isArray(jobs) ? jobs : jobs.jobs || []).filter(job => exportJobs.includes(job.id)).map(job => `${job.id}：${job.state} ${job.message || ''}`).join('\n') || '尚无本面板提交的任务'; }, ['service']);
    button(exportRow, '取消本面板导出任务', async () => { for (const id of exportJobs) await bridge.cancelJob(id); message('已请求取消导出任务'); }, ['exportVideo'], true);
    exportCard.append(jobInfo); panel.append(status); drawMusic(); refreshCapabilities();
    const interval = setInterval(() => { if (!disposed) refreshCapabilities(); }, 1000);
    return { show(view) { musicCard.hidden = view !== 'music'; timeCard.hidden = view !== 'time'; exportCard.hidden = view !== 'export'; }, dispose() { disposed = true; clearInterval(interval); for (const remove of disposers) remove(); controller.cancel().catch(() => {}); panel.remove(); } };
  }
  root.WebVideoCraftMediaUI = { mount };
})(typeof window !== 'undefined' ? window : globalThis);

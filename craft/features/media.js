/* Craft media controllers. All host I/O goes through the version-qualified bridge. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = (value, min, max, name) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`${name}无效`);
    return value;
  };
  const integer = (value, min, max, name) => { number(value, min, max, name); if (!Number.isInteger(value)) throw Error(`${name}必须为整数`); return value; };
  function relative(value) {
    if (typeof value !== 'string' || !value || /[\x00-\x1f:%?*"<>|]/.test(value)) throw Error('项目内相对路径无效');
    const path = value.replace(/\\/g, '/');
    if (path.split('/').some(part => !part || part === '.' || part === '..')) throw Error('项目内相对路径无效');
    return path;
  }
  const canonical = source => source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  async function sha(source) {
    const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(source)));
    return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function availableStart(tracks, lane, start, duration, except) {
    integer(lane, 0, 63, '播放器'); number(start, 0, 86400, '起点'); number(duration, .000001, 86400, '音频时长');
    let next = start;
    for (const track of tracks.filter(t => t.id !== except && t.lane === lane).sort((a, b) => a.startSeconds - b.startSeconds)) {
      if (next + duration <= track.startSeconds + 1e-7) break;
      if (next < track.startSeconds + track.durationSeconds && next + duration > track.startSeconds) next = track.startSeconds + track.durationSeconds;
    }
    return next;
  }
  function normalizeMusic(value = { schemaVersion: 2, enabled: false, players: 1, tracks: [] }) {
    if (value.schemaVersion !== 2 || !Array.isArray(value.tracks)) throw Error('需要 schema 2 音乐配置；旧版请先迁移');
    const result = clone(value), ids = new Set();
    integer(result.players, 1, 64, '播放器数量');
    if (result.tracks.length > 64) throw Error('一个项目最多 64 首音乐');
    result.tracks = result.tracks.map(track => {
      if (typeof track.id !== 'string' || !track.id || ids.has(track.id)) throw Error('音乐 ID 缺失或重复');
      ids.add(track.id);
      relative(track.file); integer(track.lane, 0, result.players - 1, '播放器');
      number(track.startSeconds, 0, 86400, '起点'); number(track.durationSeconds, .000001, 86400, '音频时长');
      number(track.volume ?? 100, 0, 100, '音量');
      if ((track.offsetSeconds ?? 0) !== 0 || track.loop === true || track.fullLength === false || (track.fadeInSeconds ?? 0) !== 0 || (track.fadeOutSeconds ?? 0) !== 0) throw Error('成片音乐必须保持原始完整时长，不能截取、循环或淡入淡出');
      return { ...track, file: relative(track.file), offsetSeconds: 0, fullLength: true, loop: false, fadeInSeconds: 0, fadeOutSeconds: 0, volume: track.volume ?? 100, enabled: track.enabled !== false };
    });
    for (const track of result.tracks) if (availableStart(result.tracks, track.lane, track.startSeconds, track.durationSeconds, track.id) > track.startSeconds + 1e-7) throw Error('同一播放器内音乐不能重叠');
    return result;
  }
  function resolveSubtitleAnchor(anchor, timing, bounds, music) {
    number(bounds.startSeconds, 0, 86400, '导出起点'); number(bounds.durationSeconds, 0, 86400, '导出时长');
    const relativeTime = value => {
      const seconds = value - bounds.startSeconds;
      if (seconds < -.001 || seconds > bounds.durationSeconds + .001) throw Error('字幕锚点不在本次导出范围内');
      return Math.max(0, Math.min(bounds.durationSeconds, seconds));
    };
    switch (anchor?.type || 'video') {
      case 'video': return 0;
      case 'manual': return number(anchor.seconds, 0, bounds.durationSeconds, '手动字幕时间');
      case 'music': {
        if (!music?.enabled) throw Error('本次导出未启用成片音乐');
        const track = music.tracks.find(t => t.id === anchor.musicId && t.enabled !== false);
        if (!track) throw Error('字幕基准音乐不存在或已停用');
        return relativeTime(track.startSeconds);
      }
      case 'timeline': {
        const scene = timing?.storyTimeline?.scenes?.find(s => relative(s.scene) === relative(anchor.scene));
        if (!scene || !anchor.sourceHash || scene.hash !== anchor.sourceHash) throw Error('字幕锚点源文件已变化或未经校验');
        integer(anchor.line, 1, scene.lineTimes.length, '字幕行号');
        const milliseconds = number(scene.lineTimes[anchor.line - 1], 0, 86400000, '语句实测时间');
        return relativeTime(milliseconds / 1000);
      }
      default: throw Error('字幕时间基准无效');
    }
  }
  function createController(bridge) {
    let music = normalizeMusic(), loaded = false, baseText = null, musicScope = null, timing = null, serial = 0, activeJob = null, busy = false;
    const capability = async name => {
      const caps = await bridge.capabilities();
      if (caps[name] !== true) throw Error(caps.reason || `${name} 功能未绑定到当前 Craft 版本`);
    };
    const snapshot = async () => {
      const value = await bridge.snapshot();
      if (!value || typeof value.source !== 'string' || value.revision === undefined || !value.projectId || !value.path) throw Error('当前 Craft 文档快照不可用');
      return value;
    };
    const identity = value => JSON.stringify([value.projectId, value.projectPath, value.path, value.revision, value.source]);
    const check = async (captured, ticket, signal) => {
      if (signal?.aborted || ticket !== serial) throw Error('操作已取消');
      if (identity(await snapshot()) !== identity(captured)) throw Error('工程或未保存的剧本已变化，请重新执行');
    };
    const settings = async () => {
      await capability('previewSettings');
      const values = await bridge.readPreviewSettings();
      for (const key of ['textSpeed', 'autoSpeed']) number(values[key], -100, 100, key);
      return { textSpeed: values.textSpeed, autoSpeed: values.autoSpeed };
    };
    const dependency = async () => typeof bridge.timingDependencyHash === 'function' ? await bridge.timingDependencyHash() : null;
    async function measureAt(captured, values, options, ticket) {
      await capability('timing'); await check(captured, ticket, options.signal);
      const sourceHash = await sha(captured.source), dependencyHash = await dependency();
      const key = JSON.stringify([identity(captured), values, dependencyHash]);
      if (!options.force && dependencyHash && timing?.key === key) return clone(timing.result);
      const cfg = await bridge.service('/api/config');
      await check(captured, ticket, options.signal);
      const effective = { ...cfg.settings, ...values, mode: 'auto', bgmBaseMode: 'auto' };
      const job = await bridge.service('/api/timing', { project: captured.projectId, scene: relative(captured.sceneRelativePath), sourceText: captured.source, settings: effective, linearTimeline: true });
      if (!job?.id) throw Error('计时服务未返回任务 ID');
      activeJob = job.id;
      try {
        for (let i = 0; i < 3600; i++) {
          await check(captured, ticket, options.signal);
          const data = await bridge.service('/api/timing/' + encodeURIComponent(job.id));
          options.onProgress?.(data.job);
          if (data.job?.state === 'completed') {
            await check(captured, ticket, options.signal);
            if (data.sourceHash !== sourceHash) throw Error('计时结果与当前未保存剧本不一致');
            if (dependencyHash && await dependency() !== dependencyHash) throw Error('其他场景或计时依赖已变化');
            const seconds = number(data.timing?.storyTimeline?.durationSeconds ?? data.timing?.durationSeconds, 0, 86400, '故事实测时长');
            if (!data.timing?.storyTimeline?.scenes?.length) throw Error('服务没有返回实际多场景时间线');
            const result = { seconds, timing: data.timing, settings: values, sourceHash, dependencyHash, snapshot: captured };
            timing = { key, result: clone(result) };
            return result;
          }
          if (['failed', 'needs_attention', 'canceled', 'cancelled'].includes(data.job?.state)) throw Error(data.job.message || '实际时间计算失败');
          await new Promise(resolve => setTimeout(resolve, options.pollInterval ?? 500));
        }
        throw Error('实际时间计算超时');
      } catch (error) {
        await bridge.service('/api/jobs/' + encodeURIComponent(job.id) + '/cancel', {}).catch(() => {});
        throw error;
      } finally { if (activeJob === job.id) activeJob = null; }
    }
    async function freshTiming() {
      if (!timing) throw Error('请先测量实际时间');
      const result = timing.result;
      await check(result.snapshot, serial);
      if (JSON.stringify(await settings()) !== JSON.stringify(result.settings)) throw Error('预览速度已变化，请重新测量');
      if (!result.dependencyHash || await dependency() !== result.dependencyHash) throw Error('无法确认其他场景依赖仍有效，请重新测量');
      return clone(result);
    }
    async function assertMusicScope() {
      if (!loaded || (await snapshot()).projectId !== musicScope) throw Error('请先读取当前工程的音乐配置');
    }
    const api = {
      state: () => ({ music: clone(music), loaded, busy, timing: timing ? clone(timing.result) : null }),
      async loadMusic() {
        await capability('projectFiles'); const captured = await snapshot();
        const ticket = serial;
        const text = await bridge.readProjectFile('video-project.json', null);
        const value = text === null ? normalizeMusic() : JSON.parse(text);
        let next;
        if ((value.tracks || []).length) await capability('music');
        if (value.schemaVersion === 1) {
          const measured = await freshTiming(), tracks = [];
          for (const old of value.tracks || []) {
            const scene = measured.timing.storyTimeline.scenes.find(s => relative(s.scene) === relative(old.scene));
            if (!scene) throw Error('旧音乐场景不在实际时间线内');
            const info = await bridge.service('/api/music/duration', { project: captured.projectId, file: relative(old.file) });
            const duration = number(info.durationSeconds, .000001, 86400, '音频原长');
            const start = number(old.startSeconds ?? 0, 0, 86400, '起点') + scene.startSeconds;
            let lane = integer(old.lane ?? 0, 0, 63, '播放器');
            while (lane < 64 && availableStart(tracks, lane, start, duration) > start + 1e-7) lane++;
            if (lane >= 64) throw Error('迁移所需播放器超过 64');
            tracks.push({ ...old, id: old.id || root.crypto.randomUUID(), scene: '', lane, startSeconds: start, durationSeconds: duration, offsetSeconds: 0, fullLength: true, loop: false, fadeInSeconds: 0, fadeOutSeconds: 0 });
          }
          next = normalizeMusic({ ...value, schemaVersion: 2, players: Math.max(1, ...tracks.map(t => t.lane + 1)), tracks });
        } else {
          next = normalizeMusic(value);
          for (const track of next.tracks) {
            const info = await bridge.service('/api/music/duration', { project: captured.projectId, file: track.file });
            track.durationSeconds = number(info.durationSeconds, .000001, 86400, '音频原长');
          }
          next = normalizeMusic(next);
        }
        await check(captured, ticket); music = next; baseText = text; loaded = true; musicScope = captured.projectId;
        return clone(music);
      },
      async saveMusic(value = music) {
        await capability('projectFiles'); await assertMusicScope(); const captured = await snapshot(), ticket = serial;
        const next = normalizeMusic(value);
        if (next.tracks.length) await capability('music');
        for (const track of next.tracks) {
          const info = await bridge.service('/api/music/duration', { project: captured.projectId, file: track.file });
          if (Math.abs(number(info.durationSeconds, .000001, 86400, '音频原长') - track.durationSeconds) > .001) throw Error('音频时长已变化，请重新读取音乐配置');
        }
        await check(captured, ticket);
        // A failed backup must leave the original configuration untouched.
        const backup = `.webvideo-plus/backups/music-${root.crypto.randomUUID()}.json`;
        await bridge.writeProjectFile(backup, JSON.stringify({ schemaVersion: 1, kind: 'music', before: baseText, after: next }), { create: true });
        await check(captured, ticket);
        const text = JSON.stringify(next, null, 2);
        await bridge.writeProjectFile('video-project.json', text, { expectedText: baseText, create: baseText === null });
        baseText = text; music = next; return clone(music);
      },
      async addTracks(files, { lane = 0, startSeconds = null } = {}) {
        await assertMusicScope(); await capability('audioImport');
        const captured = await snapshot(), ticket = serial, next = clone(music);
        if (next.tracks.length + (files?.length || 0) > 64) throw Error('一个项目最多 64 首音乐');
        integer(lane, 0, music.players - 1, '播放器');
        let cursor = startSeconds ?? Math.max(0, ...next.tracks.filter(t => t.lane === lane).map(t => t.startSeconds + t.durationSeconds));
        const assets = await bridge.importAudio(files);
        if (!Array.isArray(assets) || next.tracks.length + assets.length > 64) throw Error('导入后音乐数量超过 64');
        for (const asset of assets) {
          await check(captured, ticket);
          const info = await bridge.service('/api/music/duration', { project: captured.projectId, file: relative(asset.file) });
          const duration = number(info.durationSeconds, .000001, 86400, '音频原长');
          cursor = availableStart(next.tracks, lane, cursor, duration);
          next.tracks.push({ id: root.crypto.randomUUID(), name: asset.name || asset.label || asset.file, file: asset.file, lane, startSeconds: cursor, durationSeconds: duration, volume: 100 }); cursor += duration;
        }
        await check(captured, ticket); music = normalizeMusic(next); return clone(music);
      },
      async moveTrack(id, lane, start) { await assertMusicScope(); const next = clone(music), track = next.tracks.find(t => t.id === id); if (!track) throw Error('音乐不存在'); integer(lane, 0, next.players - 1, '播放器'); track.startSeconds = availableStart(next.tracks, lane, start, track.durationSeconds, id); track.lane = lane; music = normalizeMusic(next); return clone(music); },
      async updateTrack(id, patch) { await assertMusicScope(); if (Object.keys(patch).some(k => !['volume', 'enabled'].includes(k))) throw Error('仅可更新音量和启用状态'); const next = clone(music), track = next.tracks.find(t => t.id === id); if (!track) throw Error('音乐不存在'); Object.assign(track, patch); music = normalizeMusic(next); return clone(music); },
      async removeTrack(id) { await assertMusicScope(); music = normalizeMusic({ ...music, tracks: music.tracks.filter(t => t.id !== id) }); return clone(music); },
      async addPlayer() { await assertMusicScope(); music = normalizeMusic({ ...music, players: music.players + 1 }); return clone(music); },
      async removePlayer(lane) { await assertMusicScope(); integer(lane, 0, music.players - 1, '播放器'); music = normalizeMusic({ ...music, players: music.players - 1, tracks: music.tracks.filter(t => t.lane !== lane).map(t => ({ ...t, lane: t.lane > lane ? t.lane - 1 : t.lane })) }); return clone(music); },
      async measure(options = {}) { const ticket = ++serial; return measureAt(await snapshot(), await settings(), options, ticket); },
      getTiming: freshTiming,
      readSpeeds: settings,
      async writeSpeeds(values) {
        if (!values || !Object.keys(values).length || Object.keys(values).some(k => !['textSpeed', 'autoSpeed'].includes(k))) throw Error('预览速度字段无效');
        for (const [key, value] of Object.entries(values)) number(value, -100, 100, key);
        const captured = await snapshot(), ticket = serial, original = await settings();
        await check(captured, ticket);
        await bridge.writePreviewSettings(values, { expected: original, projectId: captured.projectId });
        timing = null; return settings();
      },
      invalidateTiming() { timing = null; serial++; },
      async cancel() { serial++; if (activeJob) await bridge.service('/api/jobs/' + encodeURIComponent(activeJob) + '/cancel', {}); },
      async selectSegments(ranges) {
        const measured = await freshTiming(), captured = measured.snapshot, lines = captured.source.split('\n');
        if (!Array.isArray(ranges) || !ranges.length) throw Error('请选择剧情范围');
        const offsets = [0]; for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length + 1);
        const sorted = ranges.map(range => ({ startLine: integer(range.startLine, 1, lines.length, '起始行'), endLine: integer(range.endLine, range.startLine, lines.length, '结束行') })).sort((a, b) => a.startLine - b.startLine);
        for (let i = 1; i < sorted.length; i++) if (sorted[i].startLine <= sorted[i - 1].endLine) throw Error('片段范围重复或重叠');
        const scene = measured.timing.storyTimeline.scenes.find(s => s.scene === captured.sceneRelativePath);
        if (!scene || scene.hash !== measured.sourceHash) throw Error('当前场景不在已校验的实际时间线中');
        const selected = sorted.map(r => {
          const start = scene.lineTimes.slice(r.startLine - 1, r.endLine).find(Number.isFinite);
          if (start === undefined) throw Error('选中片段没有实际执行时间');
          const end = scene.lineTimes.slice(r.endLine).find(Number.isFinite) ?? scene.endSeconds * 1000;
          number(end, start, 86400000, '片段结束时间');
          return { ...r, startOffset: offsets[r.startLine - 1], endOffset: Math.min(captured.source.length, offsets[r.endLine]), startSeconds: start / 1000, durationSeconds: (end - start) / 1000 };
        });
        return { schemaVersion: 1, path: captured.path, revision: captured.revision, source: captured.source, mode: sorted.length === 1 ? 'range' : 'set', sourceHash: measured.sourceHash, ranges: selected };
      },
      async resolveSubtitle(anchor, bounds) { const measured = anchor?.type === 'timeline' ? await freshTiming() : null; if (anchor?.type === 'music') await assertMusicScope(); return resolveSubtitleAnchor(anchor, measured?.timing, bounds, music); },
      async fitToMusic(options = {}) {
        await assertMusicScope();
        const keys = ['textSpeed', 'autoSpeed'].filter(k => options[k] !== false);
        if (!keys.length) throw Error('请选择至少一种速度');
        const target = Math.max(0, ...music.tracks.filter(t => t.enabled !== false).map(t => t.startSeconds + t.durationSeconds));
        if (!target) throw Error('没有可匹配的音乐');
        const captured = await snapshot(), original = await settings(), ticket = ++serial;
        {
          const base = await measureAt(captured, original, options, ticket), tolerance = Math.min(2, Math.max(.5, target * .003));
          const lowLimit = Math.min(...keys.map(k => -100 - original[k])), highLimit = Math.max(...keys.map(k => 100 - original[k]));
          let best = base, low = lowLimit, high = highLimit;
          const at = delta => ({ ...original, ...Object.fromEntries(keys.map(k => [k, Math.round(Math.max(-100, Math.min(100, original[k] + delta)) * 1000) / 1000])) });
          const budget = Math.max(2, 102 - original.textSpeed) + Math.max(16.667, 116.667 - original.autoSpeed);
          let delta = Math.max(low, Math.min(high, (1 - target / Math.max(base.seconds, .001)) * budget / keys.length)), previous = { delta: 0, result: base };
          for (let i = 0; i < 2 && Math.abs(best.seconds - target) > tolerance; i++) {
            const result = await measureAt(captured, at(delta), { ...options, force: true }, ticket);
            if (Math.abs(result.seconds - target) < Math.abs(best.seconds - target)) best = result;
            if (delta <= lowLimit + .001 && result.seconds < target - tolerance) throw Error('音乐过长，速度范围内无法匹配');
            if (delta >= highLimit - .001 && result.seconds > target + tolerance) throw Error('音乐过短，速度范围内无法匹配');
            if (result.seconds > target) low = Math.max(low, delta); else high = Math.min(high, delta);
            const slope = (result.seconds - previous.result.seconds) / (delta - previous.delta);
            const candidate = Number.isFinite(slope) && slope < 0 ? delta + (target - result.seconds) / slope : (low + high) / 2;
            previous = { delta, result }; delta = Math.max(low, Math.min(high, candidate));
          }
          await check(captured, ticket, options.signal);
          if (JSON.stringify(await settings()) !== JSON.stringify(original)) throw Error('预览速度已被其他操作改变');
          await bridge.writePreviewSettings(Object.fromEntries(keys.map(k => [k, best.settings[k]])), { expected: original, projectId: captured.projectId });
          timing = null;
          return { ...best, targetSeconds: target, errorSeconds: best.seconds - target, matched: Math.abs(best.seconds - target) <= tolerance, refinementsLimit: 2 };
        }
      }
    };
    for (const name of ['loadMusic', 'saveMusic', 'addTracks', 'moveTrack', 'updateTrack', 'removeTrack', 'addPlayer', 'removePlayer', 'measure', 'fitToMusic', 'writeSpeeds']) {
      const operation = api[name];
      api[name] = async (...args) => {
        if (busy) throw Error('已有媒体操作进行中');
        busy = true;
        try { return await operation(...args); } finally { busy = false; }
      };
    }
    return api;
  }
  root.WebVideoCraftMedia = { createController, normalizeMusic, availableStart, resolveSubtitleAnchor };
})(typeof window !== 'undefined' ? window : globalThis);

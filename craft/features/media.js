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
    let music = normalizeMusic(), loaded = false, baseText = null, musicScope = null, musicProjectPath = null;
    let baselineMusic = clone(music), baselineDirty = false, timing = null, serial = 0, busy = false, measuring = 0, progress = null;
    let knownSettings = null, knownDependency = null;
    const listeners = new Set(), running = new Map(), preparations = new Map(), musicProjects = new Map();
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const dirty = () => baselineDirty || !equal(music, baselineMusic);
    const state = () => ({ music: clone(music), loaded, dirty: dirty(), busy, measuring: measuring > 0, progress: progress ? clone(progress) : null,
      musicScope, projectId: musicScope, musicProjectPath, timing: timing ? clone(timing.result) : null });
    const emit = () => { for (const listener of listeners) { try { listener(state()); } catch {} } };
    const changedMusic = next => { music = normalizeMusic(next); emit(); return clone(music); };
    const capability = async name => {
      const caps = await bridge.capabilities();
      if (caps[name] !== true) throw Error(caps.reason || `${name} 功能未绑定到当前 Craft 版本`);
    };
    const snapshot = async () => {
      const value = await bridge.snapshot();
      if (!value || typeof value.source !== 'string' || value.revision === undefined || !value.projectId || !value.path) throw Error('当前 Craft 文档快照不可用');
      return value;
    };
    const identity = value => JSON.stringify([value.projectId, value.projectPath, value.path, value.revision, value.source, value.engineId, value.runtimeBindingSignature]);
    const projectKey = value => JSON.stringify([value.projectId, value.projectPath]);
    const check = async (captured, ticket, signal) => {
      if (signal?.aborted || ticket !== serial) throw Error('操作已取消');
      if (identity(await snapshot()) !== identity(captured)) throw Error('工程或未保存的剧本已变化，请重新执行');
      if (signal?.aborted || ticket !== serial) throw Error('操作已取消');
    };
    const settings = async () => {
      await capability('previewSettings');
      const values = await bridge.readPreviewSettings();
      for (const key of ['textSpeed', 'autoSpeed']) number(values[key], -100, 100, key);
      knownSettings = { textSpeed: values.textSpeed, autoSpeed: values.autoSpeed };
      if (timing && !equal(knownSettings, timing.result.settings)) { timing = null; emit(); }
      return clone(knownSettings);
    };
    const dependency = async () => {
      const value = typeof bridge.timingDependencyHash === 'function' ? await bridge.timingDependencyHash() : null;
      knownDependency = value;
      if (timing && value !== timing.result.dependencyHash) { timing = null; emit(); }
      return value;
    };
    const validKnownTiming = captured => !!timing && !!captured && identity(captured) === identity(timing.result.snapshot)
      && !!knownDependency && knownDependency === timing.result.dependencyHash && equal(knownSettings, timing.result.settings);
    const publish = result => {
      timing = { key: JSON.stringify([identity(result.snapshot), result.effectiveSettings, result.dependencyHash]), result: clone(result) };
      emit();
    };
    async function cancelJob(entry) {
      if (!entry.job || entry.cancelSent) return;
      entry.cancelSent = true;
      try {
        if (typeof bridge.cancelJob === 'function') await bridge.cancelJob(entry.job);
        else await bridge.service('/api/jobs/' + encodeURIComponent(entry.job) + '/cancel', {});
      } catch {}
    }
    function cancelEntry(entry) {
      if (entry.done || entry.cancelled) return;
      entry.cancelled = true;
      entry.wake?.();
      for (const user of [...entry.users]) user.cancel();
      void cancelJob(entry);
    }
    function cancelTiming() {
      serial++;
      for (const entry of running.values()) cancelEntry(entry);
    }
    async function runTiming(entry) {
      const { captured, values, effective, sourceHash, dependencyHash, ticket } = entry;
      const ensure = async () => {
        if (entry.cancelled) throw Error('操作已取消');
        await check(captured, ticket);
        if (entry.cancelled) throw Error('操作已取消');
      };
      try {
        await ensure();
        const job = await bridge.service('/api/timing', { project: captured.projectId, scene: relative(captured.sceneRelativePath), sourceText: captured.source, settings: effective, linearTimeline: true });
        if (!job?.id) throw Error('计时服务未返回任务 ID');
        entry.job = job.id;
        // The last consumer can abort while the verified snapshot/job is still being created.
        if (entry.cancelled) { await cancelJob(entry); throw Error('操作已取消'); }
        for (let i = 0; i < 3600; i++) {
          await ensure();
          const data = await bridge.service('/api/timing/' + encodeURIComponent(job.id));
          await ensure();
          entry.progress = { ...data.job, message: data.job?.message || data.job?.phase || '正在分析故事', progress: Number(data.job?.progress) || 0, elapsed: (Date.now() - entry.started) / 1000 };
          progress = entry.progress;
          for (const user of entry.users) { try { user.onProgress?.(clone(entry.progress)); } catch {} }
          emit();
          if (data.job?.state === 'completed') {
            if (data.sourceHash !== sourceHash) throw Error('计时结果与当前未保存剧本不一致');
            if (dependencyHash && await dependency() !== dependencyHash) throw Error('其他场景或计时依赖已变化');
            const cfg = await bridge.service('/api/config');
            if (!equal({ ...cfg.settings, ...values, mode: 'auto', bgmBaseMode: 'auto' }, effective)) throw Error('计时设置已变化，请重新测量');
            await ensure();
            const seconds = number(data.timing?.storyTimeline?.durationSeconds ?? data.timing?.durationSeconds, 0, 86400, '故事实测时长');
            if (!data.timing?.storyTimeline?.scenes?.length) throw Error('服务没有返回实际多场景时间线');
            const scene = data.timing.storyTimeline.scenes.find(item => item.scene === captured.sceneRelativePath);
            if (!scene || scene.hash !== sourceHash) throw Error('实际时间线中的当前场景与剧本不一致');
            const result = { seconds, timing: data.timing, settings: clone(values), effectiveSettings: clone(effective), sourceHash, dependencyHash, snapshot: clone(captured) };
            return result;
          }
          if (['failed', 'needs_attention', 'canceled', 'cancelled'].includes(data.job?.state)) throw Error(data.job.message || '实际时间计算失败');
          await new Promise(resolve => { entry.wake = resolve; setTimeout(resolve, entry.pollInterval); });
          entry.wake = null;
        }
        throw Error('实际时间计算超时');
      } catch (error) {
        await cancelJob(entry);
        throw error;
      } finally {
        entry.done = true;
        if (running.get(entry.key) === entry) running.delete(entry.key);
      }
    }
    function consume(entry, options) {
      return new Promise((resolve, reject) => {
        let finished = false;
        const finish = (error, result) => {
          if (finished) return;
          finished = true;
          options.signal?.removeEventListener('abort', user.cancel);
          entry.users.delete(user);
          if (!entry.done && entry.users.size === 0) cancelEntry(entry);
          if (error) reject(error); else resolve(clone(result));
        };
        const user = { onProgress: options.onProgress, cancel: () => finish(Error('操作已取消')) };
        entry.users.add(user);
        options.signal?.addEventListener('abort', user.cancel, { once: true });
        if (options.signal?.aborted || entry.cancelled) { user.cancel(); return; }
        try { options.onProgress?.(clone(entry.progress)); } catch {}
        if (!entry.promise) {
          entry.promise = runTiming(entry);
          entry.promise.catch(() => {});
        }
        entry.promise.then(result => finish(null, result), error => finish(error));
      });
    }
    function abortable(promise, signal) {
      if (!signal) return promise;
      return new Promise((resolve, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(Error('操作已取消')); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { abort(); return; }
        promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
      });
    }
    async function measureAt(captured, values, options, ticket, expected = values, publishResult = true) {
      await capability('timing'); await check(captured, ticket, options.signal);
      const preparationKey = JSON.stringify([identity(captured), values, ticket]);
      let preparation = preparations.get(preparationKey);
      if (!preparation) {
        preparation = Promise.all([sha(captured.source), dependency(), bridge.service('/api/config')]);
        preparations.set(preparationKey, preparation);
        preparation.finally(() => { if (preparations.get(preparationKey) === preparation) preparations.delete(preparationKey); }).catch(() => {});
      }
      const [sourceHash, dependencyHash, cfg] = await abortable(preparation, options.signal);
      await check(captured, ticket, options.signal);
      const effective = { ...cfg.settings, ...values, mode: 'auto', bgmBaseMode: 'auto' };
      const key = JSON.stringify([identity(captured), effective, dependencyHash]);
      let entry = running.get(key), result;
      if (!entry || entry.cancelled) {
        if (!options.force && validKnownTiming(captured) && timing.key === key) result = clone(timing.result);
        else {
          entry = { key, captured, values, effective, sourceHash, dependencyHash, ticket, job: null, users: new Set(), done: false, cancelled: false,
            started: Date.now(), pollInterval: options.pollInterval ?? 500, progress: { message: '准备计算故事时间', progress: 0, elapsed: 0 } };
          running.set(key, entry);
        }
      }
      if (!result) result = await consume(entry, options);
      await check(captured, ticket, options.signal);
      if (!equal(await settings(), expected)) throw Error('预览速度已变化，请重新测量');
      await check(captured, ticket, options.signal);
      if (publishResult) publish(result);
      return result;
    }
    async function freshTiming() {
      if (!timing) throw Error('请先测量实际时间');
      const result = clone(timing.result), ticket = serial;
      await check(result.snapshot, ticket);
      if (!equal(await settings(), result.settings)) throw Error('预览速度已变化，请重新测量');
      if (!result.dependencyHash || await dependency() !== result.dependencyHash) throw Error('无法确认其他场景依赖仍有效，请重新测量');
      const cfg = await bridge.service('/api/config');
      if (!equal({ ...cfg.settings, ...result.settings, mode: 'auto', bgmBaseMode: 'auto' }, result.effectiveSettings)) { timing = null; emit(); throw Error('计时设置已变化，请重新测量'); }
      await check(result.snapshot, ticket);
      return result;
    }
    async function assertMusicScope() {
      const current = await snapshot();
      if (!loaded || current.projectId !== musicScope || current.projectPath !== musicProjectPath) throw Error('请先读取当前工程的音乐配置');
    }
    const api = {
      state,
      subscribe(listener) { if (typeof listener !== 'function') throw Error('监听器无效'); listeners.add(listener); return () => listeners.delete(listener); },
      peekTiming(captured) { return validKnownTiming(captured) ? clone(timing.result) : null; },
      discardMusic() { if (busy) throw Error('已有媒体操作进行中'); music = clone(baselineMusic); baselineDirty = false; emit(); return clone(music); },
      async loadMusic(options = {}) {
        await capability('projectFiles'); const captured = await snapshot();
        const sameProject = loaded && captured.projectId === musicScope && captured.projectPath === musicProjectPath;
        if (sameProject && !options.reload) return clone(music);
        if (sameProject && dirty() && !options.discardDirty) throw Error('音乐配置尚未保存，请先保存或放弃修改');
        if (loaded && !sameProject) musicProjects.set(JSON.stringify([musicScope, musicProjectPath]), { music, baselineMusic, baselineDirty, baseText });
        const retained = !sameProject && !options.reload && musicProjects.get(projectKey(captured));
        if (retained) {
          ({ music, baselineMusic, baselineDirty, baseText } = retained);
          loaded = true; musicScope = captured.projectId; musicProjectPath = captured.projectPath; emit(); return clone(music);
        }
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
        await check(captured, ticket); music = next; baselineMusic = clone(next); baselineDirty = value.schemaVersion === 1; baseText = text; loaded = true; musicScope = captured.projectId; musicProjectPath = captured.projectPath; emit();
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
        // Once CAS succeeds, remember the new baseline even if the user switches project
        // before the final UI guard. Otherwise returning would retain a stale expectedText.
        const saved = { music: clone(next), baselineMusic: clone(next), baselineDirty: false, baseText: text };
        musicProjects.set(projectKey(captured), saved);
        if (musicScope === captured.projectId && musicProjectPath === captured.projectPath) {
          ({ music, baselineMusic, baselineDirty, baseText } = saved); emit();
        }
        await check(captured, ticket); return clone(next);
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
        await check(captured, ticket); return changedMusic(next);
      },
      async moveTrack(id, lane, start) { await assertMusicScope(); const next = clone(music), track = next.tracks.find(t => t.id === id); if (!track) throw Error('音乐不存在'); integer(lane, 0, next.players - 1, '播放器'); track.startSeconds = availableStart(next.tracks, lane, start, track.durationSeconds, id); track.lane = lane; return changedMusic(next); },
      async updateTrack(id, patch) { await assertMusicScope(); if (Object.keys(patch).some(k => !['volume', 'enabled'].includes(k))) throw Error('仅可更新音量和启用状态'); const next = clone(music), track = next.tracks.find(t => t.id === id); if (!track) throw Error('音乐不存在'); Object.assign(track, patch); return changedMusic(next); },
      async removeTrack(id) { await assertMusicScope(); return changedMusic({ ...music, tracks: music.tracks.filter(t => t.id !== id) }); },
      async addPlayer() { await assertMusicScope(); return changedMusic({ ...music, players: music.players + 1 }); },
      async removePlayer(lane) { await assertMusicScope(); integer(lane, 0, music.players - 1, '播放器'); return changedMusic({ ...music, players: music.players - 1, tracks: music.tracks.filter(t => t.lane !== lane).map(t => ({ ...t, lane: t.lane > lane ? t.lane - 1 : t.lane })) }); },
      async measure(options = {}) {
        const ticket = serial; measuring++; emit();
        try { return await measureAt(await snapshot(), await settings(), options, ticket); }
        finally { measuring--; if (!measuring) progress = null; emit(); }
      },
      getTiming: freshTiming,
      readSpeeds: settings,
      async writeSpeeds(values) {
        if (!values || !Object.keys(values).length || Object.keys(values).some(k => !['textSpeed', 'autoSpeed'].includes(k))) throw Error('预览速度字段无效');
        for (const [key, value] of Object.entries(values)) number(value, -100, 100, key);
        const captured = await snapshot(), ticket = serial, original = await settings();
        await check(captured, ticket);
        await bridge.writePreviewSettings(values, { expected: original, projectId: captured.projectId });
        timing = null; knownDependency = null; cancelTiming(); emit(); return settings();
      },
      invalidateTiming() { timing = null; knownDependency = null; cancelTiming(); emit(); },
      async cancel() { cancelTiming(); await Promise.all([...running.values()].map(cancelJob)); emit(); },
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
        return { schemaVersion: 1, projectId: captured.projectId, path: captured.path, revision: captured.revision, source: captured.source, mode: sorted.length === 1 ? 'range' : 'set', sourceHash: measured.sourceHash, ranges: selected };
      },
      async resolveSubtitle(anchor, bounds) { const measured = anchor?.type === 'timeline' ? await freshTiming() : null; if (anchor?.type === 'music') await assertMusicScope(); return resolveSubtitleAnchor(anchor, measured?.timing, bounds, music); },
      async fitToMusic(options = {}) {
        await assertMusicScope();
        const keys = ['textSpeed', 'autoSpeed'].filter(k => options[k] !== false);
        if (!keys.length) throw Error('请选择至少一种速度');
        const target = Math.max(0, ...music.tracks.filter(t => t.enabled !== false).map(t => t.startSeconds + t.durationSeconds));
        if (!target) throw Error('没有可匹配的音乐');
        const captured = await snapshot(), original = await settings(), ticket = serial;
        const base = await measureAt(captured, original, options, ticket), tolerance = Math.min(2, Math.max(.5, target * .003));
        const lowLimit = Math.min(...keys.map(k => -100 - original[k])), highLimit = Math.max(...keys.map(k => 100 - original[k]));
        const at = delta => ({ ...original, ...Object.fromEntries(keys.map(k => [k, Math.round(Math.max(-100, Math.min(100, original[k] + delta)) * 1000) / 1000])) });
        const textTime = (n, speed) => (n * (3 + (100 - speed) * 1.5) + 200 + (100 - speed) * 15) / 1000;
        const autoTime = speed => (250 + (100 - speed) * 15) / 1000;
        const scenes = base.timing.storyTimeline.scenes, currentScene = scenes.find(scene => scene.scene === captured.sceneRelativePath);
        const times = base.timing.lineTimes || currentScene?.lineTimes || [], nextTimes = [], dialogues = [];
        let nextTime = (currentScene?.endSeconds ?? base.seconds) * 1000;
        for (let i = times.length; i >= 0; i--) { if (Number.isFinite(times[i])) nextTime = times[i]; nextTimes[i] = nextTime; }
        // Use Craft's pinned upstream parser, including multiline statements and command arguments.
        if (!root.WebVideoCraftScript?.parse) throw Error('Craft 官方剧本解析器尚未加载');
        const model = root.WebVideoCraftScript.parse(captured.source, { path: captured.path, capabilities: captured.runtimeCapabilities || {} });
        for (const row of model.statements) {
          if (row.command !== 'say' || row.args.next || row.args.notend) continue;
          const start = times.slice(row.startLine - 1, row.endLine).find(Number.isFinite);
          if (start === undefined) continue;
          const end = nextTimes[row.endLine] ?? base.seconds * 1000;
          const n = [...row.content.replace(/\{[^}]*\}/g, '').replace(/\|/g, '')].length;
          const old = textTime(n, base.settings.textSpeed), observed = Math.max(0, (end - start) / 1000 - autoTime(base.settings.autoSpeed));
          dialogues.push({ n, old, floor: observed > old + .15 ? observed : 0 });
        }
        const waits = base.timing.elasticWindows?.length ?? dialogues.length;
        const predict = values => Math.max(0, base.seconds + dialogues.reduce((sum, d) => sum + Math.max(d.floor, textTime(d.n, values.textSpeed)) - Math.max(d.floor, d.old), 0) + waits * (autoTime(values.autoSpeed) - autoTime(base.settings.autoSpeed)));
        function estimate(bias = 0, low = lowLimit, high = highLimit) {
          for (let i = 0; i < 40; i++) { const middle = (low + high) / 2; if (predict(at(middle)) + bias > target) low = middle; else high = middle; }
          return (low + high) / 2;
        }
        const multiScene = scenes.length > 1;
        const budget = Math.max(2, 102 - original.textSpeed) + Math.max(16.667, 116.667 - original.autoSpeed);
        let candidate = multiScene ? Math.max(lowLimit, Math.min(highLimit, (1 - target / Math.max(base.seconds, .001)) * budget / keys.length)) : estimate();
        let best = base, low = lowLimit, high = highLimit;
        const samples = [{ delta: 0, result: base }], cache = new Map([[JSON.stringify(original), base]]);
        for (let i = 0; i < 2 && Math.abs(best.seconds - target) > tolerance; i++) {
          await check(captured, ticket, options.signal);
          const values = at(candidate), key = JSON.stringify(values);
          options.onProgress?.({ message: `精确匹配：第 ${i + 1} / 2 次校准`, progress: i / 2 });
          let result = cache.get(key);
          if (!result) { result = await measureAt(captured, values, { ...options, force: true }, ticket, original, false); cache.set(key, result); }
          if (!samples.some(sample => Math.abs(sample.delta - candidate) < .0001 && sample.result === result)) samples.push({ delta: candidate, result });
          if (Math.abs(result.seconds - target) < Math.abs(best.seconds - target)) best = result;
          if (Math.abs(result.seconds - target) <= tolerance) break;
          if (candidate <= lowLimit + .002 && result.seconds < target - tolerance) throw Error('音乐过长，速度范围内无法匹配');
          if (candidate >= highLimit - .002 && result.seconds > target + tolerance) throw Error('音乐过短，速度范围内无法匹配');
          if (result.seconds > target) low = Math.max(low, candidate); else high = Math.min(high, candidate);
          if (i === 1) break;
          let next = multiScene ? (low + high) / 2 : estimate(result.seconds - predict(values), low, high);
          const anchor = samples.filter(sample => Math.abs(sample.delta - candidate) > .0001 && Math.abs(sample.result.seconds - result.seconds) > .01).sort((a, b) => Math.abs(a.delta - candidate) - Math.abs(b.delta - candidate))[0];
          if (anchor) {
            const linear = anchor.delta + (target - anchor.result.seconds) * (candidate - anchor.delta) / (result.seconds - anchor.result.seconds);
            if (Number.isFinite(linear)) next = linear;
          }
          next = Math.max(low, Math.min(high, next));
          if (cache.has(JSON.stringify(at(next)))) next = (low + high) / 2;
          candidate = next;
        }
        await check(captured, ticket, options.signal);
        if (!equal(await settings(), original)) throw Error('预览速度已被其他操作改变');
        if (!best.dependencyHash || await dependency() !== best.dependencyHash) throw Error('其他场景或计时依赖已变化');
        const cfg = await bridge.service('/api/config');
        if (!equal({ ...cfg.settings, ...best.settings, mode: 'auto', bgmBaseMode: 'auto' }, best.effectiveSettings)) throw Error('计时设置已变化，请重新测量');
        await check(captured, ticket, options.signal);
        await bridge.writePreviewSettings(Object.fromEntries(keys.map(k => [k, best.settings[k]])), { expected: original, projectId: captured.projectId });
        if (!equal(await settings(), best.settings)) { timing = null; emit(); throw Error('预览速度未应用，请重新测量'); }
        await check(captured, ticket, options.signal);
        publish(best);
        return { ...best, targetSeconds: target, errorSeconds: best.seconds - target, matched: Math.abs(best.seconds - target) <= tolerance, refinementsLimit: 2 };
      }
    };
    for (const name of ['loadMusic', 'saveMusic', 'addTracks', 'moveTrack', 'updateTrack', 'removeTrack', 'addPlayer', 'removePlayer', 'fitToMusic', 'writeSpeeds']) {
      const operation = api[name];
      api[name] = async (...args) => {
        if (busy) throw Error('已有媒体操作进行中');
        busy = true; emit();
        try { return await operation(...args); } finally { busy = false; emit(); }
      };
    }

    return api;
  }
  root.WebVideoCraftMedia = { createController, normalizeMusic, availableStart, resolveSubtitleAnchor };
})(typeof window !== 'undefined' ? window : globalThis);

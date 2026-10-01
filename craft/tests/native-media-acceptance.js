/* Native-only acceptance probe. Load into the existing Craft editor WebView console.
 * Before running, create/open/save an explicitly disposable project and open its real preview.
 * In that disposable project, create game/bgm/acceptance-6s.wav with:
 *   ffmpeg -f lavfi -i sine=frequency=440:duration=6 -c:a pcm_s16le acceptance-6s.wav
 * Place an SRT outside production files, containing a cue at 00:00:00,100 --> 00:00:02,000
 * with text NATIVE_MEDIA_ACCEPTANCE. The disposable scene must execute for > 3 seconds.
 * No scene text, existing assets, preview speeds or external AI endpoints are changed here.
 *
 * Invocation (explicit paths, change them to your disposable fixture):
 * await WebVideoCraftNativeMediaAcceptance.run({disposable:true,
 *   expectedProjectPath:'C:/test/disposable-media', audioFile:'game/bgm/acceptance-6s.wav',
 *   subtitlePath:'C:/test/acceptance.srt', outputDir:'C:/test/output',
 *   onProgress:event=>console.log(JSON.stringify(event))})
 * Save returned JSON as evidence. On failure, inspect .lastReport; no automatic retry.
 * After completed renders, the Windows caller MUST independently inspect actual outputs:
 *   ffprobe -v error -show_streams -show_format -of json <each output path>
 * Expect H.264/video+audio in both, mov_text subtitle only in soft output, duration matching
 * measured story within frame rounding. Render a frame at subtitle cue time from each output
 * and inspect the burn output for visible NATIVE_MEDIA_ACCEPTANCE text. Decode audio and
 * verify non-silent 440 Hz content during the first 6 seconds. A completed job alone does
 * not certify media contents. No ffprobe / pixel / sound success is claimed by this probe.
 */
(function (root) {
  'use strict';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = path => String(path).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const copy = value => JSON.parse(JSON.stringify(value));
  const api = { lastReport: null };
  api.run = async function (options) {
    if (api.running) throw Error('A native media acceptance run is already active');
    if (options?.disposable !== true || !options.expectedProjectPath || !options.audioFile || !options.subtitlePath || !options.outputDir) throw Error('Explicit disposable project, audio, subtitle and output paths are required');
    const bridge = root.WebVideoCraftBridge, media = root.WebVideoCraftMedia;
    if (!bridge || !media) throw Error('Load the real injected Craft bridge/controller first');
    if (!/^game\/bgm\/[\w./-]+\.wav$/i.test(options.audioFile) || options.audioFile.split('/').includes('..')) throw Error('Use the existing disposable project WAV asset, not an arbitrary external path');
    const captured = await bridge.snapshot();
    if (norm(captured.projectPath) !== norm(options.expectedProjectPath)) throw Error('Active project does not match the explicitly disposable project');
    const caps = bridge.capabilities();
    for (const name of ['projectFiles', 'music', 'timing', 'previewSettings', 'exportVideo', 'service']) if (caps[name] !== true) throw Error('Native capability unavailable: ' + name);
    api.running = true;
    const controller = media.createController(bridge), started = new Date().toISOString(), report = { started, project: { id: captured.projectId, path: captured.projectPath, scene: captured.sceneRelativePath }, steps: [], jobs: [], externalMediaVerification: 'PENDING: real ffprobe, decoded audio and rendered subtitle frame checks required' };
    api.lastReport = report;
    const record = (step, evidence) => { const value = { step, at: new Date().toISOString(), ...evidence }; report.steps.push(value); options.onProgress?.(copy(value)); };
    const sameProject = async () => { const current = await bridge.snapshot(); if (current.projectId !== captured.projectId || norm(current.projectPath) !== norm(captured.projectPath) || current.path !== captured.path || current.source !== captured.source || current.revision !== captured.revision) throw Error('Disposable project/scene changed while acceptance was running'); };
    const terminal = new Set(['completed', 'failed', 'canceled', 'cancelled', 'needs_attention']);
    async function status(id) {
      await sameProject(); const jobs = await bridge.service('/api/jobs');
      if (!Array.isArray(jobs)) throw Error('Unexpected native job list shape');
      const job = jobs.find(value => value.id === id); if (!job) throw Error('Native job disappeared: ' + id); return job;
    }
    async function finish(id) {
      const deadline = Date.now() + (options.timeoutMs || 15 * 60 * 1000); let previous = '';
      while (Date.now() < deadline) {
        const job = await status(id), marker = JSON.stringify([job.state, job.phase, job.progress]);
        if (marker !== previous) { record('job-progress', { id, state: job.state, phase: job.phase, progress: job.progress, message: job.message }); previous = marker; }
        if (terminal.has(job.state)) return job;
        await wait(1000);
      }
      throw Error('Native job timed out; inspect/cancel explicitly: ' + id);
    }
    try {
      const originalText = await bridge.readProjectFile('video-project.json', null);
      if (originalText !== null && options.replaceExistingFixtureMusic !== true) throw Error('Disposable fixture already has music configuration; set replaceExistingFixtureMusic:true only to replace that fixture configuration');
      const audio = await bridge.service('/api/music/duration', { project: captured.projectId, file: options.audioFile });
      if (!Number.isFinite(audio.durationSeconds) || Math.abs(audio.durationSeconds - 6) > .05) throw Error('Native ffprobe duration is not the required six-second WAV');
      record('audio-probe', { actualDurationSeconds: audio.durationSeconds, file: options.audioFile });
      const measured = await controller.measure({ force: true, onProgress: value => options.onProgress?.({ step: 'timing-progress', ...value }) });
      if (!Number.isFinite(measured.seconds) || measured.seconds < 3 || !measured.timing.storyTimeline?.scenes?.length) throw Error('Fixture must have a real measured story longer than three seconds');
      record('actual-timing', { seconds: measured.seconds, sourceHash: measured.sourceHash, dependencyHash: measured.dependencyHash, settings: measured.settings, sceneCount: measured.timing.storyTimeline.scenes.length });
      await controller.loadMusic();
      const config = { schemaVersion: 2, enabled: true, players: 2, tracks: [
        { id: 'native-acceptance-lane0', name: 'six-second WAV', file: options.audioFile, lane: 0, startSeconds: 0, durationSeconds: audio.durationSeconds, volume: 70 },
        { id: 'native-acceptance-lane1', name: 'parallel six-second WAV', file: options.audioFile, lane: 1, startSeconds: 0, durationSeconds: audio.durationSeconds, volume: 20 }
      ] };
      await sameProject(); await controller.saveMusic(config);
      const saved = JSON.parse(await bridge.readProjectFile('video-project.json', null));
      if (saved.schemaVersion !== 2 || saved.tracks.length !== 2 || saved.players !== 2 || saved.tracks.some(track => track.durationSeconds !== audio.durationSeconds || track.offsetSeconds !== 0 || track.loop || !track.fullLength)) throw Error('Saved schema 2 music lost original-length/parallel-lane semantics');
      record('music-save-readback', { saved, originalConfigurationExisted: originalText !== null, backupExpected: true });
      // Saving project music changes the VFS dependency digest; remeasure before anchor/cached checks.
      const refreshed = await controller.measure({ force: true });
      const fresh = await controller.getTiming();
      if (fresh.sourceHash !== refreshed.sourceHash || fresh.seconds !== refreshed.seconds) throw Error('Native cache freshness check returned a different measurement');
      record('timing-cache-validated', { seconds: fresh.seconds, dependencyHash: fresh.dependencyHash });
      const cfg = await bridge.service('/api/config'), prefix = 'native-media-' + Date.now();
      const base = { scene: captured.sceneRelativePath, sourceText: captured.source, outputDir: options.outputDir, storyScope: 'sceneOnly', exportKind: 'full', useMusicTimeline: true, replaceGameBgm: true, settings: { ...cfg.settings, ...fresh.settings, width: 640, height: 360, fps: 24, workers: 1, mode: 'auto', bgmBaseMode: 'auto' } };
      for (const mode of ['soft', 'burn']) {
        await sameProject();
        const request = { ...base, fileName: prefix + '-' + mode + '.mp4', subtitle: { sourcePath: options.subtitlePath, mode, anchor: { type: 'video' } } };
        const queued = await bridge.exportVideo(request); if (!queued?.id) throw Error('Export did not return a native job ID');
        report.jobs.push({ id: queued.id, kind: mode, request: copy(request) }); record('queued', { kind: mode, id: queued.id });
        const completed = await finish(queued.id); Object.assign(report.jobs.at(-1), { terminal: copy(completed) });
        if (completed.state !== 'completed') throw Error(mode + ' export did not complete: ' + completed.state + ' ' + (completed.message || ''));
        record('render-completed', { kind: mode, id: queued.id, output: completed.output || null, mediaVerification: 'pending independent ffprobe/frame/audio checks' });
      }
      await sameProject();
      const queued = await bridge.exportVideo({ ...base, fileName: prefix + '-cancel.mp4' });
      if (!queued?.id) throw Error('Cancel probe did not receive a job ID');
      report.jobs.push({ id: queued.id, kind: 'cancel' });
      await bridge.cancelJob(queued.id);
      const cancelled = await finish(queued.id); Object.assign(report.jobs.at(-1), { terminal: copy(cancelled) });
      if (cancelled.state === 'completed') { report.cancelResult = 'INCONCLUSIVE: rendering finished before cancellation took effect'; record('cancel-race', { id: queued.id, state: cancelled.state }); }
      else if (['canceled', 'cancelled'].includes(cancelled.state)) { report.cancelResult = 'PASS'; record('cancel-terminal', { id: queued.id, state: cancelled.state }); }
      else throw Error('Cancellation did not reach a canceled terminal state: ' + cancelled.state);
      report.controllerResult = report.cancelResult === 'PASS' ? 'PASS' : 'INCONCLUSIVE'; report.finished = new Date().toISOString();
      return copy(report);
    } catch (error) { report.controllerResult = 'FAIL'; report.error = error.message; report.finished = new Date().toISOString(); throw error; }
    finally { api.running = false; }
  };
  root.WebVideoCraftNativeMediaAcceptance = api;
})(globalThis);

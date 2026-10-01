/* Craft import controllers. Plans are previews; only bridge.commit edits the open buffer.
 * Anogo format/compiler adapted from browser/anogo-import-core.js; AI source-range and
 * stage validation reuse browser/novel-core.js. No direct network, disk or credential access. */
(function (root) {
  'use strict';
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k) ? o[k] : undefined;
  const fold = s => String(s ?? '').trim().toLowerCase();
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const error = message => { throw new Error(message); };
  const safeId = value => {
    const s = String(value ?? '').trim();
    if (!/^[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,95}$/u.test(s)) error('角色 ID 无效');
    return s;
  };
  const safePath = value => {
    const s = String(value ?? '');
    if (!s || /[\\\x00-\x1f<>:"|?*%;]/.test(s) || s.includes(' -') || s.startsWith('/') || s.split('/').some(x => !x || x === '.' || x === '..')) error('素材必须是工程内的安全相对路径');
    return s;
  };
  const text = value => {
    const s = String(value ?? '');
    if (s.includes(' -') || /[\\|\x00]/.test(s)) error('文本包含会被解释为 WebGAL 参数或转义的内容，请人工处理');
    return s.replace(/;/g, '\\;').replace(/\r\n|\r|\n/g, '|');
  };
  const speaker = value => {
    const s = String(value ?? '').trim();
    if (!s || /[;:\r\n|\\]/.test(s) || s.includes(' -')) error('角色名无效');
    return s;
  };
  function parseAnogo(input, yaml) {
    if (typeof input !== 'string' || input.length > 4 * 1024 * 1024) error('Anogo 输入必须是最多 4 MB 的文本');
    const value = input.replace(/^\uFEFF/, '').trim().replace(/^```(?:json|yaml|yml)?\s*\n([\s\S]*?)\n```$/i, '$1');
    if (!value) error('请粘贴 Anogo JSON 或 YAML');
    let rows;
    try { rows = JSON.parse(value); }
    catch { if (!yaml?.load || !yaml.JSON_SCHEMA) error('JSON 无效，且安全 YAML 解析器未加载'); rows = yaml.load(value, {schema:yaml.JSON_SCHEMA}); }
    if (!Array.isArray(rows) || !rows.length || rows.length > 10000) error('Anogo 应为 1 到 10000 条语句的数组');
    return rows.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) error(`第 ${index + 1} 条必须是对象`);
      const type = own(row, '背景') !== undefined ? 'background' : own(row, '旁白') !== undefined ? 'narration' : 'dialogue';
      const required = type === 'background' ? ['背景'] : type === 'narration' ? ['旁白'] : ['角色', '对话'];
      const allowed = type === 'dialogue' ? [...required, '动作'] : required;
      if (Object.keys(row).some(k => !allowed.includes(k)) || required.some(k => !['string','number'].includes(typeof own(row,k)) || (typeof row[k] === 'number' && !Number.isFinite(row[k])))) error(`第 ${index + 1} 条字段不符合 Anogo 格式`);
      if (row.动作 != null && !['string','number'].includes(typeof row.动作)) error(`第 ${index + 1} 条动作必须为文字`);
      return {type, ...Object.fromEntries(required.map(k => [k, String(row[k])])), 动作:String(row.动作 ?? '')};
    });
  }
  function assertSame(expected, current) {
    for (const key of ['projectId','projectPath','path','source','revision']) if (expected[key] !== current[key]) error('工程、剧本或未保存内容已变化，请重新预览');
  }
  function create(options) {
    const {bridge, script = root.WebVideoCraftScript, yaml = root.WebVideoYaml || root.jsyaml,
      novel = typeof WebVideoNovel !== 'undefined' ? WebVideoNovel : root.WebVideoNovel,
      sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onState = () => {}} = options;
    if (!bridge?.snapshot || !bridge?.commit || !script?.parse || !script?.append) error('Craft 编辑器桥或源文本解析器不可用');
    const loadCharacters = options.loadCharacters || (() => bridge.service('/api/character-map'));
    const loadActions = options.loadActions || (() => bridge.service('/api/anogo-actions'));
    const readFigure = options.readFigure || (path => bridge.readProjectFile('game/figure/' + safePath(path)));
    let alive = true, busy = false, cancelled = false, job = null, draft = null, phase = 'idle', message = '', progress = null;
    const state = () => ({busy, phase, message, jobId:job, preview:draft ? clone(draft.preview) : null, progress:clone(progress)});
    const emit = () => { try { onState(state()); } catch {} };
    const ensure = () => { if (!alive) error('面板已关闭'); if (cancelled) error('已取消，剧本未改动'); };
    const begin = () => { if (!alive || busy) error('已有操作进行中或面板已关闭'); busy = true; cancelled = false; draft = null; progress = null; emit(); };
    const current = async snapshot => { ensure(); assertSame(snapshot, await bridge.snapshot()); ensure(); };
    const finish = () => { busy = false; emit(); };
    async function stopJob() { if (job) { const id = job; await bridge.service('/api/ai/novel/cancel', {id}); if (job === id) job = null; } }
    function append(snapshot, lines, label, details) {
      const eol = snapshot.source.includes('\r\n') ? '\r\n' : '\n';
      const code = lines.map(s => s.replace(/[\r\n]+$/, '')).join(eol) + eol;
      const base = snapshot.source.length + (snapshot.source && !/[\r\n]$/.test(snapshot.source) ? eol.length : 0);
      let offset = base; const reviewOffsets = [];
      for (let i = 0; i < lines.length; i++) { if (details.reviewLines?.includes(i)) reviewOffsets.push(offset); offset += lines[i].replace(/[\r\n]+$/, '').length + eol.length; }
      const plan = script.append(snapshot, code, label, {...details, reviewOffsets, capabilities:snapshot.runtimeCapabilities});
      if (!plan || typeof plan.after !== 'string' || !plan.after.startsWith(snapshot.source)) error('追加计划未保留原始文本');
      script.parse(plan.after, {path:snapshot.path, capabilities:snapshot.runtimeCapabilities});
      return plan;
    }
    function dialogueLine(line, snapshot) {
      const rows = script.parse(line, {path:snapshot.path,capabilities:snapshot.runtimeCapabilities}).statements || [];
      if (rows.length !== 1 || rows[0].command !== 'say' || Object.keys(rows[0].args || {}).some(k => !['speaker','id','figureId'].includes(k))) error('对白被解释为命令或参数，已拒绝导入');
      return line;
    }
    async function previewAnogo(input, {useActions = false} = {}) {
      begin(); phase = 'compiling'; message = '正在编译 Anogo'; emit();
      try {
        const snapshot = clone(await bridge.snapshot()), rows = parseAnogo(input, yaml);
        const characters = await loadCharacters();
        if (!characters || characters.fatal || !characters.nameToId) error('角色映射不可用，请先修复配置');
        const actions = useActions ? await loadActions() : null;
        if (actions?.fatal) error('动作映射不可用，请先修复配置');
        const model = script.parse(snapshot.source, {path:snapshot.path, capabilities:snapshot.runtimeCapabilities});
        const templates = new Map(), catalogs = new Map(), warnings = [], lines = [], reviewLines = [];
        for (const row of model.statements || []) if (row.command === 'changeFigure' && row.content && row.content !== 'none' && row.args?.id && row.args.clear !== true) templates.set(fold(row.args.id), row);
        async function catalog(row) {
          if (catalogs.has(row.content)) return catalogs.get(row.content);
          let result = {motions:[], expressions:[]};
          if (/\.jsonl?$/i.test(row.content)) {
            try {
              const raw = await readFigure(safePath(row.content));
              if (typeof raw !== 'string' || raw.length > 4 * 1024 * 1024) error('模型元数据过大或不可读');
              let value;
              try { value = JSON.parse(raw); }
              catch { for (const line of raw.split(/\r?\n/)) { try { const x = JSON.parse(line); if (x.motions || x.expressions || x.FileReferences) {value = x; break;} } catch {} } }
              if (value) result = {motions:Object.keys(value.motions || value.FileReferences?.Motions || {}), expressions:(value.expressions || value.FileReferences?.Expressions || []).map(x => x.name || x.Name).filter(x => typeof x === 'string')};
            } catch { warnings.push('无法读取立绘动作目录：' + row.content); }
          }
          catalogs.set(row.content, result); return result;
        }
        const pick = (items, key) => key ? items.find(x => fold(x) === fold(key)) || [...items].sort().find(x => fold(x).includes(fold(key))) : null;
        const add = (line, pending) => { if (pending) reviewLines.push(lines.length); lines.push(line); };
        for (let i = 0; i < rows.length; i++) {
          ensure(); const row = rows[i];
          if (row.type === 'background') { add('changeBg:' + safePath(row.背景) + ' -next;', !useActions); continue; }
          if (row.type === 'narration') { add(dialogueLine(':' + text(row.旁白) + ';', snapshot), !useActions); continue; }
          const name = speaker(row.角色), rawId = own(characters.nameToId, fold(name)), id = rawId ? safeId(rawId) : '', action = row.动作.trim();
          let pending = !useActions || !action || !id;
          if (!id) warnings.push(`第 ${i + 1} 条：角色“${name}”未匹配到 ID，保留对话供核对`);
          if (useActions && action) {
            const mapping = own(actions?.lookup, fold(id + '/' + action)) || own(actions?.lookup, fold(action));
            const template = id && templates.get(fold(id));
            if (mapping && template) {
              const available = await catalog(template);
              const motion = pick(available.motions, String(mapping.motion || '').replaceAll('{name}', id));
              const expression = pick(available.expressions, String(mapping.expression || '').replaceAll('{name}', id));
              for (const value of [motion, expression]) if (value && (/[\r\n;|\\]/.test(value) || value.includes(' -'))) error('动作名称不能安全写入');
              if (motion || expression) add(script.write(template, {args:{id, next:true, motion:motion || false, expression:expression || false}}).replace(/[\r\n]+$/, ''), true);
              if (!motion || !expression) { pending = true; warnings.push(`第 ${i + 1} 条：动作或表情未完整匹配`); }
            } else { pending = true; warnings.push(`第 ${i + 1} 条：没有动作映射或已有立绘模板`); }
          }
          add(dialogueLine(name + ':' + text(row.对话) + (id ? ' -id -figureId=' + id : '') + ';', snapshot), pending);
        }
        const plan = append(snapshot, lines, '导入 Anogo 故事', {warnings, reviewLines});
        await current(snapshot);
        const preview = {kind:'anogo', rows, text:lines.join('\n'), statementCount:lines.length, reviewCount:reviewLines.length, warnings, useActions};
        draft = {snapshot, plan, preview}; phase = 'preview'; message = '编译完成，尚未写入'; return clone(preview);
      } catch (e) { phase = cancelled ? 'cancelled' : 'failed'; message = e.message; throw e; } finally { finish(); }
    }
    function novelLines(snapshot, prepared, output, allowTwo) {
      const result = novel.resolve(prepared, output), stage = output.staging;
      // The existing backend runs source segmentation and basic staging as two separate phases.
      if (!stage || !stage.assets || !Array.isArray(stage.assets.actors) || !Array.isArray(stage.assets.backgrounds)) error('缺少第二阶段基础舞台结果');
      if (stage.maxActors !== (allowTwo ? 2 : 1)) error('舞台人数与用户选项不一致');
      novel.validateStage(stage, result.rows.length);
      const actors = new Map(stage.assets.actors.map(a => [a.key, a])), changes = new Map(stage.changes.map(c => [c.at, c]));
      const lines = [], positions = ['center','left','right','left13','right13','left14','right14'];
      const model = script.parse(snapshot.source, {path:snapshot.path,capabilities:snapshot.runtimeCapabilities});
      const features = options.authoring || root.WebVideoCraftFeatures;
      if (!features?.stageScan) error('舞台状态扫描核心尚未加载');
      const oldStage = features.stageScan(model).stage;
      for (const value of oldStage) lines.push('changeFigure:none' + (value.explicit ? ' -id=' + safeId(value.id) : '') + ' -' + value.pos + ' -next;');
      let cast = new Map();
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i], change = changes.get(i);
        if (change) {
          if (change.background !== null) lines.push('changeBg:' + safePath(change.background) + ' -next;');
          const desired = new Map();
          for (let n = 0; n < change.cast.length; n++) {
            const item = change.cast[n], actor = actors.get(item.actor), id = safeId(actor.id);
            if (desired.has(id)) error('舞台结果包含重复角色 ID');
            desired.set(id, {...actor,id,file:safePath(item.figure),pos:change.cast.length === 1 ? 'center' : n === 0 ? 'left' : 'right'});
          }
          for (const [id, value] of cast) if (!desired.has(id) || desired.get(id).file !== value.file || desired.get(id).pos !== value.pos) lines.push('changeFigure:none -id=' + id + ' -' + value.pos + ' -next;');
          for (const [id, value] of desired) if (!cast.has(id) || cast.get(id).file !== value.file || cast.get(id).pos !== value.pos) lines.push('changeFigure:' + value.file + ' -id=' + id + ' -' + value.pos + ' -next;');
          cast = desired;
        }
        const name = row.kind === 'dialogue' && row.speaker ? speaker(row.speaker) : '';
        const actor = name && [...cast.values()].find(a => a.name === name || (a.aliases || []).some(x => fold(x) === fold(name)));
        const content = text(row.kind === 'dialogue' ? row.text.replace(/^[“「『"]|[”」』"]$/g,'') : row.text);
        if (content.trim()) lines.push(dialogueLine((name || '') + ':' + content + (actor ? ' -id -figureId=' + actor.id : '') + ';', snapshot));
      }
      return {lines,result:{...result,staging:stage}};
    }
    async function generateNovel(source, {allowTwo = false, confirmed = false} = {}) {
      if (!confirmed) error('请明确确认将原文和相关素材信息发送给已配置的 AI 提供商，可能产生费用');
      if (!novel?.prepare || !novel?.resolve || !novel?.validateStage) error('小说原文校验核心尚未加载');
      begin(); phase = 'preparing'; message = '正在准备原文'; emit();
      try {
        const snapshot = clone(await bridge.snapshot());
        const config = await bridge.service('/api/ai/config'); ensure();
        const selected = config?.selected, active = own(config?.profiles, selected);
        if (!selected || !active?.hasKey || !active?.model) error('请先明确配置 AI 提供商、Key 和模型');
        const mapping = await loadCharacters(); if (!mapping || mapping.fatal) error('角色映射不可用');
        const prepared = novel.prepare(source, mapping); await current(snapshot);
        const task = await bridge.service('/api/ai/novel/start', {...prepared, allowTwo});
        if (!task?.id || typeof task.id !== 'string') error('AI 服务未返回任务 ID');
        job = task.id;
        if (!alive || cancelled) { await stopJob(); ensure(); }
        phase = 'generating'; message = '正文与角色识别'; emit();
        while (alive && !cancelled) {
          await sleep(options.pollInterval ?? 1500); await current(snapshot);
          const status = await bridge.service('/api/ai/novel/status', {id:job}); ensure();
          if (status.state === 'running') { message = status.phase || '正在生成'; progress = {completedBatches:status.completedBatches || 0,totalBatches:status.totalBatches || 0,retrying:!!status.retrying}; emit(); continue; }
          if (status.state === 'cancelled') { cancelled = true; error('已取消，剧本未改动'); }
          if (status.state !== 'complete') error(status.error || 'AI 生成失败');
          const {lines,result} = novelLines(snapshot, prepared, status.result, allowTwo);
          const plan = append(snapshot, lines, 'AI 小说转剧本骨架', {reviewLines:lines.map((_,i) => i)});
          await current(snapshot); job = null;
          const preview = {kind:'novel',text:lines.join('\n'),statementCount:lines.length,reviewCount:lines.length,rows:result.rows,omitted:result.omitted,staging:result.staging,warnings:['AI 生成内容全部需要核对，未自动保存']};
          draft = {snapshot,plan,preview}; phase = 'preview'; message = '两阶段生成完成，尚未写入'; return clone(preview);
        }
        ensure();
      } catch (e) { try { await stopJob(); } catch {} phase = cancelled || !alive ? 'cancelled' : 'failed'; message = e.message; throw e; } finally { finish(); }
    }
    async function apply() {
      if (busy || !draft || !alive) error('请先生成可应用的预览');
      busy = true; emit();
      try {
        await current(draft.snapshot); const applied = draft;
        const result = await bridge.commit({snapshot:clone(applied.snapshot),after:applied.plan.after,label:applied.plan.label});
        draft = null; phase = 'applied'; message = '已追加到当前编辑缓冲区，可撤销；尚未自动保存';
        if (options.onApplied) {
          try { const afterSnapshot = await bridge.snapshot(); if (afterSnapshot.path !== applied.snapshot.path || afterSnapshot.projectId !== applied.snapshot.projectId || afterSnapshot.source !== applied.plan.after) error('提交后剧本已变化，请重新标记'); await options.onApplied({plan:clone(applied.plan),snapshot:clone(afterSnapshot),result:clone(result)}); }
          catch (e) { phase = 'applied-review-failed'; message = '剧本已提交，可撤销；生成内容的待核对标记保存失败：' + e.message; return {...result,reviewError:e.message,warning:message}; }
        }
        return result;
      }
      catch (e) { phase = 'failed'; message = e.message; throw e; } finally { finish(); }
    }
    async function configureProvider(settings, {confirmed = false} = {}) {
      if (!confirmed) error('保存提供商配置需要明确确认');
      if (busy || !alive) error('请等待当前操作结束');
      if (!settings || !settings.provider || !settings.model) error('请选择提供商和模型');
      const request = {};
      for (const key of ['provider','key','baseURL','api','model','autoRouting','sessionId']) if (own(settings,key) !== undefined) request[key] = settings[key];
      // Pass explicitly entered settings only. Never retain the supplied key in state or logs.
      busy = true; emit();
      try { return await bridge.service('/api/ai/save', request); } finally { finish(); }
    }
    async function cancel() { cancelled = true; draft = null; phase = 'cancelled'; message = '已取消，剧本未改动'; emit(); await stopJob(); }
    async function dispose() { alive = false; cancelled = true; draft = null; await stopJob(); }
    return Object.freeze({state,previewAnogo,generateNovel,configureProvider,apply,cancel,dispose});
  }
  const api = {create,parseAnogo}; root.WebVideoCraftImports = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

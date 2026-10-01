/* Craft-only authoring plans. Applying a plan is a single native bridge transaction. */
(function (root) {
  "use strict";
  const S = () => root.WebVideoCraftScript,
    own = (v, k) => Object.prototype.hasOwnProperty.call(v || {}, k),
    clone = (x) => JSON.parse(JSON.stringify(x)),
    P = ["center", "left", "right", "left13", "right13", "left14", "right14"];
  const scalar = (v) =>
      typeof v === "string" || typeof v === "number" ? String(v) : "",
    position = (row) => P.find((p) => row.args[p] === true) || "center",
    isModel = (value) => S().figureKind(value) !== "texture";
  const ASSOCIATED = [
    "animationFlag",
    "mouthOpen",
    "mouthHalfOpen",
    "mouthClose",
    "eyesOpen",
    "eyesClose",
  ];
  function model(snapshot) {
    const result = S().parse(snapshot.source, {
      path: snapshot.path,
      capabilities: snapshot.runtimeCapabilities || snapshot.capabilities,
    });
    S().assertSupported(result);
    return result;
  }
  function patch(row, after) {
    return {
      startOffset: row.startOffset,
      endOffset: row.endOffset,
      before: row.source,
      after,
      line: row.startLine,
    };
  }
  function finalize(snapshot, patches, label, details = {}) {
    return S().plan(snapshot, patches, label, {
      ...details,
      capabilities: snapshot.runtimeCapabilities || snapshot.capabilities,
    });
  }
  function selection(m, ids) {
    return new Set(
      (ids ? S().selectedRows(m, ids) : m.statements).map((r) => r.id),
    );
  }
  function nativeFor(m) {
    return {
      write: (row, changes) =>
        S()
          .write(row, changes)
          .replace(/\r?\n$/, ""),
      parse: (source) => ({
        sentenceList: S()
          .parse(source, { path: m.path, capabilities: m.capabilities })
          .statements.map((r) => ({
            ...r.parsed,
            startLine: r.startLine - 1,
            endLine: r.endLine - 1,
          })),
      }),
    };
  }
  function idCompletion(snapshot, options = {}, mapping) {
    for (const id of Object.values(mapping?.nameToId || {})) S().safeId(id);
    const m = model(snapshot);
    const result = root.WebVideoCraftIdCompletion.plan(
      m,
      options,
      mapping,
      nativeFor(m),
    );
    return finalize(snapshot, result.patches, "一键 ID 补全", {
      warnings: result.warnings,
      stats: result.stats,
    });
  }
  function stageScan(m) {
    const states = new Map(),
      byPosition = new Map(),
      result = [],
      warnings = [];
    let speaker = "",
      previous = null;
    for (const row of m.statements) {
      const a = row.args,
        flags = P.filter((p) => a[p] === true),
        explicit = scalar(a.id),
        pos = flags[0] || "center";
      if (flags.length > 1) {
        warnings.push("第 " + row.startLine + " 行有冲突的位置参数");
        continue;
      }
      const diffTarget = states.get(explicit || "fig-" + pos),
        diffModel =
          row.command === "changeFigureDiff" &&
          (isModel(row.content) || isModel(diffTarget?.file));
      if (diffModel) {
        warnings.push("第 " + row.startLine + " 行模型差分被引擎跳过");
        continue;
      }
      const diffFallback =
        row.command === "changeFigureDiff" &&
        (!diffTarget || !row.content || row.content === "none");
      if (row.command === "changeFigure" || diffFallback) {
        const key = explicit || "fig-" + pos,
          gone = !row.content || row.content === "none" || a.clear === true;
        if (gone) {
          if (explicit) states.delete(key);
          else
            for (const [id, v] of states) if (v.pos === pos) states.delete(id);
          byPosition.delete(pos);
        } else {
          const template = diffFallback
            ? {
                ...row,
                command: "changeFigure",
                commandRaw: "changeFigure",
                source: row.source.replace(
                  /changeFigureDiff(?=\s*:)/,
                  "changeFigure",
                ),
              }
            : row;
          const value = {
            id: key,
            explicit: !!explicit,
            pos,
            row,
            file: row.content,
            template,
          };
          states.set(key, value);
          byPosition.set(pos, value);
        }
      } else if (row.command === "changeFigureDiff") {
        const value = diffTarget,
          base = value.template || value.row,
          changes = {};
        // The engine replaces this whole associated-image group; unrelated base state survives.
        for (const key of ASSOCIATED)
          changes[key] = own(a, key) ? a[key] : false;
        const args = { ...base.args };
        for (const key of ASSOCIATED) {
          delete args[key];
          if (own(a, key)) args[key] = a[key];
        }
        const text = S().write(base, { content: row.content, args: changes });
        value.template = { ...base, args, content: row.content, source: text };
        value.file = row.content;
        value.diff = row;
      } else if (row.command === "say") {
        if (own(a, "speaker")) speaker = String(a.speaker ?? "");
        if (row.commandRaw === "" || a.clear === true) speaker = "";
        const id = scalar(a.figureId),
          dialoguePos = P.filter((p) => a[p] === true),
          target = id
            ? states.get(id)
            : dialoguePos.length === 1
              ? byPosition.get(dialoguePos[0])
              : null;
        const live = target && states.get(target.id) === target,
          manual = live
            ? target
            : !id && !dialoguePos.length && states.size === 1
              ? [...states.values()][0]
              : null;
        const narration = !speaker,
          eligible =
            !!speaker && !!live && target.explicit && dialoguePos.length <= 1,
          alreadyPrepared =
            !!manual &&
            previous?.command === "changeFigure" &&
            scalar(previous.args.id) === manual.id &&
            previous.args.next === true;
        result.push({
          row,
          speaker,
          target: manual,
          id: manual?.id || id,
          narration,
          eligible,
          manualEligible: !!manual,
          convertToId: eligible && !id,
          alreadyPrepared,
          reason: eligible
            ? ""
            : !speaker
              ? "旁白，默认不处理"
              : !target
                ? "画外音或无法唯一确定在场立绘"
                : !target.explicit
                  ? "请先完成立绘 ID 补全"
                  : "角色位置不明确",
        });
      }
      if (row.command !== "comment") previous = row;
    }
    return { rows: result, warnings, stage: [...states.values()] };
  }
  function expressionPreparation(snapshot, options = {}) {
    const m = model(snapshot),
      scan = stageScan(m),
      chosen = selection(m, options.selected),
      patches = [],
      warnings = [...scan.warnings];
    let inserted = 0;
    for (const item of scan.rows) {
      if (!chosen.has(item.row.id)) continue;
      if (
        !(item.eligible || (options.allowNonRecommended && item.manualEligible))
      ) {
        warnings.push("第 " + item.row.startLine + " 行：" + item.reason);
        continue;
      }
      if (item.alreadyPrepared && !options.force) continue;
      const template = item.target.template || item.target.row;
      let code =
        S()
          .write(template, { args: { id: item.target.id, next: true } })
          .replace(/^\uFEFF/, "")
          .replace(/[\r\n]+$/, "") + m.eol;
      // A previously merged diff preserves the base entry, never duplicates a target-only diff as an entrance.
      if (item.convertToId) {
        const args = { id: true, figureId: item.target.id };
        for (const p of P) args[p] = false;
        patches.push(patch(item.row, code + S().write(item.row, { args })));
      } else
        patches.push({
          startOffset: item.row.startOffset,
          endOffset: item.row.startOffset,
          before: "",
          after: code,
          line: item.row.startLine,
        });
      inserted++;
    }
    let delta = 0;
    const reviewOffsets = patches.map((p) => {
      const at = p.startOffset + delta;
      delta += p.after.length - (p.endOffset - p.startOffset);
      return at;
    });
    return finalize(snapshot, patches, "预位表情调整", {
      warnings,
      stats: { inserted },
      reviewOffsets,
    });
  }
  const NEXT_COMMANDS = new Set([
    "say",
    "changeBg",
    "changeFigure",
    "changeFigureDiff",
    "video",
    "playEffect",
    "setAnimation",
    "setComplexAnimation",
    "setTransform",
    "setTempAnimation",
    "setTransition",
    "pixi",
    "pixiInit",
    "miniAvatar",
    "setTextbox",
    "filmMode",
  ]);
  function batchNext(snapshot, options = {}) {
    const m = model(snapshot),
      selected = selection(m, options.selected),
      enabled = new Set(
        options.commands || [...NEXT_COMMANDS].filter((x) => x !== "say"),
      ),
      patches = [], hints = new Set(S().hintPairs(m).map(p=>p.choose.id));
    for (const r of m.statements)
      if (
        selected.has(r.id) &&
        NEXT_COMMANDS.has(r.command) &&
        enabled.has(r.command) &&
        r.args.next !== true &&
        !hints.has(r.id)
      )
        patches.push(patch(r, S().write(r, { args: { next: true } })));
    return finalize(snapshot, patches, "批量添加 -next");
  }
  function autoExit(snapshot, options = {}) {
    const m = model(snapshot),
      selected = selection(m, options.selected),
      stage = new Map(),
      patches = [],
      warnings = [];
    let inserted = 0;
    for (const r of m.statements) {
      if (!["changeFigure", "changeFigureDiff"].includes(r.command)) continue;
      const a = r.args,
        flags = P.filter((p) => a[p] === true);
      if (flags.length > 1) {
        warnings.push("第 " + r.startLine + " 行位置不明确，跳过");
        continue;
      }
      const pos = position(r),
        explicit = scalar(a.id),
        key = explicit || "fig-" + pos;
      if (r.command === "changeFigureDiff") {
        const previous = stage.get(key);
        if (isModel(r.content) || isModel(previous?.file)) {
          warnings.push("第 " + r.startLine + " 行模型差分被引擎跳过");
          continue;
        }
        if (previous && r.content && r.content !== "none") {
          previous.file = r.content;
          continue;
        }
      }
      if (!r.content || r.content === "none" || a.clear === true) {
        if (explicit) stage.delete(key);
        else for (const [id, v] of stage) if (v.pos === pos) stage.delete(id);
        continue;
      }
      const old = stage.get(key),
        entered = !old || old.pos !== pos || old.file !== r.content,
        victims = entered
          ? [...stage.values()].filter(
              (v) => v.pos === pos && (v.id !== key || v.file !== r.content),
            )
          : [];
      if (victims.length && selected.has(r.id)) {
        const when = a.when !== undefined ? " -when=" + String(a.when) : "";
        if (/[\r\n;]/.test(when) || / -/.test(when.slice(1)))
          throw Error("条件不能安全复用");
        const lines = victims.map(
          (v) =>
            "changeFigure:none" +
            (v.explicit ? " -id=" + S().safeId(v.id) : "") +
            " -" +
            v.pos +
            " -next" +
            when +
            ";",
        );
        patches.push({
          startOffset: r.startOffset,
          endOffset: r.startOffset,
          before: "",
          after: lines.join(m.eol) + m.eol,
          line: r.startLine,
        });
        inserted += lines.length;
        for (const v of victims) stage.delete(v.id);
      }
      stage.set(key, { id: key, explicit: !!explicit, pos, file: r.content });
    }
    return finalize(snapshot, patches, "自动离场", {
      warnings,
      stats: { inserted },
    });
  }
  const EFFECT_FIELDS = new Set(
    "position.x position.y scale.x scale.y rotation alpha blur brightness contrast saturation gamma colorRed colorGreen colorBlue bloom bloomBrightness bloomBlur bloomThreshold bevel bevelThickness bevelRotation bevelSoftness bevelRed bevelGreen bevelBlue oldFilm dotFilm reflectionFilm glitchFilm rgbFilm godrayFilm shockwaveFilter radiusAlphaFilter".split(
      " ",
    ),
  );
  function sanitizeEffects(value) {
    const effects = Array.isArray(value) ? value : [value];
    if (!effects.length || effects.length > 100)
      throw Error("效果段数量应为 1–100");
    function clean(o, depth = 0, prefix = "") {
      if (!o || typeof o !== "object" || Array.isArray(o) || depth > 3)
        throw Error("效果必须是数值对象");
      const out = {};
      for (const [key, v] of Object.entries(o)) {
        if (
          !/^[A-Za-z][\w]*$/.test(key) ||
          [
            "target",
            "duration",
            "__proto__",
            "constructor",
            "prototype",
          ].includes(key)
        )
          throw Error("效果不能包含目标或命令控制字段");
        const path = prefix ? prefix + "." + key : key;
        if (typeof v === "number" && Number.isFinite(v)) {
          if (!EFFECT_FIELDS.has(path))
            throw Error("不支持的效果数值字段：" + path);
          out[key] = v;
        } else if (v && typeof v === "object")
          out[key] = clean(v, depth + 1, path);
        else throw Error("效果参数必须是有限数值");
      }
      if (!Object.keys(out).length) throw Error("效果对象不能为空");
      return out;
    }
    return effects.map((e) => clean(e));
  }
  function extractEffects(text, capabilities) {
    try {
      return sanitizeEffects(JSON.parse(text));
    } catch (error) {
      if (/^\s*[\[{]/.test(text)) throw error;
    }
    const m = S().parse(text, { capabilities }),
      effects = [];
    S().assertSupported(m);
    for (const r of m.statements) {
      if (r.command === "comment") continue;
      const value = ["setTransform", "setTempAnimation"].includes(r.command)
        ? JSON.parse(r.content)
        : r.args.transform
          ? JSON.parse(r.args.transform)
          : null;
      if (!value) throw Error("只接受变换数值或明确的 transform 参数");
      effects.push(...sanitizeEffects(value));
    }
    return effects;
  }
  function targetOf(r) {
    return r.command === "changeBg"
      ? "bg-main"
      : r.command === "changeFigure"
        ? scalar(r.args.id) || "fig-" + position(r)
        : scalar(r.args.target);
  }
  function batchFilter(snapshot, options = {}) {
    const m = model(snapshot),
      selected = selection(m, options.selected),
      patches = [],
      warnings = [],
      animation = new Set([
        "setTransform",
        "setAnimation",
        "setComplexAnimation",
        "setTempAnimation",
        "setTransition",
      ]);
    let count = 0;
    for (let i = 0; i < m.statements.length; i++) {
      const r = m.statements[i];
      if (
        !selected.has(r.id) ||
        !(
          r.command === "changeBg" ||
          r.command === "changeFigure" ||
          (options.allowAnimations && animation.has(r.command))
        )
      )
        continue;
      if (
        r.command === "changeFigure" &&
        (!r.content || r.content === "none" || r.args.clear === true)
      )
        continue;
      const target = targetOf(r);
      if (!target) {
        warnings.push("第 " + r.startLine + " 行没有明确效果目标");
        continue;
      }
      S().safeId(target);
      const effect = target === "bg-main" ? options.background : options.figure;
      if (!effect?.length) continue;
      const effects = sanitizeEffects(effect);
      if (
        r.args.transform ||
        animation.has(r.command) ||
        (m.statements[i + 1]?.command === "setTransform" &&
          targetOf(m.statements[i + 1]) === target)
      )
        warnings.push("第 " + r.startLine + " 行已有变换，可能重复添加");
      const lines = effects.map(
        (e) =>
          "setTransform:" +
          JSON.stringify(e) +
          " -target=" +
          target +
          " -duration=0 -next;",
      );
      patches.push({
        startOffset: r.endOffset,
        endOffset: r.endOffset,
        before: "",
        after:
          (/[\r\n]$/.test(r.source) ? "" : m.eol) + lines.join(m.eol) + m.eol,
      });
      count += lines.length;
    }
    return finalize(snapshot, patches, "批量添加滤镜", {
      warnings,
      stats: { appended: count },
    });
  }
  function flat(o, prefix = "", out = {}) {
    for (const [k, v] of Object.entries(o || {})) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        throw Error("非法效果字段");
      const p = prefix ? prefix + "." + k : k;
      if (v && typeof v === "object" && !Array.isArray(v)) flat(v, p, out);
      else out[p] = v;
    }
    return out;
  }
  function subset(a, b) {
    const x = flat(a),
      y = flat(b);
    return (
      Object.keys(y).length &&
      Object.entries(y).every(([k, v]) => Object.is(x[k], v))
    );
  }
  function removeFields(a, b) {
    const out = clone(a);
    for (const p of Object.keys(flat(b))) {
      const parts = p.split(".");
      let owner = out;
      for (const key of parts.slice(0, -1)) owner = owner?.[key];
      if (owner) delete owner[parts.at(-1)];
    }
    function trim(o) {
      for (const [k, v] of Object.entries(o))
        if (v && typeof v === "object") {
          trim(v);
          if (!Object.keys(v).length) delete o[k];
        }
    }
    trim(out);
    return out;
  }
  function merge(a, b) {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === "object")
        a[k] = merge(a[k] && typeof a[k] === "object" ? a[k] : {}, v);
      else a[k] = v;
    }
    return a;
  }
  function findFilters(snapshot, library) {
    const m = model(snapshot),
      rows = m.statements.filter((r) => r.command !== "comment"),
      found = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.command !== "setTransform") continue;
      const matches = [];
      for (const preset of library) {
        const effects = sanitizeEffects(preset.effects),
          group = rows.slice(i, i + effects.length);
        if (
          group.length !== effects.length ||
          group.some(
            (x) => x.command !== "setTransform" || targetOf(x) !== targetOf(r),
          )
        )
          continue;
        // Mixing reset-to-default and current-relative transforms is not an equivalent sequence.
        if (
          group.some(
            (x) =>
              String(x.args.transformFrom || "current") !==
              String(r.args.transformFrom || "current"),
          )
        )
          continue;
        if (
          preset.appliesTo &&
          preset.appliesTo !== "both" &&
          preset.appliesTo !==
            (targetOf(r) === "bg-main" ? "background" : "figure")
        )
          continue;
        try {
          if (group.every((x, j) => subset(JSON.parse(x.content), effects[j])))
            matches.push({
              preset,
              group,
              weight: effects.reduce(
                (n, e) => n + Object.keys(flat(e)).length,
                0,
              ),
            });
        } catch {}
      }
      matches.sort(
        (a, b) => b.group.length - a.group.length || b.weight - a.weight,
      );
      if (matches.length) {
        found.push({ row: r, matches });
        i += matches[0].group.length - 1;
      }
    }
    return found;
  }
  function editFilters(snapshot, options = {}) {
    const matches = findFilters(snapshot, options.library || []),
      m = model(snapshot),
      chosen = selection(m, options.selected),
      patches = [],
      used = new Set(),
      replacement =
        options.mode === "replace" ? sanitizeEffects(options.replacement) : [];
    for (const item of matches) {
      if (!chosen.has(item.row.id)) continue;
      const found = options.presetId
        ? item.matches.find((x) => x.preset.id === options.presetId)
        : item.matches[0];
      if (!found) continue;
      for (let i = 0; i < found.group.length; i++) {
        const r = found.group[i];
        if (used.has(r.id)) throw Error("滤镜片段重叠");
        used.add(r.id);
        const remainder = removeFields(
          JSON.parse(r.content),
          found.preset.effects[i],
        );
        let after = options.whole
          ? ""
          : S().write(r, {
              content: JSON.stringify(merge(remainder, replacement[i] || {})),
            });
        if (options.whole && replacement[i])
          after = S().write(r, { content: JSON.stringify(replacement[i]) });
        if (
          i === found.group.length - 1 &&
          replacement.length > found.group.length
        ) {
          if (!after.endsWith(m.eol)) after += m.eol;
          for (const e of replacement.slice(found.group.length))
            after +=
              "setTransform:" +
              JSON.stringify(e) +
              " -target=" +
              S().safeId(targetOf(r)) +
              " -duration=0 -next" +
              (r.args.transformFrom
                ? " -transformFrom=" + r.args.transformFrom
                : "") +
              ";" +
              m.eol;
        }
        patches.push(patch(r, after));
      }
    }
    return finalize(
      snapshot,
      patches,
      options.mode === "replace" ? "替换已有滤镜" : "删除已有滤镜",
      { warnings: options.whole ? ["整句删除会一并移除其他变换字段"] : [] },
    );
  }
  function singleLineHint(snapshot, options = {}) {
    const m = model(snapshot),
      duration = Number(options.duration ?? 1800);
    if (!Number.isFinite(duration) || duration < 100 || duration > 60000)
      throw Error("提示时长须在 100–60000 毫秒之间");
    const text = String(options.text ?? "").trim();
    if (!text || /[\r\n|:]/.test(text))
      throw Error("单行提示不能为空，且不能包含选项分隔符");
    const row = m.statements.find((r) => r.id === options.rowId),
      existing =
        row &&
        S()
          .hintPairs(m)
          .find((p) => p.choose.id === row.id);
    if (existing) {
      return finalize(
        snapshot,
        [
          patch(
            row,
            S().write(row, {
              content: text + ":" + existing.key,
              args: { wvpHint: duration, defaultChoose: 1, next: false },
            }),
          ),
        ],
        "修改单行提示",
      );
    }
    if (row && row.command === "choose") {
      if (!options.confirmConvert)
        throw Error("转换会取消原单选跳转，须明确确认");
      if (/(?<!\\)\|/.test(row.content))
        throw Error("多选分支不能转换为单行提示");
    }
    const suffix =
      options.key ||
      "h" +
        S().fingerprint(
          snapshot.path +
            "\n" +
            snapshot.source +
            "\n" +
            text +
            "\n" +
            (options.at ?? snapshot.source.length),
        );
    if (!/^[A-Za-z0-9_]+$/.test(suffix)) throw Error("提示标签无效");
    const key = "__wvp_hint_" + suffix;
    if (m.statements.some((r) => r.command === "label" && r.content === key))
      throw Error("提示标签已存在，请使用新标识");
    const code =
      "choose:" +
      S().escapeText(text) +
      ":" +
      key +
      " -defaultChoose=1 -wvpHint=" +
      duration +
      ";" +
      m.eol +
      "label:" +
      key +
      ";" +
      m.eol;
    const at = row ? row.startOffset : (options.at ?? snapshot.source.length);
    if (row)
      return finalize(snapshot, [patch(row, code)], "转换为单行提示", {
        warnings: ["已取消原单选跳转"],
        reviewOffsets: [at],
      });
    return finalize(
      snapshot,
      [
        {
          startOffset: at,
          endOffset: at,
          before: "",
          after:
            (at && !/[\r\n]$/.test(snapshot.source.slice(0, at)) ? m.eol : "") +
            code,
        },
      ],
      "新增单行提示",
      { reviewOffsets: [at] },
    );
  }
  function removeHint(snapshot, rowId) {
    const m = model(snapshot),
      pair = S()
        .hintPairs(m)
        .find((p) => p.choose.id === rowId);
    if (!pair?.valid) throw Error("单行提示保护对已损坏");
    return finalize(
      snapshot,
      [patch(pair.choose, ""), patch(pair.label, "")],
      "删除单行提示",
    );
  }
  function relocateHint(snapshot, rowId, options = {}) {
    const m = model(snapshot),
      pair = S()
        .hintPairs(m)
        .find((p) => p.choose.id === rowId);
    if (!pair?.valid) throw Error("请选择完整单行提示");
    let start = pair.choose.startOffset,
      end = pair.label.endOffset,
      code = snapshot.source.slice(start, end);
    if (code.startsWith("\uFEFF")) {
      start++;
      code = code.slice(1);
    }
    const at = Number(options.at);
    if (
      !Number.isInteger(at) ||
      at < 0 ||
      at > snapshot.source.length ||
      (at > start && at < end) ||
      (!options.copy && at >= start && at <= end)
    )
      throw Error("请选择提示范围外的插入位置");
    if (
      at !== snapshot.source.length &&
      !m.rows.some((r) => r.startOffset === at)
    )
      throw Error("只能插入到完整语句之前或场景末尾");
    if (options.copy) {
      const key =
        "__wvp_hint_" +
        (options.key || "h" + S().fingerprint(snapshot.source + "copy" + at));
      if (
        !/^__wvp_hint_[A-Za-z0-9_]+$/.test(key) ||
        m.rows.some((r) => r.command === "label" && r.content === key)
      )
        throw Error("复制提示需要唯一保护标签");
      const choose = S()
        .write(pair.choose, { content: pair.text + ":" + key })
        .replace(/^\uFEFF/, "");
      const label = S().write(pair.label, { content: key });
      const between = snapshot.source.slice(
        pair.choose.endOffset,
        pair.label.startOffset,
      );
      code = choose + between + label;
    }
    const patches = [
      {
        startOffset: at,
        endOffset: at,
        before: "",
        after:
          (at && !/[\r\n]$/.test(snapshot.source.slice(0, at)) ? m.eol : "") +
          code,
      },
    ];
    if (!options.copy)
      patches.push({
        startOffset: start,
        endOffset: end,
        before: snapshot.source.slice(start, end),
        after: "",
      });
    return finalize(
      snapshot,
      patches,
      options.copy ? "复制单行提示" : "移动单行提示",
    );
  }
  function presets(snapshot, options = {}) {
    const m = model(snapshot),
      fragment = S().parse(options.code || "", {
        capabilities: m.capabilities,
      });
    S().assertSupported(fragment);
    const allowed = new Set([
      "setTransform",
      "setTempAnimation",
      "setAnimation",
      "setComplexAnimation",
      "setTransition",
      "pixi",
      "pixiInit",
      "filmMode",
      "setTextbox",
      "miniAvatar",
      "comment",
    ]);
    if (
      !fragment.statements.length ||
      fragment.statements.some((r) => !allowed.has(r.command))
    )
      throw Error("预设只允许演出效果语句");
    const targets = [
      ...new Set(fragment.statements.map(targetOf).filter(Boolean)),
    ];
    if (options.target && targets.length !== 1)
      throw Error("多目标预设保留相互关系，不能统一绑定");
    let code = options.code;
    if (options.target) {
      S().safeId(options.target);
      for (const row of [...fragment.statements].reverse())
        if (targetOf(row))
          code =
            code.slice(0, row.startOffset) +
            S().write(row, { args: { target: options.target } }) +
            code.slice(row.endOffset);
    }
    const at = options.at ?? snapshot.source.length;
    return finalize(
      snapshot,
      [
        {
          startOffset: at,
          endOffset: at,
          before: "",
          after:
            (at && !/[\r\n]$/.test(snapshot.source.slice(0, at)) ? m.eol : "") +
            code.replace(/\r?\n/g, m.eol) +
            (code.endsWith("\n") ? "" : m.eol),
        },
      ],
      "插入演出预设",
      { reviewOffsets: [at] },
    );
  }
  function recognizePresets(snapshot, library) {
    const m = model(snapshot),
      canonical = (o) =>
        JSON.stringify(
          (function sort(v) {
            return Array.isArray(v)
              ? v.map(sort)
              : v && typeof v === "object"
                ? Object.fromEntries(
                    Object.keys(v)
                      .sort()
                      .map((k) => [k, sort(v[k])]),
                  )
                : v;
          })(o),
        );
    function signature(r) {
      const args = { ...r.args };
      delete args.target;
      delete args.next;
      let content = r.content;
      if (["setTransform", "setTempAnimation"].includes(r.command))
        content = JSON.parse(content);
      return canonical({ command: r.command, content, args });
    }
    const compiled = [];
    for (const preset of library) {
      try {
        const rows = S()
          .parse(preset.code, { capabilities: m.capabilities })
          .statements.filter((r) => r.command !== "comment");
        if (rows.length)
          compiled.push({ preset, rows, keys: rows.map(signature) });
      } catch {}
    }
    compiled.sort((a, b) => b.rows.length - a.rows.length);
    const rows = m.statements.filter((r) => r.command !== "comment"),
      result = [],
      used = new Set();
    for (let i = 0; i < rows.length; i++) {
      if (used.has(rows[i].id)) continue;
      for (const p of compiled) {
        const group = rows.slice(i, i + p.rows.length);
        try {
          if (
            group.length !== p.rows.length ||
            group.some((r, n) => signature(r) !== p.keys[n])
          )
            continue;
          const expected = p.rows.map(targetOf),
            actual = group.map(targetOf);
          if (
            new Set(expected.filter(Boolean)).size > 1
              ? canonical(expected) !== canonical(actual)
              : new Set(actual.filter(Boolean)).size > 1
          )
            continue;
          result.push({
            name: p.preset.name,
            id: p.preset.id,
            rows: group,
            targets: [...new Set(actual.filter(Boolean))],
          });
          group.forEach((r) => used.add(r.id));
          break;
        } catch {}
      }
    }
    return result;
  }
  function checks(snapshot) {
    const m = S().parse(snapshot.source, {
        path: snapshot.path,
        capabilities: snapshot.runtimeCapabilities || snapshot.capabilities,
      }),
      stage = new Map(),
      issues = [];
    let repeated = null,
      count = 0;
    for (const r of m.statements) {
      if (["changeFigure", "changeFigureDiff"].includes(r.command)) {
        const id = scalar(r.args.id) || "fig-" + position(r),
          previous = stage.get(id);
        if (
          r.command !== "changeFigureDiff" ||
          (!isModel(r.content) && !isModel(previous))
        ) {
          if (!r.content || r.content === "none") stage.delete(id);
          else stage.set(id, r.content);
        }
      }
      if (r.command === "say") {
        if (r.args.figureId && !stage.has(String(r.args.figureId)))
          issues.push({
            rowId: r.id,
            line: r.startLine,
            type: "missing-figure",
            message: "对话引用本场尚未出现的立绘 ID",
          });
        const sig = [
          r.args.figureId || r.speaker,
          r.args.motion || "",
          r.args.expression || "",
        ].join("|");
        if ((r.args.motion || r.args.expression) && sig === repeated) count++;
        else count = 1;
        if (count === 3)
          issues.push({
            rowId: r.id,
            line: r.startLine,
            type: "repeated-performance",
            message: "连续三句重复动作/表情，请复核",
          });
        repeated = sig;
      }
    }
    for (const p of S().hintPairs(m))
      if (!p.valid)
        issues.push({
          rowId: p.choose.id,
          line: p.choose.startLine,
          type: "broken-hint",
          message: "单行提示保护标签已损坏",
        });
    return issues;
  }
  function navigation(snapshot, options = {}) {
    const m = S().parse(snapshot.source, {
        path: snapshot.path,
        capabilities: snapshot.runtimeCapabilities || snapshot.capabilities,
      }),
      query = String(options.query || "").toLowerCase(), hints=new Map(S().hintPairs(m).map(p=>[p.choose.id,p]));
    return m.statements
      .filter((r) => r.command !== "comment")
      .map((r) => {
        const hint = hints.get(r.id),
          title =
            r.command === "say"
              ? (r.speaker ? r.speaker + "：" : "旁白：") + r.content
              : r.command === "setTransform"
                ? (() => {
                    try {
                      return Object.entries(flat(JSON.parse(r.content)))
                        .map(([k, v]) => k + "=" + v)
                        .join("、");
                    } catch {
                      return "变换参数需修正";
                    }
                  })()
                : r.command + "：" + r.content;
        const detail = [
          scalar(r.args.figureId) || scalar(r.args.id) || scalar(r.args.target),
          r.args.motion && "motion=" + r.args.motion,
          r.args.expression && "expression=" + r.args.expression,
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          ...r,
          title: title + (detail ? " · " + detail : ""),
          kind: hint ? "hint" : r.command,
          manualFlow: r.command === "choose" && !hint,
          staticSceneTransition:
            ["changeScene", "callScene"].includes(r.command) &&
            !/[{}$]/.test(r.content),
          hiddenReservedLabel:
            r.command === "label" &&
            String(r.content).startsWith("__wvp_hint_"),
        };
      })
      .filter(
        (r) =>
          !r.hiddenReservedLabel &&
          (!query ||
            (r.title + " " + r.speaker).toLowerCase().includes(query)) &&
          (!options.kind || r.kind === options.kind),
      );
  }
  root.WebVideoCraftFeatures = {
    model,
    idCompletion,
    stageScan,
    expressionPreparation,
    batchNext,
    autoExit,
    sanitizeEffects,
    extractEffects,
    batchFilter,
    findFilters,
    editFilters,
    singleLineHint,
    removeHint,
    relocateHint,
    presets,
    recognizePresets,
    checks,
    navigation,
    NEXT_COMMANDS,
  };
})(typeof window === "undefined" ? globalThis : window);

/* Craft source-preserving adapters around the same upstream parser used by Craft.
 * No disk IO, host discovery, or hidden editor state access in this module. */
(function (root) {
  "use strict";
  const POSITIONS = [
    "center",
    "left",
    "right",
    "left13",
    "right13",
    "left14",
    "right14",
  ];
  const own = (v, k) => Object.prototype.hasOwnProperty.call(v || {}, k);
  function fingerprint(value) {
    let a = 2166136261,
      b = 2246822519;
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      a = Math.imul(a ^ code, 16777619);
      b = Math.imul(b ^ code, 3266489917);
    }
    return (
      (a >>> 0).toString(16).padStart(8, "0") +
      (b >>> 0).toString(16).padStart(8, "0")
    );
  }
  function safeId(value) {
    value = String(value ?? "").trim();
    if (!/^[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,95}$/u.test(value))
      throw Error("ID 只能包含文字、数字、下划线、点和连字符");
    return value;
  }
  function safePath(value) {
    value = String(value ?? "")
      .replace(/\\/g, "/")
      .trim();
    if (
      !value ||
      /^(?:\/|[A-Za-z]:|\w+:)/.test(value) ||
      value.split("/").some((p) => !p || p === "." || p === "..") ||
      /[\x00-\x1f<>:"|?*%]/.test(value)
    )
      throw Error("请选择工程内的相对资源路径");
    return value;
  }
  const escapeText = (value) =>
    String(value ?? "")
      .replace(/;/g, "\\;")
      .replace(/\r?\n/g, "|");
  function figureKind(
    value,
    base = root.document?.baseURI || "https://webgal.invalid/",
  ) {
    const url = new URL(String(value || ""), base),
      ext = url.pathname.split(".").pop()?.toLowerCase();
    return url.searchParams.get("type") === "spine" || ext === "skel"
      ? "spine"
      : ext === "json"
        ? "live2d"
        : "texture";
  }
  function codeEnd(text) {
    for (let i = 0; i < text.length; i++)
      if (text[i] === ";" && text[i - 1] !== "\\") return i;
    return text.replace(/[\r\n]+$/, "").length;
  }
  function physicalLines(source) {
    const out = [];
    let offset = 0;
    for (const part of source.match(/[^\n]*(?:\n|$)/g) || []) {
      if (!part) continue;
      out.push({ text: part, start: offset, end: offset + part.length });
      offset += part.length;
    }
    return out;
  }
  function parserFor(capabilities = {}) {
    const library = root.webgalParser;
    if (!library?.default || !library.SCRIPT_CONFIG)
      throw Error("Craft 官方剧本解析器尚未加载");
    const config = library.SCRIPT_CONFIG.filter(
      (c) =>
        !(
          (c.scriptString === "changeFigureDiff" &&
            capabilities.changeFigureDiff !== true) ||
          (c.scriptString === "return" && capabilities.sceneSemantics !== true)
        ),
    );
    return {
      parser: new library.default(undefined, (x) => x, [], config),
      commands: new Map(config.map((c) => [c.scriptType, c.scriptString])),
    };
  }
  function parse(source, options = {}) {
    if (typeof source !== "string") throw Error("剧本必须是文本");
    const capabilities = options.capabilities || {},
      lines = physicalLines(source),
      { parser, commands } = parserFor(capabilities);
    let sentences = [];
    if (capabilities.multilineStatements === false) {
      for (let i = 0; i < lines.length; i++)
        for (const s of parser.parse(
          lines[i].text.replace(/[\r\n]+$/, ""),
          "",
          "",
        ).sentenceList || [])
          if (!s.isLineBreakHolder)
            sentences.push({ ...s, startLine: i, endLine: i });
    } else
      sentences = parser
        .parse(source.replace(/^\uFEFF/, ""), "", "")
        .sentenceList.filter((s) => !s.isLineBreakHolder);
    const statements = [];
    let group = 0,
      speaker = "";
    for (const s of sentences) {
      const first = lines[s.startLine],
        last = lines[s.endLine];
      if (!first || !last) continue;
      const raw = source.slice(first.start, last.end),
        args = Object.fromEntries((s.args || []).map((a) => [a.key, a.value]));
      let command = commands.get(s.command) || s.commandRaw || "say";
      if (s.command === 0) command = "say";
      if (/^\s*;/.test(raw.replace(/^\uFEFF/, ""))) command = "comment";
      if (!raw.trim() || raw.trim() === "\uFEFF") continue;
      const explicitCommand = raw
        .replace(/^\uFEFF/, "")
        .trimStart()
        .split(":")[0]
        .replace(/;[\s\S]*$/, "");
      const unsupported = [];
      if (explicitCommand === "return" && capabilities.sceneSemantics !== true)
        unsupported.push("sceneSemantics");
      if (
        explicitCommand === "changeFigureDiff" &&
        capabilities.changeFigureDiff !== true
      )
        unsupported.push("changeFigureDiff");
      if (
        (s.endLine > s.startLine || (s.startLine > 0 && /^ +[-|]/.test(raw))) &&
        capabilities.multilineStatements !== true
      )
        unsupported.push("multilineStatements");
      if (own(args, "transformFrom") && capabilities.transformFrom !== true)
        unsupported.push("transformFrom");
      if (command === "say") {
        if (own(args, "speaker")) speaker = String(args.speaker ?? "");
        if (s.commandRaw === "" || args.clear === true) speaker = "";
      }
      const row = {
        id: first.start + ":" + fingerprint(raw),
        index: statements.length,
        command,
        commandRaw: s.commandRaw,
        content:
          command === "return" && raw.trim() === "return;" ? "" : s.content,
        args,
        source: raw,
        startOffset: first.start,
        endOffset: last.end,
        startLine: s.startLine + 1,
        endLine: s.endLine + 1,
        groupId: group,
        speaker: command === "say" ? speaker : "",
        unsupported,
        parsed: s,
      };
      statements.push(row);
      if (command !== "comment" && args.next !== true) group++;
    }
    return {
      path: options.path || "",
      source,
      statements,
      rows: statements,
      capabilities,
      eol: source.includes("\r\n") ? "\r\n" : "\n",
      fingerprint: fingerprint(source),
    };
  }
  function argTokens(raw) {
    const end = codeEnd(raw),
      body = raw.slice(0, end),
      matches = [...body.matchAll(/ -([^\s=;]+)(?:=)?/g)];
    return matches.map((m, i) => {
      const stop = i + 1 < matches.length ? matches[i + 1].index : end;
      const text = body.slice(m.index, stop),
        trimmed = text.replace(/[\s\\]+$/, "");
      return {
        key: m[1],
        start: m.index,
        end: m.index + trimmed.length,
        text: trimmed,
      };
    });
  }
  function write(row, changes = {}) {
    const patches = [],
      raw = row.source,
      tokens = argTokens(raw),
      args = changes.args || {};
    const end = codeEnd(raw);
    let addition = "";
    for (const [key, value] of Object.entries(args)) {
      if (!/^[A-Za-z_][\w]*$/.test(key)) throw Error("参数名无效");
      const found = tokens.filter((t) => t.key === key);
      if (value !== false && value !== undefined && value !== null) {
        const encoded = value === true ? "" : "=" + String(value);
        if (/[\r\n;]/.test(encoded) || / -/.test(encoded))
          throw Error("参数值不能注入额外语句或参数");
        const replacement = " -" + key + encoded;
        if (found.length) {
          patches.push({
            start: found[0].start,
            end: found[0].end,
            text: replacement,
          });
          for (const t of found.slice(1))
            patches.push({ start: t.start, end: t.end, text: "" });
        } else addition += replacement;
      } else
        for (const t of found)
          patches.push({ start: t.start, end: t.end, text: "" });
    }
    if (own(changes, "content")) {
      const prefix = raw.match(/^\uFEFF?[ \t]*/)?.[0] || "",
        colon = raw.indexOf(":", prefix.length),
        start = colon >= 0 && colon < end ? colon + 1 : prefix.length;
      let stop = tokens.length ? tokens[0].start : end;
      while (stop > start && /[\s]/.test(raw[stop - 1])) stop--;
      patches.push({ start, end: stop, text: escapeText(changes.content) });
    }
    if (addition) {
      let at = end;
      while (at > 0 && /[\s]/.test(raw[at - 1])) at--;
      patches.push({
        start: at,
        end: at,
        text: addition + (raw[end] === ";" ? "" : ";"),
      });
    }
    patches.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < patches.length; i++)
      if (patches[i].start < patches[i - 1].end)
        throw Error("参数和内容改写范围重叠");
    let after = raw;
    for (const p of patches.reverse())
      after = after.slice(0, p.start) + p.text + after.slice(p.end);
    return after;
  }
  function assertSupported(model, rows = model.statements) {
    const bad = rows.find((r) => r.unsupported.length);
    if (bad)
      throw Error(
        "第 " +
          bad.startLine +
          " 行需要已确认的引擎能力：" +
          bad.unsupported.join("、"),
      );
  }
  function hintPairs(model) {
    const result = [],
      nextRows = [];
    let following = null;
    for (let i = model.statements.length - 1; i >= 0; i--) {
      nextRows[i] = following;
      if (model.statements[i].command !== "comment")
        following = model.statements[i];
    }
    for (let i = 0; i < model.statements.length; i++) {
      const r = model.statements[i];
      if (r.command !== "choose") continue;
      const match = String(r.content).match(
        /^(.*):(__wvp_hint_[A-Za-z0-9_]+)$/,
      );
      if (!match) continue;
      const next = nextRows[i];
      const duration = Number(r.args.wvpHint || 1800),
        valid =
          next?.command === "label" &&
          next.content === match[2] &&
          Number(r.args.defaultChoose) === 1 &&
          r.args.next !== true &&
          !/(?<!\\)\|/.test(r.content) &&
          duration >= 100 &&
          duration <= 60000;
      result.push({
        choose: r,
        label: valid ? next : null,
        key: match[2],
        text: match[1],
        duration,
        valid,
      });
    }
    return result;
  }
  function protectHints(before, after) {
    const old = hintPairs(before),
      fresh = hintPairs(after);
    for (const pair of fresh)
      if (!pair.valid) throw Error("单行提示与保护标签必须成对且相邻");
    const labels = after.statements.filter(
      (r) =>
        r.command === "label" && String(r.content).startsWith("__wvp_hint_"),
    );
    const keys = fresh.map((p) => p.key),
      keySet = new Set(keys),
      labelSet = new Set(labels.map((r) => r.content));
    if (new Set(keys).size !== keys.length) throw Error("单行提示标签不能重复");
    for (const label of labels)
      if (!keySet.has(label.content))
        throw Error("不能保留孤立的单行提示保护标签");
    for (const pair of old) {
      const labelStill = labelSet.has(pair.key),
        hintStill = keySet.has(pair.key);
      if (labelStill !== hintStill)
        throw Error("单行提示和标签必须一起移动、复制或删除");
    }
  }
  function plan(snapshot, patches, label, details = {}) {
    if (
      !snapshot ||
      typeof snapshot.source !== "string" ||
      snapshot.revision === undefined
    )
      throw Error("缺少当前编辑缓冲区及 revision");
    const sorted = patches
      .map((p) => ({ ...p }))
      .sort(
        (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset,
      );
    let previous = -1;
    for (const p of sorted) {
      if (
        typeof p.after !== "string" ||
        !Number.isInteger(p.startOffset) ||
        !Number.isInteger(p.endOffset) ||
        p.startOffset < 0 ||
        p.endOffset < p.startOffset ||
        p.endOffset > snapshot.source.length ||
        p.startOffset < previous ||
        snapshot.source.slice(p.startOffset, p.endOffset) !== p.before
      )
        throw Error("改写范围重叠或源文本不匹配");
      previous = p.endOffset;
    }
    const chunks = [];
    let cursor = 0;
    for (const p of sorted) {
      chunks.push(snapshot.source.slice(cursor, p.startOffset), p.after);
      cursor = p.endOffset;
    }
    chunks.push(snapshot.source.slice(cursor));
    const after = chunks.join("");
    const options = {
      path: snapshot.path,
      capabilities:
        details.capabilities ||
        snapshot.runtimeCapabilities ||
        snapshot.capabilities ||
        {},
    };
    protectHints(parse(snapshot.source, options), parse(after, options));
    return {
      ...details,
      snapshot: { ...snapshot },
      before: snapshot.source,
      after,
      label,
      patches: sorted,
      changed: sorted.filter((p) => p.before !== p.after).length,
      warnings: details.warnings || [],
      reviewOffsets: details.reviewOffsets || [],
    };
  }
  function append(snapshot, text, label, details = {}) {
    const eol = snapshot.source.includes("\r\n") ? "\r\n" : "\n",
      code = String(text).replace(/\r?\n/g, eol);
    if (!code.trim()) throw Error("追加内容不能为空");
    const prefix =
      snapshot.source && !/[\r\n]$/.test(snapshot.source) ? eol : "";
    return plan(
      snapshot,
      [
        {
          startOffset: snapshot.source.length,
          endOffset: snapshot.source.length,
          before: "",
          after: prefix + code + (code.endsWith(eol) ? "" : eol),
        },
      ],
      label,
      details,
    );
  }
  function selectedRows(model, selection) {
    if (!selection) return model.statements;
    const ids = selection instanceof Set ? selection : new Set(selection);
    return model.statements.filter((r) => ids.has(r.id));
  }
  root.WebVideoCraftScript = {
    parse,
    write,
    plan,
    append,
    assertSupported,
    selectedRows,
    hintPairs,
    protectHints,
    codeEnd,
    argTokens,
    fingerprint,
    safeId,
    safePath,
    escapeText,
    figureKind,
    POSITIONS,
  };
})(typeof window === "undefined" ? globalThis : window);

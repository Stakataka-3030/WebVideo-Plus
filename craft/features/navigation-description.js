/* Craft presentation adapter for Terre's shared, read-only navigation contract.
 * Craft's parser rows remain the only source of identity, ranges and eligibility.
 * No resource loading, selection, source editing or Terre behavior changes here. */
(function (root) {
  "use strict";
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const clip = (value, maximum) => {
    const chars = Array.from(compact(value));
    return chars.length > maximum ? chars.slice(0, maximum - 1).join("") + "…" : chars.join("");
  };
  const unique = (values) => [...new Set(values.map(compact).filter(Boolean))];
  const fileName = (value) => String(value || "").replace(/\\/g, "/").split("/").at(-1) || "";
  const span = (row) => row.startLine + ":" + row.endLine;
  // Known technical labels omitted by Terre's compact navigation, verified in
  // baseline/terre-4.6.4.js and Craft v1.0.0-beta.2 src/locales/zh-Hans.yml.
  const technicalLabels = { bgm: "背景音乐", wait: "等待", label: "标签", jumpLabel: "跳转标签", choose: "分支选择", callScene: "调用场景", return: "返回场景", setVar: "设置变量", showVars: "显示变量", getUserInput: "获取输入", end: "结束游戏", applyStyle: "应用样式", unlockCg: "解锁鉴赏图片", unlockBgm: "解锁鉴赏音乐", callSteam: "调用 Steam" };
  function figureProjection(model) {
    const stage = new Map(), annotations = new Map(), positions = ["center", "left", "right", "left13", "right13", "left14", "right14"];
    const associated = ["animationFlag", "mouthOpen", "mouthHalfOpen", "mouthClose", "eyesOpen", "eyesClose"];
    // Same image/type guards as browser/workload.js; unknown suffixes are not
    // assumed to be image textures, and URLSearchParams decodes Spine flags.
    const image = value => /\.(png|jpe?g|webp|gif)([?#].*)?$/i.test(String(value || ""));
    const unsupportedDiff = value => { try { const url = new URL(String(value || ""), "http://localhost/"), extension = url.pathname.split(".").pop().toLowerCase(); return extension === "json" || extension === "skel" || url.searchParams.get("type") === "spine"; } catch { return false; } };
    const liveRuntime = (file, args) => /\.(json|jsonl|wmdl)([?#].*)?$/i.test(file) || /[?&]type=(?:live2d|wmdl|model)(?:&|$)/i.test(file) || ["motion", "skin", "expression", "blink", "focus", "animationFlag", "eyesOpen", "eyesClose"].some(key => !!args[key]);
    const rows = model.statements.map(row => {
      if (!["changeFigure", "changeFigureDiff"].includes(row.command)) return row;
      const diff = row.command === "changeFigureDiff", a = row.args;
      const pos = positions.find(key => a[key] === true) || "center", explicit = typeof a.id === "string" || typeof a.id === "number" ? String(a.id) : "", key = explicit || "fig-" + pos;
      const previous = stage.get(key), gone = !row.content || row.content === "none";
      if (diff && row.unsupported?.includes("changeFigureDiff")) {
        annotations.set(row.id, { title: "changeFigureDiff · 当前引擎不支持", target: key, note: "保留原语句，未推断差分后的舞台状态" });
        return { ...row, command: "comment" };
      }
      if (own(a, "when") || a.userForward === true) {
        if (diff) annotations.set(row.id, { title: "立绘差分", target: key, note: "含条件或手动继续，未推断后续舞台状态" });
        return row;
      }
      if (diff && (unsupportedDiff(row.content) || unsupportedDiff(previous?.file) || gone && previous?.liveRuntime && !image(previous.file) || previous && !gone && (!image(previous.file) || !image(row.content)))) {
        annotations.set(row.id, { title: "立绘差分 · 模型不适用", target: key, note: "源或目标不是可差分的图片，已核实运行时跳过此差分" });
        return { ...row, command: "comment" };
      }
      if (diff && previous && !gone) {
        const args = { ...a, clear: false };
        for (const p of positions) delete args[p];
        args[previous.pos] = true;
        for (const field of ["transform", "enter", "exit", "duration", "ease", "motion", "expression", "skin", "bounds", "zIndex", "focus", "blink"]) delete args[field];
        for (const field of associated) if (!own(args, field)) args[field] = false;
        annotations.set(row.id, { title: "立绘差分", target: key, note: "替换图片及口型／眨眼图，保留位置、变换和入退场设置" });
        previous.file = row.content;
        return { ...row, command: "changeFigure", content: previous.projectedFile, args };
      }
      const cleared = gone || a.clear === true;
      if (cleared) {
        if (explicit) stage.delete(key); else for (const [id, value] of stage) if (value.pos === pos) stage.delete(id);
      } else {
        const projectedFile = previous?.file === row.content ? previous.projectedFile : row.content;
        stage.set(key, { file: row.content, projectedFile, pos, liveRuntime: liveRuntime(row.content, a) });
        if (diff) annotations.set(row.id, { target: key, note: "未找到源立绘，按普通立绘登场处理" });
        return { ...row, command: "changeFigure", content: projectedFile };
      }
      if (diff) annotations.set(row.id, { target: key, note: "空目标按普通立绘离场处理" });
      return { ...row, command: "changeFigure" };
    });
    return { rows, annotations };
  }
  function targetLabel(target) {
    const metadata = root.WebVideoNavigationMetadata;
    const value = String(target ?? "");
    const names = root.WebVideoCharacterMap?.names() || metadata.characterNames;
    if (value === "bg-main") return "背景";
    if (value.startsWith("fig-") && metadata.positions[value.slice(4)])
      return metadata.positions[value.slice(4)] + "人物";
    return own(names, value.toLowerCase()) && names[value.toLowerCase()]
      ? String(names[value.toLowerCase()])
      : value;
  }
  function sentence(row, descriptiveOnly = false) {
    return {
      ...row.parsed,
      // Numeric parser enums differ by version. The Craft parser already resolved them.
      command: row.command,
      commandRaw: row.commandRaw,
      content: row.content,
      startLine: row.startLine - 1,
      endLine: row.endLine - 1,
      args: Object.entries(row.args).filter(([key]) =>
        !descriptiveOnly || !["when", "userForward"].includes(key)
      ).map(([key, value]) => ({ key, value })),
    };
  }
  function project(model, statements = model.statements, descriptiveOnly = false) {
    const types = Object.fromEntries(statements.map(row => [row.command, row.command]));
    return root.WebVideoNavigation.derive(
      model.path,
      model.source,
      { sentenceList: statements.map(row => sentence(row, descriptiveOnly)) },
      types,
    );
  }
  function invalidEffects(row) {
    if (!["setTransform", "setTempAnimation"].includes(row.command)) return false;
    try {
      const value = JSON.parse(row.content);
      const object = item => !!item && typeof item === "object" && !Array.isArray(item);
      return row.command === "setTransform"
        ? !object(value)
        : !Array.isArray(value) || !value.every(object);
    } catch {
      return true;
    }
  }
  function description(row, projected, figureNote) {
    const parts = [...(projected?.parts || []), ...(projected?.embeddedEffects || [])]
      .map(part => ({
        ...part,
        title: String(part.title || ""),
        items: [...(part.items || [])].map(String),
        footer: String(part.footer || ""),
      }));
    const invalid = invalidEffects(row);
    if (invalid) parts.push({ title: projected?.title || row.command, items: ["参数无法解析"], footer: "" });
    const matched = projected?.parts?.find(part => part.filterName);
    let title = figureNote?.title || matched?.title || (projected?.kind !== "technical" && projected?.title) || technicalLabels[row.command] || row.command;
    if (figureNote?.title === "立绘差分") title += " · " + targetLabel(figureNote.target) + (row.content && row.content !== "none" ? " · " + fileName(row.content) : "");
    if (row.command === "bgm") title += " · " + (row.content && row.content !== "none" ? fileName(row.content) : "关闭");
    if (row.command === "wait") title += " · " + compact(row.content) + " 毫秒";
    if (invalid) title += " · 参数需修正";
    if (row.command === "say")
      title = (row.speaker || "旁白") + "：" + (projected?.title || row.content || "").replace(/\|/g, " / ");
    // Terre already names the action and actor. Only shorten the media path for a row.
    if (["changeFigure", "changeFigureDiff"].includes(row.command) && row.content && title.endsWith(" · " + row.content))
      title = title.slice(0, -row.content.length) + fileName(row.content);
    const target = targetLabel(figureNote?.target || projected?.target || row.args.target || row.args.figureId ||
      (typeof row.args.id === "string" || typeof row.args.id === "number" ? row.args.id : ""));
    const headings = unique(parts.map(part => part.title)).filter(text => text !== title && text !== projected?.title);
    const items = unique(parts.flatMap(part => part.items)).filter(text => !text.startsWith("目标："));
    const footers = unique(parts.map(part => part.footer));
    const annotations = unique([
      ...(projected?.annotations || []),
      row.args.motion ? "动 " + row.args.motion : "",
      row.args.expression ? "表 " + row.args.expression : "",
      figureNote?.note || "",
    ]);
    const parameters = items.slice(0, 3);
    if (items.length > parameters.length) parameters.push("另 " + (items.length - parameters.length) + " 项");
    // Unrecognized/hidden commands keep their canonical name, never a guessed alias.
    const fallback = !parts.length ? clip(row.content, 100) : "";
    const summary = unique([
      target && !title.includes(target) ? target : "",
      ...headings.slice(0, 2),
      ...footers.slice(0, 1),
      ...parameters,
      ...annotations.slice(0, 1),
      fallback,
    ]).join(" · ");
    const details = unique([
      title,
      target ? "目标：" + target : "",
      ...parts.flatMap(part => [part.title, ...part.items, part.footer]),
      ...annotations,
      !parts.length ? String(row.content || "") : "",
    ]).join("\n");
    return {
      title: clip(title, 100),
      summary: clip(summary, 160),
      details,
      descriptionParts: parts,
      searchText: unique([details, row.command, row.content, row.source, target]).join(" "),
    };
  }
  function describe(model) {
    if (!root.WebVideoNavigation?.derive || !root.WebVideoNavigationMetadata || !root.WebVideoTimelineCore)
      throw Error("共享导航说明尚未加载");
    const normalized = figureProjection(model), projected = project(model, normalized.rows);
    const bySpan = new Map(projected.statements.map(row => [span(row), row]));
    const descriptions = new Map();
    for (const row of model.statements) {
      let view = bySpan.get(span(row));
      if (!view?.parts?.length && (own(row.args, "when") || row.args.userForward === true)) {
        // Terre omits manual timing rows. Describe that single statement in isolation,
        // without changing its source, eligibility, timing or subsequent stage state.
        view = project(model, [row], true).statements[0] || view;
      }
      descriptions.set(row.id, description(row, view, normalized.annotations.get(row.id)));
    }
    return descriptions;
  }
  root.WebVideoCraftNavigation = { describe };
})(typeof window === "undefined" ? globalThis : window);

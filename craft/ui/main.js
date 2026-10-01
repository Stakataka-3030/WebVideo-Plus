/* Version-checked Craft UI integration. Tools live in native editor/header/command surfaces. */
(function (root) {
  "use strict";
  const mounts = new WeakMap();
  function element(tag, text, attrs = {}) {
    const el = document.createElement(tag);
    if (text !== null && text !== undefined) el.textContent = text;
    for (const [k, v] of Object.entries(attrs))
      if (k in el) el[k] = v;
      else el.setAttribute(k, String(v));
    return el;
  }
  function mount(bridge) {
    if (mounts.has(bridge)) return mounts.get(bridge);
    if (
      !bridge?.snapshot ||
      !root.WebVideoCraftFeatures ||
      !root.WebVideoCraftScript
    )
      throw Error("Craft 功能桥尚未就绪");
    const F = root.WebVideoCraftFeatures,
      S = root.WebVideoCraftScript;
    let current = null,
      selected = new Set(),
      pending = null,
      busy = false,
      closed = false,
      characters = null,
      filterLibrary = [],
      presetLibrary = [],
      review = null,
      backup = null,
      checksTicket = 0,
      stopBackupAutomatic = null;
    const dialog = element("aside", null, {
        className: "wvc-dock", hidden: true,
        "aria-label": "WebVideo+ 工具", "data-webvideo-craft": "tools",
      }),
      header = element("header", null, { className: "wvc-header" }),
      content = element("div", null, { className: "wvc-content" }),
      status = element("div", "选择工具后会读取当前 Craft 场景", {
        className: "wvc-footer", role: "status",
      }),
      title = element("strong", "WebVideo+"),
      scope = element("span", "", { className: "wvc-scope" }),
      heading = element("div", null, { className: "wvc-heading" }),
      contextBar = element("div", null, { className: "wvc-context" });
    heading.append(title, scope);
    header.append(heading);
    dialog.append(header, contextBar, content, status);
    // Hidden parking only. A tool is never displayed outside a verified editor anchor.
    document.body.append(dialog);
    const panels = new Map(), cards = new Map(), controls = [];
    let dockHost = null, mountedContent = null, mountedToolbar = null, mountedHeader = null,
      mountedCommands = null, activeTool = null, pickerReturn = null,
      menu = null, menuTrigger = null, lastFocus = null, selectionMode = "native",
      observer = null, resizeObserver = null, remountTimer = null, cancelHint = null,
      mountNotice = null, mountReason = "";
    const nativeNodes = [];
    const toolDefinitions = {
      id: { title: "一键 ID 补全", panel: "批量编辑", cards: ["全场一键 ID 补全"] },
      expression: { title: "预位表情调整", panel: "批量编辑", cards: ["预位表情"], selection: true },
      next: { title: "批量加 -next", panel: "批量编辑", cards: ["批量 -next"], selection: true },
      exits: { title: "自动离场", panel: "批量编辑", cards: ["自动离场"], selection: true },
      filter: { title: "批量滤镜", panel: "滤镜与预设", cards: ["批量滤镜"], selection: true },
      filterEdit: { title: "修改已有滤镜", panel: "滤镜与预设", cards: ["替换 / 删除已有命名滤镜"], selection: true },
      presets: { title: "Video+ 预制效果", panel: "滤镜与预设", cards: ["参数化演出预设"], selection: true },
      hint: { title: "单行提示", panel: "单行提示", selection: true },
      selection: { title: "选择剧情范围", panel: "剧情" },
      checks: { title: "制作检查与复核", panel: "检查与备份", cards: [], selection: true },
      backups: { title: "备份与恢复", panel: "检查与备份", cards: ["场景 / 全故事 / 配乐备份"] },
      music: { title: "成片配乐", panel: "配乐与时间", media: "music" },
      timing: { title: "实际时间与速度", panel: "配乐与时间", media: "time", selection: true },
      export: { title: "导出视频", panel: "配乐与时间", media: "export" },
      anogo: { title: "导入 Anogo 故事", panel: "导入与 AI", cards: ["Anogo 结构化导入"] },
      novel: { title: "小说转剧本骨架", panel: "导入与 AI", cards: ["可选 AI 小说转剧本"] },
      characterMap: { title: "角色 ID 映射", panel: "角色映射" },
      ai: { title: "AI 提供商配置", panel: "AI 配置" },
      updates: { title: "Craft 更新", panel: "设置与更新" },
    };
    function icon(name) {
      const paths = { batch: "M4 5h16M4 12h16M4 19h16M8 3v4M16 10v4M10 17v4", film: "M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4", check: "m4 12 4 4L20 4M20 12v8H4V4h9", settings: "M4 7h16M4 17h16M8 4v6M16 14v6", sparkle: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z", hint: "M4 5h16v12H8l-4 4V5M8 9h8M8 13h5", down: "m6 9 6 6 6-6" };
      const node = element("span", null, { className: "wvc-icon", "aria-hidden": "true" });
      node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + (paths[name] || paths.batch) + '"/></svg>';
      return node;
    }
    function closeMenu() {
      menu?.remove(); menu = null;
      menuTrigger?.setAttribute("aria-expanded", "false"); menuTrigger = null;
    }
    function showMenu(trigger, groups) {
      const same = menuTrigger === trigger;
      closeMenu(); if (same) return;
      menuTrigger = trigger;
      trigger.setAttribute("aria-expanded", "true");
      menu = element("div", null, { className: "wvc-menu", role: "menu", "aria-label": trigger.textContent });
      for (const [label, ids] of groups) {
        menu.append(element("div", label, { className: "wvc-menu-label" }));
        for (const id of ids) {
          const item = element("button", toolDefinitions[id].title, { type: "button", role: "menuitem", "data-wvc-tool": id });
          item.addEventListener("click", () => { closeMenu(); open(id); });
          menu.append(item);
        }
      }
      document.body.append(menu);
      const rect = trigger.getBoundingClientRect?.();
      if (rect && menu.style) {
        menu.style.left = Math.max(8, Math.min(rect.left, (root.innerWidth || 1280) - 256)) + "px";
        menu.style.top = (rect.bottom + 5) + "px";
      }
      menu.querySelector?.('button')?.focus?.();
    }
    function nativeButton(label, glyph, id, groups) {
      const node = element("button", null, { type: "button", className: "wvc-native-button", title: label, "data-wvc-entry": id });
      node.append(icon(glyph), element("span", label));
      if (groups) { node.append(icon("down")); node.setAttribute("aria-haspopup", "menu"); node.setAttribute("aria-expanded", "false"); }
      node.addEventListener("click", () => groups ? showMenu(node, groups) : open(id));
      nativeNodes.push(node);
      return node;
    }
    function detachNative() {
      closeMenu(); nativeNodes.splice(0).forEach(n => n.remove());
      mountNotice?.remove(); mountNotice = null;
      if (dockHost) {
        dockHost.classList.toggle("wvc-dock-host", false);
        dockHost.classList.toggle("wvc-dock-bottom", false);
        dockHost.classList.toggle("wvc-dock-open", false);
      }
      mountedContent?.classList.toggle("wvc-native-editor-layout", false);
      resizeObserver?.disconnect(); resizeObserver = null;
      dockHost = mountedContent = mountedToolbar = mountedHeader = mountedCommands = null;
    }
    function mountNative() {
      if (closed) return false;
      const mode = document.querySelector('[data-tour="mode-switch"]');
      const toolbar = mode?.parentElement;
      const strip = toolbar?.parentElement;
      const host = strip?.nextElementSibling;
      const editorArea = document.querySelector('[data-tour="editor-area"]');
      const nativeContent = [...(host?.children || [])].find(node => node !== dialog && node.contains?.(editorArea));
      const app = document.querySelector('#app');
      const nativeHeader = [...(app?.querySelectorAll?.('header') || [])].find(node => !dialog.contains(node));
      const commands = document.querySelector('[data-tour="command-panel"]');
      // These relationships are checked against official beta.2 EditorPanel/EditorToolbar.
      if (!toolbar || !host || !editorArea || !nativeContent || !nativeHeader) {
        if (dockHost) { detachNative(); dialog.hidden = true; pending = null; preview.hidden = true; document.body.append(dialog); }
        mountReason = editorArea ? "Craft 编辑区结构不匹配，WebVideo+ 工具未挂载" : "请先打开 Craft 场景";
        if (editorArea && nativeHeader?.lastElementChild && !mountNotice?.isConnected) {
          mountNotice = element("span", "WebVideo+ 界面未兼容", { className: "wvc-mount-notice", role: "status", title: mountReason });
          nativeHeader.lastElementChild.append(mountNotice);
        }
        return false;
      }
      mountReason = ""; mountNotice?.remove(); mountNotice = null;
      if (dockHost === host && mountedContent === nativeContent && mountedToolbar === toolbar && mountedHeader === nativeHeader && mountedCommands === commands && nativeNodes.every(n => n.isConnected)) return true;
      detachNative();
      dockHost = host; mountedContent = nativeContent; mountedToolbar = toolbar; mountedHeader = nativeHeader; mountedCommands = commands;
      nativeContent.classList.toggle("wvc-native-editor-layout", true);
      host.classList.toggle("wvc-dock-host", true); host.append(dialog);
      const resize = () => {
        if (!dockHost) return;
        dockHost.classList.toggle("wvc-dock-bottom", (dockHost.getBoundingClientRect?.().width || 1000) < 840);
      };
      resize();
      if (root.ResizeObserver) { resizeObserver = new root.ResizeObserver(resize); resizeObserver.observe(host); }
      toolbar.append(nativeButton("批量工具", "batch", "batchMenu", [["批量操作", ["id", "expression", "filter", "filterEdit", "next", "exits"]]]));
      toolbar.append(nativeButton("制作", "check", "productionMenu", [["剧情与复核", ["selection", "checks", "timing"]], ["语句插入", ["presets", "hint"]], ["导入", ["anogo", "novel"]], ["项目", ["backups"]]]));
      const headerActions = nativeHeader.lastElementChild;
      headerActions.append(nativeButton("成片", "film", "mediaMenu", [["配乐与导出", ["music", "timing", "export"]]]));
      headerActions.append(nativeButton("Video+ 设置", "settings", "settingsMenu", [["WebVideo+", ["characterMap", "ai", "presets", "updates"]]]));
      if (commands?.firstElementChild) {
        const actions = element("div", null, { className: "wvc-command-entries" });
        actions.append(nativeButton("Video+ 预设", "sparkle", "presets"), nativeButton("单行提示", "hint", "hint"));
        commands.firstElementChild.append(actions); nativeNodes.push(actions);
      }
      host.classList.toggle("wvc-dock-open", !dialog.hidden);
      return true;
    }
    function notify(message, error = false) {
      status.textContent = String(message || "");
      status.classList.toggle("wvc-error", error);
    }
    function capabilities() {
      try {
        return bridge.capabilities() || {};
      } catch (e) {
        return { reason: e.message };
      }
    }
    function buttons() {
      const caps = capabilities();
      for (let i = controls.length - 1; i >= 0; i--)
        if (!controls[i].isConnected) controls.splice(i, 1);
      for (const b of controls) {
        const required = b.dataset.required;
        b.disabled = (busy && b.dataset.allowBusy !== "true") || (required && caps[required] !== true);
        if (required && caps[required] !== true)
          b.title =
            caps[required + "Reason"] ||
            caps.reason ||
            "当前已验证宿主未提供此能力";
        else if (required) b.title = "";
      }
      applyButton.disabled = busy || !pending || caps.commit !== true;
      if (cancelHint) cancelHint.hidden = !(busy && caps.previewHint === true);
      for (const node of nativeNodes) if (node.tagName === "BUTTON") node.disabled = busy;
      close.disabled = busy;
    }
    async function run(action) {
      if (busy || closed) return;
      busy = true;
      closeMenu();
      buttons();
      try {
        return await action();
      } catch (e) {
        notify(e.message || String(e), true);
      } finally {
        busy = false;
        buttons();
        void syncSnapshot();
      }
    }
    function button(text, action, cap) {
      const b = element("button", text, { type: "button" });
      if (cap) b.dataset.required = cap;
      controls.push(b);
      b.addEventListener("click", () => run(action));
      return b;
    }
    function input(label, value = "", type = "text") {
      const box = element("label", null, { className: "wvc-field" }),
        el = element("input", null, { type, value });
      box.append(element("span", label), el);
      return { box, el };
    }
    function check(label, checked = false) {
      const box = element("label"),
        el = element("input", null, { type: "checkbox", checked });
      box.append(el, document.createTextNode(label));
      return { box, el };
    }
    function area(label, placeholder = "") {
      const box = element("label", null, { className: "wvc-field" }),
        el = element("textarea", null, { placeholder });
      box.append(element("span", label), el);
      return { box, el };
    }
    function select(label, entries) {
      const box = element("label", null, { className: "wvc-field" }),
        el = element("select");
      for (const [value, text] of entries)
        el.append(element("option", text, { value }));
      box.append(element("span", label), el);
      return { box, el };
    }
    function card(parent, label) {
      const box = element("section", null, { className: "wvc-card" });
      box.append(element("h3", label));
      parent.append(box);
      cards.set(label, box);
      return box;
    }
    function actions(parent, ...items) {
      const row = element("div", null, { className: "wvc-actions" });
      row.append(...items.map((x) => x.box || x));
      parent.append(row);
      return row;
    }
    function requireCurrent() {
      if (!current) throw Error("请先读取当前场景");
      return current;
    }
    function chosen() {
      if (!selected.size) throw Error("请先在剧情列表勾选语句或指定行范围");
      return new Set(selected);
    }
    function getSelection() {
      if (!current) return [];
      return S.selectedRows(
        S.parse(current.source, {
          path: current.path,
          capabilities: current.runtimeCapabilities,
        }),
        selected,
      );
    }
    function setPlan(plan) {
      pending = plan;
      before.el.value = plan.before;
      after.el.value = plan.after;
      preview.hidden = false;
      warnings.textContent = (plan.warnings || []).join("\n");
      notify(
        "预览已生成：" + plan.changed + " 处改动。检查后点击“应用到编辑缓冲区”",
      );
      buttons();
      preview.scrollIntoView?.({ block: "nearest" });
    }
    function freshSnapshot(snapshot) {
      return (
        snapshot &&
        current &&
        snapshot.path === current.path &&
        snapshot.source === current.source &&
        snapshot.revision === current.revision &&
        snapshot.projectId === current.projectId
      );
    }
    async function refresh() {
      const next = await bridge.snapshot();
      const changed = !freshSnapshot(next);
      current = next;
      scope.textContent = next.sceneRelativePath || next.path;
      if (changed) {
        selectionMode = "native";
        selected = new Set();
        rangeAnchor = null;
        pending = null;
        preview.hidden = true;
        const start = next.selection?.start;
        const model = S.parse(next.source, {
          path: next.path,
          capabilities: next.runtimeCapabilities,
        });
        if (Number.isInteger(start)) {
          const row = model.statements.find(
            (r) => r.startOffset <= start && r.endOffset > start,
          );
          if (row) selected.add(row.id);
        }
      }
      if (selectionMode === "native") useNativeSelection();
      else renderRows();
      renderChecks();
      buttons();
      return next;
    }
    const refreshButton = button("同步当前行", async () => {
      selectionMode = "native";
      await refresh();
      useNativeSelection();
    }, "snapshot");
    refreshButton.className = "wvc-text-button";
    const close = element("button", "×", { type: "button", className: "wvc-close", "aria-label": "关闭工具面板", title: "关闭工具面板" });
    close.addEventListener("click", closePanel);
    header.append(close);
    const scopeSummary = element("span", "", { className: "wvc-selection-summary" });
    const selectMore = element("button", "选择范围…", { type: "button" });
    selectMore.addEventListener("click", () => { pickerReturn = activeTool; showTool("selection"); });
    contextBar.append(scopeSummary, refreshButton, selectMore);
    for (const name of ["剧情", "批量编辑", "单行提示", "滤镜与预设", "配乐与时间", "导入与 AI", "检查与备份", "设置与更新", "角色映射", "AI 配置"]) {
      const panel = element("section", null, { className: "wvc-panel", hidden: true });
      panels.set(name, panel); content.append(panel);
    }
    const preview = element("section", null, {
        className: "wvc-preview",
        hidden: true,
      }),
      before = area("原文"),
      after = area("修改预览"),
      warnings = element("p", "", { className: "wvc-warning" }),
      pair = element("div", null, { className: "wvc-grid" });
    before.el.readOnly = true;
    after.el.readOnly = true;
    pair.append(before.box, after.box);
    preview.append(element("h3", "操作预览"), warnings, pair);
    content.append(preview);
    const applyButton = button(
      "应用到编辑缓冲区",
      async () => {
        if (!pending) throw Error("请先生成预览");
        const plan = pending;
        const result = await bridge.commit({
          snapshot: plan.snapshot,
          after: plan.after,
          label: plan.label,
        });
        pending = null;
        preview.hidden = true;
        await refresh();
        if (plan.reviewOffsets?.length && review) {
          try {
            const m = S.parse(current.source, {
                capabilities: current.runtimeCapabilities,
              }),
              ids = new Set(
                m.rows
                  .filter((r) =>
                    plan.reviewOffsets.some(
                      (at) => r.startOffset <= at && r.endOffset > at,
                    ),
                  )
                  .map((r) => r.id),
              );
            if (ids.size)
              await review.mark(current, ids, "pending", "generated");
          } catch (e) {
            notify("剧本已提交，但复核标记保存失败：" + e.message, true);
            return result;
          }
        }
        notify("已应用，可在 Craft 原生撤销；尚未替你保存到磁盘");
        return result;
      },
      "commit",
    );
    actions(
      preview,
      applyButton,
      button("放弃预览", async () => {
        pending = null;
        preview.hidden = true;
      }),
    );
    // Shared explicit source selection and semantic navigation.
    const story = panels.get("剧情"),
      query = input("搜索文本或说话人"),
      kind = select("类型", [
        ["", "全部"],
        ["say", "对白"],
        ["changeFigure", "立绘"],
        ["changeBg", "背景"],
        ["setTransform", "变换"],
        ["hint", "单行提示"],
      ]),
      from = input("开始行", "1", "number"),
      to = input("结束行", "1", "number"),
      rowsBox = element("div", null, { className: "wvc-list" }),
      selectionInfo = element("span", "", { className: "wvc-help" });
    actions(
      story,
      query,
      kind,
      button("全选当前筛选", async () => {
        selectionMode = "custom";
        for (const r of navigation()) selected.add(r.id);
        renderRows();
      }),
      button("反选", async () => {
        selectionMode = "custom";
        for (const r of navigation())
          selected.has(r.id) ? selected.delete(r.id) : selected.add(r.id);
        renderRows();
      }),
      button("清空", async () => {
        selectionMode = "custom";
        selected.clear();
        renderRows();
      }),
    );
    actions(
      story,
      from,
      to,
      button("加入行范围", async () => {
        selectionMode = "custom";
        const a = Number(from.el.value),
          b = Number(to.el.value);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a)
          throw Error("行范围无效");
        for (const r of S.parse(requireCurrent().source, {
          capabilities: current.runtimeCapabilities,
        }).rows)
          if (r.startLine <= b && r.endLine >= a) selected.add(r.id);
        renderRows();
      }),
      selectionInfo,
    );
    story.append(
      rowsBox,
      element(
        "p",
        "仅在需要多选或连续范围时使用；日常编辑、导航和撤销继续在 Craft 中操作。",
        { className: "wvc-native-note" },
      ),
    );
    function navigation() {
      if (!current) return [];
      const nav = F.navigation(current, {
        query: query.el.value,
        kind: kind.el.value,
      });
      if (presetLibrary.length) {
        try {
          const recognized = F.recognizePresets(current, presetLibrary);
          for (const group of recognized)
            for (const row of nav)
              if (group.rows.some((r) => r.id === row.id))
                row.title = group.name + " · " + group.targets.join("、");
        } catch {}
      }
      return nav;
    }
    let rangeAnchor = null;
    function renderRows() {
      rowsBox.replaceChildren();
      const rows = navigation();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i],
          line = element("div", null, {
            className: "wvc-row",
            "aria-selected": selected.has(row.id),
          }),
          pick = element("input", null, {
            type: "checkbox",
            checked: selected.has(row.id),
            "aria-label": "选择第 " + row.startLine + " 行",
          });
        pick.addEventListener("click", (event) => {
          selectionMode = "custom";
          if (event.shiftKey && rangeAnchor !== null) {
            for (
              let j = Math.min(rangeAnchor, i);
              j <= Math.max(rangeAnchor, i);
              j++
            )
              selected.add(rows[j].id);
          } else if (pick.checked) selected.add(row.id);
          else selected.delete(row.id);
          rangeAnchor = i;
          renderRows();
        });
        line.append(
          pick,
          element(
            "span",
            row.startLine +
              (row.endLine !== row.startLine ? "–" + row.endLine : ""),
            { className: "wvc-line" },
          ),
          element("span", row.title, { className: "wvc-row-text" }),
        );
        if (row.args.next === true)
          line.append(
            element("span", "连续组 " + row.groupId, { className: "wvc-tag" }),
          );
        if (row.manualFlow)
          line.append(element("span", "选择分支", { className: "wvc-tag" }));
        if (row.staticSceneTransition)
          line.append(element("span", "场景跳转", { className: "wvc-tag" }));
        line.append(
          button("定位", () => bridge.navigate(row.startLine), "navigate"),
        );
        if (row.kind === "hint")
          line.append(
            button(
              "计时预览",
              () =>
                bridge.previewHint({
                  line: row.startLine,
                  duration: Number(row.args.wvpHint || 1800),
                  key: String(row.content).split(":").at(-1),
                }),
              "previewHint",
            ),
          );
        else
          line.append(
            button("预览", () => bridge.preview(row.startLine), "preview"),
          );
        rowsBox.append(line);
      }
      selectionInfo.textContent = "已选择 " + selected.size + " 条";
      scopeSummary.textContent = selectionMode === "native" ? "当前 Craft 行 · " + (current?.line || getSelection()[0]?.startLine || 1) : "自选范围 · " + selected.size + " 条";
      buttons();
    }
    query.el.addEventListener("input", () => {
      rangeAnchor = null;
      renderRows();
    });
    kind.el.addEventListener("change", () => {
      rangeAnchor = null;
      renderRows();
    });
    // Stateful ID, preparation, next, exits and shared character mapping.
    const batch = panels.get("批量编辑"),
      idCard = card(batch, "全场一键 ID 补全"),
      overwrite = check("覆盖已有 ID"),
      presence = check("忽略角色是否在场");
    actions(
      idCard,
      overwrite,
      presence,
      button(
        "预览全场补全",
        async () => {
          characters = await bridge.service("/api/character-map");
          setPlan(
            F.idCompletion(
              requireCurrent(),
              {
                overwrite: overwrite.el.checked,
                ignorePresence: presence.el.checked,
              },
              characters,
            ),
          );
        },
        "service",
      ),
    );
    idCard.append(
      element(
        "p",
        "保留未映射或歧义项并列出警告；会同步处理离场与同一连续组内的效果目标。",
        { className: "wvc-help" },
      ),
    );
    const mapDetails = element("details"),
      mapText = area("共享角色别名 rows（JSON）");
    mapDetails.append(element("summary", "编辑共享角色映射"), mapText.box);
    actions(
      mapDetails,
      button(
        "读取映射",
        async () => {
          characters = await bridge.service("/api/character-map");
          mapText.el.value = JSON.stringify(characters.rows, null, 2);
        },
        "service",
      ),
      button(
        "保存映射",
        async () => {
          if (!characters) throw Error("请先读取映射");
          characters = await bridge.service("/api/character-map", {
            rows: JSON.parse(mapText.el.value),
            expectedHash: characters.hash,
          });
          notify("共享角色映射已保存");
        },
        "service",
      ),
    );
    mapDetails.open = true;
    panels.get("角色映射").append(mapDetails);
    actions(idCard, button("角色 ID 映射…", async () => showTool("characterMap")));
    const expression = card(batch, "预位表情"),
      force = check("强制重复追加"),
      nonRecommended = check("允许非推荐旁白 / 画外音");
    actions(
      expression,
      force,
      nonRecommended,
      button(
        "预览选中对白",
        async () =>
          setPlan(
            F.expressionPreparation(requireCurrent(), {
              selected: chosen(),
              force: force.el.checked,
              allowNonRecommended: nonRecommended.el.checked,
            }),
          ),
        "commit",
      ),
    );
    const nextCard = card(batch, "批量 -next"),
      nextChoices = new Map();
    for (const cmd of F.NEXT_COMMANDS) {
      const c = check(cmd, cmd !== "say");
      nextChoices.set(cmd, c.el);
      nextCard.append(c.box);
    }
    actions(
      nextCard,
      button(
        "预览选中语句",
        async () =>
          setPlan(
            F.batchNext(requireCurrent(), {
              selected: chosen(),
              commands: [...nextChoices]
                .filter(([, c]) => c.checked)
                .map(([k]) => k),
            }),
          ),
        "commit",
      ),
    );
    const exits = card(batch, "自动离场");
    exits.append(
      element(
        "p",
        "只处理选中的入场语句；保留触发条件。已有图片的差分保留舞台状态；无源差分按引擎规则视为入场。",
        { className: "wvc-help" },
      ),
    );
    actions(
      exits,
      button(
        "预览冲突位置离场",
        async () =>
          setPlan(F.autoExit(requireCurrent(), { selected: chosen() })),
        "commit",
      ),
    );
    // Cancellation must stay callable while the timed preview promise is pending.
    cancelHint = element("button", "取消提示计时", { type: "button" });
    cancelHint.dataset.required = "previewHint";
    cancelHint.dataset.allowBusy = "true";
    controls.push(cancelHint);
    cancelHint.addEventListener("click", async () => {
      try {
        if (typeof bridge.cancelHintPreview !== "function") throw Error("当前宿主未提供提示取消能力");
        await bridge.cancelHintPreview();
        notify("提示计时已取消，不会自动点击选项");
      } catch (error) { notify(error.message || String(error), true); }
    });
    dialog.append(cancelHint);
    cancelHint.className = "wvc-cancel-hint";
    cancelHint.hidden = true;
    // Protected timed hints.
    const hint = panels.get("单行提示"),
      hintText = input("提示文字"),
      duration = input("显示毫秒", "1800", "number"),
      convert = check("确认取消原有单选跳转并转换");
    actions(hint, hintText, duration, convert);
    function hintRow() {
      return getSelection().find((r) => r.command === "choose");
    }
    actions(
      hint,
      button(
        "在末尾新增提示",
        async () =>
          setPlan(
            F.singleLineHint(requireCurrent(), {
              text: hintText.el.value,
              duration: Number(duration.el.value),
              key: root.crypto.randomUUID().replaceAll("-", "_"),
            }),
          ),
        "commit",
      ),
      button(
        "编辑 / 转换选中单选",
        async () => {
          const row = hintRow();
          if (!row) throw Error("请先在剧情列表选择一条单选");
          setPlan(
            F.singleLineHint(requireCurrent(), {
              rowId: row.id,
              text: hintText.el.value,
              duration: Number(duration.el.value),
              confirmConvert: convert.el.checked,
              key: root.crypto.randomUUID().replaceAll("-", "_"),
            }),
          );
        },
        "commit",
      ),
      button(
        "删除选中提示及标签",
        async () => {
          const row = hintRow();
          if (!row) throw Error("请选择提示");
          setPlan(F.removeHint(requireCurrent(), row.id));
        },
        "commit",
      ),
    );
    const hintAt = input("移动 / 复制到行之前（留空为场景末尾）");
    actions(
      hint,
      hintAt,
      button(
        "移动完整提示",
        async () => {
          const row = hintRow();
          if (!row) throw Error("请选择提示");
          const at = hintAt.el.value
            ? S.parse(requireCurrent().source, {
                capabilities: current.runtimeCapabilities,
              }).rows.find((r) => r.startLine === Number(hintAt.el.value))
                ?.startOffset
            : current.source.length;
          setPlan(F.relocateHint(current, row.id, { at }));
        },
        "commit",
      ),
      button(
        "复制完整提示",
        async () => {
          const row = hintRow();
          if (!row) throw Error("请选择提示");
          const at = hintAt.el.value
            ? S.parse(requireCurrent().source, {
                capabilities: current.runtimeCapabilities,
              }).rows.find((r) => r.startLine === Number(hintAt.el.value))
                ?.startOffset
            : current.source.length;
          setPlan(
            F.relocateHint(current, row.id, {
              at,
              copy: true,
              key: root.crypto.randomUUID().replaceAll("-", "_"),
            }),
          );
        },
        "commit",
      ),
    );
    hint.append(
      element(
        "p",
        "100–60000 毫秒，默认 1800。专用标签受到成对保护，不能改成多选或普通默认跳转；计时预览需要对应运行时能力。",
        { className: "wvc-help" },
      ),
    );
    // Named filters and parameterized effects, not a duplicate raw-snippet editor.
    const effects = panels.get("滤镜与预设"),
      filter = card(effects, "批量滤镜"),
      bg = area("背景滤镜 JSON / WebGAL 片段"),
      figure = area("立绘滤镜 JSON / WebGAL 片段"),
      animations = check("允许选择动画语句"),
      filterName = input("保存的滤镜名称");
    const grid = element("div", null, { className: "wvc-grid" });
    grid.append(bg.box, figure.box);
    filter.append(grid);
    actions(
      filter,
      animations,
      button(
        "预览添加",
        async () => {
          const parse = (el) =>
            el.value.trim()
              ? F.extractEffects(el.value, current.runtimeCapabilities)
              : [];
          setPlan(
            F.batchFilter(requireCurrent(), {
              selected: chosen(),
              allowAnimations: animations.el.checked,
              background: parse(bg.el),
              figure: parse(figure.el),
            }),
          );
        },
        "commit",
      ),
    );
    const filters = select("共享滤镜库", [["", "请选择"]]);
    async function loadFilters() {
      const value = await bridge.service("/api/filters");
      filterLibrary = [...(value.presets || []), ...(value.saved || [])];
      filters.el.replaceChildren(element("option", "请选择", { value: "" }));
      existingFilter.el.replaceChildren(
        element("option", "最大匹配（默认）", { value: "" }),
      );
      replacementFilter.el.replaceChildren(element("option", "请选择替换滤镜", { value: "" }));
      filterLibrary.forEach((p, i) => {
        replacementFilter.el.append(element("option", p.name, { value: String(i) }));
        filters.el.append(element("option", p.name, { value: String(i) }));
        existingFilter.el.append(
          element("option", p.name, { value: p.id || String(i) }),
        );
      });
    }
    actions(
      filter,
      filters,
      button("读取库", loadFilters, "service"),
      button("填入背景", async () => {
        const p = filterLibrary[Number(filters.el.value)];
        if (!p || filters.el.value === "") throw Error("请选择滤镜");
        bg.el.value = JSON.stringify(p.effects, null, 2);
      }),
      button("填入立绘", async () => {
        const p = filterLibrary[Number(filters.el.value)];
        if (!p || filters.el.value === "") throw Error("请选择滤镜");
        figure.el.value = JSON.stringify(p.effects, null, 2);
      }),
      filterName,
      button(
        "保存手动立绘滤镜",
        async () => {
          if (!filterName.el.value.trim()) throw Error("请填写名称");
          await bridge.service("/api/filters/save", {
            name: filterName.el.value.trim(),
            effects: F.extractEffects(
              figure.el.value,
              requireCurrent().runtimeCapabilities,
            ),
          });
          await loadFilters();
        },
        "service",
      ),
      button(
        "保存手动背景滤镜",
        async () => {
          if (!filterName.el.value.trim()) throw Error("请填写名称");
          await bridge.service("/api/filters/save", {
            name: filterName.el.value.trim(),
            effects: F.extractEffects(
              bg.el.value,
              requireCurrent().runtimeCapabilities,
            ),
          });
          await loadFilters();
        },
        "service",
      ),
    );
    const existingFilter = select("已有滤镜", [["", "最大匹配（默认）"]]);
    const replacementFilter = select("替换为", [["", "请选择替换滤镜"]]);
    const edit = card(effects, "替换 / 删除已有命名滤镜"),
      mode = select("操作", [
        ["replace", "替换匹配字段"],
        ["delete", "删除匹配字段"],
      ]),
      whole = check("删除整条语句（包括其他参数）");
    actions(
      edit,
      existingFilter,
      replacementFilter,
      button("读取命名滤镜库", loadFilters, "service"),
      mode,
      whole,
      button(
        "预览选中范围",
        async () => {
          if (!filterLibrary.length) await loadFilters();
          const replacement = replacementFilter.el.value === "" ? null : filterLibrary[Number(replacementFilter.el.value)];
          if (mode.el.value === "replace" && !replacement) throw Error("请选择替换滤镜");
          setPlan(
            F.editFilters(requireCurrent(), {
              selected: chosen(),
              library: filterLibrary,
              presetId: existingFilter.el.value || undefined,
              mode: mode.el.value,
              replacement:
                mode.el.value === "replace" ? replacement?.effects : [],
              whole: mode.el.value === "delete" && whole.el.checked,
            }),
          );
        },
        "commit",
      ),
    );
    const preset = card(effects, "参数化演出预设"),
      presetSelect = select("分类 / 搜索结果", [["", "请选择"]]),
      presetSearch = input("搜索预设"),
      code = area("预设代码"),
      presetName = input("预设名称"),
      target = input("单目标绑定角色名 / ID（多目标留空）");
    async function loadPresets() {
      const value = await bridge.service("/api/preset-effects");
      presetLibrary = [
        ...(value.presets || []),
        ...(value.saved || []).map((p) => ({ ...p, category: "手动添加" })),
      ];
      renderPresets();
      renderRows();
    }
    function renderPresets() {
      presetSelect.el.replaceChildren(
        element("option", "请选择", { value: "" }),
      );
      presetLibrary.forEach((p, i) => {
        if (
          (p.name + " " + p.category)
            .toLowerCase()
            .includes(presetSearch.el.value.toLowerCase())
        )
          presetSelect.el.append(
            element("option", (p.category || "预设") + " / " + p.name, {
              value: String(i),
            }),
          );
      });
    }
    presetSearch.el.addEventListener("input", renderPresets);
    actions(
      preset,
      presetSearch,
      presetSelect,
      button("读取预设库", loadPresets, "service"),
      button("载入所选", async () => {
        const p = presetLibrary[Number(presetSelect.el.value)];
        if (!p || presetSelect.el.value === "") throw Error("请选择预设");
        code.el.value = p.code;
        presetName.el.value = p.name;
      }),
    );
    preset.append(code.box);
    actions(
      preset,
      presetName,
      target,
      button(
        "预览插入",
        async () => {
          let value = target.el.value.trim();
          if (value) {
            characters = await bridge.service("/api/character-map");
            if (characters.fatal) throw Error("角色映射不可用");
            value = characters.nameToId?.[value.toLowerCase()] || value;
          }
          setPlan(
            F.presets(requireCurrent(), {
              code: code.el.value,
              target: value || null,
              at: getSelection()[0]?.startOffset ?? current.source.length,
            }),
          );
        },
        "commit",
      ),
      button(
        "保存参数化预设",
        async () => {
          F.presets(requireCurrent(), { code: code.el.value });
          if (!presetName.el.value.trim()) throw Error("请填写预设名称");
          await bridge.service("/api/preset-effects/save", {
            name: presetName.el.value.trim(),
            code: code.el.value,
          });
          await loadPresets();
        },
        "service",
      ),
    );
    preset.append(
      element(
        "p",
        "普通原始片段复用 Craft 原生语句组；这里保留分类预设、目标重绑定和已应用序列识别。",
        { className: "wvc-native-note" },
      ),
    );
    // Optional media controllers: native service capabilities are independently gated.
    let mediaPanel = null,
      media = null;
    if (root.WebVideoCraftMedia) {
      media = root.WebVideoCraftMedia.createController(bridge);
      if (root.WebVideoCraftMediaUI)
        mediaPanel = root.WebVideoCraftMediaUI.mount(panels.get("配乐与时间"), {
          bridge,
          controller: media,
          run,
          notify,
          getSnapshot: () => current,
          getSelection,
        });
      else
        panels
          .get("配乐与时间")
          .append(
            element("p", "媒体界面模块未加载", { className: "wvc-error" }),
          );
    }
    // Import compilation and explicit external generation consent.
    const importsPanel = panels.get("导入与 AI");
    let imports = null;
    if (root.WebVideoCraftImports) {
      const importStatus = element("p", "", { className: "wvc-help" }),
        importPreview = area("编译预览（不会直接修改场景）");
      importPreview.el.readOnly = true;
      imports = root.WebVideoCraftImports.create({
        bridge,
        script: S,
        onApplied: async ({ plan, snapshot }) => {
          if (snapshot.source !== plan.after)
            throw Error("追加后场景又发生变化，请手动复核");
          if (!review) throw Error("复核标记模块未加载");
          const m = S.parse(snapshot.source, {
            capabilities: snapshot.runtimeCapabilities,
          });
          const ids = new Set(
            m.rows
              .filter((r) =>
                (plan.reviewOffsets || []).some(
                  (at) => r.startOffset <= at && r.endOffset > at,
                ),
              )
              .map((r) => r.id),
          );
          if (ids.size)
            await review.mark(snapshot, ids, "pending", "generated");
        },
        onState: (state) => {
          importStatus.textContent = state.message || "";
          if (state.preview)
            importPreview.el.value =
              state.preview.text +
              (state.preview.warnings?.length
                ? "\n\n; 待复核：\n; " + state.preview.warnings.join("\n; ")
                : "");
        },
      });
      const anogo = card(importsPanel, "Anogo 结构化导入"),
        inputText = area("JSON / YAML"),
        useActions = check("启用动作 / 表情映射（默认关闭）"),
        file = element("input", null, {
          type: "file",
          accept: ".json,.yaml,.yml",
        });
      file.addEventListener("change", () =>
        run(async () => {
          const f = file.files[0];
          if (f) inputText.el.value = await f.text();
        }),
      );
      anogo.append(inputText.box);
      actions(
        anogo,
        file,
        useActions,
        button(
          "编译 Anogo 预览",
          async () =>
            imports.previewAnogo(inputText.el.value, {
              useActions: useActions.el.checked,
            }),
          "service",
        ),
      );
      const ai = card(importsPanel, "可选 AI 小说转剧本"),
        novelText = area("小说文本"),
        two = check("允许双人同台"),
        consent = check("确认将这段文本发送给我配置的 AI 提供商");
      ai.append(novelText.box);
      actions(
        ai,
        two,
        consent,
        button(
          "生成骨架预览",
          async () => {
            if (!consent.el.checked) throw Error("请明确确认发送范围后生成");
            await imports.generateNovel(novelText.el.value, {
              allowTwo: two.el.checked,
              confirmed: true,
            });
          },
          "ai",
        ),
      );
      const settings = element("details"),
        provider = input("提供商", "openai"),
        modelName = input("模型"),
        baseURL = input("API 地址"),
        key = input("API Key", "", "password"),
        saveConsent = check("确认保存此提供商配置");
      settings.append(element("summary", "AI 提供商配置"));
      actions(
        settings,
        provider,
        modelName,
        baseURL,
        key,
        saveConsent,
        button(
          "保存配置",
          async () => {
            if (!saveConsent.el.checked) throw Error("请明确确认保存配置");
            await imports.configureProvider(
              {
                provider: provider.el.value,
                model: modelName.el.value,
                baseURL: baseURL.el.value,
                key: key.el.value,
              },
              { confirmed: true },
            );
            key.el.value = "";
            notify("AI 配置已保存，密钥不写入剧本或预览");
          },
          "ai",
        ),
      );
      settings.open = true;
      panels.get("AI 配置").append(settings);
      actions(ai, button("AI 提供商配置…", async () => showTool("ai")));
      importsPanel.append(importStatus, importPreview.box);
      actions(
        importsPanel,
        button(
          "确认追加编译结果",
          async () => {
            const result = await imports.apply();
            await refresh();
            notify(
              result.reviewError
                ? result.warning
                : "已追加到当前缓冲区，生成内容已标为待复核",
              !!result.reviewError,
            );
          },
          "commit",
        ),
      );
      const cancel = element("button", "取消生成", { type: "button" });
      cancel.addEventListener("click", () =>
        imports.cancel().catch((e) => notify(e.message, true)),
      );
      importsPanel.append(cancel);
    }
    const checksPanel = panels.get("检查与备份"),
      checkList = element("div", null, { className: "wvc-list" });
    checksPanel.append(checkList);
    if (root.WebVideoCraftReview)
      review = root.WebVideoCraftReview.createController(bridge);
    actions(
      checksPanel,
      button("刷新制作检查", async () => renderChecks()),
      button(
        "选中项标为待复核",
        async () => {
          await review.mark(requireCurrent(), chosen(), "pending");
          await renderChecks();
        },
        "projectFiles",
      ),
      button(
        "选中项已确认",
        async () => {
          await review.mark(requireCurrent(), chosen(), "reviewed");
          await renderChecks();
        },
        "projectFiles",
      ),
      button(
        "忽略选中项提示",
        async () => {
          await review.mark(requireCurrent(), chosen(), "dismissed");
          await renderChecks();
        },
        "projectFiles",
      ),
    );
    async function renderChecks() {
      if (!current) return;
      const captured = current,
        ticket = ++checksTicket;
      let marks = [],
        problem = "";
      if (review && capabilities().projectFiles) {
        try {
          marks = await review.list(captured);
        } catch (e) {
          problem = e.message;
        }
      }
      if (ticket !== checksTicket || !freshSnapshot(captured)) return;
      checkList.replaceChildren();
      for (const issue of F.checks(captured)) {
        if (
          marks.some(
            (m) => m.row?.id === issue.rowId && m.status === "dismissed",
          )
        )
          continue;
        const row = element("div", null, { className: "wvc-row" });
        row.append(
          element("span", "第 " + issue.line + " 行 " + issue.message, {
            className: "wvc-row-text",
          }),
          button("定位", () => bridge.navigate(issue.line), "navigate"),
        );
        checkList.append(row);
      }
      for (const mark of marks)
        checkList.append(
          element(
            "div",
            (mark.row
              ? "第 " + mark.row.startLine + " 行"
              : "源文变化，需重新定位") +
              " · " +
              { pending: "待复核", reviewed: "已确认", dismissed: "已忽略" }[
                mark.status
              ],
            { className: "wvc-row" },
          ),
        );
      if (problem)
        checkList.append(element("p", problem, { className: "wvc-error" }));
      buttons();
    }
    if (root.WebVideoCraftBackups) {
      backup = root.WebVideoCraftBackups.createController(bridge);
      const backupCard = card(checksPanel, "场景 / 全故事 / 配乐备份"),
        list = element("div", null, { className: "wvc-list" });
      backupCard.append(list);
      const autoStatus = element("p", "自动全故事快照：等待宿主能力", {
        className: "wvc-help",
      });
      backupCard.append(autoStatus);
      if (backup.startAutomatic)
        stopBackupAutomatic = backup.startAutomatic({
          onState: (state) => {
            autoStatus.textContent =
              state.state === "captured"
                ? "自动全故事 TXT 快照已更新"
                : state.state === "failed"
                  ? "自动快照暂未成功：" + state.message
                  : "自动快照：" + state.state;
          },
        });
      actions(
        backupCard,
        button(
          "读取备份列表",
          async () => {
            const entries = await backup.list();
            list.replaceChildren();
            for (const item of entries) {
              const row = element("div", null, { className: "wvc-row" });
              row.append(
                element(
                  "span",
                  (item.label || item.name || item.file) +
                    " · " +
                    (item.createdAt || ""),
                  { className: "wvc-row-text" },
                ),
                button("查看恢复预览", async () => {
                  const data = await backup.read(item);
                  backupDetail.el.value = JSON.stringify(data, null, 2);
                  selectedBackup = item;
                  restoreConfirmed.el.checked = false;
                  backupScene.el.replaceChildren(
                    element("option", "请选择一个待恢复场景", { value: "" }),
                  );
                  for (const f of data.kind === "storySet"
                    ? data.files || []
                    : [])
                    backupScene.el.append(
                      element("option", f.path, { value: f.path }),
                    );
                  backupScene.box.hidden = data.kind !== "storySet";
                }),
              );
              list.append(row);
            }
          },
          "backups",
        ),
        button(
          "捕获全故事快照",
          async () => {
            await backup.captureStory();
            notify("已捕获故事场景快照，不包含整个项目素材");
          },
          "backups",
        ),
      );
      let selectedBackup = null;
      const backupScene = select("全故事备份内的场景", [
        ["", "请选择一个待恢复场景"],
      ]);
      backupScene.box.hidden = true;
      backupCard.append(backupScene.box);
      const backupDetail = area("备份内容");
      backupDetail.el.readOnly = true;
      backupCard.append(backupDetail.box);
      const restoreConfirmed = check("确认恢复选定条目，当前版本将先备份");
      actions(
        backupCard,
        restoreConfirmed,
        button(
          "恢复所选场景 / 配乐",
          async () => {
            if (!restoreConfirmed.el.checked || !selectedBackup)
              throw Error("请选择并确认备份");
            const data = await backup.read(selectedBackup);
            if (data.kind === "music")
              await backup.restoreMusic(selectedBackup, { confirmed: true });
            else {
              if (data.kind === "storySet" && !backupScene.el.value)
                throw Error("请明确选择本次要恢复的一个场景");
              await backup.restoreScene(selectedBackup, {
                scenePath: backupScene.el.value || undefined,
                confirmed: true,
              });
            }
            await refresh();
            notify("恢复完成，可在相应场景撤销；全故事备份按场景显式恢复");
          },
          "backups",
        ),
      );
    }
    const updatesPanel = panels.get("设置与更新"),
      updateText = element(
        "p",
        "使用 Craft 官方更新来源。下载不等于安装完成；协调安装须经本机能力核验。",
        { className: "wvc-help" },
      );
    updatesPanel.append(updateText);
    function updater() {
      if (!root.WebVideoCraftUpdates) throw Error("当前宿主未提供官方更新连接");
      return root.WebVideoCraftUpdates;
    }
    actions(
      updatesPanel,
      button("检查 Craft 官方更新", async () => {
        const value = await updater().check();
        updateText.textContent = value
          ? "发现官方版本 " + value.version
          : "当前没有官方更新";
      }),
      button("下载已发现的官方更新", async () => {
        await updater().download();
        updateText.textContent =
          "官方更新已下载；安装前将再次检查未保存文档和运行任务";
      }),
      button(
        "协调安装已下载更新",
        async () => {
          await updater().install();
          updateText.textContent = "官方安装流程已启动，等待原生协调器确认";
        },
        "coordinatedUpdate",
      ),
    );
    updatesPanel.append(
      element(
        "p",
        "Craft 自带的检查更新入口保持可用。当前安装接续能力未验证时，协调安装按钮保持禁用。",
        { className: "wvc-help" },
      ),
    );
    const confirmSelection = element("button", "使用所选范围", { type: "button", className: "wvc-primary" });
    confirmSelection.addEventListener("click", () => { const target = pickerReturn || "expression"; pickerReturn = null; showTool(target); });
    story.append(confirmSelection);
    function useNativeSelection() {
      rangeAnchor = null;
      if (!current) return;
      selected.clear();
      const at = current.selection?.start;
      const row = S.parse(current.source, { path: current.path, capabilities: current.runtimeCapabilities }).statements.find(r => r.startOffset <= at && r.endOffset > at);
      if (row) selected.add(row.id);
      renderRows();
    }
    function showTool(id) {
      const definition = toolDefinitions[id];
      if (!definition) throw Error("未知工具：" + id);
      if (activeTool && activeTool !== id) { pending = null; preview.hidden = true; }
      activeTool = id;
      title.textContent = definition.title;
      dialog.setAttribute("aria-label", definition.title);
      for (const [name, panel] of panels) panel.hidden = name !== definition.panel;
      for (const [name, node] of cards) node.hidden = !!definition.cards && !definition.cards.includes(name);
      const checkPanel = panels.get("检查与备份");
      for (const node of checkPanel.children) if (!node.classList?.contains("wvc-card") && node.className !== "wvc-card") node.hidden = id === "backups";
      contextBar.hidden = !definition.selection;
      if (definition.media) mediaPanel?.show?.(definition.media);
      content.scrollTop = 0;
      renderRows();
    }
    function closePanel() {
      if (busy) return;
      dialog.hidden = true;
      dockHost?.classList.toggle("wvc-dock-open", false);
      pending = null; preview.hidden = true; closeMenu();
      lastFocus?.isConnected && lastFocus.focus?.();
    }
    function syncSnapshot() {
      if (dialog.hidden || busy) return;
      return bridge.snapshot().then((next) => {
        if (closed || dialog.hidden) return;
        if (current && !freshSnapshot(next)) {
          pending = null; applyButton.disabled = true; preview.hidden = true;
          const changedDocument = next.projectId !== current.projectId || next.path !== current.path;
          current = next; scope.textContent = next.sceneRelativePath || next.path;
          selectionMode = "native"; useNativeSelection(); renderChecks();
          notify(changedDocument ? "已跟随 Craft 切换场景；旧预览已失效" : "剧本已变化；旧预览已失效，请重新生成");
        } else if (selectionMode === "native" && current?.selection?.start !== next.selection?.start) {
          current = next; useNativeSelection();
        }
      }).catch((e) => { pending = null; applyButton.disabled = true; notify(e.message, true); });
    }
    const unsubscribe = bridge.subscribe(syncSnapshot);
    async function open(id = "id") {
      if (busy || closed) return false;
      closeMenu();
      if (!mountNative()) { notify("未识别到兼容的 Craft 编辑区，请打开场景后重试", true); return false; }
      lastFocus = document.activeElement;
      dialog.hidden = false; dockHost.classList.toggle("wvc-dock-open", true);
      const snapshot = await run(refresh);
      if (!snapshot) { current = null; selected.clear(); pending = null; preview.hidden = true; scope.textContent = "未打开可编辑场景"; }
      showTool(typeof id === "string" ? id : "id");
      buttons();
      close.focus?.();
      return true;
    }
    const onOutside = event => {
      if (menu && !menu.contains?.(event.target) && !menuTrigger?.contains?.(event.target)) closeMenu();
    };
    const onKey = event => {
      if (menu && menu.contains?.(event.target) && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const items = [...menu.querySelectorAll('button')], at = items.indexOf(event.target);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus?.(); event.preventDefault(); return;
      }
      if (event.key !== "Escape") return;
      if (menu) { const trigger = menuTrigger; closeMenu(); trigger?.focus?.(); event.preventDefault(); }
      else if (!dialog.hidden && dialog.contains?.(event.target)) { closePanel(); event.preventDefault(); }
    };
    document.addEventListener?.("pointerdown", onOutside);
    document.addEventListener?.("keydown", onKey);
    if (root.MutationObserver) {
      observer = new root.MutationObserver(() => {
        if (remountTimer !== null || closed) return;
        remountTimer = setTimeout(() => { remountTimer = null; mountNative(); }, 40);
      });
      observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });
    }
    mountNative();
    const api = {
      open,
      close: closePanel,
      remount: mountNative,
      tools: () => Object.entries(toolDefinitions).map(([id, value]) => ({ id, title: value.title })),
      async dispose() {
        closed = true;
        observer?.disconnect();
        if (remountTimer !== null) clearTimeout(remountTimer);
        document.removeEventListener?.("pointerdown", onOutside);
        document.removeEventListener?.("keydown", onKey);
        detachNative();
        unsubscribe?.();
        stopBackupAutomatic?.();
        mediaPanel?.dispose?.();
        await imports?.dispose?.();
        await media?.cancel?.();
        dialog.remove();
        mounts.delete(bridge);
      },
      state: () =>
        JSON.parse(
          JSON.stringify({
            tool: activeTool,
            mounted: !!dockHost,
            mountReason,
            open: !dialog.hidden,
            snapshot: current,
            selected: [...selected],
            pending,
            busy,
          }),
        ),
    };
    mounts.set(bridge, api);
    buttons();
    return api;
  }
  root.WebVideoCraftUI = { mount };
})(typeof window === "undefined" ? globalThis : window);

/* Review marks are context-bound metadata, never embedded in scene text. */
(function (root) {
  "use strict";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function anchor(model, row) {
    const i = model.statements[row.index]?.id===row.id ? row.index : model.statements.findIndex((r) => r.id === row.id),
      hash = root.WebVideoCraftScript.fingerprint;
    return {
      body: hash(row.source.trim()),
      before: i ? hash(model.statements[i - 1].source.trim()) : null,
      after:
        i + 1 < model.statements.length
          ? hash(model.statements[i + 1].source.trim())
          : null,
    };
  }
  function resolve(model, mark) {
    const candidates = model.statements.filter(
      (r) =>
        root.WebVideoCraftScript.fingerprint(r.source.trim()) ===
        mark.anchor.body,
    );
    return candidates.filter((r) => {
      const a = anchor(model, r);
      return a.before === mark.anchor.before && a.after === mark.anchor.after;
    }).length === 1
      ? candidates.find((r) => {
          const a = anchor(model, r);
          return (
            a.before === mark.anchor.before && a.after === mark.anchor.after
          );
        })
      : null;
  }
  function createController(bridge) {
    let data = null,
      text = null,
      project = null;
    const file = ".webvideo-plus/craft-review.json";
    async function load() {
      const snap = await bridge.snapshot(),
        raw = await bridge.readProjectFile(file, null);
      const value =
        raw === null ? { schemaVersion: 1, marks: [] } : JSON.parse(raw);
      if (value.schemaVersion !== 1 || !Array.isArray(value.marks))
        throw Error("复核标记配置格式不兼容");
      const now = await bridge.snapshot();
      if (now.projectId !== snap.projectId)
        throw Error("工程已切换，未读取复核配置");
      project = snap.projectId;
      text = raw;
      data = value;
      return clone(value);
    }
    async function mark(snapshot, rowIds, status = "pending", kind = "manual") {
      if (!["pending", "reviewed", "dismissed"].includes(status))
        throw Error("未知复核状态");
      const current = await bridge.snapshot();
      if (
        current.projectId !== snapshot.projectId ||
        current.path !== snapshot.path ||
        current.source !== snapshot.source ||
        current.revision !== snapshot.revision
      )
        throw Error("场景已变化，请重新选择复核项");
      if (!data || project !== current.projectId) await load();
      const S = root.WebVideoCraftScript,
        m = S.parse(snapshot.source, {
          path: snapshot.path,
          capabilities: snapshot.runtimeCapabilities || snapshot.capabilities,
        }),
        next = clone(data);
      const selected=S.selectedRows(m,rowIds),selectedKeys=new Set(),existingByKey=new Map(next.marks.map(x=>[JSON.stringify([x.path,x.kind,x.anchor]),x]));
      for(const row of selected){const a=anchor(m,row),key=JSON.stringify([snapshot.path,kind,a]);selectedKeys.add(JSON.stringify(a));const existing=existingByKey.get(key);if(existing)existing.status=status;else {const item={path:snapshot.path,kind,status,anchor:a};next.marks.push(item);existingByKey.set(key,item);}}
      if(kind==='manual')for(const mark of next.marks)if(mark.path===snapshot.path&&selectedKeys.has(JSON.stringify(mark.anchor)))mark.status=status;
      const after = JSON.stringify(next, null, 2);
      const latest = await bridge.snapshot();
      if (
        latest.projectId !== snapshot.projectId ||
        latest.path !== snapshot.path ||
        latest.source !== snapshot.source ||
        latest.revision !== snapshot.revision
      )
        throw Error("工程或场景已变化，未保存复核标记");
      await bridge.writeProjectFile(file, after, {
        expectedText: text,
        create: text === null,
      });
      data = next;
      text = after;
      return clone(next);
    }
    async function list(snapshot) {
      if (!data || project !== snapshot.projectId) await load();
      const m = root.WebVideoCraftScript.parse(snapshot.source, {
        capabilities: snapshot.runtimeCapabilities || snapshot.capabilities,
      });
      const byAnchor=new Map();for(const row of m.rows){const key=JSON.stringify(anchor(m,row));byAnchor.set(key,byAnchor.has(key)?null:row);}
      return data.marks.filter(x=>x.path===snapshot.path).map(x=>({...clone(x),row:byAnchor.get(JSON.stringify(x.anchor))||null}));
    }
    return { load, mark, list };
  }
  root.WebVideoCraftReview = { createController, anchor, resolve };
})(typeof window === "undefined" ? globalThis : window);

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
class Node {
  constructor(tag = "div", text = "") {
    this.tagName = tag.toUpperCase();
    this._text = text;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.value = "";
    this.type = "";
    this.title = "";
    this.className = "";
    this.readOnly = false;
    this.files = [];
    const classes = new Set();
    this.classList = {
      toggle: (k, v) => {
        if (v) classes.add(k);
        else classes.delete(k);
      },
      contains: (k) => classes.has(k),
    };
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join("");
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get isConnected() {
    return this.tagName === "BODY" || !!this.parentNode?.isConnected;
  }
  append(...nodes) {
    for (const n of nodes) {
      n.remove?.();
      this.children.push(n);
      n.parentNode = this;
    }
  }
  replaceChildren(...nodes) {
    for (const n of this.children) n.parentNode = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k.startsWith("data-"))
      this.dataset[k.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] =
        String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  addEventListener(k, fn) {
    (this.listeners[k] ??= []).push(fn);
  }
  async emit(k, extra = {}) {
    for (const fn of this.listeners[k] || [])
      await fn({ target: this, preventDefault() {}, ...extra });
  }
  async click() {
    if (!this.disabled) await this.emit("click");
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.emit("close");
  }
  scrollIntoView() {}
  remove() {
    if (this.parentNode)
      this.parentNode.children = this.parentNode.children.filter(
        (n) => n !== this,
      );
    this.parentNode = null;
  }
}
function nodes(root) {
  return [root, ...root.children.flatMap(nodes)];
}
function fixture(extra = {}) {
  const body = new Node("body"),
    header = new Node("header");
  body.append(header);
  const document = {
    body,
    createElement: (t) => new Node(t),
    createTextNode: (t) => new Node("#text", t),
    querySelector: (s) => (s === "header" ? header : null),
  };
  const c = vm.createContext({
    document,
    console,
    URL,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    TextEncoder,
  });
  c.window = c;
  for (const name of [
    "vendor/webgal-parser-4.6.5.js",
    "script.js",
    "id-completion.js",
    "authoring.js",
  ])
    vm.runInContext(
      fs.readFileSync(new URL("../features/" + name, import.meta.url), "utf8"),
      c,
    );
  if (extra.backupsModule) c.WebVideoCraftBackups = extra.backupsModule;
  vm.runInContext(
    fs.readFileSync(new URL("../ui/main.js", import.meta.url), "utf8"),
    c,
  );
  const snapshot = {
    projectId: "p",
    path: "game/scene/a.txt",
    sceneRelativePath: "a.txt",
    source: "changeFigure:alice.png -left;\nAlice:hello;\n",
    revision: 1,
    selection: { start: 0, end: 28 },
    runtimeCapabilities: {
      multilineStatements: true,
      changeFigureDiff: true,
      transformFrom: true,
      sceneSemantics: true,
    },
  };
  let listener,
    commits = 0,
    hasCommit = true;
  const bridge = {
    capabilities: () => ({
      snapshot: true,
      commit: hasCommit,
      undo: true,
      redo: true,
      navigate: true,
      preview: true,
      service: true,
      projectFiles: false,
    }),
    snapshot: async () => ({ ...snapshot }),
    subscribe: (f) => (
      (listener = f),
      () => {
        listener = null;
      }
    ),
    navigate: async () => {},
    preview: async () => {},
    undo: async () => {},
    redo: async () => {},
    service: async (path) =>
      path === "/api/character-map"
        ? { rows: [], nameToId: { alice: "alice" } }
        : { presets: [], saved: [] },
    commit: async (plan) => {
      assert.equal(plan.snapshot.revision, snapshot.revision);
      assert.equal(plan.snapshot.source, snapshot.source);
      snapshot.source = plan.after;
      snapshot.revision++;
      commits++;
      return { changed: true, revision: snapshot.revision };
    },
    ...extra,
  };
  const ui = c.WebVideoCraftUI.mount(bridge),
    find = (text) =>
      nodes(body).find((n) => n.tagName === "BUTTON" && n.textContent === text);
  return {
    c,
    body,
    bridge,
    ui,
    snapshot,
    find,
    changed: () => listener?.(),
    commits: () => commits,
    disableCommit: () => (hasCommit = false),
  };
}
test("UI exposes actual authoring/import/media areas and one reviewed atomic commit", async () => {
  const f = fixture();
  await f.ui.open();
  for (const label of [
    "剧情",
    "批量编辑",
    "单行提示",
    "滤镜与预设",
    "配乐与时间",
    "导入与 AI",
    "检查与备份",
  ])
    assert.ok(f.find(label));
  await f.find("预览全场补全").click();
  assert.equal(f.commits(), 0);
  assert.ok(f.ui.state().pending.after.includes("-id=alice"));
  await f.find("应用到编辑缓冲区").click();
  assert.equal(f.commits(), 1);
  assert.ok(f.snapshot.source.includes("-figureId=alice"));
});
test("pending preview copy is immutable and stale host edits invalidate apply", async () => {
  const f = fixture();
  await f.ui.open();
  await f.find("预览全场补全").click();
  const publicState = f.ui.state();
  publicState.pending.after = "evil";
  assert.notEqual(f.ui.state().pending.after, "evil");
  f.snapshot.source += "; typing\n";
  f.snapshot.revision++;
  f.changed();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.ui.state().pending, null);
  assert.equal(f.find("应用到编辑缓冲区").disabled, true);
});
test("explicit disabled capability cannot be overridden by a generated preview", async () => {
  const f = fixture();
  await f.ui.open();
  await f.find("预览全场补全").click();
  f.disableCommit();
  await f.find("全选当前筛选").click();
  assert.equal(f.find("应用到编辑缓冲区").disabled, true);
});
test("mount is idempotent and disposal removes UI and subscriber", async () => {
  const f = fixture();
  assert.equal(f.c.WebVideoCraftUI.mount(f.bridge), f.ui);
  await f.ui.open();
  await f.ui.dispose();
  assert.equal(
    nodes(f.body).some((n) => n.tagName === "DIALOG"),
    false,
  );
});
test("body-owned launcher survives Craft header replacement and can reopen", async () => {
  const f = fixture();
  const old = f.body.children.find((n) => n.tagName === "HEADER");
  old.remove();
  f.body.append(new Node("header"));
  const launch = f.find("WebVideo+");
  assert.ok(launch?.isConnected);
  await launch.click();
  assert.equal(nodes(f.body).find((n) => n.tagName === "DIALOG").open, true);
});
test("automatic backup watcher starts before an active-project capability and stops on dispose", async () => {
  let starts = 0,
    stops = 0;
  const f = fixture({
    backupsModule: {
      createController: () => ({
        startAutomatic() {
          starts++;
          return () => stops++;
        },
      }),
    },
  });
  assert.equal(starts, 1);
  await f.ui.dispose();
  assert.equal(stops, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import {Node,nodes,makeDocument} from "./ui-dom.mjs";
function fixture(extra = {}) {
  const hostFixture = makeDocument();
  const {document,body} = hostFixture;
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
    hostFixture,
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
  assert.deepEqual(Array.from(f.ui.tools(), t => t.id), ["id","expression","next","exits","filter","filterEdit","presets","hint","selection","checks","backups","music","timing","export","anogo","novel","characterMap","ai","updates"]);
  assert.ok(f.hostFixture.toolbar.querySelector('[data-wvc-entry="batchMenu"]'));
  assert.ok(f.hostFixture.header.querySelector('[data-wvc-entry="mediaMenu"]'));
  assert.ok(f.hostFixture.commandBar.querySelector('[data-wvc-entry="hint"]'));
  assert.equal(nodes(f.body).some(n => n.tagName === "DIALOG"), false);
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
test("native entries remount once after Craft header replacement without floating fallback", async () => {
  const f=fixture();
  const old=f.hostFixture.header;
  const next=new Node('header');next.append(new Node('div'),new Node('div'));old.remove();f.hostFixture.app.append(next);
  assert.equal(f.ui.remount(),true);
  assert.ok(next.querySelector('[data-wvc-entry="mediaMenu"]'));
  assert.equal(nodes(f.body).filter(n=>n.dataset.wvcEntry==='batchMenu').length,1);
  await f.ui.open('filter');assert.equal(f.ui.state().tool,'filter');assert.equal(f.ui.state().open,true);
  f.ui.close();assert.equal(f.ui.state().open,false);
});
test("missing editor anchors park tools invisibly rather than floating over Craft", async()=>{
  const f=fixture();f.hostFixture.toolbar.remove();assert.equal(f.ui.remount(),false);
  assert.equal(await f.ui.open(),false);assert.equal(f.ui.state().open,false);
  assert.equal(nodes(f.body).filter(n=>n.dataset.wvcEntry).length,0);
});
test("on-demand tool exposes only its controls and close preserves the native editor", async()=>{
  const f=fixture();await f.ui.open('expression');
  const cards=nodes(f.body).filter(n=>n.className==='wvc-card'&&!n.hidden);
  assert.equal(cards.length,1);assert.match(cards[0].textContent,/预位表情/);
  assert.equal(f.hostFixture.editorArea.isConnected,true);
  assert.equal(f.find('撤销'),undefined);assert.equal(f.find('重做'),undefined);
  f.ui.close();assert.equal(f.hostFixture.host.classList.contains('wvc-dock-open'),false);
});
test("selection picker returns to tool and native current-line changes update scope",async()=>{
  const f=fixture();await f.ui.open('expression');await f.find('选择范围…').click();
  assert.equal(f.ui.state().tool,'selection');await f.find('全选当前筛选').click();await f.find('使用所选范围').click();
  assert.equal(f.ui.state().tool,'expression');assert.equal(f.ui.state().selected.length,2);
  await f.find('同步当前行').click();f.snapshot.selection={start:30,end:40};f.changed();await new Promise(r=>setTimeout(r,0));
  assert.equal(f.ui.state().selected.length,1);
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
test("hint cancellation remains usable while timed preview is pending", async () => {
  let resolvePreview, cancelled = 0;
  const f = fixture({
    capabilities: () => ({snapshot:true,previewHint:true,commit:true}),
    previewHint: () => new Promise(resolve => {resolvePreview = resolve}),
    cancelHintPreview: async () => {cancelled++;resolvePreview({state:'cancelled'})},
  });
  f.snapshot.source = 'choose:提示:__wvp_hint_a -wvpHint=1800;\nlabel:__wvp_hint_a;\n';
  await f.ui.open();
  const pending = f.find('计时预览').click();
  assert.equal(f.find('同步当前行').disabled,true);
  assert.equal(f.find('取消提示计时').disabled,false);
  await f.find('取消提示计时').click();
  await pending;
  assert.equal(cancelled,1);
});
test('native current line is refreshed on reopening an unchanged scene', async()=>{
  const f=fixture();await f.ui.open('expression');const first=f.ui.state().selected[0];
  f.ui.close();f.snapshot.selection={start:30,end:40};await f.ui.open('expression');
  assert.notEqual(f.ui.state().selected[0],first);
});
test('source change during a busy operation is reconciled once it finishes',async()=>{
  let resolveMap;
  const f=fixture({service:()=>new Promise(resolve=>resolveMap=resolve)});
  await f.ui.open('id');const work=f.find('预览全场补全').click();
  f.snapshot.source+='; another native edit\n';f.snapshot.revision++;f.changed();
  resolveMap({rows:[],nameToId:{alice:'alice'}});await work;await new Promise(r=>setTimeout(r,0));
  assert.equal(f.ui.state().pending,null);assert.equal(f.find('应用到编辑缓冲区').disabled,true);
});
test('tool switch clears unrelated staged preview before rendering another action',async()=>{
  const f=fixture();await f.ui.open('id');await f.find('预览全场补全').click();assert.ok(f.ui.state().pending);
  await f.ui.open('filter');assert.equal(f.ui.state().pending,null);assert.equal(f.find('应用到编辑缓冲区').disabled,true);
});
test('dock sizing targets only the verified native layout, never teleported drawers',async()=>{
  const f=fixture(),layout=f.hostFixture.host.children.find(n=>n.contains(f.hostFixture.editorArea));
  const drawer=new Node('section');drawer.className='native-effect-drawer';drawer.style.width='432px';drawer.style.position='absolute';f.hostFixture.host.append(drawer);
  await f.ui.open('expression');assert.equal(layout.classList.contains('wvc-native-editor-layout'),true);
  assert.equal(drawer.classList.contains('wvc-native-editor-layout'),false);assert.equal(drawer.style.width,'432px');
  assert.equal(f.ui.remount(),true);assert.equal(drawer.isConnected,true);
  await f.ui.dispose();assert.equal(layout.classList.contains('wvc-native-editor-layout'),false);assert.equal(drawer.isConnected,true);
  const css=fs.readFileSync(new URL('../ui/styles.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/>\s*:not\(\.wvc-dock\)/);
  assert.match(css,/\.wvc-dock-host\.wvc-dock-open>\.wvc-native-editor-layout/);
});
test('host OKLCH channel tokens are wrapped as CSS colors, including fixture dark mode',()=>{
  const css=fs.readFileSync(new URL('../ui/styles.css',import.meta.url),'utf8');
  for(const name of ['background','foreground','muted','muted-foreground','border','accent']){
    assert.ok(css.includes('oklch(var(--'+name+','),name);
    assert.ok(!new RegExp('--wvc-[a-z]+:\\s*var\\(--'+name+'[,)]').test(css),name);
  }
  const fixture=fs.readFileSync(new URL('./ui-fixture/index.html',import.meta.url),'utf8');
  assert.match(fixture,/:root\{--background:1 0 0/);assert.match(fixture,/:root\.dark\{--background:0\.141 0\.005 285\.823/);
});
test('shorter scene replaces a stale range anchor before the next Shift selection',async()=>{
  const f=fixture();f.snapshot.source=Array.from({length:10},(_,i)=>'Alice:line '+i+';').join('\n')+'\n';
  await f.ui.open('selection');const picks=()=>nodes(f.body).filter(n=>n.tagName==='INPUT'&&/^选择第 /.test(n.getAttribute('aria-label')||''));
  const last=picks().at(-1);last.checked=true;await last.emit('click');
  f.snapshot.source='Alice:short one;\nAlice:short two;\n';f.snapshot.path='game/scene/short.txt';f.snapshot.sceneRelativePath='short.txt';f.snapshot.revision++;f.snapshot.selection={start:0,end:15};
  f.changed();await new Promise(r=>setTimeout(r,0));
  const second=picks()[1];second.checked=true;await second.emit('click',{shiftKey:true});
  assert.equal(f.ui.state().selected.length,2);assert.equal(f.ui.state().snapshot.sceneRelativePath,'short.txt');
});

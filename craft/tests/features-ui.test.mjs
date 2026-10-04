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
  for (const file of ["navigation-metadata.js", "timeline-core.js", "filter-library.js", "navigation-model.js"]) vm.runInContext(fs.readFileSync(new URL("../../browser/" + file, import.meta.url), "utf8"), c);
  for (const name of [
    "vendor/webgal-parser-4.6.5.js",
    "script.js",
    "navigation-description.js",
    "id-completion.js",
    "authoring.js",
  ])
    vm.runInContext(
      fs.readFileSync(new URL("../features/" + name, import.meta.url), "utf8"),
      c,
    );
  if (extra.backupsModule) c.WebVideoCraftBackups = extra.backupsModule;
  if (extra.mediaModule) { c.WebVideoCraftMedia = extra.mediaModule; c.WebVideoCraftMediaUI = extra.mediaUIModule; }
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
  assert.deepEqual(Array.from(f.ui.tools(), t => t.id), ["id","expression","next","exits","filter","filterEdit","presets","hint","checks","backups","music","export","anogo","novel","characterMap","ai","updates"]);
  assert.ok(f.hostFixture.toolbar.querySelector('[data-wvc-entry="batchMenu"]'));
  assert.ok(f.hostFixture.toolbar.querySelector('[data-wvc-entry="mediaMenu"]'));
  assert.ok(f.hostFixture.toolbar.querySelector('[data-wvc-entry="settingsMenu"]'));
  assert.equal(f.hostFixture.header.querySelector('[data-wvc-entry]'), null);
  assert.equal(f.hostFixture.commandBar.querySelector('[data-wvc-entry="hint"]'), null);
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
  assert.ok(f.hostFixture.toolbar.querySelector('[data-wvc-entry="mediaMenu"]'));
  assert.equal(next.querySelector('[data-wvc-entry]'), null);
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
test("embedded selector stays in its feature and follows eligible native rows",async()=>{
  const f=fixture();f.snapshot.source='changeFigure:alice.png -id=alice -left;\nAlice:hello -figureId=alice;\nAlice:again -figureId=alice;\n';
  await f.ui.open('expression');
  assert.equal(f.find('选择范围…'),undefined);assert.equal(f.find('使用所选范围'),undefined);
  assert.equal(f.ui.tools().some(t=>t.id==='selection'),false);
  await f.find('全选当前筛选').click();
  assert.equal(f.ui.state().tool,'expression');assert.equal(f.ui.state().selected.length,2);
  const picker=nodes(f.body).find(n=>n.className==='wvc-inline-selection');
  assert.equal(picker.hidden,false);assert.equal(picker.parentNode.hidden,false);
  f.snapshot.selection={start:45,end:50};await f.find('同步当前行').click();
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
  const f=fixture();await f.ui.open('checks');const first=f.ui.state().selected[0];
  f.ui.close();f.snapshot.selection={start:30,end:40};await f.ui.open('checks');
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
  await f.ui.open('checks');const picks=()=>nodes(f.body).filter(n=>n.tagName==='INPUT'&&/^选择第 /.test(n.getAttribute('aria-label')||''));
  const last=picks().at(-1);last.checked=true;await last.emit('click');
  f.snapshot.source='Alice:short one;\nAlice:short two;\n';f.snapshot.path='game/scene/short.txt';f.snapshot.sceneRelativePath='short.txt';f.snapshot.revision++;f.snapshot.selection={start:0,end:15};
  f.changed();await new Promise(r=>setTimeout(r,0));
  const second=picks()[1];second.checked=true;await second.emit('click',{shiftKey:true});
  assert.equal(f.ui.state().selected.length,2);assert.equal(f.ui.state().snapshot.sceneRelativePath,'short.txt');
});

const field=(f,label)=>nodes(f.body).find(n=>n.tagName==='LABEL'&&n.children[0]?.textContent===label)?.children[1];
const picks=f=>nodes(f.body).filter(n=>n.dataset.wvcSelectionPick!==undefined);
test('embedded filter selection cannot include dialogue, departures or locked animations via bulk or ranges',async()=>{
  const f=fixture();f.snapshot.source='changeBg:room.png;\nchangeFigure:alice.png -id=alice;\nAlice:hello -figureId=alice;\nsetTransform:{"alpha":0.5} -target=alice;\nchangeFigure:none -id=alice;\n';
  await f.ui.open('filter');assert.equal(picks(f).length,4);assert.equal(picks(f).filter(n=>n.disabled).length,2);
  await f.find('全选当前筛选').click();assert.equal(f.ui.state().selected.length,2);
  await f.find('清空').click();field(f,'开始行').value='1';field(f,'结束行').value='5';await f.find('加入行范围').click();assert.equal(f.ui.state().selected.length,2);
  const toggle=nodes(f.body).find(n=>n.tagName==='LABEL'&&n.textContent==='允许选择动画语句').children[0];toggle.checked=true;await toggle.emit('change');
  await f.find('全选当前筛选').click();assert.equal(f.ui.state().selected.length,3);
  toggle.checked=false;await toggle.emit('change');assert.equal(f.ui.state().selected.length,2);
});
test('each feature retains its own range, including across close/reopen, while source changes invalidate all ranges',async()=>{
  const f=fixture();f.snapshot.source='changeBg:room.png;\nchangeFigure:alice.png -id=alice;\nAlice:hello -figureId=alice;\nAlice:again -figureId=alice;\n';
  await f.ui.open('filter');await f.find('全选当前筛选').click();const filterIds=f.ui.state().selected;
  await f.ui.open('expression');await f.find('全选当前筛选').click();const expressionIds=f.ui.state().selected;
  assert.equal(expressionIds.length,2);assert.notDeepEqual(filterIds,expressionIds);
  await f.ui.open('filter');assert.deepEqual(f.ui.state().selected,filterIds);f.ui.close();await f.ui.open('filter');assert.deepEqual(f.ui.state().selected,filterIds);
  f.snapshot.source+='Alice:new -figureId=alice;\n';f.snapshot.revision++;f.changed();await new Promise(r=>setTimeout(r,0));
  await f.ui.open('expression');assert.equal(f.ui.state().selected.length,0);
});
test('preset libraries and selected code load automatically; manual code stays hidden until explicitly chosen',async()=>{
  let reads=0;const library={presets:[{id:'slow',name:'缓慢推近',category:'镜头',code:'setTransform:{"scale":{"x":1.2,"y":1.2}} -target=bg-main;'}, {id:'fade',name:'渐隐',category:'透明度',code:'setTransform:{"alpha":0.5} -target=bg-main;'}],saved:[]};
  const f=fixture({service:async(path)=>{if(path==='/api/preset-effects'){reads++;return library}return {nameToId:{}}}});
  await f.ui.open('presets');assert.equal(reads,1);assert.equal(f.find('读取预设库'),undefined);assert.equal(f.find('载入所选'),undefined);
  const choice=field(f,'分类 / 搜索结果'),code=field(f,'预设代码'),name=field(f,'预设名称');
  assert.equal(choice.value,'0');assert.equal(code.value,library.presets[0].code);assert.equal(code.parentNode.hidden,true);assert.equal(name.parentNode.hidden,true);
  choice.value='1';await choice.emit('change');assert.equal(code.value,library.presets[1].code);
  await f.find('预览插入').click();assert.match(f.ui.state().pending.after,/alpha/);
  choice.value='manual';await choice.emit('change');assert.equal(f.ui.state().pending,null);assert.equal(code.parentNode.hidden,false);assert.equal(f.find('保存手动预设').hidden,false);
  code.value='setTransform:{"alpha":0.7};';name.value='手动测试';choice.value='0';await choice.emit('change');assert.equal(code.parentNode.hidden,true);
  choice.value='manual';await choice.emit('change');assert.equal(code.value,'setTransform:{"alpha":0.7};');assert.equal(name.value,'手动测试');
  const css=fs.readFileSync(new URL('../ui/styles.css',import.meta.url),'utf8');assert.match(css,/\.wvc-dock \[hidden\][^{]*\{display:none!important\}/);
});
test('preset search updates selected preset without a separate load click',async()=>{
  const f=fixture({service:async()=>({presets:[{name:'甲',category:'镜头',code:'setTransform:{"alpha":1};'},{name:'乙',category:'透明度',code:'setTransform:{"alpha":0.5};'}],saved:[]})});
  await f.ui.open('presets');const search=field(f,'搜索预设');search.value='乙';await search.emit('input');
  assert.equal(field(f,'分类 / 搜索结果').value,'1');assert.equal(field(f,'预设代码').value,'setTransform:{"alpha":0.5};');
});
test('batch filter libraries load on open with per-target pickers and manual-only code',async()=>{
  let reads=0;const f=fixture({service:async()=>{reads++;return {presets:[{id:'fade',name:'淡化',effects:[{alpha:0.5}],appliesTo:'both'}],saved:[]}}});
  await f.ui.open('filter');assert.equal(reads,1);assert.equal(f.find('读取库'),undefined);assert.equal(f.find('填入背景'),undefined);
  assert.equal(field(f,'背景滤镜代码').parentNode.hidden,true);const choice=field(f,'背景滤镜');choice.value='manual';await choice.emit('change');assert.equal(field(f,'背景滤镜代码').parentNode.hidden,false);
  choice.value='0';await choice.emit('change');assert.equal(field(f,'背景滤镜代码').parentNode.hidden,true);
});

test('filter controls collapse as intrinsic rows with a single hidden manual wrapper',async()=>{
 const f=fixture();await f.ui.open('filter');
 const wrappers=nodes(f.body).filter(n=>n.className==='wvc-filter-picker');assert.equal(wrappers.length,2);
 for(const wrapper of wrappers){assert.equal(wrapper.children.length,2);assert.equal(wrapper.children[0].hidden,false);assert.equal(wrapper.children[1].className,'wvc-filter-manual');assert.equal(wrapper.children[1].hidden,true);assert.equal(wrapper.children[1].children.length,3);}
 const choice=field(f,'背景滤镜');choice.value='manual';await choice.emit('change');assert.equal(wrappers[0].children[1].hidden,false);assert.equal(wrappers[1].children[1].hidden,true);
 choice.value='none';await choice.emit('change');assert.equal(wrappers[0].children[1].hidden,true);
 const css=fs.readFileSync(new URL('../ui/styles.css',import.meta.url),'utf8');assert.match(css,/\.wvc-filter-picker\s*\{[^}]*display:grid;[^}]*grid-auto-rows:max-content/);assert.match(css,/\.wvc-filter-picker>\.wvc-field\s*\{[^}]*flex:none/);assert.match(css,/\.wvc-filter-manual\[hidden\][^{]*\{display:none!important\}/);
});
test('all embedded timeline tools omit navigation buttons but preserve line preview',async()=>{
 const previews=[],f=fixture({navigate:async()=>{throw Error('navigation must never be called')},preview:async line=>previews.push(line)});
 f.snapshot.source='changeBg:room.png;\nchangeFigure:alice.png -id=alice;\nAlice:hello -figureId=alice;\n';
 for(const tool of ['filter','next','expression','exits','presets','checks']){await f.ui.open(tool);assert.equal(f.find('定位'),undefined);}
 await f.ui.open('filter');await f.find('预览').click();assert.equal(previews.at(-1),1);
 const source=fs.readFileSync(new URL('../ui/main.js',import.meta.url),'utf8');assert.doesNotMatch(source,/bridge\.navigate\(/);
});
test('raw statement details start collapsed and cannot enlarge the main timeline title',async()=>{
 const f=fixture();await f.ui.open('filter');const details=nodes(f.body).filter(n=>n.className==='wvc-row-details');assert.ok(details.length);assert.ok(details.every(n=>n.open===false));
 assert.ok(details.every(n=>n.children.some(c=>c.tagName==='PRE')));
 const css=fs.readFileSync(new URL('../ui/styles.css',import.meta.url),'utf8');assert.match(css,/\.wvc-row-text\s*\{[^}]*-webkit-line-clamp:2/);assert.match(css,/\.wvc-row-summary\s*\{[^}]*-webkit-line-clamp:1/);
});
test('hint cancel is hidden during unrelated busy actions and shown only for the active timed preview',async()=>{
 let releaseLibrary,finishPreview;
 const f=fixture({capabilities:()=>({snapshot:true,service:true,commit:true,previewHint:true}),service:()=>new Promise(resolve=>releaseLibrary=resolve),previewHint:()=>new Promise(resolve=>finishPreview=resolve)});
 const opening=f.ui.open('presets');for(let i=0;i<15;i++)await Promise.resolve();assert.equal(f.ui.state().busy,true);assert.equal(f.find('取消提示计时').hidden,true);releaseLibrary({presets:[],saved:[]});await opening;
 f.snapshot.source='choose:提示:__wvp_hint_a -wvpHint=1800 -defaultChoose=1;\nlabel:__wvp_hint_a;\n';f.snapshot.revision++;
 await f.ui.open('hint');const preview=f.find('计时预览').click();for(let i=0;i<10;i++)await Promise.resolve();assert.equal(f.find('取消提示计时').hidden,false);finishPreview({state:'completed'});await preview;assert.equal(f.find('取消提示计时').hidden,true);
});
test('screenshot filter appears as the shared named Chinese summary while multiline source stays in collapsed details',async()=>{
 const previews=[],effects={brightness:0.7,contrast:0.8,saturation:0.7,gamma:0.5,colorRed:255,colorGreen:234,colorBlue:214,bloom:1,bloomBrightness:0.7,bloomBlur:10};
 const f=fixture({preview:async line=>previews.push(line),service:async()=>({presets:[{id:'dawn',name:'清晨／黄昏（轻） · 背景',appliesTo:'background',effects:[effects]}],saved:[]})});
 f.snapshot.source='changeBg:交通/车站1（白天）.png -next;\nsetTransform:'+JSON.stringify(effects)+'\n -target=bg-main;\n';
 await f.ui.open('filter');
 const rows=nodes(f.body).filter(n=>n.className==='wvc-row');assert.equal(rows.length,2);
 const copies=rows.map(row=>row.children.find(n=>n.className==='wvc-row-copy'));
 assert.match(copies[0].textContent,/切换背景 · 车站1（白天）.png/);assert.match(copies[1].textContent,/滤镜：清晨／黄昏（轻） · 背景/);assert.doesNotMatch(copies[1].textContent,/brightness|contrast|colorRed/);
 assert.equal(rows[1].children.find(n=>n.className==='wvc-row-details').open,false);
 const preview=rows[1].children.find(n=>n.tagName==='BUTTON'&&n.textContent==='预览');await preview.click();assert.equal(previews.at(-1),2);
 const query=field(f,'搜索文本或说话人');query.value='brightness';await query.emit('input');assert.equal(picks(f).length,1);assert.equal(picks(f)[0].disabled,true);
});
test('music dirty leave guard protects tool switching and closing, and non-media tools deactivate music',async()=>{
 const views=[];let allow=false;
 const f=fixture({mediaModule:{createController:()=>({cancel:async()=>{}})},mediaUIModule:{mount:()=>({show:view=>views.push(view),canLeave:()=>allow,dispose(){}})}});
 await f.ui.open('music');assert.equal(f.ui.state().tool,'music');assert.equal(views.at(-1),'music');
 assert.equal(await f.ui.open('filter'),false);assert.equal(f.ui.state().tool,'music');assert.equal(views.at(-1),'music');
 f.ui.close();assert.equal(f.ui.state().open,true);
 allow=true;await f.ui.open('filter');assert.equal(f.ui.state().tool,'filter');assert.equal(views.at(-1),null);
 await f.ui.open('music');f.ui.close();assert.equal(f.ui.state().open,false);assert.equal(views.at(-1),null);
 assert.equal(f.ui.tools().some(tool=>tool.id==='timing'),false);
});

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
test('late scene reads and errors cannot replace newer source or discard its reviewed preview', async () => {
  const f = fixture(); await f.ui.open('id'); await flush();
  const old = deferred(), latest = deferred(); let reads = 0;
  const original = { ...f.snapshot };
  f.bridge.snapshot = () => (++reads === 1 ? old.promise : reads === 2 ? latest.promise : Promise.resolve({ ...f.snapshot }));
  f.changed(); f.snapshot.source += '; newest scene edit\n'; f.snapshot.revision++;
  f.changed(); latest.resolve({ ...f.snapshot }); await flush();
  old.resolve(original); await flush();
  assert.equal(f.ui.state().snapshot.revision, f.snapshot.revision);
  const staleError = deferred(); reads = 0;
  f.bridge.snapshot = () => ++reads === 1 ? staleError.promise : Promise.resolve({ ...f.snapshot });
  f.changed(); f.changed(); await flush();
  await f.find('预览全场补全').click(); assert.ok(f.ui.state().pending);
  staleError.reject(Error('old scene unavailable')); await flush();
  assert.ok(f.ui.state().pending); assert.equal(f.find('应用到编辑缓冲区').disabled, false);
  await f.ui.dispose();
});
test('a read started before close cannot replace the reopened scene', async () => {
  const f = fixture(); await f.ui.open('expression'); await flush();
  const old = deferred(), previous = { ...f.snapshot }; let reads = 0;
  f.bridge.snapshot = () => ++reads === 1 ? old.promise : Promise.resolve({ ...f.snapshot });
  f.changed(); f.ui.close();
  f.snapshot.path = 'game/scene/b.txt'; f.snapshot.sceneRelativePath = 'b.txt'; f.snapshot.revision++;
  await f.ui.open('expression'); old.resolve(previous); await flush();
  assert.equal(f.ui.state().snapshot.path, 'game/scene/b.txt');
  await f.ui.dispose();
});
test('disposing during tool opening never activates a disposed media panel or restores source state', async () => {
  const read = deferred(), views = []; let disposed = false;
  const f = fixture({ snapshot: () => read.promise, mediaModule: { createController: () => ({ cancel: async () => {} }) }, mediaUIModule: { mount: () => ({ show: view => views.push({ view, disposed }), dispose() { disposed = true; } }) } });
  const opening = f.ui.open('music'); await flush(); await f.ui.dispose();
  read.resolve({ ...f.snapshot });
  assert.equal(await opening, false); assert.equal(f.ui.state().open, false);
  assert.equal(f.ui.state().snapshot, null); assert.deepEqual(views, []);
  assert.equal(nodes(f.body).some(n => n.className === 'wvc-dock'), false);
});
test('runtime rebinding invalidates a staged plan even if source and revision are identical', async () => {
  const f = fixture(); f.snapshot.projectPath = 'C:/one'; f.snapshot.engineId = 'official465'; f.snapshot.runtimeBindingSignature = 'official465:one';
  await f.ui.open('id'); await f.find('预览全场补全').click(); assert.ok(f.ui.state().pending);
  f.snapshot.engineId = 'mygo321'; f.snapshot.runtimeBindingSignature = 'mygo321:two'; f.changed(); await flush();
  assert.equal(f.ui.state().pending, null); assert.equal(f.ui.state().snapshot.engineId, 'mygo321');
  await f.find('预览全场补全').click(); f.snapshot.projectPath = 'D:/same-id'; f.changed(); await flush();
  assert.equal(f.ui.state().pending, null); assert.equal(f.ui.state().snapshot.projectPath, 'D:/same-id'); await f.ui.dispose();
});
test('menu and repeated tool opens return focus to the surviving native launcher', async () => {
  const f = fixture(), trigger = f.hostFixture.toolbar.querySelector('[data-wvc-entry="batchMenu"]');
  trigger.focus(); await trigger.click(); const item = f.body.querySelector('[data-wvc-tool="expression"]');
  item.focus(); await item.click(); await flush(); f.ui.close();
  assert.equal(f.hostFixture.document.activeElement === trigger, true);
  await f.ui.open('expression'); await f.ui.open('next'); f.ui.close();
  assert.equal(f.hostFixture.document.activeElement === trigger, true);
  await f.ui.dispose();
});

test('parking a missing editor stops only music presentation and does not prompt or discard', async () => {
  const views = []; let guards = 0;
  const f = fixture({ mediaModule: { createController: () => ({ cancel: async () => {} }) }, mediaUIModule: { mount: () => ({ show: view => views.push(view), canLeave() { guards++; return false; }, dispose() {} }) } });
  await f.ui.open('music'); const area = f.hostFixture.editorArea, parent = area.parentElement;
  area.remove(); assert.equal(f.ui.remount(), false); assert.equal(f.ui.state().open, false);
  assert.equal(views.at(-1), null); assert.equal(guards, 0);
  parent.append(area); assert.equal(f.ui.remount(), true); assert.equal(f.ui.state().open, false);
  await f.ui.open('music'); assert.equal(views.at(-1), 'music'); assert.equal(guards, 0); await f.ui.dispose();
});
test('native anchor loss during tool opening cancels only its presentation continuation', async () => {
  const read = deferred(), views = []; let requested = false;
  const f = fixture({ mediaModule: { createController: () => ({ cancel: async () => {} }) }, mediaUIModule: { mount: () => ({ show: view => views.push(view), dispose() {} }) } });
  f.bridge.snapshot = () => { requested = true; return read.promise; };
  const opening = f.ui.open('music'); await flush(); assert.equal(requested, true);
  f.hostFixture.editorArea.remove(); assert.equal(f.ui.remount(), false); read.resolve({ ...f.snapshot });
  assert.equal(await opening, false); assert.equal(f.ui.state().open, false); assert.deepEqual(views, [null]);
  await f.ui.dispose();
});
test('closing after a native toolbar remount restores focus to its replacement launcher', async () => {
  const f = fixture(), trigger = f.hostFixture.toolbar.querySelector('[data-wvc-entry="batchMenu"]');
  await trigger.click(); await f.body.querySelector('[data-wvc-tool="expression"]').click();
  const old = f.hostFixture.header, next = new Node('header'); next.append(new Node('div'), new Node('div')); old.remove(); f.hostFixture.app.append(next);
  assert.equal(f.ui.remount(), true); f.ui.close();
  const replacement = f.hostFixture.toolbar.querySelector('[data-wvc-entry="batchMenu"]');
  assert.notEqual(replacement === trigger, true); assert.equal(f.hostFixture.document.activeElement === replacement, true);
  await f.ui.dispose();
});

test('own Craft update UI separates discovery, verified download and explicit installer opening',async()=>{
  const f=fixture(), calls=[];
  f.c.WebVideoCraftOwnUpdates={
    check:async()=>{calls.push('check');return{version:'1.1.9.0c',currentVersion:'1.1.8.0c',size:1048576}},
    download:async()=>{calls.push('download');return{sha256:'a'.repeat(64)}},
    install:async()=>{calls.push('install');return{opened:true,installed:false}},
    reveal:async()=>{calls.push('reveal');return{revealed:true}},
  };
  await f.ui.open('updates');assert.equal(calls.length,0,'opening settings must not download or install');
  await f.find('检查 WebVideo+ Craft 更新').click();assert.deepEqual(calls,['check']);assert.match(f.body.textContent,/1\.1\.9\.0c/);
  await f.find('下载并校验安装器').click();assert.deepEqual(calls,['check','download']);assert.match(f.body.textContent,/尚未运行或安装/);
  await f.find('打开已校验安装器').click();assert.deepEqual(calls,['check','download','install']);assert.match(f.body.textContent,/安装器已打开，尚未完成安装/);assert.match(f.body.textContent,/正常关闭 Craft/);
  assert.equal(f.ui.state().busy,false);f.ui.close();assert.equal(f.ui.state().open,false);
});
test('update UI download blocks repeat clicks and Close until completion then permits retry after error',async()=>{
  const f=fixture();let fail,downloads=0;
  f.c.WebVideoCraftOwnUpdates={download:()=>{downloads++;return new Promise((resolve,reject)=>{fail=reject})}};
  await f.ui.open('updates');const pending=f.find('下载并校验安装器').click();
  await f.find('下载并校验安装器').click();f.ui.close();assert.equal(downloads,1);assert.equal(f.ui.state().open,true);
  fail(Error('network interrupted'));await pending;assert.equal(f.ui.state().busy,false);assert.match(f.body.textContent,/下载失败：network interrupted/);
  f.c.WebVideoCraftOwnUpdates.download=async()=>({sha256:'b'.repeat(64)});await f.find('下载并校验安装器').click();assert.match(f.body.textContent,/安装器已通过 SHA-256 校验/);
});

test('official install capability follows verified backend status and stays closed on unknown status',async()=>{
 const f=fixture();let installs=0;
 f.c.WebVideoCraftUpdates={status:async()=>({enabled:false}),install:async()=>{installs++}};
 await f.ui.open('updates');assert.equal(f.find('协调安装已下载更新').disabled,true);
 f.c.WebVideoCraftUpdates.status=async()=>({enabled:true,mode:'signed-clean-environment'});
 await f.find('检查官方更新恢复状态').click();assert.equal(f.find('协调安装已下载更新').disabled,false);
 await f.find('协调安装已下载更新').click();assert.equal(installs,1);
 f.c.WebVideoCraftUpdates.status=async()=>({});await f.find('检查官方更新恢复状态').click();assert.equal(f.find('协调安装已下载更新').disabled,true);f.ui.dispose();
});

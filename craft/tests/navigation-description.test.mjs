import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const files = [
  "craft/features/vendor/webgal-parser-4.6.5.js",
  "craft/features/script.js",
  "browser/navigation-metadata.js",
  "browser/timeline-core.js",
  "browser/filter-library.js",
  "browser/navigation-model.js",
  "craft/features/navigation-description.js",
  "craft/features/id-completion.js",
  "craft/features/authoring.js",
];
function setup() {
  const context = vm.createContext({ console, URL });
  context.window = context;
  context.fetch = () => { throw Error("Descriptions must not fetch resources"); };
  for (const file of files)
    vm.runInContext(fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8"), context);
  return context;
}
const capabilities = {
  multilineStatements: true,
  changeFigureDiff: true,
  transformFrom: true,
  sceneSemantics: true,
};
const snapshot = source => ({ projectId: "p", path: "game/scene/start.txt", source, revision: 4, runtimeCapabilities: capabilities });
function describe(context, source, caps = capabilities) {
  const model = context.WebVideoCraftScript.parse(source, { path: "game/scene/start.txt", capabilities: caps });
  return { model, descriptions: context.WebVideoCraftNavigation.describe(model) };
}
const plain = value => JSON.parse(JSON.stringify(value));

test("screenshot filter reuses the exact Terre factory name and readable background", () => {
  const context = setup();
  const effects = { brightness: 0.7, contrast: 0.8, saturation: 0.7, gamma: 0.5, colorRed: 255, colorGreen: 234, colorBlue: 214, bloom: 1, bloomBrightness: 0.7, bloomBlur: 10 };
  const { model, descriptions } = describe(context, 'changeBg:交通/车站1（白天）.png -next;\nsetTransform:' + JSON.stringify(effects) + ' -target=bg-main;\n');
  const background = descriptions.get(model.statements[0].id);
  const filter = descriptions.get(model.statements[1].id);
  assert.equal(background.title, "切换背景 · 车站1（白天）.png");
  assert.equal(filter.title, "滤镜：清晨／黄昏（轻） · 背景");
  assert.doesNotMatch(filter.title + filter.summary, /brightness=|contrast=|colorRed=/);
  assert.match(filter.details, /默认 · 500/);
  assert.match(filter.searchText, /brightness/);
});

test("custom transforms reuse Chinese field/category labels, compact summaries and full details", () => {
  const context = setup();
  const source = 'setTransform:{"position":{"x":20,"y":30},"scale":{"x":1.2},"brightness":0.73,"contrast":0.81,"saturation":0.63,"bloom":0.9} -target=fig-left -duration=750 -ease=easeInOutSine;\n';
  const { model, descriptions } = describe(context, source);
  const entry = descriptions.get(model.statements[0].id);
  assert.equal(entry.title, "单段动画");
  assert.match(entry.summary, /左侧人物/);
  assert.match(entry.summary, /变换/);
  assert.match(entry.summary, /X轴位移：20/);
  assert.match(entry.summary, /另 4 项/);
  assert.match(entry.details, /亮度：0.73/);
  assert.match(entry.details, /对比度：0.81/);
  assert.match(entry.details, /饱和度：0.63/);
  assert.ok(entry.title.length <= 100);
  assert.ok(entry.summary.length <= 160);
  assert.equal(entry.descriptionParts[0].title, "变换");
  assert.equal(model.statements[0].source, source);
});

test("each Craft ID, exact source span and capability-resolved command remain authoritative", () => {
  const context = setup();
  const source = '\uFEFFchangeFigure:figures/a.png\r\n  -id=a -left -next; trailing\r\nsetTransform:{"alpha":0.6}\r\n  -target=a -duration=220;\r\nAlice:hello \\; world -figureId=a -id;\r\n';
  const model = context.WebVideoCraftScript.parse(source, { path: "game/scene/start.txt", capabilities });
  const before = JSON.stringify(model);
  const first = context.WebVideoCraftNavigation.describe(model);
  const second = context.WebVideoCraftNavigation.describe(model);
  assert.equal(JSON.stringify(model), before);
  assert.deepEqual(Array.from(first.keys()), Array.from(model.statements, row => row.id));
  assert.deepEqual(plain([...first]), plain([...second]));
  assert.equal(model.statements[0].startOffset, 0);
  assert.equal(model.statements[0].endLine, 2);
  assert.equal(model.statements[1].endLine, 4);
  for (const row of model.statements) {
    assert.equal(source.slice(row.startOffset, row.endOffset), row.source);
    for (const key of ["id", "command", "args", "source", "startLine", "endLine", "startOffset", "endOffset", "groupId", "kind", "eligible"])
      assert.equal(Object.hasOwn(first.get(row.id), key), false, key + " must not replace Craft data");
  }
  const old = describe(context, 'changeFigureDiff:smile.png -id=a;\n', { ...capabilities, changeFigureDiff: false });
  assert.equal(old.model.statements[0].command, "say");
  assert.ok(old.model.statements[0].unsupported.includes("changeFigureDiff"));
});

test("labels track unchanged Terre metadata and the existing character-map contract", () => {
  const context = setup();
  context.WebVideoNavigationMetadata.fields.brightness.label = "共享亮度标注";
  context.WebVideoCharacterMap = { names: () => ({ actor: "小明" }) };
  const { model, descriptions } = describe(context, 'changeFigure:characters/model/avatar.json -id=actor;\nsetTransform:{"brightness":0.1234} -target=actor;\n');
  assert.equal(descriptions.get(model.statements[0].id).title, "人物登场 · 小明 · avatar.json");
  const effect = descriptions.get(model.statements[1].id);
  assert.match(effect.summary, /小明/);
  assert.match(effect.details, /共享亮度标注：0.1234/);
});

test("embedded filters keep background action and media as the primary title", () => {
  const context = setup();
  const preset = context.WebVideoNavigationMetadata.filterPresets.find(item => item.appliesTo === "background");
  const { model, descriptions } = describe(context, 'changeBg:rooms/day.png -transform=' + JSON.stringify(preset.effects[0]) + ';\n');
  const entry = descriptions.get(model.statements[0].id);
  assert.equal(entry.title, "切换背景 · day.png");
  assert.ok(entry.descriptionParts.some(part => part.filterName === preset.name));
  assert.match(entry.details, new RegExp(preset.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("malformed JSON stays readable, missing targets do not acquire one, unknown commands are not renamed", () => {
  const context = setup();
  const { model, descriptions } = describe(context, 'setTransform:bad -target=bg-main;\nsetTransform:{"alpha":0.5};\nwait:150;\nchangeFigureDiff:smile.png -id=a;\n');
  assert.match(descriptions.get(model.statements[0].id).details, /参数无法解析/);
  assert.equal(model.statements[1].args.target, undefined);
  assert.match(descriptions.get(model.statements[1].id).details, /目标：未填写/);
  assert.equal(descriptions.get(model.statements[2].id).title, "等待 · 150 毫秒");
  assert.match(descriptions.get(model.statements[3].id).title, /人物登场/);
});

test("conditional and user-forward statements remain described without affecting following state", () => {
  const context = setup();
  const { model, descriptions } = describe(context, 'changeBg:room.png -when=flag;\nsetTransform:{"brightness":0.3} -target=bg-main -when=flag;\nsetTransform:{"brightness":0.3} -target=bg-main -userForward;\nsetTransform:{"brightness":0.3} -target=bg-main;\n');
  assert.equal(descriptions.size, 4);
  assert.equal(descriptions.get(model.statements[0].id).title, "切换背景 · room.png");
  for (const row of model.statements.slice(1))
    assert.match(descriptions.get(row.id).details, /亮度：0.3/);
  assert.equal(model.statements[1].args.when, "flag");
  assert.equal(model.statements[2].args.userForward, true);
});

test("all five actual animation commands keep opt-in eligibility despite readable filter-like titles", () => {
  const context = setup();
  const source = 'changeBg:room.png;\nchangeFigure:a.png -id=a;\nsetAnimation:fade -target=a;\nsetComplexAnimation:universalSoftIn -target=a;\nsetTransform:{"brightness":0.5} -target=a;\nsetTempAnimation:[{"alpha":0.2,"duration":120}] -target=a;\nsetTransition: -target=a -enter=fade;\nchangeFigure:none -id=a;\nsetTransform:{"alpha":0.5};\n';
  const { model, descriptions } = describe(context, source);
  const features = context.WebVideoCraftFeatures;
  const before = features.selectionRows(snapshot(source), "filter");
  const presented = before.map(row => ({ ...row, ...descriptions.get(row.id) }));
  assert.deepEqual(Array.from(presented, row => row.eligible), [true, true, false, false, false, false, false, false, false]);
  assert.deepEqual(Array.from(features.selectionRows(snapshot(source), "filter", { allowAnimations: true }), row => row.eligible), [true, true, true, true, true, true, true, false, false]);
  assert.deepEqual(Array.from(presented, row => row.command), Array.from(before, row => row.command));
  for (const row of model.statements.filter(row => row.command.startsWith("set")))
    assert.ok(descriptions.get(row.id).title.length > 0);
});

test("saved filters use the shared matcher while identifiers, target and duration remain searchable", () => {
  const context = setup();
  context.WebVideoFilterLibrary.accept({ presets: [], saved: [{ name: "我的柔光", appliesTo: "figure", effects: [{ brightness: 0.314 }] }] });
  const { model, descriptions } = describe(context, 'setTransform:{"brightness":0.314} -target=custom-actor -duration=200;\n');
  const entry = descriptions.get(model.statements[0].id);
  assert.equal(entry.title, "滤镜：我的柔光");
  assert.match(entry.summary, /custom-actor/);
  assert.match(entry.details, /200/);
  assert.match(entry.searchText, /setTransform/);
});

test("huge multiline animations and paths do not expand the main row or lose full detail", () => {
  const context = setup();
  const frames = Array.from({ length: 90 }, (_, index) => ({ position: { x: index + 1 }, duration: 50 }));
  const source = 'changeFigure:folder/' + "长".repeat(180) + '.png -id=a;\nsetTempAnimation:' + JSON.stringify(frames) + '\n -target=a;\n';
  const { model, descriptions } = describe(context, source);
  for (const row of model.statements) {
    const entry = descriptions.get(row.id);
    assert.ok(Array.from(entry.title).length <= 100);
    assert.ok(Array.from(entry.summary).length <= 160);
    assert.ok(entry.searchText.includes(row.source.replace(/\s+/g, " ").trim()));
  }
  const animation = descriptions.get(model.statements[1].id);
  assert.match(animation.details, /第九十帧/);
  assert.match(animation.details, /X轴位移：90/);
  assert.equal(model.statements[1].endLine, 3);
});

test("state-aware changes and multi-frame display parts never split original statement identities", () => {
  const context = setup();
  const source = 'changeBg:room.png -next;\nsetTransform:{"brightness":0.234,"contrast":0.56} -target=bg-main -next;\nsetTransform:{"brightness":0.234,"contrast":0.78} -target=bg-main;\nsetTempAnimation:[{"position":{"x":1},"duration":100},{"position":{"x":2},"duration":100}] -target=bg-main;\n';
  const { model, descriptions } = describe(context, source);
  assert.equal(descriptions.size, model.statements.length);
  const repeated = descriptions.get(model.statements[2].id);
  assert.match(repeated.details, /对比度：0.78/);
  assert.doesNotMatch(repeated.details, /亮度：0.234/);
  const animation = descriptions.get(model.statements[3].id);
  assert.ok(animation.descriptionParts.length > 1);
  assert.match(animation.details, /第一帧/);
  assert.match(animation.details, /第二帧/);
  assert.equal(model.statements[3].command, "setTempAnimation");
});

test("adapter leaves shared Terre globals and navigation results unchanged", () => {
  const context = setup();
  const source = 'changeFigure:a.png -id=ksm -next;\nsetTransform:{"alpha":0.456} -target=ksm;\n';
  const model = context.WebVideoCraftScript.parse(source, { capabilities });
  const parsed = { sentenceList: model.statements.map(row => ({ ...row.parsed, command: row.command })) };
  const types = Object.fromEntries(model.statements.map(row => [row.command, row.command]));
  const shared = context.WebVideoNavigation;
  const core = context.WebVideoTimelineCore;
  const metadata = context.WebVideoNavigationMetadata;
  const library = context.WebVideoFilterLibrary;
  const before = plain(shared.derive(model.path, source, parsed, types));
  context.WebVideoCraftNavigation.describe(model);
  assert.deepEqual(plain(shared.derive(model.path, source, parsed, types)), before);
  assert.equal(context.WebVideoNavigation, shared);
  assert.equal(context.WebVideoTimelineCore, core);
  assert.equal(context.WebVideoNavigationMetadata, metadata);
  assert.equal(context.WebVideoFilterLibrary, library);
});

test("invalid effect shapes are flagged without evaluating or rewriting them", () => {
  const context = setup();
  const source = 'setTransform:[] -target=bg-main;\nsetTempAnimation:{} -target=bg-main;\nsetTempAnimation:[null] -target=bg-main;\nsetTransform:null -target=bg-main;\n';
  const { model, descriptions } = describe(context, source);
  for (const row of model.statements) {
    assert.match(descriptions.get(row.id).title, /需修正/);
    assert.match(descriptions.get(row.id).details, /参数无法解析/);
    assert.equal(source.slice(row.startOffset, row.endOffset), row.source);
  }
});

test('Craft image differences update projected state without fabricating entrances or resetting transforms',()=>{
 const context=setup(),source='changeFigure:base.png -id=a -left;\nsetTransform:{"alpha":0.7} -target=a;\nchangeFigureDiff:smile.png -id=a -clear -right -transform={"alpha":0.1};\nchangeFigure:smile.png -id=a -left;\nsetTransform:{"alpha":0.7} -target=a;\n';
 const {model,descriptions}=describe(context,source),before=JSON.stringify(model);
 const diff=descriptions.get(model.statements[2].id),same=descriptions.get(model.statements[3].id),effect=descriptions.get(model.statements[4].id);
 assert.match(diff.title,/立绘差分/);assert.match(diff.title,/smile\.png/);assert.match(diff.details,/保留位置、变换/);assert.match(same.title,/立绘调整/);assert.doesNotMatch(same.title,/登场/);assert.doesNotMatch(effect.details,/透明度：0\.7/);assert.equal(JSON.stringify(model),before);
});
test('no-source difference fallback seeds subsequent state and model differences leave it unchanged',()=>{
 const context=setup(),source='changeFigureDiff:smile.png -id=a;\nchangeFigure:smile.png -id=a;\nchangeFigure:model.model3.json -id=m;\nchangeFigureDiff:other.png -id=m;\nchangeFigure:model.model3.json -id=m;\nchangeFigureDiff:none -id=a;\nchangeFigure:smile.png -id=a;\n';
 const {model,descriptions}=describe(context,source),at=n=>descriptions.get(model.statements[n].id);
 assert.match(at(0).title,/人物登场/);assert.match(at(1).title,/立绘调整/);assert.match(at(3).title,/模型不适用/);assert.match(at(4).title,/立绘调整/);assert.match(at(5).title,/人物离场/);assert.match(at(6).title,/人物登场/);
});
test('known technical commands have verified Chinese labels and unknown identifiers are unchanged',()=>{
 const context=setup(),{model,descriptions}=describe(context,'bgm:music/day.ogg;\nwait:800;\nlabel:next;\n');
 assert.equal(descriptions.get(model.statements[0].id).title,'背景音乐 · day.ogg');assert.equal(descriptions.get(model.statements[1].id).title,'等待 · 800 毫秒');assert.equal(descriptions.get(model.statements[2].id).title,'标签');
 const custom={...model,statements:[{...model.statements[2],command:'customShader',commandRaw:'customShader',content:'blob'}]};
 assert.equal(context.WebVideoCraftNavigation.describe(custom).get(custom.statements[0].id).title,'customShader');
});

test('description diff guard matches runtime for WMDL, unknown model suffixes and decoded Spine queries',()=>{
 for(const file of ['hero.wmdl','unknown.custom']) for(const empty of ['none','']){
  const c=setup(),{model,descriptions}=describe(c,`changeFigure:${file} -id=a -motion=idle;\nchangeFigureDiff:${empty} -id=a;\nchangeFigure:${file} -id=a;\n`);
  assert.match(descriptions.get(model.statements[1].id).title,/模型不适用/);assert.match(descriptions.get(model.statements[2].id).title,/立绘调整/);
 }
 for(const query of ['type=spine','type=%73pine','type=spine#skin','type=spine&type=image'])for(const [before,after] of [[`a.png?${query}`,'b.png'],['a.png',`b.png?${query}`]]){
  const c=setup(),{model,descriptions}=describe(c,`changeFigure:${before} -id=a;\nchangeFigureDiff:${after} -id=a;\nchangeFigure:${before} -id=a;\n`);
  assert.match(descriptions.get(model.statements[1].id).title,/模型不适用/);assert.match(descriptions.get(model.statements[2].id).title,/立绘调整/);
 }
});

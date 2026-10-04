import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const context = vm.createContext({ console, URL });
context.window = context;
for (const file of ["navigation-metadata.js", "timeline-core.js", "filter-library.js", "navigation-model.js"]) vm.runInContext(fs.readFileSync(new URL("../../browser/" + file, import.meta.url), "utf8"), context);
for (const file of [
  "vendor/webgal-parser-4.6.5.js",
  "script.js",
  "navigation-description.js",
  "id-completion.js",
  "authoring.js",
])
  vm.runInContext(
    fs.readFileSync(new URL("../features/" + file, import.meta.url), "utf8"),
    context,
  );
const S = context.WebVideoCraftScript,
  F = context.WebVideoCraftFeatures;
const caps = {
  multilineStatements: true,
  changeFigureDiff: true,
  transformFrom: true,
  sceneSemantics: true,
};
const snap = (source) => ({
  projectId: "p",
  path: "game/scene/a.txt",
  source,
  revision: 7,
  runtimeCapabilities: caps,
});
const rows = (source) => S.parse(source, { capabilities: caps }).statements;
const ids = (source, command) =>
  new Set(
    rows(source)
      .filter((r) => r.command === command)
      .map((r) => r.id),
  );
const chars = { nameToId: { alice: "alice", bob: "bob" } };
test("official parser preserves multiline CRLF BOM offsets and inline comment", () => {
  const source =
    "\uFEFFchangeFigure:alice.png\r\n  -id=old -left; comment\r\nAlice:hello \\; world;\r\n";
  const model = S.parse(source, { capabilities: caps });
  assert.equal(model.rows[0].endLine, 2);
  assert.equal(model.rows[1].content, "hello ; world");
  const changed = S.write(model.rows[0], { args: { id: "alice" } });
  assert.equal(
    changed,
    "\uFEFFchangeFigure:alice.png\r\n  -id=alice -left; comment\r\n",
  );
});
test("parameter edit preserves unknown args and transformFrom", () => {
  const r = rows(
    'setTransform:{"alpha":1} -transformFrom=default -custom=stay -duration=30; tail\n',
  )[0];
  assert.equal(
    S.write(r, { content: '{"alpha":0.5}' }),
    'setTransform:{"alpha":0.5} -transformFrom=default -custom=stay -duration=30; tail\n',
  );
});
test("unsupported capabilities fail before changing source", () => {
  const s = snap("changeFigure:alice.png\n  -left;\n");
  s.runtimeCapabilities = { multilineStatements: false };
  assert.throws(() => F.idCompletion(s, {}, chars));
  const d = snap("changeFigureDiff:smile.png -id=alice;");
  d.runtimeCapabilities = { changeFigureDiff: false };
  assert.throws(() => F.autoExit(d), /changeFigureDiff/);
});
test("ID completion handles paths, dialogue and forward same-next effects", () => {
  const source =
    'setTransform:{"alpha":1} -target=fig-left -next;\nchangeFigure:alice.png -left -next;\nAlice:hi;\n';
  const p = F.idCompletion(snap(source), {}, chars);
  const after = rows(p.after);
  assert.equal(after[0].args.target, "alice");
  assert.equal(after[1].args.id, "alice");
  assert.equal(after[2].args.figureId, "alice");
  assert.equal(after[2].args.id, true);
});
test("ID completion preserves existing IDs and warns on absent speaker", () => {
  const source =
    "changeFigure:alice.png -id=keep;\nAlice:hi -figureId=keep -id;\nBob:offscreen;\n";
  const p = F.idCompletion(snap(source), {}, chars);
  assert.equal(p.after, source);
  assert.ok(p.warnings.some((w) => w.includes("不在场")));
});
test("ID overwrite remaps effects and existing difference target", () => {
  const source =
    'changeFigure:alice.png -id=old;\nchangeFigureDiff:smile.png -id=old;\nsetTransform:{"alpha":1} -target=old;\n';
  const p = F.idCompletion(snap(source), { overwrite: true }, chars);
  const after = rows(p.after);
  assert.equal(
    after.find((r) => r.command === "changeFigureDiff").args.id,
    "alice",
  );
  assert.equal(
    after.find((r) => r.command === "setTransform").args.target,
    "alice",
  );
});
test("ID mapping rejects control injection", () =>
  assert.throws(
    () =>
      F.idCompletion(
        snap("changeFigure:alice.png;"),
        {},
        { nameToId: { alice: "bad -next" } },
      ),
    /ID/,
  ));
test("expression plan resolves positional dialogue and preserves multiline template", () => {
  const source =
    "changeFigure:alice.png\n  -id=alice -left;\nAlice:hi -left;\n";
  const p = F.expressionPreparation(snap(source));
  const after = rows(p.after);
  assert.equal(p.stats.inserted, 1);
  assert.equal(after[1].command, "changeFigure");
  assert.equal(after[1].args.next, true);
  assert.equal(after[2].args.figureId, "alice");
  assert.ok(!after[2].args.left);
});
test("expression ignores narration and already prepared by default", () => {
  const source =
    "changeFigure:alice.png -id=alice -next;\nAlice:hi -figureId=alice -id;\n:narration;\n";
  assert.equal(F.expressionPreparation(snap(source)).changed, 0);
  assert.equal(
    F.expressionPreparation(snap(source), { force: true }).stats.inserted,
    1,
  );
});
test("auto-exit inserts conditional exits but difference is not an entrance", () => {
  const source =
    "changeFigure:alice.png -id=alice -left;\nchangeFigureDiff:smile.png -id=alice;\nchangeFigure:bob.png -id=bob -left -when=ok;\n";
  const p = F.autoExit(snap(source));
  assert.equal(p.stats.inserted, 1);
  assert.match(p.after, /changeFigure:none -id=alice -left -next -when=ok;/);
});
test("batch-next is type selected, preserves existing and excludes intro/say defaults", () => {
  const source =
    "Alice:hi;\nintro:full;\nchangeBg:bg.png; comment\nchangeFigure:a.png -next;\n";
  const p = F.batchNext(snap(source));
  assert.equal(p.changed, 1);
  assert.match(p.after, /changeBg:bg.png -next; comment/);
  assert.ok(p.after.startsWith("Alice:hi;\nintro:full;"));
});
test("batch filters distinguish bg/figure and warn on existing transform", () => {
  const source =
    'changeBg:bg.png;\nchangeFigure:a.png -id=a -transform={"alpha":1};\n';
  const p = F.batchFilter(snap(source), {
    background: [{ brightness: 1.1 }],
    figure: [{ alpha: 0.5 }],
  });
  assert.equal(p.stats.appended, 2);
  assert.match(p.after, /-target=bg-main/);
  assert.match(p.after, /-target=a/);
  assert.equal(p.warnings.length, 1);
});
test("filter extraction rejects target/control or nonnumeric injection", () => {
  assert.throws(() => F.sanitizeEffects({ target: "a" }));
  assert.throws(() => F.sanitizeEffects({ alpha: NaN }));
  assert.equal(
    F.extractEffects('setTransform:{"alpha":0.5} -target=a;', caps)[0].alpha,
    0.5,
  );
});
test("named filter replacement preserves unrelated fields and unknown parameters", () => {
  const source =
    'setTransform:{"alpha":1,"brightness":2,"position":{"x":10}} -target=a -transformFrom=default -custom=x;\n';
  const p = F.editFilters(snap(source), {
    library: [{ id: "bright", effects: [{ brightness: 2 }] }],
    mode: "replace",
    replacement: [{ brightness: 0.5 }],
  });
  const r = rows(p.after)[0];
  assert.equal(JSON.parse(r.content).alpha, 1);
  assert.equal(JSON.parse(r.content).position.x, 10);
  assert.equal(JSON.parse(r.content).brightness, 0.5);
  assert.equal(r.args.transformFrom, "default");
  assert.equal(r.args.custom, "x");
});
test("field deletion and whole-row deletion remain distinct", () => {
  const source = 'setTransform:{"alpha":1,"brightness":2} -target=a;\n';
  const library = [{ id: "bright", effects: [{ brightness: 2 }] }];
  assert.equal(
    JSON.parse(
      rows(F.editFilters(snap(source), { library, mode: "delete" }).after)[0]
        .content,
    ).alpha,
    1,
  );
  assert.equal(
    F.editFilters(snap(source), { library, mode: "delete", whole: true }).after,
    "",
  );
});
test("named filter matching does not conflate transformFrom modes", () => {
  const source =
    'setTransform:{"alpha":1} -target=a -transformFrom=current;\nsetTransform:{"brightness":2} -target=a -transformFrom=default;\n';
  assert.equal(
    F.findFilters(snap(source), [
      { id: "pair", effects: [{ alpha: 1 }, { brightness: 2 }] },
    ]).length,
    0,
  );
});
test("single-line hint pairs require duration bounds and protect labels", () => {
  const p = F.singleLineHint(snap("Alice:hi;\n"), {
    text: "晚上",
    duration: 1800,
    key: "x",
  });
  const m = S.parse(p.after, { capabilities: caps });
  assert.equal(S.hintPairs(m)[0].valid, true);
  const label = m.rows.at(-1);
  assert.throws(
    () =>
      S.plan(
        snap(p.after),
        [
          {
            startOffset: label.startOffset,
            endOffset: label.endOffset,
            before: label.source,
            after: "",
          },
        ],
        "delete",
      ),
    /提示/,
  );
  assert.throws(
    () => F.singleLineHint(snap(""), { text: "bad", duration: 99 }),
    /时长/,
  );
});
test("single-choice conversion needs confirmation and multi-choice is refused", () => {
  let s = snap("choose:go:dest;\n");
  const id = rows(s.source)[0].id;
  assert.throws(() => F.singleLineHint(s, { rowId: id, text: "hint" }), /确认/);
  assert.equal(
    F.singleLineHint(s, {
      rowId: id,
      text: "hint",
      confirmConvert: true,
      key: "ok",
    }).changed,
    1,
  );
  s = snap("choose:a:x|b:y;\n");
  assert.throws(
    () =>
      F.singleLineHint(s, {
        rowId: rows(s.source)[0].id,
        text: "hint",
        confirmConvert: true,
      }),
    /多选/,
  );
});
test("hint edit does not double escape semicolons and paired deletion works", () => {
  const p = F.singleLineHint(snap(""), { text: "夜;晚", key: "x" }),
    id = rows(p.after)[0].id;
  const edit = F.singleLineHint(snap(p.after), { rowId: id, text: "新;晚" });
  assert.equal(rows(edit.after)[0].content, "新;晚:__wvp_hint_x");
  assert.equal(
    F.removeHint(snap(edit.after), rows(edit.after)[0].id).after,
    "",
  );
});
test("preset retarget preserves multi-target relationships", () => {
  const p = F.presets(snap(""), {
    code: 'setTransform:{"alpha":1} -target=a;',
    target: "alice",
  });
  assert.equal(rows(p.after)[0].args.target, "alice");
  assert.throws(
    () =>
      F.presets(snap(""), {
        code: 'setTransform:{"alpha":1} -target=a;\nsetTransform:{"alpha":1} -target=b;',
        target: "c",
      }),
    /多目标/,
  );
});
test("plan detects stale spans and missing revision", () => {
  assert.throws(() => S.plan({ source: "x" }, [], "x"), /revision/);
  assert.throws(
    () =>
      S.plan(
        snap("abc"),
        [{ startOffset: 0, endOffset: 1, before: "z", after: "x" }],
        "x",
      ),
    /源文本/,
  );
});
test("navigation and review checks are semantic and tolerate invalid transform JSON", () => {
  const source =
    "Alice:hi -figureId=absent -motion=wave;\nAlice:hi -figureId=absent -motion=wave;\nAlice:hi -figureId=absent -motion=wave;\nsetTransform:bad;\n";
  assert.equal(
    F.checks(snap(source)).filter((x) => x.type === "repeated-performance")
      .length,
    1,
  );
  assert.ok(F.navigation(snap(source)).some((r) => r.title.includes("需修正")));
});
test("verified 4.6.5 difference fallback enters missing targets and exits on none", () => {
  let source =
    "changeFigureDiff:alice.png -id=alice -left;\nchangeFigure:bob.png -id=bob -left;\n";
  const p = F.autoExit(snap(source));
  assert.equal(p.stats.inserted, 1);
  source =
    "changeFigure:alice.png -id=alice -left;\nchangeFigureDiff:none -id=alice;\nchangeFigure:bob.png -id=bob -left;\n";
  assert.equal(F.autoExit(snap(source)).stats.inserted, 0);
});
test("model differences are skipped exactly as the verified engine does", () => {
  const source =
    "changeFigure:alice.model3.json -id=alice -left;\nchangeFigureDiff:smile.png -id=alice;\nAlice:hi -figureId=alice -id;\n";
  const p = F.expressionPreparation(snap(source));
  const inserted = rows(p.after)
    .filter((r) => r.command === "changeFigure")
    .at(-1);
  assert.equal(inserted.content, "alice.model3.json");
  assert.ok(p.warnings.some((w) => w.includes("跳过")));
});
test("existing image diff preserves position/transform and replaces associated-image group", () => {
  const source =
    'changeFigure:alice.png -id=alice -left -transform={"alpha":0.8} -mouthOpen=old.png -eyesOpen=oldEyes.png;\nchangeFigureDiff:smile.png -id=alice -right -mouthOpen=new.png;\nAlice:hi -figureId=alice -id;\n';
  const p = F.expressionPreparation(snap(source));
  const inserted = rows(p.after)
    .filter((r) => r.command === "changeFigure")
    .at(-1);
  assert.equal(inserted.content, "smile.png");
  assert.equal(inserted.args.left, true);
  assert.equal(inserted.args.right, undefined);
  assert.equal(inserted.args.transform, '{"alpha":0.8}');
  assert.equal(inserted.args.mouthOpen, "new.png");
  assert.equal(inserted.args.eyesOpen, undefined);
});
test("forward effects retarget a missing-source difference entrance", () => {
  const source =
    'setTransform:{"alpha":1} -target=fig-left -next;\nchangeFigureDiff:alice.png -left;\n';
  const p = F.idCompletion(snap(source), {}, chars);
  assert.equal(rows(p.after)[0].args.target, "alice");
  assert.equal(rows(p.after)[1].args.id, "alice");
});
test("preset recognition accepts one-target rebinding but preserves multi-target topology", () => {
  const source = 'setTransform:{"alpha":0.5} -target=alice -next;\n';
  assert.equal(
    F.recognizePresets(snap(source), [
      {
        id: "fade",
        name: "Fade",
        code: 'setTransform:{"alpha":0.5} -target=fig-center;',
      },
    ])[0].name,
    "Fade",
  );
});
test("ID conversion remaps a positional difference after creating a custom identity", () => {
  const source =
    "changeFigure:alice.png -left;\nchangeFigureDiff:smile.png -left;\n";
  const p = F.idCompletion(snap(source), {}, chars);
  assert.equal(rows(p.after)[1].args.id, "alice");
});
test("ID conversion preserves replacement of the same default slot when identity changes", () => {
  const source = "changeFigure:alice.png -left;\nchangeFigure:bob.png -left;\n";
  const p = F.idCompletion(snap(source), {}, chars);
  const after = rows(p.after);
  assert.equal(after.length, 3);
  assert.match(after[1].source, /changeFigure:none/);
  assert.equal(after[1].args.id, "alice");
  assert.equal(after[2].args.id, "bob");
});
test("hint copies get unique protected labels and moves preserve pairs", () => {
  const initial =
    F.singleLineHint(snap(""), { text: "time", key: "first" }).after +
    "Alice:hi;\n";
  let s = snap(initial),
    id = rows(initial)[0].id;
  const copied = F.relocateHint(s, id, {
    at: initial.length,
    copy: true,
    key: "second",
  });
  assert.equal(
    S.hintPairs(S.parse(copied.after, { capabilities: caps })).length,
    2,
  );
  const moved = F.relocateHint(s, id, { at: initial.length });
  assert.ok(moved.after.startsWith("Alice:hi;"));
  assert.equal(
    S.hintPairs(S.parse(moved.after, { capabilities: caps }))[0].valid,
    true,
  );
});
test("generated review offsets account for preceding inserted templates", () => {
  const source =
    "changeFigure:alice.png -id=alice;\nAlice:a -figureId=alice -id;\nAlice:b -figureId=alice -id;\n";
  const p = F.expressionPreparation(snap(source));
  const m = rows(p.after);
  assert.equal(p.reviewOffsets.length, 2);
  for (const at of p.reviewOffsets)
    assert.equal(m.find((r) => r.startOffset === at).command, "changeFigure");
});
test("figure kind uses exact upstream URL path and decoded first query semantics", () => {
  const samples = [
    ["a.JSON?x=.png", "live2d"],
    ["a.jsonl", "texture"],
    ["a.png?type=spine", "spine"],
    ["a.png?type=%73pine", "spine"],
    ["a.png?type=Spine", "texture"],
    ["a.png?type=texture&type=spine", "texture"],
    ["a.png#x.json", "texture"],
    ["a.webm", "texture"],
  ];
  for (const [path, kind] of samples)
    assert.equal(S.figureKind(path), kind, path);
});
test("encoded spine source prevents difference deletion or identity mutation", () => {
  const source =
    "changeFigure:alice.png?type=%73pine -id=alice;\nchangeFigureDiff:none -id=alice;\nAlice:hi -figureId=alice -id;\n";
  const p = F.expressionPreparation(snap(source));
  assert.ok(p.warnings.some((w) => w.includes("跳过")));
  assert.equal(
    rows(p.after)
      .filter((r) => r.command === "changeFigure")
      .at(-1).content,
    "alice.png?type=%73pine",
  );
});
test("production check recognizes legitimate no-source difference entry", () => {
  const source =
    "changeFigureDiff:alice.png -id=alice;\nAlice:hi -figureId=alice -id;\n";
  assert.equal(
    F.checks(snap(source)).filter((x) => x.type === "missing-figure").length,
    0,
  );
});
test("ignored clear flag on an existing image difference cannot erase ID presence", () => {
  const source =
    "changeFigure:alice.png -id=old;\nchangeFigureDiff:smile.png -id=old -clear;\nAlice:hi;\n";
  const p = F.idCompletion(snap(source), { overwrite: true }, chars);
  assert.equal(rows(p.after).at(-1).args.figureId, "alice");
  assert.equal(
    rows(p.after).find((r) => r.command === "changeFigureDiff").content,
    "smile.png",
  );
});

test('feature selector exposes only applicable statement types and opt-in animation targets',()=>{
  const s=snap('changeBg:room.png;\nchangeFigure:alice.png -id=alice;\nAlice:hello -figureId=alice;\nsetTransform:{"alpha":0.5} -target=alice;\nsetTransform:{"alpha":1};\nchangeFigure:none -id=alice;\nintro:title;\nwait:100;\n');
  const filter=F.selectionRows(s,'filter');
  assert.deepEqual(Array.from(filter,r=>r.command),['changeBg','changeFigure','setTransform','setTransform','changeFigure']);
  assert.deepEqual(Array.from(filter,r=>r.eligible),[true,true,false,false,false]);
  assert.deepEqual(Array.from(F.selectionRows(s,'filter',{allowAnimations:true}),r=>r.eligible),[true,true,true,false,false]);
  const expression=F.selectionRows(s,'expression');assert.equal(expression.length,1);assert.equal(expression[0].eligible,true);
  const next=F.selectionRows(s,'next',{commands:['say']});
  assert.equal(next.filter(r=>r.eligible).length,1);assert.equal(next.find(r=>r.command==='intro').eligible,false);
  assert.equal(next.some(r=>r.command==='wait'),false);
});
test('feature selector uses existing named-filter matches, not arbitrary transforms',()=>{
  const s=snap('setTransform:{"alpha":0.5} -target=alice;\nsetTransform:{"scale":{"x":1.5}} -target=alice;\nAlice:hello;\n');
  const library=[{id:'fade',name:'淡出',effects:[{alpha:0.5}]}];
  const rows=F.selectionRows(s,'filterEdit',{library,presetId:'fade'});
  assert.equal(rows.length,1);assert.equal(rows[0].startLine,1);assert.match(rows[0].title,/淡出/);
  assert.equal(F.selectionRows(s,'filterEdit',{library,presetId:'missing'}).length,0);
});
test('hint selector protects multi-choice and hides reserved labels',()=>{
  const s=snap('choose:one:__wvp_hint_a -wvpHint=1800 -defaultChoose=1;\nlabel:__wvp_hint_a;\nchoose:left:a|right:b;\nAlice:hello;\n');
  const rows=F.selectionRows(s,'hint');assert.equal(rows.length,2);assert.equal(rows[0].eligible,true);assert.equal(rows[1].eligible,false);
});
test('automatic-exit selector excludes existing image differences and model differences but permits no-source fallback',()=>{
  const s=snap('changeFigure:alice.png -id=alice;\nchangeFigureDiff:smile.png -id=alice;\nchangeFigureDiff:missing.png -id=bob;\nchangeFigure:live.model3.json -id=live;\nchangeFigureDiff:other.png -id=live;\nchangeFigure:none -id=alice;\n');
  const rows=F.selectionRows(s,'exits');assert.deepEqual(Array.from(rows,r=>r.eligible),[true,false,true,true,false,false]);
  assert.match(rows[1].reason,/不是入场/);assert.match(rows[4].reason,/跳过/);
});

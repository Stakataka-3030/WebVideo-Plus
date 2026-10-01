import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const c = vm.createContext({ URL });
c.window = c;
for (const file of ["vendor/webgal-parser-4.6.5.js", "script.js", "review.js"])
  vm.runInContext(
    fs.readFileSync(new URL("../features/" + file, import.meta.url), "utf8"),
    c,
  );
const S = c.WebVideoCraftScript,
  R = c.WebVideoCraftReview;
const caps = {
  multilineStatements: true,
  sceneSemantics: true,
  changeFigureDiff: true,
  transformFrom: true,
};
function fixture() {
  let text = null;
  const snap = {
    projectId: "p",
    path: "a",
    source: "Alice:first;\nAlice:review;\nAlice:last;\n",
    revision: 1,
    runtimeCapabilities: caps,
  };
  const bridge = {
    snapshot: async () => ({ ...snap }),
    readProjectFile: async () => text,
    writeProjectFile: async (_file, value, { expectedText }) => {
      assert.equal(text, expectedText);
      text = value;
    },
  };
  return {
    snap,
    bridge,
    controller: R.createController(bridge),
    text: () => text,
  };
}
test("review metadata uses CAS and never changes scene text", async () => {
  const f = fixture(),
    before = f.snap.source,
    row = S.parse(f.snap.source, { capabilities: caps }).rows[1];
  await f.controller.mark(f.snap, [row.id], "pending", "generated");
  assert.equal(f.snap.source, before);
  assert.equal((await f.controller.list(f.snap))[0].status, "pending");
  await f.controller.mark(f.snap, [row.id], "reviewed", "manual");
  assert.ok(
    (await f.controller.list(f.snap)).every((r) => r.status === "reviewed"),
  );
});
test("changed neighboring context does not silently inherit a reviewed mark", async () => {
  const f = fixture(),
    row = S.parse(f.snap.source, { capabilities: caps }).rows[1];
  await f.controller.mark(f.snap, [row.id], "reviewed");
  f.snap.source = f.snap.source.replace("Alice:first", "Bob:first");
  f.snap.revision++;
  assert.equal((await f.controller.list(f.snap))[0].row, null);
});
test("stale mark attempt never writes metadata", async () => {
  const f = fixture(),
    old = { ...f.snap };
  f.snap.revision++;
  await assert.rejects(f.controller.mark(old, []), /场景已变化/);
  assert.equal(f.text(), null);
});
test("project switch during metadata read fails closed", async () => {
  const f = fixture();
  f.bridge.readProjectFile = async () => {
    f.snap.projectId = "other";
    return null;
  };
  await assert.rejects(f.controller.load(), /工程已切换/);
});
test("review fingerprints distinguish different supplementary Unicode characters", () => {
  assert.notEqual(S.fingerprint("Alice:😀;"), S.fingerprint("Alice:😁;"));
});
test('large generated review sets remain exact across bulk mark and resolution',async()=>{const f=fixture();f.snap.source=Array.from({length:1000},(_,i)=>'Alice:line '+i+';\n').join('');const model=S.parse(f.snap.source,{capabilities:caps});await f.controller.mark(f.snap,model.rows.map(r=>r.id),'pending','generated');const marks=await f.controller.list(f.snap);assert.equal(marks.length,1000);assert.ok(marks.every(m=>m.row&&m.status==='pending'));});

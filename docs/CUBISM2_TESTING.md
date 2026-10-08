# Cubism2 motion-epoch regression checks

## Portable CI checks

```sh
node --test tests/cubism2-seam.test.mjs
node tests/verify-export-lifecycle.mjs
```

The planner must record actual motion state changes, not every occurrence of
`-motion`. WebGAL 4.6.4's same-identity, same-recorded-group guard does not restart
an active or completed motion. Model source, position and normalized bounds
changes create a new lifetime, which may start the same named motion again.

The tests also cover switching away and back, removal/re-addition, independent
targets, numeric-equivalent/default bounds, omitted/empty motion, and motion
resets caused by skin or valid bounds updates. In particular, `-motion=` alone
on an existing identity is ignored by WebGAL; it is not a restart instruction.

After preparing the pinned runtime with `prepare-build.ps1`, run:

```sh
node tests/cubism2-runtime-contract.mjs
```

This check verifies the bundle hash, extracts its actual `changeFigure`, figure
identity/synchronization and motion-guard functions, and compares 15 lifecycle
scenarios against `browser/workload.js`. The pinned plugin ticker/render methods also verify that a stop command preserves
the last pre-stop frame. Stage construction/rendering and unrelated animation
collaborators are mocked. CI runs it after preparation.
A path to an already prepared `index-R1tKotR6.js` may be supplied as its argument.

## Opt-in real SDK/model numerical check

The repository does not include or download a proprietary SDK or model. Only run
this check with an SDK whose execution is authorized and a model you may use:

```sh
node tests/cubism2-model-seam.mjs model.json live2d.min.js cases.json output-directory
```

The SDK is separately supplied and byte-pinned to SHA-256
`1f38a810c2ea019cc179ce49e1573bf6ed3b4ce700399a6df869430e20dda0d8`.
An unknown SDK is rejected before evaluation. The VM exposes no Node, file or
network APIs and disables string/Wasm code generation. This is an execution
restriction, not proof that a third-party SDK is official or safe.

`cases.json` is an array of motion groups from that model, with cut time in seconds
and an optional repeated same-name command, for example:

```json
[
  {"group":"your-motion-group", "cutSeconds":12},
  {"group":"your-motion-group", "repeatSeconds":8, "cutSeconds":12}
]
```

The harness uses the actual SDK's model parser, motion queues, physics and
numerical deformation, with the current planner and exporter seek helpers. It
compares continuous playback with a fresh model restored three seconds before
the cut. Repeat cases must keep one motion epoch and produce exactly equal transformed
vertex coordinates at the cut. An optional `stopSeconds` replaces `repeatSeconds`
and tests an empty-motion reset from unchanged bounds, with two epochs. Optional
`loop: true` explicitly enables the SDK loop flag for a synthetic loop-stop case. The independent continuous reference starts the SDK queue directly, ignores
repeated same-name commands, and stops the queue before the first frame at or
after `stopSeconds`, matching WebGAL's runtime guard and native render fence.

This focused harness uses index 0, 500 ms motion fades, 60 fps and no default
`idle` motion group. It omits expression, focus, pose and browser/WebGL rendering;
it does not compare pixels or reproduce an unavailable original scene. It is not
a general claim that a three-second physics warmup is sufficient for all models.
The JSON output contains the scope, SDK/model hashes, epochs and geometry error.

Validation with the supplied model found eight ordinary cases unchanged, three
repeated-motion cases corrected, and five stopped-motion cases matching (active,
completed, off-frame, during warmup and explicitly looped). All 16 cases had exact vertex
equality across all 157 drawables. Cubism3/4 stop/terminal handling has portable
queue tests; no proprietary Cubism3/4 SDK/model execution is claimed. Before the fix, those three cases had maximum coordinate differences
of approximately 74.38, 23.98 and 33.76 model units. These synthetic scenarios
establish a reproducible bug and regression; they do not establish the cause of
every discontinuity in a separate recording.

## 1.2.1 / 1.3.0 release validation

The earlier geometry-only evidence above is historical. The current release additionally tests the exact 4.6.5 texture bridge and real plugin factory with `node tests/cubism2-texture-upload-backport.mjs <official-4.6.5-root>`. This checks cold/hot conversion reuse, destroyed textures, absence of double conversion, unmodified shared/modern resources, and GL unpack restoration after success and failure. The engine adapter requires original plugin bytes and validates the complete prepared output digest.

Native model evidence uses separately supplied SDK 2.1.00_1 (SHA-256 `e4ea1f18bdd44b65394ffd5a1bab16982e88757d45134d1bd0737c8a6b3ddd08`) with the official legacy Haru sample. Under the same Intel ANGLE D3D11 backend, the unmodified 4.6.5 engine produces fragmented textures; the narrowly patched 4.6.5 plugin and official 4.6.6 engine produce the complete model. This is an upstream-version comparison, not evidence of a 4.6.6 export texture regression. SDK/model files remain local.

The final release attachment TEST-REPORT.md records the exact exporter commit, CI, engine/SDK/backend pairing, meaningful nonempty pixel checks, requested cut seconds and actual frame indexes. A successful encode or identical empty frame is insufficient for a model-rendering pass. Failed or incorrectly specified earlier cases are superseded only by corrected completed runs.

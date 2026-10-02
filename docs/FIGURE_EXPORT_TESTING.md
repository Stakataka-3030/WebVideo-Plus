# Figure-only stage export regression

`includeFigures` defaults to `true` and affects stage export only. The queued
request is copied to every worker; the part-cache signature and output sidecar
include its normalized value. Planning, source text, timing, asset validation,
model lifetimes and segmentation do not branch on this option.

## Render contract

The pinned WebGAL `figureObjects` list contains image/GIF, Live2D and Spine roots,
including outgoing transition objects whose keys are renamed before destruction.
It excludes backgrounds, the main stage and independent stage effects.

`__exportInstallFigureOutputFilter` wraps those roots' render traversal. It flushes
Pixi batches on each side and prevents color writes only into the framebuffer
that enclosed the figure. It still calls every original renderer and GL draw.
Private model clipping-mask targets and figure filter textures remain writable;
figure filters' final composite is suppressed. Parent-stage filters and unrelated
objects remain normal. The WebGL color mask is enforced at each draw, so model
code that changes colorMask cannot accidentally make the figure visible. The
previous mask is restored in `finally`, with stencil and depth operations intact.

No object is made invisible, non-renderable or transparent. This matters because
the pinned Live2D plugin accumulates time in its ticker but evaluates motion,
physics and model deformation in `_render`. It must run exactly once as before.
The filter is installed before prefix restoration and all renderer/capture
branches, including GPU RGBA, transparent screenshots and compatibility capture.

## Checks

- `node --test tests/figure-export.test.mjs`: UI ordering/defaults/reopen, all four
  checkbox combinations, stage-only API normalization, cache/worker wiring,
  dynamic/outgoing roots, target-local masks, batching and exception cleanup
- `node tests/figure-export-runtime.mjs [pinned-plugin-file]`: complete production
  frame scheduler plus the exact SHA-256-pinned Live2D plugin `_render` method,
  with synthetic model collaborators. Compares on/off commands, asset waits,
  clock ticks, media sync, model update/draw counts and frame counts at 30/60 fps
  through regular and deferred-composite/warmup paths
- `node tests/figure-export-render.mjs package/runtime/web .build/font-baseline`:
  actual pinned Pixi/WebGL pixel regression in Chromium/Edge, with images,
  figure/parent filters, stencil masks, and the actual Live2D plugin `_render`
  method with synthetic collaborators. Verifies all four layer combinations,
  Alpha, private mask texture writes and unchanged model updates over six frames

The pixel test can also serve `/fixture.html` with `--serve` for an authorized
existing test browser. It does not download a Live2D SDK or models. It must not
be described as a real SDK/physics/model pixel comparison or a Windows WebView2
encoder test. Native WebView2 export still receives its own CI coverage. A
blocked browser test is unverified until a supported CI/test environment runs it.

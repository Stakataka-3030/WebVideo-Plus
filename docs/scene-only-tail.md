# Conservative scene-only planning tail

## Scope

For `storyScope=sceneOnly`, auto/manual timing, and no line selection, the
executable export source ends at the selected scene's first static interval.
All preceding scenes and every line of the selected scene remain intact.
Full export, from-scene export, line selections, and analysis-only jobs retain
their existing behavior. BGM-fit timing also retains the full path: its elastic
time mapping depends on the remainder of the story and cannot be shortened
without changing preceding timestamps.

Two other cases retain the full path: a nonempty custom `musicTimeline` (even
a future-only track can enable the mixer's global limiter), and explicit
statement cuts naming an omitted scene (existing validation must still allow
the range resolver to ignore them). Ordinary script BGM remains eligible.

This is not a general story interpreter or a predecessor-state optimization.
`BuildTimeline` still parses the scene text graph, chooses the same root, and
applies the same static-chain validation, including cycle and missing-transition
checks. Existing unsupported controls inside the retained source still fail the
scanner. Controls and missing media solely in an omitted suffix are no longer
scanned or executed. Global templates, configuration, animation tables, and
model dependencies required by retained assets are not pruned.

## Boundary and pipeline

`SceneChain.LimitPlanningTail` runs immediately after `BuildTimeline`, before
shared-resource source resolution, resource scanning, copying, media probing,
video preflight, preliminary workload construction, or native timing execution.
The same limited source feeds the prepared plan used by all render workers.

The limit retains the whole selected source block, including the already
flattened static transfer and its zero-time comments. It replaces the first
line of the next scene with `end:;` and omits the remainder. This asset-free
sentinel is observed at the same forward boundary as that next scene's first
statement. It avoids the extra advance that relying on natural EOF can add.
It is not an emitted render event. A terminal selected scene is left unchanged.

The sentinel keeps a valid boundary source location for statement-cut
validation, with `synthetic=true` to distinguish it from the omitted command.
`planningTail` records its zero-based global line and omitted scene count.
`AttachTimeline` verifies its observed time and preserves the existing
integer-millisecond scene end before output-frame rounding. It does not attribute the marker to a
retained scene's line times. Malformed/noncontiguous origin maps fail closed;
an absent selected scene is not used to trim a different scene.

`AlignPlanningTailDuration` pads only the limited result's duration to at least
the boundary's existing `Math.round` millisecond timestamp before finishing.
This preserves the old `ceil(round(boundaryMs) * fps / 1000)` crop. For example,
61 frames at 60 fps yield a 1017 ms line time, whose old crop ends at frame 62.
Simply ending duration at the raw 61-frame instant would lose that last frame.
Padding does not execute another command or change event/perform times.

The engine's lookahead implementation and window are unchanged. In official
4.6.6, `forward` requests assets before dispatching a statement, so a late
runtime stop alone would not prevent preloading later textures. Supplying the
limited source to all preparation stages prevents that lookahead from seeing
the omitted suffix at all.

Predecessor replay anchors, warmup, motion/physics clocks, target transitions,
voices, active BGM/effects, and worker sharing are unchanged. Their retained
workload lifetimes are clipped by the existing output duration. No successor
command is imported merely to stop an earlier sound or model. The quantized
last audio fraction therefore contains only retained-source audio, not a
successor sound that an old full-story crop could admit between the raw scene
boundary and its rounded video endpoint. Bit-identical audio at that fraction
is not promised.

`JobRunner.PipelineRevision` gains `scene-tail-v1`, invalidating prior timing
and accepted-part caches. No adapter patch, browser protocol, or adapter
version changes are required.

## Tests

No-graphics checks:

```powershell
pwsh -NoLogo -NoProfile -File tests/scene-only-tail.test.ps1 -Fixtures .build/scene-only-tail-fixtures.json
node --test tests/scene-only-tail.test.mjs
node tests/scene-only-tail-runtime-contract.mjs <official-4.6.6-root> .build/scene-only-tail-fixtures.json
```

The C# suite compiles actual production scene-chain, asset-scanner, statement-
cut, bounds, and segment-planning code. It covers prefix identity, zero-time and
empty targets, final scenes, explicit end, scope/mode fallbacks, inherited asset
validation/copying, excluded missing tail media, branch/call/return/jump
rejection, cycles, missing targets, fractional endpoints, and 1/2/4/8 worker
frame coverage and predecessor anchors.

The Node workload tests retain inherited audio, voice/mouth targeting,
Live2D lifetime, animation and exit-transition windows. The runtime contract
uses hash-checked, unmodified official 4.6.6 forwarding and preload functions
with data-only collaborators. It demonstrates the original current-plus-20
preload window, full-input leakage across a scene boundary, limited-input
exclusion, and the end sentinel's zero-time forwarding behavior. It does not
claim to render a real scene, execute a proprietary model SDK, or prove pixels.

`scene-only-tail-native.ps1` is a separate native CI gate, hard-locked to
GitHub-hosted Windows. It uses existing `plan` and `render` commands, with no
production bypass option: a full-story plan rendered only over the selected
interval is compared with the limited plan rendered by one and two concurrent
workers. Generated PNGs and PCM BGM provide public, synthetic inputs.

The manual 30 fps case covers inherited background/figure/audio, a running
transform, and an exit transition crossing a fractional scene end. The auto
60 fps case explicitly requires the 61-frame raw endpoint to retain the old
62-frame crop. Every decoded frame, including final frames and part seams, is
compared with a maximum MSE of 4 (independently encoded H.264 parts can differ
in quantization). Selected lossless PCM samples must match exactly. A visible
inherited stage and absent suffix snapshot asset are also asserted. This gate
has to pass remotely; parsing its PowerShell syntax locally is not execution.

Remaining native coverage includes
inherited background/BGM/Live2D, manual and auto timing, blocking/`-next` final
commands, `-notend` plus wait, exit transitions, silent/empty target rejection,
non-frame-aligned ends, and one versus multiple workers. Compare selected
frames with the same interval of a full export and verify that unrelated suffix
assets are absent from the prepared plan and preload requests. The added native
gate covers the synthetic cases above, not proprietary Live2D pixel behavior,
all dynamic controls, or measured GPU-memory reduction.

## Branch integration

The original `SceneChain.cs` is identical across the current 4.6.6, Craft, and
4.6.4 lines. Its implementation and the pure workload tests can be shared.
Insert the single Planner call immediately after `BuildTimeline` on each line
without replacing the rest of that branch's Planner. Append the cache suffix
to that branch's own `PipelineRevision`; do not overwrite its existing prefix.

The portable C# suite can overlay this `SceneChain.cs` on another checkout's
unchanged remaining sources with `-CompatibilitySourceRoot <checkout>`. This
tests source-level compatibility without modifying that checkout. The 4.6.4
adapter has fewer constructor parameters and no `WebgalEngineProfile`, while
Craft lacks the shared-assets module. The harness accounts for those facts.
The exact 4.6.6 oracle only applies to an official 4.6.6 engine; other runtime
versions still require their own native export gate. Do not copy unrelated
runtime-startup, shared-assets, or adapter-version changes when backporting.

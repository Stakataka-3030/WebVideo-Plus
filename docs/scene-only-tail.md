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

The first metadata navigation still uses the engine parser on the full text
graph. That parser can schedule HTML `link rel=prefetch` requests for assets
mentioned in later scenes before the limited source is installed. This change
does not prevent every suffix network request, pause that metadata clock, or
alter preceding-scene cache warmup. It limits resource scanning/snapshotting,
media preparation, and the second navigation's actual timing simulation and
GPU lookahead. HTML prefetch is not evidence of Pixi texture upload.

## Boundary and pipeline

`SceneChain.LimitPlanningTail` runs immediately after `BuildTimeline`, before
shared-resource source resolution, resource scanning, copying, media probing,
video preflight, preliminary workload construction, or native timing execution.
The same limited source feeds the prepared plan used by all render workers.

The limit retains the whole selected source block, including the already
flattened static transfer and its zero-time comments. It replaces the first
line of the next scene with a synthetic comment and omits the remainder. This asset-free
sentinel is observed at the same forward boundary as that next scene's first
statement. The existing timing observer stops at `policy.sceneOnlyEndLine`,
avoiding the extra advance that relying on natural EOF can add. A real `end`
command would reset the stage, terminate active performs, and load the title
screen; the comment leaves those lifecycle windows intact.
Native forwarding may then enter EOF; the static flattened chain has an empty
scene stack, whose EOF pop has no reset/return side effects. The renderer skips
comments and replays scheduled events without automatic script advancement.
The sentinel is not an emitted render event. A terminal selected scene is left unchanged.

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
the omitted suffix at all during the second navigation and actual simulation.
The initial metadata parser's separate HTML prefetch remains as described above.

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
version changes are required. The timing policy has one additive field,
`sceneOnlyEndLine`, sent only with a meaningful value for a limited plan; it
uses the already installed observer hook.

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
exclusion, and the comment sentinel's zero-time forwarding behavior. It does not
claim to render a real scene, execute a proprietary model SDK, or prove pixels.
The same hash-checked oracle runs the native comment handler, perform arrangement,
forwarder, and EOF together: the observer finishes once, empty-stack EOF occurs,
and two pre-existing active performs survive without stop/reset/return calls.

`scene-only-tail-native.ps1` is a separate native CI gate, hard-locked to
GitHub-hosted Windows. It uses existing `plan` and `render` commands, with no
production bypass option: a full-story plan rendered only over the selected
interval is compared with the limited plan rendered by one and two concurrent
workers. Generated PNGs and PCM BGM provide public, synthetic inputs.

The manual 30 fps case covers inherited background/figure/audio, a running
transform, and an exit transition crossing a fractional scene end. The auto
60 fps case explicitly requires the 61-frame raw endpoint to retain the old
62-frame crop, with a `-keep` transform whose actual perform/replay windows span
the rounded last frame. Its first and last images must show the inherited stage.
Every decoded frame, including final frames and part seams, is
compared with a maximum MSE of 4 (independently encoded H.264 parts can differ
in quantization). Selected lossless PCM samples must match exactly. A visible
inherited stage and absent suffix snapshot asset are also asserted. This gate
has to pass remotely; parsing its PowerShell syntax locally is not execution.

The two concurrent renderer processes explicitly replay from the root. This
does not validate automatic worker scheduling or anchor selection. Further
native cases remain for proprietary Live2D SDK pixels, blocking/`-next` final
commands, `-notend` plus wait, silent/empty target rejection, dynamic controls,
and measured GPU-memory reduction. Pure tests do not substitute for these
native checks or establish bit-identical rendered output.

## Branch integration

The original `SceneChain.cs` is identical across the current 4.6.6, Craft, and
4.6.4 lines. Its implementation and the pure workload tests can be shared.
Insert `LimitPlanningTail` immediately after `BuildTimeline`, pass its optional
boundary line in the timing policy, and call `AlignPlanningTailDuration` before
finishing the native timing result. Include the observer's additive boundary
condition in `browser/timeline.js` without replacing the rest of that branch's
Planner or timing logic. Append the cache suffix
to that branch's own `PipelineRevision`; do not overwrite its existing prefix.

The portable C# suite can overlay this `SceneChain.cs` on another checkout's
unchanged remaining sources with `-CompatibilitySourceRoot <checkout>`. This
tests source-level compatibility without modifying that checkout. The 4.6.4
adapter has fewer constructor parameters and no `WebgalEngineProfile`, while
Craft lacks the shared-assets module. The harness accounts for those facts.
The exact 4.6.6 oracle only applies to an official 4.6.6 engine; other runtime
versions still require their own native export gate. Do not copy unrelated
runtime-startup, shared-assets, or adapter-version changes when backporting.

The native gate accepts `-Engine webgal` with a pinned 4.6.4/4.6.5/4.6.6
`-EngineRoot`, or `-Engine mygo` with the pinned MyGO 3.2.1 runtime. Its
`-PackageRoot` must be that branch's built package containing `WebGAL.Video.exe`
and WebView2 dependencies; `-MediaToolDirectory` points to the branch's pinned
FFmpeg/FFprobe `bin`. All fixtures are generated in `-OutputRoot`, defaulting
to `.build/ci-native-tests/scene-tail`; no source project/model is reused.
For 4.6.4, use the prepared `package/runtime/web` root. For Craft, run separately
for each runtime that release supports, using its existing pinned runtime
locations. The 4.6.6 workflow's oracle step must not be substituted for these
version-specific native runs, and a new allowed profile is not a passed run.

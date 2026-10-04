# Bound engine parity: Craft 1.1.5c

## Scope and failure

The export bridge supports these existing exact profiles:

- Official WebGAL 4.6.4 (`open-webgal.webgal`, base WebGAL 4.6.4)
- Official WebGAL 4.6.5 (`open-webgal.webgal`, base WebGAL 4.6.5)
- MyGO 3.2.1 (`webgal-mygo.mygo`, base WebGAL 4.6.4)

The previous Craft session guard admitted only the official WebGAL ID and forced the WebGAL adapter. The native queue and cached-plan guards repeated this restriction even though a MyGO adapter already existed. In addition, the bridge passed the base `runtimeVersion` as `engineVersion`; snapshot materialization wrote that value into both descriptor fields. MyGO's own 3.2.1 version was therefore lost.

The fix carries engine and base versions separately from the registered binding to the immutable snapshot, queue, adapter selection, prepared runtime, and cache/result checks. Missing exported descriptors are reconstructed from this binding; an existing contradictory descriptor is rejected rather than overwritten. Official IDs/versions with inconsistent base metadata, version prefixes, suffixes, or unknown versions are still rejected. The session error names the detected ID, engine version, and base version.

Strict MyGO accepts only main bundle SHA-256 `0407b5a6326ebaa1608d16541b79b4ccc54a0432947ae7d3a6a855606a68866e`, matching descriptor, and `mygo-project-runtime` origin. It checks bytes again during `Patch` and `Prepare` and rechecks the descriptor. It never searches the user's machine or substitutes a template/bundled/other-project runtime. Existing nonstrict Terre derivative behavior is preserved.

Strict MyGO now retains the captured preview locale, or the actual project's explicit `Default_Language`, through planning and rendering. Unknown or missing startup proof fails. Nonstrict legacy MyGO startup remains unchanged. The locale enum, storage key and initialization mapping were inspected at official MyGO source commit `ed73e55a87546cf0bc495a95061ccce2dafdf7cb` (tag `mygo3.2.1`):

- https://github.com/boomwwww/webgal-mygo/blob/ed73e55a87546cf0bc495a95061ccce2dafdf7cb/packages/webgal/public/webgal-engine.json
- https://github.com/boomwwww/webgal-mygo/blob/ed73e55a87546cf0bc495a95061ccce2dafdf7cb/packages/webgal/src/config/language.ts
- https://github.com/boomwwww/webgal-mygo/blob/ed73e55a87546cf0bc495a95061ccce2dafdf7cb/packages/webgal/src/hooks/useLanguage.ts
- https://github.com/boomwwww/webgal-mygo/blob/ed73e55a87546cf0bc495a95061ccce2dafdf7cb/packages/webgal/src/UI/Translation/Translation.tsx

## Verification

Cloud checks on this patch:

- 203 Craft JavaScript tests passed, including separate MyGO engine/base-version allocation, snapshot preservation/conflict rejection, forged selector/identity replacement, and precise unknown/mismatched profile rejection
- 137 portable production C# checks passed, including actual official 4.6.4/4.6.5 raw/prepared bytes, strict MyGO request/cache rejection, no-fallback failures, and locale contract coverage
- All six C# 5 / .NET 4.8 build targets compiled with the existing warnings only
- Updated Windows queue/cache test and optional real-MyGO test harness compiled; Windows entrypoints were not run

The actual historical MyGO compiled fixture was not available in the cloud cache. The official engine releases endpoint returned an empty list; the official Actions artifacts endpoint also had no retained artifact. A verified source tag is not a substitute for the exact compiled bytes. Thus positive MyGO real-byte selection/Prepare and native rendered-video acceptance remain unrun, and no synthetic success fixture is used.

When the original engine shell is available, run:

```powershell
./tests/engine-adapter-mygo-profile.test.ps1 -Portable -Mygo321Root /path/to/original-mygo-3.2.1
```

This checks the real hash, selection, instrumentation, immutable-source preservation, descriptor/bundle mutation rejection, strict locale startup, and patched JavaScript syntax. Native Windows/WebView2 visual export validation remains a separate stage.

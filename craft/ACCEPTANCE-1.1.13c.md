# Craft 1.1.13c / installer 1.1.13.0c — official rc.1 adaptation

Date: 2026-10-10. Local branch `adapt/craft-1.1.13c-rc1`, based on
`f1b336faaef5add0af6b1ffe5a25e173984f8451` from `release/craft-1.1.12c`.
The Terre working trees and main branch were not edited. No release, tag, push
or merge is authorized for this round; retain the local source and EXE.

## Official inputs and scope

Official WebGAL Craft [v1.0.0-rc.1](https://github.com/A-kirami/webgal-craft/releases/tag/v1.0.0-rc.1)
was published at 2026-10-10 04:10:21 UTC, source
`379dd03faca460549624fe75ca0452d2328d3477`.
The downloaded x64 installer passes the unchanged official Minisign key and
signed product/version/architecture check; altered bytes are rejected.

| Input | SHA-256 |
| --- | --- |
| rc.1 installer | `f017a7c76caf1cc43d8650838f5929049cf3e2140533f438fe972d784919d9c9` |
| rc.1 original EXE | `c1f3cd843a5b3d09a8c7232a7e8158492a1c4feec3d96c99f8b809d30e3a5b1f` |
| retained beta.2 EXE | `3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d` |

Both exact host profiles are accepted. Crossed version/hash pairs and unknown
hosts fail closed. Engine support remains the existing exact WebGAL 4.6.4,
4.6.5 and MyGO 3.2.1 profiles; the engine allowlist was not broadened.
Base product 1.1.2 and kernel 0.6.52 are unchanged.

## Changes

- The audited rc.1 update state contract joins beta.2. Source-pinned real
  Pinia 4.0.3 / Vue 3.5.43 checks preserve native download completion and route
  it to owned confirmation/normal-close coordination. Official feed and key
  remain unchanged; dangerous direct writes, captured setters and repeated
  routes remain guarded.
- rc.1 sends preview commands to external clients with its panel closed.
  Hint preview now proves the unique owned embedded frame before scene sync
  and again before snippet broadcast. Closed/ambiguous frames refuse before
  sending native commands, and disappearance during sync prevents the snippet.
- Own updates accept EXE-only Craft stable releases with the exact tag,
  canonical filename/URL, product marker, GitHub SHA-256 digest and size.
  Legacy descriptors, when present, retain their strict verification.
  Pre-1.1.13 clients need a manual EXE upgrade to discover EXE-only releases.
- The pinned Node child uses `--use-system-ca`: it retains certificate
  verification while using Windows' existing trusted CA store. This resolves
  the measured local issuer-chain failure without installing certificates or
  modifying system trust. Native Tauri string errors are normalized so actual
  feed errors stay visible rather than losing their message.
- Setup validates the raw final directory name before .NET Framework removes
  trailing dots. The native fixture had exposed acceptance of `bad.`.
  Native test harnesses also now include ProductRouting, construct invalid
  path samples without framework prevalidation, wait for the intended retry
  worker, and preserve CRLF in scene transaction fixtures.
- Actual embedded-EXE testing also exposed MAX_PATH failures with the long
  isolated extraction cache. Setup and launcher now embed an asInvoker,
  longPathAware application manifest and opt into modern .NET path handling.
  A 301-character native IO probe and the production path/boundary fixture pass;
  no registry, Windows feature, elevation or external config asset is needed.
  The earlier install failed before mutation and remains recorded separately.

## Passed source and isolated native checks

- Complete shared/Craft Node suite: **838 passed, 0 failed, 0 skipped** with
  concurrency 2. An earlier default-concurrency run crashed one experimental
  Node VM child with Windows exit 3221225477; the affected 20 tests passed alone,
  and both complete bounded reruns passed. The original failure log is retained.
- Composed feature preflight: 173 passed. Native font checks: 61 passed;
  Setup path checks: 84 passed; dual-engine native assembly checks: 137 passed.
  RuntimeContract queue identity checks, actual Setup forms and launcher forms
  passed. Clean-handoff synthetic matrix: 8 passed; legacy observer synthetic
  matrix: 5 passed in Windows PowerShell 5.1 (its legacy Add-Type invocation is
  incompatible with PowerShell 7).
- Original-name wrapper starts the extracted official rc.1 in a new profile.
  Native discovery registers an owned 4.6.5 engine and disposable project.
  Scene opening, real commit/undo/redo, stale revision rejection and VFS pass;
  Anogo staging/apply/undo and actual story backup/restore/safety backup pass.
- Timed hint completion, cancel and navigation pass with independent iframe
  tickets and observations after the original five-second deadline. Source is
  restored; no delayed click occurs after interruption. Closed and duplicated
  frames yield zero native preview broadcasts. Fullscreen enter/exit preserves
  the settings bridge and preview speeds.
- Native export measures 10.1 seconds, validates cache invalidation, saves two
  original-length music lanes, renders soft/burn subtitle MP4s, and cancels a
  queued export. Independent ffprobe confirms H.264 1280×720/30fps, 303 frames,
  10.1 seconds and AAC. Decoded audio has a nonzero 440Hz component; the soft
  mov_text cue is extracted, and the burn frame visibly contains its text.
  The original malformed empty-transform fixture was correctly refused before
  rendering; its failure evidence is retained, then the owned fixture was fixed.

The final build and real embedded-EXE installation matrix have separate records
in the task's `evidence` directory. Verify their `passed` fields and final EXE
hash before considering a release; copied-host replacement is explicitly
labelled and must never be described as official NSIS execution.

## Boundaries and retained recovery

Official rc.1 is a prerelease. The configured official latest JSON URL returns
404, and actual native check reports no valid release JSON. It is not reported
as up-to-date, nor replaced with a private or fake production feed. Authentic
signed cached-artifact staging can validate beta.2-to-rc.1 signatures and
receipts; it does not prove live discovery, registered NSIS forward installation
or automatic relaunch/remount.

Actual official NSIS was **not run** because a copied EXE/profile does not isolate
its registry target. This Windows Home installation has no existing Windows
Sandbox; no system feature, security setting or extra guest was installed.
`officialAutoInstallEnabled` remains true as authorized; the three historical
validation flags remain false. Enhanced reattachment stays explicit.

No external AI provider, full MyGO real-video matrix, exhaustive locale/GPU
matrix, production shortcut/registry update, or unpublished remote candidate
download is claimed. These are retained release-validation limits.

Only fresh `qa` host/profile/project paths are mutated. Immutable production
inputs are copied read-only, while the production host hashes, scoped registry
snapshot and backups are retained under `evidence/restore-point`. The preserved
Terra process/session is not operated. Owned test hosts close normally and their
session leases/CDP listener must be absent at completion.

Relevant records: `node-suite-release-candidate.log`, `rc1-pinia-guard-final.log`,
`native-bridge-rc1.json`, `native-preview-hints.json`,
`native-preview-boundaries.json`, `native-fullscreen-rc1.json`,
`native-media-rc1.json`, `media-independent.json`, `installer-matrix.json`,
`final-artifacts.json` and `production-invariance.json` in the task evidence.

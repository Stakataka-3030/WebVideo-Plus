# 1.2.0 source verification and release gates

Cloud source checks on 2026-10-03:

- Node regression suite: 134 passed, zero failed/skipped
- Production C# product/download routing: 43 assertions passed, including the exact published 1.1.6 native release evaluator
- Exact archived 1.1.6 browser updater: correct 4.6.4→1.1.7 and 4.6.5→1.2.0 channel selection, ignores Craft/draft/prerelease, offline failure remains non-blocking
- Build-input cache/offline/archive traversal checks and update-suppression/wrapped-text atlas checks passed
- Full exporter, process guard, Terre launcher, manager and generated installer compile as C#5 / .NET4.8 against pinned references. Existing CS4014/CS0414 and reference-unification warnings remain
- Independent routing review resolved stale downloads/scans, selection-specific storage refresh, shortcut cycles, uninstall revalidation and an ACL enumeration fail-open. Reviewer independently reproduced the ACL condition then verified it blocks
- No cloud Windows GUI, install/uninstall, native rendered frames, audio/video export or GPU acceptance is claimed
- Production dual-host patch test: all 16 exact/structural variants pass JavaScript syntax checks
- Production engine adapter: 156 exact-identity/startup/bound-runtime assertions pass across official 4.6.4/4.6.5
- Production font/asset preflight scanner: 66 checks passed
- Actual pinned 4.6.5 runtime: 15 Cubism motion lifecycle scenarios, 15 image-diff dispatch scenarios and figure on/off frame-update parity checks passed

## Isolated native QA follow-up

Windows QA found that the earlier source attempted to save the shared last-install.json during preserve-data uninstall even with `--no-recent true`. The sandbox denied that write and the record remained unchanged. The manager now skips recent-record discovery, save and delete when that flag is true; install, forced repair, module changes and both uninstall modes use the same guard. 33 production-source assertions verify zero lazy path evaluation, present/absent sentinel preservation and unchanged default behavior. This flag governs the shared recent record only: isolated acceptance still requires explicit owned state, install-cache, work, game and output directories. It does not isolate all user storage or registry bookkeeping.

Rebuild the final installer; earlier packaged installers are superseded. Repeat the preserve-data uninstall regression and verify the shared record remains untouched. No permission bypass is required or allowed.

## Windows acceptance required for the exact final installer

Use an isolated fixture and normal Optimal-compression build; do not use Fast packaging. Run the existing installer verification and package integrity tests, then real GUI/host/export acceptance. Preserve real user installations and projects.

1. Select ordinary Terre, Craft and ambiguous mixed-product folders, EXEs and shortcuts. Craft must not be modified by the Terre installer. No download may target the opposite product, prerelease or repository-wide latest.
2. Switch path while release lookup or automatic discovery is pending. Old links disappear immediately; old results never overwrite the new path; module/storage fields belong to the newly selected instance. Repeat/cancel/close and broken/cyclic shortcuts remain safe.
3. Offline GitHub API, no formal Craft release and missing assets show explicit unavailable guidance. Once Craft is public, verify the observed download URL exactly matches its actual release asset.
4. Exercise clean install, upgrade from the previous stable build, module reconfiguration, uninstall and interruption/retry under isolated paths, checking host bytes and persisted settings.
5. Use the actual supported host/runtime to render and decode a multilingual project with image figures, motion/audio, manual statement cuts and figure on/off. Record input/output hashes, codec, dimensions, frame counts, duration, stderr and representative decoded frames. GPU tests only count when actually run on the selected hardware.

## Publication order and channel invariants

- Publish v1.1.7 first after its final gates; tag must target the tested 1.1.7 source commit. Asset name WebVideo+-Setup-1.1.7.exe. Compatibility marker: product terre, webgal [4.6.4]
- Publish v1.2.0 only after its own formal gates, tag targeting its tested source. Asset name WebVideo+-Setup-1.2.0.exe. Compatibility marker: product terre, webgal [4.6.5]
- MyGO3.2.1 / WebGAL4.6.4 remain on the 1.1.7 automatic update channel. Internal backward-compatible 1.2.0 paths do not broaden that recommendation
- Craft uses a separate craft-vN.N.N.Nc tag, product craft marker and WebVideoCraft-Setup-N.N.N.Nc.exe asset. No obsolete prerelease fallback
- Verify remote commit/tag and every uploaded asset's size/SHA256, then re-query the release API to test both products and engine channels. Main merge remains out of scope

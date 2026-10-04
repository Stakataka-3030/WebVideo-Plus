# Craft 1.1.4c integration checks

Checked in the cloud on 2026-10-02. This is a test build for user GUI acceptance, not a claim that the new native interface or rendered video pixels have passed Windows testing.

## Included feedback

- P1: 成片 and Video+ 设置 share the editor toolbar with 批量工具
- Feature ranges are embedded in each tool, retain independent selections and allow only applicable statements; source changes invalidate them
- P2: 单行提示 appears with the native display commands; export-incompatible commands are greyed and require confirmation before insertion, retaining native favorites/settings handlers
- P3: preset/filter libraries load on opening; choosing a preset loads it immediately; code/name/save controls appear only for manual input
- P4: native Export platform dialog includes full video, stage, dialog/DOM and audio cards, with Back, Close and reopen cleanup
- P5: shared export form has readable output, scope, resolution, quality and optional subtitle controls; stage background and figure flags are independent
- Focused kernel fixes retain model motion epochs/stopped poses and suppress figure output without changing simulation; strict Craft 4.6.4/4.6.5 identity and locale checks remain

## Completed verification

- 275 combined Node tests, including actual production UI/authoring code, full browser payload assembly, native bridge-to-kernel requests, all four stage-flag combinations, interrupted/repeated flows and the focused kernel regressions
- 119 production C# exact engine/profile/startup checks against official raw 4.6.4 and 4.6.5 engine inputs
- 61 production C# asset/scanner checks and 6 native manifest/path verifier groups
- 15 motion/identity scenarios against each actual SHA-256-pinned engine bundle; each actual Live2D plugin also verifies the ticker/render stop fence
- Both pinned Live2D plugins pass complete production scheduler comparison at 30/60 fps with standard/composite warmup. Figure enabled/disabled traces have identical commands, clocks, updates, draw traversal, media, waits and frame counts
- Export lifecycle regression, 16 pinned prepared runtime files and required source-input validation
- C#5/.NET4.8 compilation of the exporter, process guard, Terre launcher, Craft launcher, installer observer and setup source. Only existing CS4014/CS0414 warnings
- Independent review of both UI changes and the focused kernel port; production script ordering includes media-panel, export-dialog, command-panel and main, with both UI stylesheets

The aggregate command is:

```sh
node --test craft/tests/*.test.mjs tests/features-imports.test.mjs tests/craft-installer.test.mjs tests/craft-packaging.test.mjs tests/build-inputs.test.mjs tests/craft-setup-ui.test.mjs tests/craft-launcher.test.mjs tests/craft-source-inputs.test.mjs tests/cubism2-seam.test.mjs tests/figure-output-filter.test.mjs tests/webgal-dual-profile-workload.test.mjs
```

## Remaining acceptance

No new Windows entrypoint, installation, GPU pixel render, actual audio/video export or GUI screenshot was executed for this revision. This cloud's Chromium socket and local browser fixture restrictions remain; runnable visual fixtures are included. The user will test the new interface. Previous Craft acceptance applies to the earlier tested source only. Update-observer and same-name automatic-update gates remain disabled.

Use the canonical normal compressed Windows packaging procedure, including its built-in integrity checks. Do not substitute an uncompressed/Fast build, modify the host installation, or run extra user-computer tests as part of packaging. There is no new Craft remote publication, PR, main merge or Release in this change.

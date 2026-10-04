# Craft 1.1.5c integration checks

Checked in the cloud on 2026-10-02. Product 1.1.5c / installer 1.1.5.0c / PE 1.1.5.0 uses hybrid kernel 0.6.52 on the existing product 1.1.2 lineage. This is a Craft test build for user acceptance; it is separate from the stable Terre 1.1.6 release.

## Requested changes

- Filter selectors use content-sized grid rows; manual name/code/save controls share one hidden group, removing the inherited 140px vertical flex basis
- Timeline rows use shared Terre Chinese descriptions, filter names and compact summaries, with full source under collapsed details. Original Craft statement IDs, source ranges, selection eligibility and preview lines remain authoritative
- Known technical commands have Chinese labels. Craft 4.6.5 image-difference projection preserves actual image/model guards and subsequent state; unknown syntax remains conservative
- Broken location buttons are removed; ordinary preview and timed-hint preview/cancellation remain
- Actual Time is a per-project display toggle with refresh and native statement start/duration badges, including virtualized, blank/comment and multiline row alignment. Invalid or failed timing proof hides stale badges
- Actual Time and Music share one calculation/cache with independent cancellation. Project/source, preview speeds, full timing settings and dependency changes invalidate results
- Music opens with calculation/loading, a story/scene axis, player rows and draggable clips. Original duration, non-overlap, enable flags, selected volume, keyboard movement, explicit save, dirty-close checks and guarded backup/CAS writes remain
- Music fitting uses the Terre dialogue estimate and at most two measured refinements, then publishes the verified selected timing. File import uses Craft's native chooser; external Browser FileList drop is not claimed
- Exact MyGO 3.2.1 engine identity and its WebGAL 4.6.4 base remain separate through snapshot, queue, selection, preparation and cache/result checks. Strict MyGO does not discover a fallback. Official WebGAL 4.6.4 and 4.6.5 remain supported

## Completed verification

- 345 combined Node tests passed, covering the production browser payload, UI/controller integration, source and package inputs, engine contracts, four stage flag combinations, and existing motion/figure-output regressions
- 137 portable production C# checks passed against real official 4.6.4/4.6.5 raw and prepared bytes, plus strict MyGO request/cache rejection, no-fallback and locale contracts
- C#5/.NET4.8 compilation passed for exporter, process guard, Terre launcher, Craft launcher, installer observer and setup source; only prior CS4014/CS0414 warnings
- Export lifecycle, 67 required source inputs, 16 pinned runtime files, SDK/bootstrap/Node digests and the native source build receipt passed
- Integration keeps all navigation helpers, music-panel before media-panel, actual-time before main, and all three stylesheets in the production payload. Music scripts/styles are required by package validation

Combined Node command:

```sh
node --test craft/tests/*.test.mjs tests/features-imports.test.mjs tests/craft-installer.test.mjs tests/craft-packaging.test.mjs tests/build-inputs.test.mjs tests/craft-setup-ui.test.mjs tests/craft-launcher.test.mjs tests/craft-source-inputs.test.mjs tests/cubism2-seam.test.mjs tests/figure-output-filter.test.mjs tests/webgal-dual-profile-workload.test.mjs
```

## Acceptance limits

No new Windows entrypoint, installation, actual audio/video export, GPU pixel render or GUI screenshot was executed. Existing cloud browser restrictions remain; the included DOM tests and static layout checks are not a screenshot/layout-engine result. Runnable visual fixtures remain available for a separately permitted environment.

The historical compiled MyGO 3.2.1 fixture was unavailable in the cloud cache, Library search or official release/Actions artifacts. Its source tag and contract were inspected, but positive exact-byte MyGO Patch/Prepare and native rendered-video checks remain unrun. The optional real-byte harness and exact expected SHA-256 are documented in [ENGINE-PARITY-1.1.5c.md](ENGINE-PARITY-1.1.5c.md).

Previous real SDK/model and rendered acceptance evidence applies only to the previously tested source and scope. It was not silently rerun or generalized to this revision. Update-observer and same-name automatic-update gates stay disabled.

Use canonical normal Optimal-compressed Windows packaging with built-in integrity checks. User-computer access is packaging only, with no extra install, launch, render or acceptance tests. This change has not been published to a Craft remote branch, PR, main or Release.

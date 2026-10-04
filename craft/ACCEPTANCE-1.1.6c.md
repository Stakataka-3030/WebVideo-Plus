# Craft 1.1.6c test-build notes

Product **1.1.6c**, installer **1.1.6.0c**, PE **1.1.6.0**. Hybrid kernel remains
**0.6.52**, on the existing base product 1.1.2 lineage. This is a distinct Craft
test candidate, not a Terre release or a formal public Release.

## User-visible fixes

- Rapid scene changes and delayed responses no longer put old scene selections
  or errors back into a newer tool view
- Closing/reopening tools, losing the native editor or disposing the adapter
  cannot resume stale tool-opening work
- Hidden music views stop their own calculation consumer while keeping draft
  music; actual-time calculations owned by another view remain independent
- Closing a menu-opened tool returns keyboard focus to its native toolbar
  launcher, including after the native layout is rebuilt
- Project path or engine changes invalidate staged edits even when text matches
- Exports remain bound to the chosen project, source and engine while loading
  settings and preparing native snapshots. A stale matching filename/text can
  no longer silently select another project
- Interrupted submissions stop later selected ranges. Old cancellation requests
  only cancel their original jobs and cannot replace newer status messages
- Abandoned native snapshot allocations are discarded when preparation detects
  project/engine changes, unsaved documents or blocking-task startup failure

The previous compact filters, shared Terre descriptions, preview controls,
per-feature ranges, native actual-time badges, original-length music workflow,
four export modes and exact three runtime profiles remain in place. Existing
kernel cache/pipeline revision is retained because no exporter logic changed.

## Verified in the cloud

- 377 combined Node tests passed after the version update: production browser
  payload, UI/bridge/media regressions, source/package inputs, imports, strict
  engine contracts and existing motion/figure-output tests
- Current product/installer/PE identifiers agree across metadata, the two Craft
  C# assembly declarations and current documentation. Root/base kernel metadata
  remains 0.6.52; historical records keep their tested version numbers
- 67 required source inputs verified; changed JavaScript syntax and Git
  whitespace checks passed
- Independent review cleared UI lifecycle, export binding and snapshot cleanup

The aggregate command is recorded in
[the continuation audit](CONTINUATION-AUDIT-2026-10-02.md).

## Source continuity and limits

The source was restored from the delivered 1.1.5c archive after the cloud
checkout reset. All 315 baseline files match their recorded SHA-256/Git blobs
and exact tree `2e195e26f2dbd2397e77429e1493c8c0b9a7b395`, associated with original
commit `1a087fff22225dd2258bc90fa77db3d6688ad358`. The new local Git baseline is
explicitly a provenance reconstruction. The handoff includes the new complete
history bundle and exact final source manifest; it does not invent the missing
original ancestry.

No installer, Windows entrypoint, native screenshot, GPU render or real
audio/video export was executed for this revision. C# changes are version
attributes only; the packaging task must compile and run its normal integrity
checks. Historical native and C# evidence is not presented as freshly rerun.
The missing positive exact-byte MyGO fixture limitation in
[ENGINE-PARITY-1.1.5c.md](ENGINE-PARITY-1.1.5c.md) remains. Coordinated updates and
same-name automatic-update gates stay disabled.

Packaging must use the canonical normal Optimal-compressed Windows build.
User-computer access is packaging-only: no extra install, launch, render or
native acceptance. No remote branch, PR, main merge or Release was published.

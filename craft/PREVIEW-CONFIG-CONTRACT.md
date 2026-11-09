# Craft export configuration preview contract (2026-11-09)

Scope: baseline `2254340e3e0f2e8a9fd49a529ca4a9cfa2a11652`; Node/source checks only. No Craft host, browser, graphical plan/render, installer or release-tree changes were performed.

## Actual production path

- `craft/session/browser-payload.mjs:69` includes Craft's `ui/media-panel.js` and `ui/export-dialog.js`. Terre's `browser/export-component.js` is not evidence for this Craft path.
- `craft/ui/export-dialog.js:4-9` defines full video, stage, dialog/DOM, audio and SRT cards. Its card click handler at lines 47-63 calls `mediaPanel.attachExport(form, kind)` and preserves the native close button. It does not open a preview or fetch settings.
- `craft/ui/media-panel.js:306-315` resets the shared form and attaches it. Opening, returning and reopening do not call preview/settings APIs. Lines 299-300 refresh capabilities and poll only already-existing export jobs; this is not a preview startup.
- `craft/ui/media-panel.js:172` explicitly says automatic timing reads the current preview when export begins and asks the user to open that preview first. The manual text-speed field is explicitly labelled manual, not a reading of current game speed.
- `craft/ui/media-panel.js:225` reads `controller.readSpeeds()` at queue submission for automatic timing, including stage, dialog, audio and SRT. Explicit full-video manual timing is a separate existing mode. The queue button requires `previewSettings` capability (line 256).
- `craft/features/media.js:100-107` checks capability, reads real preview values and validates both speeds. `craft/host-bridge.js:167` rejects a missing current-game URL with `请先打开 Craft 当前项目的游戏预览`; it does not start a preview or return 50/50 defaults. `craft/launch-injected.mjs:123` verifies the requested URL still matches the host's current preview before using the preview session manager.

Conclusion: Craft already has a passive export-configuration path. No Terre-specific automatic preview-opening behavior was introduced. This change adds regression protection rather than claiming a Craft runtime fix that was unnecessary.

## Background verification

New tests cover all five kinds independently:

1. Open, close and reopen configuration with preview capability absent: no speed reads or service calls, existing preview guidance remains visible.
2. Submit automatic export: read actual distinct values 37/61 only at submission, and forward them to that kind's request.
3. Preview disappears before submission: report the failure, enqueue nothing, release busy state; never substitute default speeds.
4. Direct real host-bridge read with no preview: capability false, explicit rejection, no native IPC/RPC or preview-open call.

Commands and results:

- `node --test craft/tests/features-media-ui.test.mjs craft/tests/export-dialog.test.mjs craft/tests/host-bridge.test.mjs craft/tests/preview.test.mjs`: 103 passed, 0 failed/skipped.
- `node --test craft/tests/features-media.test.mjs craft/tests/music-panel.test.mjs`: 40 passed, 0 failed/skipped.
- `git diff --check`: passed.

These are source-driven VM/DOM and mocked bridge/CDP tests, not native host or visual acceptance, and not a full repository CI pass. Existing preview tests additionally exercise real Redux extraction code in VM and session/frame ownership checks with mocked CDP.

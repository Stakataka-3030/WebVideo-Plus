# Craft export UI parity

This change addresses the P4/P5 feedback against the verified Craft `v1.0.0-beta.2` host. It ports the ordinary Terre 1.1.6 export choices while retaining Craft's existing automatic-timing and verified-runtime contracts.

## Native entry and shared form

The native Export dialog's platform screen gains four cards: full video, stage, dialog/DOM and audio. Choosing one places the shared configuration form inside the same native dialog. Back restores the native platform screen; Close/reopen releases and reuses the same form. Native Web, desktop and Android nodes, click handlers and selected-platform state are not replaced. Unknown dialog shapes are ignored.

The integration is based on these pinned upstream sources, read during implementation:

- [ExportDialog.vue](https://github.com/A-kirami/webgal-craft/blob/v1.0.0-beta.2/src/components/export/ExportDialog.vue)
- [ExportPlatformSelector.vue](https://github.com/A-kirami/webgal-craft/blob/v1.0.0-beta.2/src/components/export/ExportPlatformSelector.vue)
- [DialogContent.vue](https://github.com/A-kirami/webgal-craft/blob/v1.0.0-beta.2/src/components/ui/dialog/DialogContent.vue)

The last file provides a viewport-bounded, vertically scrolling DialogContent. Added CSS is confined to extension surfaces, inherits the host font and uses the existing OKLCH theme channels. The integration does not modify official host files or claim an upstream public plugin API.

The editor's existing export tool and native dialog share `media-panel.js`; there is one form and one queue-tracking state. `main.js` must mount `WebVideoCraftExportDialog` after the media panel and dispose it before disposing the panel.

## Real request contract

- Full: MP4; resolution 720p/1080p/1440p/4K; 30/60 fps; integer workers 1–32; recommended/highest/lossless/compatibility quality
- Stage: `exportKind: stage`, independent `includeBackground` and `includeFigures`; MP4 with background, MOV ProRes 4444 or WebM VP9 Alpha without background
- Dialog/DOM: transparent MOV or WebM
- Audio: 48 kHz WAV; no full-video postprocessing or replacement music
- Scope: whole story, from current scene, current scene, or source-hash-locked statement ranges. The embedded export selector does not require a prior timing measurement. Disjoint ranges create separate tasks
- Optional subtitles: collapsed by default; readable named music choices and scene-statement choices replace copied IDs/manual line numbers. Only the selected anchor's controls appear
- Every request carries the exact source text into the existing bridge. Native snapshots, unsaved-document checks, runtime identity, source/revision guards and kernel validation remain authoritative
- Cancellation during asynchronous snapshot/queue creation cancels a returned in-flight job and prevents submitting remaining ranges. Closing the form does not cancel already queued rendering

No new manual/BGM timing, statement-cut, Cubism memory, update or unsupported custom-resolution options are exposed.

## Verification

Completed on the export worktree:

- `node --test craft/tests/features-media-ui.test.mjs craft/tests/export-dialog.test.mjs craft/tests/export-pipeline.test.mjs craft/tests/features-media.test.mjs`: 39 passed
- `node --test craft/tests/*.test.mjs tests/features-imports.test.mjs`: 174 passed
- Launcher/installer/package-inclusive aggregate (the command in `craft/README.md`): 216 passed
- Syntax checks for modified JavaScript and `git diff --check`

The tests cover native card identity/handlers, duplicate mount, Back, native Close, reopen, native next-step replacement, stage flag combinations, transparent formats, audio exclusions, quality/resolution/FPS/scope, invalid workers/extensions, source changes, range hashing, cancellation during queue creation, and the actual `createBridge` → `KernelSession` request path with a captured transport.

These are DOM and request-contract tests. They are not a new Windows render or actual native-pixel acceptance. Installed cloud Chromium failed at startup with `socket() failed: Operation not permitted`; no screenshot pass is claimed and no user-computer UI test was run.

A runnable viewport/light/dark fixture is included for a permitted Chromium environment:

```sh
CHROMIUM_PATH=/path/to/chromium node craft/tests/render-export-layout.mjs --out /absolute/evidence/export
```

It captures platform/full/stage/DOM/audio at 1280×800, 960×720 and 640×720, checks viewport bounds and that the submit action can be scrolled into view. Generated PNGs must be opened and visually reviewed; fixture success alone is not Windows Craft acceptance. Combined integration tests must be rerun after merging the separately owned main UI wiring.

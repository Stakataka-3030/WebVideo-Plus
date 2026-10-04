# Craft actual-time and export-music workflow

This implements the explicit 2026-10-02 request to restore the actual timing and music workflow from Terre, rather than relabeling Craft's previous numeric control panel. Reference source: WebVideo+ 1.1.6 `browser/video-workflow.js`, `browser/timing-tasks.js` and `browser/music-timeline.js`.

## Shared timing controller

Actual Time and export music use the same controller. Equivalent source, verified dependency and complete effective-setting identities share one timing job. Each view owns an AbortSignal; canceling one consumer leaves other consumers active. The final consumer cancels a queued or running job, including cancellation while its ID is still being created.

The controller checks source, revision, project/runtime binding, preview speeds and project dependency identity before publishing results. Cached results retain complete effective settings, including FPS. Scene `lineTimes` from the backend already contain global milliseconds; displays must not add scene offsets again. Synchronous display lookup uses already validated evidence, while explicit measurement/refresh performs the expensive guarded dependency snapshot.

The separately integrated native Actual Time widget provides the editor toggle, refresh action and per-statement start/duration annotations. It shares this controller with music instead of exposing the previous separate measure/verify/lock-number toolbox.

## Music workflow

Opening music automatically reads preview speed, obtains current measured story timing and loads the current project's saved music. The panel shows a story axis with scene boundaries and a row for each player. Imported clips keep their original duration. Dragging can move a clip in time or across players; arrow keys adjust by 0.1 seconds. The controller retains same-player collision avoidance. Disabled tracks remain selectable so their participation can be restored.

Each player has an Add action using Craft's native audio chooser. The adapter deliberately does not pretend a browser FileList supplies authorized native filesystem paths; external file-drop import is not added in this change. Moving clips already on the timeline is supported.

Selected clips expose volume, participation in export and removal. Multiple players can overlap; a player's clips do not. Save writes the existing schema-2 `video-project.json` through guarded VFS, backup and compare-and-swap. It does not substitute Terre's broader project metadata object. Dirty drafts survive same-project remeasurement and are retained independently by project. Closing/switching tools or entering native export consults the dirty-state leave guard. Native export cannot silently use/discard an unconfirmed draft.

Changing one preview speed recalculates measured time. Matching uses Terre's dialogue-based timing estimate for a single scene and its multiscene rough estimate, then at most two measured refinements. Only checked speed dimensions are changed; audio is never time-stretched. A successful match publishes its measured result back to the shared timing cache. Craft's existing preview persistence proof remains authoritative; unproven settings storage stays session-only.

## Verification and boundaries

Controller regressions cover independent cancellation, stale source/runtime/speed/dependency/effective-setting evidence, queued-ID cancellation, dirty state, project drafts, failed backups, compare-and-swap, post-write project-switch baseline and the fitting/cache contract.

UI regressions cover automatic opening flow, native per-player chooser, individual speed edits, cross-player dragging, keyboard nudge, original duration, clip enable/disable, selected speed participation, source remeasurement, dirty leave refusal/discard and listener cleanup. Export regressions still cover all existing mode/flag/range/format routes and native Back/Close/reopen restoration.

No new Windows UI run or rendered screenshot is claimed. The earlier cloud Chromium socket restriction remains. Final combined production-payload checks must include `music-panel.js` before `media-panel.js` and the new `music-panel.css`, alongside the separately integrated Actual Time helper and its stylesheet. No GitHub publication or user-computer test was performed for this work.

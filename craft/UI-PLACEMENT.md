# Craft GUI placement redesign (pending visual/native acceptance)

## What changed

The old fixed bottom-right launcher and eight-tab, viewport-sized modal have been removed. The extension now mounts compact entries into inspected Craft beta.2 editor surfaces:

| Host location | WebVideo+ entry and features |
| --- | --- |
| Editor tab-row toolbar, alongside mode/sidebar controls | **批量工具**: ID completion, expression preparation, add/replace filters, `-next`, automatic exits |
| Same editor toolbar | **制作**: optional multi-selection, checks/review, actual timing, Anogo/AI import, backups; presets/hints also remain reachable when the command panel is collapsed |
| Header action group with native Test/Export/Settings | **成片**: original-length music, timing/speed matching, video/subtitle export |
| Header action group | **Video+ 设置**: character mapping, AI provider, preset library, Craft update coordination |
| Native bottom command-panel category row | **Video+ 预设** and **单行提示** |

Each action shows only its relevant controls in a nonmodal dock. The editor keeps its own navigation, preview, native undo/redo, statement properties and ordinary command catalog. Current-line scope follows Craft. An expanded source picker is available only for advanced multi-selection/range operations.

The dock reserves layout space instead of covering the editor or game preview. At an editor-content width below 840px, it switches to a bottom section using 42% of that area's height. These are implementation rules, **not a claim that the native pixels have passed acceptance**.

Controllers and revision-guarded transactions remain in place. Source changes invalidate staged edits; switching tools clears unrelated plans. Changes that arrive while an asynchronous action is busy are reconciled afterward. Vue header/route replacements remount one set of entries; missing anchors leave the UI parked invisibly rather than displaying a floating fallback.

## Inspected host anchors

The local official beta.2 source was read, rather than assuming Terre's React/Fluent ribbon exists in Craft:

- `src/components/editor/EditHeader.vue:270–327`: native header and Test/Export/Settings action group
- `src/components/editor/EditorToolbar.vue:29–69`: mode/sidebar controls, including `data-tour="mode-switch"`
- `src/components/editor/EditorPanel.vue:178–235`: editor tab row, content host, editor area, command panel and native properties sidebar
- `src/components/editor/CommandPanel.vue:186–237`: native command-category row
- `src/components/editor/VisualEditorStatementCard.vue:199–234`: native per-row actions slot, inspected but **not modified by this change**
- `src/components/ui/button/index.ts:6–35`: compact ghost-button sizing and color conventions

These are version-specific internal integration points, not an official public plugin API. The runtime uses DOM controls with Craft theme tokens and host placement; it does not falsely claim to instantiate Craft's private Vue components.

Terre's actual placement reference remains `browser/toolbar.js`, `browser/menu-actions.js`, `build-timeline.mjs`, and `manager/ProductIntegration.cs`. The transfer preserves functional grouping instead of relocating the old giant toolbox.

## Verification completed

- `node --test craft/tests/*.test.mjs tests/features-imports.test.mjs`: **156 passed, 0 failed** on this change
- Launcher-inclusive aggregate: `node --test craft/tests/*.test.mjs tests/features-imports.test.mjs tests/craft-installer.test.mjs tests/craft-packaging.test.mjs tests/build-inputs.test.mjs tests/craft-setup-ui.test.mjs tests/craft-launcher.test.mjs`: **198 passed, 0 failed**
- Production payload executes in initial/reinjection DOM fixtures
- Native entry placement, idempotent remount, missing-anchor fail-closed behavior, focused tool visibility, custom/native selection scope, close cleanup, atomic commit and stale-plan guards
- Reviewed host contracts: OKLCH channel tokens are wrapped in `oklch()`; sizing targets only the direct native layout containing `editor-area`, leaving teleported effect/animation drawers untouched; native/source changes reset range-selection anchors
- Existing media/import/authoring/review/backup/session tests remain passing
- `node --check craft/ui/main.js`, `node --check craft/ui/media-panel.js`, `node --check craft/tests/render-native-layout.mjs`, and `git diff --check`

## Visual verification boundary

**No rendered screenshot is claimed or attached.** This cloud session could not start installed Chromium: its process singleton socket failed with `Operation not permitted`, including the approved escalated execution attempt. The separate cloud browser rejected localhost (`ERR_BLOCKED_BY_CLIENT`) and file URLs (URL policy). Those routes were stopped. No Windows/local task was launched to work around the user's quota constraint.

A faithful isolated host-shell fixture and screenshot/assertion runner are committed:

```sh
CHROMIUM_PATH=/path/to/installed/chromium node craft/tests/render-native-layout.mjs --out /absolute/evidence/directory
```

The runner covers 1752×1108, 1280×800, 1024×768 and 960×720, light/dark tool views, every exposed tool, editor/preview non-overlap bounds, range selection, source invalidation and header remount. It requires Playwright available to Node and a supported Chromium execution environment. Its screenshots must still be opened and visually reviewed. Fixture success is not actual WebView2/Craft acceptance.

## Consolidated native check when quota permits

Use one existing disposable project and one combined launcher/UI build:

1. Start through the redesigned launcher; open a scene. Check the exact four native regions above at 1752×1108 and 1280×800, then narrow to 1024×768. Keep preview/editor readable; ensure no floating launcher, giant modal, clipping, duplicate controls or horizontal overflow. Check dark mode, closed/collapsed command panel, and the native effect/animation drawer while a tool dock is open
2. Exercise ID completion preview → apply → Craft native Undo/Redo; switch the native current row, choose a custom range, edit the source while a plan is staged, close/reopen and switch scenes/projects. Confirm one-step native undo and stale-plan rejection
3. Open all grouped feature entries; verify music/export and import cancellation remain available while busy. Reopen/remount after Craft navigation. Do not send real AI text, perform updates or render a full movie solely for layout acceptance

Do not package/publish this UI as visually accepted until that check is completed. This change does not add unsupported layer/audio selectors: the current Craft export controller still submits the implemented full-video kind.

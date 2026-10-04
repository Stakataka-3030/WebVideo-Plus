# Craft GUI placement redesign (pending visual/native acceptance)

## What changed

The old fixed bottom-right launcher and eight-tab, viewport-sized modal have been removed. The extension now mounts compact entries into inspected Craft beta.2 editor surfaces:

| Host location | WebVideo+ entry and features |
| --- | --- |
| Editor tab-row toolbar, alongside mode/sidebar controls | **批量工具**: ID completion, expression preparation, add/replace filters, `-next`, automatic exits |
| Same editor toolbar | **制作**: checks/review, actual timing, Anogo/AI import, backups; presets/hints also remain reachable when the command panel is collapsed |
| Same editor toolbar | **成片**: original-length music, timing/speed matching, video/subtitle export |
| Same editor toolbar | **Video+ 设置**: character mapping, AI provider, preset library, Craft update coordination |
| Native bottom command-panel category row | **Video+ 预设** |
| Native command-card grid, adjacent to full-screen text / video | **单行提示**, following native card presentation |

Each action shows only its relevant controls in a nonmodal dock. The editor keeps its own navigation, preview, native undo/redo, statement properties and ordinary command catalog. Current-line scope follows Craft. Each applicable tool embeds its own source picker directly below its controls; there is no standalone selection tool or range-picker detour. Custom selections and search state are remembered independently per tool until the source changes. Filters expose only background/figure targets and opt-in animation targets; expression preparation, -next and named-filter editing share their authoring eligibility rules with every checkbox, select-all, invert and numeric-range operation.

The dock reserves layout space instead of covering the editor or game preview. At an editor-content width below 840px, it switches to a bottom section using 42% of that area's height. These are implementation rules, **not a claim that the native pixels have passed acceptance**.

Controllers and revision-guarded transactions remain in place. Source changes invalidate staged edits; switching tools clears unrelated plans. Changes that arrive while an asynchronous action is busy are reconciled afterward. Vue header/route replacements remount one set of entries; missing anchors leave the UI parked invisibly rather than displaying a floating fallback.

## Presets, filters and export-incompatible commands

Preset and filter libraries load when their feature opens. Choosing/searching a preset immediately adopts its code. Preset and per-target filter code editors, names and save controls are visible only for **手动输入**. A manual draft survives temporarily switching back to a library preset. Changing selection or a preset invalidates a staged preview.

Command cards use beta.2's `data-command-panel-drag-kind="command"` and `data-command-panel-command-type` attributes, not translated titles. Nine command IDs blocked by the exporter (`choose`, `jumpLabel`, `chooseLabel`, `setVar`, `if`, `callScene`, `showVars`, `getUserInput`, `return`) have muted content and a confirmation before click, keyboard or drag insertion. Favorite/default-edit action slots remain native and unguarded. The warning says the command remains usable in Craft and can prevent video export. Cancellation does not insert; one pointer/keyboard gesture does not prompt twice.

Static `changeScene` is not grey: `SceneChain.Expand` flattens the supported static form before export preflight. Unsupported arguments/dynamic targets still fail preflight. The stable Terre reference groups game commands and displays a static-scene notice; it does **not** contain the requested grey/confirmation rule, so this is an explicit Craft UX addition rather than a claim of byte-for-byte Terre parity.

## Inspected host anchors

The local official beta.2 source was read, rather than assuming Terre's React/Fluent ribbon exists in Craft:

- `src/components/editor/EditHeader.vue:270–327`: native header and Test/Export/Settings action group
- `src/components/editor/EditorToolbar.vue:29–69`: mode/sidebar controls, including `data-tour="mode-switch"`
- `src/components/editor/EditorPanel.vue:178–235`: editor tab row, content host, editor area, command panel and native properties sidebar
- `src/components/editor/CommandPanel.vue:186–237`: native command-category row
- `src/components/editor/CommandPanelCard.vue`, pinned `v1.0.0-beta.2`: card drag attributes, keyboard insertion and third-child native action slot
- `src/features/editor/command-registry`: full-screen text/video display category, verified against the bundled parser enum
- `src/components/editor/VisualEditorStatementCard.vue:199–234`: native per-row actions slot, inspected but **not modified by this change**
- `src/components/ui/button/index.ts:6–35`: compact ghost-button sizing and color conventions

These are version-specific internal integration points, not an official public plugin API. The runtime uses DOM controls with Craft theme tokens and host placement; it does not falsely claim to instantiate Craft's private Vue components.

Terre's actual placement reference remains `browser/toolbar.js`, `browser/menu-actions.js`, `build-timeline.mjs`, and `manager/ProductIntegration.cs`. The transfer preserves functional grouping instead of relocating the old giant toolbox.

## Verification

The updated deterministic suites execute the actual UI and authoring code, including menu placement, per-feature eligibility, independent ranges, source-change invalidation, automatic preset selection, manual-only code fields, click/keyboard/drag confirmation, native action-slot preservation, remount and disposal. The final integrated test count is recorded by the integration acceptance run; isolated worker results are not an integrated build claim.

The committed Chromium runner also checks the new menu row, in-feature selection and preset/manual visibility. `node --check`, inline HTML script parsing and `git diff --check` are required alongside the aggregate below:

```sh
node --test craft/tests/*.test.mjs tests/features-imports.test.mjs tests/craft-installer.test.mjs tests/craft-packaging.test.mjs tests/build-inputs.test.mjs tests/craft-setup-ui.test.mjs tests/craft-launcher.test.mjs
```

## Visual verification boundary

**No rendered screenshot is claimed or attached.** This cloud session could not start installed Chromium: its process singleton socket failed with `Operation not permitted`, including the approved escalated execution attempt. The separate cloud browser rejected localhost (`ERR_BLOCKED_BY_CLIENT`) and file URLs (URL policy). Those routes were stopped. No Windows/local task was launched to work around the user's quota constraint.

A faithful isolated host-shell fixture and screenshot/assertion runner are committed:

```sh
CHROMIUM_PATH=/path/to/installed/chromium node craft/tests/render-native-layout.mjs --out /absolute/evidence/directory
```

The runner covers 1752×1108, 1280×800, 1024×768 and 960×720, light/dark tool views, every exposed tool, editor/preview non-overlap bounds, embedded range selection, preset/manual code visibility, source invalidation and header remount. It requires Playwright available to Node and a supported Chromium execution environment. Its screenshots must still be opened and visually reviewed. Fixture success is not actual WebView2/Craft acceptance.

## Consolidated native check when quota permits

Use one existing disposable project and one combined launcher/UI build:

1. Start through the redesigned launcher; open a scene. Check the native regions above at 1752×1108 and 1280×800, then narrow to 1024×768. Keep preview/editor readable; ensure no floating launcher, giant modal, clipping, duplicate controls or horizontal overflow. Check dark mode, closed/collapsed command panel, and the native effect/animation drawer while a tool dock is open
2. Exercise ID completion preview → apply → Craft native Undo/Redo; switch the native current row, choose a custom range, edit the source while a plan is staged, close/reopen and switch scenes/projects. Confirm one-step native undo and stale-plan rejection
3. Open all grouped feature entries; verify music/export and import cancellation remain available while busy. Reopen/remount after Craft navigation. Do not send real AI text, perform updates or render a full movie solely for layout acceptance

Do not package/publish this UI as visually accepted until that check is completed. Native export-dialog choices and export-setting request mapping are documented and verified separately in the integrated media change.

## Compact descriptions and spacing follow-up

The filter picker uses intrinsic grid rows, not the general 140px flexible field basis on a vertical flex axis. Name/code/save controls share one hidden manual wrapper, with a scoped hidden rule even outside the dock. The screenshot's blank dropdown spacing is therefore removed at the container level, rather than masking only the textarea.

Craft navigation now uses `features/navigation-description.js` to project the unchanged Terre `navigation-model`, metadata, timeline helpers and filter matcher onto the original Craft statement IDs. The projection contributes presentation only; it cannot replace commands, arguments, source ranges or selection eligibility. Main rows show a bounded Chinese action/target/parameter summary. Full human-readable details and the complete source are collapsed under “详情”. Raw source remains searchable. The screenshot's known numeric filter matches the existing “清晨／黄昏（轻） · 背景” factory entry. Actual `setTransform`/animation commands still require the animation opt-in regardless of their displayed filter name.

Broken “定位” actions have been removed from the embedded row/review controls. Existing ordinary and timed preview handlers keep their original source line. The cancel-timed-hint button is visible only while its timed-preview promise is active; other busy actions no longer show that control. Its cancellation semantics are unchanged.

Deterministic tests cover the exact screenshot values, multiline identity/ranges, Chinese descriptions, source-token search, independent feature eligibility, manual wrapper switching and preview line arguments. The Chromium fixture contains real height assertions and can capture the compact layout when a permitted rendering environment is available; those new pixel checks were not executed in this cloud environment.

## Actual time on native statements

“显示实际时间” and its recalculate control live beside Craft's editor mode controls. Read-only badges attach to verified beta.2 virtual statement headers and show the shared Terre format `mm:ss.s · n.ns`. Native `data-index` includes blank/comment/trailing rows; it is mapped to full parsed physical ranges, never to the filtered feature-picker list. Badges disappear when their source/speed/dependency proof is stale, and a recycled virtual row must pass both index and native ordinal checks before decoration.

The display setting is stored per project (project ID plus project path). Actual time and music share the same controller and job/cache. The widget uses a dedicated AbortController so turning it off, switching scene or disposing it cancels only its own interest, not music's measurement. The 700ms check reads speeds cheaply; it does not repeatedly export the VFS for a dependency proof. Full dependency validation happens on activation/scene entry and explicit recalculation. The former standalone time-tool menu has been removed. Music's close/switch guard is respected, and switching to another tool deactivates its view rather than leaving an invisible calculation consumer alive.

Native DOM-contract tests cover checkbox/cache/refresh, multiline and empty row indices, recycled rows, stale source/speeds, project switches, duplicate mount and independent consumer cancellation. New GUI pixels remain unverified until a permitted native acceptance run.

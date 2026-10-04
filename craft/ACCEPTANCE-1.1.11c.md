# Craft 1.1.11c awaited owned-confirmation correction

Product1.1.11c, installer1.1.11.0c, PE1.1.11.0; base product1.1.2 and
kernel0.6.52 unchanged. Baseline is exact
`28827de5b200ae0ffa58111d27222d74797c2ce2`, tree
`f820f393fc92a9180d4b84743431c86a8c9b37d3`. Prior artifacts stay immutable.

## Native failure being corrected

The real allowlisted Craft beta.2 host implements window.confirm as an async
function invoking `plugin:dialog|confirm`. Its Promise rejects with
`Command plugin:dialog|confirm not allowed by ACL`.

The 1.1.10c production client treated that Promise as a synchronous boolean.
It therefore closed display dialogs and requested update.prepare before any
explicit affirmative answer. Native QA used an inert refusing transport, so no
official preparation/helper/installer ran; the failed test was retained. This
is a critical consent failure, and that candidate's confirmation was rejected.
Awaiting the native function alone would remain unusable because of its ACL.

## Narrow correction

The official-update flow now uses the adapter's own HTML dialog, without native
dialog IPC, new permissions or edits to frozen Tauri APIs. It shows the exact
target version, what will close, signature re-verification, and the requirement
for compatible enhancement re-adoption. Cancel is focused initially. Only the
explicit Install button can return literal true; Cancel, Escape, dialog closure
or page teardown return false. Unsupported dialog functionality fails closed. Owned pointer/focus/Escape events
are contained so interaction cannot dismiss underlying native About/details;
only the owned dialog overrides inherited pointer-events, without changing body
policy. A temporary scoped window-capture Escape listener protects native layers
that handle keys during document capture and is removed on dismissal.

The client awaits that result and requires `answer === true`. While pending,
there is no update.prepare/commit/abort RPC, no closing of About/details, no
normal-window-close call and no manual application-inert mutation. A single
pending operation prevents duplicate requests. Temporary context subscriptions
and lifecycle listeners are cleaned after resolution. Detached or old controls
cannot authorize a newer request.

Before acting on true, the client rechecks document, app/Vue/Pinia identity,
update/editor/modal/workspace stores, selected project and update version,
owned client/bridge identity and resource associations. Observed version/project
changes invalidate a pending answer even if subsequently restored. Pagehide and
beforeunload invalidate late answers. The same checks repeat across subsequent
awaits; saved/known-work and backend task/session checks remain in place.

Runtime officialAutoInstallEnabled remains true. The three historical
*Validated fields remain false. Signed staging, the clean helper, normal close,
prelaunch cancellation, own-updater mutation lock and product routing are
unchanged. There is no new genuine signed forward target or automatic remount.

## Retained native evidence and limits

The exact unchanged OfficialInstallerLauncher.cs has SHA-256
`a2f069afa65ecee6f392b6e457e7d2e80a4f0ca8ecd4e8587738fdd51c57d178`.
On 1.1.10c, Windows compiled it and passed33 contract assertions and8 actual
inert-helper cases, including30,059ms close grace, prelaunch cancellation,
cancellation after observed installer and during final preflight. This evidence
covers unchanged helper code, not this new dialog or a real signed upgrade.

Prior actual own-Setup open/live-install refusal/Cancel, Anogo/undo, short
recommended NVENC export and independent normal window close passed. The
1.1.10c official confirmation/Cancel flow did not pass. Existing392 production
file hashes and four registry groups were restored; no test process/lock or
real official preparation remained. No official NSIS rerun is required here.

## Final cloud source verification

- Full shared/Craft Node suite822/822 passed
- Composed feature preflight173/173 passed
- New exact assembled-payload confirmation suite91/91 passed, including actual
  owned dialog button interactions and explicitly deferred Promise fixtures
- Combined confirmation/client/reinjection/payload checks176/176 passed
- Exact beta.2 controller/store with actual Pinia3.0.4/Vue3.5.35 probe passed;
  its confirmation dependency is explicitly inert, not a native dialog claim
- Source preflight85 required inputs and whitespace diff check passed

All new dialog tests here use deterministic DOM/VM fixtures. Actual WebView
rendering, focus, native toast/detail flow and real clicks must be accepted on
Windows before this candidate is called ready. Source-level passing results do
not override the failed1.1.10c native consent finding.

## Required native retest

1. Materialize the new source and verify every handoff hash. Reuse existing
   cached host/runtime/SDK/compiler/AI inputs; no baseline or model downloads.
   Build new1.1.11.0c artifacts and descriptor from that exact EXE. Do not relabel
   the1.1.10c binary; helper-code evidence may be retained when hashes agree.
2. On actual beta.2, drive the exact native About/toast/details controller with
   the explicit inert provider/transport used in the failed test. Verify the
   owned HTML dialog is visible, readable and Cancel-focused; no forbidden
   Tauri dialog call occurs. Do not override the confirmation result.
3. Leave the dialog unanswered: no prepare, native modal closure, host closure
   or installer. Cancel/Escape, repeat, page reload and late/stale answer cases
   must preserve Craft/document and not produce a late preparation.
4. Click the actual Install button. With an explicitly refusing inert prepare
   transport, exactly one prepare occurs only after the click, and failure
   restores editing. A separate no-installer inert handoff may prove that true
   reaches the existing normal-close command; label it as such, not a genuine
   signed forward upgrade or successful NSIS installation.
5. Verify no duplicate dialog/route on reinjection, no borrowed approval from a
   previous dialog, and unchanged readonly native APIs. Smoke primary tools and
   own-updater Cancel behavior as needed. Normally close/unmount the test copy,
   verify recovery hashes and absence of test processes/locks.

No official NSIS, Sandbox, reboot, security/capability changes, production
project edits or publication are authorized by this handoff. Genuine future
signed installation remains unproven; historical evidence flags stay false.

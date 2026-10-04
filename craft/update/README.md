# Official Craft update bridge (1.1.11c)

## Runtime policy and historical acceptance

### Confirmation correction in 1.1.11c

Native 1.1.10c acceptance found that beta.2 replaces `window.confirm` with an
asynchronous Tauri `plugin:dialog|confirm` call and rejects that command by ACL.
The old synchronous truthiness check was a critical consent failure: its Promise
could begin preparation before any answer. That candidate is not accepted.

1.1.11c uses an owned HTML dialog and no Tauri dialog call or permission change.
Its Promise is awaited and only literal `true` from explicit Install permits
progress. Cancel, Escape, page teardown, unavailable dialog support, rejected
confirmation, stale document/Pinia/store/project/version and late answers fail
closed before modal closure or preparation. Single-flight state remains active
while the prompt is pending. Exact asynchronous/DOM contract tests accompany
the fix; real Windows confirmation acceptance must be rerun.


In 1.1.10c the package-bound `officialAutoInstallEnabled` policy is **true**.
It enables only the selected `CleanUpdateCoordinator`; it never enables the
legacy dirty-environment observer path. The installed ownership state and exact
package manifest must agree before the clean helper accepts this policy.

`updateObserverValidated`, `sameNameUpdateValidated` and
`officialCleanUpdateValidated` remain **false** as historical acceptance evidence.
The user explicitly accepts untested future-target risk; that is permission to
open the runtime feature, not evidence that a forward official upgrade passed.
Same-version official NSIS installation mechanics and explicit re-adoption were
previously tested on the authorized registered installation. There is still no
newer signed official target that proves the complete forward-upgrade route.

Official checks and native signed downloads retain the official source. Native
download completion now leads directly to an owned installation confirmation,
including from the original toast or update-details flow. The clean helper
re-fetches the same official target, independently verifies its original
signature and requests normal main-window closure. A prevented close must cancel
installation before launch; it must not silently leave a future installer armed.
Unknown updated hosts remain ordinary official applications, with explicit
compatible re-adoption required for enhancements. See
[1.1.10c acceptance](../ACCEPTANCE-1.1.10c.md) for exact current evidence.

## Exact upstream contracts

The corrected frozen-Tauri integration was also run against actual Pinia 3.0.4
and Vue 3.5.35 with the exact beta.2 controller/store source, not only the small
DOM/store unit fixtures. `craft/tests/verify-pinned-official-guard.mjs` is a
read-only reproduction probe that checks dependency versions and official Git
blob hashes, then runs the original controller with inert services. It requires
Node 22.13+ and an existing isolated dependency directory containing those exact
versions. Run from the repository root:

`node craft/tests/verify-pinned-official-guard.mjs <official-beta2-source-root> <isolated-dependency-root> craft/update/client.js`

The probe itself performs no downloads, native IPC, process/registry actions or
installer execution. It covers captured actions, repeated download, direct and
patch state writes, duplicate guard registration, read-only Tauri, changed store
identity and the permanently unsafe late-attach case. Dependency preparation
must follow the QA environment's input-reuse constraints.

The allowlisted official host is Craft `1.0.0-beta.2`, SHA-256
`3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d`.
Its immutable source commit is `edccdf0d10572a31a3ee8619ad3b43d2ce5c91aa`.
The adapter never patches it, changes its configured endpoint or substitutes a
new public key/trust store.

Primary sources inspected:

- [Craft updater configuration](https://github.com/A-kirami/webgal-craft/blob/edccdf0d10572a31a3ee8619ad3b43d2ce5c91aa/src-tauri/tauri.conf.json), blob `a9d7780bc9ca360b73b0a48396c485cc3a0abbf5`
- [Craft Cargo.lock](https://github.com/A-kirami/webgal-craft/blob/v1.0.0-beta.2/src-tauri/Cargo.lock), blob `e4b31f3b113d4f3d757c4f671943bef898c048ef`, pins updater `2.10.1`, Minisign verifier `0.2.5`
- [Craft update service](https://github.com/A-kirami/webgal-craft/blob/v1.0.0-beta.2/src/services/app-update/update-service.ts), blob `67968904a0155dffc0797b156e1d2d42fe50b9d4`
- [Craft update controller](https://github.com/A-kirami/webgal-craft/blob/edccdf0d10572a31a3ee8619ad3b43d2ce5c91aa/src/features/app-update/useAppUpdateController.ts), blob `1167d5e283fb90f5eb37bb2aa6ce9abd6a534592`
- [Craft update store](https://github.com/A-kirami/webgal-craft/blob/edccdf0d10572a31a3ee8619ad3b43d2ce5c91aa/src/stores/app-update.ts), blob `85120da16959d5e53d5f654676da43d582add18d`
- [Pinia 3.0.4 action ordering](https://github.com/vuejs/pinia/blob/v3.0.4/packages/pinia/src/store.ts#L383-L394): `$onAction` subscribers run before the wrapped action
- [Pinia 3.0.4 synchronous state subscriptions](https://github.com/vuejs/pinia/blob/v3.0.4/packages/pinia/src/store.ts#L440-L466) and [detached subscription lifetime](https://github.com/vuejs/pinia/blob/v3.0.4/packages/pinia/src/subscriptions.ts)
- [Pinned updater commands](https://github.com/tauri-apps/plugins-workspace/blob/updater-v2.10.1/plugins/updater/src/commands.rs), blob `129c413c2b41ab349b4eb4252d2b78847d8e7541`
- [Pinned Windows updater/signature implementation](https://github.com/tauri-apps/plugins-workspace/blob/updater-v2.10.1/plugins/updater/src/updater.rs)
- [Pinned install-mode arguments](https://github.com/tauri-apps/plugins-workspace/blob/updater-v2.10.1/plugins/updater/src/config.rs)
- [Minisign verifier 0.2.5](https://github.com/jedisct1/rust-minisign-verify/blob/0.2.5/src/lib.rs), blob `953907b6bc09c4f506c051f30e2a3523e9b0b7ca`
- [Tauri resource API](https://github.com/tauri-apps/tauri/blob/tauri-v2.11.5/crates/tauri/src/resources/plugin.rs), blob `098dabd79cedb8080aaf848359e064c936be81ea`
- [Official NSIS template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi), blob `d372e3c391770cf231db974422a1e4f8adaac3a6`
- [NSIS process checks](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/utils.nsh), blob `3c5bf75f5ccc96a5863ac8bf3c3870b47641c410`
- [NSIS auto-relaunch implementation](https://github.com/tauri-apps/nsis-tauri-utils/blob/nsis_tauri_utils-v0.5.3/crates/nsis-process/src/lib.rs)
- [Official process-exit permission](https://github.com/tauri-apps/plugins-workspace/blob/process-v2.3.1/plugins/process/permissions/default.toml)

Updater 2.10.1's install command accepts only update and bytes resource IDs.
`restartAfterInstall:false` is unsupported. Default passive NSIS uses
`/P /R /UPDATE /ARGS ...`, checks/kills processes by original EXE name, and
relaunches the ordinary entry. Non-elevated RunAsUser uses ShellExecuteW without
clearing WebView environment variables. Calling that native install command from
our instrumented host could therefore pass debugger/profile variables into the
restarted official app. The clean path deliberately replaces that invocation.

Native downloaded bytes are opaque resources; Tauri exposes only resource
close, with no supported read/stage API. The bridge therefore performs a second
download rather than reading Rust memory or inventing a resource extraction API.

## Clean signed handoff

1. Native QA found Tauri's `internals.invoke` property non-writable and
   non-configurable. The client now **never mutates native internals**. Its
   `invoke` facade belongs to the adapter and records only its own official
   check/download resource IDs, native current/new versions and raw metadata.
   Closed resources lose their association. The WebVideo+ update panel must do
   its own fresh check/download; native UI resources remain private to Craft.
   Its optional combined call uses the same signature-checking native download.

   The pinned official controller directly invokes a module-private service;
   there is no exported pre-install action or supported resource extraction API.
   The detached Pinia pre-action/subscription guard retains the raw-install
   protection. A legitimate `setDownloaded` while updating is synchronously
   normalized back to available, before any other code can observe an installable
   state. Pinia's action-after hook queues the owned route after the original
   controller emits its normal downloaded toast. No fake error toast is emitted.
   Direct/patch risky writes and installed/restarting transitions remain guarded.
   Native Install/retry may re-download before offering the confirmation again,
   because its private resource is not reused or extracted. The separate owned
   panel remains a direct alternative; it is not required by the native route.

   Already downloaded/installed/restarting state at attachment stays ambiguous.
   It is normalized, but installation remains disabled for that document until
   a fresh session. Missing/replaced stores similarly fail closed. Optional
   update failures never prevent the primary editing/export UI from mounting.
   Client status requires the current safe guard and runtime policy; it separately
   exposes the unchanged acceptance evidence rather than claiming a verified upgrade.
2. Confirmation explains saved documents, completed native/background work,
   the second download, normal close and explicit enhancement re-adoption.
   Declining does not close a native details dialog or Craft. After confirmation,
   only the display-only AboutModal and UpdateDetailsModal are closed through their own supported store action;
   other native modals, dirty documents, resource work and observable lazy ledgers
   block. An absent lazy runtime-task ledger is not fabricated and does not prove
   universal idle. Backend checks independently include WebVideo jobs, in-flight
   RPCs, snapshots, metadata writes, context identity and generation fences.
   The official-close proof has a distinct scope from own-Setup-GUI opening.
3. `official-stage.mjs` pins the exact official endpoint and key from the
   immutable configuration above. It independently retrieves fresh metadata
   from that same endpoint and requires matching version, target, URL and
   signature. Only Windows x86_64 NSIS is supported. Strict semantic-version
   comparison refuses equal/older targets and binds the current version/hash
   to the exact known host profile.
4. HTTPS source URLs are limited to the official repository's release assets.
   Every redirect is rechecked; only the GitHub release-assets CDN is additionally
   accepted. No credentials/cookies are forwarded. Metadata and artifact size,
   redirects and request lifetime are bounded. Provider errors remain errors;
   there is no alternate prerelease feed, unknown mirror or unsigned fallback.
5. The second installer download must pass exact Minisign key ID, raw Ed or
   Blake2b-512-prehashed ED payload signature, and the second trusted-comment
   signature. Algorithm bytes are compared without ASCII high-bit masking.
   The authenticated filename must equal
   `WebGAL Craft_<version>_x64-setup.exe`, binding product/version/architecture
   rather than trusting mutable receipt metadata. Staging publishes only after
   complete verification and cleans partial files on failure/cancellation.
6. The detached clean helper re-verifies the package, ownership, staged bytes,
   Minisign signatures and signed identity. It takes a bounded update lock and
   starts the compiled `CraftOfficialInstaller.exe` in a sanitized per-process
   environment. No remote process environment or system setting is changed.
7. The native helper requires exact owned process paths and retained handles.
   Read-only registry preflight verifies HKCU 64-bit product/install/uninstall
   paths, binary name, publisher and current version. Matching machine-wide
   registrations in either registry view are rejected: official NSIS can prefer
   an HKLM MSI uninstall before its /UPDATE bypass. Foreign same-name processes
   are rejected before arming and again immediately before installer launch.
8. Only after native `armed` does the wrapper receive `update-handoff` and exit.
   The helper confirms its retained wrapper handle exited before returning
   ready. The client rechecks native task/document state and commits. The helper
   persists its request and confirms the native command was received.
9. The client uses Craft's permitted native `plugin:window|close {label:'main'}`
   to request ordinary main-window closure, preserving close-request handling. It does **not** invoke updater install. The helper waits
   for the retained host handle to exit. The session detaches committed work and
   cleans up with code 75; uncommitted preparation aborts on page/session loss,
   and staging cancellation waits for file/network cleanup.
10. Immediately before launch, the native helper repeats target/process checks
    and SHA-256 checks the already signature-verified installer while holding a
    read-only, non-delete-shared file handle. It launches the unchanged official
    NSIS bytes with the official passive/relaunch/update switches and pinned
    argument escaping. Its own inherited WebView debugger/profile/pipe variables
    are removed before ShellExecute. A real installer handle is retained through
    completion; the helper never kills it.
11. Completion writes a diagnostic journal and bounded native recovery notice.
    No helper rewrites the host, restores an old backup or automatically remounts.
    The new official original-name entry remains runnable through the normal
    shortcut. Explicit reattachment requires an adapter package that allowlists
    that exact new host; a valid official signature alone is not compatibility.

The native deadline is 900 seconds with a 5-second watchdog margin. The notice
closes after 30 seconds with a 35-second watchdog. No service, scheduled task,
startup entry or resident watcher is created. Committed indeterminate outcomes
retain the update lock. Only an actual installer exit or a trusted native
not-started receipt releases it automatically. Explicit stale recovery must
verify all recorded processes are gone; an unobserved committed request is not
made successful by elapsed time. Original/new host bytes are never rolled back.

## Verification and actual publication status

As checked 2026-10-03, the unchanged official latest-stable metadata endpoint
returns HTTP 404. GitHub lists six releases, all prereleases; the newest is
`v1.0.0-beta.2`, already the allowlisted host. The adapter does not silently
replace the official feed. Its tag-specific public metadata and installer were
downloaded into the cloud only for read-only signature verification:

- Metadata: 5,748 bytes, SHA-256 `054b7f1a10002a1799b2dcc2044906ead6d3b8ca9245dad303c209634902ca44`
- Installer: 14,168,780 bytes, SHA-256 `383d3d9b299054c9356d2892fed6702f6ff0864612a7e8abc2e866628a391b58`
- Official ED signature and trusted comment pass; altered bytes fail
- Independent OpenSSL `pkeyutl -verify -rawin` checks also pass for both the
  Blake2b-512 artifact digest and signature-plus-trusted-comment message. The
  OpenSSL digest was compared directly against the actual installer bytes.
- Trusted comment binds `WebGAL Craft_1.0.0-beta.2_x64-setup.exe`
- This does not exercise a forward update, a native installation, or enhancement
  compatibility with a future version

Read-only fixture command:
`node craft/tests/verify-official-fixture.mjs metadata.json official-installer.exe`

Portable tests cover upstream raw/prehashed vectors, algorithm/key/comment
failures, signed filename relabeling, SemVer/downgrade, URL/redirect and download
limits, staging failure/abort, clean environment filtering, client commit/exit
selection, helper ordering and retained locks. Frozen/native read-only invoke
regressions also cover descriptor preservation, captured action references,
repeat guard initialization, direct/patch writes and ambiguous late attachment.
The deterministic Pinia fixture is explicitly not a substitute for the native
repeat of the exact production payload after this UI-mount correction. Actual C#5/.NET4.8 compilation
checks the native source; it is not Windows execution.

`powershell -NoProfile -File craft/tests/native-clean-handoff.ps1` builds inert
Windows fixtures plus the production helper source under an alternate test
entrypoint. It tests wrapper/host exit ordering, signature-verified-hash handoff,
clean inherited environment, success/failure, byte tamper and timeout. It does
not run Craft, NSIS or production registry preflight and reports those limits.
`native-update-observer.ps1` separately tests the legacy read-only observer.

**A copied EXE and isolated WebView profile do not isolate official NSIS.**
Genuine official NSIS acceptance requires a correctly registered installation
under explicit authorization and recovery backups; copied-EXE tests alone cannot
substitute. A prior authorized same-version registered-install test passed, but
that does not establish a forward upgrade. Verify official check and
signed download; safe user cancellation; exact registry target; no unrelated
same-name process; signature/tamper/downgrade refusal; wrapper/host exit before
installer; actual NSIS process-tree completion; clean auto-relaunch and no old
CDP listener/profile inheritance; normal shortcut restart; unknown host preserved
and explicit compatible reattachment; failure/cancel/timeout recovery; all helper
processes bounded with no system persistence. Concurrent external launches and
registry changes must also be covered. The three historical acceptance fields stay false while the runtime policy is
open. There is currently no newer signed official target available to demonstrate
an actual beta.2 forward update. Current native retesting uses the existing local
inputs and inert helpers; do not rerun official NSIS, enable Sandbox or change
security settings just to manufacture a forward-update claim.

## WebVideo+ installer update release validation

### Generate descriptor after native compilation

Run `node craft/update/build-release-descriptor.mjs <absolute-final-EXE-path>`.
The only production CLI input is the EXE path. Version and exact filename come
from checked-in `craft/version.json`, which is never rewritten by this helper.
The helper hashes the final bytes, rejects a changing file, then atomically writes
`webvideo-release.json` beside the EXE. It returns both artifact SHA-256 values,
installer size, exact release tag and required body marker. The descriptor uses
lowercase 64-hex `sha256`; the GitHub API uses `sha256:<same hex>`. Upload both
final artifacts to the same draft release, then independently compare GitHub
asset digests and sizes to the generated values before any publication gate.

### Required isolated Windows / release validation matrix

All Windows tests use a copied supported official Craft installation, a new
adapter directory/profile and disposable test project. Do not install into,
close, edit or recover the production user's session to run these checks.

1. Start via the original `webgal-craft.exe`, open a scene, open Video+ settings,
   and verify the two separately labeled update sections. Confirm opening the
   panel causes no update fetch, download or installer process. Reopen the panel
   and reload the WebView; each entry remains mounted exactly once.
2. Before publication, validate generated descriptor fields, EXE byte size and
   both SHA-256 hashes against native build output. A local/inert fixture may
   test protocol behavior but must not be described as a live GitHub acceptance.
3. Once an authorized published test/candidate release is available, run a
   prior compatible installer-version fixture against the live public release
   list. Confirm exact Craft tag, body marker, descriptor, GitHub digests and
   canonical EXE asset. Other Terre releases must never become a candidate.
   A current-version fixture must report no higher Craft release. Keep the
   release unpublished until all required gates permit actual publication;
   this live check is explicitly pending while the candidate is unpublished.
4. Check offline/HTTP error, rate limit, descriptor missing/damaged, wrong
   product/channel, missing digest, non-GitHub redirect, truncated download and
   SHA mismatch through inert transport fixtures. Each is a visible failure;
   none launches an EXE or reports up-to-date/installed. Ensure partial files
   are removed and Retry succeeds with corrected fixture bytes.
5. Download explicitly. Verify a random cache directory outside adapter and
   host trees, exact file bytes and no spawned installer. Repeat download and
   repeat clicks. Reload/restart must require a new explicit check; cached
   executable bytes must never be discovered and auto-run on startup.
6. With an unsaved native document, an active export/runtime task, and missing
   native task-store state, click Open in each case. All must refuse without
   creating an installer process. Test a state change during disk hashing;
   stale CDP execution-context responses must also refuse.
7. With clean saved state, click Open once. Observe exactly one normal Setup
   GUI process from the verified external-cache path, with no silent arguments.
   Confirm Craft stays open, status says only opened, and Setup refuses
   component mutation while that Craft session lives. Normal Close/Cancel in
   Setup must not kill Craft or change installation ownership.
8. Close Craft normally, preserving its normal save prompts. Continue Setup
   from the already-open window and apply the normal authenticated transaction.
   On success, relaunch only the original Craft EXE and verify current product
   version and enhancement entry. On cancellation/failure, verify the previous
   owned installation still opens and can retry. These installer outcomes are
   separate evidence from the updater's `opened: true, installed: false` result.
9. Exercise Explorer fallback. Verify only the exact rehashed installer is
   selected. Tamper with/delete/link the downloaded file before Open/Reveal;
   both must reject or show a safe file error and never launch changed bytes.
    Include a second hard link and tampering during the second native-state
    read. Inspect Setup and its launched Craft child environment to confirm
    neither session WebView debugging arguments nor profile override is present.
10. Start an official update prepare concurrently with each own-update stage.
    Enforce mutual exclusion, including operations that start during the
    awaited host-state read. After the own installer is opened, official
    handoff remains blocked until a new Craft session. Read official recorded
    recovery status without enabling an unvalidated native handoff gate.

Record native screenshots, exact source commit, package/installer hashes,
process observations and installer transaction output for each executed row.
Leave unavailable/live-release/official-NSIS checks explicitly pending; passing
portable fixtures cannot promote a native gate.

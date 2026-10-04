# Craft 1.1.8c original-entry and update candidate

Product 1.1.8c; installer 1.1.8.0c; PE 1.1.8.0; base product 1.1.2;
hybrid kernel 0.6.52. This is an isolated testing candidate, not release approval.
Baseline: cf626c0aaff0fd96d543c995268f0f797ceddc59; tree
5ceb6cb05cb0df6254e33f89c5eedeb80cd2b5b7. The source archive restored for this work
has SHA-256 de6c6a9614ced6d2a337da24f4cff0ccbbf9d01af21f97161554d98c853424b1.

## Changes ready for isolated Windows testing

- Only the original webgal-craft.exe is offered as a user entry. The immutable
  package launcher is a replacement template; legacy shortcuts redirect to the
  original entry. No external-mode UI or new external-mode CLI installation
- Transactional legacy migration preserves installation ID, preferences,
  mutable data and logs, and rolls back owned writes at every failure stage
- Known, allowlisted official host replacements can be explicitly re-adopted
  without restoring the old host over the new one. Unknown/current changed
  bytes, foreign recovery files and ownership mismatches remain untouched
- Both host/config records must agree before launch. Normal command-line
  arguments reach the host; original host cwd, per-install mutex, responsive
  startup, logging containment and per-session ownership remain
- Verified legacy desktop links migrate to the original entry; new shortcuts
  remain opt-in and unrelated existing links are never overwritten
- Wrong Terre/mixed-product selection fails before installation. Stable
  product-specific download routing uses declared engine compatibility, never
  repository-wide latest or the obsolete Craft cloud-test prerelease
- The in-app WebVideo+ Craft updater has explicit check/download/open-installer
  actions, product/tag/architecture-by-package/version integrity gates, a
  SHA-256-bound release descriptor and GitHub asset digest checks. Downloads
  use an external cache. Repeated actions, dirty/busy projects, file tampering,
  hardlinks and close/reinjection races are covered. Opening Setup is not an
  installation-completed result

## Release blockers

The official host updater must not be treated as fully adapted yet. All three
updateObserverValidated, sameNameUpdateValidated and officialCleanUpdateValidated
remain false. Check/download
and official signatures are preserved; unsafe native install is refused with
recovery instructions. The clean-environment signed installer handoff is implemented in cloud source
but is not enabled or natively accepted. It independently preserves the official
Minisign key/signatures and uses a bounded clean-process launcher because Tauri keeps verified downloaded bytes as opaque Rust
resources and NSIS /R can inherit WebView2 session debugging/profile variables.
See update/README.md for the current exact design, pinned-source evidence,
independent signature verification and remaining acceptance gates.

No genuine official NSIS test is authorized merely by copying the EXE: /UPDATE
reads the user's registered installation. End-to-end proof requires an isolated
registered Windows installation in an approved disposable VM or Windows Sandbox.
A separate Windows user alone does not isolate machine-wide installer registration.
Never test it against the user's production account registration.

## Native QA matrix

Reuse verified existing local hosts, prior build/package trees and caches. Do not
start new host/runtime/model downloads. Missing baseline inputs are blockers to
report. Real-NSIS isolation requirements are in ISOLATED-UPDATE-QA.md.


1. Compile and run craft/tests/setup-gui.test.ps1 and launcher-gui.test.ps1.
   Use their inert fixtures only; retain result logs and screenshots at normal
   and high DPI. No production project/profile or original installation writes
2. Install into a fresh, identified Craft beta.2 copy outside temporary source
   extraction folders. Verify original bytes and package manifest, launch only
   original EXE, assert in-app menus, editor undo, preview and short export
3. Repeat launch during startup and during an active session. Verify one owned
   session, responsive feedback, original cwd and quoted/unicode/path arguments
4. Migrate an old external installation including custom adapter directory and
   preferences; verify original-EXE launch, legacy shortcut forwarding/migration,
   original shortcut continuity and uninstall restoration. Keep unrelated links
5. Update same-name package, repair damaged declared files, cancel preparation,
   exercise failure/rollback, retry and retained recovery warnings. Unknown
   host or ownership changes must remain byte-for-byte unchanged
6. Select Terre 4.6.4/4.6.5, unknown engine, mixed directory and shortcut chain;
   verify no writes and correct stable product route, including changing the
   selected path while a download route lookup is outstanding
7. Exercise own-update clean current/no-update, new release, offline/error,
   invalid product/digest/downgrade, cancel/close, explicit installer open and
   refusal to install until Craft exits. Do not publish a fake release for QA;
   use inert dependency-injected fixtures where an authenticated release is absent
8. Run synthetic native-clean-handoff.ps1 and native-update-observer.ps1 only
   as synthetic evidence. Never
   enable genuine-update flags from these tests alone

Native evidence must identify the exact source commit, package/EXE SHA-256,
product/installer/file versions and environment. Historical Craft tests are
background; they do not establish this candidate's native acceptance.

## Cloud evidence for the first gated milestone

- Full Node suite: 513/513 passed
- Production Setup protocol/cancellation: 327 assertions (300 races)
- Production path/metadata: 80 assertions plus 3 link rejection cases
- Shared product routing: 43 C# assertions
- Actual native verifier: 6 acceptance/rejection groups
- Actual Setup/launcher and both inert WinForms harnesses compile as C#5/.NET4.8
- Source preflight: 76 required files; CRLF-aware diff whitespace check passed

These are source/portable/compile checks. No actual Windows GUI, Craft process,
NSIS, native installer click, GPU/export or live candidate-release execution is
claimed by this milestone. The real Chromium screenshot attempt failed before
page creation due to this executor's process-singleton socket restriction.

## Clean signed-handoff source increment

The increment after milestone 7b889164 adds authenticated product/version/x64
identity, pinned running-host version+hash, exact Minisign Ed/ED and trusted-comment
verification, provider URL limits, atomic owned staging, prelaunch revalidation,
registered-target and conflicting-install refusal, retained native process handles,
clean process-only WebView2 environment and explicit user confirmation/host exit.
No new trust store, remote-process environment write, resident watcher, autostart,
service, production registry write or automatic injection into unknown new hosts.

Official beta.2 installer fixture: 14,168,780 bytes; SHA-256
383d3d9b299054c9356d2892fed6702f6ff0864612a7e8abc2e866628a391b58.
Node and an independent OpenSSL verification both pass data/comment signatures;
modified bytes and signed-identity relabels fail. No Windows EXE was executed here.
The unchanged official latest.json endpoint currently returns 404 and beta.2 is
the newest published version, so a genuine forward signed target is unavailable.

Native helper pure contracts pass 30 assertions; its actual production C# source
compiles against .NET4.8. Synthetic native process tests are provided but unrun.
The full Node suite and archive identity are recorded in the final handoff.

Final clean-handoff source regression: 542/542 Node tests passed; 81 source
preflight files verified. Production Setup contracts 327, path/metadata 80 plus
3 link cases, shared routing 43, native verifier 6 groups and official-launcher
pure contracts 30 passed. Setup, launcher, official helper and inert GUI harnesses
compile as C#5/.NET Framework 4.8; this is not Windows runtime acceptance.

## Native-discovered read-only Tauri regression

The f3fd62dc native candidate failed actual UI attachment: the pinned beta.2
host defines Tauri invoke as non-writable, and the attempted assignment threw
before editor tools mounted. Its editor, preview, export and own-update UI
acceptance therefore did not pass. The candidate executable must not be published.

The corrected source never changes Tauri internals. Adapter update calls use
an owned facade; official native UI uses the pinned app-update store's supported
subscriptions to refuse install-ready/restart transitions while enhanced.
Official checks/downloads remain native. Optional updater initialization failures
produce disabled status and diagnostics, without preventing the editor tools
from mounting. The install-state guard is armed independently of both optional
updater clients, and existing ambiguous install/restart state disables coordinated
installation for that document. See update/README.md for the exact source seam.

New full-production-payload tests cover non-writable/non-configurable invoke,
frozen native internals, repeated same-document injection and optional updater
initialization failures. These regressions do not replace repeating actual
Windows UI, edit/undo, preview, short export and own-update panel acceptance on
the rebuilt candidate. Prior native Setup, launcher, inert helper and
installation/migration/rollback/uninstall passes are useful historical evidence,
not acceptance of new executable bytes. All genuine official NSIS gates remain
false and require isolated registration as described above.

Corrected-source cloud regression: 559/559 Node tests; 81 source-preflight inputs;
actual Setup, launcher, official helper and both inert GUI harnesses compile as
C#5/.NET Framework 4.8. The independently executed real Pinia/pinned-controller
probe is described in update/README.md. No new native UI pass is claimed here.

## Native-discovered composed-parser regression

Native testing of 95827eee passed the read-only Tauri fix: UI mounted without
diagnostics, edit/undo, document reinjection and Bridge-only partial recovery
passed. Actual Anogo preview then found that the composed payload's local
vendored parser was still being read as a window property. That candidate's
import acceptance was not complete and it must not be published.

The corrected script adapter receives and validates its bundled parser as an
explicit closure dependency. It neither creates nor reads an ambient window
parser. The novel adapter also receives an explicit narrow shared-core facade;
the shared Terre-only planner is not exposed as a Craft operation.

Full production-payload preflight now actually parses scenes, makes authoring
plans and navigation descriptions, performs Anogo JSON/YAML preview and apply,
cancels a preview, rejects stale-buffer apply, and completes an inert two-stage
novel preview/apply. These run across normal/reinjected/frozen-native/partial
initialization and a conflicting non-writable ambient parser. They use the
bundled production parser/YAML/novel implementations, not test replacements.
AI service responses and editor commits are inert fixtures; no provider request
or real editor/native export acceptance is claimed by these tests.

The reported native export request rejection was a test-input error: 640x360 at
12 fps and 1280x720 at 24 fps are outside the supported presets and correctly
failed validation. The actual GUI then exported 720p/30 fps, one worker,
traditional mode, sceneOnly/no range successfully: H.264, 141 frames, 4.7 seconds,
with both expected sentences visible. That output took 7.77 seconds on the test
machine and has SHA-256
2fcb167afb83c5963dd3bdd9aa389b7572c84a5f70e44d7e37e042d2ae105115.
This evidence belongs to 95827eee; recommended mode and the new source still
need native acceptance. An old fetch-mocked pipeline fixture also used an invalid range sourceHash;
the new contract checks pass actual UI/bridge/kernel requests through production
C# validation instead of treating an unconditional mock HTTP 200 as evidence.
Native baseline export should use a supported preset and omit the optional
range until full-scene export passes. Exact settings and harness are documented
in the source handoff. Actual Anogo and export GUI acceptance must be repeated.

Corrected composed-source regression: 561/561 Node tests, including 40 export
requests produced by the full assembled browser payload and actual UI controls.
`pwsh -NoProfile -File craft/tests/export-contract.portable.ps1` passes all 48
production-validator cases: 40 valid requests plus 8 rejection controls,
including both exact unsupported native-test resolution/frame-rate combinations.
No production export settings or validation rules changed. Source preflight
still verifies 81 inputs; all five C#5/.NET Framework 4.8 targets compile.
Additional composition preflight (`node craft/tests/composed-feature-preflight.mjs`)
passes 173 existing feature assertions with all production libraries sharing the
outer closure. This supplemental harness preserves deliberate feature mocks,
omits bootstrap/CSS and reports its minimal fake-DOM exclusion; exact full-payload
tests and native acceptance remain separate requirements.

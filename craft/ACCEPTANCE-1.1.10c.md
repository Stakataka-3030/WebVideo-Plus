# Craft 1.1.10c official automatic-install runtime candidate

Product 1.1.10c; installer 1.1.10.0c; PE 1.1.10.0. Base product 1.1.2 and
native kernel 0.6.52 remain unchanged. This continues exact source
`df6fe7cec5fc38ba0e6c12d3b76fbf55571865df`, tree
`a543352d8cedfeaeb03b712cc52d7d0a36980877`; all prior source and binary artifacts
retain their identities.

## User-visible flow and policy

The explicit user request is to keep official automatic installation available
while accepting possible bugs. `officialAutoInstallEnabled` is true in this
version's source and generated package/installed ownership record. The three
historical acceptance fields remain false:

- `updateObserverValidated`
- `sameNameUpdateValidated`
- `officialCleanUpdateValidated`

This opens the signed clean-environment path; it does not falsify native test
results or enable the legacy dirty-environment observer path. Package and state
must agree. Signature/key, target version, downgrade, provider/redirect, exact
host, ownership, registration and retained-process checks remain mandatory.

Official Craft check/download entry points retain their native behavior.
After a native download completes, the supported Pinia action-after hook offers
the owned install confirmation directly. A synchronous subscription holds the
native store out of its private raw-install branch; no frozen Tauri API is
modified. The original downloaded toast is emitted normally, not a synthetic
failure. Declining leaves Craft and any native details modal open. Retrying the
native action may download again because its opaque private bytes are not read.

On confirmation, the bridge closes only the display-only AboutModal and UpdateDetailsModal through
their public store method, waits for its normal removal, checks saved/observable
work and stages the exact official target with its original Minisign signature.
Backend checks include active WebVideo jobs, pending RPCs, snapshots, metadata,
context identity and activity revisions. New enhancement RPC work is held while
handoff is active. A lazy absent native ledger is never synthesized, and this
is not claimed to prove all asynchronous native work idle: users must finish
all work before confirming. The official normal-close proof is distinct from
own-Setup-GUI opening.

The client asks the main window to close through its existing permitted native
window command. It never force-exits the process. The clean helper releases the
owned wrapper, waits for normal host closure, then launches the unchanged signed
installer with the official switches in a per-process clean environment.
Prelaunch cancellation and bounded close grace prevent a rejected close from
leaving an installer unexpectedly armed. Cancellation does not kill an already
started installer. A close request is never described as installation complete;
uncertain outcomes preserve recovery state and are disclosed.

The official updater may overwrite the wrapper with the newer official EXE and
relaunch that ordinary entry. No helper rewrites the new host or restores an old
backup. Enhancements require explicit compatible re-adoption; an unknown future
host is not silently mounted. No service, startup entry or scheduled task is
created.

WebVideo+ Craft's separate own updater keeps its explicit stable-channel check,
verified download and ordinary Setup opening. Its live-session mutation barrier
still requires Craft to be normally closed before installation. This feature
is separate from the official host updater.

## Evidence and limits

The exact pinned beta.2 controller/store and actual Pinia 3.0.4/Vue 3.5.35 probe
checks synchronous state ordering, successful original downloaded toast,
queued owned confirmation, Cancel/repeat behavior, no raw install/restart,
read-only native API descriptors, ambiguity at late attachment and changed
store identity. No official native installer is run by that probe.

The exact assembled production payload test also invokes this native-download
route and Cancel/repeat sequence in all six mount/reinjection/frozen-API/parser
variants. It continues to exercise real Anogo/parser/novel feature functions and
own-updater actions, rather than testing mount alone.

Historical native evidence already establishes registered same-version official
NSIS mechanics and explicit compatible re-adoption. No true newer signed target
exists in that evidence, so a complete real forward update is unproven. Opening
runtime policy is not a replacement for that missing test. Current source and
inert helper tests are listed in the source handoff; new Windows GUI/helper
acceptance remains required for these exact bytes.

### Final cloud source checks

- Full shared/Craft Node suite: 731/731 passed on Node 24.19.0
- Composed feature preflight: 173/173 passed
- Exact clean-helper VM: 30/30 passed with simulated Windows/filesystem/IPC only
- Independent focused source review: 132/132 passed after the final retention fix
- Exact upstream controller/store with actual Pinia 3.0.4/Vue 3.5.35: confirmed
  native routing, Cancel/retry, normal-window-close selection and read-only APIs
- Source preflight: 83 required inputs verified; whitespace diff check passed
- The manual CI workflow now runs all shared/Craft Node tests and the composed
  preflight with explicit failure exits before its existing native smoke build

No new C# compilation or Windows helper/GUI execution was performed in this
cloud environment, whose prior native toolchain is unavailable. Those stages
remain pending for the exact new source, using the existing Windows caches.

## Native acceptance handoff

Use the existing Windows test thread and verified local inputs/caches. Do not
redownload hosts, runtimes or models. Do not run official NSIS again for this
revision, enable Sandbox, reboot, change security settings or edit a production
project. Build the new version, verify PE/package policy/evidence values and
record exact new hashes. Never rename a 1.1.9c binary to this version.

1. Compile the exact production C# helper and run the inert native helper and
   contract suites. Cover normal host/wrapper ordering, safe prelaunch Cancel,
   Cancel during checks, prevented normal close, grace expiry, missing commit
   acknowledgement, disconnected coordinator, tamper, foreign process, timeout,
   and a started inert installer that must never be killed by cancellation.
2. On the actual pinned host, confirm the unchanged read-only Tauri descriptors
   and naturally absent lazy task store. Check primary tools mount and own-update
   behavior. Do not create a fake idle runtime-task store.
3. Exercise the exact native controller/guard with an explicitly test-only inert
   service and real UI. Native download completion must offer confirmation;
   Cancel must preserve the document/modal and never call the raw native install
   or restart commands. Repeat/reinjection must not accumulate routes/prompts.
4. Test the normal-window-close command on an owned disposable Craft session,
   without a real official installer. Keep the no-installer fixture clearly
   separate from claims about a complete signed forward upgrade. Verify normal
   document handling, teardown and no surviving test processes.
5. Use inert fixtures for the coordinated helper path, cancellation/deadline/race
   cases and native work that must block host close. A confirmed no-start outcome
   must restore editing; indeterminate/started outcomes must never claim no
   installation. Record the exact outcome and journal/lock cleanup.
6. Smoke Anogo preview/apply/undo, preview/timing and a short recommended export.
   Recheck own Setup open → running-install refusal → Cancel and normal cleanup
   if source integration changes touch that flow. Preserve user-file hashes.

A test-only newer manifest, patched signature, substituted production key,
weakened antirollback or same-version fixture cannot prove a genuine forward
upgrade. Keep the three historical acceptance fields false unless that actual
combined route is later established.

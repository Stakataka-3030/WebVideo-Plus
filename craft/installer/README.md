# Craft installation transaction contract

The adapter payload remains outside the Craft directory, but the only supported user entry is the original `webgal-craft.exe`. New packages declare `launchMode: same-name`; Setup and the CLI reject external mode. Historical external records remain readable for transactional migration, including custom adapter locations and legacy shortcuts. The package launcher is an immutable replacement template; legacy direct launches redirect to the original-name entry.

## Trusted package and host inputs

`MANIFEST.json` schema 1 declares every immutable package file and its SHA-256/size, plus `entry`, `node`, `kernel`, `wrapper`, and a `supportedHosts` allowlist. All relative paths must stay inside the package; duplicate/case-colliding paths, unknown files, links and reparse points are rejected. Mutable `config.json`, `state/` and `logs/` are not payload entries. The first verified host is the official Craft 1.0.0-beta.2 executable with SHA-256 `3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d`; another hash is not made compatible merely by recording it.

Native Setup captures the GUI request and runs it on a background worker, reporting coarse stages and elapsed time on the UI thread. Busy inputs, repeated actions and normal window closure remain blocked until the operation and cleanup finish; there is no force-cancel timeout. Errors return to the UI with a full diagnostic log and permit retry. The synchronous command-line exit contract remains unchanged.

Native Setup extracts into a fresh temporary coordinator directory, verifies the complete package, then invokes `craft/installer/manage.mjs`. It never executes a coordinator from a directory being replaced. The external adapter directory is not allowed to contain, or be contained by, the Craft host directory.

## Ownership and rollback

The adapter record is `adapterRoot/config.json`. In same-name mode, its mirror is `host/webvideo-craft.install.json`, the original program is `host/webgal-craft.webvideo-original.exe`, and the verified wrapper occupies `host/webgal-craft.exe`. Keeping the original in the same host directory preserves relative resource paths. Installation and upgrade stage verified files, preserve mutable state, and retain exact ownership hashes. Repeat installation of identical verified bytes is a no-op. External-to-original-entry migration stages the full package, preserves identity/config extensions/mutable state, then commits the original backup, wrapper and mirror atomically with rollback ownership checks. A known officially updated current EXE can be explicitly re-adopted by Install; its new bytes replace the old backup, never the reverse. Unknown hashes and changed ownership remain untouched.

Host-level and adapter-level exclusive locks prevent cooperating installers from racing. Rollback tracks only paths actually changed by that transaction. It verifies their post-write hashes and payload-tree fingerprints before restoring/removing them. A foreign change stops rollback and retains recovery material; it is never overwritten to make an operation appear successful. Retained transaction journals are diagnostics, not an automatic crash-repair promise.

Uninstall restores only a still-owned wrapper. If an official updater or another process has replaced the host entry, uninstall preserves the new executable and reports `host-changed`, retaining recovery. Adapter payload, configuration and logs are retained outside the host. No game project, OS font, registry setting, global environment variable or service is modified by these transaction functions.

## Session and update coordination

The session owns an exclusive `state/session.lock` file with `{sessionId,pid}` and a `state/session.json` lease with coordinator/host/wrapper PIDs. Any live or unknown owner blocks installation mutations. Stale-lock recovery is explicit, requires a matching lease and all recorded processes to be gone, and never kills a process based solely on a PID.

CraftStarter verifies the package, original executable, current wrapper and ownership records before starting Node. It passes `--state`, `--craft`, `--kernel` and `--wrapper-pid`; arguments following `--` stay available to the official host. WebView2 debugging is configured only by the child session. Exit code 75 means a one-shot external coordinator owns an update handoff; the native wrapper exits immediately to release the original-name executable.

The installed host and canonical adapter records must agree on all executable paths, immutable package fields, product identity and ownership hashes before launch. The wrapper forwards ordinary arguments after a separator while retaining explicit isolated-test options; host cwd is its own installation directory.

`prepareUpdateUnmount` restores the original entry after the recorded host/wrapper have exited, while retaining recovery. `remountAfterVerifiedUpdate` additionally requires a trusted coordinator verifier callback and an allowlisted updated host hash. Caller-supplied JSON is not authoritative evidence of an official update or installer completion. The public remount CLI is disabled. See `../update/README.md` for the new official update handoff: retained native process handles, wrapper release before install, a committed bounded helper and exact per-product recovery guidance. Historical `updateObserverValidated` / `sameNameUpdateValidated` / `officialCleanUpdateValidated` fields remain false until the complete true forward-upgrade route is proven. In 1.1.10c the separate package-bound `officialAutoInstallEnabled` runtime policy is true by explicit user request; it enables only the signed clean-environment path, never these historical evidence flags. No resident watcher or implicit remount exists. A present `state/update.lock` blocks mutation throughout official install observation.

## Validation boundaries

`tests/craft-installer.test.mjs` uses real temporary filesystem transactions and inert executables, including fault injection, foreign changes, process leases, ownership and official-update preservation. `tests/craft-native-verifier.portable.ps1` compiles the actual C# verifier with a test-only serializer bridge. These tests do not execute Craft, validate WinForms interaction, or prove the same-name wrapper/native updater ordering. Those require Windows acceptance; real official NSIS requires an isolated registered Windows installation, not merely copied EXEs because /UPDATE can resolve the production registration.

The Craft product/installer c suffix is adapter branding. Its kernelVersion remains the actual base kernel 0.6.52; the package also records baseProductVersion/baseKernelVersion. A post-compile build receipt binds the native executable, C# inputs, embedded factory sources, reference DLLs and root version metadata. Packaging refuses a stale receipt instead of reusing a binary just because its version text matches.

## Exact engine profiles in the validation build

A single rebuilt kernel contains separate, digest-selected WebGAL 4.6.4 and 4.6.5 instrumentation profiles. `requireRuntimeParity: true` rejects an incompatible bound project immediately, without selecting a template or bundled fallback; `expectedRuntimeVersion` must match its official descriptor and bundle. The prepared copy rechecks the original selected bytes and descriptor. Unknown/custom bundles are rejected. The compiled profile helper is covered by the native build receipt.

The 4.6.4 raw bundle uses the pinned eleven preparatory patches and verifies their canonical output digest; 4.6.5 is instrumented from its exact raw digest. Version-specific minified names are never inferred from existing probe strings. `changeFigureDiff` and `transformFrom` require the 4.6.5 profile. Portable structural, scanner, and workload checks are available, while accepting a Craft-bound 4.6.5 export still requires the isolated Windows validation of the combined kernel.

Run `node craft/installer/check-source-inputs.mjs` before preparing a clean handoff. It reports missing build helpers, documentation, native sources and package inputs together, before downloads and Windows compilation.

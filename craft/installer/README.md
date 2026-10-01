# Craft installation transaction contract

This development module keeps the adapter package and its coordinator outside the Craft installation directory. The normal mode is `external`; the original-name wrapper is an explicit `same-name` experiment until isolated Windows validation passes.

## Trusted package and host inputs

`MANIFEST.json` schema 1 declares every immutable package file and its SHA-256/size, plus `entry`, `node`, `kernel`, `wrapper`, and a `supportedHosts` allowlist. All relative paths must stay inside the package; duplicate/case-colliding paths, unknown files, links and reparse points are rejected. Mutable `config.json`, `state/` and `logs/` are not payload entries. The first verified host is the official Craft 1.0.0-beta.2 executable with SHA-256 `3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d`; another hash is not made compatible merely by recording it.

Native Setup extracts into a fresh temporary coordinator directory, verifies the complete package, then invokes `craft/installer/manage.mjs`. It never executes a coordinator from a directory being replaced. The external adapter directory is not allowed to contain, or be contained by, the Craft host directory.

## Ownership and rollback

The adapter record is `adapterRoot/config.json`. In same-name mode, its mirror is `host/webvideo-craft.install.json`, the original program is `host/webgal-craft.webvideo-original.exe`, and the verified wrapper occupies `host/webgal-craft.exe`. Keeping the original in the same host directory preserves relative resource paths. Installation and upgrade stage verified files, preserve mutable state, and retain exact ownership hashes. Repeat installation of identical verified bytes is a no-op.

Host-level and adapter-level exclusive locks prevent cooperating installers from racing. Rollback tracks only paths actually changed by that transaction. It verifies their post-write hashes and payload-tree fingerprints before restoring/removing them. A foreign change stops rollback and retains recovery material; it is never overwritten to make an operation appear successful. Retained transaction journals are diagnostics, not an automatic crash-repair promise.

Uninstall restores only a still-owned wrapper. If an official updater or another process has replaced the host entry, uninstall preserves the new executable and reports `host-changed`, retaining recovery. Adapter payload, configuration and logs are retained outside the host. No game project, OS font, registry setting, global environment variable or service is modified by these transaction functions.

## Session and update coordination

The session owns an exclusive `state/session.lock` file with `{sessionId,pid}` and a `state/session.json` lease with coordinator/host/wrapper PIDs. Any live or unknown owner blocks installation mutations. Stale-lock recovery is explicit, requires a matching lease and all recorded processes to be gone, and never kills a process based solely on a PID.

CraftStarter verifies the package, original executable, current wrapper and ownership records before starting Node. It passes `--state`, `--craft`, `--kernel` and `--wrapper-pid`; arguments following `--` stay available to the official host. WebView2 debugging is configured only by the child session. Exit code 75 means a one-shot external coordinator owns an update handoff; the native wrapper exits immediately to release the original-name executable.

`prepareUpdateUnmount` restores the original entry after the recorded host/wrapper have exited, while retaining recovery. `remountAfterVerifiedUpdate` additionally requires a trusted coordinator verifier callback and an allowlisted updated host hash. Caller-supplied JSON is not authoritative evidence of an official update or installer completion. The public remount CLI is disabled, and shipped `updateObserverValidated` / `sameNameUpdateValidated` flags remain false until the Windows completion observer and wrapper-release behavior are proven. There is no resident watcher or implicit remount.

## Validation boundaries

`tests/craft-installer.test.mjs` uses real temporary filesystem transactions and inert executables, including fault injection, foreign changes, process leases, ownership and official-update preservation. `tests/craft-native-verifier.portable.ps1` compiles the actual C# verifier with a test-only serializer bridge. These tests do not execute Craft, validate WinForms interaction, or prove the same-name wrapper/native updater ordering. Those require isolated official-host Windows copies and must precede enabling that mode by default.

The Craft product/installer c suffix is adapter branding. Its kernelVersion remains the actual base kernel 0.6.46; the package also records baseProductVersion/baseKernelVersion. A post-compile build receipt binds the native executable, C# inputs, embedded factory sources, reference DLLs and root version metadata. Packaging refuses a stale receipt instead of reusing a binary just because its version text matches.

# Minimum real official-update acceptance environment

Do not run genuine NSIS /UPDATE on the production Windows account just because
Craft.exe or its WebView profile was copied. Official NSIS reads HKCU/HKLM and
may uninstall a matching machine-wide MSI or terminate same-name processes.
A separate account on the same machine does not isolate HKLM.

## Required boundary

- Disposable Windows x64 guest/Sandbox with separate HKCU and HKLM, no production
  Craft files, registration or processes, and no signed-in personal credentials
- .NET Framework 4.8, working WebView2, cached approved official Craft installer,
  candidate package/source and inert test scripts. Reuse verified local baseline,
  prior packaging directories and caches; no new host/runtime/model downloads
- Read-only mapping of the selected input folder. Copy inputs into guest-owned
  storage before installing. Only a dedicated QA-evidence output directory needs
  writable host mapping; do not map production projects or install roots writable
- Start offline for cached signed-installer mechanics. Deliberate official-feed
  checks need network; the configured official latest.json currently returns 404
- Install/register official Craft only inside the disposable guest. Save its
  registry values, initial hashes, package hashes, process identities and fixture
  scope before trying the candidate. Keep the original host desktop untouched

Enabling Windows Sandbox is an administrative Windows feature change and can
require restart. It requires explicit user approval and is not part of merely
running the inert scripts. Do not enable virtualization, edit security settings,
create accounts, install a VM product or restart the computer silently.

Microsoft lists supported Windows Pro/Enterprise/Education editions (not Home),
BIOS virtualization, at least 4 GB RAM, 1 GB available disk and 2 CPU cores for Sandbox.
Our package and test copies require additional free space. Verify the actual
computer's edition/virtualization support before proposing activation:

- https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/
- https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install
- https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file

## What each test establishes

The native-clean-handoff.ps1 test uses inert compiled fixtures and a test-only
alternate registry-reader entrypoint; it must say productionRegistryPreflightExecuted:false
and officialNsisValidated:false. It proves only selected process/argument/env/file
mechanics when actually run on Windows. It does not justify enabling production flags.

Real NSIS acceptance must establish the intended registered path, no cross-copy
or machine-wide side effects, saved-state refusal/cancellation, exact host/wrapper
exit before installer, unchanged signature-verified bytes, process handle lifetime,
clean /R auto-relaunch (no inherited CDP listener/profile/debug pipe), subsequent
normal shortcut launch, unknown host preserved and actionable enhancement recovery.
Cover user cancellation, nonzero installer exit, indeterminate timeout, changed
registry and concurrent external launch, not just success.

No newer official release than beta.2 currently exists. A cached beta.2 same-version
reinstall through a clearly labelled test-only harness can measure actual NSIS
mechanics inside the guest, while production equality/downgrade refusal remains
separately enforced. It is not a successful forward-upgrade claim. Do not add a
production override or change current-version/host hashes to manufacture a pass.

Until these gates are met, original-entry migration, ordinary launcher behavior,
wrong-product routing and the WebVideo+ own-updater can receive separate local-copy
acceptance, but the requested complete official automatic-update continuation and
clean restart is not releasable. All three validation flags stay false.

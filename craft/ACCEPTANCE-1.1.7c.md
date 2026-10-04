# Craft 1.1.7c installer usability candidate

Product **1.1.7c**, installer **1.1.7.0c**, PE **1.1.7.0**. Base product stays
1.1.2 and hybrid kernel stays 0.6.52. This is a source/test candidate for the
next normal-compression Windows package, not a public Release.

## Exact reference and scope

The unchanged cloud baseline was commit
`775deda449af301ef230b38219ef5f412ffcfec5`, tree
`83888afdfbb9ba429b57c237cc443b59f6e523d0` (318 tracked source files).
The implementation was compared with the actual Terre installer templates at
stable `v1.1.6` and candidate `62fbd3216eba674b8f1ea37d90b846f02d412fcc`.
Those installer templates, enhancements, layout and generator have identical
Git blobs between the two Terre references; no downloaded binary/UI execution
is inferred from this source comparison.

The previous Craft form exposed two raw paths, an experimental mode checkbox,
coarse progress and three actions. It did not discover existing custom
installations, offered no direct enhanced launch, and closed after reporting
success even when the coordinator said the official host had changed.

## Delivered workflow changes

- Bounded discovery through common install paths, owned metadata, Desktop and
  Start Menu shortcuts, and read-only uninstall registry entries. No drive
  scans; shortcut chains, directories, links and registry entries are bounded
- Program, folder and shortcut selection, drag/drop, explicit multi-instance
  selection, and recovery of a custom external adapter path through its own
  enhanced launcher shortcut. Ambiguous adapter ownership is never auto-picked
- A compact normal view with installed metadata, action-specific buttons and
  a collapsed advanced section for installation location, scratch cache and
  experimental same-name mode. Existing mode cannot be silently switched
- Existing empty folder selection now works transactionally. Nonempty unowned
  folders, nested host/adapter/cache trees and unsafe paths remain rejected
- Install/update, same-package repair, explicit stale-session recovery and
  confirmed detach/uninstall. Version downgrade is rejected numerically
- Repair requires the original, unchanged trusted manifest and exact ownership;
  it rebuilds only declared damaged/missing immutable files, preserves config
  extensions and mutable state/logs, and does not rewrite verified host EXEs
- Responsive background execution, captured inputs, elapsed/stage/file/byte
  progress and unique operation logs. Copy details and Open log are available
- Cooperative cancellation during extraction/verification only. An atomic
  cancellation/transaction gate prevents the last-click race; after transaction
  start, close/repeat/kill cancellation remain blocked until completion
- Read-only discovery can be dismissed normally, and its late callbacks are
  ignored after disposal. Selection changes invalidate old launch/folder state
- Typed coordinator results with action/schema/boolean/status checks. Changed
  official hosts, retained recovery directories and failed scratch cleanup are
  warnings rather than clean success; no-op and recovery outcomes are distinct
- Completion stays open with enhanced launch and Open installation folder.
  A desktop enhanced shortcut is explicit opt-in, verified, and never overwrites
  an unrelated same-name shortcut. The official shortcut remains independent
- Font-scaled, width-constrained wrapping, scrollable advanced content and
  screen-bounded windows. Windows rendering is still an unrun acceptance item

The scratch-cache option affects Setup extraction only. This revision does not
pretend to relocate runtime data/export caches, offer unsupported per-module
selection, or recursively delete user data. Uninstall confirmation explicitly
says components/config/logs/data remain, as do projects and exported videos.

## Cloud verification

Final verification used the actual production C# helper sources, with a
test-only JavaScriptSerializer bridge where PowerShell 7 lacks System.Web:

- `node --test tests/*.test.mjs craft/tests/*.test.mjs`: **435 / 435 passed**
- `tests/craft-setup-contracts.portable.ps1`: **327 assertions passed**, including
  300 cancellation/transaction races and typed success/error/warning outcomes
- `tests/craft-setup-paths.portable.ps1`: **80 assertions plus 3 symlink rejection
  checks passed**, including multiple external owners, damaged metadata,
  enhanced shortcuts and missing-host recovery cache preflight
- `tests/craft-native-verifier.portable.ps1`: **6 acceptance/rejection groups**
- `tests/craft-setup-compile.ps1`: production Setup and its actual inert GUI
  harness both compile as **C# 5 / .NET Framework 4.8**, without executing them
- `node craft/installer/check-source-inputs.mjs`: **69 required source files**
  and source directories verified
- Product/installer/PE/current-documentation version consistency passed;
  historical acceptance files and changelog entries keep their original versions
- CRLF-aware `git diff --check` passed; existing CRLF documentation and original
  historical changelog bytes are deliberately preserved
- A separate read-only review rechecked source, contracts and aggregate tests;
  findings were fixed before the handoff

Run the portable PowerShell checks with writable XDG_CACHE_HOME/XDG_CONFIG_HOME
when the cloud home is read-only. The compile-only check takes `-ReferenceRoot`
pointing to official .NET Framework 4.8 reference assemblies.

## Not run and required Windows acceptance

No installer, user desktop product test, native WinForms runtime, registry/COM
shortcut interaction, actual install/update/uninstall, GPU render or video
export was executed for this revision. Local authorization is packaging only.
The delivered `craft/tests/setup-gui.test.ps1` and `setup-paths.test.ps1` are
available for a separately authorized isolated Windows validation, not part of
the packaging instruction.

The inert GUI harness now covers delayed actions, UI-thread callbacks, captured
input, repeated clicks, closing, mutation/cancellation ordering, failure/retry,
retained completion, small-window/font-size layout constraints and closing
while discovery is pending. Its compilation is not a GUI test pass.

Before accepting actual Windows usability, verify:

1. Folder/EXE/official and enhanced .lnk paths, non-default installation,
   multiple hosts/adapters, and stale links
2. First install to new or empty directory; reopen external and same-name
   installs; same-package repair; update; downgrade refusal
3. Long Chinese paths and diagnostics at 100/125/150/200% display scaling,
   a narrow work area, keyboard navigation and scrolling
4. Preparation cancellation and retry; close/repeat during a transaction;
   logs/copy; default and custom scratch directory cleanup and cleanup warning
5. Enhanced launch from completion and opt-in desktop shortcut, including an
   unrelated existing shortcut that must not be overwritten
6. Confirmed uninstall, no-op/repeated uninstall, stale-session recovery and a
   changed official host. Original host/new updater bytes must remain intact

Both `updateObserverValidated` and `sameNameUpdateValidated` stay **false**.
Unknown host hashes are still refused; there is no auto-update/remount enabling,
persistent watcher, new credential/access grant, main merge or formal release.

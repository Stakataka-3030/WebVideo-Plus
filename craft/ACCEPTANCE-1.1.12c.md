# Craft 1.1.12c canonical session root correction

Product 1.1.12c, installer 1.1.12.0c and PE 1.1.12.0 continue exact
`2e07ab266746af641017203eb4bd03f18a8a4d2d`, tree
`9c23c2be3d0a872c5db1566ef6b2e6735c078095`. Base product 1.1.2 and kernel
0.6.52 remain unchanged. Earlier source and binary artifacts stay immutable.

## Measured failure and scope

The first clean Windows CI run passed 819 of 822 tests. Separate failures were:
missing ffprobe, a source-wiring regular expression that only accepted LF, and
snapshot discard reporting `snapshot-owner-mismatch`. That CI log did not record
the temporary directory's path spellings, so its exact path-identity cause is
still unproven.

A subsequent disposable Windows Node 22.20.0 probe measured a legitimate
same-directory case alias that reproduces the ownership mismatch. The normal
local temporary path was already canonical and passed. GetShortPathName returned
the original path, so an 8.3 alias was not reproduced. Resolving the existing
session root before constructing SessionStorage fixed the measured case. Foreign
parent, unknown snapshot, snapshot-leaf junction and safeChild junction refusals
remained effective. The probe did not launch Craft or modify an installation.

This is product-reachable: the installation state and launcher previously used
path.resolve/Path.GetFullPath, which do not guarantee filesystem spelling.
Changing only the test fixture would hide the production gap.

## Minimal correction

The launcher creates its random session directory and then obtains its canonical
path with `fs.realpath`. SessionStorage, KernelSession and all subsequent session
paths share that pinned root. The strict snapshot parent comparison and link
refusal in storage.mjs are unchanged. In particular, discard does not resolve a
recorded snapshot parent again or accept a retargeted root/games directory.
This does not introduce inode pinning or claim to eliminate existing filesystem
check/delete races.

The fixture now follows the same canonical-root initialization contract and
tests failed ownership and junction cleanup paths. The CI workflow provisions
the existing hash-pinned ffmpegTest dependency before the audio suite. Setup's
source-wiring test accepts LF and CRLF while explicitly rejecting removal of the
disposal guard. Neither CI repair suppresses a failed test or changes the
installer's dependency policy.

## Retained evidence

The 1.1.11c actual confirmation, cancellation, stale controls, reload and
inert-refusal flow passed. The native Details component intentionally closes its
own display before invoking its update callback. About's dismissal in a global
button-selection fixture was not attributable to its original native handler.
Original failed retention assertions and the corrected scope are retained in
[the acceptance addendum](ACCEPTANCE-1.1.11c-ADDENDUM.txt). Runtime confirmation,
official helper/coordinator, own-updater and native export code are unchanged.

Runtime officialAutoInstallEnabled remains true. The three historical validation
fields remain false. Genuine signed forward installation still lacks a newer
official target, and enhancement re-adoption remains explicit. No complete
forward-upgrade or automatic enhancement remount success is claimed.

## Cloud checks

- Full shared/Craft Node suite: 830 tests, 829 passed, 0 failed; the single
  Windows-filesystem case-alias test is explicitly platform-gated on Linux
- Session ownership/initialization suite: 16 tests, 15 passed, the same single
  Windows-only case pending; portable alias, root/games retarget and leaf-junction
  refusals all executed
- Composed feature preflight: 173 passed
- Owned confirmation, Setup source wiring and version consistency: 99 passed
- Required source inputs: 85 verified; launcher syntax and whitespace checks pass

The exact Windows CI and focused native acceptance remain required.

## Required acceptance for these new bytes

Run the full Node and composed suites, then the exact remote CI with pinned
ffprobe and both newline forms. Build the new version with existing verified
native dependencies and a descriptor from its exact new EXE. On Windows, repeat
the canonical/case-alias and foreign/junction refusal matrix, and make a short
actual startup, own-Setup open/refusal/Cancel, owned-confirmation Cancel/explicit
inert refusal, and Anogo/undo/recommended-export smoke pass. Verify cleanup.

Unchanged native helper and previous full UI evidence can be retained by source
identity; the focused run need not repeat official NSIS, Sandbox, security
changes, or unrelated features. Native acceptance of the new version must be
recorded separately before publication; cloud fixtures alone do not replace it.

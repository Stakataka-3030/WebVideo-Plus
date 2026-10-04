# Craft continuation: interrupted-flow audit

This source-only continuation starts from the delivered Craft 1.1.5c / installer
1.1.5.0c source commit `1a087fff22225dd2258bc90fa77db3d6688ad358`, exact tree
`2e195e26f2dbd2397e77429e1493c8c0b9a7b395`. The original cloud checkout did not
survive. All 315 source files were restored from the delivered archive and
verified by byte count, SHA-256, Git blob and reconstructed Git tree. The local
baseline commit records this provenance; it does not pretend to restore the
original commit history.

## Confirmed problems and fixes

- Out-of-order scene reads, including stale failures, could replace a newer
  scene or clear its reviewed edit. Read tickets now reject superseded results
  across actions, close/reopen and editor removal
- A pending tool-opening read could resume after disposal and activate disposed
  media UI. Opening, refresh and presentation continuations now stop when their
  lifecycle ends
- Removing the native editor parked the dock but left hidden music work active.
  Parking now deactivates only that music consumer and retains its unsaved draft
- Closing a tool opened from a menu could leave focus on a detached menu item or
  hidden close button. Focus returns to the native launcher, including its
  replacement after native layout remounting
- Project path and engine rebinding could leave an old staged plan visible when
  source/revision were unchanged. Freshness includes all seven bridge identity
  fields, and host subscriptions observe project path and engine identity
- Export setup could change projects while reading settings and queue the new
  project when scene text matched. Every range now checks the captured project,
  path, source, revision and engine binding; the bridge also validates this proof
  across its own asynchronous registry lookup. Caller-only proof is removed
  before the export request reaches the kernel
- Disposed panels could submit later ranges or new jobs after deferred setup.
  Unsent work stops; only a job returned after an interrupted submission is
  canceled. Previously queued jobs keep running. Panel disposal does not cancel
  independent actual-time consumers
- A slow old cancellation iterated a live job list and could cancel a newer
  export. Cancel requests now own fixed target IDs and cannot overwrite newer
  status or error text
- Prepared export snapshots could leak on post-allocation context/dirty-state
  rejection or blocking-task setup failure. Cleanup covers those paths and
  final binding validation. Captured game identity is a shallow value copy so
  in-place host mutations cannot bypass project/engine checks

Each change has a deferred-promise or host-DOM regression. The newly added
failure cases were exercised against the pre-fix code before verification.

## Verification

- 377 combined Node tests passed, including the exact production payload,
  source/package contracts, imports, media/controller behavior, three-profile
  contracts and existing motion/figure-output regressions
- 67 required source inputs verified; syntax and whitespace checks passed
- Independent review covered UI lifecycle, expected export identity, cleanup,
  and media cancellation ownership

Reproduce the aggregate from the repository root:

```sh
node --test craft/tests/*.test.mjs tests/features-imports.test.mjs tests/craft-installer.test.mjs tests/craft-packaging.test.mjs tests/build-inputs.test.mjs tests/craft-setup-ui.test.mjs tests/craft-launcher.test.mjs tests/craft-source-inputs.test.mjs tests/cubism2-seam.test.mjs tests/figure-output-filter.test.mjs tests/webgal-dual-profile-workload.test.mjs
```

No Windows entrypoint, new installer, real native GUI, GPU render or audio/video
export was run. DOM/contract checks are not screenshot acceptance. Existing
engine limitations, including the missing positive exact-byte MyGO fixture,
remain as documented in `ACCEPTANCE-1.1.5c.md`. No C# implementation, profile table, original host styling or shared timing
algorithm changed. The next test-build metadata is separately synchronized to
Craft 1.1.6c / installer 1.1.6.0c / PE 1.1.6.0, with kernel 0.6.52 retained. This
checkpoint is not a new Release and has not been merged or published remotely.

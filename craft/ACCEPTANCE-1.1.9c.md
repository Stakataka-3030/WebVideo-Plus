# Craft 1.1.9c own-installer opening candidate

Product 1.1.9c; installer 1.1.9.0c; PE 1.1.9.0. Base product/kernel remain
1.1.2 / 0.6.52. This is a new candidate, not the previously accepted af1a9295
1.1.8c executable. The three official-update validation flags remain false.

## Native finding and exact host contract

The actual 1.1.8c own-update UI checked and downloaded the real verified candidate,
but opening Setup was refused because the official beta.2 Pinia runtime-task
store had never been instantiated. Opening the project, preview and export panel
did not create it. Its previous required-store check was therefore a false
blocker. Installer opening/cancellation was not accepted by that run.

Pinned official source is edccdf0d10572a31a3ee8619ad3b43d2ce5c91aa and the allowed
Windows executable remains 3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d.
Runtime-task is lazy and does not cover native exports. The latter use local
ExportDialog state. Native archive extraction, template pre-registration and
post-save backup can also run without a universal exposed work counter.

Relevant upstream Git blobs:

- runtime-task.ts: 2b63a7a7c56a25fc081a24927504285d36c54690
- update-install-blockers.ts: 3de9d613bb236a10334c885a3c321c1c7364d248
- useWebExportDialog.ts: 597b0195de276e0a87d78e548d656053d61e9b39
- modal.ts: 9b43ec1f023c397aafc8b0800b951ad7499350f0
- resource.ts: b24b83db6466f0756a13d16ca293814ba7b4e465
- managed-import.ts: 15608618a1de53f11f4c54140c29669038df3a95

## Corrected, limited authorization

Own-update opening means opening the normal Setup GUI with no automatic action
arguments. It never closes Craft, installs components, or declares every native
task idle. The independent transaction requires the existing owned session to
end before install/repair/uninstall can change its files.

The shared browser/backend reader requires the exact verified beta.2 profile,
strict saved-state, loaded resource data and native modal/progress state. Known
native modals, resource creation/import/progress, backup loading/restoration and
registered blocking tasks refuse opening. Missing source-proven lazy ledgers are
reported explicitly; missing mandatory or malformed state fails closed. No fake
store is created, and no Tauri API is changed.

The backend also checks its own in-flight RPCs, pending snapshots/metadata writes,
kernel identity and published export/timing/AI task statuses. It does not start
an unused kernel to do this. Lost task-start responses, unknown status, service
loss or changed identity refuse opening. Status completion is not a guarantee
of private process teardown, so the result remains known-work-only.

The last proof has a synchronous session/activity-generation check after the
final installer rehash and immediately before spawn. New work or context loss
in that final hash window refuses opening. Both original local checks and both
backend state reads remain. Cancel/repeat/failure retain normal UI safety.

Installer protection was independently inspected and tested: any session.lock
or update.lock refuses normal mutation; recorded live host/wrapper/coordinator
PIDs additionally refuse. Existing install/repair checks occur before staging
and again before publishing replacements. Own launch supplies no --dest or
self-coordinator bypass. These controls are independent of browser task stores.

## Required native retest on rebuilt bytes

Reuse verified existing local host/runtime/build caches; no new baseline/model
downloads, official NSIS run, security setting or production project change.

1. Compile this exact source and verify new 1.1.9c identities plus full manifest.
2. Inspect the actual normal beta.2 stores with runtime-task absent. Check and
   download via the own-update UI using the real candidate and clearly identified
   test-only provider/current-version fixture. Do not fake an online release.
3. Click Open. Observe one real ordinary Setup GUI, empty action arguments,
   sanitized process-only WebView environment, and Craft still alive/unchanged.
4. In that Setup select the running owned installation and attempt installation.
   It must refuse before changing host/adapter/config bytes. Cancel/close Setup
   normally and verify Craft remains usable with exact document/profile state.
   Repeated Open is refused in the current session; normal restart permits a new
   explicit check. Opening is never reported as completed installation.
5. Dirty editor, native modal/export, registered native task, active WebVideo+
   export/timing/AI work and unknown kernel result must refuse opening. Finish or
   cancel work normally, then retry. Exercise context reload and a task change
   during final hash verification with inert/source-faithful race fixtures.
6. Smoke-test Anogo/apply/native undo, preview and short recommended export on
   the rebuilt package; preserve prior af1a9295 evidence as historical, not proof
   of these new installer/runtime bytes.

Real official forward staging/session handoff/exit75 remains separate and gated.
Neither this known-work reader nor same-version NSIS evidence enables it.

## Cloud source evidence

- Aggregate Node regression: 673/673 passed
- Composed-library feature preflight: 173/173 passed
- Source packaging preflight: 83 required files and source directories verified
- Exact full-payload variants now click through own-update check/download and
  reach the explicit backend open request with runtime-task absent; native modal
  and dirty-state controls refuse it without fabricating a ledger
- Independent source review and transaction tests confirm live-session mutation
  refusal, including zero host/adapter changes for install, repair and uninstall
- Final-hash activity/context races and malformed status proofs are covered

These are source/fixture checks. The new Windows binary must still be compiled
and pass the native retest above. The cloud C# toolchain was not retained after
the environment reset; no new 1.1.9c compiler or native GUI pass is claimed.
Installer/launcher C# logic is unchanged apart from the new version attributes;
all other functional changes are in the adapter JavaScript and tests.

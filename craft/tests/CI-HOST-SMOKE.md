# Disposable Windows CI host startup gate

This gate runs only after the complete Craft package and embedded installer payload have been built and statically verified. It is not a test for a user's desktop. Both preparation and execution refuse anything except an explicitly enabled GitHub-hosted Windows Actions runner. Local verification is limited to syntax, static fixture checks, pure guards, and one hidden console-process identity check in `ci-host-smoke.test.mjs`. That check starts only its own PowerShell process, not a GUI or Craft.

`ci-host-inputs.lock.json` pins the public official Craft 1.0.0 installer archive, its extracted unchanged host EXE, and the 7-Zip extraction tool. `prepare-ci-host.ps1` uses the existing `Get-PinnedBuildInput` SHA-256 mechanism, verifies lengths and extracted hashes, and extracts only the host EXE. Neither the official NSIS installer nor the 7-Zip installer is executed. There are no downloaded media inputs in this minimal test.

The independently named CI step performs these real operations:

1. Install the complete current package through its shipped transaction CLI into a fresh runner temporary directory.
2. Start the original-name entry with an independent WebView profile. Verify its session belongs to that wrapper PID and exact official host path.
3. Require both launcher `ready` and the actual session `injected` record with `verified-loopback-owned`. Verify the real native listener again before connecting CDP.
4. Read the official `tauri.localhost` page and confirm that the actual enhanced bootstrap, bridge, and mounted DOM exist. On the empty first-run welcome page the tools dock may be parked/hidden; this is not a claim of editor toolbar visibility or interaction.
5. Send normal close only to the exact owned host process, using a retained process handle after checking executable path and creation time. Require successful wrapper exit, `closedAt`, released session lock, and eventual exit of the captured process descendants.
6. Unmount through the shipped CLI and verify the exact official EXE and immutable input package hashes are restored/preserved.

This minimal gate explicitly reports editing, preview, and short export as `NOT_RUN`. Existing native graphics/export gates remain separate. It does not prove official NSIS updating, user account integration, AI providers, private SDKs, or performance on a particular user's GPU. A pass must come from the final CI commit; local syntax/unit tests cannot substitute for a host result.

The official host's native Known Folder settings and single-instance mutex are not isolated merely by changing APPDATA/LOCALAPPDATA or using a second Win32 desktop. That is why the unchanged host is restricted to the disposable remote runner. No personal files, credentials, projects, profiles, SDKs, or native global logs are copied to CI or uploaded. The smoke artifact is an allowlisted JSON result containing only this run's assertions and sanitized startup errors. Temporary test trees stay runner-local until the runner is disposed.

Failure cleanup is restricted to descendants of the exact spawned wrapper or already verified surviving children. Every process is rechecked by executable and creation time through an opened process handle. CIM and native start timestamps are compared at their exact common microsecond precision, not within a time window. No name-wide termination, foreground desktop switch, host patch, single-instance bypass, security-check skip, or silent success on an unavailable graphical environment is permitted.

## Failure evidence

The CI observer samples at most 18 target summaries while the unmodified production launcher performs its own wait. Before every diagnostic endpoint read it independently verifies the native loopback listener and its host ancestry. A failed ownership check prevents that read. Each retained target contains only type, URL origin and path, never title, ID, query, fragment, WebSocket URL or tokens. Counts distinguish no candidates, multiple candidates and other origins without accepting any of them as a production target. Runtime version, bounded lifecycle stages, owned process state and remaining owned processes are also recorded. No fixed startup delay, relaxed origin, or extra production retry is introduced.

The official native log is read only from bytes appended during this CI run. Only classified initialization/error/panic events, error codes and line digests are retained, never raw lines. Native stdout/stderr is still ignored by the production launcher, so this is not complete panic coverage. Cleanup subprocess failures contain code, signal, killed, an explicit abort-timeout result, elapsed time and short stderr. Progress-only PowerShell CLIXML and full EncodedCommand arguments are not retained.

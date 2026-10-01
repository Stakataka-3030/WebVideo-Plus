# Isolated Windows validation

Use a new source directory, a copied official beta.2 EXE with the allowlisted SHA-256, a new WebView profile, and disposable projects. Never use the production Craft installation, its installation registry entry, real projects, credentials, or personal WebView data. Do not execute an official updater/NSIS installer in this round.

## Build current source

1. `powershell -NoProfile -File prepare-build.ps1` reconstructs pinned official inputs. A previously validated cache may be supplied with `-CacheDirectory`.
2. `powershell -NoProfile -File build.ps1` compiles the current kernel. Its final build receipt records exact C#/factory/reference hashes and executable hash and stages root version.json.
3. Run `npm ci --ignore-scripts` in ai-runtime, then `powershell -NoProfile -File scripts/build-ai.ps1`. No provider calls or credentials are needed.
4. Run `powershell -NoProfile -File tests/font-render-preflight.test.ps1`.
5. Run `powershell -NoProfile -File craft/build-craft-package.ps1`. It compiles Setup/Starter and verifies the fresh kernel receipt, pinned Node, complete runtime and manifest.
6. Run the Node suite in craft/README.md and native verifier tests as appropriate.

## Native install and interface

Use the built package's node.exe with `craft/installer/manage.mjs install --package <package> --dest <new adapter directory> --craft <copied official EXE> --mode external`. The source tree is not an installed package. Start its verified native launcher with `--isolated-test --profile <new profile directory>`; retain config.json/manifest verification, rather than inventing a config to bypass it.

Register/bind the official 4.6.4 engine fixture through Craft native UI. Verify project registry, native VFS lower/template/whiteout semantics. Test a standalone template and a 4.6.5 fixture if available.

Capture real screenshots of the main panel and authoring/music/import/export/backup/update panels. Exercise close/reopen, stale plan rejection, project switch, full page reload and duplicate launch. Repeat the native two-transaction undo/redo test with a pre-existing unsaved edit: undo must restore that unsaved text and keep dirty=true, then restore the original fixture without changing its disk file.

Preview is an OOPIF. Test the actual PreviewSessionManager target/session transport, parent DOM frame ownership, and repeated context IDs. Read real Redux speeds; change/restore only in the disposable game. Persistence is allowed only with proven loaded config frame/loader/URL/key evidence. Otherwise expect `persistence: session`, never a guessed IndexedDB key.

Render a short real scene and audio fixture: duration measurement, one saved music track, MP4 export, cancellation, repeated clicks, unique output naming and subtitle fixture. Verify with ffprobe. AI tests use mocks only, with no external provider requests.

After closing only the owned host, confirm kernel/session exit, listener removal and lease cleanup. Test external repeat/upgrade/uninstall. Same-name installation is a separate opt-in test on another disposable copied host: original/wrapper hashes, repeat, rollback and uninstall. A foreign newer EXE must never be overwritten by an old backup.

## Synthetic update observation

`powershell -NoProfile -File craft/tests/native-update-observer.ps1` compiles a synthetic host and installer, using ShellExecuteW and isolated marker files only. Test success, failure and foreign-path rejection. Preserve result.json/stderr. It is not an official NSIS upgrade and must not enable production update capability gates. Official automatic checks remain enabled.

Return exact source ZIP/package hashes, commands, pass/fail/not-run stages, screenshots, ffprobe evidence and reproducible failures. No publication or production-host installation.

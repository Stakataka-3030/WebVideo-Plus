param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '../package'),
  [string]$OutputRoot = (Join-Path $PSScriptRoot '../.build/font-render/native')
)
# Runs the actual Windows WebView2 export, including a styled DOM overlay. No
# project runtime/fonts are present, so the exporter must use bundled-runtime.
# Keep MP4 locally; CI should upload only the synthetic PNG/JSON/log diagnostics.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Native font regression requires Windows and WebView2.' }
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$exe = Join-Path $PackageRoot 'WebGAL.Video.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Build the native executable first: $exe" }
# Never overwrite prior diagnostics; each invocation owns a fresh directory.
$run = Join-Path $OutputRoot ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'fixtures/font-render/project'))
$font = Join-Path $PackageRoot 'runtime/web/assets/SourceHanSansSC-Regular.otf'
if (-not (Test-Path -LiteralPath $font)) { throw 'Replacement font is missing from the package.' }
$fontHash = (Get-FileHash -LiteralPath $font -Algorithm SHA256).Hash.ToLowerInvariant()
if ($fontHash -ne '84bbd4ace91d327b3ad1a581c688196278a4e41308520176f419180064e4af2b') { throw 'Unexpected Source Han Sans SC Regular font bytes.' }
$legacyFonts = Get-ChildItem -LiteralPath (Join-Path $PackageRoot 'runtime/web') -Recurse -File | Where-Object Name -Match 'OPPO'
if ($legacyFonts) { throw 'Legacy OPPO font remains in packaged runtime.' }

$runtimeCheck = Start-Process -FilePath $exe -ArgumentList @('check-runtime') -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $run 'webview2.json') -RedirectStandardError (Join-Path $run 'webview2-error.log')
if ($runtimeCheck.ExitCode -ne 0) { throw 'WebView2 Runtime is required on this Windows runner.' }
function Invoke-Checked($command, [string[]]$arguments, $name, [int]$timeoutSeconds = 600) {
  $process = Start-Process -FilePath $command -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $run "$name.log") -RedirectStandardError (Join-Path $run "$name-error.log")
  if (-not $process.WaitForExit($timeoutSeconds * 1000)) {
    # Terminate only this test's owned process tree when export stalls.
    & taskkill /PID $process.Id /T /F | Out-Null
    throw "$name exceeded $timeoutSeconds seconds; diagnostics: $run"
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "$name failed with code $($process.ExitCode); diagnostics: $run" }
}
function Find-MediaTool($name) {
  $local = Join-Path $PackageRoot "bin/$name.exe"
  if (Test-Path -LiteralPath $local) { return $local }
  $resolved = Get-Command $name -ErrorAction SilentlyContinue
  if ($resolved) { return $resolved.Source }
  throw "Missing $name; the export runtime requires FFmpeg/FFprobe."
}
$ffmpeg = Find-MediaTool 'ffmpeg'
$ffprobe = Find-MediaTool 'ffprobe'
$video = Join-Path $run 'font-export.mp4'
$work = Join-Path $run 'work'
$arguments = @('export', '--project', ('"' + $project + '"'), '--scene', 'start.txt', '--out', ('"' + $video + '"'), '--work-dir', ('"' + $work + '"'), '--width', '1280', '--height', '720', '--fps', '30', '--workers', '1', '--mode', 'manual', '--hold', '1', '--text-speed', '100', '--gpu-raw-export', 'traditional')
Invoke-Checked $exe $arguments 'export'
# The CLI can return exit 0 for a needs_attention scan result. Require its
# terminal state explicitly and preserve the actual preflight reason in CI.
$statusPath = Join-Path $work 'status.json'
if (-not (Test-Path -LiteralPath $statusPath)) { throw "Export produced no terminal status; diagnostics: $run" }
$status = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($status.state -ne 'completed') {
  $issues = @($status.scanReport.issues | ForEach-Object { "$($_.kind): $($_.file): $($_.message)" }) -join '; '
  throw "Export did not complete: state=$($status.state), phase=$($status.phase); $($status.message); $issues; diagnostics: $run"
}
$resultPath = [IO.Path]::ChangeExtension($video, '.json')
if (-not (Test-Path -LiteralPath $resultPath)) { throw 'Export produced no metadata.' }
$result = Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($result.host -ne 'webview2' -or $result.engine.sourceKind -ne 'bundled-runtime') { throw 'Fixture did not exercise bundled WebView2 runtime.' }
if ($result.totalFrames -lt 60 -or $result.durationSeconds -le 0 -or $result.pipeline -ne 'jpeg') { throw 'Export timing or pipeline was unexpected.' }
$probeArgs = @('-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', ('"' + $video + '"'))
Invoke-Checked $ffprobe $probeArgs 'probe'
$probe = Get-Content -LiteralPath (Join-Path $run 'probe.log') -Raw | ConvertFrom-Json
$stream = @($probe.streams | Where-Object codec_type -eq 'video')[0]
if ($stream.width -ne 1280 -or $stream.height -ne 720 -or [int]$stream.nb_read_frames -ne [int]$result.totalFrames) { throw 'Decoded video size/frame count differs from export metadata.' }
# Sample each dialogue near the end of its displayed interval. This verifies
# encoded text pixels rather than only an exit status or a non-empty MP4 file.
Add-Type -AssemblyName System.Drawing
$frames = @()
$performs = @($result.timelineDiagnostics.sayPerforms)
if ($performs.Count -ne 3) { throw "Expected three dialogue events, got $($performs.Count)." }
for ($index = 0; $index -lt $performs.Count; $index++) {
  $event = $performs[$index]
  $nextStart = if ($index + 1 -lt $performs.Count) { [double]$performs[$index + 1].startMs / 1000 } else { [double]$result.durationSeconds }
  $seconds = [Math]::Max(0, [Math]::Min($result.durationSeconds - 0.05, $nextStart - 0.15))
  $stamp = $seconds.ToString('0.000', [Globalization.CultureInfo]::InvariantCulture)
  $png = Join-Path $run ("dialogue-{0}.png" -f ($index + 1))
  Invoke-Checked $ffmpeg @('-v', 'error', '-y', '-ss', $stamp, '-i', ('"' + $video + '"'), '-frames:v', '1', ('"' + $png + '"')) ("frame-{0}" -f $index)
  $bitmap = [Drawing.Bitmap]::new($png)
  try {
    $cyan = 0
    for ($y = 460; $y -lt 715; $y += 2) {
      for ($x = 140; $x -lt 1250; $x += 2) {
        $pixel = $bitmap.GetPixel($x, $y)
        if ($pixel.G -gt 175 -and $pixel.B -gt 175 -and $pixel.R -lt 145 -and $pixel.G - $pixel.R -gt 65) { $cyan++ }
      }
    }
    if ($cyan -lt 70) { throw "Decoded dialogue $($index+1) has no sufficient cyan text pixels ($cyan); inspect $png" }
    $frames += [PSCustomObject]@{ sceneLine=$event.line; seconds=$seconds; png=[IO.Path]::GetFileName($png); sampledCyanTextPixels=$cyan }
  } finally { $bitmap.Dispose() }
}
[PSCustomObject]@{ passed=$true; runtime='WebView2'; fontSha256=$fontHash; decodedFrames=[int]$stream.nb_read_frames; width=$stream.width; height=$stream.height; samples=$frames } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $run 'native-summary.json') -Encoding UTF8
Write-Host "Native font export regression passed. Diagnostics: $run"

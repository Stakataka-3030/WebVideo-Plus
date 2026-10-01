param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '../package'),
  [string]$OutputRoot = (Join-Path $PSScriptRoot '../.build/font-render/native'),
  [ValidateSet('bundled-runtime','project-runtime','terre-template')][string]$RuntimeSource = 'bundled-runtime'
)
# Runs the actual Windows WebView2 export, including a styled DOM overlay. No
# project runtime/fonts are present in the default case. Explicit source cases
# copy the actual pinned 4.6.5 runtime into an owned project/template fixture.
# Keep MP4 locally; CI should upload only the synthetic PNG/JSON/log diagnostics.
$ErrorActionPreference = 'Stop'
function Get-FontSampleFrame([double]$NextStart, [double]$Duration, [int]$FrameCount, [int]$Fps = 30) {
  # A bare 0 lets PowerShell select Math.Max(int,int), rounding fractional
  # seconds before frame selection. Force the double overload explicitly.
  $seconds = [Math]::Max([double]0, [Math]::Min($Duration - 0.05, $NextStart - 0.15))
  return [Math]::Min($FrameCount - 1, [Math]::Max(0, [int][Math]::Floor($seconds * $Fps)))
}
# Pure numerical regression for the fixture's observed 113-frame timing.
foreach ($sample in @(@(1.24, 32), @(2.49, 70), @((113 / 30.0), 108))) {
  $actual = Get-FontSampleFrame -NextStart $sample[0] -Duration (113 / 30.0) -FrameCount 113
  if ($actual -ne [int]$sample[1]) { throw "Font sample frame calculation changed: expected $($sample[1]), got $actual" }
}
if ($env:OS -ne 'Windows_NT') { throw 'Native font regression requires Windows and WebView2.' }
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$exe = Join-Path $PackageRoot 'WebGAL.Video.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Build the native executable first: $exe" }
# Never overwrite prior diagnostics; each invocation owns a fresh directory.
$run = Join-Path $OutputRoot ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'fixtures/font-render/project'))
$font = Join-Path $PackageRoot 'runtime/web/assets/OPPOSans-R-tAcFw8I3.ttf'
if (-not (Test-Path -LiteralPath $font)) { throw 'Original WebGAL font is missing from the package.' }
$fontHash = (Get-FileHash -LiteralPath $font -Algorithm SHA256).Hash.ToLowerInvariant()
if ($fontHash -ne 'ea92535935f8b5da18b64bb23e5ffbfef1417b7ae4ff3fc15372a65ee95a9580') { throw 'Unexpected original OPPO Sans font bytes.' }
$replacementFonts = Get-ChildItem -LiteralPath (Join-Path $PackageRoot 'runtime/web') -Recurse -File | Where-Object Name -Match 'SourceHanSansSC'
if ($replacementFonts) { throw 'Unexpected replacement font remains in packaged runtime.' }

$engineRoot = $null
if ($RuntimeSource -ne 'bundled-runtime') {
  $fixture = $project
  $project = Join-Path $run 'project'
  Copy-Item -LiteralPath $fixture -Destination $project -Recurse
  $runtimeRoot = if ($RuntimeSource -eq 'project-runtime') { $project } else { Join-Path $run 'terre-template' }
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $PackageRoot 'runtime/web') -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $runtimeRoot -Recurse -Force }
  if ($RuntimeSource -eq 'terre-template') { $engineRoot = $runtimeRoot }
  # Exercise project/template font declaration precedence with exact real bytes,
  # not a fake font or a substitute face. The fixture stylesheet uses WebgalUI.
  $template = Join-Path $runtimeRoot 'game/template'
  New-Item -ItemType Directory -Path (Join-Path $template 'fonts') -Force | Out-Null
  Copy-Item -LiteralPath $font -Destination (Join-Path $template 'fonts/fixture.ttf')
  @{ name='Runtime source fixture'; 'webgal-version'='4.6.5'; fonts=@(@{'font-family'='WebgalUI';url='fonts/fixture.ttf';type='truetype'}) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $template 'template.json') -Encoding UTF8
}

$runtimeCheck = Start-Process -FilePath $exe -ArgumentList @('check-runtime') -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $run 'webview2.json') -RedirectStandardError (Join-Path $run 'webview2-error.log')
if ($runtimeCheck.ExitCode -ne 0) { throw 'WebView2 Runtime is required on this Windows runner.' }
function Invoke-Checked($command, [string[]]$arguments, $name, [int]$timeoutSeconds = 600) {
  $process = Start-Process -FilePath $command -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $run "$name.log") -RedirectStandardError (Join-Path $run "$name-error.log")
  $null = $process.Handle # Retain exit tracking on Windows PowerShell 5.1.
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
if ($RuntimeSource -eq 'bundled-runtime') {
  Invoke-Checked $exe $arguments 'export'
} else {
  # Use the existing job request contract; the ordinary CLI has no engineRoot
  # argument. This matches the project/template values sent by Terre's queue.
  $requestPath = Join-Path $run 'source-runtime-request.json'
  @{project=$project;engineRoot=$engineRoot;scene='start.txt';output=$video;jobDir=$work;bgmFiles=@();retry=$false;gpuRawExport=$false;gpuRawMode='traditional';gpuRawCodec='';gpuRawDom=$true;settings=@{width=1280;height=720;fps=30;workers=1;mode='manual';holdSeconds=1;textSpeed=100;autoSpeed=50;engine='webgal';gpu='auto'}} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $requestPath -Encoding UTF8
  # Inspect the real Planner snapshot before the successful job's normal cleanup.
  Invoke-Checked $exe @('plan','--request',('"'+$requestPath+'"')) 'source-plan'
  $snapshot = Join-Path $work 'planning/prepared/web'
  if ((Get-FileHash (Join-Path $snapshot 'game/userStyleSheet.css')).Hash -ne (Get-FileHash (Join-Path $project 'game/userStyleSheet.css')).Hash) { throw 'Project custom stylesheet changed.' }
  $fontSnapshot = Get-Content (Join-Path $snapshot 'game/template/template.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($fontSnapshot.name -ne 'Runtime source fixture' -or $fontSnapshot.fonts.Count -ne 1 -or $fontSnapshot.fonts[0].'font-family' -ne 'WebgalUI') { throw 'Source template/font declaration was not preserved.' }
  $copiedFont = Join-Path (Join-Path $snapshot 'game/template') $fontSnapshot.fonts[0].url
  if ((Get-FileHash -LiteralPath $copiedFont).Hash.ToLowerInvariant() -ne $fontHash) { throw 'Snapshot font bytes differ from selected source.' }
  $plan = Get-Content (Join-Path $work 'planning/prepared/plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($plan.engine.sourceKind -ne $RuntimeSource -or -not $plan.engine.runtimeParity) { throw 'Planner silently selected a different runtime source.' }
  @{sourceKind=$plan.engine.sourceKind;sourceHash=$plan.engine.sourceHash;cssSha256=(Get-FileHash (Join-Path $snapshot 'game/userStyleSheet.css')).Hash.ToLowerInvariant();fontSha256=(Get-FileHash $copiedFont).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content (Join-Path $run 'source-snapshot-evidence.json') -Encoding UTF8
  Invoke-Checked $exe @('job','--request',('"'+$requestPath+'"')) 'export'
}
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
if ($result.host -ne 'webview2' -or $result.engine.sourceKind -ne $RuntimeSource -or $result.engine.version -ne '4.6.5') { throw "Fixture did not exercise requested 4.6.5 runtime: $RuntimeSource" }
if ($result.engine.sourceHash -ne '356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6') { throw 'Export did not use actual pinned official runtime bytes.' }
if ($RuntimeSource -ne 'bundled-runtime') {
  if (-not $result.engine.runtimeParity) { throw 'External runtime silently fell back to bundled source.' }

}
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
  $frameIndex = Get-FontSampleFrame -NextStart $nextStart -Duration $result.durationSeconds -FrameCount ([int]$stream.nb_read_frames)
  $seconds = $frameIndex / 30.0
  $png = Join-Path $run ("dialogue-{0}.png" -f ($index + 1))
  # Decode from the beginning and select an exact frame instead of relying
  # on timestamp seeking; the integer frame index is also recorded below.
  $select = 'select=eq(n\,' + $frameIndex + ')'
  Invoke-Checked $ffmpeg @('-v', 'error', '-y', '-i', ('"' + $video + '"'), '-vf', $select, '-fps_mode', 'passthrough', '-frames:v', '1', ('"' + $png + '"')) ("frame-{0}" -f $index)
  if (-not (Test-Path -LiteralPath $png) -or (Get-Item -LiteralPath $png).Length -eq 0) { throw "FFmpeg emitted no PNG for dialogue $($index+1), frame $frameIndex; diagnostics: $run" }
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
    $frames += [PSCustomObject]@{ sceneLine=$event.line; frameIndex=$frameIndex; seconds=$seconds; png=[IO.Path]::GetFileName($png); sampledCyanTextPixels=$cyan }
  } finally { $bitmap.Dispose() }
}
[PSCustomObject]@{ passed=$true; runtime='WebView2'; sourceKind=$result.engine.sourceKind; runtimeParity=$result.engine.runtimeParity; sourceHash=$result.engine.sourceHash; fontSha256=$fontHash; decodedFrames=[int]$stream.nb_read_frames; width=$stream.width; height=$stream.height; samples=$frames } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $run 'native-summary.json') -Encoding UTF8
Write-Host "Native font export regression passed. Diagnostics: $run"

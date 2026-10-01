param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '../package'),
  [string]$RuntimeRoot = '',
  [string]$OutputRoot = (Join-Path $PSScriptRoot '../.build/figure-diff/native'),
  [int]$TimeoutSeconds = 600,
  [string]$ReuseRun = ''
)
# Actual WebView2/Pixi export with a pinned 4.6.5 project runtime and generated
# opaque PNGs. No SDK, proprietary model, existing project or installed host is
# modified. Portable data tests live in webgal-465-diff.test.mjs.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Native figure-diff regression requires Windows and WebView2.' }
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
if (-not $RuntimeRoot) { $RuntimeRoot = Join-Path $PackageRoot 'runtime/web' }
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$exe = Join-Path $PackageRoot 'WebGAL.Video.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Build the native executable first: $exe" }
$run = if ($ReuseRun) { [IO.Path]::GetFullPath($ReuseRun) } else { Join-Path $OutputRoot ([Guid]::NewGuid().ToString('N')) }
if ($ReuseRun -and -not(Test-Path -LiteralPath $run -PathType Container)) { throw 'Existing diagnostic run is missing.' }
$project = Join-Path $run 'project'
if ($ReuseRun) { if (-not(Test-Path -LiteralPath $project -PathType Container)) { throw 'Existing project snapshot is missing.' } } else { New-Item -ItemType Directory -Path $project -Force | Out-Null }
$utf8 = New-Object Text.UTF8Encoding($false)
function Write-Utf8([string]$file, [string]$text) {
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($file)) -Force | Out-Null
  [IO.File]::WriteAllText($file, $text, $utf8)
}
function Invoke-Checked([string]$command, [string[]]$arguments, [string]$name, [int]$timeout = $TimeoutSeconds) {
  $process = Start-Process -FilePath $command -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $run "$name.log") -RedirectStandardError (Join-Path $run "$name-error.log")
  $null = $process.Handle
  if (-not $process.WaitForExit($timeout * 1000)) {
    & taskkill /PID $process.Id /T /F | Out-Null
    throw "$name exceeded $timeout seconds; stopped only this test's process tree. Diagnostics: $run"
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "$name failed with code $($process.ExitCode); diagnostics: $run" }
}
function Find-MediaTool([string]$name) {
  $local = Join-Path $PackageRoot "bin/$name.exe"
  if (Test-Path -LiteralPath $local) { return $local }
  $resolved = Get-Command $name -ErrorAction SilentlyContinue
  if ($resolved) { return $resolved.Source }
  throw "Missing $name; FFmpeg/FFprobe are required."
}
function Require-Completed([string]$work) {
  $status = Get-Content -LiteralPath (Join-Path $work 'status.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($status.state -ne 'completed') {
    $issues = @($status.scanReport.issues | ForEach-Object { "$($_.kind): $($_.file): $($_.message)" }) -join '; '
    throw "Export did not complete: $($status.state); $($status.message); $issues; diagnostics: $run"
  }
}
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../build/runtime-patches.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne '4.6.5') { throw 'Review this fixture when the pinned WebGAL version changes.' }
# Copy only the manifest's verified runtime files, never upstream demo scenes.
foreach ($file in $manifest.files) {
  $source = Join-Path $RuntimeRoot $file.path
  if (-not (Test-Path -LiteralPath $source) -or (Get-Item -LiteralPath $source).Length -ne $file.sourceSize -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sourceSha256) { throw "Unverified runtime input: $source" }
  $target = Join-Path $project $file.path
  if (-not $ReuseRun) { New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null }
  if (-not $ReuseRun) { Copy-Item -LiteralPath $source -Destination $target }
  elseif (-not(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sourceSha256) { throw "Existing project runtime changed: $target" }
}
Add-Type -AssemblyName System.Drawing
function Make-Png([string]$relative, [int]$width, [int]$height, [Drawing.Color]$color) {
  $target = Join-Path $project $relative
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
  $bitmap = [Drawing.Bitmap]::new($width, $height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try { $graphics.Clear($color); $bitmap.Save($target, [Drawing.Imaging.ImageFormat]::Png) }
  finally { $graphics.Dispose(); $bitmap.Dispose() }
}
if (-not $ReuseRun) {
Make-Png 'game/background/black.png' 1920 1080 ([Drawing.Color]::Black)
# WebGAL fits a figure's full texture to stage height. Transparent margins
# keep the visible 256px square bounded instead of scaling an opaque 256px
# texture to the entire screen and clipping transformed edges.
function Make-FigurePng([string]$relative, [Drawing.Color]$color) {
  $target = Join-Path $project $relative
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
  $bitmap = [Drawing.Bitmap]::new(1024, 1024)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $brush = [Drawing.SolidBrush]::new($color)
  try { $graphics.Clear([Drawing.Color]::Transparent); $graphics.FillRectangle($brush,384,384,256,256); $bitmap.Save($target,[Drawing.Imaging.ImageFormat]::Png) }
  finally { $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
Make-FigurePng 'game/figure/red.png' ([Drawing.Color]::FromArgb(255,240,32,32))
Make-FigurePng 'game/figure/green.png' ([Drawing.Color]::FromArgb(255,32,240,32))
}
# Native 4.6.5 dialogue starts below y=510 at 1280x720. Keep it visibly
# rendered for real dialogue sync/cuts, and measure figures only above y=500.
# Full-frame worker comparisons below still include the entire dialogue UI.
$figureRoi = [PSCustomObject]@{ left=0; top=0; width=1280; height=500 }
if (-not $ReuseRun) { Write-Utf8 (Join-Path $project 'game/config.txt') "Game_name:Figure diff regression;`nDefault_Language:zh_CN;`nStage_Width:1920;`nStage_Height:1080;`n"
Write-Utf8 (Join-Path $project 'game/animation/animationTable.json') '[]'
Write-Utf8 (Join-Path $project 'game/userStyleSheet.css') '' }
# Explicit arguments are supported by the pinned bundle: Swe (image diff),
# uC (transformFrom precedence), uTe (setTransform), KCe (wait). Image diff
# intentionally ignores transform/position when a target image already exists.
# Real dialogue events are the planner's preferred cut candidates. Each one
# follows 500 ms of settled state, outside the 200 ms diff blend and zero-time
# transforms; the remaining 1000 ms preserves the original 1500 ms hold.
# Wait-only scenes legitimately have no dialogue/scene cut pool.
$steps = Get-Content (Join-Path $PSScriptRoot 'fixtures/figure-diff/scene.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$anchors = @{}
$lines = @()
foreach ($step in $steps) {
  if (-not $step.id -or $anchors.ContainsKey($step.id) -or -not $step.source -or $step.source -match "[\r\n]") { throw 'Invalid named fixture step.' }
  $lines += [string]$step.source
  $anchors[$step.id] = $lines.Count
}
$fixtureSource = (($lines -join "`n") + "`n")
if (-not $ReuseRun) { Write-Utf8 (Join-Path $project 'game/scene/start.txt') (($lines -join "`n") + "`n") }
elseif ([IO.File]::ReadAllText((Join-Path $project 'game/scene/start.txt')).Replace("`r`n","`n") -ne $fixtureSource) { throw 'Existing run used a different named scene fixture.' }
$ffmpeg = Find-MediaTool 'ffmpeg'
$ffprobe = Find-MediaTool 'ffprobe'
if (-not $ReuseRun) { Invoke-Checked $exe @('check-runtime') 'webview2' 60 }
function Export-Arguments([string]$video, [string]$work, [int]$workers) {
  return @('export','--project',('"'+$project+'"'),'--scene','start.txt','--out',('"'+$video+'"'),'--work-dir',('"'+$work+'"'),'--width','1280','--height','720','--fps','30','--workers',"$workers",'--mode','manual','--hold','1','--text-speed','100','--story-scope','sceneOnly','--gpu-raw-export','traditional')
}
# Analysis-only preserves the real runtime line times after export cache cleanup.
$analysisWork = Join-Path $run 'analysis'
if (-not $ReuseRun) { Invoke-Checked $exe ((Export-Arguments (Join-Path $run 'analysis.mp4') $analysisWork 1) + @('--analyze','true')) 'analyze' }
Require-Completed $analysisWork
$timing = Get-Content -LiteralPath (Join-Path $analysisWork 'timing-plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($timing.durationSeconds -lt 11 -or $timing.durationSeconds -gt 15) { throw "Unexpected fixture duration: $($timing.durationSeconds)" }
$exports = @()
foreach ($workers in @(1,2)) {
  $video = Join-Path $run "workers-$workers.mp4"
  $work = Join-Path $run "workers-$workers-work"
  if (-not $ReuseRun) { Invoke-Checked $exe (Export-Arguments $video $work $workers) "export-$workers" }
  Require-Completed $work
  $result = Get-Content -LiteralPath ([IO.Path]::ChangeExtension($video,'.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($result.host -ne 'webview2' -or $result.engine.version -ne '4.6.5' -or $result.engine.sourceKind -ne 'project-runtime' -or $result.engine.runtimeParity -ne $true) { throw "workers-$workers did not use the verified 4.6.5 project runtime." }
  if ($result.effectiveWorkers -ne $workers -or @($result.segmentRanges).Count -ne $workers) { throw "workers-$workers did not exercise $workers real segments: $($result.workerReductionReason)" }
  if (-not $ReuseRun) { Invoke-Checked $ffprobe @('-v','error','-count_frames','-show_streams','-of','json',('"'+$video+'"')) "probe-$workers" }
  $probe = Get-Content -LiteralPath (Join-Path $run "probe-$workers.log") -Raw | ConvertFrom-Json
  $stream = @($probe.streams | Where-Object codec_type -eq 'video')[0]
  if ($stream.width -ne 1280 -or $stream.height -ne 720 -or [int]$stream.nb_read_frames -ne [int]$result.totalFrames) { throw 'Decoded dimensions/frame count disagree with metadata.' }
  $exports += [PSCustomObject]@{ workers=$workers; video=$video; videoSha256=(Get-FileHash -LiteralPath $video -Algorithm SHA256).Hash.ToLowerInvariant(); result=$result }
}
if ($exports[0].result.totalFrames -ne $exports[1].result.totalFrames) { throw 'Worker counts changed the total number of frames.' }
$totalFrames = [int]$exports[0].result.totalFrames
$fps = 30
function Line-Time([string]$anchor) {
  if (-not $anchors.ContainsKey($anchor)) { throw "Unknown scene anchor: $anchor" }
  $line = [int]$anchors[$anchor]
  if ($line -lt 1 -or $line -gt $timing.lineTimes.Count -or $null -eq $timing.lineTimes[$line-1]) { throw "Runtime did not execute fixture line $line" }
  return [double]$timing.lineTimes[$line-1]
}
function Frame-At([double]$ms) { return [Math]::Min($totalFrames-1,[Math]::Max(0,[int][Math]::Floor($ms*$fps/1000.0))) }
$samples = [ordered]@{
  beforeDiff=(Frame-At ((Line-Time 'first-diff')-200))
  afterDiff=(Frame-At ((Line-Time 'same-image')-200))
  sameImage=(Frame-At ((Line-Time 'current')-200))
  current=(Frame-At ((Line-Time 'default')-200))
  default=(Frame-At ((Line-Time 'second-diff')-200))
  secondDiff=(Frame-At ((Line-Time 'remove')-200))
  removed=(Frame-At ((Line-Time 'reenter')-200))
  reentered=(Frame-At ((Line-Time 'end')-200))
}
foreach ($offset in @(34,100,167)) { $samples["blend$offset"] = Frame-At ((Line-Time 'first-diff')+$offset) }
foreach ($range in @($exports[1].result.segmentRanges | Select-Object -Skip 1)) {
  foreach ($offset in @(-2,-1,0,1,2)) { $frame=[int]$range.startFrame+$offset; if ($frame -ge 0 -and $frame -lt $totalFrames) { $samples["seam$($range.startFrame)_$offset"]=$frame } }
}
# GetPixel on the default Bitmap constructor returns profile-encoded RGB.
# The decoded PNGs carry WebView2's ICC profile. Windows PS5.1/7 probes verified
# that this overload converts to sRGB (e.g. green232/red210 both become238).
function Open-SrgbBitmap([string]$file) { return [Drawing.Bitmap]::new($file,$true) }
function Measure-Png([string]$file) {
  $bitmap=Open-SrgbBitmap $file
  try {
    $minX=$figureRoi.width; $minY=$figureRoi.height; $maxX=-1; $maxY=-1
    $count=0; [double]$xSum=0; [double]$ySum=0; [double]$dominant=0; [double]$red=0; [double]$green=0
    for ($y=$figureRoi.top;$y -lt $figureRoi.top+$figureRoi.height;$y+=4) { for ($x=$figureRoi.left;$x -lt $figureRoi.left+$figureRoi.width;$x+=4) {
      $p=$bitmap.GetPixel($x,$y); $max=[Math]::Max([int]$p.R,[int]$p.G)
      if ($max -gt 40 -and $max-[int]$p.B -gt 25) { $count++; $xSum+=$x; $ySum+=$y; $dominant+=$max; $red+=$p.R; $green+=$p.G; $minX=[Math]::Min($minX,$x); $minY=[Math]::Min($minY,$y); $maxX=[Math]::Max($maxX,$x); $maxY=[Math]::Max($maxY,$y) }
    } }
    $denominator=[Math]::Max(1,$count)
    return [PSCustomObject]@{ count=$count; minX=$minX; minY=$minY; maxX=$maxX; maxY=$maxY; x=$xSum/$denominator; y=$ySum/$denominator; dominant=$dominant/$denominator; red=$red/$denominator; green=$green/$denominator }
  } finally { $bitmap.Dispose() }
}
function Compare-Png([string]$first,[string]$second) {
  $a=Open-SrgbBitmap $first; $b=Open-SrgbBitmap $second
  try {
    if ($a.Width -ne $b.Width -or $a.Height -ne $b.Height) { throw 'Compared PNG dimensions differ.' }
    [double]$sum=0; $large=0; $count=0
    for ($y=0;$y -lt $a.Height;$y+=4) { for ($x=0;$x -lt $a.Width;$x+=4) {
      $p=$a.GetPixel($x,$y); $q=$b.GetPixel($x,$y)
      $dr=[Math]::Abs([int]$p.R-[int]$q.R); $dg=[Math]::Abs([int]$p.G-[int]$q.G); $db=[Math]::Abs([int]$p.B-[int]$q.B)
      $sum+=$dr+$dg+$db; $count++; if ([Math]::Max($dr,[Math]::Max($dg,$db)) -gt 24) { $large++ }
    } }
    return [PSCustomObject]@{ meanAbsoluteRgb=$sum/(3*$count); changedFraction=$large/[double]$count }
  } finally { $a.Dispose(); $b.Dispose() }
}
$measurements=@{}; $comparisons=@(); $frameHashes=@()
foreach ($entry in $samples.GetEnumerator()) {
  $paths=@()
  foreach ($export in $exports) {
    $png=Join-Path $run ("workers-{0}-{1}-f{2}.png" -f $export.workers,$entry.Key,$entry.Value)
    if (-not $ReuseRun) { Invoke-Checked $ffmpeg @('-v','error','-y','-i',('"'+$export.video+'"'),'-vf',('select=eq(n\,'+$entry.Value+')'),'-fps_mode','passthrough','-frames:v','1',('"'+$png+'"')) ("decode-{0}-{1}" -f $export.workers,$entry.Key) }
    if (-not (Test-Path -LiteralPath $png)) { throw "No decoded frame: $png" }
    $paths+=$png
    $frameHashes += [PSCustomObject]@{workers=$export.workers;sample=$entry.Key;frame=[int]$entry.Value;file=[IO.Path]::GetFileName($png);sha256=(Get-FileHash -LiteralPath $png -Algorithm SHA256).Hash.ToLowerInvariant()}
    $measurements["$($export.workers)-$($entry.Key)"]=Measure-Png $png
  }
  $comparison=Compare-Png $paths[0] $paths[1]
  $comparisons += [PSCustomObject]@{ sample=$entry.Key; frame=[int]$entry.Value; delta=$comparison }
  # Tolerate H.264/JPEG quantization, but reject a missing/mispositioned square.
  if ($comparison.meanAbsoluteRgb -gt 2 -or $comparison.changedFraction -gt 0.01) { throw "Worker replay differs at $($entry.Key), frame $($entry.Value): $($comparison | ConvertTo-Json -Compress)" }
}
function Require-Near([double]$a,[double]$b,[double]$tolerance,[string]$message) { if ([Math]::Abs($a-$b) -gt $tolerance) { throw "$message ($a versus $b)" } }
# Both generated source colors have dominant sRGB channel 240, so these
# comparisons test retained filter strength only after explicit ICC conversion.
foreach ($workers in @(1,2)) {
  $before=$measurements["$workers-beforeDiff"]; $after=$measurements["$workers-afterDiff"]; $same=$measurements["$workers-sameImage"]; $current=$measurements["$workers-current"]; $default=$measurements["$workers-default"]; $second=$measurements["$workers-secondDiff"]
  foreach ($name in @('beforeDiff','afterDiff','sameImage','current','default','secondDiff','reentered')) {
    $box=$measurements["$workers-$name"]
    if ($box.count -lt 100) { throw "No visible figure at workers-$workers $name" }
    if ($box.minX -le $figureRoi.left -or $box.minY -le $figureRoi.top -or $box.maxX -ge $figureRoi.width-4 -or $box.maxY -ge $figureRoi.height-4) { throw "Figure touches measurement boundary at workers-$workers $name; cannot infer an unclipped position." }
  }
  if ($before.red -lt $before.green*2 -or $after.green -lt $after.red*2) { throw 'Image diff did not replace red with green.' }
  Require-Near $before.x $after.x 2 'Image diff changed retained X position'
  Require-Near $before.y $after.y 2 'Image diff changed retained Y position'
  Require-Near $before.dominant $after.dominant 15 'Image diff changed retained brightness'
  Require-Near $after.x $same.x 2 'Same-image diff moved the figure'
  Require-Near $after.y $same.y 2 'Same-image diff moved the figure'
  Require-Near $after.dominant $same.dominant 10 'Same-image diff reset the filter'
  Require-Near $same.y $current.y 2 'transformFrom=current reset an unspecified Y position'
  Require-Near $same.dominant $current.dominant 10 'transformFrom=current reset brightness'
  if ($current.x-$same.x -lt 15) { throw 'transformFrom=current did not apply its X transform.' }
  if ($default.y-$current.y -lt 15 -or $default.dominant -lt $current.dominant*1.45) { throw 'transformFrom=default failed to reset unspecified Y/brightness despite ignoreDefault.' }
  Require-Near $default.x $second.x 2 'Second image diff lost the default transform'
  Require-Near $default.y $second.y 2 'Second image diff lost the default transform'
  Require-Near $default.dominant $second.dominant 15 'Second image diff lost the filter'
  if ($measurements["$workers-removed"].count -gt 20) { throw 'Parser-normalized changeFigureDiff:none did not remove the image.' }
  $blend=$measurements["$workers-blend100"]
  if ($blend.red -lt 25 -or $blend.green -lt 25) { throw 'No red/green cross-fade was visible in the actual diff window.' }
}
# Re-read only the original pinned bundle to prove fixture work did not mutate it.
$bundle=Join-Path $RuntimeRoot 'assets/index-CC7KTie-.js'
if ((Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant() -ne '356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6') { throw 'Source runtime bundle changed during the fixture.' }
[PSCustomObject]@{ passed=$true; runtime='WebView2'; version='4.6.5'; sourceKind='project-runtime'; runtimeParity=$true; totalFrames=$totalFrames; reusedExistingRun=[bool]$ReuseRun; videoHashes=@($exports | ForEach-Object {[PSCustomObject]@{workers=$_.workers;sha256=$_.videoSha256}}); colorMeasurement='ICC-normalized sRGB via GDI+ useEmbeddedColorManagement'; figureRoi=$figureRoi; frameHashes=$frameHashes; anchors=$anchors; samples=$samples; measurements=$measurements; comparisons=$comparisons; segmentRanges=$exports[1].result.segmentRanges } | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $run $(if ($ReuseRun) { 'native-summary-icm-'+[Guid]::NewGuid().ToString('N')+'.json' } else { 'native-summary.json' })) -Encoding UTF8
Write-Host "Native figure-diff regression passed. Diagnostics: $run"

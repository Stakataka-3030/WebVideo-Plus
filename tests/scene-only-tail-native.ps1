param(
 [Parameter(Mandatory=$true)][string]$EngineRoot,
 [ValidateSet('webgal','mygo')][string]$Engine='webgal',
 [string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),
 [string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/ci-native-tests/scene-tail'),
 [string]$MediaToolDirectory=''
)
# This gate intentionally cannot run on a developer's desktop. It invokes the
# actual plan/render commands only on a GitHub-hosted Windows runner.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:OS -ne 'Windows_NT') { throw 'Scene-tail graphical gate requires GitHub-hosted Windows. Do not run locally.' }
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot);$EngineRoot=[IO.Path]::GetFullPath($EngineRoot)
$run=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force|Out-Null
$exe=Join-Path $PackageRoot 'WebGAL.Video.exe'
$kernelSha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
$profiles=@{
 'd9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10'=@{engine='webgal';version='4.6.4'};
 '356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6'=@{engine='webgal';version='4.6.5'};
 'd2b34606a380b9575ce1e50ed2251cb5e38b3d6f9b00200b2b0f252a13d209c0'=@{engine='webgal';version='4.6.6'};
 '0407b5a6326ebaa1608d16541b79b4ccc54a0432947ae7d3a6a855606a68866e'=@{engine='mygo';version='3.2.1'}
}
$entries=@(Get-ChildItem (Join-Path $EngineRoot 'assets') -Filter 'index-*.js'|Where-Object{$profiles.ContainsKey((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())})
if($entries.Count -ne 1){throw 'One exact pinned runtime entry is required'}
$entry=$entries[0].FullName;$profile=$profiles[(Get-FileHash $entry -Algorithm SHA256).Hash.ToLowerInvariant()]
if($profile.engine -ne $Engine){throw 'The pinned runtime does not match -Engine'}
if($MediaToolDirectory){$env:PATH=$MediaToolDirectory+';'+$env:PATH}
$ffmpeg=if(Test-Path (Join-Path $PackageRoot 'bin/ffmpeg.exe')){Join-Path $PackageRoot 'bin/ffmpeg.exe'}else{(Get-Command ffmpeg).Source}
$utf8=New-Object Text.UTF8Encoding($false)
function Write-Text($file,$text){New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($file)) -Force|Out-Null;[IO.File]::WriteAllText($file,$text,$utf8)}
function Write-Json($file,$data){Write-Text $file (ConvertTo-Json -InputObject $data -Depth 64)}
function Q($value){return '"'+$value+'"'}
function Start-Owned($command,[string[]]$arguments,$name){
 $p=Start-Process -FilePath $command -ArgumentList $arguments -PassThru -WindowStyle Hidden -WorkingDirectory $run -RedirectStandardOutput (Join-Path $run "$name.log") -RedirectStandardError (Join-Path $run "$name-error.log")
 $null=$p.Handle;return $p
}
function Wait-Owned($p,$name){
 try{if(-not $p.WaitForExit(240000)){& taskkill /PID $p.Id /T /F|Out-Null;throw "$name timed out"};$p.WaitForExit();if($null -eq $p.ExitCode -or $p.ExitCode -ne 0){throw "$name failed: exit=$($p.ExitCode); evidence=$run"}}finally{$p.Dispose()}
}
function Invoke-Checked($command,[string[]]$arguments,$name){$p=Start-Owned $command $arguments $name;Wait-Owned $p $name}
Add-Type -AssemblyName System.Drawing
$project=Join-Path $run 'project';New-Item -ItemType Directory -Path $project|Out-Null
Copy-Item -LiteralPath (Join-Path $EngineRoot 'assets') -Destination $project -Recurse
foreach($name in @('index.html','lib')){if(Test-Path (Join-Path $EngineRoot $name)){Copy-Item -LiteralPath (Join-Path $EngineRoot $name) -Destination $project -Recurse}}
Write-Text (Join-Path $project 'game/config.txt') "Game_name:Scene tail regression;`nDefault_Language:zh_CN;`nStage_Width:1280;`nStage_Height:720;"
Write-Text (Join-Path $project 'game/animation/animationTable.json') '[]'
Write-Text (Join-Path $project 'game/userStyleSheet.css') ''
function Make-Png($relative,$color,$figure=$false){
 $file=Join-Path $project $relative;New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($file)) -Force|Out-Null
 $bmp=New-Object Drawing.Bitmap(1280,720);$g=[Drawing.Graphics]::FromImage($bmp)
 try{if($figure){$g.Clear([Drawing.Color]::Transparent);$brush=New-Object Drawing.SolidBrush($color);try{$g.FillRectangle($brush,500,100,280,520)}finally{$brush.Dispose()}}else{$g.Clear($color)};$bmp.Save($file,[Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$bmp.Dispose()}
}
Make-Png 'game/background/history.png' ([Drawing.Color]::FromArgb(20,80,160))
Make-Png 'game/figure/hero.png' ([Drawing.Color]::FromArgb(240,130,20)) $true
Make-Png 'game/background/tail.png' ([Drawing.Color]::FromArgb(180,20,130))
New-Item -ItemType Directory -Path (Join-Path $project 'game/bgm') -Force|Out-Null
Invoke-Checked $ffmpeg @('-v','error','-y','-f','lavfi','-i','sine=frequency=437:sample_rate=48000:duration=8','-c:a','pcm_s16le',(Q (Join-Path $project 'game/bgm/history.wav'))) 'make-audio'
Write-Text (Join-Path $project 'game/scene/after.txt') "changeBg:tail.png -duration=0 -next;`nwait:1200;`nbgm:none;`nwait:200;"
$summaries=@()
Write-Json (Join-Path $run 'summary.json') @{packageRoot=$PackageRoot;kernelSha256=$kernelSha256;status='RUNNING';passed=$false;cases=$summaries}
try {
foreach($case in @(@{name='transition';fps=30;mode='manual'},@{name='fractional-61';fps=60;mode='auto'})){
 $name=$case.name;$fps=[int]$case.fps
 $prelude="setTextbox:hide -next;`nbgm:history.wav;`n"
 if($name -eq 'transition'){
  $prelude+="changeBg:history.png -duration=0 -next;`nchangeFigure:hero.png -id=hero -duration=0 -next;`nsetTransform:{`"position`":{`"x`":160}} -target=hero -duration=2400 -keep -next;`nwait:300;`n"
  $target="wait:777;`nchangeFigure:none -id=hero -exitDuration=900 -next;`nwait:611;`nchangeScene:after.txt;"
 }else{
  $prelude+="changeBg:history.png -duration=0 -next;`nchangeFigure:hero.png -id=hero -duration=0 -next;`nsetTransform:{`"position`":{`"x`":160}} -target=hero -duration=2400 -keep -next;`n"
  $target="wait:1016.6666666666666;`nchangeScene:after.txt;"
 }
 Write-Text (Join-Path $project 'game/scene/start.txt') ($prelude+'changeScene:target.txt;')
 Write-Text (Join-Path $project 'game/scene/target.txt') $target
 $plans=@{}
 foreach($scope in @('full','sceneOnly')){
  $job=Join-Path $run "$name-$scope";New-Item -ItemType Directory -Path $job|Out-Null
  $request=@{project=$project;scene='target.txt';sceneSnapshotRoot=(Join-Path $project 'game/scene');jobDir=$job;storyScope=$scope;settings=@{width=1280;height=720;fps=$fps;workers=2;mode=$case.mode;holdSeconds=0.2;textSpeed=100;autoSpeed=100;engine=$Engine;gpu='auto';compatibilityCaptureFormat='png'};bgmFiles=@();gpuRawExport=$false}
  if($Engine -eq 'mygo'){$request.mygoRoot=$project}
  $requestFile=Join-Path $job 'request.json';Write-Json $requestFile $request
  Invoke-Checked $exe @('plan','--request',(Q $requestFile),'--error-log',(Q (Join-Path $job 'plan-error.txt'))) "$name-plan-$scope"
  $timing=Get-Content (Join-Path $job 'planning/timing-plan.json') -Raw|ConvertFrom-Json
  $plan=Get-Content (Join-Path $job 'planning/prepared/plan.json') -Raw|ConvertFrom-Json
  if($plan.engine.id -ne $profile.engine -or $plan.engine.version -ne $profile.version -or -not $plan.engine.runtimeParity){throw 'Native gate used the wrong runtime'}
  $start=[int][Math]::Ceiling([double]$timing.storyTimeline.currentStartSeconds*$fps-0.0000001)
  $end=[Math]::Min([int][Math]::Round([double]$timing.durationSeconds*$fps),[int][Math]::Ceiling([double]$timing.storyTimeline.currentEndSeconds*$fps-0.0000001))
  $plans[$scope]=@{request=$request;job=$job;timing=$timing;plan=$plan;start=$start;end=$end}
 }
 $full=$plans.full;$short=$plans.sceneOnly
 if($full.start -ne $short.start -or $full.end -ne $short.end -or $short.end -le $short.start){throw 'Full-crop and scene-only frame bounds disagree'}
 if($name -eq 'fractional-61'){
  $entryFrame=[double]$short.timing.storyTimeline.currentStartSeconds*$fps
  if([Math]::Abs($entryFrame-[Math]::Round($entryFrame)) -gt 0.000001 -or $short.end-$short.start -ne 62){throw 'The 61*1000/60 rounding regression was not actually exercised at a frame-aligned scene entry'}
  $lastMs=($short.end-1)*1000.0/$fps
  if(-not @($short.timing.performWindows|Where-Object{$_.command -eq 'setTransform' -and $_.hold -and $_.startMs -lt $lastMs -and ($null -eq $_.stopMs -or $_.stopMs -gt $lastMs)}).Count){throw 'The active inherited transform stopped before the rounded final frame'}
  if(-not @($short.plan.replayWindows|Where-Object{$_.command -eq 'setTransform' -and $_.startMs -lt $lastMs -and $_.endMs -gt $lastMs}).Count){throw 'The rounded final frame did not retain an active transform window'}
 }
 if($null -eq $short.timing.storyTimeline.planningTail -or $null -ne $full.timing.storyTimeline.planningTail){throw 'Planning scope fallback unexpectedly bypassed this gate'}
 if(Test-Path (Join-Path $short.job 'planning/prepared/web/game/background/tail.png')){throw 'Tail asset entered limited snapshot'}
 if(-not(Test-Path (Join-Path $full.job 'planning/prepared/web/game/background/tail.png'))){throw 'Full control did not contain tail asset'}
 $count=$short.end-$short.start;$cut=$short.start+[int][Math]::Floor($count/2)
 $renders=@(
  @{name='baseline';source=$full;start=$full.start;end=$full.end},
  @{name='single';source=$short;start=$short.start;end=$short.end},
  @{name='parallel-a';source=$short;start=$short.start;end=$cut},
  @{name='parallel-b';source=$short;start=$cut;end=$short.end}
 )
 $pending=@()
 try{
  foreach($render in $renders){
   $part=Join-Path $render.source.job $render.name;New-Item -ItemType Directory -Path $part|Out-Null
   $request=$render.source.request.Clone();$request.partDir=$part;$request.startFrame=$render.start;$request.endFrame=$render.end;$request.firstSimulationFrame=0
   $file=Join-Path $part 'request.json';Write-Json $file $request;$render.part=$part
   $p=Start-Owned $exe @('render','--request',(Q $file),'--error-log',(Q (Join-Path $part 'error.txt'))) "$name-$($render.name)"
   if($render.name -like 'parallel-*'){$pending+=@{process=$p;name=$render.name}}else{Wait-Owned $p $render.name}
  }
  foreach($item in $pending){Wait-Owned $item.process $item.name}
 }finally{foreach($item in $pending){try{if(-not $item.process.HasExited){& taskkill /PID $item.process.Id /T /F|Out-Null}}catch{}}}
 $baseline=Join-Path $renders[0].part 'video.mp4';$comparisons=@()
 foreach($render in $renders|Select-Object -Skip 1){
  $offset=$render.start-$short.start;$length=$render.end-$render.start;$stats="$name-$($render.name)-psnr.txt"
  $filter="[0:v]trim=start_frame=$($offset):end_frame=$($offset+$length),setpts=PTS-STARTPTS,format=yuv420p[ref];[1:v]setpts=PTS-STARTPTS,format=yuv420p[out];[ref][out]psnr=stats_file=$stats"
  Invoke-Checked $ffmpeg @('-v','error','-i',(Q $baseline),'-i',(Q (Join-Path $render.part 'video.mp4')),'-filter_complex',(Q $filter),'-an','-f','null','-') "$name-compare-$($render.name)"
  $rows=@(Get-Content (Join-Path $run $stats));$errors=@($rows|ForEach-Object{if($_ -match 'mse_avg:([\d.]+)'){[double]::Parse($Matches[1],[Globalization.CultureInfo]::InvariantCulture)}})
  if($errors.Count -ne $length){throw 'Decoded frame comparison did not cover the complete output, including its last frame'}
  $max=($errors|Measure-Object -Maximum).Maximum
  # Independent H.264 segment starts can differ slightly in quantization.
  if($max -gt 4){throw "Pixel parity failed: $name/$($render.name), max MSE=$max"}
  $comparisons+=@{name=$render.name;frames=$length;maxFrameMse=$max;firstSimulationFrame=0}
 }
 foreach($frame in $(if($name -eq 'fractional-61'){@(0,($count-1))}else{@(0)})){
  $png=Join-Path $run "$name-inherited-stage-$frame.png";Invoke-Checked $ffmpeg @('-v','error','-y','-i',(Q (Join-Path $renders[1].part 'video.mp4')),'-vf',(Q "select=eq(n\,$frame)"),'-frames:v','1',(Q $png)) "$name-inherited-stage-$frame"
  $bitmap=[Drawing.Bitmap]::new($png,$true);$blue=0;$orange=0
  try{for($y=0;$y -lt $bitmap.Height;$y+=4){for($x=0;$x -lt $bitmap.Width;$x+=4){$pixel=$bitmap.GetPixel($x,$y);if($pixel.B -gt $pixel.R+50 -and $pixel.B -gt $pixel.G+40){$blue++};if($pixel.R -gt $pixel.G+50 -and $pixel.G -gt $pixel.B+40){$orange++}}}}finally{$bitmap.Dispose()}
  if($blue -lt 100 -or $orange -lt 100){throw 'Pixel parity compared a blank stage instead of the inherited background and figure'}
 }
 # Mix production audio arguments, then compare selected lossless PCM samples.
 foreach($scope in @('full','sceneOnly')){
  $p=$plans[$scope];$mix=@(Get-Content (Join-Path $p.job 'planning/audio-args.json') -Raw|ConvertFrom-Json)
  $mixArgs=@($mix|ForEach-Object{if($_ -match '[\s\[\];]'){Q $_}else{[string]$_}})
  $wav=Join-Path $p.job 'mix.wav';Invoke-Checked $ffmpeg (@('-v','error','-y')+$mixArgs+@((Q $wav))) "$name-mix-$scope"
  $pcm=Join-Path $p.job 'selected.s16';$a=[int][Math]::Round($short.start*48000.0/$fps);$b=[int][Math]::Round($short.end*48000.0/$fps)
  Invoke-Checked $ffmpeg @('-v','error','-y','-i',(Q $wav),'-af',"atrim=start_sample=$($a):end_sample=$b",'-ac','1','-ar','48000','-f','s16le',(Q $pcm)) "$name-pcm-$scope"
 }
 $pcmFull=Join-Path $full.job 'selected.s16';$pcmShort=Join-Path $short.job 'selected.s16'
 if((Get-Item $pcmShort).Length -ne ($b-$a)*2 -or (Get-FileHash $pcmFull).Hash -ne (Get-FileHash $pcmShort).Hash){throw 'Inherited BGM selected PCM differs or is incomplete'}
 $summaries+=@{name=$name;fps=$fps;mode=$case.mode;startFrame=$short.start;endFrame=$short.end;sceneEndSeconds=$short.timing.storyTimeline.currentEndSeconds;pixelComparisons=$comparisons;pcmEqual=$true;tailSnapshotAbsent=$true}
 Write-Json (Join-Path $run 'summary.json') @{packageRoot=$PackageRoot;kernelSha256=$kernelSha256;status='RUNNING';passed=$false;cases=$summaries;engineSha256=(Get-FileHash $entry).Hash}
}
}catch{Write-Json (Join-Path $run 'summary.json') @{packageRoot=$PackageRoot;kernelSha256=$kernelSha256;status='FAIL';passed=$false;cases=$summaries;error=$_.Exception.Message};throw}
Write-Json (Join-Path $run 'summary.json') @{packageRoot=$PackageRoot;kernelSha256=$kernelSha256;status='PASS';passed=$true;cases=$summaries;engine=$profile;engineSha256=(Get-FileHash $entry).Hash;note='Synthetic root-replay image/transition/audio parity; no automatic-anchor, GPU-memory or Live2D SDK pixel assertion.'}
Write-Output "PASS hosted native scene-tail parity; evidence=$run"

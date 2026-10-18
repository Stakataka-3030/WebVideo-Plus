param([Parameter(Mandatory=$true)][string]$EngineRoot,[string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),[string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/render-readiness'),[string]$MediaToolDirectory='', [ValidateSet('webgal','mygo')][string]$Engine='webgal',[ValidateSet('jpeg','png')][string]$CaptureFormat='jpeg',[int]$CoreMemoryMiB=-1,[int]$ExpectedMemoryMiB=-1)
$ErrorActionPreference='Stop'
$allowed=@{
 'd9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10'='4.6.4 prepared';
 '356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6'='4.6.5';
 'd2b34606a380b9575ce1e50ed2251cb5e38b3d6f9b00200b2b0f252a13d209c0'='4.6.6';
 '0407b5a6326ebaa1608d16541b79b4ccc54a0432947ae7d3a6a855606a68866e'='MyGO3.2.1'
}
$entry=Get-ChildItem (Join-Path $EngineRoot 'assets') -Filter 'index-*.js'|Where-Object {$allowed.ContainsKey((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())}
if(@($entry).Count -ne 1){throw 'Use a separately supplied, pinned official runtime.'}
$run=Join-Path $OutputRoot ([Guid]::NewGuid().ToString('N'));$project=Join-Path $run 'project';New-Item -ItemType Directory -Path $project -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $EngineRoot 'assets') -Destination $project -Recurse
if(Test-Path (Join-Path $EngineRoot 'lib')){Copy-Item -LiteralPath (Join-Path $EngineRoot 'lib') -Destination $project -Recurse}
foreach($name in @('index.html','webgal-engine.json','favicon.ico')){if(Test-Path (Join-Path $EngineRoot $name)){Copy-Item -LiteralPath (Join-Path $EngineRoot $name) -Destination $project}}
$utf8=New-Object Text.UTF8Encoding($false)
function Write-Text($relative,$value){$file=Join-Path $project $relative;New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($file)) -Force|Out-Null;[IO.File]::WriteAllText($file,$value,$utf8)}
Write-Text 'game/config.txt' "Game_name:Readiness repair regression;`nDefault_Language:zh_CN;`nStage_Width:1920;`nStage_Height:1080;`n"
Write-Text 'game/animation/animationTable.json' '[]'
Write-Text 'game/userStyleSheet.css' ''
Write-Text 'game/scene/start.txt' @'
setTextbox:hide -next;
旁白:隐藏对白仍需完成逻辑提交。;
setTextbox:on -next;
旁白:显示对白 ABC 末字。;
setTextbox:hide -next;
wait:100;
setTextbox:on -next;
wait:100;
:;
旁白:零宽字 a​b 与末字。;
旁白:括号(a,b)与[富文本](style=color~red)和[函数](style=color~rgb(255,0,0))末字。;
旁白:第一行|第二行|第三行;
旁白:拼接 ABC -concat;
旁白:Latin ABC;
旁白:DEF -concat;
filmMode:letterbox -next;
setTextbox:hide -next;
旁白:电影模式保留对白 ABC 😀。;
filmMode:none -next;
setTextbox:on -next;
旁白:恢复普通显示。;
'@
$exe=Join-Path $PackageRoot 'WebGAL.Video.exe'
if($MediaToolDirectory){$env:PATH=$MediaToolDirectory+';'+$env:PATH}
$ffprobe=if(Test-Path (Join-Path $PackageRoot 'bin/ffprobe.exe')){Join-Path $PackageRoot 'bin/ffprobe.exe'}else{(Get-Command ffprobe -ErrorAction Stop).Source}
if(-not(Test-Path $exe)){throw 'Build the native package first.'}
$arguments=@('export','--project',('"'+$project+'"'),'--scene','start.txt','--out',('"'+(Join-Path $run 'full.mp4')+'"'),'--work-dir',('"'+(Join-Path $run 'full-work')+'"'),'--width','1280','--height','720','--fps','30','--workers','1','--mode','manual','--hold','0.2','--text-speed','100','--story-scope','sceneOnly','--gpu-raw-export','traditional')
$arguments+=@('--engine',$Engine,'--compatibility-capture-format',$CaptureFormat)
if($CoreMemoryMiB -ge 0){$arguments+=@('--cubism-core-memory-mib',[string]$CoreMemoryMiB)}
$process=Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run 'full.log') -RedirectStandardError (Join-Path $run 'full-error.log')
[IO.File]::WriteAllText((Join-Path $run 'process.json'),(@{pid=$process.Id;run=$run;project=$project;startedUtc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json),$utf8)
Write-Output "PID=$($process.Id) RUN=$run"

$watch=[Diagnostics.Stopwatch]::StartNew()
while(-not $process.WaitForExit(1000)){if($watch.Elapsed.TotalSeconds -gt 180){& taskkill /PID $process.Id /T /F | Out-Null;throw "Owned export exceeded 180 seconds: $run"}}
$process.WaitForExit();$status=Get-Content (Join-Path $run 'full-work/status.json') -Raw|ConvertFrom-Json
if($process.ExitCode -ne 0 -or $status.state -ne 'completed'){throw "Native readiness export failed: $($status.message); $run"}
$result=$status.result
if($ExpectedMemoryMiB -ge 0){$request=Get-Content (Join-Path $run 'full-work/request.json') -Raw|ConvertFrom-Json;if([int]$request.settings.cubismCoreInitialMemoryMiB -ne $ExpectedMemoryMiB){throw 'Export request memory default/override mismatch'}}
if(-not $result.engine.runtimeParity -or $result.engine.sourceKind -notin @('project-runtime','mygo-project-runtime')){throw 'The test must use its exact project runtime.'}
$probe=& $ffprobe -v error -count_frames -show_streams -of json (Join-Path $run 'full.mp4')|ConvertFrom-Json
$video=@($probe.streams|Where-Object codec_type -eq 'video')[0]
if($video.width -ne 1280 -or $video.height -ne 720 -or [int]$video.nb_read_frames -ne [int]$result.totalFrames){throw 'Decoded dimensions or frame count disagree.'}
Write-Output "PASS native readiness: engine=$($result.engine.version) capture=$($result.captureFormat) frames=$($video.nb_read_frames); evidence=$run"

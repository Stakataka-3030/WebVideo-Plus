param(
 [string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),
 [string]$RuntimeRoot=(Join-Path $PSScriptRoot '../.build/webgal-4.6.5'),
 [string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/navigation-observation'),
 [ValidateRange(1,10)][int]$Repeats=10,
 [ValidateRange(10,120)][int]$TimeoutSeconds=60
)
# Additional diagnosis only. The unchanged original font/figure gate runs first
# against package/WebGAL.Video.exe; a passing observation cannot cancel its failure.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$RuntimeRoot=[IO.Path]::GetFullPath($RuntimeRoot)
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
if(Get-ChildItem -LiteralPath $OutputRoot -Filter '*.jsonl' -File){throw 'Choose a fresh observation output directory; never combine traces from separate runs'}
$original=Join-Path $PackageRoot 'WebGAL.Video.exe'
$fixtureRoot=Join-Path $repo '.build/figure-diff/native'
$fixture=if(Test-Path -LiteralPath $fixtureRoot){Get-ChildItem -LiteralPath $fixtureRoot -Directory | Where-Object {$_.Name -match '^[a-f0-9]{32}$' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'project/game/scene/start.txt'))} | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1}
if(-not(Test-Path -LiteralPath $original)-or -not $fixture){
 [ordered]@{notRelease=$true;executed=$false;reason='Original native package or generated figure fixture is unavailable';passesOriginalGate=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputRoot 'result.json') -Encoding utf8
 Write-Output 'Navigation observation was not run: original native package or synthetic figure fixture unavailable.'
 return
}
$project=Join-Path $fixture.FullName 'project'
# Only reuse the checked-in synthetic fixture, never an arbitrary user project.
$manifest=Get-Content -LiteralPath (Join-Path $repo 'build/runtime-4.6.5-test.json') -Raw | ConvertFrom-Json
foreach($file in $manifest.files){foreach($base in @($RuntimeRoot,$project)){$source=Join-Path $base $file.path;if(-not(Test-Path -LiteralPath $source)-or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sourceSha256){throw "Synthetic navigation input does not match pinned runtime: $($file.path)"}}}
$steps=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fixtures/figure-diff/scene.json') -Raw | ConvertFrom-Json
$expected=(@($steps | ForEach-Object source) -join "`n")+"`n"
if([IO.File]::ReadAllText((Join-Path $project 'game/scene/start.txt')).Replace("`r`n","`n") -cne $expected){throw 'Original native test did not leave the expected synthetic figure scene'}
$allowed=@($manifest.files | ForEach-Object {'/'+$_.path.Replace('\','/')})+@('/index.html','/game/config.txt','/game/userStyleSheet.css','/game/animation/animationTable.json','/game/template/template.json','/game/scene/start.txt','/game/background/black.png','/game/figure/red.png','/game/figure/green.png')
$private=Join-Path $repo ('.build/navigation-diagnostic/'+[Guid]::NewGuid().ToString('N'))
& (Join-Path $PSScriptRoot 'build-navigation-diagnostic.ps1') -PackageRoot $PackageRoot -OutputRoot $private -RecorderChecks | Out-Host
$exe=& (Join-Path $PSScriptRoot 'build-navigation-diagnostic.ps1') -PackageRoot $PackageRoot -OutputRoot $private
Copy-Item -LiteralPath (Join-Path $private 'build-manifest.json') -Destination $OutputRoot -Force
$originalHash=(Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash
$attempts=@()
for($attempt=1;$attempt -le $Repeats;$attempt++){
 $name='planning-'+$attempt.ToString('D2');$work=Join-Path $private $name
 $config=Join-Path $OutputRoot ($name+'.json')
 [ordered]@{allowedPaths=@($allowed | Sort-Object -Unique)} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $config -Encoding utf8
 $arguments=@('export','--project',('"'+$project+'"'),'--scene','start.txt','--out',('"'+(Join-Path $private ($name+'.mp4'))+'"'),'--work-dir',('"'+$work+'"'),'--width','1280','--height','720','--fps','30','--workers','2','--mode','manual','--hold','1','--text-speed','100','--story-scope','sceneOnly','--gpu-raw-export','traditional','--analyze','true','--synthetic-navigation-trace',('"'+$config+'"'))
 $process=Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $private ($name+'.log')) -RedirectStandardError (Join-Path $private ($name+'-error.log'))
 $null=$process.Handle
 $timedOut=-not $process.WaitForExit($TimeoutSeconds*1000)
 if($timedOut){& taskkill /PID $process.Id /T /F | Out-Null}
 $process.WaitForExit();$code=$process.ExitCode;$process.Dispose()
 $tracePath=[IO.Path]::ChangeExtension($config,'jsonl')
 $trace=@(if(Test-Path -LiteralPath $tracePath){Get-Content -LiteralPath $tracePath | ForEach-Object {$_ | ConvertFrom-Json}})
 $statusFile=Join-Path $work 'status.json'
 $status=if(Test-Path -LiteralPath $statusFile){Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json}
 $observed=(@($trace | Where-Object kind -eq 'observer-ready').Count -eq 1)-and (@($trace | Where-Object kind -eq 'navigation-starting').Count -eq 2)
 $observerErrors=@($trace | Where-Object {$_.kind -in 'observer-error','limit'}).Count
 $valid=($code -eq 0) -and (-not $timedOut) -and $observed -and ($observerErrors -eq 0) -and ($status.state -eq 'completed') -and ($status.result.engine.sourceHash -eq '356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6') -and ($status.result.durationSeconds -eq 12)
 $attempts+=[ordered]@{attempt=$attempt;exitCode=$code;timedOut=$timedOut;observedBothNavigations=$observed;observerErrors=$observerErrors;completed=$valid;pageErrors=@($trace | Where-Object kind -eq 'page-error').Count;requestFailures=@($trace | Where-Object kind -eq 'request-failed').Count}
 [ordered]@{notRelease=$true;executed=$true;passesOriginalGate=$false;requestedAttempts=$Repeats;attempts=$attempts;originalExporterUnchanged=((Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash -eq $originalHash)} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputRoot 'result.json') -Encoding utf8
 if(-not $valid){throw "Synthetic planning observation stopped at attempt $attempt (exit $code; timeout $timedOut). Original failure semantics are unchanged; inspect navigation-observation JSONL."}
}
if((Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash -ne $originalHash){throw 'Original native exporter changed during observation'}
Write-Output "Navigation observation completed $Repeats planning attempts. This does not replace or pass the original native graphics gate."

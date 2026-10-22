param(
 [Parameter(Mandatory=$true)][string]$TerreSource,
 [Parameter(Mandatory=$true)][ValidateSet('4.6.4','4.6.5','4.6.6')][string]$HostVersion,
 [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot),
 [string]$PackageRoot,
 [string]$SourceArchive,
 [string]$OutputRoot
)
# Full package CLI transactions on a newly owned copy. Never launches Terre,
# lifecycle or service; no real project, installation or system setting writes.
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'Windows filesystem fixture required.'}
$RepositoryRoot=[IO.Path]::GetFullPath($RepositoryRoot)
if(!$PackageRoot){$PackageRoot=Join-Path $RepositoryRoot 'package'}
if(!$OutputRoot){$OutputRoot=Join-Path $RepositoryRoot '.build/shared-install-transactions'}
$TerreSource=[IO.Path]::GetFullPath($TerreSource);$PackageRoot=[IO.Path]::GetFullPath($PackageRoot);$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
function Hash([string]$file){if(Test-Path -LiteralPath $file -PathType Leaf){return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()};return '<absent>'}
function Require([bool]$value,[string]$message){if(!$value){throw $message}}
function Put([string]$file,[string]$text){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file));[IO.File]::WriteAllText($file,$text,[Text.UTF8Encoding]::new($false))}
function Write-Json([string]$file,$value){Put $file ($value | ConvertTo-Json -Depth 30 -Compress)}
$baselinePath=if($HostVersion -eq '4.6.4'){Join-Path $RepositoryRoot 'baseline/local-baseline.json'}else{Join-Path $RepositoryRoot "baseline/terre-$HostVersion.json"}
$baseline=Get-Content -LiteralPath $baselinePath -Raw | ConvertFrom-Json
$bundleRelative=if($HostVersion -eq '4.6.4'){'public/assets/'+$baseline.baseBundle}else{$baseline.bundle -replace '^release/',''}
$bundleHash=$baseline.baseHash;$sourceKind='recorded-baseline';$archiveHash=$null
if($SourceArchive){
 $archiveHash=Hash ([IO.Path]::GetFullPath($SourceArchive))
 if($HostVersion -eq '4.6.4'){
  Require ($archiveHash -eq '317f3cc0c03c933d4ab34af0cafac628f37ac521f421226f2469b56ceb7e789e') 'Unknown official 4.6.4 archive hash.'
  $bundleRelative='public/assets/index-01972026.js';$bundleHash='633feac547e87cc2912ae30416ecfcb6ee94b43138e6b641805acd4a646ad73d';$sourceKind='official-windows-zip-variant'
 }else{Require ($archiveHash -eq $baseline.releaseAssetSha256) 'Official archive hash does not match the recorded release.'}
}
Require ((Hash (Join-Path $TerreSource $bundleRelative)) -eq $bundleHash) 'Untouched official source bundle hash required.'
Require (!(Test-Path (Join-Path $TerreSource 'webvideo-plus.json'))) 'Source must be an unmodified official distribution.'
Require (@(Get-ChildItem -LiteralPath $TerreSource -Force -Recurse | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count -eq 0) 'Source must contain only ordinary directories and files.'
$manager=Join-Path $PackageRoot 'WebVideoPlus.Manager.exe';Require (Test-Path -LiteralPath $manager -PathType Leaf) 'Wait for the full package build.'
$product=Get-Content -LiteralPath (Join-Path $PackageRoot 'product.json') -Raw | ConvertFrom-Json
$version=Get-Content -LiteralPath (Join-Path $RepositoryRoot 'version.json') -Raw | ConvertFrom-Json
Require ($product.version -eq $version.productVersion -and $product.buildChannel -eq 'internal' -and !!$product.internalVersion) 'Current internal package required.'
$executables=@(Get-ChildItem -LiteralPath $TerreSource -File -Filter '*.exe' | Where-Object {($_.BaseName -replace '[\s_-]+','') -eq 'WebGALTerre'})
Require ($executables.Count -eq 1) 'Exactly one official Terre executable required.'
$exe=$executables[0].Name
$sourceHashes=@{};foreach($file in @('public/index.html',$bundleRelative,$exe)){$sourceHashes[$file]=Hash (Join-Path $TerreSource $file)}
if($sourceKind -eq 'official-windows-zip-variant'){Require ($sourceHashes[$exe] -eq '3aa355e00562186fbd85b71e834328d74d6e1cb9ac797b3a0ff69c26ed0efe84') 'Official variant executable hash mismatch.'}
$run=Join-Path $OutputRoot ([Guid]::NewGuid().ToString('N'));$hostRoot=Join-Path $run 'host'
[void][IO.Directory]::CreateDirectory($hostRoot)
Get-ChildItem -LiteralPath $TerreSource -Force | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $hostRoot -Recurse}
$state=Join-Path $run 'state';$cache=Join-Path $run 'cache';$work=Join-Path $run 'work';$games=Join-Path $run 'games';$output=Join-Path $run 'output';$shared=Join-Path $run '共享 原件';$cancel=Join-Path $run 'cancel.txt'
foreach($dir in @($state,$cache,$work,$games,$output,$shared,(Join-Path $state 'user-data'))){[void][IO.Directory]::CreateDirectory($dir)}
$registry=Join-Path $state 'user-data/shared-assets.json';$http=Join-Path $state 'user-data/shared-assets.json.http.json'
$libraryId='11111111111111111111111111111111';$httpId='22222222222222222222222222222222'
Write-Json $registry @{schemaVersion=1;libraries=@(@{id=$libraryId;kind='all';name='事务测试';root=$shared})}
Write-Json $http @{schemaVersion=1;id=$httpId;port=32152}
$sentinels=@((Join-Path $shared '原件.txt'),(Join-Path $work 'keep.txt'),(Join-Path $output 'keep.txt'),(Join-Path $state 'user-data/keep.txt'))
foreach($file in $sentinels){Put $file 'owned fixture sentinel'}
$preserve=@{};foreach($file in ($sentinels+@($registry,$http))){$preserve[$file]=Hash $file}
$globalRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WebGALVideoExporter'
$globals=@{};foreach($file in @('last-install.json','instances.json')){$globals[$file]=Hash (Join-Path $globalRoot $file)}
$results=[Collections.Generic.List[object]]::new()
function Assert-Preserved {
 foreach($file in $preserve.Keys){Require ((Hash $file) -eq $preserve[$file]) "Fixture shared source or registry changed: $file"}
 foreach($file in $globals.Keys){Require ((Hash (Join-Path $globalRoot $file)) -eq $globals[$file]) "Global bookkeeping changed during isolated test: $file"}
 foreach($file in $sourceHashes.Keys){Require ((Hash (Join-Path $TerreSource $file)) -eq $sourceHashes[$file]) "Official input source changed: $file"}
}
function Invoke-Owned([string]$command,[string]$name,[string]$modules='', [bool]$failure=$false,[string]$cancelFile=''){
 $arguments=@($command,'--terre-dir',('"'+$hostRoot+'"'),'--state-dir',('"'+$state+'"'),'--install-cache-dir',('"'+$cache+'"'),'--work-dir',('"'+$work+'"'),'--games-root',('"'+$games+'"'),'--output-dir',('"'+$output+'"'),'--terre-url','http://localhost:32151','--no-recent','true','--delete-data','false','--delete-cache','false')
 if($modules){$arguments+=@('--modules',$modules)};if($cancelFile){$arguments+=@('--cancel-file',('"'+$cancelFile+'"'))}
 $watch=[Diagnostics.Stopwatch]::StartNew();$p=Start-Process -FilePath $manager -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run "$name.log") -RedirectStandardError (Join-Path $run "$name.error.log");$null=$p.Handle
 while(!$p.WaitForExit(1000)){if($watch.Elapsed.TotalSeconds -gt 180){$p.Kill();throw "Owned manager timeout: $name"}}
 $p.WaitForExit();$watch.Stop();$text=(Get-Content -LiteralPath (Join-Path $run "$name.log") -Raw)+(Get-Content -LiteralPath (Join-Path $run "$name.error.log") -Raw)
 if (!(($failure -and $p.ExitCode -ne 0) -or (!$failure -and $p.ExitCode -eq 0))) { Write-Output $text; Write-Json (Join-Path $run 'failed-operation.json') @{name=$name;exitCode=$p.ExitCode;run=$run;text=$text}; throw "Unexpected exit $($p.ExitCode) for $name; see $run" }
 Assert-Preserved
 $results.Add([ordered]@{operation=$name;exitCode=$p.ExitCode;expectedFailure=$failure;elapsedMs=$watch.ElapsedMilliseconds})
 return $text
}
function Snapshot {
 $map=@{};foreach($pair in @(@('host',$hostRoot),@('state',$state),@('cache',$cache))){foreach($file in Get-ChildItem -LiteralPath $pair[1] -File -Recurse -Force){$relative=$file.FullName.Substring($pair[1].Length).Replace('\','/');$map[$pair[0]+$relative]=Hash $file.FullName}}
 return $map
}
function Assert-Same($before,[string]$name){$after=Snapshot;Require ($before.Count -eq $after.Count) "File count changed: $name";foreach($key in $before.Keys){Require ($after[$key] -eq $before[$key]) "Content changed after $name`: $key"}}
function Installed-Source { $manifest=Get-Content -LiteralPath (Join-Path $state 'install.json') -Raw | ConvertFrom-Json;return [IO.File]::ReadAllText((Join-Path $hostRoot ('public/assets/'+$manifest.installedBundle))) }
function Check-Enabled([bool]$enabled){$source=Installed-Source;$at=$source.IndexOf('const WebVideoSharedMaterials=(()=>{');Require ($at -ge 0) 'Shared reference runtime missing.';Require ($source.Substring($at,[Math]::Min(160,$source.Length-$at)).Contains('const enabled='+$enabled.ToString().ToLowerInvariant()+';')) 'Shared module enabled value mismatch.';Require ($source.Contains('const WebVideoProjectResources=(()=>{')) 'Creation options runtime missing.'}
Put $cancel 'cancel';$before=Snapshot
$text=Invoke-Owned 'install' 'canceled-before-install' 'sharedAssets,exporter,compactGameTools' $true $cancel
Require ($text.Contains('已取消')) 'Cancellation was not the observed failure.';Assert-Same $before 'pre-install cancellation';Remove-Item -LiteralPath $cancel
$null=Invoke-Owned 'install' 'install-shared-export' 'sharedAssets,exporter,compactGameTools';Check-Enabled $true
$installed=Get-Content -LiteralPath (Join-Path $hostRoot 'webvideo-plus.json') -Raw | ConvertFrom-Json
Require ($installed.internalVersion -eq $product.internalVersion -and 'sharedAssets' -in $installed.modules -and 'exportKernel' -in $installed.modules) 'Installed identity/dependencies mismatch.'
$null=Invoke-Owned 'install' 'reinstall-shared-export' 'sharedAssets,exporter,compactGameTools';Check-Enabled $true
$project=Join-Path $games '中文 空格 项目';$scene=Join-Path $project 'game/scene/branch/start.txt';$config=Join-Path $project 'game/config.txt';$engineMarker=Join-Path $project '.webvideo-engine.json';Put $scene ':;';Put $config 'Game_name:事务测试;'
Put $scene ('changeFigure:__shared/'+$libraryId+'/model.model3.json;')
$null=Invoke-Owned 'install' 'disable-shared-retain-export-kernel' 'exporter,compactGameTools';Check-Enabled $false
foreach($case in @('legacy-scene','http-scene','http-config','engine-marker')){
 Put $scene ':;';Put $config 'Game_name:事务测试;'
 switch($case){
  'legacy-scene'{Put $scene ('changeFigure:__shared/'+$libraryId+'/model.model3.json;')}
  'http-scene'{Put $scene ('changeFigure:http://127.0.0.1:32152/webvideo-shared/'+$httpId+'/'+$libraryId+'/model.model3.json;')}
  'http-config'{Put $config ('Title_bgm:http://127.0.0.1:32152/webvideo-shared/'+$httpId+'/'+$libraryId+'/music.ogg;')}
  'engine-marker'{Write-Json $engineMarker @{schemaVersion=1;engine='fixture'}}
 }
 $before=Snapshot;$text=Invoke-Owned 'install' ('protect-last-kernel-'+$case) 'compactGameTools' $true
 Require ($text.Contains('已有项目引用外部资源')) "Wrong last-kernel refusal: $case";Assert-Same $before $case
 if(Test-Path -LiteralPath $engineMarker){Remove-Item -LiteralPath $engineMarker}
}
Put $config ('Title_bgm:http://127.0.0.1:32152/webvideo-shared/'+$httpId+'/'+$libraryId+'/music.ogg;')
$before=Snapshot;$text=Invoke-Owned 'uninstall' 'protect-uninstall-with-http-config' '' $true
Require ($text.Contains('已有项目引用外部资源')) 'Uninstall with live references was not refused.';Assert-Same $before 'uninstall live reference'
Put $scene ':;';Put $config 'Game_name:事务测试;'
$null=Invoke-Owned 'install' 'reenable-shared-retain-registry' 'sharedAssets,exporter,compactGameTools';Check-Enabled $true
# A directory at the ownership-marker destination causes a late real filesystem failure.
# Its original file is held only in this owned fixture; no fault hook/lock/ACL change.
$manifest=Join-Path $state '.webvideo-data.json';$held=Join-Path $run 'held-ownership-marker.json';Move-Item -LiteralPath $manifest -Destination $held;[void][IO.Directory]::CreateDirectory($manifest)
$before=Snapshot;$watcher=[IO.FileSystemWatcher]::new((Join-Path $hostRoot 'public'),'index.html');$watcher.NotifyFilter=[IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::LastWrite
$eventIds=@();foreach($eventName in @('Changed','Created','Renamed')){$eventId='owned-install-'+[Guid]::NewGuid().ToString('N');$null=Register-ObjectEvent -InputObject $watcher -EventName $eventName -SourceIdentifier $eventId;$eventIds+=$eventId}
$watcher.EnableRaisingEvents=$true
try{
 $null=Invoke-Owned 'install' 'late-owned-marker-destination-failure' 'sharedAssets,exporter,compactGameTools' $true
 Assert-Same $before 'late failure atomic rollback'
 $events=@(foreach($eventId in $eventIds){Get-Event -SourceIdentifier $eventId -ErrorAction SilentlyContinue})
 Require ($events.Count -gt 0) 'Late failure was not witnessed after frontend publication; do not claim transaction rollback coverage.'
 $results.Add([ordered]@{operation='late-failure-rollback-content-equality';passed=$true;frontendWriteEvents=$events.Count})
}finally{
 $watcher.Dispose();foreach($eventId in $eventIds){Unregister-Event -SourceIdentifier $eventId -ErrorAction SilentlyContinue;Get-Event -SourceIdentifier $eventId -ErrorAction SilentlyContinue | Remove-Event}
 # Only the empty directory created above is removed, after exact ownership check.
 Require ([IO.Path]::GetFullPath($manifest) -eq (Join-Path $state '.webvideo-data.json')) 'Unexpected fixture marker target.'
 if(Test-Path -LiteralPath $manifest -PathType Container){[IO.Directory]::Delete($manifest)}
 Move-Item -LiteralPath $held -Destination $manifest
}
$null=Invoke-Owned 'install' 'reinstall-after-rollback' 'sharedAssets,exporter,compactGameTools';Check-Enabled $true
$null=Invoke-Owned 'install' 'remove-last-kernel-without-references' 'compactGameTools'
Require ((Hash (Join-Path $hostRoot $exe)) -eq $sourceHashes[$exe]) 'Original executable not restored when kernel removed.'
$null=Invoke-Owned 'uninstall' 'uninstall-keep-shared-data'
foreach($file in $sourceHashes.Keys){Require ((Hash (Join-Path $hostRoot $file)) -eq $sourceHashes[$file]) "Original host not restored: $file"}
Require (!(Test-Path (Join-Path $hostRoot 'webvideo-plus.json'))) 'Installed product record remained after uninstall.'
Assert-Preserved
$summary=[ordered]@{passed=$true;hostVersion=$HostVersion;sourceKind=$sourceKind;sourceArchiveSha256=$archiveHash;sourceHashes=$sourceHashes;packageVersion=$product.version;internalVersion=$product.internalVersion;managerSha256=(Hash $manager);operations=$results;sharedRegistryAndSourcePreserved=$true;globalBookkeepingUnchanged=$true;scope='Owned filesystem copies only; no Terre/service/browser launch';run=$run}
Write-Json (Join-Path $run 'summary.json') $summary
$summary | ConvertTo-Json -Depth 10

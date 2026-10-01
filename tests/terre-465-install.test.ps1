param(
 [Parameter(Mandatory=$true)][string]$TerreSource,
 [string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),
 [string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/terre-install')
)
# File-level install/reinstall/uninstall checks on an owned disposable copy.
# Does not launch Terre, use the user's installed host, or delete user data.
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'This fixture requires Windows.'}
$TerreSource=[IO.Path]::GetFullPath($TerreSource)
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
$baseline=Get-Content (Join-Path $PSScriptRoot '../baseline/terre-4.6.5.json') -Raw | ConvertFrom-Json
$bundleRelative=$baseline.bundle -replace '^release/',''
function Hash-OrMissing([string]$file){if(Test-Path -LiteralPath $file -PathType Leaf){return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()};return '<absent>'}
if((Hash-OrMissing (Join-Path $TerreSource $bundleRelative)) -ne $baseline.baseHash){throw 'Source must be the untouched official Terre 4.6.5 release directory.'}
if(Test-Path (Join-Path $TerreSource 'webvideo-plus.json')){throw 'Do not use an installed/customized Terre host as this fixture source.'}
if(@(Get-ChildItem -LiteralPath $TerreSource -Recurse -Force | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count){throw 'Fixture source must not contain links.'}
$manager=Join-Path $PackageRoot 'WebVideoPlus.Manager.exe'
if(-not(Test-Path $manager)){throw 'Build the full product with -InternalBuild first.'}
$product=Get-Content (Join-Path $PackageRoot 'product.json') -Raw | ConvertFrom-Json
if($product.version -ne '1.2.0' -or $product.internalVersion -ne '0.9.0-exp.1'){throw 'Use the expected experimental internal build, not a stable-labeled package.'}
$executables=@(Get-ChildItem -LiteralPath $TerreSource -Filter '*.exe' -File | Where-Object {($_.BaseName -replace '[\s_-]+','') -eq 'WebGALTerre'})
if($executables.Count -ne 1){throw 'Cannot uniquely identify official Terre executable.'}
$exeName=$executables[0].Name
$original=@{};foreach($file in @('public/index.html',$bundleRelative,$exeName)){$original[$file]=Hash-OrMissing (Join-Path $TerreSource $file)}
$run=Join-Path $OutputRoot ([Guid]::NewGuid().ToString('N'));$hostRoot=Join-Path $run 'host'
New-Item -ItemType Directory -Path $hostRoot -Force | Out-Null
Get-ChildItem -LiteralPath $TerreSource -Force | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $hostRoot -Recurse}
$state=Join-Path $run 'state';$cache=Join-Path $run 'install-cache';$work=Join-Path $run 'work';$games=Join-Path $run 'games';$output=Join-Path $run 'output'
foreach($dir in @($state,$cache,$work,$games,$output,(Join-Path $state 'user-data'))){New-Item -ItemType Directory -Path $dir -Force | Out-Null}
$markers=@((Join-Path $state 'user-data/preserve.json'),(Join-Path $work 'preserve.txt'),(Join-Path $games 'preserve.txt'),(Join-Path $output 'preserve.txt'))
foreach($file in $markers){[IO.File]::WriteAllText($file,'owned fixture sentinel')}
$markerHashes=@{};foreach($file in $markers){$markerHashes[$file]=Hash-OrMissing $file}
$globalRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WebGALVideoExporter'
$globalHashes=@{};foreach($file in @('last-install.json','instances.json')){$globalHashes[$file]=Hash-OrMissing (Join-Path $globalRoot $file)}
function Invoke-Manager([string]$command,[string]$name,[string]$modules=''){
 $arguments=@($command,'--terre-dir',('"'+$hostRoot+'"'),'--state-dir',('"'+$state+'"'),'--install-cache-dir',('"'+$cache+'"'),'--work-dir',('"'+$work+'"'),'--games-root',('"'+$games+'"'),'--output-dir',('"'+$output+'"'),'--terre-url','http://localhost:32151','--no-recent','true','--delete-data','false','--delete-cache','false')
 if($modules){$arguments+=@('--modules',$modules)}
 $p=Start-Process -FilePath $manager -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $run "$name.log") -RedirectStandardError (Join-Path $run "$name-error.log")
 $null=$p.Handle
 if(-not $p.WaitForExit(180000)){& taskkill /PID $p.Id /T /F | Out-Null;throw "Owned fixture manager timed out: $name"}
 $p.WaitForExit();if($p.ExitCode -ne 0){throw "Manager $name failed: $($p.ExitCode). See $run"}
 foreach($file in $globalHashes.Keys){if((Hash-OrMissing (Join-Path $globalRoot $file)) -ne $globalHashes[$file]){throw "Global user bookkeeping changed: $file"}}
 foreach($file in $markers){if((Hash-OrMissing $file) -ne $markerHashes[$file]){throw "Fixture data/cache marker changed: $file"}}
}
Invoke-Manager 'install' 'install-export-tools' 'timelineNavigator,exporter,compactGameTools'
$installed=Get-Content (Join-Path $hostRoot 'webvideo-plus.json') -Raw | ConvertFrom-Json
if($installed.version -ne '1.2.0' -or $installed.internalVersion -ne '0.9.0-exp.1' -or 'exporter' -notin $installed.modules -or 'compactGameTools' -notin $installed.modules){throw 'Installed version/modules mismatch.'}
if((Hash-OrMissing (Join-Path $hostRoot 'public/index.html')) -eq $original['public/index.html']){throw 'Frontend entry was not patched.'}
if((Hash-OrMissing (Join-Path $hostRoot $exeName)) -eq $original[$exeName]){throw 'Export launcher was not installed.'}
Invoke-Manager 'install' 'reinstall-export-tools' 'timelineNavigator,exporter,compactGameTools'
Invoke-Manager 'install' 'switch-to-compact-only' 'compactGameTools'
$installed=Get-Content (Join-Path $hostRoot 'webvideo-plus.json') -Raw | ConvertFrom-Json
if($installed.modules.Count -ne 1 -or $installed.modules[0] -ne 'compactGameTools'){throw 'Module switch retained unexpected modules.'}
if((Hash-OrMissing (Join-Path $hostRoot $exeName)) -ne $original[$exeName]){throw 'Non-export module switch failed to restore original executable.'}
Invoke-Manager 'uninstall' 'uninstall-keep-data'
foreach($file in $original.Keys){if((Hash-OrMissing (Join-Path $hostRoot $file)) -ne $original[$file]){throw "Original host file was not restored: $file"};if((Hash-OrMissing (Join-Path $TerreSource $file)) -ne $original[$file]){throw "Input source was modified: $file"}}
if(Test-Path (Join-Path $hostRoot 'webvideo-plus.json')){throw 'Installed product record remains after uninstall.'}
[PSCustomObject]@{passed=$true;hostVersion='4.6.5';productVersion='1.2.0';internalVersion='0.9.0-exp.1';originalHashes=$original;globalBookkeepingUnchanged=$true;ownedDataCacheMarkersPreserved=$true;operations=@('install','reinstall','module-switch','uninstall-keep-data');scope='disposable filesystem fixture; no host UI launch'} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $run 'summary.json') -Encoding UTF8
Write-Output "Isolated Terre install checks passed: $run"

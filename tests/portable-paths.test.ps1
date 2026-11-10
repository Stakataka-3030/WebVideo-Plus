$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$sources=@('src/Core.cs','src/ManualCuts.cs','src/Integration.cs','manager/ManagerMain.cs','manager/ProductIntegration.cs','manager/TerreHostCompatibility.cs','manager/ModuleCatalog.cs','tests/recent-install-record.portable-json.cs')|ForEach-Object {Join-Path $repo $_}
Add-Type -Path $sources -IgnoreWarnings -WarningAction SilentlyContinue
$root=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-portable-paths-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
function Assert($condition,$message){if(!$condition){throw $message}}
try {
 $old=Join-Path $root 'old';$new=Join-Path $root 'new';$outside=Join-Path $root 'new-neighbor/file.txt'
 Assert ([NativeVideo.PortablePaths]::Store($new,$new) -eq '.') 'Package root is not relative'
 Assert ([NativeVideo.PortablePaths]::Store($new,(Join-Path $new 'data/test.txt')) -eq 'data\test.txt') 'Nested package path is not relative'
 Assert ([NativeVideo.PortablePaths]::Store($new,$outside) -eq $outside) 'Sibling prefix was treated as internal'
 $config=[NativeVideo.J]::Parse('{"portable":true,"terreDir":".","stateDir":"video-export-data/instance","gamesRoot":"data/games","runtimePath":"tools/bin"}')
 $loaded=[NativeVideo.PortablePaths]::LoadConfig($config,$new)
 Assert ([NativeVideo.J]::S($loaded,'terreDir') -eq $new) 'Portable config root did not resolve'
 $stored=[NativeVideo.PortablePaths]::StoreConfig($loaded,$new)
 Assert ([NativeVideo.J]::S($stored,'terreDir') -eq '.') 'Portable config did not round trip'
 $state=Join-Path $new 'video-export-data/instance';$id=[Guid]::NewGuid().ToString();$job=Join-Path $state ('jobs/'+$id);$oldJob=Join-Path $old ('video-export-data/instance/jobs/'+$id)
 [void][IO.Directory]::CreateDirectory($job)
 [IO.File]::WriteAllText((Join-Path $job 'request.json'),(@{recordDir=$oldJob;output=(Join-Path $old 'WebGAL Exports/movie.mp4');external=$outside;nested=@{path=(Join-Path $old 'data/games/project')}}|ConvertTo-Json -Depth 5))
 [IO.File]::WriteAllText((Join-Path $job 'status.json'),(@{logPath=(Join-Path $oldJob 'runner.log')}|ConvertTo-Json))
 [NativeVideo.PortablePaths]::RebaseJobs($new,$state)
 $request=Get-Content -Raw (Join-Path $job 'request.json')|ConvertFrom-Json
 Assert ($request.recordDir -eq $job -and $request.external -eq $outside -and $request.nested.path -eq (Join-Path $new 'data/games/project')) 'Job relocation failed or external path changed'
 $status=Get-Content -Raw (Join-Path $job 'status.json')|ConvertFrom-Json
 Assert ($status.logPath -eq (Join-Path $job 'runner.log')) 'Status path not relocated'
 [NativeVideo.PortablePaths]::RebaseJobs($new,$state)
 Assert ((Get-Content -Raw (Join-Path $job 'request.json')|ConvertFrom-Json).recordDir -eq $job) 'Relocation is not idempotent'
 Write-Host 'Portable path production checks passed: root, nested, external boundary, config round trip, nested job/status relocation and idempotence.'
}finally{if([IO.Path]::GetFullPath($root).StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $root -Recurse -Force}}

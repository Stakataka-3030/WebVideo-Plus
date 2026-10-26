param([string]$CacheDirectory='', [switch]$Offline)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'build-common.ps1')
$pin=(Get-Content -LiteralPath (Join-Path $root 'build/dependencies.lock.json') -Raw | ConvertFrom-Json).installerDecoder
$destination=Join-Path $root '.build/installer-decoder'
$valid=Test-Path -LiteralPath $destination
foreach($item in $pin.files.PSObject.Properties){$file=Join-Path $destination $item.Name;if(-not(Test-Path -LiteralPath $file)-or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()-ne $item.Value){$valid=$false}}
if($valid){Write-Output ('Verified staged 7-Zip '+$pin.version);return}
if([string]::IsNullOrWhiteSpace($CacheDirectory)){$CacheDirectory=Join-Path $root '.build/downloads'}
$archive=Get-PinnedBuildInput $pin $CacheDirectory -Offline:$Offline
$bootstrap=Get-Command 7z.exe -ErrorAction SilentlyContinue
if(-not $bootstrap){throw 'Build preparation requires an existing 7-Zip command to extract the pinned decoder input. The upstream installer is not executed.'}
$stage=Join-Path $root ('.build/decoder-'+[Guid]::NewGuid().ToString('N'))
$buildBoundary=[IO.Path]::GetFullPath((Join-Path $root '.build')).TrimEnd('\')+'\'
foreach($target in @($destination,$stage)){if(-not [IO.Path]::GetFullPath($target).StartsWith($buildBoundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Decoder staging escaped build directory'}}
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try{
 & $bootstrap.Source x -bd -y $archive ('-o'+$stage) 7z.exe 7z.dll License.txt | Out-Null
 if($LASTEXITCODE-ne 0){throw 'Pinned decoder extraction failed'}
 foreach($item in $pin.files.PSObject.Properties){$file=Join-Path $stage $item.Name;if(-not(Test-Path -LiteralPath $file)-or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()-ne $item.Value){throw ('Pinned decoder file mismatch: '+$item.Name)}}
 if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination -Recurse -Force}
 Move-Item -LiteralPath $stage -Destination $destination
 Write-Output ('Prepared pinned 7-Zip '+$pin.version+' CLI, DLL and license; no GUI or installer executed.')
}finally{if(Test-Path -LiteralPath $stage){Remove-Item -LiteralPath $stage -Recurse -Force}}

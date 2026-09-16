param([Parameter(Mandatory=$true)][string]$InstallerPath)
$ErrorActionPreference='Stop'
$taskInstaller=(Resolve-Path -LiteralPath $InstallerPath).Path
if((Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash.ToLowerInvariant() -ne '1ed9f61ab893f32c59c84a5b1a0865fea760789b1e5b71d79fd8083e7b00ed2d'){throw 'Expected the original 0.4.10.2 bootstrap installer; see BUILDING.md for the pinned hash.'}
$taskRoot=$PSScriptRoot
$taskOut=Join-Path $taskRoot 'package'
$taskCache=Join-Path $taskRoot '.build'
New-Item -ItemType Directory -Path $taskOut,$taskCache -Force | Out-Null
$taskAssembly=[Reflection.Assembly]::LoadFile($taskInstaller)
$taskStream=$taskAssembly.GetManifestResourceStream('payload.zip')
if($null -eq $taskStream){throw 'Installer payload missing'}
$taskArchive=Join-Path $taskCache 'bootstrap-payload.zip'
$taskFile=[IO.File]::Create($taskArchive)
try{$taskStream.CopyTo($taskFile)}finally{$taskFile.Dispose();$taskStream.Dispose()}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive)
try{foreach($taskEntry in $taskZip.Entries){if(-not $taskEntry.FullName.StartsWith('webvideo-plus/')){continue};$taskRelative=$taskEntry.FullName.Substring('webvideo-plus/'.Length);if(-not($taskRelative -match '^(runtime/|bin/|licenses/|component\.json$|WebGAL\.Video\.exe\.config$|Microsoft\.Web\.WebView2\.[^/]+\.dll$|WebView2Loader\.dll$)')){continue};if(-not $taskEntry.Name){continue};$taskTarget=[IO.Path]::GetFullPath((Join-Path $taskOut $taskRelative));if(-not $taskTarget.StartsWith([IO.Path]::GetFullPath($taskOut)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid archive path'};New-Item -ItemType Directory -Path (Split-Path $taskTarget -Parent) -Force | Out-Null;[IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry,$taskTarget,$true)}}finally{$taskZip.Dispose()}
New-Item -ItemType Directory -Path (Join-Path $taskOut 'browser'),(Join-Path $taskOut 'integration') -Force | Out-Null
Copy-Item -Path (Join-Path $taskRoot 'browser/*.js') -Destination (Join-Path $taskOut 'browser') -Force
Copy-Item -Path (Join-Path $taskRoot 'licenses/*') -Destination (Join-Path $taskOut 'licenses') -Force
Write-Output 'Pinned runtime resources prepared. Restore ai-runtime dependencies, then run build-product.ps1.'

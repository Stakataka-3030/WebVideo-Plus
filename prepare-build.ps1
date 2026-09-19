param([Parameter(Mandatory=$true)][string]$InstallerPath)
$ErrorActionPreference='Stop'
$taskInstaller=(Resolve-Path -LiteralPath $InstallerPath).Path
$taskInstallerHash=(Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$taskAcceptedHashes=@(
 'a31a3d0ba1c76a3dd033d8027b7998c98de24a668db2501038196f8da1fe9378', # published v0.4.10.2 installer
 '1ed9f61ab893f32c59c84a5b1a0865fea760789b1e5b71d79fd8083e7b00ed2d'  # legacy pre-release bootstrap
)
if($taskAcceptedHashes -notcontains $taskInstallerHash){throw 'Unsupported bootstrap installer. Use the published WebVideo+-Setup-0.4.10.2.exe or the legacy pinned bootstrap listed in BUILDING.md.'}
$taskRoot=$PSScriptRoot
$taskOut=Join-Path $taskRoot 'package'
$taskCache=Join-Path $taskRoot '.build'
foreach($taskPath in @($taskOut,$taskCache)){if(Test-Path $taskPath){Remove-Item -LiteralPath $taskPath -Recurse -Force}}
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
foreach($taskName in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')){
 $taskTarget=Join-Path $taskOut $taskName
 if(-not(Test-Path $taskTarget)){
  $taskCandidate=Get-ChildItem -LiteralPath $taskOut -Recurse -File -Filter $taskName | Select-Object -First 1
  if($null -ne $taskCandidate){Copy-Item -LiteralPath $taskCandidate.FullName -Destination $taskTarget -Force}
 }
 if(-not(Test-Path $taskTarget)){throw ('Bootstrap payload does not contain required WebView2 SDK assembly: '+$taskName)}
}
New-Item -ItemType Directory -Path (Join-Path $taskOut 'browser'),(Join-Path $taskOut 'integration') -Force | Out-Null
Copy-Item -Path (Join-Path $taskRoot 'browser/*.js') -Destination (Join-Path $taskOut 'browser') -Force
Copy-Item -Path (Join-Path $taskRoot 'licenses/*') -Destination (Join-Path $taskOut 'licenses') -Force
foreach($taskDoc in @('README.md','LICENSE','LICENSES.md','NOTICE.md','CHANGELOG.md')){Copy-Item -LiteralPath (Join-Path $taskRoot $taskDoc) -Destination (Join-Path $taskOut $taskDoc) -Force}
Write-Output ('Pinned runtime resources and project license notices prepared from a clean package directory. Bootstrap SHA-256: '+$taskInstallerHash)

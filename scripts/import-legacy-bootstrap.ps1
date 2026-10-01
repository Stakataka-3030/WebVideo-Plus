param([Parameter(Mandatory=$true)][string]$InstallerPath,[Parameter(Mandatory=$true)][string]$Destination,[Parameter(Mandatory=$true)][string]$WorkDirectory,[Parameter(Mandatory=$true)][string]$FontPath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')
$installer=(Resolve-Path -LiteralPath $InstallerPath).Path
$hash=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
# Compatibility import is deliberately isolated from the normal upstream build.
$accepted=@('a31a3d0ba1c76a3dd033d8027b7998c98de24a668db2501038196f8da1fe9378','1ed9f61ab893f32c59c84a5b1a0865fea760789b1e5b71d79fd8083e7b00ed2d')
if($accepted -notcontains $hash){throw 'Legacy import accepts only the documented pinned 0.4.10.2 bootstrap installers; use normal upstream preparation for new builds.'}
$assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($installer))
$stream=$assembly.GetManifestResourceStream('payload.zip')
if($null -eq $stream){throw 'Legacy installer payload is missing'}
$archive=Join-Path $WorkDirectory 'legacy-payload.zip'
$file=[IO.File]::Create($archive)
try{$stream.CopyTo($file)}finally{$file.Dispose();$stream.Dispose()}
$extract=Join-Path $WorkDirectory 'legacy'
Expand-CheckedBuildArchive $archive $extract
$runtime=Join-Path $extract 'webvideo-plus/runtime/web'
if(-not(Test-Path -LiteralPath $runtime -PathType Container)){throw 'Legacy runtime directory missing'}
# Reconstruct the current snapshot; never carry the old OPPO font into the payload.
& node (Join-Path $PSScriptRoot 'prepare-webgal-runtime.mjs') $runtime $Destination $FontPath --legacy
if($LASTEXITCODE -ne 0){throw 'Legacy runtime upgrade failed'}

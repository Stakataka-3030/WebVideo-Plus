param([switch]$Offline,[string]$CacheDirectory='', [string]$InstallerPath='')
$ErrorActionPreference='Stop'
& node (Join-Path $PSScriptRoot 'craft/installer/check-source-inputs.mjs')
if($LASTEXITCODE -ne 0){throw 'Craft source inputs are incomplete'}
# Default: reconstruct all inputs from pinned upstream archives; no old installer needed.
& (Join-Path $PSScriptRoot 'scripts/prepare-build-inputs.ps1') -Offline:$Offline -CacheDirectory $CacheDirectory -InstallerPath $InstallerPath

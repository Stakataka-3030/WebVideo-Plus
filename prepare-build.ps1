param([switch]$Offline,[string]$CacheDirectory='', [string]$InstallerPath='')
$ErrorActionPreference='Stop'
# Default: reconstruct all inputs from pinned upstream archives; no old installer needed.
& (Join-Path $PSScriptRoot 'scripts/prepare-build-inputs.ps1') -Offline:$Offline -CacheDirectory $CacheDirectory -InstallerPath $InstallerPath

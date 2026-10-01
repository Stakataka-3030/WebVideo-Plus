param([switch]$Offline,[string]$CacheDirectory='', [string]$InstallerPath='')
$ErrorActionPreference='Stop'
if($InstallerPath){throw 'Experimental WebGAL 4.6.5 preparation requires pinned upstream archives; legacy 4.6.4 installers are unsupported.'}
# Default: reconstruct all inputs from pinned upstream archives; no old installer needed.
& (Join-Path $PSScriptRoot 'scripts/prepare-build-inputs.ps1') -Offline:$Offline -CacheDirectory $CacheDirectory -InstallerPath $InstallerPath

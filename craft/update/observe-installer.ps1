param([int]$HostPid,[string]$Version,[string]$AppName,[int]$TimeoutSeconds=900)
$ErrorActionPreference='Stop'
$observer=Join-Path $PSScriptRoot '../../CraftInstallerObserver.exe'
if(!(Test-Path -LiteralPath $observer)){$observer=Join-Path $PSScriptRoot '../../package/CraftInstallerObserver.exe'}
if(!(Test-Path -LiteralPath $observer)){throw 'Build CraftInstallerObserver.exe from current source first'}
& $observer $HostPid $Version $AppName $TimeoutSeconds
exit $LASTEXITCODE

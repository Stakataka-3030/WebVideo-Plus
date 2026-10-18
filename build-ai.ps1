param([switch]$ReuseDependencies)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'scripts/build-ai.ps1') -ReuseDependencies:$ReuseDependencies

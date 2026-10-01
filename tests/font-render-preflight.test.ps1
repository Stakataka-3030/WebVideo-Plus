# Run in Windows PowerShell 5.1 after build.ps1 (the product targets .NET Framework).
param([string]$PackageRoot = (Join-Path $PSScriptRoot '../package'))
$ErrorActionPreference = 'Stop'
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$native = Join-Path $PackageRoot 'WebGAL.Video.exe'
if (-not (Test-Path -LiteralPath $native)) { throw 'Build the native component first.' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('webvideo-preflight-checks-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $checks = Join-Path $temp 'FontPreflightChecks.exe'
  & $compiler /nologo /target:exe /main:FontPreflightChecks /platform:x64 ('/out:' + $checks) ('/r:' + $native) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'font-render-preflight-checks.cs')
  if ($LASTEXITCODE -ne 0) { throw 'Preflight test compilation failed.' }
  # Run in an isolated CLR process so repeated tests cannot lock or reuse an old
  # in-memory product assembly. These are real built binaries, not SDK mocks.
  Copy-Item -LiteralPath $native -Destination $temp
  Get-ChildItem -LiteralPath $PackageRoot -Filter '*.dll' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $temp }
  $config = $native + '.config'
  if (Test-Path -LiteralPath $config) { Copy-Item -LiteralPath $config -Destination ($checks + '.config') }
  & $checks $PackageRoot
  if ($LASTEXITCODE -ne 0) { throw "Live2D preflight checks failed with code $LASTEXITCODE" }
} finally {
  # The isolated process has exited, so every copied binary is now unlocked.
  Remove-Item -LiteralPath $temp -Recurse -Force
}

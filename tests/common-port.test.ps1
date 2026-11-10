param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/common-port-checks'))
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
$run=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $run -Force|Out-Null
Get-ChildItem -LiteralPath (Join-Path $repo 'package') -File | Where-Object {$_.Name -eq 'WebGAL.Video.exe' -or $_.Extension -eq '.dll'} | Copy-Item -Destination $run
$exe=Join-Path $run 'CommonPortChecks.exe';Copy-Item (Join-Path $repo 'package/WebGAL.Video.exe.config') ($exe+'.config')
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe ('/out:'+$exe) ('/r:'+(Join-Path $run 'WebGAL.Video.exe')) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'CommonPortChecks.cs')
if($LASTEXITCODE-ne 0){throw 'Common port probe compilation failed'}
& $exe (Join-Path $run 'fixture')
if($LASTEXITCODE-ne 0){throw 'Common port production checks failed'}
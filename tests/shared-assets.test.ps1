param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/shared-assets-checks'),[string]$NativeAssembly=(Join-Path $PSScriptRoot '../package/WebGAL.Video.exe'))
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
$taskExe=Join-Path $taskRun 'SharedAssetsChecks.exe'
Copy-Item -LiteralPath $NativeAssembly -Destination (Join-Path $taskRun 'WebGAL.Video.exe')
Get-ChildItem -LiteralPath (Join-Path $taskRepo 'package') -Filter '*.dll' | Copy-Item -Destination $taskRun
Copy-Item -LiteralPath (Join-Path $taskRepo 'package/WebGAL.Video.exe.config') -Destination ($taskExe+'.config')
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe ('/win32manifest:'+(Join-Path $taskRepo 'native.manifest')) ('/out:'+$taskExe) ('/r:'+(Join-Path $taskRun 'WebGAL.Video.exe')) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'SharedAssetsChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Shared assets test compile failed'}
& $taskExe (Join-Path $taskRun 'fixture') (Join-Path $taskRepo 'package/runtime/web')
if($LASTEXITCODE -ne 0){throw 'Shared assets production checks failed'}

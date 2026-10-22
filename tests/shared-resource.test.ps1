param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/shared-resource-checks'))
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun | Out-Null
$taskExe=Join-Path $taskRun 'SharedResourceChecks.exe'
Copy-Item -LiteralPath (Join-Path $taskRepo 'package/WebGAL.Video.exe') -Destination $taskRun
Copy-Item -LiteralPath (Join-Path $taskRepo 'package/WebGAL.Video.exe.config') -Destination ($taskExe+'.config')
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe ('/out:'+$taskExe) ('/r:'+(Join-Path $taskRun 'WebGAL.Video.exe')) /r:System.Web.Extensions.dll /r:System.Net.Http.dll (Join-Path $PSScriptRoot 'SharedResourceChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Resource test compilation failed'}
& $taskExe (Join-Path $taskRun 'fixture')
if($LASTEXITCODE -ne 0){throw 'Resource HTTP checks failed'}

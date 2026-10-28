param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/manager-file-paths'))
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$run=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$exe=Join-Path $run 'ManagerFilePathChecks.exe'
Copy-Item -LiteralPath (Join-Path $repo 'package/WebVideoPlus.Manager.exe') -Destination $run
Copy-Item -LiteralPath (Join-Path $repo 'package/WebVideoPlus.Manager.exe.config') -Destination ($exe+'.config')
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe /platform:x64 ('/out:'+$exe) ('/r:'+(Join-Path $run 'WebVideoPlus.Manager.exe')) /r:System.Web.Extensions.dll /r:System.Net.Http.dll (Join-Path $PSScriptRoot 'ManagerFilePathChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Manager file-path check compilation failed'}
& $exe (Join-Path $run 'fixture') (Join-Path $run 'result.json')
if($LASTEXITCODE -ne 0){throw 'Manager file-path production checks failed'}
Write-Output ('Evidence: '+(Join-Path $run 'result.json'))

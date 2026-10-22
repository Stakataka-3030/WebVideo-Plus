param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/output-reservation-checks'))
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
$taskPackage=Join-Path $taskRepo 'package'
$taskExe=Join-Path $taskRun 'WebGAL.Video.exe'
Copy-Item -LiteralPath (Join-Path $taskPackage 'product.json') -Destination $taskRun
Copy-Item -LiteralPath (Join-Path $taskPackage 'WebGAL.Video.exe.config') -Destination ($taskExe+'.config')
Get-ChildItem -LiteralPath $taskPackage -Filter '*.dll' | Copy-Item -Destination $taskRun
$taskSources=@(Get-ChildItem -LiteralPath (Join-Path $taskRepo 'src') -Filter '*.cs' | Select-Object -ExpandProperty FullName)
$taskResources=@('character-map.factory.json','ai-providers.factory.json','preset-effects.factory.json','filter-presets.factory.json','anogo-actions.factory.json') | ForEach-Object { '/resource:'+(Join-Path $taskRepo $_)+','+$_ }
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $taskCompiler /nologo /target:exe /platform:x64 /optimize+ /main:OutputReservationChecks ('/win32manifest:'+(Join-Path $taskRepo 'native.manifest')) ('/out:'+$taskExe) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll ('/r:'+(Join-Path $taskRun 'Microsoft.Web.WebView2.Core.dll')) ('/r:'+(Join-Path $taskRun 'Microsoft.Web.WebView2.WinForms.dll')) $taskResources $taskSources (Join-Path $PSScriptRoot 'OutputReservationChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Output reservation fixture compile failed'}
& $taskExe (Join-Path $taskRun 'fixture')
if($LASTEXITCODE -ne 0){throw 'Output reservation production checks failed'}
Write-Output ('Evidence: '+(Join-Path $taskRun 'fixture/results.json'))

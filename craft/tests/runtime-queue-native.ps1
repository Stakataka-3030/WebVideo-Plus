param(
 [Parameter(Mandatory=$true)][string]$Kernel,
 [Parameter(Mandatory=$true)][string]$WorkRoot
)
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$kernelFile=(Resolve-Path -LiteralPath $Kernel).Path
$workspace=[IO.Path]::GetFullPath($WorkRoot)
if($workspace.TrimEnd('\') -eq [IO.Path]::GetPathRoot($workspace).TrimEnd('\')){throw 'Choose a dedicated test directory'}
$run=Join-Path $workspace ('craft-queue-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $run | Out-Null
Copy-Item -LiteralPath $kernelFile -Destination (Join-Path $run 'WebGAL.Video.exe')
Get-ChildItem -LiteralPath (Split-Path $kernelFile) -File -Filter '*.dll' | Copy-Item -Destination $run
$configuration=$kernelFile+'.config'
if(Test-Path -LiteralPath $configuration){Copy-Item -LiteralPath $configuration -Destination (Join-Path $run 'WebGAL.Video.exe.config')}
Copy-Item -LiteralPath (Get-Command node -CommandType Application).Source -Destination (Join-Path $run 'node.exe')
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $run 'process-guard.exe')) (Join-Path $repository 'bootstrap\process-guard.cs')
if($LASTEXITCODE -ne 0){throw 'Guard compilation failed'}
& $compiler /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $run 'CraftQueueRealCancellationChecks.exe')) ('/r:'+(Join-Path $run 'WebGAL.Video.exe')) (Join-Path $PSScriptRoot 'CraftQueueRealCancellationChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Queue test compilation failed'}
[IO.File]::WriteAllText((Join-Path $run 'controlled-runner.mjs'),"import fs from 'node:fs';import {spawn} from 'node:child_process';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});fs.writeFileSync(process.argv[2],JSON.stringify({runner:process.pid,descendant:child.pid}));setInterval(()=>{},1000);")
@{kernel=$kernelFile;sha256=(Get-FileHash -LiteralPath $kernelFile -Algorithm SHA256).Hash;run=$run;level='actual QueueService and controlled guarded process tree'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'identity.json') -Encoding utf8
& (Join-Path $run 'CraftQueueRealCancellationChecks.exe') $run 2>&1 | Tee-Object -FilePath (Join-Path $run 'result.log')
if($LASTEXITCODE -ne 0){throw 'Queue cancellation or cross-session retry check failed'}
Write-Output ('Evidence: '+$run)

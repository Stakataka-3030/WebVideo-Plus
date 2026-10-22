param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/shared-native-ui'))
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
$taskProbe=Join-Path $taskRun 'FrontendPatchProbe.exe'
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe ('/out:'+$taskProbe) (Join-Path $PSScriptRoot 'FrontendPatchProbe.cs')
if($LASTEXITCODE -ne 0){throw 'Frontend probe compile failed'}
foreach($taskProfile in @('4.6.4','4.6.5','4.6.6')){
 $taskInput=Join-Path $taskRepo ('baseline/terre-'+$taskProfile+'.js')
 if(-not(Test-Path -LiteralPath $taskInput)){continue}
 $taskPatched=Join-Path $taskRun ($taskProfile+'.js')
 & $taskProbe (Join-Path $taskRepo 'package/WebVideoPlus.Manager.exe') (Join-Path $taskRepo 'package') $taskInput $taskPatched
 if($LASTEXITCODE -ne 0){throw 'Native frontend integration failed'}
 & node (Join-Path $PSScriptRoot 'shared-assets-drag.test.cjs') $taskPatched
 if($LASTEXITCODE -ne 0){throw 'Native drag regression failed'}
 & node (Join-Path $PSScriptRoot 'shared-model-wiring.test.cjs') $taskPatched
 if($LASTEXITCODE -ne 0){throw 'Native model metadata wiring failed'}
}

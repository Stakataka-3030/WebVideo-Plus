param([Parameter(Mandatory=$true)][string]$SourceBundle,[string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),[string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/subtitle-integration'))
$ErrorActionPreference='Stop'
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
$taskProbe=Join-Path $taskRun 'SubtitleFrontendProbe.exe'
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe ('/out:'+$taskProbe) (Join-Path $PSScriptRoot 'SubtitleFrontendProbe.cs')
if($LASTEXITCODE-ne 0){throw 'Subtitle frontend probe compilation failed'}
$taskCases=@(@('all','on','on'),@('exporter','off','on'),@('subtitles','on','on'),@('timelineNavigator','off','off'))
foreach($taskCase in $taskCases){
 $taskPatched=Join-Path $taskRun ($taskCase[0]+'.js')
 & $taskProbe (Join-Path $PackageRoot 'WebVideoPlus.Manager.exe') $PackageRoot $SourceBundle $taskCase[0] $taskPatched
 if($LASTEXITCODE-ne 0){throw ('Actual manager patch failed: '+$taskCase[0])}
 & node --check $taskPatched
 if($LASTEXITCODE-ne 0){throw 'Generated frontend syntax invalid'}
 & node (Join-Path $PSScriptRoot 'subtitle-frontend-wiring.test.cjs') $taskPatched $taskCase[1] $taskCase[2]
 if($LASTEXITCODE-ne 0){throw 'Generated subtitle module or shared path wiring failed'}
}
Write-Output ('Patch-layer evidence (not a file installation or GUI test): '+$taskRun)

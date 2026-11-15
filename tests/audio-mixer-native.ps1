param([string]$FfmpegDirectory='', [string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/audio-mixer'))
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(!$FfmpegDirectory){$FfmpegDirectory=Split-Path (Get-Command ffmpeg.exe).Source -Parent}
foreach($taskTool in @('ffmpeg.exe','ffprobe.exe')){if(-not(Test-Path -LiteralPath (Join-Path $FfmpegDirectory $taskTool))){throw ('Missing audio regression tool: '+(Join-Path $FfmpegDirectory $taskTool))}}
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'package/WebGAL.Video.exe'),(Join-Path $taskRoot 'package/process-guard.exe') -Destination $taskRun
Get-ChildItem -LiteralPath (Join-Path $taskRoot 'package') -Filter '*.dll' | Copy-Item -Destination $taskRun
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $taskCompiler /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $taskRun 'AudioMixerProbe.exe')) ('/r:'+(Join-Path $taskRun 'WebGAL.Video.exe')) (Join-Path $PSScriptRoot 'AudioMixerProbe.cs')
if($LASTEXITCODE-ne 0){throw 'Audio mixer probe compilation failed'}
& node (Join-Path $PSScriptRoot 'audio-mixer-ffmpeg.mjs') $taskRun ([IO.Path]::GetFullPath($FfmpegDirectory))
if($LASTEXITCODE-ne 0){throw ('Audio mixer regression failed: '+$taskRun)}
Write-Output ('Audio mixer evidence: '+$taskRun)

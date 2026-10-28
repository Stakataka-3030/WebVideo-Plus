param([string]$ExampleOutput='', [string]$ScratchRoot='')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskScratchBoundary=if([string]::IsNullOrWhiteSpace($ScratchRoot)){[IO.Path]::GetFullPath([IO.Path]::GetTempPath())}else{[IO.Path]::GetFullPath($ScratchRoot)}
$taskScratch=Join-Path $taskScratchBoundary ('webvideo-srt-check-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskScratch | Out-Null
try {
 $taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 & $taskCompiler /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $taskScratch 'Checks.exe')) /r:System.Web.Extensions.dll ('/r:'+(Join-Path $taskRoot 'package/WebGAL.Video.exe')) (Join-Path $PSScriptRoot 'DialogueSubtitlesChecks.cs')
 if($LASTEXITCODE -ne 0){throw 'SRT checks compile failed'}
 Copy-Item -LiteralPath (Join-Path $taskRoot 'package/WebGAL.Video.exe') -Destination $taskScratch
 Get-ChildItem -LiteralPath (Join-Path $taskRoot 'package') -Filter '*.dll' | Copy-Item -Destination $taskScratch
 $taskArgs=@((Join-Path $taskScratch 'output'));if($ExampleOutput){$taskArgs+=@([IO.Path]::GetFullPath($ExampleOutput))}
 & (Join-Path $taskScratch 'Checks.exe') @taskArgs
 if($LASTEXITCODE -ne 0){throw 'SRT checks failed'}
} finally {
 # Only this invocation's GUID scratch directory is removed.
 $taskResolved=[IO.Path]::GetFullPath($taskScratch)
 if(([IO.Path]::GetDirectoryName($taskResolved)).Equals($taskScratchBoundary.TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $taskResolved -Recurse -Force}else{throw 'SRT check cleanup outside its selected scratch root'}
}

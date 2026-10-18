# Compile a test-only entrypoint against the actual built production kernel.
# Its SDK substitute performs only local file operations and uses a fixture key.
param([string]$PackageRoot='', [string]$EvidenceRoot='')
$ErrorActionPreference='Stop'
$taskSourceRoot=Split-Path -Parent $PSScriptRoot
if(-not $PackageRoot){$PackageRoot=Join-Path $taskSourceRoot 'package'}
$taskKernel=Join-Path ([IO.Path]::GetFullPath($PackageRoot)) 'WebGAL.Video.exe'
if(-not(Test-Path -LiteralPath $taskKernel)){throw 'Build the production kernel before running runtime persistence checks.'}
$taskPreserve=-not[string]::IsNullOrWhiteSpace($EvidenceRoot)
$taskBase=if($taskPreserve){[IO.Path]::GetFullPath($EvidenceRoot)}else{[IO.Path]::GetFullPath([IO.Path]::GetTempPath())}
$taskFixture=[IO.Path]::GetFullPath((Join-Path $taskBase ('webvideo-runtime-'+[Guid]::NewGuid().ToString('N'))))
if(-not $taskFixture.StartsWith($taskBase.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid test directory'}
New-Item -ItemType Directory -Path $taskFixture -Force|Out-Null
try{
 & node (Join-Path $PSScriptRoot 'runtime-fixture.mjs') $taskSourceRoot $taskFixture
 if($LASTEXITCODE -ne 0){throw 'Local runtime fixture preparation failed'}
 Copy-Item -LiteralPath $taskKernel -Destination (Join-Path $taskFixture 'WebGAL.Video.exe')
 $taskDefine=if(Test-Path -LiteralPath (Join-Path $taskSourceRoot 'craft/version.json')){'/define:CRAFT'}else{'/define:TERRE'}
 $taskExe=Join-Path $taskFixture 'RuntimePersistenceChecks.exe'
 $taskSource=(Get-Item -LiteralPath (Join-Path $PSScriptRoot 'RuntimePersistenceChecks.cs')).FullName
 & (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe $taskDefine /r:System.Web.Extensions.dll ('/r:'+(Join-Path $taskFixture 'WebGAL.Video.exe')) ('/out:'+$taskExe) $taskSource
 if($LASTEXITCODE -ne 0){throw 'Runtime checks failed to compile'}
 $taskResult=& $taskExe $taskFixture
 if($LASTEXITCODE -ne 0){throw 'Production runtime persistence checks failed'}
 $taskResult|Set-Content -LiteralPath (Join-Path $taskFixture 'result.json') -Encoding utf8
 Write-Output $taskResult
 if($taskPreserve){Write-Output ('Runtime evidence: '+$taskFixture)}
}finally{
 if(-not $taskPreserve -and (Test-Path -LiteralPath $taskFixture)){
  $taskResolved=(Get-Item -LiteralPath $taskFixture).FullName
  if(-not $taskResolved.StartsWith($taskBase.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Test cleanup boundary mismatch'}
  Remove-Item -LiteralPath $taskResolved -Recurse -Force
 }
}

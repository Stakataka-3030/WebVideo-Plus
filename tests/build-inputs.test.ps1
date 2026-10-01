$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts/build-common.ps1')
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-build-tests-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
try{
 $cache=Join-Path $temp 'cache';New-Item -ItemType Directory -Path $cache | Out-Null
 $inputFile=Join-Path $cache 'fixture.zip';[IO.File]::WriteAllText($inputFile,'fixture')
 $record=[pscustomobject]@{file='fixture.zip';url='https://example.invalid/fixture.zip';sha256=(Get-FileHash $inputFile -Algorithm SHA256).Hash.ToLowerInvariant()}
 if((Get-PinnedBuildInput $record $cache -Offline) -ne $inputFile){throw 'Offline cache was not reused'}
 [IO.File]::WriteAllText($inputFile,'tampered')
 $rejected=$false;try{Get-PinnedBuildInput $record $cache -Offline | Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'Corrupt offline input was accepted'}
 Remove-Item $inputFile
 $rejected=$false;try{Get-PinnedBuildInput $record $cache -Offline | Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'Missing offline input was accepted'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 foreach($entryName in @('../escape.txt','..\escape.txt','/absolute.txt','C:/escape.txt')){
  $archive=Join-Path $temp ([Guid]::NewGuid().ToString('N')+'.zip')
  $zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
  try{$entry=$zip.CreateEntry($entryName);$writer=[IO.StreamWriter]::new($entry.Open());try{$writer.Write('bad')}finally{$writer.Dispose()}}finally{$zip.Dispose()}
  $rejected=$false;try{Expand-CheckedBuildArchive $archive (Join-Path $temp 'out')}catch{$rejected=$true}
  if(-not $rejected){throw ('Unsafe ZIP path was accepted: '+$entryName)}
 }
 $archive=Join-Path $temp 'windows-paths.zip'
 $zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
 try{$entry=$zip.CreateEntry('nested\folder\fixture.txt');$writer=[IO.StreamWriter]::new($entry.Open());try{$writer.Write('safe')}finally{$writer.Dispose()}}finally{$zip.Dispose()}
 Expand-CheckedBuildArchive $archive (Join-Path $temp 'normal')
 if([IO.File]::ReadAllText((Join-Path $temp 'normal/nested/folder/fixture.txt')) -ne 'safe'){throw 'Backslash ZIP paths were not normalized'}
 Write-Output 'Build preparation checks passed: cache, offline failures and ZIP path safety.'
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

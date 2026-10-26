param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$pin=(Get-Content -LiteralPath (Join-Path $root 'build/dependencies.lock.json') -Raw | ConvertFrom-Json).installerDecoder
$decoder=Join-Path $root '.build/installer-decoder'
foreach($item in $pin.files.PSObject.Properties){$file=Join-Path $decoder $item.Name;if(-not(Test-Path -LiteralPath $file)-or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()-ne $item.Value){throw ('Run prepare-installer-decoder.ps1 first; decoder mismatch: '+$item.Name)}}
$source=Join-Path $root 'package'
$manifest=Get-Content -LiteralPath (Join-Path $source 'MANIFEST.json') -Raw | ConvertFrom-Json
$stage=Join-Path $root ('.build/pack-'+[Guid]::NewGuid().ToString('N'))
$payload=Join-Path $stage 'webvideo-plus'
$groups=Join-Path $payload 'groups'
$partial=[IO.Path]::GetFullPath($Destination)+'.part-'+[Guid]::NewGuid().ToString('N')
New-Item -ItemType Directory -Path $groups -Force | Out-Null
try{
 $records=@()
 foreach($id in @('components','ffmpeg')){
  $files=@($manifest.files | Where-Object {(@('bin/ffmpeg.exe','bin/ffprobe.exe') -contains $_.path)-eq ($id-eq 'ffmpeg')} | ForEach-Object {$_.path})
  if($files.Count-eq 0 -or ($id-eq 'ffmpeg'-and $files.Count-ne 2)){throw 'Unexpected installer group membership'}
  $list=Join-Path $stage ($id+'.txt');[IO.File]::WriteAllLines($list,[string[]]$files,[Text.UTF8Encoding]::new($false))
  $archive=Join-Path $groups ($id+'.7z')
  $dictionary=if($id-eq 'ffmpeg'){'256m'}else{'128m'}
  Push-Location $source
  try{& (Join-Path $decoder '7z.exe') a -bd -y -t7z -m0=LZMA2 -mx=7 ('-md='+$dictionary) -mmt=2 -ms=on -scsUTF-8 $archive ('@'+$list) | Out-Null;if($LASTEXITCODE-ne 0){throw ('Installer group compression failed: '+$id)}}finally{Pop-Location}
  $records+=@{id=$id;path=('groups/'+$id+'.7z');bytes=(Get-Item -LiteralPath $archive).Length;sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()}
 }
 New-Item -ItemType Directory -Path (Join-Path $payload 'installer-support') -Force | Out-Null
 foreach($item in $pin.files.PSObject.Properties){Copy-Item -LiteralPath (Join-Path $decoder $item.Name) -Destination (Join-Path $payload ('installer-support/'+$item.Name))}
 Copy-Item -LiteralPath (Join-Path $source 'MANIFEST.json') -Destination (Join-Path $payload 'MANIFEST.json')
 @{schemaVersion=1;decoderVersion=$pin.version;groups=$records} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $payload 'GROUPS.json') -Encoding utf8
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $stream=[IO.File]::Open($partial,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 try{$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
  try{foreach($file in Get-ChildItem -LiteralPath $payload -Recurse -File){$relative=$file.FullName.Substring($stage.Length+1).Replace('\','/');$level=if($file.Extension-eq '.7z'){[IO.Compression.CompressionLevel]::NoCompression}else{[IO.Compression.CompressionLevel]::Optimal};[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$relative,$level)|Out-Null}}finally{$zip.Dispose()}
 }finally{$stream.Dispose()}
 Move-Item -LiteralPath $partial -Destination ([IO.Path]::GetFullPath($Destination)) -Force
 Write-Output ('Grouped solid payload ready: '+(Get-Item -LiteralPath $Destination).Length+' bytes; decoder '+$pin.version)
}finally{
 if(Test-Path -LiteralPath $partial){Remove-Item -LiteralPath $partial -Force}
 $boundary=[IO.Path]::GetFullPath((Join-Path $root '.build')).TrimEnd('\')+'\'
 if(-not [IO.Path]::GetFullPath($stage).StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Pack cleanup escaped build directory'}
 if(Test-Path -LiteralPath $stage){Remove-Item -LiteralPath $stage -Recurse -Force}
}

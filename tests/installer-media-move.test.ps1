$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$root=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-media-move-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
try {
 $source=[IO.File]::ReadAllText((Join-Path $repo 'installer/Installer.base.cs'))
 $start=$source.IndexOf(' static void MoveMediaDirectory(')
 $end=$source.IndexOf(' public void InstallBundledFFmpeg(', $start)
 if($start -lt 0 -or $end -lt 0){throw 'Production move method missing'}
 $method=$source.Substring($start,$end-$start).Replace('static void MoveMediaDirectory','public static void MoveMediaDirectory')
 Add-Type -TypeDefinition ('using System;using System.IO;public static class MediaMoveProbe {'+$method+'}')
 $from=Join-Path $root 'stage'; $to=Join-Path $root 'installed'
 [void][IO.Directory]::CreateDirectory($from)
 [IO.File]::WriteAllText((Join-Path $from 'sentinel'),'new')
 [MediaMoveProbe]::MoveMediaDirectory($from,$to,'commit')
 if([IO.File]::ReadAllText((Join-Path $to 'sentinel')) -ne 'new'){throw 'Commit lost data'}
 [void][IO.Directory]::CreateDirectory($from)
 [IO.File]::WriteAllText((Join-Path $from 'sentinel'),'old')
 $failed=$false
 try{[MediaMoveProbe]::MoveMediaDirectory($from,$to,'collision')}catch{$failed=$true}
 if(!$failed -or [IO.File]::ReadAllText((Join-Path $to 'sentinel')) -ne 'new' -or [IO.File]::ReadAllText((Join-Path $from 'sentinel')) -ne 'old'){throw 'Collision did not preserve both directories'}
 $restored=Join-Path $root 'restored'
 [MediaMoveProbe]::MoveMediaDirectory($from,$restored,'restore')
 if([IO.File]::ReadAllText((Join-Path $restored 'sentinel')) -ne 'old'){throw 'Recovery lost data'}
 Write-Host 'Production FFmpeg directory commit, collision preservation and recovery passed.'
}finally{if([IO.Path]::GetFullPath($root).StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $root -Recurse -Force}}

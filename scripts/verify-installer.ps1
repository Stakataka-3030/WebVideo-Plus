param([Parameter(Mandatory=$true)][string]$InstallerPath)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'build-common.ps1')
$versions=Get-WebVideoVersions $root
$installer=(Resolve-Path -LiteralPath $InstallerPath).Path
$version=[Diagnostics.FileVersionInfo]::GetVersionInfo($installer).FileVersion
if($version -ne $versions.installerVersion){throw ('Installer file version mismatch: '+$version)}
$source=Get-Content -LiteralPath (Join-Path $root 'installer/InstallerBuild.cs') -Raw
$payloadHash=[regex]::Match($source,'PayloadHash="([a-f0-9]{64})"').Groups[1].Value
$manifestHash=[regex]::Match($source,'ManifestHash="([a-f0-9]{64})"').Groups[1].Value
if(-not $payloadHash -or -not $manifestHash){throw 'Generated installer hashes are missing'}
$assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($installer))
$stream=$assembly.GetManifestResourceStream('payload.zip')
if($null -eq $stream){throw 'Installer embedded payload is missing'}
$archive=Join-Path $root ('.build/verify-installer-'+[Guid]::NewGuid().ToString('N')+'.zip')
$file=[IO.File]::Create($archive)
try{$stream.CopyTo($file)}finally{$file.Dispose();$stream.Dispose()}
function Get-EntryHash($Entry){$stream=$Entry.Open();$sha=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose();$stream.Dispose()}}
try{
 if((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $payloadHash){throw 'Embedded payload hash differs from InstallerBuild'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead($archive)
 try{
  $entries=@{}
  foreach($entry in $zip.Entries){
   if(-not $entry.Name){continue}
   $name=$entry.FullName.Replace('\','/')
   if(-not $name.StartsWith('webvideo-plus/') -or $name.Contains(':') -or ($name.Split('/') -contains '..')){throw ('Unsafe installer archive entry: '+$name)}
   $relative=$name.Substring('webvideo-plus/'.Length)
   if($entries.ContainsKey($relative)){throw ('Duplicate installer archive entry: '+$relative)}
   $entries[$relative]=$entry
  }
  if(-not $entries.ContainsKey('MANIFEST.json')){throw 'Embedded MANIFEST.json missing'}
  if((Get-EntryHash $entries['MANIFEST.json']) -ne $manifestHash){throw 'Embedded manifest hash differs from InstallerBuild'}
  $reader=[IO.StreamReader]::new($entries['MANIFEST.json'].Open())
  try{$manifest=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
  if($manifest.version -ne $versions.productVersion -or $manifest.kernelVersion -ne $versions.kernelVersion){throw 'Embedded product/kernel versions mismatch'}
  $seen=@{}
  foreach($record in $manifest.files){
   if($seen.ContainsKey($record.path)){throw ('Duplicate manifest record: '+$record.path)}
   $seen[$record.path]=$true
   if(-not $entries.ContainsKey($record.path)){throw ('Missing embedded file: '+$record.path)}
   $entry=$entries[$record.path]
   if($entry.Length -ne $record.bytes -or (Get-EntryHash $entry) -ne $record.sha256){throw ('Embedded file integrity mismatch: '+$record.path)}
  }
  if($entries.Count -ne $seen.Count+1){throw 'Installer contains files absent from manifest'}
  Write-Output ('Installer payload verified without execution: '+$seen.Count+' files, embedded hashes and Win32 version '+$version+'.')
 }finally{$zip.Dispose()}
}finally{if(Test-Path -LiteralPath $archive){Remove-Item -LiteralPath $archive -Force}}

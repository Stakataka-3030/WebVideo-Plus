# Shared preparation helpers. This file is dot-sourced; it performs no work on import.
function Get-WebVideoVersions([string]$Root) {
 $versions=Get-Content -LiteralPath (Join-Path $Root 'version.json') -Raw | ConvertFrom-Json
 foreach($name in @('productVersion','installerVersion','kernelVersion')){
  if([string]::IsNullOrWhiteSpace([string]$versions.$name)){throw ('version.json is missing '+$name)}
 }
 return $versions
}
function Get-PinnedBuildInput($InputRecord,[string]$CacheDirectory,[switch]$Offline) {
 if($InputRecord.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Build input must have a pinned SHA-256'}
 if($InputRecord.url -notmatch '^https://'){throw 'Build input must use HTTPS'}
 New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
 $file=Join-Path $CacheDirectory ([string]$InputRecord.file)
 if(Test-Path -LiteralPath $file){
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -eq $InputRecord.sha256){return $file}
  if($Offline){throw ('Cached input failed SHA-256 verification: '+$file)}
 }
 if($Offline){throw ('Pinned input is not cached. Run prepare-build.ps1 online first: '+$InputRecord.file)}
 $partial=$file+'.part-'+[Guid]::NewGuid().ToString('N')
 try{
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri $InputRecord.url -OutFile $partial
  $actual=(Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if($actual -ne $InputRecord.sha256){throw ('SHA-256 mismatch for '+$InputRecord.file+'. Expected '+$InputRecord.sha256+', got '+$actual+'. No package files were replaced.')}
  Move-Item -LiteralPath $partial -Destination $file -Force
 }finally{if(Test-Path -LiteralPath $partial){Remove-Item -LiteralPath $partial -Force}}
 return $file
}
function Expand-CheckedBuildArchive([string]$Archive,[string]$Destination) {
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 New-Item -ItemType Directory -Path $Destination -Force | Out-Null
 $root=[IO.Path]::GetFullPath($Destination).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
 $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
 try{
  foreach($entry in $zip.Entries){
   $relative=$entry.FullName.Replace('\','/')
   if($relative.StartsWith('/') -or $relative.Contains(':') -or ($relative.Split('/') -contains '..')){throw ('Unsafe archive entry: '+$entry.FullName)}
   $target=[IO.Path]::GetFullPath((Join-Path $Destination $relative))
   if(-not $target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw ('Archive entry outside destination: '+$entry.FullName)}
   if(-not $entry.Name){continue}
   New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
   [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
  }
 }finally{$zip.Dispose()}
}
function Copy-RequiredBuildFile([string]$Source,[string]$Destination) {
 if(-not(Test-Path -LiteralPath $Source -PathType Leaf)){throw ('Required build input missing: '+$Source)}
 New-Item -ItemType Directory -Path (Split-Path $Destination -Parent) -Force | Out-Null
 Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

param([Parameter(Mandatory=$true)][string]$InstallerPath,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$output=[IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $output 'GroupedInstallerChecks.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /main:GroupedInstallerChecks ('/out:'+$exe) ('/win32manifest:'+(Join-Path $root 'native.manifest')) /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'GroupedInstallerChecks.cs')
if($LASTEXITCODE-ne 0){throw 'Grouped installer check compilation failed'}
& $exe ([IO.Path]::GetFullPath($InstallerPath)) (Join-Path $output ('fixture-'+[Guid]::NewGuid().ToString('N')))
if($LASTEXITCODE-ne 0){throw 'Grouped installer checks failed'}

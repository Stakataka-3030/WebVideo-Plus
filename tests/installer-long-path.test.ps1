param([Parameter(Mandatory=$true)][string]$InstallerPath,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,[Parameter(Mandatory=$true)][string]$BaseRoot)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$output=[IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$manifest=[IO.File]::ReadAllText((Join-Path $root 'native.manifest'))
if(([regex]::Matches($manifest,'>true</longPathAware>')).Count-ne 1){throw 'Expected the production longPathAware opt-in'}
# Only this test executable opts out, reproducing the Win32 limit without changing Windows policy.
$probeManifest=Join-Path $output 'no-longpath-opt-in.manifest'
[IO.File]::WriteAllText($probeManifest,$manifest.Replace('>true</longPathAware>','>false</longPathAware>'))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $output 'InstallerLongPathChecks.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll ('/win32manifest:'+$probeManifest) ('/out:'+$exe) (Join-Path $PSScriptRoot 'InstallerLongPathChecks.cs')
if($LASTEXITCODE-ne 0){throw 'Long-path check compilation failed'}
& $exe ([IO.Path]::GetFullPath($InstallerPath)) ([IO.Path]::GetFullPath($BaseRoot)) (Join-Path $output 'result.json')
if($LASTEXITCODE-ne 0){throw 'Actual installer long-path regression failed'}

param([string]$OutputRoot,[string]$FFmpegArchive='')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if([string]::IsNullOrWhiteSpace($OutputRoot)){$OutputRoot=Join-Path ([IO.Path]::GetTempPath()) ('wvp-bundled-tools-'+[Guid]::NewGuid().ToString('N'))}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $OutputRoot 'BundledRuntimeChecks.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /main:BundledRuntimeChecks ('/out:'+$exe) ('/win32manifest:'+(Join-Path $root 'native.manifest')) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $root 'installer/Installer.cs') (Join-Path $root 'installer/InstallerBuild.cs') (Join-Path $root 'src/UpdatePreferences.cs') (Join-Path $root 'manager/ModuleCatalog.cs') (Join-Path $PSScriptRoot 'BundledRuntimeChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Bundled runtime check compilation failed'}
$arguments=@((Join-Path $root 'package'),(Join-Path $OutputRoot ('fixture-'+[Guid]::NewGuid().ToString('N'))))
if(-not [string]::IsNullOrWhiteSpace($FFmpegArchive)){$lock=Get-Content -LiteralPath (Join-Path $root 'build/dependencies.lock.json') -Raw | ConvertFrom-Json;$FFmpegArchive=(Resolve-Path -LiteralPath $FFmpegArchive).Path;if((Get-FileHash -LiteralPath $FFmpegArchive).Hash.ToLowerInvariant()-ne $lock.ffmpegTest.sha256){throw 'Offline FFmpeg archive fixture pin mismatch'};$arguments+=$FFmpegArchive}
& $exe @arguments
if($LASTEXITCODE -ne 0){throw 'Bundled runtime checks failed'}

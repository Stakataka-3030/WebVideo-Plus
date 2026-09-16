$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
New-Item -ItemType Directory -Path (Join-Path $taskRoot 'dist') -Force | Out-Null
& (Join-Path $taskRoot 'build.ps1')
if($LASTEXITCODE -ne 0){throw 'Export kernel build failed'}
& (Join-Path $taskRoot 'build-ai.ps1')
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& node (Join-Path $taskRoot 'build-timeline.mjs')
if($LASTEXITCODE -ne 0){throw 'Timeline build failed'}
& node (Join-Path $taskRoot 'configure-installer.mjs')
if($LASTEXITCODE -ne 0){throw 'Installer configuration failed'}
& $taskCompiler /nologo /target:exe /platform:x64 /optimize+ /main:NativeVideo.App ('/out:'+(Join-Path $taskRoot 'package/WebVideoPlus.Manager.exe')) /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $taskRoot 'src/Core.cs') (Join-Path $taskRoot 'src/Integration.cs') (Join-Path $taskRoot 'manager/ManagerMain.cs') (Join-Path $taskRoot 'manager/ProductIntegration.cs') (Join-Path $taskRoot 'manager/ModuleCatalog.cs')
if($LASTEXITCODE -ne 0){throw 'Product manager build failed'}
& node (Join-Path $taskRoot 'build-feature-assets.mjs')
if($LASTEXITCODE -ne 0){throw 'Feature assets failed'}
& node (Join-Path $taskRoot 'manifest.mjs')
if($LASTEXITCODE -ne 0){throw 'Package manifest failed'}
$taskOut=Join-Path $taskRoot 'dist/webvideo-plus'
if(-not(Test-Path $taskOut)){New-Item -ItemType Directory -Path $taskOut | Out-Null}
Copy-Item -Path (Join-Path $taskRoot 'package/*') -Destination $taskOut -Recurse -Force
$taskArchive=Join-Path $taskRoot 'dist/webvideo-plus.zip'
Compress-Archive -LiteralPath $taskOut -DestinationPath $taskArchive -Force
$taskHash=(Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
$taskGenerated=Join-Path $taskRoot 'installer/InstallerBuild.cs'
$taskManifestHash=(Get-FileHash -LiteralPath (Join-Path $taskRoot 'package/MANIFEST.json') -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($taskGenerated,('public static class InstallerBuild { public const string PayloadHash="'+$taskHash+'"; public const string ManifestHash="'+$taskManifestHash+'"; public const string PackageVersion="0.4.10"; }'))
$taskInstaller=Join-Path $taskRoot 'dist/WebVideo+-Setup-0.4.10.2.exe'
& $taskCompiler /nologo /target:winexe /platform:x64 /optimize+ /main:InstallerMain ('/win32manifest:'+(Join-Path $taskRoot 'native.manifest')) ('/out:'+$taskInstaller) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll ('/resource:'+$taskArchive+',payload.zip') (Join-Path $taskRoot 'installer/Installer.cs') $taskGenerated (Join-Path $taskRoot 'manager/ModuleCatalog.cs')
if($LASTEXITCODE -ne 0){throw 'Installer build failed'}
Copy-Item -LiteralPath (Join-Path $taskRoot 'package/WebGAL.Video.exe.config') -Destination ($taskInstaller+'.config') -Force
$taskHash+'  webvideo-plus.zip' | Set-Content -LiteralPath ($taskArchive+'.sha256') -Encoding ascii
Get-Item -LiteralPath $taskInstaller | Select-Object Name,Length

param([switch]$Fast)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
New-Item -ItemType Directory -Path (Join-Path $taskRoot 'dist') -Force | Out-Null
& (Join-Path $taskRoot 'build.ps1')
if($LASTEXITCODE -ne 0){throw 'Export kernel build failed'}
if($Fast){& (Join-Path $taskRoot 'build-ai.ps1') -ReuseDependencies}else{& (Join-Path $taskRoot 'build-ai.ps1')}
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
$taskArchive=Join-Path $taskRoot 'dist/webvideo-plus.zip'
if($Fast){
 Write-Output 'Fast build: creating development payload without normal ZIP compression'
 $taskPackage=Join-Path $taskRoot 'package'
 if(Test-Path $taskArchive){Remove-Item -LiteralPath $taskArchive -Force}
 Add-Type -AssemblyName System.IO.Compression
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $taskStream=[IO.File]::Open($taskArchive,[IO.FileMode]::Create,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 try{
  $taskZip=[IO.Compression.ZipArchive]::new($taskStream,[IO.Compression.ZipArchiveMode]::Create,$false)
  try{
   $taskPrefix=$taskPackage+[IO.Path]::DirectorySeparatorChar
   $taskLevel=if([Enum]::GetNames([IO.Compression.CompressionLevel]) -contains 'NoCompression'){[IO.Compression.CompressionLevel]::NoCompression}else{[IO.Compression.CompressionLevel]::Fastest}
   Get-ChildItem -LiteralPath $taskPackage -Recurse -File | ForEach-Object {
    $taskRelative=$_.FullName.Substring($taskPrefix.Length).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$_.FullName,'webvideo-plus/'+$taskRelative,$taskLevel) | Out-Null
   }
  }finally{$taskZip.Dispose()}
 }finally{$taskStream.Dispose()}
}else{
 $taskOut=Join-Path $taskRoot 'dist/webvideo-plus'
 if(Test-Path $taskOut){Remove-Item -LiteralPath $taskOut -Recurse -Force}
 if(Test-Path $taskArchive){Remove-Item -LiteralPath $taskArchive -Force}
 New-Item -ItemType Directory -Path $taskOut | Out-Null
 Copy-Item -Path (Join-Path $taskRoot 'package/*') -Destination $taskOut -Recurse -Force
 Compress-Archive -LiteralPath $taskOut -DestinationPath $taskArchive -Force
}
$taskHash=(Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
$taskGenerated=Join-Path $taskRoot 'installer/InstallerBuild.cs'
$taskManifestHash=(Get-FileHash -LiteralPath (Join-Path $taskRoot 'package/MANIFEST.json') -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($taskGenerated,('public static class InstallerBuild { public const string PayloadHash="'+$taskHash+'"; public const string ManifestHash="'+$taskManifestHash+'"; public const string PackageVersion="0.4.11"; }'))
$taskInstaller=Join-Path $taskRoot 'dist/WebVideo+-Setup-0.4.11.0.exe'
$taskInstallerConfig=$taskInstaller+'.config'
if(Test-Path $taskInstallerConfig){Remove-Item -LiteralPath $taskInstallerConfig -Force}
& $taskCompiler /nologo /target:winexe /platform:x64 /optimize+ /main:InstallerMain ('/win32manifest:'+(Join-Path $taskRoot 'native.manifest')) ('/out:'+$taskInstaller) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll ('/resource:'+$taskArchive+',payload.zip') (Join-Path $taskRoot 'installer/Installer.cs') $taskGenerated (Join-Path $taskRoot 'manager/ModuleCatalog.cs')
if($LASTEXITCODE -ne 0){throw 'Installer build failed'}
$taskHash+'  webvideo-plus.zip' | Set-Content -LiteralPath ($taskArchive+'.sha256') -Encoding ascii
if($Fast){Write-Output 'Fast development build complete. Run a normal build before release.'}
Get-Item -LiteralPath $taskInstaller | Select-Object Name,Length

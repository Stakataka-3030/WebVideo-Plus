param([switch]$Fast,[switch]$InternalBuild,[string]$InternalVersion='')
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskVersions=Get-Content -LiteralPath (Join-Path $taskRoot 'version.json') -Raw | ConvertFrom-Json
$taskProductVersion=[string]$taskVersions.productVersion
$taskInstallerVersion=[string]$taskVersions.installerVersion
$taskConfiguredInternalVersion=[string]$taskVersions.productInternalVersion
if([string]::IsNullOrWhiteSpace($taskProductVersion)-or[string]::IsNullOrWhiteSpace($taskInstallerVersion)){throw 'version.json is missing productVersion or installerVersion'}
if(-not [string]::IsNullOrWhiteSpace($InternalVersion)){$InternalBuild=$true}
$taskInternalVersion=if([string]::IsNullOrWhiteSpace($InternalVersion)){$taskConfiguredInternalVersion}else{$InternalVersion.Trim()}
if($InternalBuild){
 if([string]::IsNullOrWhiteSpace($taskInternalVersion)){throw 'Internal build requires productInternalVersion in version.json or -InternalVersion.'}
 if($taskInternalVersion -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'){throw 'Internal version must be a semantic version such as 0.5.7.'}
 $taskBuildLabel=$taskInternalVersion+'-dev'
 $taskNodeArgs=@('--internal-version',$taskInternalVersion)
}else{
 $taskBuildLabel=$taskProductVersion
 $taskNodeArgs=@()
}
$taskPackageFolderLabel=if($InternalBuild){'webvideo-plus-'+$taskBuildLabel}else{'webvideo-plus'}
New-Item -ItemType Directory -Path (Join-Path $taskRoot 'dist') -Force | Out-Null
& (Join-Path $taskRoot 'build.ps1')
if($LASTEXITCODE -ne 0){throw 'Export kernel build failed'}
if($Fast){& (Join-Path $taskRoot 'build-ai.ps1') -ReuseDependencies}else{& (Join-Path $taskRoot 'build-ai.ps1')}
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& node (Join-Path $taskRoot 'build-timeline.mjs')
if($LASTEXITCODE -ne 0){throw 'Timeline build failed'}
& node (Join-Path $taskRoot 'configure-installer.mjs') @taskNodeArgs
if($LASTEXITCODE -ne 0){throw 'Installer configuration failed'}
& $taskCompiler /nologo /target:exe /platform:x64 /optimize+ /main:NativeVideo.App ('/win32icon:'+(Join-Path $taskRoot 'WebVideo+_icon.ico')) ('/out:'+(Join-Path $taskRoot 'package/WebVideoPlus.Manager.exe')) /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $taskRoot 'src/Core.cs') (Join-Path $taskRoot 'src/Integration.cs') (Join-Path $taskRoot 'manager/ManagerMain.cs') (Join-Path $taskRoot 'manager/ProductIntegration.cs') (Join-Path $taskRoot 'manager/ModuleCatalog.cs')
if($LASTEXITCODE -ne 0){throw 'Product manager build failed'}
& node (Join-Path $taskRoot 'build-feature-assets.mjs') @taskNodeArgs
if($LASTEXITCODE -ne 0){throw 'Feature assets failed'}
& node (Join-Path $taskRoot 'manifest.mjs') @taskNodeArgs
if($LASTEXITCODE -ne 0){throw 'Package manifest failed'}
$taskArchive=Join-Path $taskRoot ('dist/'+$taskPackageFolderLabel+'.zip')
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
$taskInternalLiteral=if($InternalBuild){$taskInternalVersion}else{''}
$taskInternalBool=if($InternalBuild){'true'}else{'false'}
[IO.File]::WriteAllText($taskGenerated,('public static class InstallerBuild { public const string PayloadHash="'+$taskHash+'"; public const string ManifestHash="'+$taskManifestHash+'"; public const string PackageVersion="'+$taskProductVersion+'"; public const string InternalVersion="'+$taskInternalLiteral+'"; public const bool InternalBuild='+$taskInternalBool+'; }'))
$taskInstallerLabel=$taskBuildLabel
$taskInstaller=Join-Path $taskRoot ('dist/WebVideo+-Setup-'+$taskInstallerLabel+'.exe')
$taskInstallerConfig=$taskInstaller+'.config'
if(Test-Path $taskInstallerConfig){Remove-Item -LiteralPath $taskInstallerConfig -Force}
& $taskCompiler /nologo /target:winexe /platform:x64 /optimize+ /main:InstallerMain ('/win32manifest:'+(Join-Path $taskRoot 'native.manifest')) ('/win32icon:'+(Join-Path $taskRoot 'WebVideo+_icon.ico')) ('/out:'+$taskInstaller) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll ('/resource:'+$taskArchive+',payload.zip') (Join-Path $taskRoot 'installer/Installer.cs') $taskGenerated (Join-Path $taskRoot 'manager/ModuleCatalog.cs')
if($LASTEXITCODE -ne 0){throw 'Installer build failed'}
$taskHash+'  '+(Split-Path -Leaf $taskArchive) | Set-Content -LiteralPath ($taskArchive+'.sha256') -Encoding ascii
if($InternalBuild){Write-Output ('Internal build '+$taskInternalVersion+' complete; product upgrade version remains '+$taskProductVersion+'.')}elseif($Fast){Write-Output 'Fast development build complete. Run a normal build before release.'}
Get-Item -LiteralPath $taskInstaller | Select-Object Name,Length

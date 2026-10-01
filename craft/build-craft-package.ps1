$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$versions=Get-Content (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$starter=Join-Path $root 'package/WebVideoCraft.Launcher.exe'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-craft-build-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 foreach($name in @('CraftStarter.cs','CraftSetup.cs')){
  $text=Get-Content (Join-Path $PSScriptRoot $name) -Raw -Encoding UTF8
  $text=[regex]::Replace($text,'AssemblyVersion\("[^"]+"\)','AssemblyVersion("'+$versions.fileVersion+'")')
  $text=[regex]::Replace($text,'AssemblyFileVersion\("[^"]+"\)','AssemblyFileVersion("'+$versions.fileVersion+'")')
  $text=[regex]::Replace($text,'AssemblyInformationalVersion\("[^"]+"\)','AssemblyInformationalVersion("'+$versions.installerVersion+'")')
  [IO.File]::WriteAllText((Join-Path $temp $name),$text,[Text.UTF8Encoding]::new($false))
 }
 $verifier=Join-Path $PSScriptRoot 'installer/ManifestVerifier.cs'
 & $compiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+$starter) /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll (Join-Path $temp 'CraftStarter.cs') $verifier
 if($LASTEXITCODE -ne 0){throw 'Craft launcher build failed'}
 & $compiler /nologo /target:exe /platform:x64 /optimize+ ('/out:'+(Join-Path $root 'package/CraftInstallerObserver.exe')) /r:System.Management.dll /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'update/InstallerObserver.cs')
 if($LASTEXITCODE -ne 0){throw 'Craft installer observer build failed'}
 & node (Join-Path $PSScriptRoot 'build-craft-kernel.mjs')
 if($LASTEXITCODE -ne 0){throw 'Craft kernel package failed'}
 & (Join-Path $PSScriptRoot 'verify-craft-package.ps1')
 $folder=Join-Path $root ('dist/WebVideoCraft-Setup-'+$versions.installerVersion)
 $zip=$folder+'.zip'
 Compress-Archive -LiteralPath $folder -DestinationPath $zip -CompressionLevel Optimal -Force
 $installer=$folder+'.exe'
 & $compiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+$installer) ('/resource:'+$zip+',payload.zip') /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $temp 'CraftSetup.cs') $verifier
 if($LASTEXITCODE -ne 0){throw 'Craft setup build failed'}
 Get-Item -LiteralPath $zip,$installer | Select-Object FullName,Length
 Get-FileHash -LiteralPath $zip,$installer -Algorithm SHA256 | Select-Object Path,Hash
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

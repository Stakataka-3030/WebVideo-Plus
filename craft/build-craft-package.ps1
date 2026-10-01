$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$starter=Join-Path $root 'package/WebVideoCraft.Launcher.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+$starter) /r:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'CraftStarter.cs')
if($LASTEXITCODE -ne 0){throw 'Craft launcher build failed'}
& node (Join-Path $PSScriptRoot 'build-craft-kernel.mjs')
if($LASTEXITCODE -ne 0){throw 'Craft kernel package failed'}
$folder=Join-Path $root 'dist/WebVideoCraft-Setup-1.1.2.0c'
$zip=Join-Path $root 'dist/WebVideoCraft-Setup-1.1.2.0c.zip'
Compress-Archive -LiteralPath $folder -DestinationPath $zip -CompressionLevel Optimal -Force
$installer=Join-Path $root 'dist/WebVideoCraft-Setup-1.1.2.0c.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+$installer) ('/resource:'+$zip+',payload.zip') /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'CraftSetup.cs')
if($LASTEXITCODE -ne 0){throw 'Craft setup build failed'}
Get-Item -LiteralPath $zip | Select-Object FullName,Length
Get-FileHash -LiteralPath $zip -Algorithm SHA256 | Select-Object Hash
Get-Item -LiteralPath $installer | Select-Object FullName,Length
Get-FileHash -LiteralPath $installer -Algorithm SHA256 | Select-Object Hash

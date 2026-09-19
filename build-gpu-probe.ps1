param([string]$OutputDir)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
if([string]::IsNullOrWhiteSpace($OutputDir)){$OutputDir=Join-Path $taskRoot 'package'}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$source=Join-Path $taskRoot 'gpu/GpuCaptureProbe.cpp'
$output=Join-Path $OutputDir 'gpu-capture-probe.exe'
$direct=Get-Command cl.exe -ErrorAction SilentlyContinue
if($direct){
 & $direct.Source /nologo /std:c++20 /EHsc /O2 /MT /utf-8 /DUNICODE /D_UNICODE /D_SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS $source ('/Fe:'+$output) /link d3d11.lib dxgi.lib windowsapp.lib user32.lib
 if($LASTEXITCODE -ne 0){throw 'GPU capture probe build failed'}
}else{
 $pf86=[Environment]::GetFolderPath('ProgramFilesX86')
 $vswhere=Join-Path $pf86 'Microsoft Visual Studio/Installer/vswhere.exe'
 if(-not(Test-Path $vswhere)){throw 'GPU capture PoC requires Visual Studio 2022 Build Tools with Desktop development with C++ and Windows 10/11 SDK.'}
 $install=(& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
 if([string]::IsNullOrWhiteSpace($install)){throw 'GPU capture PoC requires the MSVC x64 build tools workload.'}
 $vcvars=Join-Path $install 'VC/Auxiliary/Build/vcvars64.bat'
 if(-not(Test-Path $vcvars)){throw 'vcvars64.bat was not found in the selected Visual Studio installation.'}
 $cmd=Join-Path $env:TEMP ('webvideo-gpu-build-'+[Guid]::NewGuid().ToString('N')+'.cmd')
 try{
  @"
@echo off
call "$vcvars" >nul
cl.exe /nologo /std:c++20 /EHsc /O2 /MT /utf-8 /DUNICODE /D_UNICODE /D_SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS "$source" /Fe:"$output" /link d3d11.lib dxgi.lib windowsapp.lib user32.lib
"@ | Set-Content -LiteralPath $cmd -Encoding ascii
  & cmd.exe /d /c $cmd
  if($LASTEXITCODE -ne 0){throw 'GPU capture probe build failed. Ensure the Windows SDK C++/WinRT headers are installed.'}
 }finally{Remove-Item -LiteralPath $cmd -Force -ErrorAction SilentlyContinue}
}
if(-not(Test-Path $output)){throw 'GPU capture probe output was not created'}
Get-Item -LiteralPath $output | Select-Object Name,Length

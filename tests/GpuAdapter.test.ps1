param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/gpu-adapter-checks'))
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$taskNative=Join-Path $taskRun 'WebGAL.Video.exe'
$taskSources=Get-ChildItem -LiteralPath (Join-Path $taskRepo src) -Filter '*.cs' | ForEach-Object {$_.FullName}
$taskPackage=Join-Path $taskRepo package
& $taskCompiler /nologo /target:winexe /platform:x64 /main:NativeVideo.App ('/out:'+$taskNative) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll ('/r:'+(Join-Path $taskPackage Microsoft.Web.WebView2.Core.dll)) ('/r:'+(Join-Path $taskPackage Microsoft.Web.WebView2.WinForms.dll)) $taskSources
if($LASTEXITCODE -ne 0){throw 'GPU production source compilation failed'}
$taskManager=Join-Path $taskRun 'ManagerSettingsCompile.exe'
$taskManagerSources=@('src/Core.cs','src/ManualCuts.cs','src/Integration.cs','manager/ManagerMain.cs','manager/ProductIntegration.cs','manager/ModuleCatalog.cs')|ForEach-Object {Join-Path $taskRepo $_}
$taskCompatibility=Join-Path $taskRepo manager/TerreHostCompatibility.cs
if(Test-Path -LiteralPath $taskCompatibility){$taskManagerSources+= $taskCompatibility}
& $taskCompiler /nologo /target:exe /platform:x64 /main:NativeVideo.App ('/out:'+$taskManager) /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll $taskManagerSources
if($LASTEXITCODE -ne 0){throw 'Manager standalone compilation must not require DXGI source'}
$taskChecks=Join-Path $taskRun GpuAdapterChecks.exe
& $taskCompiler /nologo /target:exe /platform:x64 ('/out:'+$taskChecks) ('/r:'+$taskNative) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot GpuAdapterChecks.cs)
if($LASTEXITCODE -ne 0){throw 'GPU test compilation failed'}
& $taskChecks (Join-Path $taskRun results.json)
if($LASTEXITCODE -ne 0){throw 'GPU adapter checks failed'}
Write-Output ('GPU evidence: '+(Join-Path $taskRun results.json))

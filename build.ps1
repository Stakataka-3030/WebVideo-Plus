$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskOut = Join-Path $taskRoot 'package'
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$taskSources = Get-ChildItem -LiteralPath (Join-Path $taskRoot 'src') -Filter '*.cs' | ForEach-Object { $_.FullName }
& $taskCompiler /nologo /target:winexe /platform:x64 /optimize+ /main:NativeVideo.App ('/win32manifest:'+(Join-Path $taskRoot 'native.manifest')) ('/out:'+(Join-Path $taskOut 'WebGAL.Video.exe')) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll ('/resource:'+(Join-Path $taskRoot 'character-map.factory.json')+',character-map.factory.json') ('/resource:'+(Join-Path $taskRoot 'ai-providers.factory.json')+',ai-providers.factory.json') ('/resource:'+(Join-Path $taskRoot 'preset-effects.factory.json')+',preset-effects.factory.json') ('/resource:'+(Join-Path $taskRoot 'filter-presets.factory.json')+',filter-presets.factory.json') ('/resource:'+(Join-Path $taskRoot 'anogo-actions.factory.json')+',anogo-actions.factory.json') /r:Microsoft.CSharp.dll ('/r:'+(Join-Path $taskOut 'Microsoft.Web.WebView2.Core.dll')) ('/r:'+(Join-Path $taskOut 'Microsoft.Web.WebView2.WinForms.dll')) $taskSources
if ($LASTEXITCODE -ne 0) { throw 'Native component build failed' }
& $taskCompiler /nologo /target:exe /platform:x64 /optimize+ ('/out:'+(Join-Path $taskOut 'process-guard.exe')) (Join-Path $taskRoot 'bootstrap/process-guard.cs')
if($LASTEXITCODE -ne 0){throw 'Process guard build failed'}
& $taskCompiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+(Join-Path $taskOut 'TerreLauncher.exe')) /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll (Join-Path $taskRoot 'launcher/TerreLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native launcher build failed' }
Write-Output 'Built native component'

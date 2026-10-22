param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/project-resource-checks'),[string[]]$OfficialEngineRoots=@())
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force|Out-Null
$taskPackage=Join-Path $taskRepo package
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$taskNative=Join-Path $taskRun WebGAL.Video.exe
$taskSources=Get-ChildItem -LiteralPath (Join-Path $taskRepo src) -Filter '*.cs'|ForEach-Object {$_.FullName}
$taskResources=@('character-map.factory.json','ai-providers.factory.json','preset-effects.factory.json','filter-presets.factory.json','anogo-actions.factory.json')|ForEach-Object {'/resource:'+(Join-Path $taskRepo $_)+','+$_}
& $taskCompiler /nologo /target:winexe /platform:x64 /main:NativeVideo.App ('/out:'+$taskNative) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll ('/r:'+(Join-Path $taskPackage Microsoft.Web.WebView2.Core.dll)) ('/r:'+(Join-Path $taskPackage Microsoft.Web.WebView2.WinForms.dll)) $taskResources $taskSources
if($LASTEXITCODE -ne 0){throw 'Project resource production source compilation failed'}
Get-ChildItem -LiteralPath $taskPackage -Filter '*.dll'|Copy-Item -Destination $taskRun
$taskChecks=Join-Path $taskRun ProjectResourceChecks.exe
Copy-Item (Join-Path $taskPackage WebGAL.Video.exe.config) ($taskChecks+'.config')
& $taskCompiler /nologo /target:exe /platform:x64 ('/out:'+$taskChecks) ('/r:'+$taskNative) /r:System.Web.Extensions.dll /r:System.Net.Http.dll (Join-Path $PSScriptRoot ProjectResourceChecks.cs)
if($LASTEXITCODE -ne 0){throw 'Project resource test compilation failed'}
& $taskChecks (Join-Path $taskRun fixture) @OfficialEngineRoots *> (Join-Path $taskRun checks.log)
$taskExit=$LASTEXITCODE
Get-Content (Join-Path $taskRun checks.log)
if($taskExit -ne 0){throw ('Project resource checks failed; evidence: '+$taskRun)}
Write-Output ('Project resource evidence: '+$taskRun)

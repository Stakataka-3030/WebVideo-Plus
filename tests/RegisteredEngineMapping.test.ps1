param([Parameter(Mandatory=$true)][string]$Official464Root,[Parameter(Mandatory=$true)][string]$Official466Root,[string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/registered-engine-mapping'))
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskLine=if(Test-Path (Join-Path $taskRepo 'src/WebgalEngineProfile.cs')){'466'}else{'464'}
$taskBaseline=if($taskLine -eq '466'){'bcf08f8dc2ea90d3b27a13f1c7d6f5c79da51335'}else{'67fe8e60a298178f0fe2148ebe274ee73168a7f3'}
$taskFormal=(& git -C $taskRepo show ($taskBaseline+':src/EngineAdapter.cs')) -join "`n"
if($LASTEXITCODE -ne 0){throw 'Formal EngineAdapter could not be read'}
$taskCurrent=[IO.File]::ReadAllText((Join-Path $taskRepo 'src/EngineAdapter.cs')).Replace("`r`n","`n")
$taskRestored=$taskCurrent.Replace('   string projectRuntime=J.S(J.Get(request,"externalEngine"),"root",J.S(request,"project"));'+"`n",'').Replace('TryWebgalRuntime(projectRuntime,"project-runtime"','TryWebgalRuntime(J.S(request,"project"),"project-runtime"').Replace('projectRoot=projectRuntime;','projectRoot=J.S(request,"project");').Replace('TryMygoProjectRuntime(projectRuntime,','TryMygoProjectRuntime(J.S(request,"project"),')
if($taskRestored.TrimEnd() -cne $taskFormal.TrimEnd()){throw 'EngineAdapter has changes beyond the root mapping and two call-site replacements'}
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
$taskBaselineSource=Join-Path $taskRun 'BaselineEngineAdapter.cs'
[IO.File]::WriteAllText($taskBaselineSource,$taskFormal.Replace('EngineAdapter','BaselineEngineAdapter'),[Text.UTF8Encoding]::new($false))
@{line=$taskLine;formalCommit=$taskBaseline;restoredEqualsFormal=$true;currentSourceSha256=(Get-FileHash -LiteralPath (Join-Path $taskRepo 'src/EngineAdapter.cs') -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRun 'source-equality.json') -Encoding utf8
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$taskPackage=Join-Path $taskRepo package
$taskNative=Join-Path $taskRun 'WebGAL.Video.exe'
$taskSources=@(Get-ChildItem -LiteralPath (Join-Path $taskRepo src) -Filter '*.cs' | ForEach-Object {$_.FullName})+@($taskBaselineSource)
$taskResources=@('character-map.factory.json','ai-providers.factory.json','preset-effects.factory.json','filter-presets.factory.json','anogo-actions.factory.json') | ForEach-Object {'/resource:'+(Join-Path $taskRepo $_)+','+$_}
& $taskCompiler /nologo /target:winexe /platform:x64 /main:NativeVideo.App ('/out:'+$taskNative) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll ('/r:'+(Join-Path $taskPackage Microsoft.Web.WebView2.Core.dll)) ('/r:'+(Join-Path $taskPackage Microsoft.Web.WebView2.WinForms.dll)) $taskResources $taskSources *> (Join-Path $taskRun 'compile.log')
if($LASTEXITCODE -ne 0){Get-Content (Join-Path $taskRun 'compile.log');throw 'Registered mapping production compile failed'}
Get-ChildItem -LiteralPath $taskPackage -Filter '*.dll' | Copy-Item -Destination $taskRun
$taskChecks=Join-Path $taskRun 'RegisteredEngineMappingChecks.exe'
Copy-Item -LiteralPath (Join-Path $taskPackage 'WebGAL.Video.exe.config') -Destination ($taskChecks+'.config')
& $taskCompiler /nologo /target:exe /platform:x64 ('/out:'+$taskChecks) ('/r:'+$taskNative) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'RegisteredEngineMappingChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Registered mapping test compile failed'}
& $taskChecks (Join-Path $taskRun fixture) $taskRepo $Official464Root $Official466Root *> (Join-Path $taskRun 'checks.log')
$taskExit=$LASTEXITCODE
Get-Content (Join-Path $taskRun 'checks.log')
if($taskExit -ne 0){throw ('Registered mapping checks failed; evidence: '+$taskRun)}
Write-Output ('Registered mapping evidence: '+$taskRun)

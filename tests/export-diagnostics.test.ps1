param([string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),[string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/export-diagnostics'))
$ErrorActionPreference='Stop'
$taskRun=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun -Force|Out-Null
Copy-Item -LiteralPath (Join-Path $PackageRoot 'WebGAL.Video.exe') -Destination $taskRun
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$taskDefine=if(Test-Path -LiteralPath (Join-Path $PSScriptRoot '../craft/version.json')){'/define:CRAFT'}else{'/define:TERRE'}
& $taskCompiler /nologo /target:exe /platform:x64 $taskDefine /r:System.Web.Extensions.dll ('/r:'+(Join-Path $taskRun 'WebGAL.Video.exe')) ('/out:'+(Join-Path $taskRun 'ExportDiagnosticsChecks.exe')) (Join-Path $PSScriptRoot 'ExportDiagnosticsChecks.cs')
if($LASTEXITCODE -ne 0){throw 'Diagnostic regression compile failed'}
[IO.File]::WriteAllText((Join-Path $taskRun 'ExportDiagnosticsChecks.exe.config'),'<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8" /></startup><runtime><AppContextSwitchOverrides value="Switch.System.IO.UseLegacyPathHandling=false;Switch.System.IO.BlockLongPaths=false" /></runtime></configuration>')
$taskFixture=Join-Path $taskRun 'owned-fixtures'
foreach($taskLinkKind in @('root','child','cli')){
 $taskLinkBase=Join-Path $taskFixture ($taskLinkKind+' junction')
 $taskExternal=Join-Path $taskLinkBase 'external'
 New-Item -ItemType Directory -Path $taskExternal -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $taskExternal 'sentinel.txt'),('external '+$taskLinkKind+' sentinel'))
 $taskLink=if($taskLinkKind -eq 'root'){Join-Path $taskLinkBase 'cache/job'}elseif($taskLinkKind -eq 'cli'){Join-Path $taskLinkBase 'cache/job/planning'}else{Join-Path $taskLinkBase 'cache/job/parts/003'}
 New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskLink)) -Force|Out-Null
 New-Item -ItemType Junction -Path $taskLink -Target $taskExternal|Out-Null
}
& (Join-Path $taskRun 'ExportDiagnosticsChecks.exe') (Join-Path $taskRun 'owned-fixtures') | Tee-Object -FilePath (Join-Path $taskRun 'checks.log')
if($LASTEXITCODE -ne 0){throw "Diagnostic regression failed: $taskRun"}
Write-Output "Evidence: $taskRun"

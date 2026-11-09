param(
 [Parameter(Mandatory=$true)][string]$EngineRoot,
 [Parameter(Mandatory=$true)][string]$SupportPackage,
 [ValidateSet('webgal','mygo')][string]$Engine='webgal',
 [string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/autosave-planning'),
 [int]$Lines=550,[int]$Repeats=2,[switch]$ContractOnly
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$run=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Path $run -Force | Out-Null
foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')){Copy-Item -LiteralPath (Join-Path $SupportPackage $name) -Destination $run -Force}
New-Item -ItemType Directory -Path (Join-Path $run 'browser') -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $repo 'browser') -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $run 'browser') -Force}
$exe=Join-Path $run 'AutosavePlanningProbe.exe'
if(Test-Path -LiteralPath (Join-Path $SupportPackage 'WebGAL.Video.exe.config')){Copy-Item -LiteralPath (Join-Path $SupportPackage 'WebGAL.Video.exe.config') -Destination ($exe+'.config') -Force}
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src') -Filter '*.cs' | ForEach-Object FullName)
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:winexe /platform:x64 /optimize+ /main:AutosavePlanningProbe ('/out:'+$exe) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll ('/r:'+(Join-Path $run 'Microsoft.Web.WebView2.Core.dll')) ('/r:'+(Join-Path $run 'Microsoft.Web.WebView2.WinForms.dll')) $sources (Join-Path $PSScriptRoot 'AutosavePlanningProbe.cs')
if($LASTEXITCODE -ne 0){throw 'Autosave planning probe build failed'}
$output=Join-Path $run 'result.json'
$arguments=@('--engine-root',('"'+[IO.Path]::GetFullPath($EngineRoot)+'"'),'--engine',$Engine,'--output',('"'+$output+'"'),'--lines',[string]$Lines,'--repeats',[string]$Repeats,'--contract-only',([string]$ContractOnly.IsPresent).ToLowerInvariant())
$process=Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -WindowStyle Hidden
$null=$process.Handle
Write-Output "Autosave probe PID=$($process.Id), result=$output"
$watch=[Diagnostics.Stopwatch]::StartNew()
while(-not $process.WaitForExit(1000)){if($watch.Elapsed.TotalSeconds -gt 600){Stop-Process -Id $process.Id -Force;throw 'Owned autosave probe exceeded 600 seconds'}}
$process.WaitForExit();$code=$process.ExitCode;$process.Dispose()
if($code -ne 0){throw ('Autosave probe failed: '+(Get-Content -LiteralPath ($output+'.error.txt') -Raw))}
& node (Join-Path $PSScriptRoot 'autosave-runtime-contract.mjs') ($output+'.function.json')
if($LASTEXITCODE -ne 0){throw 'Native automatic-save function contract checks failed'}
if($ContractOnly){& node --check ($output+'.patched.mjs');if($LASTEXITCODE -ne 0){throw 'Patched runtime syntax check failed'}}
Get-Content -LiteralPath $output -Raw

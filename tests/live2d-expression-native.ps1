param(
 [Parameter(Mandatory=$true)][string[]]$EngineRoots,
 [Parameter(Mandatory=$true)][string]$SupportPackage,
 [string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/live2d-expression')
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$run=[IO.Path]::GetFullPath($OutputRoot)
if(Test-Path -LiteralPath $run){throw 'Use a fresh output directory'}
New-Item -ItemType Directory -Path $run -Force | Out-Null
foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')){Copy-Item -LiteralPath (Join-Path $SupportPackage $name) -Destination $run}
$exe=Join-Path $run 'Live2DExpressionProbe.exe'
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src') -Filter '*.cs' | ForEach-Object FullName)
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe /platform:x64 /optimize+ /main:Live2DExpressionProbe ('/out:'+$exe) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:Microsoft.CSharp.dll ('/r:'+(Join-Path $run 'Microsoft.Web.WebView2.Core.dll')) ('/r:'+(Join-Path $run 'Microsoft.Web.WebView2.WinForms.dll')) $sources (Join-Path $PSScriptRoot 'Live2DExpressionProbe.cs')
if($LASTEXITCODE -ne 0){throw 'Live2D expression probe build failed'}
$index=0
foreach($engine in $EngineRoots){
 $output=Join-Path $run ('engine-'+$index++)
 & $exe ([IO.Path]::GetFullPath($engine)) $output
 if($LASTEXITCODE -ne 0){throw 'Production engine/plugin preparation failed'}
 & node --check (Join-Path $output 'patched.mjs')
 if($LASTEXITCODE -ne 0){throw 'Patched plugin syntax failed'}
 & node (Join-Path $PSScriptRoot 'live2d-expression-contract.mjs') $output
 if($LASTEXITCODE -ne 0){throw 'Live2D expression lifecycle contract failed'}
}

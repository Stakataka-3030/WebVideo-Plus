param(
 [string]$PackageRoot=(Join-Path $PSScriptRoot '../package'),
 [string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/navigation-diagnostic'),
 [switch]$RecorderChecks
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$support=Join-Path $OutputRoot 'package'
New-Item -ItemType Directory -Path $support -Force | Out-Null
foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')){Copy-Item -LiteralPath (Join-Path $PackageRoot $name) -Destination $support -Force}
if(Test-Path -LiteralPath (Join-Path $PackageRoot 'browser')){Copy-Item -LiteralPath (Join-Path $PackageRoot 'browser') -Destination $support -Recurse -Force}
$releaseExe=Join-Path $PackageRoot 'WebGAL.Video.exe'
$releaseHash=(Get-FileHash -LiteralPath $releaseExe -Algorithm SHA256).Hash
$original=Join-Path $repo 'src/BrowserHost.cs'
$before=(Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash
$source=[IO.File]::ReadAllText($original)
$anchor='await View.EnsureCoreWebView2Async(environment);'
if(([regex]::Matches($source,[regex]::Escape($anchor))).Count -ne 1){throw 'Diagnostic hook must match exactly one WebView2 initialization; review before updating.'}
$generated=Join-Path $OutputRoot 'BrowserHost.cs'
[IO.File]::WriteAllText($generated,$source.Replace($anchor,$anchor+'await SyntheticNavigationTrace.Attach(View);'),(New-Object Text.UTF8Encoding($false)))
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src') -Filter '*.cs' | Where-Object Name -ne 'BrowserHost.cs' | ForEach-Object FullName)
$sources+=@($generated,(Join-Path $PSScriptRoot 'SyntheticNavigationTrace.cs'))
$exe=Join-Path $support $(if($RecorderChecks){'SyntheticNavigationChecks.exe'}else{'WebGAL.Video.exe'})
$main=if($RecorderChecks){'SyntheticNavigationChecks'}else{'NativeVideo.App'}
if($RecorderChecks){$sources+=Join-Path $PSScriptRoot 'SyntheticNavigationChecks.cs'}
$target=if($RecorderChecks){'/target:exe'}else{'/target:winexe'}
$args=@('/nologo',$target,'/platform:x64','/optimize+',('/main:'+$main),('/out:'+$exe),('/win32manifest:'+(Join-Path $repo 'native.manifest')),
 '/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.Net.Http.dll','/r:System.Security.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll',
 ('/r:'+(Join-Path $support 'Microsoft.Web.WebView2.Core.dll')),('/r:'+(Join-Path $support 'Microsoft.Web.WebView2.WinForms.dll')))
if(Test-Path -LiteralPath (Join-Path $repo 'WebVideo+_icon.ico')){$args+=('/win32icon:'+(Join-Path $repo 'WebVideo+_icon.ico'))}
foreach($name in @('character-map','ai-providers','preset-effects','filter-presets','anogo-actions')){$args+=('/resource:'+(Join-Path $repo ($name+'.factory.json'))+','+$name+'.factory.json')}
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') @args $sources | Out-Host
if($LASTEXITCODE -ne 0){throw 'Synthetic navigation diagnostic build failed'}
Copy-Item -LiteralPath (Join-Path $PackageRoot 'WebGAL.Video.exe.config') -Destination ($exe+'.config') -Force
if((Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash -ne $before){throw 'Production BrowserHost.cs changed during diagnostic generation'}
if((Get-FileHash -LiteralPath $releaseExe -Algorithm SHA256).Hash -ne $releaseHash){throw 'Original release executable changed during diagnostic compilation'}
$normalize={param([string]$value) $value.Replace($OutputRoot,'{DIAGNOSTIC}').Replace($PackageRoot,'{SUPPORT_PACKAGE}').Replace($repo,'{REPO}')}
$manifest=[ordered]@{
 notRelease=$true; purpose='Synthetic planning navigation observation only; never substitutes for the original native graphics gate'
 sourceCommit=(& git -C $repo rev-parse HEAD); originalBrowserHostSha256=$before.ToLowerInvariant()
 generatedBrowserHostSha256=(Get-FileHash -LiteralPath $generated -Algorithm SHA256).Hash.ToLowerInvariant()
 hook=$anchor; hookMatches=1; insertedHook='await SyntheticNavigationTrace.Attach(View);'
 originalExporterSha256=$releaseHash.ToLowerInvariant(); diagnosticExporterSha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
 compiler='{WINDIR}/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 compilerArguments=@($args | ForEach-Object {& $normalize $_})
 sources=@($sources | ForEach-Object {[ordered]@{path=(& $normalize $_);sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputRoot $(if($RecorderChecks){'recorder-build-manifest.json'}else{'build-manifest.json'})) -Encoding utf8
if($RecorderChecks){
 & $exe $OutputRoot | Out-Host
 if($LASTEXITCODE -ne 0){throw 'Synthetic navigation recorder checks failed'}
}
$exe

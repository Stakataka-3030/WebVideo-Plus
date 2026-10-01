param([switch]$Offline,[string]$CacheDirectory='', [string]$InstallerPath='')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'build-common.ps1')
$versions=Get-WebVideoVersions $root
$lock=Get-Content -LiteralPath (Join-Path $root 'build/dependencies.lock.json') -Raw | ConvertFrom-Json
if($lock.schemaVersion -ne 1){throw 'Unsupported build dependency lock schema'}
$work=Join-Path $root '.build'
if([string]::IsNullOrWhiteSpace($CacheDirectory)){$CacheDirectory=Join-Path $work 'downloads'}
$CacheDirectory=[IO.Path]::GetFullPath($CacheDirectory)
# Resolve and validate inputs before touching the previously prepared package.
$archives=@{}
foreach($name in @('webview2Sdk','webview2Bootstrap','node','sourceHanSans')){$archives[$name]=Get-PinnedBuildInput $lock.$name $CacheDirectory -Offline:$Offline}
if([string]::IsNullOrWhiteSpace($InstallerPath)){$archives.webgal=Get-PinnedBuildInput $lock.webgal $CacheDirectory -Offline:$Offline}
else{$InstallerPath=(Resolve-Path -LiteralPath $InstallerPath).Path}
$stage=Join-Path $work ('prepare-'+[Guid]::NewGuid().ToString('N'))
$out=Join-Path $stage 'package'
$package=Join-Path $root 'package'
$previous=Join-Path $work ('previous-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $out -Force | Out-Null
try{
 if([string]::IsNullOrWhiteSpace($InstallerPath)){
  $webgal=Join-Path $stage 'webgal'
  Expand-CheckedBuildArchive $archives.webgal $webgal
  & node (Join-Path $PSScriptRoot 'prepare-webgal-runtime.mjs') $webgal (Join-Path $out 'runtime/web') $archives.sourceHanSans
  if($LASTEXITCODE -ne 0){throw 'WebGAL runtime reconstruction failed'}
 }else{
  # Explicit migration aid only. Never silently fall back to historical installers.
  & (Join-Path $PSScriptRoot 'import-legacy-bootstrap.ps1') -InstallerPath $InstallerPath -Destination (Join-Path $out 'runtime/web') -WorkDirectory $stage -FontPath $archives.sourceHanSans
 }
 $sdk=Join-Path $stage 'webview2-sdk'
 Expand-CheckedBuildArchive $archives.webview2Sdk $sdk
 foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')){
  Copy-RequiredBuildFile (Join-Path $sdk ('lib/net462/'+$name)) (Join-Path $out $name)
 }
 Copy-RequiredBuildFile (Join-Path $sdk 'runtimes/win-x64/native/WebView2Loader.dll') (Join-Path $out 'WebView2Loader.dll')
 Copy-RequiredBuildFile (Join-Path $sdk 'LICENSE.txt') (Join-Path $out 'licenses/WebView2-SDK-LICENSE.txt')
 Copy-RequiredBuildFile $archives.webview2Bootstrap (Join-Path $out 'bin/MicrosoftEdgeWebview2Setup.exe')
 # Authenticode complements the pinned digest on Windows; no installer is executed here.
 if($env:OS -eq 'Windows_NT'){
  $signature=Get-AuthenticodeSignature -LiteralPath $archives.webview2Bootstrap
  if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)'){throw 'Pinned WebView2 bootstrap must have a valid Microsoft Authenticode signature'}
 }
 $nodeRoot=Join-Path $stage 'node'
 Expand-CheckedBuildArchive $archives.node $nodeRoot
 $nodePackage=Join-Path $nodeRoot ('node-v'+$lock.node.version+'-win-x64')
 Copy-RequiredBuildFile (Join-Path $nodePackage 'node.exe') (Join-Path $out 'ai-runtime/node.exe')
 Copy-RequiredBuildFile (Join-Path $nodePackage 'LICENSE') (Join-Path $out 'ai-runtime/LICENSE-Node.txt')
 Copy-RequiredBuildFile (Join-Path $root 'build/templates/WebGAL.Video.exe.config') (Join-Path $out 'WebGAL.Video.exe.config')
 $component=Get-Content -LiteralPath (Join-Path $root 'build/templates/component.json') -Raw | ConvertFrom-Json
 $component | Add-Member -NotePropertyName version -NotePropertyValue $versions.kernelVersion -Force
 [IO.File]::WriteAllText((Join-Path $out 'component.json'),($component | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
 foreach($directory in @('browser','licenses','docs','build')){New-Item -ItemType Directory -Path (Join-Path $out $directory) -Force | Out-Null;Copy-Item -Path (Join-Path $root ($directory+'/*')) -Destination (Join-Path $out $directory) -Recurse -Force}
 New-Item -ItemType Directory -Path (Join-Path $out 'integration') -Force | Out-Null
 foreach($doc in @('README.md','LICENSE','LICENSES.md','NOTICE.md','CHANGELOG.md')){Copy-RequiredBuildFile (Join-Path $root $doc) (Join-Path $out $doc)}
 Copy-RequiredBuildFile (Join-Path $root 'build/dependencies.lock.json') (Join-Path $out 'BUILD-INPUTS.json')
 [IO.File]::WriteAllText((Join-Path $out 'bin/WEBVIEW2-BOOTSTRAPPER.json'),($lock.webview2Bootstrap | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
 & node (Join-Path $PSScriptRoot 'verify-build-inputs.mjs') $out
 if($LASTEXITCODE -ne 0){throw 'Prepared package input validation failed'}
 # Swap only a completely validated staging tree; retain the old package on failure.
 if(Test-Path -LiteralPath $package){Move-Item -LiteralPath $package -Destination $previous}
 try{Move-Item -LiteralPath $out -Destination $package}
 catch{if(Test-Path -LiteralPath $previous){Move-Item -LiteralPath $previous -Destination $package};throw}
 if(Test-Path -LiteralPath $previous){Remove-Item -LiteralPath $previous -Recurse -Force}
 Write-Output 'Prepared verified upstream runtime, SDK, Node, metadata and notices. Download cache preserved.'
}finally{if(Test-Path -LiteralPath $stage){Remove-Item -LiteralPath $stage -Recurse -Force}}

param([Parameter(Mandatory=$true)][string]$PackageRoot,[Parameter(Mandatory=$true)][string]$OutputRecord)
$ErrorActionPreference='Stop'
# This guard precedes filesystem mutation, download, assembly loading and process
# execution. A personal/self-hosted computer is never an accepted test target.
if($env:OS-ne'Windows_NT' -or $env:GITHUB_ACTIONS-ne'true' -or $env:RUNNER_ENVIRONMENT-ne'github-hosted' -or $env:RUNNER_OS-ne'Windows' -or $env:WEBVIDEO_CRAFT_HOST_SMOKE-ne'1' -or $env:GITHUB_RUN_ID-notmatch'^\d+$') { throw 'Only an explicitly enabled disposable GitHub-hosted Windows CI runner may prepare the real host smoke.' }
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath($env:GITHUB_WORKSPACE)-ne$repo){throw 'Unexpected CI checkout'}
$version=(Get-Content -LiteralPath (Join-Path $repo 'craft/version.json') -Raw|ConvertFrom-Json).installerVersion
if([IO.Path]::GetFullPath($PackageRoot)-ne(Join-Path $repo ('dist/WebVideoCraft-Setup-'+$version))){throw 'Only the complete current build package is accepted'}
$evidenceBoundary=(Join-Path $repo '.build/ci-native-tests').TrimEnd('\')+'\'
if(-not [IO.Path]::GetFullPath($OutputRecord).StartsWith($evidenceBoundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Evidence path escaped CI test directory'}
. (Join-Path $repo 'scripts/build-common.ps1')
$lock=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ci-host-inputs.lock.json') -Raw|ConvertFrom-Json
if($lock.schemaVersion-ne1 -or $lock.host.extractedSha256-ne'0de472c44f642c8f140e16bcc040a171519af59d245ae88b1b4a47987cf2756c'){throw 'Unsupported official host fixture'}
Add-Type -AssemblyName System.Windows.Forms
if(-not [Environment]::UserInteractive -or [System.Windows.Forms.Screen]::AllScreens.Count-lt1){throw 'Real host smoke is BLOCKED: CI runner has no usable graphical desktop. No GUI assertion passed.'}
$env:PATH=$PackageRoot+';'+$env:PATH
Add-Type -Path (Join-Path $PackageRoot 'Microsoft.Web.WebView2.Core.dll')
$webview=[Microsoft.Web.WebView2.Core.CoreWebView2Environment]::GetAvailableBrowserVersionString($null)
if([string]::IsNullOrWhiteSpace($webview)){throw 'Real host smoke is BLOCKED: WebView2 Runtime unavailable'}
$root=Join-Path $env:RUNNER_TEMP ('webvideo-craft-host-inputs-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null
Set-Content -LiteralPath (Join-Path $root '.owned-ci-host-inputs') -Value $env:GITHUB_RUN_ID
$downloads=Join-Path $root 'downloads'
$hostArchive=Get-PinnedBuildInput $lock.host $downloads
$decoderArchive=Get-PinnedBuildInput $lock.extractor $downloads
if((Get-Item -LiteralPath $hostArchive).Length-ne$lock.host.bytes -or (Get-Item -LiteralPath $decoderArchive).Length-ne$lock.extractor.bytes){throw 'Pinned archive length mismatch'}
# Bootstrap only static extraction with the existing hosted-runner 7-Zip. The
# decoder subsequently used on the host archive is pinned by both EXE and DLL.
$bootstrap=Get-Command 7z.exe -ErrorAction Stop
$decoder=Join-Path $root 'decoder'
New-Item -ItemType Directory -Path $decoder|Out-Null
& $bootstrap.Source x -bd -y $decoderArchive ('-o'+$decoder) 7z.exe 7z.dll License.txt|Out-Null
if($LASTEXITCODE-ne0){throw 'Static decoder extraction failed; no upstream installer was executed'}
foreach($file in $lock.extractor.files.PSObject.Properties){
 $target=Join-Path $decoder $file.Name
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()-ne$file.Value){throw ('Pinned decoder mismatch: '+$file.Name)}
}
$hostDirectory=Join-Path $root 'host'
New-Item -ItemType Directory -Path $hostDirectory|Out-Null
& (Join-Path $decoder '7z.exe') e -bd -y $hostArchive ('-o'+$hostDirectory) $lock.host.extractedFile|Out-Null
if($LASTEXITCODE-ne0){throw 'Static official host extraction failed; NSIS was not executed'}
$hostExe=Join-Path $hostDirectory $lock.host.extractedFile
if((Get-Item -LiteralPath $hostExe).Length-ne$lock.host.extractedBytes -or (Get-FileHash -LiteralPath $hostExe -Algorithm SHA256).Hash.ToLowerInvariant()-ne$lock.host.extractedSha256){throw 'Extracted official host identity mismatch'}
if(@(Get-ChildItem -LiteralPath $hostDirectory -Force).Count-ne1){throw 'Unexpected extracted host files'}
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputRecord) -Force|Out-Null
[ordered]@{schemaVersion=1;hostSource=$hostExe;hostVersion=$lock.host.version;hostSha256=$lock.host.extractedSha256;archiveSha256=$lock.host.sha256;decoderVersion=$lock.extractor.version;decoderSha256=$lock.extractor.sha256;webView2Version=$webview;officialInstallerExecuted=$false;hostExecuted=$false}|ConvertTo-Json|Set-Content -LiteralPath $OutputRecord -Encoding UTF8
Write-Output 'Pinned official host prepared by static extraction; no host or upstream installer executed.'

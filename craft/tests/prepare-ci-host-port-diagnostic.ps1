param([Parameter(Mandatory=$true)][string]$OutputRecord)
$ErrorActionPreference='Stop'
if($env:OS-ne'Windows_NT' -or $env:GITHUB_ACTIONS-ne'true' -or $env:RUNNER_ENVIRONMENT-ne'github-hosted' -or $env:RUNNER_OS-ne'Windows' -or $env:WEBVIDEO_CRAFT_HOST_SMOKE-ne'1' -or $env:GITHUB_RUN_ID-notmatch'^\d+$'){throw 'Only explicitly enabled disposable Windows CI may prepare this diagnostic'}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if([IO.Path]::GetFullPath($env:GITHUB_WORKSPACE)-ne$repo){throw 'Unexpected CI checkout'}
$boundary=(Join-Path $repo '.build/ci-native-tests').TrimEnd('\')+'\'
if(-not [IO.Path]::GetFullPath($OutputRecord).StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Evidence path escaped CI test directory'}
. (Join-Path $repo 'scripts/build-common.ps1')
$lock=Get-Content (Join-Path $PSScriptRoot 'ci-host-inputs.lock.json') -Raw|ConvertFrom-Json
if($lock.schemaVersion-ne1 -or $lock.host.extractedSha256-ne'0de472c44f642c8f140e16bcc040a171519af59d245ae88b1b4a47987cf2756c'){throw 'Unsupported fixed host'}
Add-Type -AssemblyName System.Windows.Forms
if(-not [Environment]::UserInteractive -or [System.Windows.Forms.Screen]::AllScreens.Count-lt1){throw 'Diagnostic blocked: no CI graphical desktop'}
$root=Join-Path $env:RUNNER_TEMP ('webvideo-craft-port-inputs-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null
$archive=Get-PinnedBuildInput $lock.host (Join-Path $root 'downloads')
$decoderArchive=Get-PinnedBuildInput $lock.extractor (Join-Path $root 'downloads')
if((Get-Item $archive).Length-ne$lock.host.bytes -or (Get-Item $decoderArchive).Length-ne$lock.extractor.bytes){throw 'Pinned input length mismatch'}
$decoder=Join-Path $root 'decoder';New-Item -ItemType Directory -Path $decoder|Out-Null
& (Get-Command 7z.exe -ErrorAction Stop).Source x -bd -y $decoderArchive ('-o'+$decoder) 7z.exe 7z.dll License.txt|Out-Null
if($LASTEXITCODE-ne0){throw 'Static decoder extraction failed'}
foreach($file in $lock.extractor.files.PSObject.Properties){if((Get-FileHash (Join-Path $decoder $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant()-ne$file.Value){throw 'Decoder hash mismatch'}}
$hostDirectory=Join-Path $root 'host';New-Item -ItemType Directory -Path $hostDirectory|Out-Null
& (Join-Path $decoder '7z.exe') e -bd -y $archive ('-o'+$hostDirectory) $lock.host.extractedFile|Out-Null
if($LASTEXITCODE-ne0){throw 'Static host extraction failed'}
$hostExe=Join-Path $hostDirectory $lock.host.extractedFile
if((Get-Item $hostExe).Length-ne$lock.host.extractedBytes -or (Get-FileHash $hostExe -Algorithm SHA256).Hash.ToLowerInvariant()-ne$lock.host.extractedSha256){throw 'Official host identity mismatch'}
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$verifier=Join-Path $root 'ListenerVerifier.exe';$token=Join-Path $root 'ReadOnlyToken.exe';$restricted=Join-Path $root 'RestrictedCiRunner.exe'
& $csc /nologo /platform:x64 /target:winexe ('/out:'+$verifier) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll (Join-Path $repo 'craft/CraftStarter.cs') (Join-Path $repo 'craft/installer/ManifestVerifier.cs')
if($LASTEXITCODE-ne0){throw 'Current production listener verifier compilation failed'}
& $csc /nologo /platform:x64 /target:exe ('/out:'+$token) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'CiHostToken.cs')
if($LASTEXITCODE-ne0){throw 'Read-only token helper compilation failed'}
& $csc /nologo /platform:x64 /target:exe ('/out:'+$restricted) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'CiRestrictedRunner.cs') (Join-Path $PSScriptRoot 'CiHostAccess.cs')
if($LASTEXITCODE-ne0){throw 'Restricted CI child helper compilation failed'}
$policies=@()
foreach($hive in @('HKLM','HKCU')){
 $rootKey=if($hive-eq'HKLM'){[Microsoft.Win32.Registry]::LocalMachine}else{[Microsoft.Win32.Registry]::CurrentUser}
 $base='SOFTWARE\Policies\Microsoft\Edge'
 foreach($name in @('RemoteDebuggingAllowed','DeveloperToolsAvailability')){
  $key=$rootKey.OpenSubKey($base,$false);$value=$null
  if($key){try{$value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}finally{$key.Dispose()}}
  $policies+=@{hive=$hive;key='Edge';name=$name;present=($null-ne$value);value=$(if($value-is[int] -and $value-ge0 -and $value-le2){$value}else{$null})}
 }
 foreach($name in @('*','webgal-craft.exe','webgal-craft.webvideo-original.exe')){
  $key=$rootKey.OpenSubKey($base+'\WebView2\AdditionalBrowserArguments',$false);$value=$null
  if($key){try{$value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}finally{$key.Dispose()}}
  $policies+=@{hive=$hive;key='Edge/WebView2/AdditionalBrowserArguments';name=$name;present=($null-ne$value);hasDebugPort=([string]$value-match'--remote-debugging-port(?:=|\s)')}
 }
}
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputRecord) -Force|Out-Null
@{schemaVersion=1;diagnosticOnly=$true;hostSource=$hostExe;hostSha256=$lock.host.extractedSha256;verifier=$verifier;tokenHelper=$token;restrictedRunner=$restricted;policies=$policies;officialInstallerExecuted=$false;hostExecuted=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $OutputRecord -Encoding UTF8

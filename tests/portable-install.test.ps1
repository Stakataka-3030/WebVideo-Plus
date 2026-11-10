param(
 [string]$PackageRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'package'),
 [string]$OutputRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.build/portable-install'),
 [string]$RelocationRoot,
 [switch]$ExportSmoke
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows is required for the Terre launcher fixture.' }

$repo = Split-Path -Parent $PSScriptRoot
$manager = Join-Path ([IO.Path]::GetFullPath($PackageRoot)) 'WebVideoPlus.Manager.exe'
if (!(Test-Path -LiteralPath $manager -PathType Leaf)) { throw 'Build the WebVideo+ package first.' }

$run = Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($run)
Write-Host "Fixture: $run"

function Assert-True([bool]$Condition, [string]$Message) {
 if (!$Condition) { throw "$Message (fixture: $run)" }
}

function Put([string]$File, [string]$Value) {
 [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($File))
 [IO.File]::WriteAllText($File, $Value, [Text.UTF8Encoding]::new($false))
}

function Read-Json([string]$File) {
 [IO.File]::ReadAllText($File) | ConvertFrom-Json
}

function Hash([string]$File) {
 if (Test-Path -LiteralPath $File -PathType Leaf) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash }
 else { '<absent>' }
}

function Wait-Until([scriptblock]$Condition, [int]$Seconds, [string]$Message) {
 $watch = [Diagnostics.Stopwatch]::StartNew()
 while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
  if (& $Condition) { return }
  Start-Sleep -Milliseconds 100
 }
 throw "$Message (fixture: $run)"
}

$backend = Join-Path $run 'inert-terre.exe'
$source = Join-Path $run 'inert-terre.cs'
Put $source @'
using System;
using System.IO;
using System.Threading;
class InertTerre {
 static void Main() {
  File.WriteAllText(Path.Combine(Environment.CurrentDirectory,"backend-started.txt"), Environment.CurrentDirectory);
  Thread.Sleep(90000);
 }
}
'@
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /platform:x64 ('/out:' + $backend) $source
Assert-True ($LASTEXITCODE -eq 0) 'Could not compile the inert Terre process.'

$baseline = Read-Json (Join-Path $repo 'baseline/terre-4.6.6.json')
$bundle = Join-Path $repo 'baseline/terre-4.6.6.js'
$bundleText = [IO.File]::ReadAllText($bundle).Replace("`r`n", "`n")
$index = '<script type="module" src="/assets/' + ([IO.Path]::GetFileName($baseline.bundle)) + '"></script>'
function New-TerreFixture([string]$Path) {
 Put (Join-Path $Path 'public/index.html') $index
 $fixtureBundle = Join-Path $Path ('public/assets/' + ([IO.Path]::GetFileName($baseline.bundle)))
 Put $fixtureBundle $bundleText
 Assert-True ((Hash $fixtureBundle) -eq $baseline.baseHash) 'Terre fixture bundle hash mismatch.'
 Copy-Item -LiteralPath $backend -Destination (Join-Path $Path 'WebGAL_Terre.exe')
 [void][IO.Directory]::CreateDirectory((Join-Path $Path 'data/games'))
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$resourceListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
try {
 $listener.Start()
 $resourceListener.Start()
 $terreUrl = 'http://127.0.0.1:' + $listener.LocalEndpoint.Port
 $resourcePort = $resourceListener.LocalEndpoint.Port
} finally { $resourceListener.Stop(); $listener.Stop() }

$globalRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WebGALVideoExporter'
$globalHashes = @{}
foreach ($file in @('last-install.json', 'instances.json', 'update-preferences.json')) {
 $globalHashes[$file] = Hash (Join-Path $globalRoot $file)
}

function Invoke-Manager([string]$Terre, [string]$Label, [string]$Action, [string[]]$Options, [switch]$ExpectFailure) {
 $arguments = @($Action, '--terre-dir', $Terre, '--terre-url', $terreUrl, '--no-recent', 'true')
 if ($Action -eq 'install') { $arguments += @('--modules', 'sharedAssets,exporter') }
 $arguments += $Options
 $log = Join-Path $run ($Label + '.log')
 $errorLog = Join-Path $run ($Label + '.error.log')
 $quoted = $arguments | ForEach-Object { '"' + $_ + '"' }
 $process = Start-Process -FilePath $manager -ArgumentList $quoted -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errorLog
 try {
  $null = $process.Handle
  if (!$process.WaitForExit(120000)) { $process.Kill(); throw "Manager timed out. See $log" }
  $process.WaitForExit()
  Assert-True (($process.ExitCode -ne 0) -eq $ExpectFailure.IsPresent) "Unexpected manager result $($process.ExitCode). See $log and $errorLog"
  foreach ($file in $globalHashes.Keys) {
   Assert-True ((Hash (Join-Path $globalRoot $file)) -eq $globalHashes[$file]) "AppData was changed: $file"
  }
 } finally { $process.Dispose() }
}

function Assert-Portable([string]$Terre) {
 $configRelative = 'video-export-data\instance\config.json'
 foreach ($file in @('webvideo-plus.json', 'video-export-wrapper.json')) {
  $record = Read-Json (Join-Path $Terre $file)
  Assert-True ($record.portable -eq $true -and $record.config.Replace('/', '\') -eq $configRelative) "Incorrect portable record: $file"
 }
 $config = Read-Json (Join-Path $Terre $configRelative)
 $expected = @{
  terreDir = $Terre
  stateDir = Join-Path $Terre 'video-export-data/instance'
  gamesRoot = Join-Path $Terre 'data/games'
  outputDir = Join-Path $Terre 'WebGAL Exports'
  workDir = Join-Path $Terre 'WebGAL Exports/.webvideo-cache'
  installCacheDir = Join-Path $Terre 'video-export-data'
 }
 Assert-True ($config.portable -eq $true) 'The instance does not record portable mode.'
 foreach ($key in $expected.Keys) {
  $value = [string]$config.$key
  Assert-True ($value -and ![IO.Path]::IsPathRooted($value)) "Expected a package-relative $key path."
  Assert-True ([IO.Path]::GetFullPath((Join-Path $Terre $value)).TrimEnd('\') -eq $expected[$key].TrimEnd('\')) "Incorrect portable $key location."
 }
}

function Assert-RejectModeChange([string]$Terre, [string]$State, [string]$NewMode, [string]$Label) {
 $hashes = @{}
 foreach ($file in @((Join-Path $Terre 'webvideo-plus.json'), (Join-Path $Terre 'video-export-wrapper.json'), (Join-Path $Terre 'public/index.html'), (Join-Path $Terre 'WebGAL_Terre.exe'), (Join-Path $State 'config.json'))) {
  $hashes[$file] = Hash $file
 }
 Invoke-Manager $Terre $Label 'install' @('--portable', $NewMode, '--state-dir', $State) -ExpectFailure
 foreach ($file in $hashes.Keys) {
  Assert-True ((Hash $file) -eq $hashes[$file]) "Failed mode change modified $file."
 }
}

$original = Join-Path $run 'Portable original'
New-TerreFixture $original
$originalTools = Join-Path $original 'video-export-data/tools/fixture/bin'
Put (Join-Path $originalTools 'preserved.txt') 'tool directory sentinel'
if ($ExportSmoke) {
 foreach ($file in @('ffmpeg.exe', 'ffprobe.exe')) {
  Copy-Item -LiteralPath (Join-Path $PackageRoot "bin/$file") -Destination $originalTools
 }
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/font-render/project') -Destination (Join-Path $original 'data/games/Export fixture') -Recurse
}
Invoke-Manager $original 'first-portable-install' 'install' @('--portable', 'true', '--games-root', (Join-Path $original 'data/games'), '--runtime-path', $originalTools)
Assert-Portable $original
$originalState = Join-Path $original 'video-export-data/instance'
Put (Join-Path $originalState 'user-data/preserved.txt') 'portable state sentinel'
Put (Join-Path $originalState 'user-data/shared-assets.json') '{"schemaVersion":1,"libraries":[{"id":"11111111111111111111111111111111","kind":"all","name":"Portable fixture","root":"shared-sample"}]}'
Put (Join-Path $originalState 'user-data/shared-assets.json.http.json') ('{"schemaVersion":1,"id":"22222222222222222222222222222222","port":' + $resourcePort + '}')
Put (Join-Path $originalState 'update-preferences.json') '{"mode":"next-major","baselineVersion":"9999.1.0"}'
 $jobId = '33333333-3333-3333-3333-333333333333'
 $originalJob = Join-Path $originalState "jobs/$jobId"
 Put (Join-Path $originalJob 'request.json') (@{
  id = $jobId; portable = $true; recordDir = $originalJob
  sourceSnapshot = Join-Path $originalJob 'source-at-queue.txt'
  cacheRoot = Join-Path $original 'WebGAL Exports/.webvideo-cache'
  jobDir = Join-Path $original "WebGAL Exports/.webvideo-cache/$jobId"
 } | ConvertTo-Json -Compress)
 Put (Join-Path $originalJob 'status.json') (@{ state = 'failed'; logPath = Join-Path $originalJob 'error.log' } | ConvertTo-Json -Compress)
Put (Join-Path $original 'shared-sample/resource.txt') 'portable shared resource sentinel'
Put (Join-Path $original 'WebGAL Exports/preserved.mp4') 'video sentinel'
Assert-RejectModeChange $original $originalState 'false' 'reject-portable-to-ordinary'

$moved = if ($RelocationRoot) {
 $root = Join-Path ([IO.Path]::GetFullPath($RelocationRoot)) ([Guid]::NewGuid().ToString('N'))
 [void][IO.Directory]::CreateDirectory($root)
 Join-Path $root 'Portable relocated'
} else { Join-Path $run 'Portable relocated' }
Copy-Item -LiteralPath $original -Destination $moved -Recurse
$movedState = Join-Path $moved 'video-export-data/instance'
Assert-Portable $moved
$launcher = Start-Process -FilePath (Join-Path $moved 'WebGAL_Terre.exe') -WorkingDirectory $run -WindowStyle Hidden -PassThru
try {
 $sessionFile = Join-Path $movedState 'runtime-session.json'
 $discoveryFile = Join-Path $moved 'public/assets/video-export-service.json'
 Wait-Until { (Test-Path -LiteralPath $sessionFile -PathType Leaf) -and (Test-Path -LiteralPath $discoveryFile -PathType Leaf) } 25 'The relocated launcher did not start the service.'
 Assert-True ([IO.File]::ReadAllText((Join-Path $moved 'backend-started.txt')) -eq $moved) 'The backend was not launched in the relocated Terre directory.'
 $session = Read-Json $sessionFile
 Assert-True ($session.terreDir -eq $moved -and $session.stateDir -eq $movedState -and $session.gamesRoot -eq (Join-Path $moved 'data/games')) 'Relocated runtime paths were not resolved.'
 Assert-True ($session.runtimePath -eq (Join-Path $moved 'video-export-data/tools/fixture/bin')) 'Relocated FFmpeg lookup path was not resolved.'
 $discovery = Read-Json $discoveryFile
 $health = Invoke-RestMethod -Uri ($discovery.baseUrl + '/health') -TimeoutSec 5
 Assert-True ($health.app -eq 'webgal-video-exporter') 'Relocated Video+ service health check failed.'
 $auth = @{ Authorization = 'Bearer ' + $discovery.token }
 $shared = Invoke-RestMethod -Uri ($discovery.baseUrl + '/api/shared/libraries') -Headers $auth -TimeoutSec 5
 $prefix = 'http://127.0.0.1:' + $resourcePort + '/webvideo-shared/22222222222222222222222222222222/'
 Assert-True ($shared.resourcePrefix -eq $prefix -and !$shared.resourceError -and $shared.libraries[0].root -eq (Join-Path $moved 'shared-sample')) 'Moved shared registry did not preserve its address and local root.'
 $resource = Invoke-WebRequest -Uri ($prefix + '11111111111111111111111111111111/resource.txt') -TimeoutSec 5 -UseBasicParsing
 Assert-True ($resource.Content -eq 'portable shared resource sentinel') 'Moved shared registry did not serve the original resource.'
 $preferences = Invoke-RestMethod -Uri ($discovery.baseUrl + '/api/update-preferences') -Headers $auth -TimeoutSec 5
 Assert-True ($preferences.baselineVersion -eq '9999.1.0') 'Portable service did not load its local update preferences.'
 $movedJob = Join-Path $movedState "jobs/$jobId"
 $request = Read-Json (Join-Path $movedJob 'request.json')
 $jobStatus = Read-Json (Join-Path $movedJob 'status.json')
 Assert-True ($request.recordDir -eq $movedJob -and $request.jobDir -eq (Join-Path $moved "WebGAL Exports/.webvideo-cache/$jobId") -and $jobStatus.logPath -eq (Join-Path $movedJob 'error.log')) 'Moved job still points to the old package.'
 Assert-True ((Read-Json (Join-Path $originalJob 'request.json')).recordDir -eq $originalJob) 'Moving the copy modified the original package job.'
 if ($ExportSmoke) {
  $body = @{
   project = 'Export fixture'; scene = 'start.txt'; fileName = 'portable-smoke.mp4'
   settings = @{ engine = 'webgal'; width = 1280; height = 720; fps = 30; workers = 1; mode = 'manual'; holdSeconds = 1; textSpeed = 100; gpuRawMode = 'traditional' }
  } | ConvertTo-Json -Compress
  $queued = Invoke-RestMethod -Method Post -Uri ($discovery.baseUrl + '/api/jobs') -Headers $auth -ContentType 'application/json' -Body $body -TimeoutSec 15
  $exportStatus = Join-Path $movedState "jobs/$($queued.id)/status.json"
  Wait-Until {
   try { (Read-Json $exportStatus).state -in @('completed','failed','needs_attention','canceled') }
   catch [System.IO.IOException] { $false }
   catch [System.Management.Automation.MethodInvocationException] {
    if ($_.Exception.InnerException -isnot [System.IO.IOException]) { throw }
    $false
   }
  } 120 'The relocated export did not finish.'
  $result = Read-Json $exportStatus
  $video = Join-Path $moved 'WebGAL Exports/portable-smoke.mp4'
  Assert-True ($result.state -eq 'completed' -and (Test-Path -LiteralPath $video -PathType Leaf) -and (Get-Item -LiteralPath $video).Length -gt 0) "Relocated export failed: $($result.message)"
  Write-Host 'PASS real MP4 export from relocated Terre'
 }
} finally {
 if (!$launcher.HasExited) {
  Put (Join-Path $movedState 'lifecycle-control.json') '{"action":"stop"}'
  if (!$launcher.WaitForExit(15000)) { $launcher.Kill(); throw 'Fixture launcher did not stop.' }
 }
 $launcher.Dispose()
}

Invoke-Manager $moved 'portable-upgrade-in-place' 'install' @()
Assert-Portable $moved
Assert-True (Test-Path -LiteralPath (Join-Path $movedState 'user-data/preserved.txt')) 'Portable upgrade lost instance data.'
Invoke-Manager $moved 'portable-uninstall-preserve-data' 'uninstall' @()
Assert-True (!(Test-Path -LiteralPath (Join-Path $moved 'webvideo-plus.json'))) 'Uninstall left its mount record.'
Assert-True ((Hash (Join-Path $moved 'WebGAL_Terre.exe')) -eq (Hash $backend)) 'Uninstall did not restore the original Terre process.'
Assert-True ([IO.File]::ReadAllText((Join-Path $moved 'public/index.html')) -eq $index) 'Uninstall did not restore the original frontend.'
Assert-True (Test-Path -LiteralPath (Join-Path $movedState 'user-data/preserved.txt')) 'Portable uninstall removed retained instance data.'
Assert-True (Test-Path -LiteralPath (Join-Path $moved 'WebGAL Exports/preserved.mp4')) 'Portable uninstall removed an exported video.'

$ordinary = $moved
$ordinaryState = Join-Path $run 'ordinary-state'
$ordinaryPaths = @('--state-dir', $ordinaryState, '--install-cache-dir', (Join-Path $run 'ordinary-install-cache'), '--games-root', (Join-Path $ordinary 'data/games'), '--output-dir', (Join-Path $run 'ordinary-exports'), '--work-dir', (Join-Path $run 'ordinary-work'))
Invoke-Manager $ordinary 'ordinary-install-after-portable-uninstall' 'install' ($ordinaryPaths + @('--portable', 'false'))
Assert-True (!(Test-Path -LiteralPath (Join-Path $ordinaryState 'user-data/preserved.txt'))) 'Ordinary install imported retained portable instance data.'
# Exercise the normal-mode session writer too, without showing an installer or real Terre UI.
$ordinaryLauncher = Start-Process -FilePath (Join-Path $ordinary 'WebGAL_Terre.exe') -WorkingDirectory $run -WindowStyle Hidden -PassThru
try {
 $ordinarySession = Join-Path $ordinaryState 'runtime-session.json'
 $ordinaryDiscovery = Join-Path $ordinary 'public/assets/video-export-service.json'
 Wait-Until { (Test-Path -LiteralPath $ordinarySession -PathType Leaf) -and (Test-Path -LiteralPath $ordinaryDiscovery -PathType Leaf) } 25 'Ordinary lifecycle did not write its runtime session and start the service.'
 $session = Read-Json $ordinarySession
 Assert-True ($session.portable -ne $true -and $session.stateDir -eq $ordinaryState) 'Ordinary session inherited portable configuration.'
 $discovery = Read-Json $ordinaryDiscovery
 $health = Invoke-RestMethod -Uri ($discovery.baseUrl + '/health') -TimeoutSec 5
 Assert-True ($health.app -eq 'webgal-video-exporter') 'Ordinary Video+ service health check failed.'
} finally {
 if (!$ordinaryLauncher.HasExited) {
  Put (Join-Path $ordinaryState 'lifecycle-control.json') '{"action":"stop"}'
  if (!$ordinaryLauncher.WaitForExit(15000)) { $ordinaryLauncher.Kill(); throw 'Ordinary fixture launcher did not stop.' }
 }
 $ordinaryLauncher.Dispose()
}
Put (Join-Path $ordinary 'video-export-data/unrelated.txt') 'adjacent directory sentinel'
Assert-RejectModeChange $ordinary $ordinaryState 'true' 'reject-ordinary-to-portable'
Invoke-Manager $ordinary 'ordinary-upgrade-adjacent-directory' 'install' $ordinaryPaths
$ordinaryProduct = Read-Json (Join-Path $ordinary 'webvideo-plus.json')
Assert-True ($ordinaryProduct.portable -ne $true -and $ordinaryProduct.config -eq (Join-Path $ordinaryState 'config.json')) 'Ordinary upgrade switched install mode.'
Assert-True ([IO.File]::ReadAllText((Join-Path $ordinary 'video-export-data/unrelated.txt')) -eq 'adjacent directory sentinel') 'Ordinary upgrade changed the adjacent data directory.'
Invoke-Manager $ordinary 'ordinary-uninstall' 'uninstall' $ordinaryPaths
Write-Host 'PASS portable installation, moved launcher and service, locked modes, and retained uninstall data'

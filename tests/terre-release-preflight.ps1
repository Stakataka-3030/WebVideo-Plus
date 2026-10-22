param(
 [Parameter(Mandatory=$true)][string]$OfficialTerreRoot,
 [Parameter(Mandatory=$true)][string]$MygoArchive,
 [Parameter(Mandatory=$true)][string]$PackageRoot,
 [string]$PreviousInstaller,
 # Investigation fallback for the patch layer only; never counts as an installed release.
 [string]$PreviousPatchPackageRoot,
 [string]$OutputRoot=(Join-Path ([IO.Path]::GetTempPath()) 'webvideo-terre-preflight')
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
if($env:OS -ne 'Windows_NT'){throw 'Windows manager file transactions required.'}
$repository=Split-Path -Parent $PSScriptRoot
$pins=Get-Content -LiteralPath (Join-Path $repository 'build/frontend-compatibility-fixtures.json') -Raw | ConvertFrom-Json
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$OfficialTerreRoot=[IO.Path]::GetFullPath($OfficialTerreRoot)
$MygoArchive=[IO.Path]::GetFullPath($MygoArchive)
$run=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($run)
function Require([bool]$condition,[string]$message){if(!$condition){throw $message}}
function Hash([string]$file){if(Test-Path -LiteralPath $file -PathType Leaf){return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()};return '<absent>'}
function Put([string]$file,[string]$text){
 [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))
 $temporary=$file+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 [IO.File]::WriteAllText($temporary,$text,[Text.UTF8Encoding]::new($false))
 if([IO.File]::Exists($file)){[IO.File]::Replace($temporary,$file,$null)}else{[IO.File]::Move($temporary,$file)}
}
function Json([string]$file,$value){Put $file ($value | ConvertTo-Json -Depth 30)}
function Plain([string]$file){
 Require (Test-Path -LiteralPath $file) "Missing input: $file"
 for($at=[IO.Path]::GetFullPath($file);$at;$at=[IO.Path]::GetDirectoryName($at)){
  Require (((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) "Fixture input contains a link: $at"
 }
}
function Snapshot([string[]]$roots){
 $map=@{};foreach($root in $roots){if(Test-Path -LiteralPath $root){foreach($file in Get-ChildItem -LiteralPath $root -File -Recurse -Force){$map[$file.FullName]=Hash $file.FullName}}};return $map
}
function Same($before,$after){if($before.Count -ne $after.Count){return $false};foreach($key in $before.Keys){if($after[$key] -ne $before[$key]){return $false}};return $true}
$results=[Collections.Generic.List[object]]::new()
$sourceHashes=@{}
$globalRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WebGALVideoExporter'
$globalHashes=@{};foreach($name in @('last-install.json','instances.json')){$file=Join-Path $globalRoot $name;$globalHashes[$file]=Hash $file}
$summary=[ordered]@{schemaVersion=1;run=$run;success=$false;scope='4.6.4 official and MyGO 3.2.1; no host/browser/service launch';cases=$results;limitations=@('Reduced host file fixtures, not installer GUI or running-editor acceptance.');inputs=@{}}
try {
 Plain $MygoArchive
 Require ((Split-Path -Leaf $MygoArchive) -eq $pins.mygo.archiveFileName) 'Unexpected MyGO archive filename.'
 $archiveHash=Hash $MygoArchive
 Require ($archiveHash -eq $pins.mygo.archiveSha256) 'MyGO archive hash differs; review provenance before updating the pin.'
 $sourceHashes[$MygoArchive]=$archiveHash
 $mygo=Join-Path $run 'inputs/mygo'
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead($MygoArchive)
 try {
  foreach($property in $pins.mygo.files.PSObject.Properties){
   $entryName=$pins.mygo.archivePrefix+$property.Name
   $entries=@($zip.Entries | Where-Object {$_.FullName -ceq $entryName})
   Require ($entries.Count -eq 1) "Missing or duplicate pinned ZIP entry: $entryName"
   Require (($entries[0].ExternalAttributes -band 0x400) -eq 0 -and (($entries[0].ExternalAttributes -shr 16) -band 0xF000) -ne 0xA000) "Linked ZIP entry: $entryName"
   $target=Join-Path $mygo $property.Name
   [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
   [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0],$target)
   Require ((Hash $target) -eq $property.Value) "MyGO entry hash mismatch: $entryName"
  }
 }finally{$zip.Dispose()}
 $metadata=Get-Content -LiteralPath (Join-Path $mygo $pins.mygo.metadata) -Raw | ConvertFrom-Json
 Require ($metadata.version -eq $pins.mygo.version -and $metadata.webgalVersion -eq $pins.mygo.baseWebgalVersion -and $metadata.id -eq 'webgal-mygo.mygo') 'MyGO version/engine identity differs.'
 foreach($property in $pins.official.files.PSObject.Properties){$file=Join-Path $OfficialTerreRoot $property.Name;Plain $file;Require ((Hash $file) -eq $property.Value) "Official fixture hash differs: $($property.Name)";$sourceHashes[$file]=$property.Value}
 Require (!(Test-Path -LiteralPath (Join-Path $OfficialTerreRoot 'webvideo-plus.json'))) 'Official input must be unmodified.'
 $manager=Join-Path $PackageRoot 'WebVideoPlus.Manager.exe'
 Plain $manager
 $product=Get-Content -LiteralPath (Join-Path $PackageRoot 'product.json') -Raw | ConvertFrom-Json
 $version=Get-Content -LiteralPath (Join-Path $repository 'version.json') -Raw | ConvertFrom-Json
 Require ($product.version -eq $version.productVersion -and $product.terreVersion -eq $pins.hostVersion) 'Package does not match this source branch/version.'
 $summary.inputs=@{officialBundleSha256=$pins.official.files.PSObject.Properties[$pins.official.bundle].Value;mygoArchiveSha256=$archiveHash;mygoBundleSha256=$pins.mygo.files.PSObject.Properties[$pins.mygo.bundle].Value;productVersion=$product.version;managerSha256=(Hash $manager)}
 $oldInstallPackage=$null
 if($PreviousInstaller){
  $PreviousInstaller=[IO.Path]::GetFullPath($PreviousInstaller);Plain $PreviousInstaller
  Require ((Hash $PreviousInstaller) -eq $pins.previousInstaller.sha256) 'Previous installer is not the pinned official 1.1.7 release.'
  $sourceHashes[$PreviousInstaller]=$pins.previousInstaller.sha256
  $oldInstallPackage=Join-Path $run 'previous-release'
  # Static ZIP extraction through the existing verifier: no installer entrypoint.
  $extract=@'
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const {readEmbeddedZip}=await import(pathToFileURL(process.argv[1]));
const entries=readEmbeddedZip(fs.readFileSync(process.argv[2]));
const manifests=[...entries.values()].filter(x=>/^[^/]+\/MANIFEST\.json$/.test(x.name));
if(manifests.length!==1)throw Error('Previous package manifest missing');
const prefix=manifests[0].name.slice(0,-'MANIFEST.json'.length), manifest=JSON.parse(manifests[0].data.toString('utf8'));
if(manifest.version!=='1.1.7')throw Error('Previous package version differs');
const records=new Map(manifest.files.map(x=>[x.path,x]));
if(entries.size!==records.size+1)throw Error('Previous package closure differs');
for(const {name,data} of entries.values()){
 if(!name.startsWith(prefix))throw Error('Unexpected previous package root');
 const relative=name.slice(prefix.length), record=records.get(relative);
 if(relative!=='MANIFEST.json'&&(!record||record.bytes!==data.length||record.sha256!==crypto.createHash('sha256').update(data).digest('hex')))throw Error('Previous package manifest mismatch: '+relative);
 const file=path.join(process.argv[3],relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);
}
'@
  & node --input-type=module -e $extract (Join-Path $repository 'scripts/verify-installer-materials.mjs') $PreviousInstaller $oldInstallPackage
  Require ($LASTEXITCODE -eq 0) 'Previous release static extraction failed.'
  $PreviousPatchPackageRoot=$oldInstallPackage
  $summary.inputs.previousInstallerSha256=$pins.previousInstaller.sha256
 }
 Require (!!$PreviousPatchPackageRoot) 'Supply the pinned PreviousInstaller; investigation-only patch packages cannot pass the release gate.'
 $PreviousPatchPackageRoot=[IO.Path]::GetFullPath($PreviousPatchPackageRoot)
 $oldManager=Join-Path $PreviousPatchPackageRoot 'WebVideoPlus.Manager.exe';Plain $oldManager
 Require ((Get-Content -LiteralPath (Join-Path $PreviousPatchPackageRoot 'product.json') -Raw | ConvertFrom-Json).version -eq '1.1.7') 'Previous patch package is not 1.1.7.'
 $summary.inputs.previousPatchManagerSha256=Hash $oldManager
 $probe=Join-Path $run 'FrontendCompatibilityProbe.exe'
 & (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /reference:System.Web.Extensions.dll ('/out:'+$probe) (Join-Path $PSScriptRoot 'FrontendCompatibilityProbe.cs')
 Require ($LASTEXITCODE -eq 0) 'Patch probe compilation failed.'
 function Patch-Case([string]$name,[string]$exe,[string]$package,[string]$inputFile,[string]$shared,[string]$previous=''){
  $folder=Join-Path $run ('patch/'+$name);[void][IO.Directory]::CreateDirectory($folder)
  $output=Join-Path $folder 'patched.js';$resultFile=Join-Path $folder 'result.json'
  $arguments=@($exe,$package,$inputFile,$shared,$output,$resultFile);if($previous){$arguments+=$previous}
  & $probe @arguments
  $code=$LASTEXITCODE;$value=Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
  $item=[ordered]@{layer='patch';name=$name;status='FAIL';exitCode=$code;details=$value}
  if($code -eq 0 -and $value.success){
   & node --check $output 2> (Join-Path $folder 'syntax.log');$item.syntaxExitCode=$LASTEXITCODE
   if($LASTEXITCODE -eq 0){
    $enabled=$true
    if($exe -eq $manager){$text=[IO.File]::ReadAllText($output);$at=$text.IndexOf('const WebVideoSharedMaterials=(()=>{');$enabled=$at -ge 0 -and $text.Substring($at,[Math]::Min(180,$text.Length-$at)).Contains('const enabled='+($shared -eq 'on').ToString().ToLowerInvariant()+';')}
    $item.sharedFlagMatches=$enabled
    if($enabled){
     $item.status='PASS'
     if($exe -eq $manager){& node (Join-Path $PSScriptRoot 'shared-model-wiring.test.cjs') $output $inputFile | Out-Host;$item.modelWiringExitCode=$LASTEXITCODE;if($LASTEXITCODE -ne 0){$item.status='FAIL'}}
     if($name -eq 'mygo-fresh-shared-on'){& node (Join-Path $PSScriptRoot 'project-resources-ui.test.cjs') $output | Out-Host;$item.creationUiExitCode=$LASTEXITCODE;if($LASTEXITCODE -ne 0){$item.status='FAIL'}}
    }
   }
  }
  $results.Add($item);Write-Output ($name+': '+$item.status) | Out-Host
  return @{output=$output;success=($item.status -eq 'PASS');requested=@($value.requested)}
 }
 function Invoke-Owned([string]$exe,[string]$folder,[string]$operation,[string[]]$modules){
  $arguments=@('install','--terre-dir',('"'+(Join-Path $folder 'host')+'"'),'--state-dir',('"'+(Join-Path $folder 'state')+'"'),'--install-cache-dir',('"'+(Join-Path $folder 'cache')+'"'),'--work-dir',('"'+(Join-Path $folder 'work')+'"'),'--games-root',('"'+(Join-Path $folder 'games')+'"'),'--output-dir',('"'+(Join-Path $folder 'output')+'"'),'--terre-url','http://localhost:32151','--no-recent','true','--delete-data','false','--delete-cache','false','--modules',($modules -join ','))
  $watch=[Diagnostics.Stopwatch]::StartNew()
  $p=Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $folder ($operation+'.log')) -RedirectStandardError (Join-Path $folder ($operation+'.error.log'))
  $null=$p.Handle
  if(!$p.WaitForExit(180000)){$p.Kill();throw 'Owned manager exceeded 180 seconds.'}
  $p.WaitForExit();$watch.Stop()
  return @{exitCode=$p.ExitCode;elapsedMs=$watch.ElapsedMilliseconds;error=[IO.File]::ReadAllText((Join-Path $folder ($operation+'.error.log')))}
 }
 foreach($profile in @(@{name='official';root=$OfficialTerreRoot;pin=$pins.official},@{name='mygo';root=$mygo;pin=$pins.mygo})){
  $inputFile=Join-Path $profile.root $profile.pin.bundle
  $seed=Patch-Case ($profile.name+'-1.1.7-control') $oldManager $PreviousPatchPackageRoot $inputFile 'off'
  foreach($scenario in @('fresh','upgrade-1.1.7')){foreach($shared in @('on','off')){
   $name=$profile.name+'-'+$scenario+'-shared-'+$shared
   $previous=if($scenario -eq 'upgrade-1.1.7' -and $seed.success){$seed.output}else{''}
   if($scenario -eq 'upgrade-1.1.7' -and !$seed.success){$results.Add(@{layer='patch';name=$name;status='NOT_RUN';reason='1.1.7 seed patch failed'});continue}
   $patched=Patch-Case $name $manager $PackageRoot $inputFile $shared $previous
   $item=[ordered]@{layer='manager-file-transaction';name=$name;status='FAIL';hostFixture='reduced: pinned editor entry/bundle/backend binary and engine metadata; backend is never executed'}
   if($scenario -eq 'upgrade-1.1.7' -and !$oldInstallPackage){$item.status='NOT_RUN';$item.reason='Pinned full 1.1.7 installer unavailable; patch-layer record recovery is not a real installed upgrade.';$results.Add($item);continue}
   $folder=Join-Path $run ('install/'+$name);$hostRoot=Join-Path $folder 'host'
   [void][IO.Directory]::CreateDirectory($hostRoot)
   foreach($relative in @('public/index.html',$profile.pin.bundle,'WebGAL_Terre.exe','assets/templates/WebGAL_Template/webgal-engine.json')){
    $source=Join-Path $profile.root $relative;if(Test-Path -LiteralPath $source){$target=Join-Path $hostRoot $relative;[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target));Copy-Item -LiteralPath $source -Destination $target}
   }
   foreach($dir in @('state','cache','work','games','output')){[void][IO.Directory]::CreateDirectory((Join-Path $folder $dir))}
   Put (Join-Path $folder 'games/keep.txt') 'owned sentinel'
   if($scenario -eq 'upgrade-1.1.7'){
    $old=Invoke-Owned (Join-Path $oldInstallPackage 'WebVideoPlus.Manager.exe') $folder 'seed-1.1.7' $seed.requested;$item.previousInstall=$old
    if($old.exitCode -ne 0){$item.reason='1.1.7 manager install failed';$results.Add($item);continue}
   }
   $roots=@($hostRoot,(Join-Path $folder 'state'),(Join-Path $folder 'cache'))
   $before=Snapshot $roots
   $current=Invoke-Owned $manager $folder 'current' $patched.requested
   $item.currentInstall=$current
   if($current.exitCode -eq 0){
    $record=Get-Content -LiteralPath (Join-Path $hostRoot 'webvideo-plus.json') -Raw | ConvertFrom-Json
    $manifest=Get-Content -LiteralPath (Join-Path $folder 'state/install.json') -Raw | ConvertFrom-Json
    $bundle=Join-Path $hostRoot ('public/assets/'+$manifest.installedBundle)
    & node --check $bundle 2> (Join-Path $folder 'syntax.log');$item.syntaxExitCode=$LASTEXITCODE
    $text=[IO.File]::ReadAllText($bundle);$at=$text.IndexOf('const WebVideoSharedMaterials=(()=>{')
    $item.sharedFlagMatches=$at -ge 0 -and $text.Substring($at,[Math]::Min(180,$text.Length-$at)).Contains('const enabled='+($shared -eq 'on').ToString().ToLowerInvariant()+';')
    if($record.version -eq $product.version -and (($record.modules -contains 'sharedAssets') -eq ($shared -eq 'on')) -and $LASTEXITCODE -eq 0 -and $item.sharedFlagMatches){$item.status='PASS'}
   }else{$item.failedInstallFilesUnchanged=Same $before (Snapshot $roots)}
   if($item.status -eq 'PASS' -and $shared -eq 'on'){
    $sharedRoot=Join-Path $folder 'shared-source';$sentinel=Join-Path $sharedRoot 'keep.txt';Put $sentinel 'owned shared original'
    $registry=Join-Path $folder 'state/user-data/shared-assets.json'
    Json $registry @{schemaVersion=1;libraries=@(@{id='11111111111111111111111111111111';kind='all';name='fixture';root=$sharedRoot})}
    $savedRegistry=Hash $registry;$savedOriginal=Hash $sentinel;$toggles=[Collections.Generic.List[object]]::new()
    foreach($enabled in @($false,$true)){
     $selection=@($patched.requested | Where-Object {$_ -ne 'sharedAssets'});if($enabled){$selection+=@('sharedAssets')}
     $toggle=Invoke-Owned $manager $folder ('shared-'+$enabled.ToString()) $selection
     if($toggle.exitCode -eq 0){
      $record=Get-Content -LiteralPath (Join-Path $hostRoot 'webvideo-plus.json') -Raw | ConvertFrom-Json
      $manifest=Get-Content -LiteralPath (Join-Path $folder 'state/install.json') -Raw | ConvertFrom-Json
      $text=[IO.File]::ReadAllText((Join-Path $hostRoot ('public/assets/'+$manifest.installedBundle)));$at=$text.IndexOf('const WebVideoSharedMaterials=(()=>{')
      $toggle.selectionMatches=(($record.modules -contains 'sharedAssets') -eq $enabled) -and $at -ge 0 -and $text.Substring($at,[Math]::Min(180,$text.Length-$at)).Contains('const enabled='+$enabled.ToString().ToLowerInvariant()+';')
     }
     $toggle.sharedSourcePreserved=(Hash $sentinel) -eq $savedOriginal -and (Hash $registry) -eq $savedRegistry
     if($toggle.exitCode -ne 0 -or !$toggle.selectionMatches -or !$toggle.sharedSourcePreserved){$item.status='FAIL'}
     $toggles.Add($toggle)
    }
    $item.sharedToggles=$toggles
   }
   Require (([IO.File]::ReadAllText((Join-Path $folder 'games/keep.txt'))) -eq 'owned sentinel') 'Fixture project was changed.'
   $results.Add($item);Write-Output ($name+' manager transaction: '+$item.status)
  }}
 }
 $summary.success=@($results | Where-Object {$_.status -ne 'PASS'}).Count -eq 0
}catch{$summary.error=$_.Exception.Message;$summary.success=$false}
finally {
 foreach($file in $sourceHashes.Keys){if((Hash $file) -ne $sourceHashes[$file]){$summary.success=$false;$summary.sourceChanged=$file}}
 foreach($file in $globalHashes.Keys){if((Hash $file) -ne $globalHashes[$file]){$summary.success=$false;$summary.globalBookkeepingChanged=$file}}
 Json (Join-Path $run 'result.json') $summary
 Write-Output ('Release preflight '+$(if($summary.success){'PASS'}else{'BLOCKED'})+': '+(Join-Path $run 'result.json'))
}
if(!$summary.success){exit 1}

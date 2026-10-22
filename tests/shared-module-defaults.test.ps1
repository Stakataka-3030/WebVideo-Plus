param([string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputRoot){$OutputRoot=Join-Path $repo '.build/shared-module-defaults'}
$run=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
$fixture=Join-Path $run 'generator-fixture'
foreach($directory in @('installer','scripts','build')){[void][IO.Directory]::CreateDirectory((Join-Path $fixture $directory))}
Get-ChildItem -LiteralPath (Join-Path $repo 'installer') -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $fixture 'installer')}
Copy-Item -LiteralPath (Join-Path $repo 'scripts/configure-installer.mjs') -Destination (Join-Path $fixture 'scripts')
Copy-Item -LiteralPath (Join-Path $repo 'build/dependencies.lock.json') -Destination (Join-Path $fixture 'build')
Copy-Item -LiteralPath (Join-Path $repo 'version.json') -Destination $fixture
& node (Join-Path $fixture 'scripts/configure-installer.mjs')
if($LASTEXITCODE -ne 0){throw 'Actual installer generator failed.'}
$generated=[IO.File]::ReadAllText((Join-Path $fixture 'installer/Installer.cs'))
if(([Regex]::Matches($generated,'ModuleCatalog\.UpgradeSharedAssetsDefault\(')).Count -ne 1){throw 'Expected one scoped module-history call.'}
$refreshStart=$generated.IndexOf(' void RefreshInstallation(');$refreshEnd=$generated.IndexOf(' void SetBusy(',$refreshStart)
if($refreshStart -lt 0 -or $refreshEnd -lt 0){throw 'Generated module restoration method not found.'}
$refresh=$generated.Substring($refreshStart,$refreshEnd-$refreshStart)
$methods=@();foreach($name in @('SelectedModules','ReconcileModules')){$match=[Regex]::Match($generated,'(?m)^ (?:string\[\]|void) '+$name+'\(\)\{[^\r\n]+\}');if(!$match.Success){throw ('Actual generated method missing: '+$name)};$methods+=$match.Value}
$compare=@();foreach($name in @('ParseVersion','NumericCompare','CompareVersions')){$match=[Regex]::Match($generated,'(?m)^ (?:public )?static [^\r\n]+ '+$name+'\([^\r\n]+');if(!$match.Success){throw ('Actual comparison helper missing: '+$name)};$compare+=$match.Value}
$extracted='using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Web.Script.Serialization;using NativeVideo;public partial class InstallerDefaultsFixture {'+"`n"+($methods -join "`n")+"`n"+$refresh+"`n"+'} public partial class InstallationState {'+"`n"+($compare -join "`n")+"`n"+'}'
$source=Join-Path $run 'GeneratedInstallerDefaultsFixture.cs';[IO.File]::WriteAllText($source,$extracted,[Text.UTF8Encoding]::new($false))
$csc=Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $run 'SharedModuleDefaultsChecks.exe'
& $csc /nologo /target:exe ('/out:'+$exe) /r:System.Core.dll /r:System.Web.Extensions.dll (Join-Path $repo 'manager/ModuleCatalog.cs') (Join-Path $PSScriptRoot 'SharedModuleDefaultsChecks.cs') $source
if($LASTEXITCODE -ne 0){throw 'Actual catalog or generated restore fixture failed compilation.'}
$result=& $exe (Join-Path $run 'owned-markers')
if($LASTEXITCODE -ne 0){throw 'Shared module defaults checks failed.'}
$result | Set-Content -LiteralPath (Join-Path $run 'results.json') -Encoding utf8
$result
Write-Output ('Evidence: '+$run)

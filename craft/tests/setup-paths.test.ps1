# Optional isolated Windows source regression. Inert fixtures only: this never
# executes Craft, calls shortcut COM, changes registry or writes the real desktop.
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-setup-path-checks-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 $checks=Join-Path $temp 'SetupPathChecks.exe'
 & $compiler /nologo /target:exe /main:SetupPathChecks /platform:x64 /codepage:65001 ('/out:'+$checks) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot '../installer/ManifestVerifier.cs') (Join-Path $PSScriptRoot '../installer/SetupPaths.cs') (Join-Path $PSScriptRoot 'SetupPathChecks.cs')
 if($LASTEXITCODE -ne 0){throw 'Setup path regression compilation failed.'}
 $fixture=Join-Path $temp 'fixture'
 & node (Join-Path $root 'tests/craft-setup-paths-fixture.mjs') $fixture
 if($LASTEXITCODE -ne 0){throw 'Fixture preparation failed.'}
 & $checks $fixture
 if($LASTEXITCODE -ne 0){throw 'Setup path regression failed.'}
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }

param([string]$PackageRoot='')
$ErrorActionPreference='Stop'
if(-not $PackageRoot){
 $versions=Get-Content (Join-Path $PSScriptRoot '../version.json') -Raw | ConvertFrom-Json
 $PackageRoot=Join-Path $PSScriptRoot ('../../dist/WebVideoCraft-Setup-'+$versions.installerVersion)
}
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-request-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $native=Join-Path $PackageRoot 'WebGAL.Video.exe';$test=Join-Path $temp 'RuntimeContractChecks.exe'
 & (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe /platform:x64 ('/out:'+$test) ('/r:'+$native) /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'RuntimeContractChecks.cs')
 if($LASTEXITCODE -ne 0){throw 'Runtime contract check compilation failed'}
 Copy-Item -LiteralPath (Join-Path $PackageRoot 'MANIFEST.json') -Destination $temp
 Copy-Item -LiteralPath $native -Destination $temp
 Get-ChildItem -LiteralPath $PackageRoot -Filter '*.dll' -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $temp}
 Copy-Item -LiteralPath ($native+'.config') -Destination ($test+'.config')
 & $test
 if($LASTEXITCODE -ne 0){throw 'Persisted request contract regression failed'}
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

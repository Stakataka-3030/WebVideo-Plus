$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'Portable source checks require PowerShell7'}
$root=Split-Path $PSScriptRoot -Parent
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-recent-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $sources=@('src/Core.cs','src/ManualCuts.cs','src/Integration.cs','manager/ManagerMain.cs','manager/ProductIntegration.cs','manager/ModuleCatalog.cs','tests/RecentInstallRecordChecks.cs','tests/recent-install-record.portable-json.cs')|ForEach-Object {Join-Path $root $_}
 if(Test-Path (Join-Path $root 'src/WebgalEngineProfile.cs')){$sources+=Join-Path $root 'src/WebgalEngineProfile.cs'}
 Add-Type -Path $sources -IgnoreWarnings -WarningAction SilentlyContinue
 [RecentInstallRecordChecks]::Run($temp)
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

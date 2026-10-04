param(
 [string]$PortableJson=(Join-Path $PSScriptRoot 'engine-adapter-dual-profile.portable-json.cs'),
 [string]$OutputRoot
)
# Pure ProductIntegration.Patch execution. No installer, launcher, host process,
# registry or user-state operations are invoked, even when run on Windows.
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'Portable source checks require PowerShell 7.'}
$repo=Split-Path $PSScriptRoot -Parent
$temp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-host-patch-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 & node (Join-Path $repo 'scripts/build-timeline.mjs')
 if($LASTEXITCODE -ne 0){throw 'Host asset generation failed'}
 $package=Join-Path $temp 'package'
 New-Item -ItemType Directory -Path $package | Out-Null
 foreach($folder in @('hosts','timeline','product-ui')){Copy-Item -LiteralPath (Join-Path $repo "package/$folder") -Destination $package -Recurse}
 Copy-Item -LiteralPath (Join-Path $repo 'package/product.json') -Destination $package
 foreach($folder in @('integration','features/core','features/modules')){New-Item -ItemType Directory -Path (Join-Path $package $folder) -Force | Out-Null}
 Copy-Item -LiteralPath (Join-Path $repo 'browser/export-component.js') -Destination (Join-Path $package 'integration/terre-export-component.js')
 foreach($file in @('project-core.js','project-bridge.js','tools-host.js','tools.css')){Copy-Item -LiteralPath (Join-Path $repo "browser/$file") -Destination (Join-Path $package 'features/core')}
 $toolsHost=(Get-Content (Join-Path $repo 'browser/tools-host.js') -Raw)+"`n"+(Get-Content (Join-Path $repo 'browser/library-picker.js') -Raw)+"`n"+(Get-Content (Join-Path $repo 'browser/filter-helpers.js') -Raw)
 [IO.File]::WriteAllText((Join-Path $package 'features/core/tools-host.js'),$toolsHost)
 $modules=@{expressionPrep='expression-preparation.js';filter='batch-filter-panel.js';filterEdit='filter-edit.js';batchNext='batch-next.js';autoExit='auto-exit.js';presetEffects='preset-ui.js';backups='backup-panel.js';idTools='id-tools.js';videoWorkflow='video-workflow.js';musicTimeline='music-timeline.js';textImport='text-import.js';checks='checks.js'}
 foreach($key in $modules.Keys){Copy-Item -LiteralPath (Join-Path $repo ('browser/'+$modules[$key])) -Destination (Join-Path $package "features/modules/$key.js")}
 $idTools=(Get-Content (Join-Path $repo 'browser/id-conversion.js') -Raw)+"`n"+(Get-Content (Join-Path $repo 'browser/id-tools.js') -Raw)
 [IO.File]::WriteAllText((Join-Path $package 'features/modules/idTools.js'),$idTools)
 $yaml=(Get-Content (Join-Path $repo 'vendor/js-yaml-4.1.1.min.js') -Raw) -replace '(?m)//# sourceMappingURL=.*$',''
 $textImport='(()=>{const exports={},module={exports};'+"`n"+$yaml+"`nwindow.WebVideoYaml=exports;})();`n"+(Get-Content (Join-Path $repo 'browser/anogo-import-core.js') -Raw)+"`n"+(Get-Content (Join-Path $repo 'browser/text-import.js') -Raw)
 [IO.File]::WriteAllText((Join-Path $package 'features/modules/textImport.js'),$textImport)
 $sources=@('src/Core.cs','src/ManualCuts.cs','src/Integration.cs','manager/ManagerMain.cs','manager/ProductIntegration.cs','manager/ModuleCatalog.cs','tests/terre-host-patch-checks.cs') | ForEach-Object {Join-Path $repo $_}
 # Newer integrated Core.cs resolves official runtime profiles.
 if(Test-Path (Join-Path $repo 'src/WebgalEngineProfile.cs')){$sources+=Join-Path $repo 'src/WebgalEngineProfile.cs'}
 Add-Type -Path ($sources+@([IO.Path]::GetFullPath($PortableJson))) -IgnoreWarnings -WarningAction SilentlyContinue
 if(-not $OutputRoot){$OutputRoot=Join-Path $temp 'patched'}
 [TerreHostPatchChecks]::Run($repo,$package,[IO.Path]::GetFullPath($OutputRoot))
 $results=@(Get-ChildItem -LiteralPath $OutputRoot -Filter 'terre-*.mjs' -File)
 if($results.Count -ne 16){throw "Expected 16 complete patched host outputs, found $($results.Count)"}
 foreach($file in $results){& node --check $file.FullName;if($LASTEXITCODE -ne 0){throw "Patched host syntax failed: $($file.Name)"}}
 Write-Output 'All 16 exact/structural host and module variants produced valid JavaScript. Windows installer and host UI validation remain separate.'
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}

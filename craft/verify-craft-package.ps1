# Run after building the Craft package. Reads assembly metadata only, never its entrypoint.
param([string]$PackageRoot='')
$ErrorActionPreference='Stop'
$versions=Get-Content (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json
if(-not $PackageRoot){$PackageRoot=Join-Path (Split-Path $PSScriptRoot -Parent) ('dist/WebVideoCraft-Setup-'+$versions.installerVersion)}
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
$manifest=Get-Content (Join-Path $PackageRoot 'MANIFEST.json') -Raw | ConvertFrom-Json
foreach($name in @('CraftInstallerObserver.exe','ai-runtime/worker.mjs','ai-runtime/node.exe','ai-runtime/novel-core.mjs','ai-runtime/novel-prompt.txt','ai-runtime/stage-prompt.txt','ai-runtime/LICENSE-Node.txt','ai-runtime/node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json','vendor/js-yaml-4.1.1.min.js','vendor/js-yaml-LICENSE','craft/update/observe-installer.ps1')){if(-not(Test-Path -LiteralPath (Join-Path $PackageRoot $name))){throw "Missing Craft service dependency: $name"}}
foreach($name in @('node.exe','ai-runtime/node.exe')){if((Get-FileHash (Join-Path $PackageRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $versions.nodeSha256){throw "Unpinned Node executable: $name"}}
$assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $PackageRoot 'WebGAL.Video.exe')))
$resources=$assembly.GetManifestResourceNames()
foreach($name in @('character-map.factory.json','preset-effects.factory.json','ai-providers.factory.json','anogo-actions.factory.json','filter-presets.factory.json')){if($name -notin $resources){throw "Native kernel lacks embedded factory resource: $name"}}
if($manifest.updateObserverValidated -or $manifest.sameNameUpdateValidated){throw 'Development package must keep unverified native update gates disabled.'}
Write-Output 'Craft runtime dependencies, embedded factory resources, pinned Node copies and update gates verified.'

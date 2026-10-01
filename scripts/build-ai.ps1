param([switch]$ReuseDependencies)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskVersions=Get-Content -LiteralPath (Join-Path $taskRoot 'version.json') -Raw | ConvertFrom-Json
$taskProductVersion=[string]$taskVersions.productVersion
if([string]::IsNullOrWhiteSpace($taskProductVersion)){throw 'version.json is missing productVersion'}
$taskSource=Join-Path $taskRoot 'ai-runtime'
$taskDest=Join-Path $taskRoot 'package/ai-runtime'
$taskSourceModules=Join-Path $taskSource 'node_modules'
$taskDestModules=Join-Path $taskDest 'node_modules'
if(-not(Test-Path (Join-Path $taskSourceModules '@deepseek-ai/dsh-llm-pi-ai/package.json'))){throw 'AI dependencies missing. Restore the fixed package-lock before building.'}
New-Item -ItemType Directory -Path $taskDest -Force | Out-Null
$taskCanReuse=$ReuseDependencies -and (Test-Path (Join-Path $taskDestModules '@deepseek-ai/dsh-llm-pi-ai/package.json'))
if($taskCanReuse){
 Write-Output 'Reusing staged AI node_modules for fast build'
}else{
 if(Test-Path $taskDestModules){Remove-Item -LiteralPath $taskDestModules -Recurse -Force}
 Copy-Item -LiteralPath $taskSourceModules -Destination $taskDest -Recurse -Force
}
foreach($taskFile in @('worker.mjs','novel-prompt.txt','stage-prompt.txt','package-lock.json')){Copy-Item -LiteralPath (Join-Path $taskSource $taskFile) -Destination $taskDest -Force}
# prepare-build.ps1 stages the exact Windows Node archive and required license.
$taskInputs=Get-Content -LiteralPath (Join-Path $taskRoot 'build/dependencies.lock.json') -Raw | ConvertFrom-Json
$taskNode=Join-Path $taskDest 'node.exe'
$taskNodeLicense=Join-Path $taskDest 'LICENSE-Node.txt'
if(-not(Test-Path $taskNode)-or -not(Test-Path $taskNodeLicense)){throw 'Pinned Node runtime is missing. Run prepare-build.ps1 before building.'}
$taskNodeVersion=(& $taskNode --version).Trim()
if($LASTEXITCODE -ne 0 -or $taskNodeVersion -ne ('v'+$taskInputs.node.version)){throw 'Staged Node runtime version differs from build/dependencies.lock.json'}
# Node handles the lockfile's empty root key; Windows PowerShell 5.1 cannot.
& $taskNode (Join-Path $PSScriptRoot 'build-ai-metadata.mjs')
if($LASTEXITCODE -ne 0){throw 'AI package metadata staging failed'}
Copy-Item -LiteralPath (Join-Path $taskRoot 'ai-providers.factory.json') -Destination (Join-Path $taskDest 'providers.json') -Force
$taskCore=[IO.File]::ReadAllText((Join-Path $taskRoot 'browser/novel-core.js'))+[Environment]::NewLine+'export { WebVideoNovel };';[IO.File]::WriteAllText((Join-Path $taskDest 'novel-core.mjs'),$taskCore)
Write-Output 'Packaged optional DSH provider runtime for WebVideo+ '+$taskProductVersion

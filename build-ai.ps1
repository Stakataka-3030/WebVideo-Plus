$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskSource=Join-Path $taskRoot 'ai-runtime'
$taskDest=Join-Path $taskRoot 'package/ai-runtime'
if(-not(Test-Path (Join-Path $taskSource 'node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json'))){throw 'AI dependencies missing. Restore the fixed package-lock before building.'}
New-Item -ItemType Directory -Path $taskDest -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskSource 'node_modules') -Destination $taskDest -Recurse -Force
foreach($taskFile in @('worker.mjs','novel-prompt.txt','stage-prompt.txt','package.json','package-lock.json')){Copy-Item -LiteralPath (Join-Path $taskSource $taskFile) -Destination $taskDest -Force}
$taskNode=(Get-Command node -ErrorAction Stop).Source
Copy-Item -LiteralPath $taskNode -Destination (Join-Path $taskDest 'node.exe') -Force
$taskNodeLicense=Join-Path (Split-Path $taskNode -Parent) 'LICENSE'
if(Test-Path $taskNodeLicense){Copy-Item -LiteralPath $taskNodeLicense -Destination (Join-Path $taskDest 'LICENSE-Node.txt') -Force}
Copy-Item -LiteralPath (Join-Path $taskRoot 'ai-providers.factory.json') -Destination (Join-Path $taskDest 'providers.json') -Force
$taskCore=[IO.File]::ReadAllText((Join-Path $taskRoot 'browser/novel-core.js'))+[Environment]::NewLine+'export { WebVideoNovel };';[IO.File]::WriteAllText((Join-Path $taskDest 'novel-core.mjs'),$taskCore)
Write-Output 'Packaged optional DSH provider runtime'

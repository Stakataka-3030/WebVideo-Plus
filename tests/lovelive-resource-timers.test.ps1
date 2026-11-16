param([string]$ResourceChunk,[string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/lovelive-resource-timers'))
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -Path (Join-Path $repo 'src/LoveLiveResourceTimers.cs')
# Default CI mode is synthetic and offline. A real local chunk is an additional manual check.
if($ResourceChunk){$original=[IO.File]::ReadAllText($ResourceChunk)}else{
 $original=@'
const resourceYield=()=>new Promise(resolve=>setTimeout(resolve,16));
async function prepareFrameResources(){await resourceYield()}
const resourceRenderer={};
resourceRenderer.compileAsync=function(scene,camera,target=null){const programs=this.compile(scene,camera,target);return new Promise(resolve=>{function poll(){if(programs.forEach(function(program){programMap.get(program).currentProgram.isReady()&&programs.delete(program)}),programs.size===0){resolve(scene);return}setTimeout(poll,10)}extensions.get("KHR_parallel_shader_compile")!==null?poll():setTimeout(poll,10)})};
function unrelatedStoryTimer(callback){return setTimeout(callback,30)}
'@
}
$patched=[NativeVideo.LoveLiveResourceTimers]::Patch($original)
if($patched.Replace('globalThis.__webgalOfflineExportHost.scheduleResourceTask(', 'setTimeout(')-cne $original){throw 'Patch changed non-timer bytes'}
$expectedTimers=if($original.Contains('.scheduleAssetMount;')){2}else{3}
if(([regex]::Matches($patched,'globalThis\.__webgalOfflineExportHost\.scheduleResourceTask')).Count-ne $expectedTimers){throw 'Unexpected resource timer patch count'}
foreach($invalid in @($patched,$original.Replace(',16)',',17)'),$original.Replace('KHR_parallel_shader_compile','UNKNOWN_shader_compile'),($original+$original))){
 $failed=$false;try{[void][NativeVideo.LoveLiveResourceTimers]::Patch($invalid)}catch{$failed=$true};if(!$failed){throw 'Unsupported or repeated resource shape accepted'}
}
New-Item -ItemType Directory -Force -Path $OutputRoot |Out-Null
$root=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path (Join-Path $root 'assets') |Out-Null
$active=Join-Path $root 'assets/offscreen-character-active.js';$stale=Join-Path $root 'assets/offscreen-character-stale.js'
[IO.File]::WriteAllText($active,$original);[IO.File]::WriteAllText($stale,$original)
[IO.File]::WriteAllText(($active+'.gz'),'stale compressed copy')
[NativeVideo.LoveLiveResourceTimers]::Prepare($root,'assets/index.js','import("./offscreen-character-active.js")')
if([IO.File]::ReadAllText($active)-cne $patched -or [IO.File]::ReadAllText($stale)-cne $original){throw 'Actual import selection failed'}
if(Test-Path ($active+'.gz')){throw 'Stale compressed copy retained'}
foreach($main in @('import("./other.js")','import("./offscreen-character-active.js");import("./offscreen-character-stale.js")','import("../offscreen-character-active.js")')){
 $failed=$false;try{[NativeVideo.LoveLiveResourceTimers]::Prepare($root,'assets/index.js',$main)}catch{$failed=$true};if(!$failed){throw 'Ambiguous or unsafe import accepted'}
}
[IO.File]::WriteAllText((Join-Path $root 'patched.mjs'),$patched)
& node --check (Join-Path $root 'patched.mjs');if($LASTEXITCODE-ne 0){throw 'Patched module syntax invalid'}
& node (Join-Path $PSScriptRoot 'lovelive-resource-timers-contract.mjs') (Join-Path $root 'patched.mjs');if($LASTEXITCODE-ne 0){throw 'Resource timer runtime contract failed'}
if(-not $ResourceChunk){
 $hostYield='resolve=>{var host;const schedule=(host=globalThis.__webgalOfflineExportHost)==null?void 0:host.scheduleAssetMount;schedule?schedule(resolve):setTimeout(resolve,16)}'
 $hostOriginal=$original.Replace('resolve=>setTimeout(resolve,16)',$hostYield)
 $hostPatched=[NativeVideo.LoveLiveResourceTimers]::Patch($hostOriginal)
 if($hostPatched.Replace('globalThis.__webgalOfflineExportHost.scheduleResourceTask(', 'setTimeout(')-cne $hostOriginal){throw 'Host-yield patch changed unrelated bytes'}
 if(([regex]::Matches($hostPatched,'globalThis\.__webgalOfflineExportHost\.scheduleResourceTask')).Count-ne 2){throw 'Already-hosted yield must be preserved'}
 [IO.File]::WriteAllText((Join-Path $root 'host-patched.mjs'),$hostPatched)
 & node (Join-Path $PSScriptRoot 'lovelive-resource-timers-contract.mjs') (Join-Path $root 'host-patched.mjs');if($LASTEXITCODE-ne 0){throw 'Existing host yield runtime contract failed'}
}
Write-Output 'PASS production patch: resource-only timers, existing host yield, guards, actual import selection and runtime contracts'

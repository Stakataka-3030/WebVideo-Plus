// Fail early on an incomplete source handoff, before downloads or Windows compilation.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const requiredSourceFiles=[
 'src/RuntimeStartup.cs','src/EngineAdapter.cs','src/WebgalEngineProfile.cs','src/ProjectAssets.cs','prepare-build.ps1','build.ps1','version.json','native.manifest','verify-export-lifecycle.mjs',
 'scripts/prepare-build-inputs.ps1','scripts/build-common.ps1','scripts/prepare-webgal-runtime.mjs','scripts/import-legacy-bootstrap.ps1','scripts/verify-build-inputs.mjs','scripts/build-ai.ps1','scripts/build-ai-metadata.mjs',
 'build/dependencies.lock.json','build/runtime-patches.json','build/templates/component.json','build/templates/WebGAL.Video.exe.config',
 'README.md','LICENSE','LICENSES.md','NOTICE.md','CHANGELOG.md','docs/USER_GUIDE.md',
 'character-map.factory.json','ai-providers.factory.json','preset-effects.factory.json','filter-presets.factory.json','anogo-actions.factory.json',
 'bootstrap/process-guard.cs','launcher/TerreLauncher.cs',
 'ai-runtime/worker.mjs','ai-runtime/package.json','ai-runtime/package-lock.json','ai-runtime/novel-prompt.txt','ai-runtime/stage-prompt.txt',
 'browser/novel-core.js','browser/workload.js','browser/timeline.js','browser/render.js','browser/finish-timeline.js',
 'browser/navigation-metadata.js','browser/timeline-core.js','browser/filter-library.js','browser/navigation-model.js','craft/features/navigation-description.js',
 'vendor/js-yaml-4.1.1.min.js','vendor/js-yaml-LICENSE','craft/update/host-state.js','craft/update/client.js','craft/update/confirmation.js','craft/session/update-safety.mjs',
 'craft/version.json','craft/CraftStarter.cs','craft/CraftSetup.cs','craft/LICENSE-Node-22.20.0.txt','craft/build-craft-kernel.mjs','craft/build-craft-package.ps1','craft/verify-craft-package.ps1','craft/installer/ManifestVerifier.cs','craft/installer/SetupPaths.cs','craft/installer/ProductRouting.cs','craft/installer/SetupContracts.cs','craft/installer/transaction.mjs','craft/installer/build-receipt.mjs',
 'craft/update/InstallerObserver.cs','craft/update/OfficialInstallerLauncher.cs','craft/update/clean-coordinator.mjs','craft/update/clean-handoff.mjs','craft/update/minisign.mjs','craft/update/official-stage.mjs','craft/update/handoff.mjs','craft/update/handoff-state.mjs','craft/update/notify-result.ps1','craft/update/own-updates.mjs','craft/update/build-release-descriptor.mjs','craft/update/own-client.js','craft/launch-injected.mjs','craft/host-bridge.js','craft/update/observe-installer.ps1','craft/ui/actual-time.js','craft/ui/music-panel.js','craft/ui/music-panel.css'
];
export function checkSourceInputs(root){
 const missing=requiredSourceFiles.filter(name=>{try{return !fs.statSync(path.join(root,name)).isFile()||fs.statSync(path.join(root,name)).size===0;}catch{return true;}});
 for(const name of ['src','browser','licenses','docs','build','craft/session','craft/update','craft/features','craft/ui']){try{if(!fs.statSync(path.join(root,name)).isDirectory()||!fs.readdirSync(path.join(root,name)).length)missing.push(name+'/');}catch{missing.push(name+'/');}}
 if(missing.length)throw Error('Incomplete Craft build source inputs:\n'+missing.map(x=>' - '+x).join('\n'));
 return requiredSourceFiles.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');console.log(`Craft build source inputs verified: ${checkSourceInputs(root)} required files and source directories.`);}

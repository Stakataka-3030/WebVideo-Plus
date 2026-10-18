import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeBuildReceipt, verifyBuildReceipt, writeHelperBuildReceipt, verifyHelperBuildReceipt} from '../craft/installer/build-receipt.mjs';
const put = (root, name, value = 'inert fixture') => {const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, value);};
function fixture(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-build-receipt-'));
  try {
    for (const name of ['build.ps1','version.json','native.manifest','bootstrap/process-guard.cs','launcher/TerreLauncher.cs','craft/installer/build-receipt.mjs','character-map.factory.json','preset-effects.factory.json','ai-providers.factory.json','anogo-actions.factory.json','filter-presets.factory.json','src/Fixture.cs','package/Microsoft.Web.WebView2.Core.dll','package/Microsoft.Web.WebView2.WinForms.dll','package/WebView2Loader.dll','package/WebGAL.Video.exe','package/process-guard.exe','package/TerreLauncher.exe','craft/build-craft-package.ps1','craft/version.json','craft/CraftStarter.cs','craft/update/InstallerObserver.cs','craft/update/OfficialInstallerLauncher.cs','craft/installer/Craft.manifest','craft/installer/ManifestVerifier.cs','package/WebVideoCraft.Launcher.exe','package/CraftInstallerObserver.exe','package/CraftOfficialInstaller.exe']) put(root, name);
    writeBuildReceipt(root); writeHelperBuildReceipt(root); body(root);
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}
test('build receipt binds guard, launcher, source, loader and compilation script', () => {
  for (const name of ['bootstrap/process-guard.cs','package/process-guard.exe','launcher/TerreLauncher.cs','package/TerreLauncher.exe','src/Fixture.cs','package/WebView2Loader.dll','build.ps1']) fixture(root => {
    assert.equal(verifyBuildReceipt(root).schemaVersion, 2); fs.appendFileSync(path.join(root, name), 'drift'); assert.throws(() => verifyBuildReceipt(root), /compiled inputs changed/);
  });
});
test('auxiliary receipt binds each Craft helper output and its compilation inputs', () => {
  for (const name of ['craft/CraftStarter.cs','craft/update/InstallerObserver.cs','craft/update/OfficialInstallerLauncher.cs','package/WebVideoCraft.Launcher.exe','package/CraftInstallerObserver.exe','package/CraftOfficialInstaller.exe','craft/version.json','craft/build-craft-package.ps1']) fixture(root => {
    assert.equal(verifyHelperBuildReceipt(root).schemaVersion, 1); fs.appendFileSync(path.join(root, name), 'drift'); assert.throws(() => verifyHelperBuildReceipt(root), /compiled inputs changed/);
  });
});

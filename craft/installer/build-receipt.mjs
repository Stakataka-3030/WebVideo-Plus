// This build receipt binds compiled inputs and outputs. It is not a signature.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashes = (root, names) => Object.fromEntries([...new Set(names)].sort().map(name => [name, digest(path.join(root, name))]));
function sources(root) {
  return hashes(root, ['build.ps1', 'version.json', 'native.manifest', 'bootstrap/process-guard.cs', 'launcher/TerreLauncher.cs', 'craft/installer/build-receipt.mjs', ...(fs.existsSync(path.join(root, 'WebVideo+_icon.ico')) ? ['WebVideo+_icon.ico'] : []), 'character-map.factory.json', 'preset-effects.factory.json', 'ai-providers.factory.json', 'anogo-actions.factory.json', 'filter-presets.factory.json', ...fs.readdirSync(path.join(root, 'src')).filter(name => name.endsWith('.cs')).map(name => `src/${name}`)]);
}
function references(root) {return hashes(path.join(root, 'package'), ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll']);}
function outputs(root) {return hashes(path.join(root, 'package'), ['WebGAL.Video.exe', 'process-guard.exe', 'TerreLauncher.exe']);}
function helperSources(root) {return hashes(root, ['craft/build-craft-package.ps1', 'craft/installer/build-receipt.mjs', 'craft/version.json', 'craft/CraftStarter.cs', 'craft/update/InstallerObserver.cs', 'craft/update/OfficialInstallerLauncher.cs', 'craft/installer/Craft.manifest', 'craft/installer/ManifestVerifier.cs']);}
function helperOutputs(root) {return hashes(path.join(root, 'package'), ['WebVideoCraft.Launcher.exe', 'CraftInstallerObserver.exe', 'CraftOfficialInstaller.exe']);}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function writeBuildReceipt(root = sourceRoot) {
  const receipt = {schemaVersion: 2, sources: sources(root), references: references(root), outputs: outputs(root)};
  fs.copyFileSync(path.join(root, 'version.json'), path.join(root, 'package/version.json'));
  fs.writeFileSync(path.join(root, 'package/native-source-build.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
export function verifyBuildReceipt(root = sourceRoot) {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'package/native-source-build.json'), 'utf8'));
  if (receipt.schemaVersion !== 2 || !equal(receipt.sources, sources(root)) || !equal(receipt.references, references(root)) || !equal(receipt.outputs, outputs(root))) throw Error('Native kernel/helper or compiled inputs changed; run root build.ps1 successfully before Craft packaging');
  return receipt;
}
export function writeHelperBuildReceipt(root = sourceRoot) {
  verifyBuildReceipt(root);
  const receipt = {schemaVersion: 1, sources: helperSources(root), outputs: helperOutputs(root)};
  fs.writeFileSync(path.join(root, 'package/craft-native-build.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
export function verifyHelperBuildReceipt(root = sourceRoot) {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'package/craft-native-build.json'), 'utf8'));
  if (receipt.schemaVersion !== 1 || !equal(receipt.sources, helperSources(root)) || !equal(receipt.outputs, helperOutputs(root))) throw Error('Craft helper or compiled inputs changed; run craft/build-craft-package.ps1 before packaging');
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === '--write') writeBuildReceipt();
  else if (mode === '--write-helpers') writeHelperBuildReceipt();
  else throw Error('Use --write only after root native compilation, or --write-helpers after Craft helper compilation');
  console.log('Recorded native source, reference and output hashes.');
}

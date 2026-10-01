import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'package');
const output = path.join(root, 'dist', 'WebVideoCraft-Setup-1.1.2.0c');
const versions = { productVersion: '1.1.2c', installerVersion: '1.1.2.0c', kernelVersion: '0.6.46c' };
if (!fs.existsSync(path.join(source, 'WebGAL.Video.exe'))) throw Error('先在 package 中构建 WebVideo+ 1.1.2 内核');
const baseVersion = JSON.parse(fs.readFileSync(path.join(source, 'version.json'), 'utf8'));
if (baseVersion.productVersion !== '1.1.2' || baseVersion.kernelVersion !== '0.6.46') throw Error('Craft 包必须基于 WebVideo+ 1.1.2 / 0.6.46');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of [
  'WebGAL.Video.exe', 'WebGAL.Video.exe.config', 'Microsoft.Web.WebView2.Core.dll',
  'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'process-guard.exe',
  'WebVideoCraft.Launcher.exe',
  'browser', 'runtime', 'bin', 'LICENSE', 'LICENSES.md', 'NOTICE.md',
]) {
  fs.cpSync(path.join(source, name), path.join(output, name), { recursive: true });
}
fs.cpSync(path.join(source, 'ai-runtime', 'node.exe'), path.join(output, 'node.exe'));
fs.cpSync(path.join(here, 'LICENSE-Node-22.20.0.txt'), path.join(output, 'LICENSE-Node.txt'));
for (const name of ['inject-ui.js', 'launch-injected.mjs']) fs.cpSync(path.join(here, name), path.join(output, name));
fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify(versions, null, 2) + '\n');
const installScript = `param([string]$Destination=(Join-Path $env:LOCALAPPDATA 'WebVideoCraft\\1.1.2.0c'),[string]$CraftExe=(Join-Path $env:LOCALAPPDATA 'WebGAL Craft\\webgal-craft.exe'))
$ErrorActionPreference='Stop'
$source=$PSScriptRoot
$Destination=[IO.Path]::GetFullPath($Destination)
if($Destination.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw '安装目标不能位于安装包内'}
if(-not(Test-Path -LiteralPath $CraftExe)){throw 'Craft 原程序不存在'}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
foreach($name in @('WebGAL.Video.exe','WebGAL.Video.exe.config','WebVideoCraft.Launcher.exe','node.exe','LICENSE-Node.txt','inject-ui.js','launch-injected.mjs','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','process-guard.exe','browser','runtime','bin','LICENSE','LICENSES.md','NOTICE.md','version.json','MANIFEST.json')){
 Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $Destination $name) -Recurse -Force
}
[IO.File]::WriteAllText((Join-Path $Destination 'craft-path.txt'),[IO.Path]::GetFullPath($CraftExe))
Write-Output ('WebVideo+ Craft 1.1.2.0c 已安装：'+(Join-Path $Destination 'WebVideoCraft.Launcher.exe'))
`;
fs.writeFileSync(path.join(output, 'Setup-WebVideoCraft.ps1'), installScript);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name !== 'MANIFEST.json') {
      const bytes = fs.readFileSync(file);
      files.push({ path: path.relative(output, file).replaceAll('\\', '/'), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
walk(output);
files.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(path.join(output, 'MANIFEST.json'), JSON.stringify({ product: 'WebVideo+ Craft', version: versions.productVersion, installerVersion: versions.installerVersion, kernelVersion: versions.kernelVersion, files }, null, 2));
console.log(`${output}\n${files.length} files`);

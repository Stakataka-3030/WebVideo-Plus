// Run only after the final Craft Setup EXE has been built. Never changes source versions.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CRAFT_DESCRIPTOR_NAME, parseCraftVersion} from './own-updates.mjs';

export async function buildCraftReleaseDescriptor(installer, {versionsFile = new URL('../version.json', import.meta.url)} = {}) {
  const versions = JSON.parse(await fs.readFile(versionsFile, 'utf8'));
  const version = versions.installerVersion; parseCraftVersion(version);
  const file = path.resolve(installer), expected = `WebVideoCraft-Setup-${version}.exe`;
  if (path.basename(file) !== expected) throw Error('Installer filename does not match source installerVersion: ' + expected);
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > 1024 * 1024 * 1024) throw Error('Expected a regular, bounded final installer file');
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const after = await fs.lstat(file);
  if (!after.isFile() || after.isSymbolicLink() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw Error('Installer changed while calculating the release descriptor');
  const installerSha256 = hash.digest('hex');
  const descriptor = {schemaVersion:1,product:'craft',channel:'stable',platform:'windows',architecture:'x64',version,tag:'craft-v'+version,assets:[{name:expected,sha256:installerSha256,size:after.size}]};
  const bytes = Buffer.from(JSON.stringify(descriptor, null, 2) + '\n');
  const descriptorPath = path.join(path.dirname(file), CRAFT_DESCRIPTOR_NAME);
  // Stage beside the output, so failure cannot leave a partial descriptor.
  const temporary = descriptorPath + '.tmp-' + crypto.randomUUID();
  try { await fs.writeFile(temporary, bytes, {flag:'wx'}); await fs.rename(temporary, descriptorPath); }
  finally { await fs.rm(temporary, {force:true}); }
  return {descriptorPath,descriptorSha256:crypto.createHash('sha256').update(bytes).digest('hex'),installerSha256,installerSize:after.size,releaseTag:descriptor.tag,bodyMarker:'<!-- webvideo-compat: {"product":"craft","webgal":["4.6.4","4.6.5"]} -->'};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw Error('Usage: node craft/update/build-release-descriptor.mjs <final WebVideoCraft-Setup-N.N.N.Nc.exe>');
  console.log(JSON.stringify(await buildCraftReleaseDescriptor(process.argv[2]), null, 2));
}

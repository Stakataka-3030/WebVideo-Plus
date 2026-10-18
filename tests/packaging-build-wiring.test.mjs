import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyGeneratedAssets} from '../scripts/verify-generated-assets.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
test('tracked generated output is reproducible without writing browser sources', () => {
  const names = ['browser/navigation-metadata.js', 'browser/filter-helpers.js', 'browser/batch-filter-panel.js'];
  const before = names.map(read);
  assert.deepEqual(verifyGeneratedAssets(root), {filterOutputs: 2, navigationOutput: 1});
  assert.deepEqual(names.map(read), before);
});
test('importing the navigation generator for a normal build does not write tracked source', async () => {
  const file = path.join(root, 'browser/navigation-metadata.js');
  const before = {bytes: fs.readFileSync(file), mtime: fs.statSync(file).mtimeMs};
  await import('../scripts/build-navigation-metadata.mjs');
  assert.deepEqual(fs.readFileSync(file), before.bytes);
  assert.equal(fs.statSync(file).mtimeMs, before.mtime);
});
test('packaging checks run before discovery manifests and on final EXE bytes', () => {
  const craft = fs.existsSync(path.join(root, 'craft/version.json'));
  const manifest = read(craft ? 'manifest.mjs' : 'scripts/manifest.mjs');
  assert.ok(manifest.indexOf('verifyPackageMaterials(root,here)') < manifest.indexOf('walk(root);'));
  const builder = read(craft ? 'craft/build-craft-package.ps1' : 'build-product.ps1');
  assert.ok(builder.includes('verify-installer-materials.mjs'));
  const feature = read(craft ? 'build-feature-assets.mjs' : 'scripts/build-feature-assets.mjs');
  assert.ok(feature.includes('verifyGeneratedAssets(root)'));
  assert.ok(!feature.includes("fs.writeFileSync(path.join(root,'browser/batch-filter-panel.js')"));
});
test('CI covers the three named maintenance branches and Craft full assembly when applicable', () => {
  const workflow = read('.github/workflows/native-smoke.yml').replaceAll('\\', '/');
  for (const branch of ['release/1.1.8-final-464', 'release/1.3.2-terre-466', 'release/craft-1.1.15c']) assert.ok(workflow.includes(branch), branch);
  if (fs.existsSync(path.join(root, 'craft/version.json'))) {
    assert.ok(workflow.includes('./scripts/build-ai.ps1'));
    assert.ok(workflow.includes('./craft/build-craft-package.ps1'));
    assert.ok(workflow.includes('verify-installer-materials.mjs'));
    assert.ok(!workflow.includes('0.4.10.2'));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
test('current Craft identifiers agree across product, installer, PE metadata and current documentation', () => {
 const v = JSON.parse(read('craft/version.json')), base = JSON.parse(read('version.json'));
 assert.equal(v.productVersion, '1.1.11c'); assert.equal(v.installerVersion, '1.1.11.0c'); assert.equal(v.fileVersion, '1.1.11.0');
 assert.equal(v.kernelVersion, '0.6.52'); assert.equal(v.baseKernelVersion, base.kernelVersion); assert.equal(v.kernelVersion, base.kernelVersion); assert.equal(v.baseProductVersion, base.productVersion);
 for (const file of ['craft/CraftStarter.cs', 'craft/CraftSetup.cs']) {
  const source = read(file);
  for (const [field, value] of [['AssemblyVersion', v.fileVersion], ['AssemblyFileVersion', v.fileVersion], ['AssemblyInformationalVersion', v.installerVersion]])
   assert.equal(source.match(new RegExp(field + '\\("([^"\\n]+)"\\)'))?.[1], value, file + ': ' + field);
 }
 for (const file of ['README.md', 'BUILDING.md', 'docs/BUILDING.md', 'docs/USER_GUIDE.md', 'craft/README.md']) {
  const current = read(file).split(/\r?\n/).find(line => line.includes('Craft ' + v.productVersion) || line.includes('Craft 产品版本为 ' + v.productVersion));
  assert.ok(current, file); assert.ok(current.includes(v.installerVersion), file); assert.ok(current.includes(v.kernelVersion), file);
 }
 assert.equal(v.officialAutoInstallEnabled, true); assert.equal(v.updateObserverValidated, false); assert.equal(v.sameNameUpdateValidated, false); assert.equal(v.officialCleanUpdateValidated, false);
});

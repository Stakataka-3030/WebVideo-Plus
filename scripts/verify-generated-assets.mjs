import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ownRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const same = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
export function verifyGeneratedAssets(root = ownRoot) {
  const source = fs.readFileSync(path.join(root, 'browser/batch-filter.js'), 'utf8');
  const split = source.indexOf('function WebVideoBatchFilterPanel');
  if (split < 0) throw Error('Filter split generation anchor missing');
  for (const [name, expected] of [['filter-helpers.js', source.slice(0, split)], ['batch-filter-panel.js', source.slice(split)]]) {
    if (!same(fs.readFileSync(path.join(root, 'browser', name), 'utf8'), expected)) throw Error(`Generated filter output differs: browser/${name}`);
  }
  const work = path.join(root, '.build');
  fs.mkdirSync(work, {recursive: true});
  if (fs.lstatSync(work).isSymbolicLink()) throw Error('Generated-asset work directory cannot be linked');
  const temporary = fs.mkdtempSync(path.join(work, 'generated-assets-'));
  try {
    fs.mkdirSync(path.join(temporary, 'scripts'));
    fs.mkdirSync(path.join(temporary, 'browser'));
    fs.cpSync(path.join(root, 'baseline'), path.join(temporary, 'baseline'), {recursive: true});
    for (const name of ['character-map.factory.json', 'filter-presets.factory.json', 'preset-effects.factory.json']) fs.copyFileSync(path.join(root, name), path.join(temporary, name));
    fs.copyFileSync(path.join(root, 'scripts/build-navigation-metadata.mjs'), path.join(temporary, 'scripts/build-navigation-metadata.mjs'));
    const result = spawnSync(process.execPath, [path.join(temporary, 'scripts/build-navigation-metadata.mjs')], {encoding: 'utf8', windowsHide: true});
    if (result.status !== 0) throw Error(`Navigation generator failed: ${result.stderr || result.stdout}`);
    if (!same(fs.readFileSync(path.join(root, 'browser/navigation-metadata.js'), 'utf8'), fs.readFileSync(path.join(temporary, 'browser/navigation-metadata.js'), 'utf8'))) throw Error('Generated navigation metadata differs; explicitly regenerate it before building');
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
  return {filterOutputs: 2, navigationOutput: 1};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Generated assets verified without modifying tracked source: ${JSON.stringify(verifyGeneratedAssets())}`);

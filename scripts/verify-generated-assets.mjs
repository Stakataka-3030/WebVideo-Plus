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
  const generator=path.join(root,'scripts/build-navigation-metadata.mjs');
  const result=spawnSync(process.execPath,[generator,'--check'],{encoding:'utf8',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(result.stderr||result.stdout||'Navigation metadata verification failed');
  return {filterOutputs: 2, navigationOutput: 1};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Generated assets verified without modifying tracked source: ${JSON.stringify(verifyGeneratedAssets())}`);

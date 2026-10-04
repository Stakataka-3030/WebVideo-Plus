// Reuse the inert same-name verifier fixture, then install a separate custom
// external adapter. Neither fixture executes a host, launcher, COM or registry.
import './craft-native-verifier-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {install} from '../craft/installer/transaction.mjs';
const home=path.resolve(process.argv[2]);
const craftExe=path.join(home,'custom-external-host','webgal-craft.exe');
fs.mkdirSync(path.dirname(craftExe));
fs.writeFileSync(craftExe,'inert official host');
install({packageRoot:path.join(home,'payload'),adapterRoot:path.join(home,'custom-external-adapter'),craftExe,mode:'external',processCheck:()=>false});
// Two independently owned external adapters are legal hints; discovery must
// return both rather than silently deciding which custom install to update.
install({packageRoot:path.join(home,'payload'),adapterRoot:path.join(home,'custom-external-adapter-two'),craftExe,mode:'external',processCheck:()=>false});

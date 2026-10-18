// Explicit compatibility entry; importing it during a build never writes source.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeNavigationMetadata} from './scripts/build-navigation-metadata.mjs';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))writeNavigationMetadata();

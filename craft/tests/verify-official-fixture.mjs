// Explicit read-only validation of previously downloaded public official files.
// Does not download or execute the installer and does not enable native gates.
import fs from 'node:fs';import crypto from 'node:crypto';
import {verifyMinisign} from '../update/minisign.mjs';
import {officialPlatform,OFFICIAL_PUBLIC_KEY,assertSignedInstallerIdentity} from '../update/official-stage.mjs';
const [metadataFile,installerFile]=process.argv.slice(2);if(!metadataFile||!installerFile)throw Error('Usage: node verify-official-fixture.mjs metadata.json official-installer.exe');
const metadata=officialPlatform(JSON.parse(fs.readFileSync(metadataFile,'utf8'))),bytes=fs.readFileSync(installerFile),result=verifyMinisign(bytes,metadata.signature,OFFICIAL_PUBLIC_KEY);assertSignedInstallerIdentity(result,metadata.version);
const changed=Buffer.from(bytes);changed[changed.length-1]^=1;let rejected=false;try{verifyMinisign(changed,metadata.signature,OFFICIAL_PUBLIC_KEY);}catch{rejected=true;}if(!rejected)throw Error('Modified installer signature was accepted');
console.log(JSON.stringify({signatureVerified:true,modifiedBytesRejected:true,nativeExecuted:false,officialUpdateGatesEnabled:false,version:metadata.version,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),...result},null,2));

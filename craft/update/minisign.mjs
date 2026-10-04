import crypto from 'node:crypto';
// Format/verification follows minisign-verify 0.2.5, used by the pinned official
// Tauri updater: key ID, Ed/ED data signature, then trusted-comment signature.
// https://github.com/jedisct1/rust-minisign-verify/blob/0.2.5/src/lib.rs
function base64(value){
 if(typeof value!=='string'||!value||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid Minisign base64');
 const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value)throw Error('Noncanonical Minisign base64');return bytes;
}
function text(encoded){return new TextDecoder('utf-8',{fatal:true}).decode(base64(encoded));}
function lines(value){return value.replace(/\r\n/g,'\n').split('\n');}
export function verifyMinisign(bytes,signatureEncoded,keyEncoded){
 const keyLines=lines(text(keyEncoded)),sigLines=lines(text(signatureEncoded));
 if(keyLines.length<2||sigLines.length<4||!sigLines[2].startsWith('trusted comment: '))throw Error('Invalid Minisign envelope');
 const key=base64(keyLines[1]),signature=base64(sigLines[1]),commentSignature=base64(sigLines[3]);
 if(key.length!==42||signature.length!==74||commentSignature.length!==64)throw Error('Invalid Minisign lengths');
 if(!['Ed','ED'].includes(key.subarray(0,2).toString('latin1')))throw Error('Unsupported Minisign public key algorithm');
 const algorithm=signature.subarray(0,2).toString('latin1');if(!['Ed','ED'].includes(algorithm))throw Error('Unsupported Minisign signature algorithm');
 if(!crypto.timingSafeEqual(key.subarray(2,10),signature.subarray(2,10)))throw Error('Minisign key ID mismatch');
 const publicKey=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key.subarray(10)]),format:'der',type:'spki'});
 const payload=algorithm==='ED'?crypto.createHash('blake2b512').update(bytes).digest():bytes;
 if(!crypto.verify(null,payload,publicKey,signature.subarray(10)))throw Error('Official installer signature mismatch');
 const trustedComment=sigLines[2].slice(17);
 if(!crypto.verify(null,Buffer.concat([signature.subarray(10),Buffer.from(trustedComment,'utf8')]),publicKey,commentSignature))throw Error('Minisign trusted comment signature mismatch');
 return {algorithm,keyId:key.subarray(2,10).toString('hex'),trustedComment};
}

// Static PE-embedded ZIP inspection: no assembly loading and no installer entrypoint.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {verifyPackageMaterials} from './verify-materials.mjs';
import {expandGroupedEntries} from './grouped-payload.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const table = Array.from({length: 256}, (_, n) => {for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0;});
function crc32(bytes) {let value = 0xffffffff; for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0;}
export function readEmbeddedZip(bytes) {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let end = bytes.lastIndexOf(signature);
  if (end < 0 || end + 22 > bytes.length) throw Error('Embedded ZIP end record missing');
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw Error('Multi-disk ZIP is not supported');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), offset = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw Error('ZIP64 installer payload needs an explicit verifier update');
  const start = end - size - offset;
  if (start < 0 || bytes.readUInt32LE(start) !== 0x04034b50) throw Error('Embedded ZIP start mismatch');
  const entries = new Map(); let cursor = start + offset;
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw Error('ZIP central directory mismatch');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), uncompressed = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), local = start + bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8').replaceAll('\\', '/');
    cursor += 46 + nameSize + extra + comment;
    if (flags & 1 || name.startsWith('/') || name.includes(':') || name.split('/').some(p => p === '..' || p === '.')) throw Error(`Unsafe/encrypted ZIP path: ${name}`);
    if (name.endsWith('/')) continue;
    if (!name || entries.has(name.toLowerCase())) throw Error(`Duplicate ZIP path: ${name}`);
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw Error(`ZIP local header mismatch: ${name}`);
    const dataStart = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (dataStart + compressed > start + offset) throw Error(`ZIP data outside payload: ${name}`);
    const input = bytes.subarray(dataStart, dataStart + compressed);
    const data = method === 0 ? input : method === 8 ? zlib.inflateRawSync(input) : null;
    if (!data || data.length !== uncompressed || crc32(data) !== crc) throw Error(`ZIP size/CRC mismatch: ${name}`);
    entries.set(name.toLowerCase(), {name, data});
  }
  if (cursor !== end) throw Error('ZIP central directory size mismatch');
  return entries;
}
export function verifyInstallerMaterials(installer, sourceRoot = root) {
  const bytes = fs.readFileSync(installer), entries = readEmbeddedZip(bytes);
  const candidates = [...entries.values()].filter(x => /^[^/]+\/MANIFEST\.json$/.test(x.name));
  if (candidates.length !== 1) throw Error('Installer must contain one root package manifest');
  const entry = candidates[0], prefix = entry.name.slice(0, -'MANIFEST.json'.length), manifest = JSON.parse(entry.data.toString('utf8'));
  if(entries.has((prefix+'GROUPS.json').toLowerCase())){
    const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'webvideo-grouped-materials-'));
    try{const expanded=expandGroupedEntries(entries,prefix,manifest,sourceRoot,temporary);const result=verifyPackageMaterials(expanded,sourceRoot);return {...result,version:manifest.version,installerSha256:digest(bytes),payloadFiles:manifest.files.length+1,grouped:true};}
    finally{fs.rmSync(temporary,{recursive:true,force:true});}
  }
  const expected = new Map(manifest.files.map(x => [x.path, x]));
  if (expected.size !== manifest.files.length || entries.size !== expected.size + 1) throw Error('Installer manifest closure mismatch');
  for (const {name, data} of entries.values()) {
    if (!name.startsWith(prefix)) throw Error(`Unexpected installer root: ${name}`);
    const relative = name.slice(prefix.length); if (relative === 'MANIFEST.json') continue;
    const record = expected.get(relative);
    if (!record || record.bytes !== data.length || record.sha256 !== digest(data)) throw Error(`Installer manifest bytes mismatch: ${relative}`);
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-installer-materials-'));
  try {
    for (const {name, data} of entries.values()) {const target = path.join(temporary, ...name.slice(prefix.length).split('/')); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, data);}
    const result = verifyPackageMaterials(temporary, sourceRoot);
    return {...result, version: manifest.version, installerSha256: digest(bytes), payloadFiles: expected.size + 1};
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('Usage: node scripts/verify-installer-materials.mjs <installer.exe>');
  console.log(`Static installer material verification: ${JSON.stringify(verifyInstallerMaterials(path.resolve(process.argv[2])))}`);
}

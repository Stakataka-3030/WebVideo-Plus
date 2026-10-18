import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {verifyMaterialFiles, verifyPackageMaterials} from '../scripts/verify-materials.mjs';
import {readEmbeddedZip} from '../scripts/verify-installer-materials.mjs';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const put = (root, name, value = 'fixture') => {const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, value);};
function fixture(body) {const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-admission-')); try {body(root);} finally {fs.rmSync(root, {recursive: true, force: true});}}
const policy = {media: [], inlineMedia: [], dependencyLicenses: ['MIT']};

test('game/Core/cache material and unknown binaries fail before manifest admission', () => {
  for (const name of ['actors/model.moc3', 'lib/live2dcubismcore.min.js', 'game/scene/start.txt', 'cache/result.json', 'bin/foreign.exe', 'assets/game.zip']) fixture(root => {
    put(root, name, 'INERT AUDIT SENTINEL; NOT A MODEL');
    assert.throws(() => verifyMaterialFiles(root, policy), /Unapproved/);
  });
});
test('media registration requires exact approved bytes; API schema models remain allowed', () => fixture(root => {
  put(root, 'browser/assets/logo.png', 'original'); put(root, 'ai-runtime/node_modules/sdk/models/types.js', 'export {};');
  const admitted = {...policy, media: [{path: 'browser/assets/logo.png', sha256: hash('original')}]};
  assert.equal(verifyMaterialFiles(root, admitted).media, 1);
  put(root, 'browser/assets/logo.png', 'different');
  assert.throws(() => verifyMaterialFiles(root, admitted), /changed media/);
}));
test('unregistered static inline image is rejected', () => fixture(root => {
  put(root, 'browser/runtime.js', 'const image="data:image/png;base64,' + Buffer.from('inert media fixture').toString('base64') + '";');
  assert.throws(() => verifyMaterialFiles(root, policy), /inline media/);
}));
test('a regenerated manifest cannot bless a missing license or changed dependency', () => fixture(root => {
  const source = path.join(root, 'source'), pkg = path.join(root, 'package');
  put(source, 'build/material-policy.json', JSON.stringify(policy));
  put(source, 'build/third-party-notices.json', JSON.stringify({files: [{path: 'licenses/author.txt', sha256: hash('Author MIT notice')}]}));
  put(source, 'build/dependencies.lock.json', JSON.stringify({stagedFiles: {}}));
  put(pkg, 'licenses/author.txt', 'Author MIT notice');
  for (const name of ['LICENSE', 'LICENSES.md', 'NOTICE.md', 'ai-runtime/LICENSE-Node.txt']) put(pkg, name);
  put(pkg, 'ai-runtime/package-lock.json', JSON.stringify({packages: {'': {}, 'node_modules/sdk': {version: '1.0.0', license: 'MIT'}}}));
  put(pkg, 'ai-runtime/node_modules/sdk/package.json', JSON.stringify({version: '1.0.0', license: 'MIT'}));
  put(pkg, 'ai-runtime/node_modules/sdk/LICENSE', fs.readFileSync(new URL('../vendor/js-yaml-LICENSE', import.meta.url)));
  assert.equal(verifyPackageMaterials(pkg, source).supplementalNotices, 1);
  fs.unlinkSync(path.join(pkg, 'licenses/author.txt'));
  assert.throws(() => verifyPackageMaterials(pkg, source), /notice missing/);
  put(pkg, 'licenses/author.txt', 'Author MIT notice');
  put(pkg, 'ai-runtime/node_modules/sdk/package.json', JSON.stringify({version: '2.0.0', license: 'MIT'}));
  assert.throws(() => verifyPackageMaterials(pkg, source), /differs from lock/);
}));

// ZIP fixture builder is independent of the product parser; deflate/CRC/path
// failures exercise the actual static final-EXE reader without any executable.
const crcTable = Array.from({length: 256}, (_, n) => {for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0;});
function crc(bytes) {let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ c >>> 8; return (c ^ 0xffffffff) >>> 0;}
function fakeExe(items) {
  const locals = [], central = []; let offset = 0;
  for (const [name, value] of items) {
    const bytes = Buffer.from(value), compressed = zlib.deflateRawSync(bytes), filename = Buffer.from(name), header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt32LE(crc(bytes), 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10); directory.writeUInt32LE(crc(bytes), 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    locals.push(header, filename, compressed); central.push(directory, filename); offset += header.length + filename.length + compressed.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(items.length, 8); end.writeUInt16LE(items.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.alloc(150, 0x4d), ...locals, cd, end, Buffer.alloc(80000)]);
}
test('static installer reader locates embedded ZIP beyond the usual 64KB tail', () => {
  const files = readEmbeddedZip(fakeExe([['package/LICENSE', 'MIT notice'], ['package/MANIFEST.json', '{}']]));
  assert.equal(files.get('package/license').data.toString(), 'MIT notice');
});
test('static installer reader rejects duplicate and escaping paths and corrupted bytes', () => {
  assert.throws(() => readEmbeddedZip(fakeExe([['package/a', 'a'], ['package/A', 'b']])), /Duplicate/);
  assert.throws(() => readEmbeddedZip(fakeExe([['package/../outside', 'a']])), /Unsafe/);
  const bytes = fakeExe([['package/one', 'a']]); const marker = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); bytes.writeUInt32LE(0, marker + 16);
  assert.throws(() => readEmbeddedZip(bytes), /CRC/);
});

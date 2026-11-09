import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { LIMITS, lockedMirrorTarballs, assertEligibleMirrorFailure, verifyIntegrity, downloadLockedTarball, seedCache, runNpm, npmCliPath, main } from '../scripts/seed-ci-npm-cache.mjs';

const sri = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const bytes = Buffer.from('unit fixture only');
const pkg = (name = 'zod', version = '4.6.4', integrity = sri(bytes)) => ({ version, resolved: `https://registry.npmmirror.com/${name}/-/${name.split('/').at(-1)}-${version}.tgz`, integrity });
const lock = (name = 'zod', entry = pkg(name)) => ({ lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' }, [`node_modules/${name}`]: entry } });
const selected = () => lockedMirrorTarballs(lock())[0];
const temporary = () => fs.mkdtemp(path.join(os.tmpdir(), 'webvideo-npm-cache-test-'));

test('real AI lock has canonical public mirror identities and locked SHA-512', async () => {
  const actual = JSON.parse(await fs.readFile(new URL('../ai-runtime/package-lock.json', import.meta.url), 'utf8'));
  const entries = lockedMirrorTarballs(actual);
  assert.equal(entries.length, new Set(Object.values(actual.packages).map(entry => entry.resolved).filter(Boolean)).size);
  assert.ok(entries.length > 100);
  assert.ok(entries.every(entry => entry.official === entry.resolved.replace('https://registry.npmmirror.com/', 'https://registry.npmjs.org/')));
});

test('scoped and nested packages retain exact name, version, path and integrity', () => {
  const entry = pkg('@deepseek-ai/dsh-llm', '0.1.5-rc.1');
  const input = { lockfileVersion: 3, packages: { 'node_modules/a/node_modules/@deepseek-ai/dsh-llm': entry } };
  assert.deepEqual(lockedMirrorTarballs(input)[0], { name: '@deepseek-ai/dsh-llm', ...entry, official: 'https://registry.npmjs.org/@deepseek-ai/dsh-llm/-/dsh-llm-0.1.5-rc.1.tgz' });
});

test('untrusted registries are not rewritten, even hostname suffixes', () => {
  for (const resolved of ['https://registry.npmmirror.com.evil.test/zod/-/zod-4.6.4.tgz', 'https://example.test/zod/-/zod-4.6.4.tgz', 'https://registry.npmjs.org/zod/-/zod-4.6.4.tgz']) {
    assert.throws(() => lockedMirrorTarballs(lock('zod', { ...pkg(), resolved })), /count/);
  }
});

test('rejects credentials, ports, redirects encoded as paths, query, fragment and URL normalization tricks', () => {
  for (const resolved of ['http://registry.npmmirror.com/zod/-/zod-4.6.4.tgz', 'https://user:secret@registry.npmmirror.com/zod/-/zod-4.6.4.tgz', 'https://registry.npmmirror.com:443/zod/-/zod-4.6.4.tgz', pkg().resolved + '?token=secret', pkg().resolved + '#fragment', 'https://registry.npmmirror.com/other/../zod/-/zod-4.6.4.tgz', 'https://registry.npmmirror.com/zod/-/zod-4.6.5.tgz']) {
    assert.throws(() => lockedMirrorTarballs(lock('zod', { ...pkg(), resolved })), /path/);
  }
});

test('rejects aliases, unpinned versions, weak or noncanonical integrity and conflicting locks', () => {
  for (const change of [{ name: 'another' }, { version: '^4.6.4' }, { integrity: 'sha1-abc' }, { integrity: sri(bytes) + ' sha512-other' }, { integrity: sri(bytes).slice(0, -3) + 'B==' }]) {
    assert.throws(() => lockedMirrorTarballs(lock('zod', { ...pkg(), ...change })));
  }
  const input = lock();
  input.packages['node_modules/parent/node_modules/zod'] = pkg('zod', '4.6.4', sri(Buffer.from('different')));
  assert.throws(() => lockedMirrorTarballs(input), /Conflicting/);
});

test('fallback triggers only for a locked public mirror HTTP 429/5xx, never integrity/auth/lock failures', () => {
  const log = `npm error code E500\nnpm error 500 Internal Server Error - GET ${pkg().resolved} - unavailable`;
  assert.doesNotThrow(() => assertEligibleMirrorFailure(log, [selected()]));
  for (const invalid of [log + '\nnpm error code EINTEGRITY', log + '\nnpm error code E401', log + '\nnpm error code EOTP', log + '\nnpm error code ENOTFOUND', log + '\nnpm error code ERESOLVE', log + '\nnpm error 404 Not Found - GET https://private.example.test/p/-/p-1.0.0.tgz - missing', log.replace('500 Internal', '404 Not Found'), log.replace('zod-4.6.4', 'zod-4.6.5'), log.replace('registry.npmmirror.com', 'private.example.test'), 'npm error ENOENT']) {
    assert.throws(() => assertEligibleMirrorFailure(invalid, [selected()]));
  }
});

test('official downloads disallow redirects and verify locked SRI before returning bytes', async () => {
  const result = await downloadLockedTarball(selected(), { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://registry.npmjs.org/zod/-/zod-4.6.4.tgz');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
  } });
  assert.deepEqual(result, bytes);
  assert.throws(() => verifyIntegrity(Buffer.from('tampered'), sri(bytes)), /integrity/);
});

test('HTTP failures, missing/truncated/oversized bodies and total limits fail closed', async () => {
  const scenarios = [new Response('server error', { status: 500 }), new Response(bytes, { headers: { 'content-length': '9999999999' } }), new Response(bytes, { headers: { 'content-length': '2' } }), new Response(''), new Response(bytes)];
  for (let index = 0; index < scenarios.length; index++) {
    await assert.rejects(downloadLockedTarball(selected(), { fetchImpl: async () => scenarios[index], limits: { ...LIMITS, bytes: index === 4 ? 2 : LIMITS.bytes } }));
  }
  await assert.rejects(downloadLockedTarball(selected(), { fetchImpl: async () => new Response(bytes), charge: () => { throw new Error('total limit'); } }), /total limit/);
});

test('any failed official SRI prevents every npm cache import', async () => {
  let calls = 0; let fetched = 0;
  await assert.rejects(seedCache([selected(), selected()], { directory: await temporary(), cache: 'unused', fetchImpl: async () => new Response(++fetched === 1 ? bytes : 'tampered'), importFiles: async () => { calls++; } }), /integrity/);
  assert.equal(calls, 0);
});

test('aggregate streamed bytes and package count are independently bounded', async () => {
  let imports = 0;
  await assert.rejects(seedCache([selected(), selected()], {
    directory: await temporary(), cache: 'unused', limits: { ...LIMITS, totalBytes: bytes.length + 1 },
    fetchImpl: async () => new Response(bytes), importFiles: async () => { imports++; },
  }), /total download limit/);
  assert.equal(imports, 0);
  const input = { lockfileVersion: 3, packages: {} };
  for (let index = 0; index <= LIMITS.packages; index++) input.packages[`node_modules/package-${index}`] = pkg(`package-${index}`, '1.0.0');
  assert.throws(() => lockedMirrorTarballs(input), /count/);
});

test('bounded download concurrency and imports use only verified staged tarballs', async () => {
  let active = 0; let maxActive = 0; const imported = [];
  const result = await seedCache(Array.from({ length: 9 }, selected), {
    directory: await temporary(), cache: 'unused', limits: { ...LIMITS, concurrency: 2 },
    fetchImpl: async () => { active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return new Response(bytes); },
    importFiles: async batch => { assert.ok(batch.length <= 8); for (const file of batch) { assert.deepEqual(await fs.readFile(file), bytes); imported.push(file); } },
  });
  assert.equal(maxActive, 2); assert.equal(imported.length, 9); assert.equal(result.bytes, bytes.length * 9);
});

test('CLI refuses local/non-disposable execution before reading or writing files', async () => {
  await assert.rejects(main(['nonexistent-lock', 'nonexistent-log'], { GITHUB_ACTIONS: 'false' }), /restricted/);
});

// Tiny self-authored npm tarball. No external package, server, npm config or lifecycle execution.
function tarball(files) {
  const chunks = [];
  for (const [name, text] of Object.entries(files)) {
    const content = Buffer.from(text); const header = Buffer.alloc(512);
    header.write(`package/${name}`); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
    header.write([...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

test('real npm ci offline consumes verified cache with unchanged mirror lock and runs no scripts', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  await fs.access(npmCliPath());
  const directory = await temporary(); const cache = path.join(directory, 'cache'); const project = path.join(directory, 'project');
  await fs.mkdir(project);
  const name = 'webvideo-ci-cache-fixture'; const version = '1.0.0';
  const markerScript = "node -e \"require('fs').writeFileSync('LIFECYCLE-RAN','unexpected')\"";
  const archive = tarball({ 'package.json': JSON.stringify({ name, version, scripts: { postinstall: markerScript } }), 'index.js': 'module.exports = 42;\n' });
  const input = lock(name, pkg(name, version, sri(archive)));
  input.packages[`node_modules/${name}`].hasInstallScript = true;
  input.packages[''] = { name: 'offline-consumer', version, dependencies: { [name]: version } };
  const original = Buffer.from(JSON.stringify(input, null, 2));
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ ...input.packages[''], scripts: { postinstall: markerScript } }));
  await fs.writeFile(path.join(project, 'package-lock.json'), original);
  await seedCache(lockedMirrorTarballs(input), { directory: path.join(directory, 'tarballs'), cache, fetchImpl: async url => {
    assert.equal(url, `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`);
    return new Response(archive);
  } });
  await runNpm(['ci', '--offline', '--legacy-peer-deps'], { cwd: project, cache });
  assert.deepEqual(await fs.readFile(path.join(project, 'package-lock.json')), original);
  assert.equal(await fs.readFile(path.join(project, 'node_modules', name, 'index.js'), 'utf8'), 'module.exports = 42;\n');
  for (const marker of [path.join(project, 'LIFECYCLE-RAN'), path.join(project, 'node_modules', name, 'LIFECYCLE-RAN')]) await assert.rejects(fs.access(marker), { code: 'ENOENT' });
  t.diagnostic(`Isolated offline fixture preserved: ${directory}`);
});

test('CI keeps npm ci flags and recovery is restricted to step-local cache settings', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/native-smoke.yml', import.meta.url), 'utf8');
  const step = workflow.split('- name: Restore locked AI dependencies without lifecycle scripts')[1].split('\n      - name:')[0];
  assert.equal((step.match(/npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund/g) || []).length, 2);
  assert.match(step, /npm_config_cache: \$\{\{ runner.temp \}\}\/webvideo-ai-npm-cache/);
  assert.match(step, /if \(\$LASTEXITCODE -ne 0\).*\{/s);
  assert.match(step, /node \.\.\/scripts\/seed-ci-npm-cache\.mjs package-lock\.json \$failureLog/);
  assert.doesNotMatch(step, /npm config|--registry|Set-Content.*package-lock/);
});

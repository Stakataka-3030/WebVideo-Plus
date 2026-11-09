// CI-only recovery of locked public npmmirror tarballs. Never edits a lock or npm config.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const mirror = 'https://registry.npmmirror.com';
const official = 'https://registry.npmjs.org';
export const LIMITS = Object.freeze({ packages: 512, concurrency: 4, bytes: 32 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, timeoutMs: 30000 });

export function lockedMirrorTarballs(lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== 'object') throw new Error('Expected package-lock v3 packages');
  const selected = new Map();
  for (const [location, pkg] of Object.entries(lock.packages)) {
    if (!location || !pkg.resolved) continue;
    let url;
    try { url = new URL(pkg.resolved); } catch { throw new Error('Invalid locked package URL'); }
    if (url.hostname !== 'registry.npmmirror.com') continue;
    const name = /(?:^|\/)node_modules\/((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)$/.exec(location)?.[1];
    if (!name || (pkg.name && pkg.name !== name) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error('Unsupported locked package identity');
    const pathname = `/${name}/-/${name.split('/').at(-1)}-${pkg.version}.tgz`;
    if (pkg.resolved !== mirror + pathname) throw new Error('Mirror tarball path does not match locked package/version');
    if (typeof pkg.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(pkg.integrity) || Buffer.from(pkg.integrity.slice(7), 'base64').toString('base64') !== pkg.integrity.slice(7)) throw new Error('Expected canonical locked SHA-512 integrity');
    const prior = selected.get(pkg.resolved);
    if (prior && prior.integrity !== pkg.integrity) throw new Error('Conflicting integrity for one tarball');
    selected.set(pkg.resolved, { name, version: pkg.version, integrity: pkg.integrity, resolved: pkg.resolved, official: official + pathname });
  }
  if (!selected.size || selected.size > LIMITS.packages) throw new Error('Mirror recovery package count is out of bounds');
  return [...selected.values()];
}

export function assertEligibleMirrorFailure(log, entries) {
  // Integrity, authentication, lock resolution and unknown-server errors are not failover triggers.
  const codes = [...log.matchAll(/npm (?:error|ERR!) code (\S+)/g)];
  if (!codes.length || codes.some(match => !/^E(?:429|5\d\d)$/.test(match[1]))) throw new Error('npm failure is not eligible for mirror recovery');
  const requests = [...log.matchAll(/npm (?:error|ERR!) (\d{3})[^\r\n]*? - ([A-Z]+) (\S+) - /g)];
  if (!requests.length || requests.some(match => !/^(?:429|5\d\d)$/.test(match[1]) || match[2] !== 'GET' || !entries.some(entry => entry.resolved === match[3]))) throw new Error('No eligible locked public mirror HTTP failure');
}

export function verifyIntegrity(bytes, integrity) {
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) throw new Error('Official tarball failed locked integrity verification');
}

export async function downloadLockedTarball(entry, { fetchImpl = fetch, limits = LIMITS, charge = () => {} } = {}) {
  const response = await fetchImpl(entry.official, { redirect: 'error', signal: AbortSignal.timeout(limits.timeoutMs) });
  if (!response.ok) throw new Error(`Official tarball HTTP ${response.status}`);
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limits.bytes)) throw new Error('Official tarball size is out of bounds');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length; charge(chunk.length);
    if (size > limits.bytes) throw new Error('Official tarball size is out of bounds');
    chunks.push(chunk);
  }
  if (!size || (declared !== null && size !== Number(declared))) throw new Error('Official tarball length mismatch');
  const bytes = Buffer.concat(chunks);
  verifyIntegrity(bytes, entry.integrity);
  return bytes;
}

export function npmCliPath() {
  // Node's official Windows distribution (also used by actions/setup-node) includes npm here.
  return path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
}

export async function runNpm(args, { cwd, cache, npmCli = npmCliPath() }) {
  try {
    return await execute(process.execPath, [npmCli, ...args, '--cache', cache, '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd, windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024,
      env: { ...process.env, npm_config_ignore_scripts: 'true' },
    });
  } catch (error) {
    // Do not echo raw commands, registry credentials, environment or npm debug logs.
    const code = String(error.code ?? 'unknown').replace(/[^\w-]/g, '').slice(0, 40);
    throw new Error(`npm cache/fixture command failed (code=${code}, killed=${Boolean(error.killed)})`);
  }
}

export async function seedCache(entries, { directory, cache, fetchImpl = fetch, importFiles, limits = LIMITS } = {}) {
  await fs.mkdir(directory, { recursive: true });
  const files = new Array(entries.length);
  let cursor = 0; let totalBytes = 0; let failure;
  const charge = count => { totalBytes += count; if (totalBytes > limits.totalBytes) throw new Error('Official recovery total download limit exceeded'); };
  await Promise.all(Array.from({ length: Math.min(limits.concurrency, entries.length) }, async () => {
    while (!failure && cursor < entries.length) {
      const index = cursor++;
      try {
        const bytes = await downloadLockedTarball(entries[index], { fetchImpl, limits, charge });
        const file = path.join(directory, `${index}.tgz`);
        await fs.writeFile(file, bytes, { flag: 'wx' });
        files[index] = file;
      } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure; // No cache imports if any official input fails verification.
  const add = importFiles ?? (batch => runNpm(['cache', 'add', ...batch, '--offline'], { cwd: directory, cache }));
  for (let start = 0; start < files.length; start += 8) await add(files.slice(start, start + 8));
  return { packages: entries.length, bytes: totalBytes };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.platform !== 'win32' || !env.RUNNER_TEMP) throw new Error('Recovery is restricted to disposable Windows GitHub CI');
  if (argv.length !== 2) throw new Error('Expected lockfile and failed npm output paths');
  const cache = path.join(env.RUNNER_TEMP, 'webvideo-ai-npm-cache');
  const before = await fs.readFile(argv[0]);
  const entries = lockedMirrorTarballs(JSON.parse(before));
  assertEligibleMirrorFailure(await fs.readFile(argv[1], 'utf8'), entries);
  const directory = await fs.mkdtemp(path.join(env.RUNNER_TEMP, 'webvideo-npm-recovery-'));
  const result = await seedCache(entries, { directory, cache });
  if (!(await fs.readFile(argv[0])).equals(before)) throw new Error('Lockfile changed during recovery');
  console.log(JSON.stringify({ recovery: 'verified-public-npm-tarballs', ...result, lockUnchanged: true }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Network exceptions can contain URLs; emit only our bounded allowlisted class of errors.
    const message = /^(Expected |Invalid locked|Unsupported locked|Mirror |Conflicting integrity|No eligible|npm |Official |Recovery |Lockfile )/.test(error.message) ? error.message : 'Official recovery failed (network or filesystem error)';
    console.error(message.slice(0, 200)); process.exitCode = 1;
  });
}

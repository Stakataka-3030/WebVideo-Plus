// Build-time material admission. Runtime/user snapshots have a separate ownership boundary.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const ownRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const media = /\.(?:png|jpe?g|webp|gif|svg|ico|mp3|wav|ogg|flac|mp4|webm|ttf|otf|woff2?)$/i;
const gameResource = /\.(?:moc3?|mtn|model3?\.json|motion3?\.json|exp3?\.json|physics3?\.json|pose3?\.json)$/i;
const coreFile = /(?:^|\/)(?:live2d|live2dcubismcore)(?:\.min)?\.js$/i;
const opaqueArchive = /\.(?:zip|tgz|tar|gz|7z|rar|asar|pak|bin|wasm)$/i;
const unwantedRoot = /^(?:\.git|\.build|\.env(?:\..*)?|game|games|user-data|snapshots|output|outputs|cache|state|logs)(?:\/|$)/i;
const binaryPaths = new Set(['WebGAL.Video.exe', 'WebVideoPlus.Manager.exe', 'TerreLauncher.exe', 'process-guard.exe', 'WebVideoCraft.Launcher.exe', 'CraftInstallerObserver.exe', 'CraftOfficialInstaller.exe', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'node.exe', 'ai-runtime/node.exe', 'bin/MicrosoftEdgeWebview2Setup.exe']);
const licenseText = {
  MIT: /Permission\s+is\s+hereby\s+granted[\s\S]*permission\s+notice\s+shall\s+be\s+included/i,
  'Apache-2.0': /Apache License[\s\S]*Version 2\.0[\s\S]*Redistribution/i,
  'BSD-3-Clause': /Redistribution and use in source and binary forms[\s\S]*Neither the name/i,
  Unlicense: /free and unencumbered software released into the public domain/i,
  '0BSD': /Permission to use, copy, modify,[\s\S]*with or without fee/i
};

function walk(directory, prefix = '') {
  const found = [];
  for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    const full = path.join(directory, item.name);
    if (fs.lstatSync(full).isSymbolicLink()) throw Error(`Linked material is not allowed: ${name}`);
    if (item.isDirectory()) found.push(...walk(full, name));
    else if (item.isFile()) found.push(name);
    else throw Error(`Non-regular material is not allowed: ${name}`);
  }
  return found.sort();
}

export function verifyMaterialFiles(directory, policy, {source = false, files = walk(directory)} = {}) {
  const registered = new Map(policy.media.map(item => [item.path, item.sha256]));
  const inline = new Set(policy.inlineMedia.map(item => item.sha256));
  let mediaCount = 0;
  for (const name of files) {
    if (gameResource.test(name) || coreFile.test(name) || opaqueArchive.test(name) || unwantedRoot.test(name)) throw Error(`Unapproved game/Core/user material: ${name}`);
    if (source && /\.(?:exe|dll)$/i.test(name)) throw Error(`Compiled binary must not be tracked as source: ${name}`);
    if (!source && /\.(?:exe|dll)$/i.test(name) && !binaryPaths.has(name)) throw Error(`Unapproved packaged binary: ${name}`);
    const full = path.join(directory, ...name.split('/'));
    if (media.test(name)) {
      if (!registered.has(name) || digest(fs.readFileSync(full)) !== registered.get(name)) throw Error(`Unregistered or changed media: ${name}`);
      mediaCount++;
    }
    // Review static embedded assets in our executable browser payloads. Dependency
    // packages retain their own locked source/license inventory; dynamic data URLs
    // assembled by the renderer are not static bundled media.
    if (/^(?:browser|runtime|product-ui|timeline|features|integration|source\/browser)\//.test(name) && !name.includes('node_modules/') && /\.(?:js|mjs|css|html)$/.test(name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(/data:(?:image|audio|video)\/[^;,\s"']+;base64,([A-Za-z0-9+/=]{16,})/g)) {
        const bytes = Buffer.from(match[1], 'base64');
        if (!inline.has(digest(bytes))) throw Error(`Unregistered static inline media: ${name}`);
      }
    }
  }
  return {files: files.length, media: mediaCount};
}

export function verifySourceMaterials(root = ownRoot) {
  const policy = readJson(path.join(root, 'build/material-policy.json'));
  // Include untracked source additions. Source archives remain buildable without
  // Git metadata; ignored build outputs are audited separately at package time.
  let files;
  try {
    files = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).split('\0').filter(Boolean);
  } catch {
    files = walk(root).filter(name => !/^(?:\.git|\.build|package|dist)(?:\/|$)/.test(name) && !name.includes('node_modules/'));
  }
  return verifyMaterialFiles(root, policy, {source: true, files});
}

export function verifyPackageMaterials(directory, root = ownRoot) {
  const policy = readJson(path.join(root, 'build/material-policy.json'));
  const result = verifyMaterialFiles(directory, policy);
  const notices = readJson(path.join(root, 'build/third-party-notices.json'));
  for (const item of notices.files) {
    const file = path.join(directory, item.path);
    const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const normalized = bytes && item.normalizeTextEol ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
    if (!normalized || digest(normalized) !== item.sha256) throw Error(`Required third-party notice missing or changed: ${item.path}`);
  }
  for (const name of ['LICENSE', 'LICENSES.md', 'NOTICE.md', 'ai-runtime/LICENSE-Node.txt']) {
    if (!fs.existsSync(path.join(directory, name))) throw Error(`Required distributed license missing: ${name}`);
  }
  const lock = readJson(path.join(directory, 'ai-runtime/package-lock.json'));
  let dependenciesWithNotices = 0;
  for (const [relative, record] of Object.entries(lock.packages || {})) {
    if (!relative) continue;
    const file = path.join(directory, 'ai-runtime', relative, 'package.json');
    if (!fs.existsSync(file)) throw Error(`Locked AI dependency missing: ${relative}`);
    const actual = readJson(file);
    if (actual.version !== record.version || (record.license && actual.license !== record.license)) throw Error(`AI dependency metadata differs from lock: ${relative}`);
    if (!policy.dependencyLicenses.includes(record.license)) throw Error(`Unreviewed AI dependency license: ${relative} (${record.license})`);
    const depRoot = path.dirname(file);
    const ownNotices = fs.readdirSync(depRoot).filter(name => /licen[sc]e|notice|copying|copyright|^readme/i.test(name) && fs.statSync(path.join(depRoot, name)).isFile()).map(name => path.join(depRoot, name));
    const supplements = (notices.dependencyNoticePaths?.[relative] || []).map(name => path.join(directory, name));
    if (!ownNotices.concat(supplements).some(name => fs.existsSync(name) && licenseText[record.license]?.test(fs.readFileSync(name, 'utf8')))) throw Error(`Dependency license text missing: ${relative}`);
    dependenciesWithNotices++;
  }
  for (const name of walk(path.join(directory, 'ai-runtime'))) {
    if (/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(name) && !lock.packages?.[name.slice(0, -'/package.json'.length)]) throw Error(`Unreviewed AI package outside lock: ${name}`);
  }
  // External native inputs keep their independently pinned bytes.
  const pins = readJson(path.join(root, 'build/dependencies.lock.json'));
  for (const [name, expected] of Object.entries(pins.stagedFiles)) {
    if (!fs.existsSync(path.join(directory, name)) || digest(fs.readFileSync(path.join(directory, name))) !== expected) throw Error(`Pinned packaged input changed: ${name}`);
  }
  return {...result, supplementalNotices: notices.files.length, dependenciesWithNotices};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] === '--source';
  const root = process.argv[3] ? path.resolve(process.argv[3]) : ownRoot;
  const result = source ? verifySourceMaterials(root) : verifyPackageMaterials(path.resolve(process.argv[2] || path.join(root, 'package')), root);
  console.log(`Material admission verified: ${JSON.stringify(result)}`);
}

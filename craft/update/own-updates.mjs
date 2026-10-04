// WebVideo+ Craft has a separate, opt-in release channel from the official host.
// GitHub is the trust source; SHA-256 establishes byte integrity, not a publisher signature.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

export const CRAFT_RELEASE_REPOSITORY = 'Stakataka-3030/WebVideo-Plus';
export const CRAFT_DESCRIPTOR_NAME = 'webvideo-release.json';
const API = `https://api.github.com/repos/${CRAFT_RELEASE_REPOSITORY}/releases`;
const MAX_INSTALLER = 1024 * 1024 * 1024;
const MAX_DESCRIPTOR = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const DOWNLOAD_ORIGIN = 'https://github.com';

export function parseCraftVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)c$/.test(value)) throw Error('Craft 更新版本格式无效');
  const parts = value.slice(0, -1).split('.').map(Number);
  if (parts.some(n => !Number.isSafeInteger(n) || n > 65535)) throw Error('Craft 更新版本超出范围');
  return parts;
}
export function compareCraftVersions(a, b) {
  const left = parseCraftVersion(a), right = parseCraftVersion(b);
  for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function digest(asset) {
  const value = asset?.digest;
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(value)) throw Error('发行附件缺少 GitHub SHA-256 完整性摘要');
  return value.slice(7).toLowerCase();
}
function releaseUrl(tag, name) {
  return `${DOWNLOAD_ORIGIN}/${CRAFT_RELEASE_REPOSITORY}/releases/download/${tag}/${name}`;
}
function validateAsset(asset, tag, name, maxSize) {
  if (!asset || asset.name !== name || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maxSize) throw Error('Craft 发行附件状态或大小无效');
  if (asset.browser_download_url !== releaseUrl(tag, name)) throw Error('Craft 发行附件下载地址不匹配');
  return {name, size: asset.size, sha256: digest(asset), url: asset.browser_download_url};
}
function findAsset(release, name) {
  const matches = release.assets.filter(a => a?.name === name);
  if (matches.length !== 1) throw Error('Craft 发行附件缺失或重名：' + name);
  return matches[0];
}
function marker(release) {
  const matches = [...String(release.body || '').matchAll(/<!--\s*webvideo-compat:\s*([^]*?)\s*-->/g)];
  if (matches.length !== 1) throw Error('Craft 发行产品标记缺失或重复');
  let value; try { value = JSON.parse(matches[0][1]); } catch { throw Error('Craft 发行产品标记无效'); }
  if (value?.product !== 'craft' || !Array.isArray(value.webgal) || !value.webgal.length || value.webgal.some(v => typeof v !== 'string' || !/^\d+\.\d+\.\d+$/.test(v))) throw Error('发行产品标记不是 Craft');
}
export function validateCraftRelease(release) {
  if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('craft-v')) throw Error('不是 Craft 稳定发行版');
  const version = release.tag_name.slice(7); parseCraftVersion(version); marker(release);
  if (!Array.isArray(release.assets)) throw Error('Craft 发行附件列表无效');
  const tag = release.tag_name, name = `WebVideoCraft-Setup-${version}.exe`;
  return {version, tag, releaseUrl: `https://github.com/${CRAFT_RELEASE_REPOSITORY}/releases/tag/${tag}`,
    installer: validateAsset(findAsset(release, name), tag, name, MAX_INSTALLER),
    descriptor: validateAsset(findAsset(release, CRAFT_DESCRIPTOR_NAME), tag, CRAFT_DESCRIPTOR_NAME, MAX_DESCRIPTOR)};
}
function assertCraftTarget(target) {
  if (target?.platform !== 'windows' || target?.architecture !== 'x64') throw Error('Craft 更新目标必须为 Windows x64');
}
export function validateCraftDescriptor(descriptor, release) {
  if (!descriptor || descriptor.schemaVersion !== 1 || descriptor.product !== 'craft' || descriptor.channel !== 'stable' || descriptor.version !== release.version || descriptor.tag !== release.tag || !Array.isArray(descriptor.assets)) throw Error('Craft 更新描述的产品、通道或版本不匹配');
  assertCraftTarget(descriptor);
  const assets = descriptor.assets.filter(a => a?.name === release.installer.name);
  if (assets.length !== 1 || !SHA256.test(assets[0].sha256 || '') || assets[0].sha256 !== release.installer.sha256 || assets[0].size !== release.installer.size) throw Error('Craft 更新描述与 GitHub 安装器摘要不匹配');
  return {...release, platform: descriptor.platform, architecture: descriptor.architecture};
}
function validNetworkUrl(value, kind) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw Error('更新网络地址不安全');
  if (kind === 'api') {
    if (url.origin !== 'https://api.github.com' || url.pathname !== `/repos/${CRAFT_RELEASE_REPOSITORY}/releases`) throw Error('更新 API 地址不匹配');
  } else if (url.origin === DOWNLOAD_ORIGIN) {
    if (!url.pathname.startsWith(`/${CRAFT_RELEASE_REPOSITORY}/releases/download/craft-v`)) throw Error('更新下载地址不匹配');
  } else if (url.hostname !== 'release-assets.githubusercontent.com' && url.hostname !== 'objects.githubusercontent.com') throw Error('更新重定向来源不受信任');
  return url;
}
async function fetchResponse(fetchImpl, url, kind, signal) {
  for (let count = 0; count < 5; count++) {
    validNetworkUrl(url, kind);
    const response = await fetchImpl(url, {redirect: 'manual', signal, headers: {Accept: kind === 'api' ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'WebVideoCraft-Updater', ...(kind === 'api' ? {'X-GitHub-Api-Version':'2022-11-28'} : {})}});
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel?.();
      if (!location || kind === 'api') throw Error('更新响应重定向无效');
      url = new URL(location, url).href; continue;
    }
    if (!response.ok) { await response.body?.cancel?.(); throw Error('更新来源请求失败（HTTP ' + response.status + '）'); }
    return response;
  }
  throw Error('更新下载重定向过多');
}
async function boundedBytes(response, max) {
  const chunks = []; let size = 0;
  if (!response.body) throw Error('更新响应内容为空');
  for await (const chunk of response.body) { size += chunk.length; if (size > max) throw Error('更新响应超出大小限制'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
function parseJson(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch { throw Error('更新来源返回无效 JSON'); } }
export function assertUpdateIdle(state) {
  if (typeof state?.hasUnsavedDocuments !== 'boolean' || typeof state?.hasBlockingTasks !== 'boolean') throw Error('无法确认 Craft 保存和任务状态，请稍后重试');
  if (state.coverage !== undefined && (state.coverage !== 'own-installer-ui-only' || typeof state.assertCurrent !== 'function')) throw Error('Craft 安装器打开状态凭据无效，请重新检查');
  if (state.hasUnsavedDocuments || state.hasBlockingTasks) throw Error('请先保存所有文档并等待运行任务完成');
}
function assertCurrentUpdateProof(state) {
  // Legacy injected test integrations without coverage retain their boolean
  // contract. Production's scoped proof must synchronously validate revisions.
  if (state.coverage === undefined) return;
  const result = state.assertCurrent();
  if (result && typeof result.then === 'function') {
    Promise.resolve(result).catch(() => {});
    throw Error('Craft 安装器打开状态校验必须同步完成');
  }
  if (result !== undefined && result !== true) throw Error('Craft 安装器打开状态校验未通过');
}
async function assertNoLinks(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    if ((await fs.lstat(current)).isSymbolicLink()) throw Error('更新缓存包含链接路径，已停止');
    if (path.dirname(current) === current) break;
  }
}
function overlaps(left, right) {
  const a = path.resolve(left).toLowerCase(), b = path.resolve(right).toLowerCase();
  return a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex');
}
export function cleanInstallerEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'WEBVIEW2_USER_DATA_FOLDER', 'WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER'].includes(key.toUpperCase())));
}
export async function launchCraftInstaller(file, {reveal = false, spawnImpl = spawn, platform = process.platform, environment = process.env} = {}) {
  if (platform !== 'win32') throw Error('仅 Windows 支持打开 Craft 安装器');
  await new Promise((resolve, reject) => {
    const executable = reveal ? path.win32.join(environment.SystemRoot || 'C:\\Windows', 'explorer.exe') : file;
    const child = spawnImpl(executable, reveal ? ['/select,', file] : [], {detached: true, shell: false, stdio: 'ignore', windowsHide: false, env: cleanInstallerEnvironment(environment)});
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}
export class CraftOwnUpdates {
  constructor({adapterRoot, cacheRoot = path.join(os.tmpdir(), 'WebVideoCraft-updates'), currentVersion, readHostState, isOtherUpdatePending = () => false, fetchImpl = globalThis.fetch, launchInstaller = file => launchCraftInstaller(file), revealInstaller = file => launchCraftInstaller(file, {reveal:true})}) {
    parseCraftVersion(currentVersion);
    if (typeof adapterRoot !== 'string' || !path.isAbsolute(adapterRoot) || overlaps(cacheRoot, adapterRoot)) throw Error('更新缓存必须位于增强组件目录之外');
    Object.assign(this, {cacheRoot, currentVersion, readHostState, isOtherUpdatePending, fetchImpl, launchInstaller, revealInstaller});
    this.candidate = null; this.downloaded = null; this.busy = false; this.launched = false; this.closed = false; this.operation = null; this.abortController = null;
  }
  async exclusive(action) {
    if (this.closed) throw Error('Craft 更新会话已关闭');
    if (this.busy) throw Error('WebVideo+ 更新操作正在进行');
    if (this.isOtherUpdatePending()) throw Error('Craft 官方更新正在进行，请先完成该更新');
    if (this.launched) throw Error('安装器已经打开，请完成或关闭安装器后重启 Craft 再检查更新');
    this.busy = true; this.abortController = new AbortController();
    const operation = Promise.resolve().then(action); this.operation = operation;
    try { return await operation; } finally { this.busy = false; this.operation = null; this.abortController = null; }
  }
  signal(timeout) { return AbortSignal.any([this.abortController.signal, AbortSignal.timeout(timeout)]); }
  async close() {
    this.closed = true; this.abortController?.abort(Error('Craft 已关闭，更新操作已取消'));
    await this.operation?.catch(() => {});
  }
  details() {
    const r = this.candidate;
    return r ? {product: 'craft', channel: 'stable', platform: r.platform, architecture: r.architecture, currentVersion: this.currentVersion, version: r.version, tag: r.tag, releaseUrl: r.releaseUrl, fileName: r.installer.name, size: r.installer.size, sha256: r.installer.sha256} : null;
  }
  async check() {
    return this.exclusive(async () => {
      this.candidate = null; this.downloaded = null;
      const signal = this.signal(45000), candidates = []; let complete = false;
      for (let page = 1; page <= 10; page++) {
        const response = await fetchResponse(this.fetchImpl, `${API}?per_page=100&page=${page}`, 'api', signal);
        const releases = parseJson(await boundedBytes(response, 8 * 1024 * 1024));
        if (!Array.isArray(releases)) throw Error('更新来源没有返回发行列表');
        for (const release of releases) {
          if (release?.draft !== false || release?.prerelease !== false || typeof release.tag_name !== 'string' || !/^craft-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)c$/.test(release.tag_name)) continue;
          const version = release.tag_name.slice(7);
          if (compareCraftVersions(version, this.currentVersion) > 0) candidates.push(release);
        }
        if (releases.length < 100) { complete = true; break; }
      }
      if (!complete) throw Error('发行列表尚未完整检查，请在 GitHub 查看 Craft 发行记录');
      if (!candidates.length) return null;
      candidates.sort((a,b) => compareCraftVersions(b.tag_name.slice(7), a.tag_name.slice(7)));
      if (candidates.length > 1 && candidates[0].tag_name === candidates[1].tag_name) throw Error('Craft 最新版本标记重复');
      // A malformed newest Craft release is an error, not permission to silently use an older one.
      const selected = validateCraftRelease(candidates[0]);
      const descriptorResponse = await fetchResponse(this.fetchImpl, selected.descriptor.url, 'asset', signal);
      const bytes = await boundedBytes(descriptorResponse, MAX_DESCRIPTOR);
      if (bytes.length !== selected.descriptor.size || crypto.createHash('sha256').update(bytes).digest('hex') !== selected.descriptor.sha256) throw Error('Craft 更新描述完整性校验失败');
      this.candidate = validateCraftDescriptor(parseJson(bytes), selected);
      return this.details();
    });
  }
  async download() {
    return this.exclusive(async () => {
      const release = this.candidate; if (!release) throw Error('请先检查 WebVideo+ Craft 更新');
      assertCraftTarget(release);
      if (this.downloaded) { await this.verifyDownloaded(); return {...this.details(), verified: true}; }
      await fs.mkdir(this.cacheRoot, {recursive: true});
      await assertNoLinks(this.cacheRoot);
      const directory = await fs.mkdtemp(path.join(this.cacheRoot, 'craft-update-'));
      const file = path.join(directory, release.installer.name), partial = file + '.partial';
      try {
        const response = await fetchResponse(this.fetchImpl, release.installer.url, 'asset', this.signal(150000));
        if (!response.body) throw Error('安装器下载内容为空');
        const output = await fs.open(partial, 'wx'); let size = 0; const hash = crypto.createHash('sha256');
        try {
          for await (const chunk of response.body) {
            size += chunk.length; if (size > release.installer.size) throw Error('安装器下载超出声明大小');
            hash.update(chunk); await output.writeFile(chunk);
          }
          await output.sync();
        } finally { await output.close(); }
        if (size !== release.installer.size || hash.digest('hex') !== release.installer.sha256) throw Error('安装器 SHA-256 或大小校验失败，未保留不可信安装器');
        await fs.rename(partial, file);
        this.downloaded = {file, directory};
        return {...this.details(), verified: true};
      } catch (e) { await fs.rm(directory, {recursive: true, force: true}); throw e; }
    });
  }
  async verifyDownloaded() {
    if (!this.candidate || !this.downloaded) throw Error('请先下载并校验 WebVideo+ Craft 安装器');
    assertCraftTarget(this.candidate);
    const {file, directory} = this.downloaded;
    await assertNoLinks(file);
    const folder = await fs.lstat(directory), stat = await fs.lstat(file);
    if (!folder.isDirectory() || folder.isSymbolicLink() || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== this.candidate.installer.size) {
      this.downloaded = null; throw Error('已下载安装器发生变化，请重新下载');
    }
    const actual = await hashFile(file), after = await fs.lstat(file);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1 || after.size !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || actual !== this.candidate.installer.sha256) {
      this.downloaded = null; throw Error('已下载安装器发生变化，请重新下载');
    }
    return file;
  }
  async install() {
    return this.exclusive(async () => {
      if (typeof this.readHostState !== 'function') throw Error('Craft 更新保存状态连接不可用');
      assertUpdateIdle(await this.readHostState());
      await this.verifyDownloaded();
      // Read host state again after disk verification. The normal installer enforces process locks.
      const launchState = await this.readHostState();
      assertUpdateIdle(launchState);
      if (this.isOtherUpdatePending()) throw Error('Craft 官方更新正在进行，请先完成该更新');
      if (this.closed) throw Error('Craft 更新会话已关闭，未打开安装器');
      // A native state read may be slow: rehash after it, with no further awaited
      // work between the final verification and creating the installer process.
      const verifiedFile = await this.verifyDownloaded();
      if (this.closed) throw Error('Craft 更新会话已关闭，未打开安装器');
      if (this.isOtherUpdatePending()) throw Error('Craft 官方更新正在进行，请先完成该更新');
      assertUpdateIdle(launchState);
      // No async work may separate the final revision/context check from spawn.
      assertCurrentUpdateProof(launchState);
      await this.launchInstaller(verifiedFile);
      this.launched = true;
      return {opened: true, installed: false, ...this.details()};
    });
  }
  async reveal() {
    return this.exclusive(async () => {
      const file = await this.verifyDownloaded();
      if (this.closed) throw Error('Craft 更新会话已关闭');
      await this.revealInstaller(file);
      return {revealed: true, installed: false, ...this.details()};
    });
  }
}

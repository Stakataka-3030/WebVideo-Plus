import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('generated normal installer has no obsolete FFmpeg directory field or layout slot',()=>{
 const source=read('installer/Installer.cs');
 for(const removed of ['FFmpeg 目录（可选）','手动目录以后请勿移动','ffmpegDir','layoutFFmpegNote'])assert.ok(!source.includes(removed),removed);
 assert.ok(source.includes('Tuple.Create("安装缓存目录",installCache)'));
});
test('saved explicit media override still loads and reaches the existing validated runtime path',()=>{
 const source=read('installer/Installer.cs');
 assert.ok(source.includes('loadedFFmpegSourceDir=cfg.ContainsKey("ffmpegSourceDir")?Convert.ToString(cfg["ffmpegSourceDir"]):"";'));
 assert.ok(source.includes('PrepareRuntimesWithFFmpegFallback(plan,loadedFFmpegSourceDir)'));
 assert.ok(source.includes('engine.UseLocalFFmpeg(current,selectedDirectory)'));
 assert.ok(source.includes('args.AddRange(new[]{"--ffmpeg-source-dir",p.FFmpegSourceDir??""})'));
});
test('bundled verification errors are reported without pretending an automatic download failed',()=>{
 const source=read('installer/Installer.cs');
 assert.ok(source.includes('if(!current.NeedFFmpeg||!String.IsNullOrEmpty(current.BundledFFmpegDir))throw downloadError;'));
 assert.ok(!source.includes('在高级设置重新选择 FFmpeg'));
 assert.ok(source.includes('安装包内的 FFmpeg'));
});

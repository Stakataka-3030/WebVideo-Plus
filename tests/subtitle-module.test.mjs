import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const video = read('browser/export-component.js');
function manualAnchor(value) {
 const start = video.indexOf(' function parseSubtitleTime('), end = video.indexOf(' async function start()', start);
 const box = {subtitleInstalled:true, subtitlePath:'dialogue.srt', subtitleMode:'soft', subtitleAnchorType:'manual', subtitleManualTime:value};
 return vm.runInNewContext(video.slice(start, end) + '\nsubtitleRequest().anchor.seconds', box);
}
test('manual subtitle anchors accept elapsed minutes and the native 24-hour boundary', () => {
 for (const [value, seconds] of [['90:15,5',5415.5], ['1:30:15.5',5415.5], ['0:5',5], ['0.25',0.25], ['24:00:00',86400]]) {
  assert.equal(manualAnchor(value), seconds);
 }
});
test('manual subtitle anchors reject empty fields, invalid units and out-of-range offsets', () => {
 for (const value of [':', '1:', '1::05', '1.5:00', '0:1e1', '1:60', '1:60:00', '86400.01', '9'.repeat(320)]) {
  assert.throws(() => manualAnchor(value), /字幕时间/, value);
 }
});
function labels(modules){const box={__WEBVIDEO_MODULES__:modules,s$5:{},IconWithTextItem:'Entry',reactExports:{Fragment:'Fragment',createElement:(type,props,...children)=>({type,props,children})}};vm.createContext(box);vm.runInContext(read('browser/menu-actions.js')+';globalThis.menu=WebVideoExportMenuActions;',box);const walk=node=>!node||typeof node!=='object'?[]:[node.props?.text,...node.children.flat(Infinity).flatMap(walk)].filter(Boolean);return walk(box.menu());}
test('existing subtitle module controls SRT entry without changing video/dialog entries',()=>{assert.ok(!labels(['exporter']).includes('导出字幕（SRT）'));assert.ok(labels(['exporter','subtitles']).includes('导出字幕（SRT）'));assert.ok(labels(['exporter','layerExport']).includes('导出对话框'));assert.ok(labels([]).length===0);});
test('mount and API both enforce selected module; existing dependency and migration ID retained',()=>{assert.match(read('browser/export-component.js'),/subtitleInstalled&&h\(WebVideoDialogueSubtitles/);assert.match(read('src/QueueService.cs'),/exportKind=="subtitles"&&!J\.A\(J\.Get\(config,"modules"\)\)/);assert.match(read('manager/ModuleCatalog.cs'),/\{"subtitles",new\[\]\{"exporter"\}\}/);assert.match(read('manager/ModuleCatalog.cs'),/\{"subtitles","字幕导出与后处理"\}/);assert.match(read('scripts/configure-installer.mjs'),/modules=modules\.Concat\(new\[\]\{"subtitles"\}\)/);});

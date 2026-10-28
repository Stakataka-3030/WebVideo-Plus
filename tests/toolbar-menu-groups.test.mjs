import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(modules){
 const events=[],opened=[];
 const box={__WEBVIDEO_MODULES__:modules,s$5:{},IconWithTextItem:'NativeEntry',TabItem:'TabItem',TopbarTab:'TopbarTab',useGameEditorContext:select=>select({currentTag:{type:'scene'}}),reactExports:{Fragment:'Fragment',createElement:(type,props,...children)=>({type,props,children})},window:{dispatchEvent:e=>events.push(e.type),WebVideoTools:{open:id=>opened.push(id)}},WebVideoUpdates:{check(){}},CustomEvent:class{constructor(type){this.type=type;}}};
 vm.createContext(box);vm.runInContext(read('browser/menu-actions.js')+'\n'+read('browser/toolbar.js')+';globalThis.nativeMenu=WebVideoExportMenuActions;globalThis.toolsMenu=WebVideoToolsTab;',box);
 return {native:box.nativeMenu(),tools:box.toolsMenu({embedded:true}),events,opened};
}
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const text=node=>typeof node==='string'?node:(node?.children||[]).flat(Infinity).map(text).join('');
const group=(menu,name)=>walk(menu).find(n=>n.props?.role==='group'&&n.props['aria-label']===name);
const buttons=node=>walk(node).filter(n=>n.type==='button');
const all=['subtitles','textImport','generativeAI','musicTimeline','exporter','layerExport'];
test('WebVideo+ imports/exports keeps six buttons in its existing two-column grid',()=>{
 const f=fixture(all),exportGroup=group(f.tools,'导入与导出');
 assert.deepEqual(buttons(exportGroup).map(text),['配置导出音乐','导出视频','导出字幕（SRT）','导出舞台','导出对话框','仅音轨']);
 assert.match(read('browser/toolbar.css'),/grid-template-rows:repeat\(3,28px\);grid-auto-flow:column/);
 assert.equal(Math.ceil(buttons(exportGroup).length/3),2);
 assert.deepEqual(buttons(group(f.tools,'AI功能（实验性）')).map(text),['导入Anogo故事','小说转剧本骨架']);
});
test('both subtitle entries share one action and the existing optional module',()=>{
 const f=fixture(all),native=walk(f.native).filter(n=>n.props?.text==='导出字幕（SRT）'),toolbar=buttons(f.tools).filter(n=>text(n)==='导出字幕（SRT）');
 assert.equal(native.length,1);assert.equal(toolbar.length,1);native[0].props.onClick();toolbar[0].props.onClick();
 assert.deepEqual(f.events,['webvideo:open-subtitle-export','webvideo:open-subtitle-export']);
 const off=fixture(all.filter(x=>x!=='subtitles'));
 assert.equal(walk(off.native).filter(n=>n.props?.text==='导出字幕（SRT）').length,0);
 assert.equal(buttons(off.tools).filter(n=>text(n)==='导出字幕（SRT）').length,0);
 assert.ok(buttons(off.tools).some(n=>text(n)==='导出对话框'));
});
test('Anogo moves groups while retaining its own module and original import action',()=>{
 const f=fixture(['textImport']);assert.equal(group(f.tools,'导入与导出'),undefined);
 const anogo=buttons(group(f.tools,'AI功能（实验性）'));assert.deepEqual(anogo.map(text),['导入Anogo故事']);anogo[0].props.onClick();assert.deepEqual(f.opened,['textImport']);
 const off=fixture(['generativeAI']);assert.deepEqual(buttons(group(off.tools,'AI功能（实验性）')).map(text),['小说转剧本骨架']);
});

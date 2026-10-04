import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Node,nodes,makeDocument} from './ui-dom.mjs';
const source=fs.readFileSync(new URL('../ui/export-dialog.js',import.meta.url),'utf8');
function fixture(){
 const host=makeDocument(),{document,body}=host;let busy=false;
 const c=vm.createContext({document,setTimeout,clearTimeout});c.window=c;vm.runInContext(source,c);
 const dock=new Node('aside'),shared=new Node('section'),calls=[];dock.append(shared);body.append(dock);
 const helper=c.WebVideoCraftExportDialog.mount({bridge:{capabilities:()=>({exportVideo:true})},mediaPanel:{busy:()=>busy,attachExport(parent,kind){calls.push(kind);parent.append(shared);return()=>dock.append(shared)}}});
 function openNative(){const dialog=new Node('div'),header=new Node('div'),steps=new Node('div'),content=new Node('div'),selector=new Node('div'),footer=new Node('div'),close=new Node('button','Close');dialog.setAttribute('role','dialog');dialog.setAttribute('data-state','open');header.append(new Node('h2','导出游戏'));const cards=['Web','桌面端','Android'].map((title,index)=>{const card=new Node('button');card.append(new Node('svg'),new Node('div',title));if(index<2)card.setAttribute('aria-pressed','false');else card.disabled=true;selector.append(card);return card});content.append(selector);dialog.append(header,steps,content,footer,close);close.addEventListener('click',()=>{dialog.remove();helper.refresh()});body.append(dialog);helper.refresh();return{dialog,header,steps,content,footer,close,selector,cards};}
 return{...host,helper,openNative,calls,shared,dock,setBusy:v=>busy=v};
}
test('native platform cards preserve Web/Desktop/Android identities and handlers',async()=>{
 const f=fixture(),n=f.openNative();let web=0;n.cards[0].addEventListener('click',()=>web++);
 assert.deepEqual(nodes(n.dialog).filter(n=>n.dataset.wvcExportKind).map(n=>n.dataset.wvcExportKind),['full','stage','dialog','audio']);
 f.helper.refresh();assert.equal(nodes(n.dialog).filter(n=>n.dataset.wvcExportKind).length,4);assert.equal(n.cards[2].disabled,true);
 await n.cards[0].click();assert.equal(web,1);assert.equal(f.calls.length,0);assert.equal(n.cards[0].parentNode,n.selector);f.helper.dispose();
});
test('configure, back, native close and reopen share one form without stale hidden nodes',async()=>{
 const f=fixture(),n=f.openNative();const stage=nodes(n.dialog).find(n=>n.dataset.wvcExportKind==='stage');await stage.click();
 assert.deepEqual(f.calls,['stage']);assert.equal(n.steps.hidden,true);assert.equal(n.content.hidden,true);assert.equal(n.footer.hidden,true);assert.equal(n.header.hidden,false);assert.equal(n.close.hidden,false);assert.ok(n.dialog.contains(f.shared));
 await nodes(n.dialog).find(n=>n.textContent==='← 返回导出类型'&&n.tagName==='BUTTON').click();assert.equal(n.steps.hidden,false);assert.equal(n.content.hidden,false);assert.equal(f.shared.parentNode,f.dock);
 await stage.click();await n.close.click();assert.equal(f.shared.parentNode,f.dock);const again=f.openNative();assert.equal(nodes(again.dialog).filter(n=>n.dataset.wvcExportKind).length,4);assert.equal(again.steps.hidden,false);f.helper.dispose();
});
test('native next-step replacement removes extension without changing later export controls',()=>{
 const f=fixture(),n=f.openNative();n.selector.remove();f.helper.refresh();assert.equal(nodes(n.dialog).filter(n=>n.dataset.wvcExportKind).length,0);assert.equal(n.footer.hidden,false);f.helper.dispose();
});
test('unrecognized dialogs fail closed and busy export cannot switch mode',async()=>{
 const f=fixture(),unknown=new Node('div');unknown.setAttribute('role','dialog');unknown.append(new Node('div','other'));f.body.append(unknown);f.helper.refresh();assert.equal(unknown.children.length,1);
 const n=f.openNative();f.setBusy(true);await nodes(n.dialog).find(n=>n.dataset.wvcExportKind==='audio').click();assert.equal(f.calls.length,0);f.helper.dispose();
});

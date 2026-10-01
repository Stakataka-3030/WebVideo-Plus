import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const context=vm.createContext({console,setTimeout,clearTimeout,URL});
vm.runInContext('globalThis.window=globalThis;',context);
for(const name of ['craft/features/vendor/webgal-parser-4.6.5.js','craft/features/script.js','craft/features/authoring.js','vendor/js-yaml-4.1.1.min.js','browser/novel-core.js','craft/features/imports.js']) vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),context,{filename:name});
const {WebVideoCraftImports:I,WebVideoCraftScript:S}=context;
const snapshot=()=>({projectId:'test-project',projectPath:'C:/test',path:'C:/test/game/scene/start.txt',source:'; 原注释\r\n旁白:原文;\r\n',revision:'r1',runtimeCapabilities:{multilineStatements:true}});
function fixture(extra={}){
 let doc=snapshot(),calls=[],commits=[];
 const bridge={snapshot:async()=>({...doc}),commit:async request=>{assert.equal(request.snapshot.revision,doc.revision);assert.equal(request.snapshot.source,doc.source);commits.push(request);doc={...doc,source:request.after,revision:'r2'};return {changed:true};},readProjectFile:async()=>null,service:async(endpoint,data)=>{calls.push({endpoint,data});if(endpoint==='/api/character-map')return {nameToId:{alice:'alice'}};if(endpoint==='/api/anogo-actions')return {lookup:{wave:{motion:'wave',expression:'smile'}}};if(endpoint==='/api/ai/config')return {selected:'test',profiles:{test:{hasKey:true,model:'offline-fake'}}};if(endpoint==='/api/ai/save')return {selected:data.provider};if(endpoint==='/api/ai/novel/start')return {id:'job1'};if(endpoint==='/api/ai/novel/cancel')return {ok:true};return extra.status?.(endpoint,data);}};
 const controller=I.create({bridge,script:S,sleep:async()=>{},...extra});
 return {controller,calls,commits,bridge,setDoc:x=>{doc={...doc,...x};},doc:()=>doc};
}
assert.equal(I.parseAnogo('[{"旁白":"保留原文"}]',context.jsyaml)[0].type,'narration');
assert.equal(I.parseAnogo('- 角色: Alice\n  对话: 你好',context.jsyaml)[0].type,'dialogue');
for(const source of ['[]','{"旁白":"hi"}','[{"背景":"a","旁白":"b"}]','[{"角色":"A","对话":"B","__proto__":{}}]','- !!js/function function(){}','- &x {旁白: *x}']) assert.throws(()=>I.parseAnogo(source,context.jsyaml));
{
 const f=fixture(), original=f.doc().source;
 const p=await f.controller.previewAnogo('[{"背景":"bg/test.png"},{"角色":"Alice","动作":"wave","对话":"你好;世界"},{"旁白":"下一行"}]');
 assert.equal(p.useActions,false);assert.equal(p.statementCount,3);assert.equal(p.reviewCount,3);assert.equal(f.commits.length,0);
 assert.equal(f.calls.some(x=>x.endpoint==='/api/anogo-actions'),false);
 p.text='malicious';await f.controller.apply();
 assert.ok(f.doc().source.startsWith(original));assert.match(f.doc().source,/Alice:你好\\;世界 -id -figureId=alice;/);assert.ok(!f.doc().source.includes('malicious'));
 assert.equal(f.doc().source.replaceAll('\r\n','').includes('\n'),false);
}
{
 const f=fixture();await f.controller.previewAnogo('[{"旁白":"new"}]');f.setDoc({source:'unsaved change',revision:'r2'});await assert.rejects(f.controller.apply(),/变化/);assert.equal(f.commits.length,0);
}
for(const source of ['[{"旁白":"hello -next"}]','[{"角色":"changeBg","对话":"x.png"}]','[{"角色":"setVar","对话":"x=1"}]','[{"背景":"../secret"}]','[{"背景":"x;end"}]']){
 const f=fixture();await assert.rejects(f.controller.previewAnogo(source));assert.equal(f.commits.length,0);
}
{
 const f=fixture({readFigure:async()=>JSON.stringify({FileReferences:{Motions:{wave:[]},Expressions:[{Name:'smile'}]}})});
 f.setDoc({source:'changeFigure:alice.model3.json -id=alice -left;\n'});
 const p=await f.controller.previewAnogo('[{"角色":"Alice","动作":"wave","对话":"hello"}]',{useActions:true});
 assert.equal(p.statementCount,2);assert.match(p.text,/-motion=wave/);assert.match(p.text,/-expression=smile/);assert.match(p.text,/-left/);assert.equal(f.commits.length,0);
}
{
 const f=fixture();await assert.rejects(f.controller.generateNovel('hello'),/确认/);assert.equal(f.calls.length,0);
 await assert.rejects(f.controller.configureProvider({provider:'test',model:'x',key:'FAKE_TEST_ONLY'}),/确认/);
 assert.equal(f.calls.length,0);await f.controller.configureProvider({provider:'test',model:'x',key:'FAKE_TEST_ONLY',unrelated:'deny'},{confirmed:true});
 assert.equal(f.calls[0].data.unrelated,undefined);assert.ok(!JSON.stringify(f.controller.state()).includes('FAKE_TEST_ONLY'));
}
function outputFor(source){
 const prepared=vm.runInContext('WebVideoNovel',context).prepare(source,{nameToId:{}});
 return {segments:[{from:0,to:prepared.units.length-1,kind:'narration',speaker:'',uncertain:false,sceneBreak:false}],staging:{maxActors:1,assets:{actors:[],backgrounds:['bg.png']},changes:[{at:0,background:'bg.png',cast:[]}]}};
}
{
 let poll=0;const f=fixture({status:()=>++poll===1?{state:'running',phase:'基础舞台安排',totalBatches:1}:{state:'complete',result:outputFor('原文不会被重写。')}});
 const original=f.doc().source, p=await f.controller.generateNovel('原文不会被重写。',{confirmed:true});
 assert.equal(p.kind,'novel');assert.match(p.text,/原文不会被重写/);assert.equal(f.commits.length,0);assert.equal(f.calls.find(x=>x.endpoint.endsWith('/start')).data.project,undefined);
 await f.controller.apply();assert.ok(f.doc().source.startsWith(original));assert.equal(f.commits.length,1);
}
{
 const bad=outputFor('保留。');bad.segments[0].to=100;const f=fixture({status:()=>({state:'complete',result:bad})});
 await assert.rejects(f.controller.generateNovel('保留。',{confirmed:true}),/范围/);assert.equal(f.commits.length,0);
}
{
 const bad=outputFor('保留。');delete bad.staging;const f=fixture({status:()=>({state:'complete',result:bad})});
 await assert.rejects(f.controller.generateNovel('保留。',{confirmed:true}),/第二阶段/);assert.equal(f.commits.length,0);
}
{
 const f=fixture({status:()=>{f.setDoc({revision:'new'});return {state:'complete',result:outputFor('保留。')};}});
 await assert.rejects(f.controller.generateNovel('保留。',{confirmed:true}),/变化/);assert.equal(f.commits.length,0);assert.ok(f.calls.some(x=>x.endpoint.endsWith('/cancel')));
}
{
 let resolveStart, markEntered;const entered=new Promise(r=>{markEntered=r;});const started=new Promise(r=>{resolveStart=r;});const f=fixture();const original=f.bridge.service;
 f.bridge.service=async(p,d)=>{if(p.endsWith('/start')){markEntered();return started;}return original(p,d);};
 const run=f.controller.generateNovel('保留。',{confirmed:true});
 // Wait until controller is in start request, then cancel before a job ID exists.
 await entered;await f.controller.cancel();resolveStart({id:'late-job'});
 await assert.rejects(run,/取消/);assert.ok(f.calls.some(x=>x.endpoint.endsWith('/cancel')&&x.data.id==='late-job'));assert.equal(f.commits.length,0);
}
{
 const f=fixture({onApplied:async()=>{throw Error('metadata CAS failure');}});
 await f.controller.previewAnogo('[{"旁白":"new"}]');const result=await f.controller.apply();
 assert.equal(f.commits.length,1);assert.match(result.warning,/剧本已提交/);assert.equal(f.controller.state().phase,'applied-review-failed');
 await assert.rejects(f.controller.apply(),/预览/);
}
{
 const f=fixture({status:()=>({state:'complete',result:outputFor('保留。')})});
 f.setDoc({source:'changeFigureDiff:alice.png -id=alice -left;\n',runtimeCapabilities:{changeFigureDiff:true}});
 const p=await f.controller.generateNovel('保留。',{confirmed:true});assert.match(p.text,/changeFigure:none -id=alice -left -next;/);
}
console.log('Craft import controllers: strict JSON/YAML, previews, mappings, AI phases, cancellation and stale-buffer guards passed');

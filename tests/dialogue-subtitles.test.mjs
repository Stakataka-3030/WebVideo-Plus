import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../browser/dialogue-subtitles.js',import.meta.url),'utf8');
function setup(version='4.6.4'){
 const stage={showText:'你好|世界',showName:'名字',currentDialogKey:'a'},state={GUI:{showTextBox:true},userData:{optionData:{textSize:0},globalGameVar:{}}};
 // Native compiler contract: rows of objects whose reactNode is the visible element.
 const compiler=text=>text.split('|').map(row=>[{reactNode:''},...row.split('').map(c=>({reactNode:{type:'span',props:{style:{color:'red'},children:c}}}))]);
 const box={queueMicrotask,__wgProbe:{adapter:{version},store:{getState:()=>state},stageManager:{getCalculationStageState:()=>stage},compileText:compiler}};vm.createContext(box);vm.runInContext(source,box);return {box,stage,state};
}
for(const version of ['4.6.4','4.6.6']){
 test(version+' native rows, speaker and semantic line breaks',()=>{const {box}=setup(version);assert.equal(box.__subtitleDialogueSnapshot().text,'你好\n世界');assert.equal(box.__subtitleDialogueSnapshot().speaker,'名字');});
 test(version+' concat segments and empty concat preserve visible text',()=>{const {box,stage}=setup(version);stage.showText='甲乙';stage.currentConcatDialogPrev='甲';stage.currentDialogSegments=['甲','乙',''];assert.equal(box.__subtitleDialogueSnapshot().text,'甲乙');});
 test(version+' empty/hidden/film state',()=>{const {box,stage,state}=setup(version);stage.showText='';assert.equal(box.__subtitleDialogueSnapshot().text,'');stage.enableFilm=true;stage.showText='A<B';assert.equal(box.__subtitleDialogueSnapshot().text,'A<B');state.GUI.showTextBox=false;assert.equal(box.__subtitleDialogueSnapshot().visible,false);});
}
test('React children, custom extensions, br and ruby; CSS does not enter text',()=>{const {box}=setup();assert.equal(box.__subtitleNodeText({type:()=>{},props:{style:{background:'url(secret)'},children:['字',{type:'br'},[{type:'ruby',props:{children:['漢',{type:'rt',props:{children:'かん'}}]}}],{type:'style',props:{children:'secret'}}]}}),'字\n漢');});
test('one snapshot per synchronous forward group, including -next + hide',()=>{const {box,stage,state}=setup();const timers=[],events=[],capture=box.__subtitleCaptureGroup(events,box.__subtitleDialogueSnapshot,fn=>timers.push(fn));const say={command:'say',forwardGroup:1},hide={command:'setTextbox',forwardGroup:1};events.push(say,hide);capture(say,{});capture(hide,{});state.GUI.showTextBox=false;assert.equal(timers.length,1);timers.shift()();assert.equal(say.dialogue.visible,false);assert.equal(hide.dialogue,undefined);});
test('async groups retain separate snapshots; empty concat is explicit append',()=>{const {box,stage}=setup();const events=[],capture=box.__subtitleCaptureGroup(events);const first={command:'say',forwardGroup:1};capture(first,{});return Promise.resolve().then(()=>{stage.currentDialogKey='a';const next={command:'say',forwardGroup:2};capture(next,{concat:true});return Promise.resolve().then(()=>{assert.equal(first.dialogue.append,false);assert.equal(next.dialogue.append,true);assert.equal(first.dialogue.text,next.dialogue.text);});});});
test('final timeline preserves metadata through native auto/manual and BGM retiming',()=>{
 const box={};vm.createContext(box);vm.runInContext(fs.readFileSync(new URL('../browser/finish-timeline.js',import.meta.url),'utf8'),box);
 for(const mode of ['auto','manual','bgm']){
  const result={dialogueSchemaVersion:1,events:[{index:0,atMs:0,dialogue:{text:'甲'}},{index:1,atMs:1000,dialogue:{text:'乙'}}],options:{textSpeed:50,autoSpeed:50},durationMs:2000,elastic:[{startMs:0,endMs:2000,line:0}],performWindows:[],stageExitWindows:[],controlEvents:[]};
  const out=box.__finishNativeTimeline({result,pre:{parsedStatements:2},settings:{mode,fps:30,textSpeed:50,autoSpeed:50,holdSeconds:1},playlist:mode==='bgm'?[{durationMs:4000}]:[],range:null});
  assert.equal(out.dialogueSchemaVersion,1);assert.equal(out.sourceEvents[1].dialogue.text,'乙');assert.equal(out.sourceEvents[1].atMs,mode==='bgm'?2000:1000);
 }
});
test('feature is gated to subtitle planning; video render and original dialog export remain',()=>{
 const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
 assert.match(read('src/Planner.cs'),/captureDialogue",DialogueSubtitles.Is\(request\)/);
 assert.match(read('browser/timeline.js'),/policy.captureDialogue\?__subtitleCaptureGroup\(\):null/);
 assert.match(read('browser/menu-actions.js'),/text:'导出对话框'.*exportKind:'dialog'/);
 assert.match(read('browser/menu-actions.js'),/text:'导出字幕（SRT）'/);
 assert.match(read('scripts/build-feature-assets.mjs'),/subtitle-export-component.js/);
});

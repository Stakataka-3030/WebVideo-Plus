// Read the pinned native compiler from an existing, approved engine bundle.
// React element creation and pattern matching are represented without a DOM;
// the native text/escape/rich-text parser bodies execute unchanged.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const filename=process.argv[2],version=process.argv[3]||'4.6.4';if(!filename)throw Error('Pass the pinned engine index JS path and version');
const profiles={
 '4.6.4':{from:'function iM(',to:'const eCe=',list:'KSe',escape:'YC',after:';function vo',compiler:'Os',jsx:'C',match:'Z$'},
 '4.6.6':{from:'function JN(',to:'const Rt=',list:'K1e',escape:'FC',after:';function bo',compiler:'Na',jsx:'P',match:'pTe'},
 '3.2.1':{from:'function Ds(',to:'const Wr=',list:'d1e',escape:'eP',after:';function hi',compiler:'Ds',jsx:'A',match:'u5'}
};
const profile=profiles[version];assert.ok(profile,'known pinned compiler profile');const native=fs.readFileSync(filename,'utf8');
const from=native.indexOf(profile.from),to=native.indexOf(profile.to,from);assert.ok(from>=0&&to>from);
const escapeFrom=native.lastIndexOf(profile.list+'=[',native.indexOf(profile.escape+'=')),escapeTo=native.indexOf(profile.after,escapeFrom);assert.ok(escapeFrom>=0&&escapeTo>escapeFrom);
const stage={showText:'在雾中几乎只能看见这些，枯树、杂草、冷雾、无止境的山。',showName:'',currentDialogKey:'native'},state={GUI:{showTextBox:true},userData:{optionData:{textSize:0},globalGameVar:{}}};
const box={queueMicrotask,stage,state,__wgProbe:{adapter:{version},store:{getState:()=>state},stageManager:{getCalculationStageState:()=>stage}}};
box[profile.jsx]={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
box[profile.match]=value=>({with(type,fn){if(value===type)fn();return this;},endsWith(type,fn){if(value===type)fn();return this;}});
vm.createContext(box);vm.runInContext('const '+native.slice(escapeFrom,escapeTo)+';'+native.slice(from,to)+';__wgProbe.compileText='+profile.compiler+';',box);vm.runInContext(fs.readFileSync(new URL('../browser/dialogue-subtitles.js',import.meta.url),'utf8'),box);
const nativeNodeCount=box.__wgProbe.compileText(stage.showText,3).flat().length;assert.equal(box.__subtitleDialogueSnapshot().text,stage.showText);
stage.showText='[红字](style=color~red)|[漢](ruby=かん) 和 \\| 符号';assert.equal(box.__subtitleDialogueSnapshot().text,'红字\n漢 和 | 符号');
stage.showText='[正文](style-alltext=font-size~20px tips=提示)';assert.equal(box.__subtitleDialogueSnapshot().text,'正文');
stage.showText='';assert.equal(box.__subtitleDialogueSnapshot().text,'');
let checks=4;if(version==='4.6.6'){stage.showText='[甲](style=color~red)乙';stage.currentDialogSegments=['[甲](style=color~red)','乙',''];assert.equal(box.__subtitleDialogueSnapshot().text,'甲乙');checks++;}
console.log(JSON.stringify({checks,nativeNodeCount,bundleSha256:crypto.createHash('sha256').update(native).digest('hex'),nativeCompiler:version+' '+profile.compiler,boundary:'native parser bodies with React element and matcher collaborators; not a browser or full export'},null,2));

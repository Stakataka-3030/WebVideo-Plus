import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sandbox={};sandbox.globalThis=sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root,'browser/workload.js'),'utf8'),sandbox);
const sentence=(commandRaw,content,args,line)=>({command:1,commandRaw,content,args:Object.entries(args).map(([key,value])=>({key,value})),startLine:line,endLine:line});
const parsed={sentenceList:[sentence('changeFigure','a.png',{id:'hero',next:true},0),sentence('changeFigureDiff','b.png',{id:'hero',next:true},1),sentence('wait','1000',{},2)]};
const timing={lineTimes:[0,100,200],durationSeconds:2,sourceEvents:[],performWindows:[{role:'primary',line:1,command:'changeFigureDiff',startMs:100,stopMs:300,durationMs:200,hold:false}],stageExitWindows:[]};
const result=sandbox.__buildNativeWorkload({script:'changeFigure:a.png -id=hero -next;\nchangeFigureDiff:b.png -id=hero -next;\nwait:1000;',parsed,media:{},animations:{},timing,root:'C:/fake',project:'C:/fake',sceneName:'start.txt',fps:30});
assert.equal(result.counts.changeFigureDiff,1);
assert.equal(result.events.find(event=>event.command==='changeFigureDiff').loads,true);
assert.equal(result.softCutWindows.find(window=>window.reason==='figure-diff')?.endMs,300);
assert.equal(result.replayWindows.find(window=>window.command==='changeFigureDiff')?.endMs,300);
assert.equal(result.replayWindows.some(window=>window.command==='changeFigure-exit'),false);
console.log('WebGAL 4.6.5 figure diff workload preserves a protected blend window.');

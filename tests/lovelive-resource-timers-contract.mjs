import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(process.argv[2],'utf8');
const host=fs.readFileSync(new URL('../browser/lovelive-export-host.js',import.meta.url),'utf8');
const directYield=source.match(/([\w$]+)=\(\)=>new Promise\(([\w$]+)=>globalThis\.__webgalOfflineExportHost\.scheduleResourceTask\(\2,16\)\)/)?.[0];
const hostYield=source.match(/([\w$]+)=\(\)=>new Promise\(([\w$]+)=>\{var [\w$]+;const [\w$]+=\([\w$]+=globalThis\.__webgalOfflineExportHost\)==null\?void\s*0:[\w$]+\.scheduleAssetMount;[\w$]+\?[\w$]+\(\2\):setTimeout\(\2,16\)\}\)/)?.[0];
const yieldBody=directYield||hostYield;
const compile=source.match(/compileAsync=function\([^{}]*\)\{const [^{};]+;return new Promise\([^{}]+=>\{function [\w$]+\(\)\{if\([\s\S]{0,900}?"KHR_parallel_shader_compile"[\s\S]{0,250}?\}\)\}/)?.[0];
assert.ok(yieldBody&&compile,'Extract production-patched module functions');
const wall=[],story=[];
const box={__pwClock:{controller:{_embedder:{setTimeout:(callback,delay)=>{wall.push({callback,delay});return ()=>{};}}}},setTimeout:(...args)=>story.push(args)};
vm.createContext(box);vm.runInContext(host,box);
vm.runInContext('globalThis.yieldResource=(()=>{let '+yieldBody+';return '+yieldBody.split('=')[0]+';})();',box);
let done=false;const pending=box.yieldResource().then(()=>done=true);
assert.equal(done,false);assert.equal(wall[0].delay,hostYield?0:16);wall.shift().callback();await pending;assert.equal(done,true);assert.deepEqual(story,[]);
// Execute the patched Three shader poll with renamed dependencies supplied.
const declaration=compile.match(/^compileAsync=function\(([^)]*)\)/);
const programMap=compile.match(/([\w$]+)\.get\(([\w$]+)\)\.currentProgram/)[1];
const extensions=compile.match(/([\w$]+)\.get\("KHR_parallel_shader_compile"\)/)[1];
let ready=false;box[programMap]={get:()=>({currentProgram:{isReady:()=>ready}})};box[extensions]={get:()=>({})};
vm.runInContext('globalThis.renderer={compile:()=>new Set([{}]),'+compile.replace('compileAsync=','compileAsync:')+'};',box);
const scene={};let compiled=false;const compiling=box.renderer.compileAsync(scene,{}).then(value=>{assert.equal(value,scene);compiled=true;});
assert.equal(compiled,false);assert.equal(wall[0].delay,10);ready=true;wall.shift().callback();await compiling;assert.equal(compiled,true);assert.deepEqual(story,[]);
// Timer callback errors are not swallowed by the bridge.
box.__webgalOfflineExportHost.scheduleResourceTask(()=>{throw Error('resource error');},10);
assert.throws(()=>wall.shift().callback(),/resource error/);
// Ordinary story scheduling continues to use the virtual global setTimeout.
vm.runInContext('__webgalOfflineExportHost.scheduleAuto(()=>{},30)',box);assert.equal(story.length,1);assert.equal(story[0][1],30);
console.log('PASS patched yield/shader poll complete on resource clock, story clock untouched, errors retained');

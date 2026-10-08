import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../browser/cubism-memory.js',import.meta.url),'utf8').replace('__CUBISM_CORE_MEMORY_MIB__','128');
test('explicit export reservation wins over 4.6.6 default/config without reinitializing active memory',async()=>{
 const calls=[],memory={initializeAmountOfMemory(bytes){calls.push(bytes);}};
 const context={Live2DCubismCore:{Memory:memory},Promise};context.globalThis=context;vm.runInNewContext(script,context);
 context.live2dPromise=Promise.resolve([true,true]);await context.live2dPromise;
 memory.initializeAmountOfMemory(32*1024*1024);memory.initializeAmountOfMemory(256*1024*1024);
 assert.deepEqual(calls,[128*1024*1024]);assert.equal(context.__webvideoCubismMemory.applied,true);assert.equal(context.__webvideoCubismMemory.effectiveMiB,128);assert.deepEqual(Array.from(context.__webvideoCubismMemory.engineReservations),[32,256]);
});
test('missing modern Core leaves Cubism2 load status intact',async()=>{
 const context={Promise};context.globalThis=context;vm.runInNewContext(script,context);context.live2dPromise=Promise.resolve([true,false]);assert.deepEqual(await context.live2dPromise,[true,false]);assert.equal(context.__webvideoCubismMemory.coreLoaded,false);assert.equal(context.__webvideoCubismMemory.done,true);
});
test('reservation failure is reported and does not claim a successful explicit override',async()=>{
 const context={Promise,Live2DCubismCore:{Memory:{initializeAmountOfMemory(){throw Error('capacity rejected');}}}};context.globalThis=context;vm.runInNewContext(script,context);context.live2dPromise=Promise.resolve([true,true]);await context.live2dPromise;assert.equal(context.__webvideoCubismMemory.applied,false);assert.equal(context.__webvideoCubismMemory.error,'capacity rejected');
});

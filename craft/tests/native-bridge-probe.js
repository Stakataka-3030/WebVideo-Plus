// Run only in a disposable Craft test project/profile, never a user's project.
globalThis.WebVideoCraftNativeProbe=async function({expectedPath,expectedSource}){
 const bridge=globalThis.WebVideoCraftBridge, results=[];
 const assert=(condition,name)=>{results.push({name,passed:!!condition});if(!condition)throw Error(name);};
 const before=await bridge.snapshot();assert(before.path===expectedPath&&before.source===expectedSource,'exact disposable fixture');
 const first=before.source+'\n; WebVideo native transaction probe 1\n';
 await bridge.commit({snapshot:before,after:first,label:'隔离测试一'});
 const one=await bridge.snapshot();assert(one.source===first&&one.revision!==before.revision,'first native transaction');
 const second=first+'; WebVideo native transaction probe 2\n';
 await bridge.commit({snapshot:one,after:second,label:'隔离测试二'});
 assert((await bridge.snapshot()).source===second,'second native transaction');
 await bridge.undo();assert((await bridge.snapshot()).source===first,'undo one batch only');
 await bridge.undo();assert((await bridge.snapshot()).source===before.source,'undo restores original');
 await bridge.redo();assert((await bridge.snapshot()).source===first,'redo first');
 await bridge.redo();assert((await bridge.snapshot()).source===second,'redo second');
 await bridge.undo();await bridge.undo();assert((await bridge.snapshot()).source===before.source,'final original restored');
 let rejected=false;try{await bridge.commit({snapshot:before,after:first});}catch{rejected=true;}
 assert(rejected,'old revision rejected even same content after undo');
 const scenes=await bridge.listScenes();assert(scenes.some(x=>x.path===expectedPath),'native VFS listing');
 assert(await bridge.readScene(expectedPath)===before.source,'native buffer read');
 return {passed:results.every(x=>x.passed),results,after:await bridge.snapshot()};
};

import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
const context=vm.createContext({crypto:webcrypto,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(new URL('../features/backups.js',import.meta.url),'utf8'),context);
const B=context.WebVideoCraftBackups;
function fixture(){
 let doc={projectId:'p',projectPath:'C:/game',path:'C:/game/game/scene/start.txt',source:'UNSAVED',revision:'a'},writes=[],commits=[],data=new Map(),counter=0,listeners=new Set(),captureCount=0,captureOptions=[];
 const bridge={snapshot:async()=>({...doc}),readBackup:async item=>data.get(item.file||item),listBackups:async()=>[...data.keys()].map(file=>({file})),openScene:async name=>{doc={...doc,path:'C:/game/game/scene/'+name};return {...doc};},
  readProjectFile:async(p,f)=>data.has(p)?data.get(p):f,writeProjectFile:async(p,t,o)=>{if(o.create&&data.has(p))throw Error('exists');if('expectedText'in o&&(data.has(p)?data.get(p):null)!==o.expectedText)throw Error('CAS');writes.push({p,t,o});data.set(p,t);},
  commit:async r=>{assert.equal(r.snapshot.source,doc.source);assert.equal(r.snapshot.revision,doc.revision);commits.push(r);doc={...doc,source:r.after,revision:'b'};return {changed:true};},
  captureStorySnapshot:async options=>{captureCount++;captureOptions.push(options);return {file:'new-story'};},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 const controller=B.createController(bridge,{uuid:()=>String(++counter),normalizeMusic:v=>{if(v.schemaVersion!==2)throw Error('schema');return v;}});
 return {controller,bridge,data,writes,commits,set:x=>doc={...doc,...x},doc:()=>doc,captures:()=>captureCount,captureOptions,emit:()=>listeners.forEach(fn=>fn())};
}
{
 const f=fixture();const backup={schemaVersion:1,kind:'storySet',projectId:'p',files:[{path:'game/scene/start.txt',source:'OLD'},{path:'game/scene/other.txt',source:'OTHER'}]};
 await assert.rejects(f.controller.restoreScene(backup),/确认/);
 await assert.rejects(f.controller.restoreScene(backup,{confirmed:true}),/明确选择/);
 const r=await f.controller.restoreScene(backup,{scenePath:'game/scene/start.txt',confirmed:true});
 assert.equal(f.commits.length,1);assert.equal(f.doc().source,'OLD');assert.equal(f.writes.length,1);assert.equal(JSON.parse(f.writes[0].t).before,'UNSAVED');assert.equal(r.atomicRestore,false);
 assert.ok(f.writes.every(x=>x.p.startsWith('.webvideo-plus/backups/')));
}
{
 const f=fixture();f.bridge.writeProjectFile=async()=>{throw Error('backup-failed');};
 await assert.rejects(f.controller.restoreScene({path:'game/scene/start.txt',before:'old'},{confirmed:true}),/backup-failed/);assert.equal(f.commits.length,0);
}
{
 const f=fixture(),save=f.bridge.writeProjectFile;f.bridge.writeProjectFile=async(...args)=>{await save(...args);f.set({revision:'edited',source:'new unsaved'});};
 await assert.rejects(f.controller.restoreScene({path:'game/scene/start.txt',before:'old'},{confirmed:true}),/变化/);assert.equal(f.commits.length,0);
}
for(const path of ['game/scene/../secrets.txt','C:/other/game/scene/start.txt','game/scene/a:bad.txt']){
 const f=fixture();await assert.rejects(f.controller.restoreScene({path,before:'old'},{confirmed:true}));assert.equal(f.writes.length,0);
}
{
 const f=fixture();f.data.set('video-project.json','{"schemaVersion":2,"tracks":[]}');
 const result=await f.controller.restoreMusic({kind:'music',before:'{"schemaVersion":2,"tracks":[1]}'},{confirmed:true});
 assert.equal(result.changed,true);assert.equal(f.writes.length,2);assert.equal(f.writes[1].o.expectedText,'{"schemaVersion":2,"tracks":[]}');assert.equal(f.commits.length,0);
}
{
 const f=fixture();f.data.set('video-project.json','{"schemaVersion":2}');const save=f.bridge.writeProjectFile;
 f.bridge.writeProjectFile=async(...args)=>{await save(...args);if(args[0].includes('backups'))f.data.set('video-project.json','concurrent edit');};
 await assert.rejects(f.controller.restoreMusic({kind:'music',before:'{"schemaVersion":2,"tracks":[]}'},{confirmed:true}),/CAS/);assert.equal(f.data.get('video-project.json'),'concurrent edit');
}
{
 const f=fixture();await assert.rejects(f.controller.restoreScene({projectId:'foreign',path:'game/scene/start.txt',before:'x'},{confirmed:true}),/其他工程/);
 await assert.rejects(f.controller.restoreMusic({kind:'music',before:null},{confirmed:true}),/没有原音乐/);
}
{
 const f=fixture();let now=Date.UTC(2026,0,1,12,1),timer,events=[];
 const stop=f.controller.startAutomatic({clock:()=>now,setTimeout:fn=>(timer=fn,1),clearTimeout:()=>{},onState:x=>events.push(x)});
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 await flush();assert.equal(f.captures(),1);f.emit();await flush();assert.equal(f.captures(),1);
 now+=10*60000;timer();await flush();assert.equal(f.captures(),2);
 f.set({projectId:'q',projectPath:'C:/q'});f.emit();await flush();assert.equal(f.captures(),3);f.set({projectId:'p',projectPath:'C:/game'});f.emit();await flush();assert.equal(f.captures(),4);assert.deepEqual(f.captureOptions.map(x=>x.slot),['automatic-open','automatic-ten-minute','automatic-open','automatic-open']);stop();f.emit();await flush();assert.equal(f.captures(),4);
}
{
 const f=fixture();let attempts=0,timer;
 f.bridge.captureStorySnapshot=async()=>{attempts++;if(attempts===1)throw Error('disk busy');return {file:'ok'};};
 const stop=f.controller.startAutomatic({clock:()=>Date.UTC(2026,0,1),setTimeout:fn=>(timer=fn,1),clearTimeout:()=>{}});
 for(let i=0;i<20;i++)await Promise.resolve();assert.equal(attempts,1);timer();for(let i=0;i<20;i++)await Promise.resolve();assert.equal(attempts,2);stop();
}
{
 const f=fixture();f.data.set('.webvideo-plus/backups/automatic-open.json',{kind:'scene',path:'game/scene/start.txt',before:'new backup',createdAt:'new'});
 await assert.rejects(f.controller.restoreScene({file:'.webvideo-plus/backups/automatic-open.json',createdAt:'old'},{confirmed:true}),/自动备份已更新/);
 assert.equal(f.commits.length,0);assert.equal(f.writes.length,0);
}
console.log('Craft backups: safety snapshot, native revision guard, scoped restore, music CAS, automatic dedup/retry passed');

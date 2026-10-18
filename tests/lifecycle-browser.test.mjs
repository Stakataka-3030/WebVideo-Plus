import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto,createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const source=name=>fs.readFileSync(new URL('browser/'+name,root),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('backup heartbeat re-registers the open page after a service restart',async()=>{
 const listeners=new Map(),watchers=new Set();let interval,cleanup,calls=0;
 const ctx={URL,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},WebVideoCharacterMapEnabled:true,__WEBVIDEO_MODULES__:['backups'],reactExports:{useEffect(fn){cleanup=fn();}},window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},setTimeout,setInterval:fn=>(interval=fn,1),clearInterval:()=>{interval=null;}};
 ctx.fetch=async(url,options)=>{if(url.startsWith('/assets/'))return {json:async()=>({baseUrl:'http://127.0.0.1:1234',token:'fixture'})};calls++;const data=JSON.parse(options.body);if(url.endsWith('/watch'))watchers.add(data.watchId);else watchers.delete(data.watchId);return {ok:true};};
 vm.createContext(ctx);vm.runInContext(source('automatic-backups.js')+'\nuseWebVideoAutomaticBackups("demo");',ctx);await settle();assert.equal(watchers.size,1);watchers.clear();interval();await settle();assert.equal(watchers.size,1);assert.equal(calls,2);cleanup();await settle();assert.equal(interval,null);assert.equal(watchers.size,0);
});
test('valid backups remain accessible when the music configuration is corrupt',async()=>{
 const h=(type,props,...children)=>({type,props,children}),React={createElement:h,Fragment:'Fragment',useReducer:()=>[0,()=>{}],useRef:()=>({current:null}),useEffect:()=>{}};
 const ctx={URL,Date,TextEncoder,crypto:webcrypto,AbortController,navigator:{},reactExports:React,__WEBVIDEO_MODULES__:['backups'],useEditorStore:{use:{subPage:()=> 'demo',isDarkMode:()=>false}},useGameEditorContext:fn=>fn({currentTag:null,tags:[],addTag(){},updateCurrentTag(){},updateIsShowSidebar(){}}),setTimeout,clearTimeout};ctx.window=ctx;ctx.WebVideoPlus={changed(){},subscribe(){return()=>{};},state(){return {model:null};}};ctx.WebVideoProjectCore={metadata:()=>({schemaVersion:1,backups:[]}),safePath:x=>x,musicProject:x=>x};ctx.api={assetsControllerEditTextFile:async()=>({}),assetsControllerReadAssets:async()=>({data:{dirInfo:[{name:'music-before.json'}]}})};
 const corrupt='{invalid-json',backup={schemaVersion:1,kind:'music',id:'m',path:'games/demo/video-project.json',before:'{"schemaVersion":2,"tracks":[]}',createdAt:'2026-10-18T00:00:00Z'};
 ctx.fetch=async(url,options)=>{let data;if(String(url)==='/assets/video-export-service.json')data={baseUrl:'http://127.0.0.1:1234',token:'fixture'};else if(String(url)==='http://127.0.0.1:1234/api/music/project'){assert.equal(JSON.parse(options.body).action,'read');data={music:null,hash:createHash('sha256').update(corrupt).digest('hex'),error:'音乐配置无法解析，请先恢复备份。'};}else data=backup;return {status:200,ok:true,text:async()=>JSON.stringify(data)};};vm.createContext(ctx);vm.runInContext(source('project-bridge.js'),ctx);await ctx.WebVideoProject.activate('demo');assert.match(ctx.WebVideoProject.state().error,/无法解析/);assert.equal((await ctx.WebVideoProject.listBackups()).length,1);vm.runInContext(source('tools-host.js')+'\nfunction ProbeBackupPanel(){};WebVideoTools.register("backups","备份与恢复",ProbeBackupPanel);WebVideoTools.open("backups");globalThis.tree=WebVideoToolsHost();',ctx);const serialized=JSON.stringify(ctx.tree,(_key,value)=>typeof value==='function'?value.name:value);assert.match(serialized,/ProbeBackupPanel/);
});

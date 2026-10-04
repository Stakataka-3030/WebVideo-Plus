// Run: node craft/tests/composed-feature-preflight.mjs
// Additional composition coverage, not a replacement for production tests or
// native acceptance. Requires Node 22+; uses repository sources and built-ins only.
// No network, native application, registry, or installer operation is performed.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';
import {joinBrowserScripts} from '../session/browser-payload.mjs';

const self=fileURLToPath(import.meta.url);
const craftRoot=path.resolve(path.dirname(self),'..');
const repoRoot=path.resolve(craftRoot,'..');
const tests=[
 'craft/tests/features-authoring.test.mjs',
 'craft/tests/features-review.test.mjs',
 'craft/tests/features-backups.test.mjs',
 'craft/tests/features-media.test.mjs',
 'craft/tests/features-ui.test.mjs',
 'craft/tests/navigation-description.test.mjs',
 'craft/tests/music-panel.test.mjs',
 'craft/tests/actual-time.test.mjs',
 'craft/tests/export-dialog.test.mjs',
 'craft/tests/command-panel.test.mjs',
 'tests/features-imports.test.mjs',
];
const main=process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;

if(main){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Node 22+ is required');
 console.log('Composed-library preflight: existing feature tests, all production library scripts in one closure');
 console.log('Excluded: features-media-ui.test.mjs has a minimal fake DOM without style support for the real composed music renderer; run it normally and retain native export acceptance');
 console.log('This harness omits production bootstrap/CSS; run browser-payload.test.mjs separately for exact full-payload mounting and actions');
 const result=spawnSync(process.execPath,['--import',import.meta.url,'--test',...tests],{
  cwd:repoRoot,stdio:'inherit',timeout:60000,
  env:{...process.env,WEBVIDEO_COMPOSED_FEATURE_PREFLIGHT:'1'},
 });
 if(result.error)throw result.error;
 if(result.signal)throw Error('Composed preflight terminated: '+result.signal);
 process.exitCode=result.status??1;
}else if(process.env.WEBVIDEO_COMPOSED_FEATURE_PREFLIGHT==='1'){
 // Read the two static source lists from the production builder. Fail on a
 // changed builder layout instead of silently omitting a newly added library.
 const builder=fs.readFileSync(path.join(craftRoot,'session/browser-payload.mjs'),'utf8');
 const local=builder.match(/const files=(\[[^\n]+\]);/);
 const shared=builder.match(/for\(const file of \[([^\n]+),\.\.\.files\]\)/);
 if(!local||!shared)throw Error('Production source-list layout changed; update composed preflight');
 const decode=text=>{
  const values=JSON.parse(text.replaceAll("'",'"'));
  if(!Array.isArray(values)||values.some(x=>typeof x!=='string'||!/^[-\w./]+\.js$/.test(x)))throw Error('Unsupported production source-list entry');
  return values;
 };
 const files=[...decode('['+shared[1]+']'),...decode(local[1])].map(file=>{
  const absolute=path.resolve(craftRoot,file),relative=path.relative(repoRoot,absolute);
  if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('Source outside repository');
  return absolute;
 });
 const sources=files.map(file=>fs.readFileSync(file,'utf8'));
 const known=new Set(sources),seen=new WeakSet(),dependencies=new WeakMap();
 const composed='(()=>{'+joinBrowserScripts(sources)+'return {novel:WebVideoNovel};})();';
 const original=vm.runInContext;
 vm.runInContext=function(code,context,options){
  // The existing import test reads this private core only to construct its
  // inert AI response. Do not publish the dependency into the browser global.
  if(code==='WebVideoNovel'&&dependencies.has(context))return dependencies.get(context).novel;
  if(!known.has(code))return original(code,context,options);
  if(seen.has(context))return;
  seen.add(context);
  for(const [key,value]of Object.entries({window:context,URL,TextEncoder,TextDecoder,crypto:webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,AbortSignal})){
   if(context[key]===undefined)context[key]=value;
  }
  // Preserve explicit per-test mocks; unrelated production exports still load.
  const preserved=Object.fromEntries(Object.entries(context).filter(([key])=>key.startsWith('WebVideo')));
  // Full composition also activates background UI watchers absent from some
  // standalone fixtures. Let them execute, but do not let idle watchers retain
  // the Node test process. No timer is cancelled or made to run early.
  const interval=context.setInterval,timer=context.setTimeout;
  context.setInterval=(...args)=>{const handle=interval(...args);handle?.unref?.();return handle;};
  context.setTimeout=(fn,ms,...args)=>{const handle=timer(fn,ms,...args);if(ms>=1000)handle?.unref?.();return handle;};
  dependencies.set(context,original(composed,context,options));
  Object.assign(context,preserved);
 };
}

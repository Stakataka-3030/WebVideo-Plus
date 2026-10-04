import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {KernelSession} from '../session/kernel.mjs';
const {createBridge}=createRequire(import.meta.url)('../host-bridge.js');
test('all four export kinds reach the queue through native snapshot and verified kernel identity',async()=>{
 const source='A:one;\nB:two;',bodies=[],invocations=[];
 const sourceHash=createHash('sha256').update(source).digest('hex');
 const stores={workspace:{currentGame:{id:'p',path:'C:/project'}},tabs:{activeTab:{path:'C:/project/game/scene/start.txt'}},file:{},editor:{hasUnsavedDocuments:false,getTextProjectionState:()=>({kind:'scene',textContent:source,isDirty:false}),peekSceneRevision:()=> 'r1',collectDocumentPathsUnder:()=>['C:/project/game/scene/start.txt']}};
 const owned={id:'owned-project',runtimeId:'open-webgal.webgal',engineVersion:'4.6.5'};
 const kernel=new KernelSession({root:'/unused',kernel:'/unused',storage:{get:id=>{assert.equal(id,'owned');return owned}}});kernel.discovery={baseUrl:'http://127.0.0.1:1',token:'fixture'};
 const originalFetch=globalThis.fetch;globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(options.body));return{ok:true,json:async()=>({id:'job'+bodies.length})}};
 const bridge=createBridge({getStores:()=>stores,registry:async()=>({enginePath:'C:/engine',templatePath:'C:/template',runtimeVersion:'4.6.5',runtimeId:'open-webgal.webgal'}),invoke:async(cmd,args)=>invocations.push([cmd,args]),rpc:async(method,p)=>{if(method==='snapshot.allocate')return{snapshotId:'owned',site:'C:/snapshot'};if(method==='snapshot.ready')return{snapshotId:'owned'};if(method==='export.start')return kernel.request({endpoint:'/api/jobs',snapshotId:p.snapshotId,data:p.options});throw Error(method)}});
 try{
  for(const kind of ['full','stage','dialog','audio']){
   const extension=kind==='audio'?'.wav':kind==='full'?'.mp4':'.webm';
   await bridge.exportVideo({scene:'start.txt',sourceText:source,exportKind:kind,includeBackground:kind!=='stage',includeFigures:kind!=='stage',transparentFormat:'webm',fileName:'test'+extension,storyScope:'sceneOnly',range:{startLine:1,endLine:2,sourceHash},useMusicTimeline:kind==='full',replaceGameBgm:kind==='full',settings:{gpuRawMode:'quality',width:1920,height:1080,fps:60,workers:4,engine:'untrusted'}});
  }
  assert.deepEqual(bodies.map(b=>b.exportKind),['full','stage','dialog','audio']);assert.equal(invocations.length,4);assert.ok(invocations.every(([name])=>name==='export_web'));
  for(const b of bodies){assert.equal(b.project,'owned-project');assert.equal(b.expectedRuntimeVersion,'4.6.5');assert.equal(b.settings.engine,'webgal');assert.equal(b.settings.gpuRawMode,'quality');assert.equal(b.range.sourceHash,createHash('sha256').update(b.sourceText).digest('hex'));assert.equal(b.sourceText,source)}
  assert.equal(bodies[1].includeBackground,false);assert.equal(bodies[1].includeFigures,false);assert.equal(bodies[2].transparentFormat,'webm');assert.equal(bodies[3].useMusicTimeline,false);
 }finally{globalThis.fetch=originalFetch}
});

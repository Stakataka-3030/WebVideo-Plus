import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildExportContractCases} from './export-contract-payloads.mjs';

test('assembled payload export forms submit complete contract cases through real controller, bridge and kernel',async()=>{
 const cases=await buildExportContractCases(),accepted=cases.filter(item=>item.accepted);
 assert.equal(accepted.length,40);
 const selected=accepted.find(item=>item.name==='selection').body;
 assert.equal(selected.range.sourceHash,createHash('sha256').update(selected.sourceText.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')).digest('hex'));
 assert.deepEqual([selected.range.startLine,selected.range.endLine],[1,2]);
 assert.equal(selected.storyScope,'sceneOnly');
 const minimal=accepted.find(item=>item.name==='minimal-full').body;
 assert.deepEqual([minimal.settings.width,minimal.settings.height,minimal.settings.fps,minimal.settings.workers],[1280,720,30,1]);
 assert.equal(minimal.settings.gpuRawMode,'recommended');assert.equal(minimal.range,undefined);
 for(const kind of ['stage','dialog','audio']){
  const body=accepted.find(item=>item.name===kind).body;
  assert.equal(body.exportKind,kind);assert.equal(body.useMusicTimeline,false);assert.equal(body.replaceGameBgm,false);assert.equal(body.subtitle,undefined);
 }
 assert.equal(accepted.find(item=>item.name==='audio').body.fileName,'video.wav');
 for(const kind of ['stage','dialog'])assert.equal(accepted.find(item=>item.name===kind+'-webm').body.fileName,'video.webm');
 assert.equal(cases.filter(item=>!item.accepted).length,8);
 // C# Settings/QueueService/VideoWorkflow rejection expectations are executed by
 // export-contract.portable.ps1, never replaced with another JavaScript validator.
});

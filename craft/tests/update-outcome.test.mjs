import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyOfficialUpdate,shouldRetainUpdateLock} from '../update/handoff-state.mjs';
const record={version:'1.0.1',supportedHosts:{},wrapperSha256:'wrapper',originalSha256:'original'};
for(const observed of [undefined,{state:'observed',pid:123},{state:'indeterminate'},{state:'exited'},{state:'not-started',launchAttempted:true}])test('unchanged wrapper cannot turn unknown outcome into safe-restart guidance '+JSON.stringify(observed),()=>{
 const result=classifyOfficialUpdate(record,observed,'wrapper');assert.equal(result.state,'indeterminate');assert.equal(result.automaticRemount,false);assert.match(result.message,/不要重复启动/);assert.equal(shouldRetainUpdateLock(true,observed),true);
});
test('trusted no-start and terminal failure keep explicit recoverable outcomes',()=>{
 const noStart={state:'not-started',launchAttempted:false};const result=classifyOfficialUpdate(record,noStart,'wrapper');assert.equal(result.state,'host-unchanged');assert.match(result.message,/未启动/);assert.equal(shouldRetainUpdateLock(true,noStart),false);
 assert.equal(classifyOfficialUpdate(record,{state:'exited',exitCode:5},'wrapper').state,'installer-failed');
});

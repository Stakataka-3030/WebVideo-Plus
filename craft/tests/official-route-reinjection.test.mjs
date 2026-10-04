import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {buildBrowserPayload} from '../session/browser-payload.mjs';
import {makeDocument,nodes} from './ui-dom.mjs';
import {createAppUpdateStore} from './update-host-fixture.mjs';

test('exact payload recovers after UI mount failure with one official subscription and one confirmation',async()=>{
 const {document,app,body}=makeDocument(),appUpdate=createAppUpdateStore();
 const pinia={_s:new Map([['app-update',appUpdate],['editor',{hasUnsavedDocuments:false}],['modal',{modalStack:new Map(),close(){}}],['resource',{activeProgress:new Map(),games:[],engines:[],templates:[]}]])};
 app.__vue_app__={config:{globalProperties:{$pinia:pinia}}};
 let fail=true,confirmations=0;const createElement=document.createElement;
 document.createElement=tag=>{if(fail&&tag!=='style')throw Error('synthetic UI mount failure');return createElement(tag);};
 const calls=[],alerts=[],native=Object.freeze({invoke:async(command)=>{
  calls.push(command);
  if(command==='plugin:updater|check')return {rid:29,version:'1.0.1',currentVersion:'1.0.0-beta.2',rawJson:{version:'1.0.1'}};
  if(command==='plugin:resources|close')return;
  throw Error('unexpected native action: '+command);
 }});
 const context=vm.createContext({document,console,URL,TextEncoder,TextDecoder,crypto:webcrypto,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},__TAURI_INTERNALS__:native,confirm:()=>{confirmations++;return false;},alert:value=>alerts.push(value),testBinding(){throw Error('cancelled route must not prepare');}});
 context.window=context;context.self=context;
 const payload=await buildBrowserPayload(fileURLToPath(new URL('..',import.meta.url)),{token:'inert-test',bindingName:'testBinding',verifiedHostProfile:{version:'1.0.0-beta.2',sha256:'3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d'}});
 assert.throws(()=>vm.runInContext(payload,context),/synthetic UI mount failure/);
 assert.equal(appUpdate.subscriptionState().actions,1);assert.equal(appUpdate.subscriptionState().state,1);
 const registry=context.__WebVideoCraftOfficialGuardRegistry;
 fail=false;const result=vm.runInContext(payload,context);assert.equal(result.mounted,true);assert.equal(result.diagnostics.length,0);
 assert.equal(context.__WebVideoCraftOfficialGuardRegistry,registry);assert.equal(context.__TAURI_INTERNALS__,native);
 assert.equal(appUpdate.subscriptionState().actions,1);assert.equal(appUpdate.subscriptionState().state,1);
 assert.equal(nodes(body).filter(node=>node.dataset.webvideoCraft==='tools').length,1);
 context.WebVideoCraftConfirmOfficialUpdate=async()=>{confirmations++;return false;};
 appUpdate.setAvailableUpdate({version:'1.0.1',currentVersion:'1.0.0-beta.2'});appUpdate.setUpdating();appUpdate.setDownloaded();
 for(let n=0;n<30;n++)await Promise.resolve();
 assert.equal(confirmations,1);assert.deepEqual(calls,['plugin:updater|check','plugin:resources|close']);assert.equal(alerts.length,0);assert.equal(appUpdate.isDownloaded,false);assert.equal(appUpdate.lastError,undefined);
 assert.equal(vm.runInContext(payload,context),result);assert.equal(appUpdate.subscriptionState().actions,1);
});

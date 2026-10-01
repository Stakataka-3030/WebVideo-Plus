import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {buildBrowserPayload,joinBrowserScripts} from '../session/browser-payload.mjs';
import {nodes,makeDocument} from './ui-dom.mjs';

test('script boundaries execute adjacent unterminated IIFEs and line comments',()=>{
 const c=vm.createContext({calls:[]});
 vm.runInContext(joinBrowserScripts(["(()=>{calls.push(1)})() // tail", "(()=>{calls.push(2)})()"]),c);
 assert.deepEqual(Array.from(c.calls),[1,2]);
});
for(const phase of ['initial injection','new document reinjection']) test(phase+' executes exact full production payload and mounts UI',async()=>{
 const {body,head,app,document}=makeDocument();
 app.__vue_app__={config:{globalProperties:{$pinia:{_s:new Map()}}}};
 const c=vm.createContext({document,console,URL,TextEncoder,TextDecoder,crypto:webcrypto,
   setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 c.window=c;c.self=c;c.__TAURI_INTERNALS__={invoke(){throw Error('No native mutation during assembly test');}};
 c.testBinding=()=>{throw Error('No RPC during assembly test');};
 const expression=await buildBrowserPayload(fileURLToPath(new URL('..',import.meta.url)),{token:'test-token',bindingName:'testBinding'});
 const result=vm.runInContext(expression,c,{timeout:5000});
 assert.equal(result.ui,true);assert.ok(c.WebVideoCraftBridge);assert.ok(c.WebVideoCraftUpdates);
 assert.ok(nodes(body).some(n=>n.dataset.webvideoCraft==='tools'));
 assert.equal(head.children.length,1);assert.match(head.children[0].textContent,/wvc-dock/);
 assert.ok(c.WebVideoCraftImports);assert.ok(c.WebVideoCraftMedia);assert.ok(c.WebVideoCraftBackups);
});

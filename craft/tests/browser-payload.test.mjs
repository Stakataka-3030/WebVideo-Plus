import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {buildBrowserPayload,joinBrowserScripts} from '../session/browser-payload.mjs';
class Node {
  constructor(tag = "div", text = "") {
    this.tagName = tag.toUpperCase();
    this._text = text;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.value = "";
    this.type = "";
    this.title = "";
    this.className = "";
    this.readOnly = false;
    this.files = [];
    const classes = new Set();
    this.classList = {
      toggle: (k, v) => {
        if (v) classes.add(k);
        else classes.delete(k);
      },
      contains: (k) => classes.has(k),
    };
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join("");
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get isConnected() {
    return this.tagName === "BODY" || !!this.parentNode?.isConnected;
  }
  append(...nodes) {
    for (const n of nodes) {
      n.remove?.();
      this.children.push(n);
      n.parentNode = this;
    }
  }
  replaceChildren(...nodes) {
    for (const n of this.children) n.parentNode = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k.startsWith("data-"))
      this.dataset[k.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] =
        String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  addEventListener(k, fn) {
    (this.listeners[k] ??= []).push(fn);
  }
  async emit(k, extra = {}) {
    for (const fn of this.listeners[k] || [])
      await fn({ target: this, preventDefault() {}, ...extra });
  }
  async click() {
    if (!this.disabled) await this.emit("click");
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.emit("close");
  }
  scrollIntoView() {}
  remove() {
    if (this.parentNode)
      this.parentNode.children = this.parentNode.children.filter(
        (n) => n !== this,
      );
    this.parentNode = null;
  }
}
function nodes(root) {
  return [root, ...root.children.flatMap(nodes)];
}

test('script boundaries execute adjacent unterminated IIFEs and line comments',()=>{
 const c=vm.createContext({calls:[]});
 vm.runInContext(joinBrowserScripts(["(()=>{calls.push(1)})() // tail", "(()=>{calls.push(2)})()"]),c);
 assert.deepEqual(Array.from(c.calls),[1,2]);
});
for(const phase of ['initial injection','new document reinjection']) test(phase+' executes exact full production payload and mounts UI',async()=>{
 const body=new Node('body'),head=new Node('head'); head.appendChild=head.append.bind(head);
 const app={__vue_app__:{config:{globalProperties:{$pinia:{_s:new Map()}}}}};
 const document={body,head,createElement:t=>new Node(t),createTextNode:t=>new Node('#text',t),querySelector:s=>s==='#app'?app:null};
 const c=vm.createContext({document,console,URL,TextEncoder,TextDecoder,crypto:webcrypto,
   setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 c.window=c;c.self=c;c.__TAURI_INTERNALS__={invoke(){throw Error('No native mutation during assembly test');}};
 c.testBinding=()=>{throw Error('No RPC during assembly test');};
 const expression=await buildBrowserPayload(fileURLToPath(new URL('..',import.meta.url)),{token:'test-token',bindingName:'testBinding'});
 const result=vm.runInContext(expression,c,{timeout:5000});
 assert.equal(result.ui,true);assert.ok(c.WebVideoCraftBridge);assert.ok(c.WebVideoCraftUpdates);
 assert.ok(nodes(body).some(n=>n.dataset.webvideoCraft==='tools'));
 assert.equal(head.children.length,1);assert.match(head.children[0].textContent,/wvc-dialog/);
 assert.ok(c.WebVideoCraftImports);assert.ok(c.WebVideoCraftMedia);assert.ok(c.WebVideoCraftBackups);
});

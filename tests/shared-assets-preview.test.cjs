const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const base = path.resolve(__dirname, '..');
const upstreamArg=process.argv.indexOf('--upstream');
if(upstreamArg<0||!process.argv[upstreamArg+1])throw Error('Usage: node tests/shared-assets-preview.test.cjs --upstream <pinned Terre source>');
const upstream = path.resolve(process.argv[upstreamArg+1]);
const ts = require(process.env.WVP_TEST_TYPESCRIPT || require.resolve('typescript',{paths:[upstream,upstream+'/packages/terre2',base+'/.build/shared-test-tools',base+'/.build/terre-adapter']}));
const evidence = [],allTransports=[];
const componentArg=process.argv.indexOf('--component');
const component=componentArg<0?path.join(base,'browser/shared-assets.js'):path.resolve(process.argv[componentArg+1]);
const busListeners=new Map();
const eventBus={on(k,fn){if(!busListeners.has(k))busListeners.set(k,new Set());busListeners.get(k).add(fn);},off(k,fn){busListeners.get(k)?.delete(fn);},emit(k,p){for(const fn of [...(busListeners.get(k)||[])])fn(p);}};
const tick = () => new Promise(resolve => setImmediate(resolve));
function loadTs(file, deps = {}) {
  const module = {exports: {}};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source, {module, exports: module.exports, require: name => {
    if (name in deps) return deps[name];
    return require(name);
  }, setTimeout, clearTimeout, console,window:{addEventListener(){}},document:{addEventListener(){},visibilityState:'visible'}}, {filename: file});
  return module.exports;
}
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; }
function harness(line, request, previewClient = {}, showPreview = () => {}) {
  busListeners.clear();
  let state={subPage:'Audit',isShowPreview:false},frame=null;const storeListeners=new Set(),messages=new Set(),timers=new Map();let timerId=0;
  const setState=change=>{const old=state;state={...state,...change};for(const fn of [...storeListeners])fn(state,old);};
  const store={getState:()=>state,subscribe:fn=>{storeListeners.add(fn);return()=>storeListeners.delete(fn);},use:{viewType:()=> 'grid',updateViewType:()=>()=>{},sortBy:()=> 'name',sortOrder:()=> 'asc'}};
  const mountFrame=(game='Audit')=>{frame={contentWindow:{location:{href:'http://audit/games/'+encodeURIComponent(game)}},contentDocument:{}};return frame;};
  const cells = [], effects = [], pending = [];
  let cursor = 0, dirty = true, tree, props;
  const R = {
    Fragment: 'Fragment',
    createElement(type, p, ...children) {if(typeof type==='function'&&type.name==='WebVideoSharedFileList')return {type:'List',props:{},children:p.entries.map(file=>({type:'Button',props:{onClick:()=>p.onOpen(file)},children:[file.name]}))};return {type,props:p || {},children:children.flat(Infinity).filter(x=>x!==null && x!==undefined && x!==false)};},
    useMemo(fn){cursor++;return fn();},
    useState(initial) { const i=cursor++; if (!(i in cells)) cells[i]=typeof initial==='function'?initial():initial; return [cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v;dirty=true;}]; },
    useRef(initial) {const i=cursor++; if (!(i in cells)) cells[i]={current:initial}; return cells[i];},
    useEffect(fn,deps) {const i=cursor++; const old=effects[i]; if (!old || !deps || deps.some((v,j)=>!Object.is(v,old.deps[j]))) {effects[i]={fn,deps,cleanup:old?.cleanup};pending.push(i);} }
  };
  const sandbox = {useSWRConfig:()=>({mutate:async key=>events.push({type:'local-assets-refresh',key})}),eventBus,useEditorStore:store,document:{getElementById:()=>frame},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),reactExports:R, Button:'Button', Input:'Input', WebVideoLocalAssets:'LocalAssets', crypto, AbortController, AbortSignal, URL, ArrowLeftIcon$1:'ArrowLeft',ArrowSyncIcon:'Refresh',FolderAddIcon:'AddFolder',GridIcon:'Grid',ListIcon:'List', CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail;}}, navigator:{clipboard:{writeText:async()=>{}}}, window:{location:{origin:'http://audit'},addEventListener:(name,fn)=>{if(name==='message')messages.add(fn);},removeEventListener:(name,fn)=>messages.delete(fn),confirm:()=>{throw Error('Confirmation interaction intentionally excluded');},dispatchEvent:e=>events.push(e),WebVideoTools:{state:()=>({context:{game:state.subPage,showPreview(){setState({isShowPreview:true});showPreview();}}})}},EditorPreviewClient:previewClient,fetch:async(url,opts)=>{if(opts?.signal?.aborted)throw Object.assign(Error('aborted'),{name:'AbortError'});if(url==='/assets/video-export-service.json')return {ok:true,status:200,json:async()=>({baseUrl:'http://127.0.0.1:42313',token:'fixture'})};const result=await fixtureRequest(new URL(url).pathname,opts?.body?JSON.parse(opts.body):undefined,opts?.signal);return {ok:true,status:200,json:async()=>result,text:async()=>JSON.stringify(result)};}};
  const events=[];sandbox.__WEBVIDEO_SHARED_ENABLED__=true;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(base,'browser/service-errors.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(component,'utf8')+'\nthis.api={Assets,WebVideoSharedAssets,WebVideoSharedMaterials};',sandbox);
  async function fixtureRequest(endpoint,...args){const value=await request(endpoint,...args);return endpoint==='/api/shared/libraries'?{...value,resourcePrefix:'http://audit/webvideo-shared/'+('b'.repeat(32))+'/'}:endpoint==='/api/shared/resolve'?{...value,url:'http://audit/webvideo-shared/'+('b'.repeat(32))+'/'+('a'.repeat(32))+'/a.png'}:value;}
  sandbox.api.WebVideoSharedMaterials.request=fixtureRequest;
  function render() {cursor=0;dirty=false;tree=sandbox.api.WebVideoSharedAssets(props); for(const i of pending.splice(0)){effects[i].cleanup?.();effects[i].cleanup=effects[i].fn();}}
  function nodes(n=tree,out=[]) {if(n && typeof n==='object'){out.push(n);for(const c of n.children || [])nodes(c,out);}return out;}
  function text(n) {return typeof n==='object'?(n.children||[]).map(text).join(''):String(n ?? '');}
  return {cells,events,api:sandbox.api,setState,mountFrame,frame:()=>frame,ready(value=true){eventBus.emit('editor-preview:ready',{ready:value});},bootstrap(){for(const fn of messages)fn({source:frame?.contentWindow,data:{type:'webgal.preview.bootstrap.request'}});},expire(){for(const fn of [...timers.values()])fn();},subscriptionCount:()=>storeListeners.size,pending:()=>timers.size,timerCount:()=>timerId,waiters:()=>busListeners.get('editor-preview:ready')?.size,
    mount(p={}){props={rootPath:['games','Audit','game'],basePath:['figure'],isProtected:true,...p};render();},
    async flush(){for(let i=0;i<8;i++){await tick();if(dirty)render();}return tree;},
    button(label){const n=nodes().find(n=>(n.type==='Button' || n.type==='button') && text(n)===label);assert.ok(n,'button '+label);return n;},
    async click(label){const result=this.button(label).props.onClick();await this.flush();return result;},
    async select(label,value){const n=nodes().find(n=>n.props['aria-label']===label);assert.ok(n,label);n.props.onChange({target:{value}});await this.flush();},
    text(){return text(tree);},unmount(){for(const e of effects)e?.cleanup?.();}
  };
}
const lib={id:'a'.repeat(32),kind:'figure',name:'Fixture',root:'X:/fixture'};
const entry={name:'a.png',path:'a.png',extName:'.png',isDir:false,size:24};
async function ready(line, options={}) {
  const calls=[];
  const request=async(endpoint,data,signal)=>{calls.push({endpoint,data});if(options.request)return options.request(endpoint,data,calls,signal);if(endpoint==='/api/shared/libraries')return {libraries:[lib]};if(endpoint==='/api/shared/list')return {entries:[entry]};if(endpoint==='/api/shared/copy')return {reference:'a/a.png'};if(endpoint==='/api/shared/resolve')return {file:'X:/fixture/a.png'};if(endpoint==='/api/shared/dialog')return {canceled:true};throw Error('Unexpected '+endpoint);};
  const h=harness(line,request,options.previewClient,()=>options.showPreview?.(h));h.mount({selectedFilePath:['figure','__shared',lib.id,'a.png'],...options.props});await h.flush();await h.click('a.png');return {h,calls};
}

async function audit() {
 const protocol=loadTs(upstream+'/packages/editor-preview-protocol/src/index.ts');
 const {EditorPreviewHost,LegacyEditorPreviewAdapter}=loadTs(upstream+'/packages/terre2/src/Modules/websocket/editorPreviewHost.ts',{'@webgal/editor-preview-protocol':protocol});
 const {createEditorPreviewTransport}=loadTs(upstream+'/packages/origine2/src/utils/editorPreviewTransport.ts');
 function session(){
  const legacy=new LegacyEditorPreviewAdapter();const host=new EditorPreviewHost({forwardPreviewCommandToLegacy:e=>legacy.forwardPreviewCommand(e)});
  const ack=[],received=[],sent=[];let transport,sequence=0;
  const editor={send:s=>{const e=JSON.parse(s);ack.push(e);socket.onmessage?.({data:s});},close(){}};
  host.acceptConnection(editor,{headers:{'sec-websocket-protocol':protocol.EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL}});
  const socket={readyState:1,onopen:null,onmessage:null,onclose:null,onerror:null,send:s=>{const e=JSON.parse(s);if(e.type.startsWith('preview.command.'))sent.push(e);host.handleMessage(editor,s);},close(){}};
  const preview={send:s=>received.push(JSON.parse(s)),close(){}};
  const register=()=>{host.acceptConnection(preview,{headers:{'sec-websocket-protocol':protocol.EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL}});host.handleMessage(preview,JSON.stringify(protocol.createRequestEnvelope('session.register-preview','reg',{gameId:'Audit',embeddedLaunchId:'audit-launch'})));host.handleMessage(preview,JSON.stringify(protocol.createEventEnvelope('preview.ready.updated',{ready:true})));};
  const requestOwner=loadTs(upstream+'/packages/origine2/src/utils/editorPreviewRequestOwner.ts',{'@webgal/editor-preview-protocol':protocol});
  const {EditorPreviewClient:client}=loadTs(upstream+'/packages/origine2/src/utils/editorPreviewClient.ts',{
   '@webgal/editor-preview-protocol':protocol,'@/utils/editorPreviewRequestOwner':requestOwner,
   '@/store/useEditorStore':{__esModule:true,default:{getState:()=>({debugVariables:[]})}},
   '@/utils/createId':{createId:()=>String(++sequence)},'@/utils/eventBus':{eventBus},
   '@/utils/getWsUrl':{getWsUrl:()=> 'ws://audit/api/webgalsync'},'@/utils/logger':{logger:{info(){},warn(){},error(){}}},
   '@/utils/editorPreviewTransport':{createEditorPreviewTransport:options=>(transport=createEditorPreviewTransport({...options,createSocket:()=>socket}))}
  });
  client.ensureConnected();socket.onopen();allTransports.push(transport);
  return {client,register,transport,sent,ack,requests:()=>received.filter(x=>x.kind==='request'&&x.type.startsWith('preview.command.')),disconnect(){socket.readyState=3;socket.onclose?.();}};
 }
 const record=name=>{evidence.push({name,passed:true});console.error('PASS: '+name);};
 {
  const s=session();const {h}=await ready('',{previewClient:s.client,showPreview(h){setImmediate(()=>{h.mountFrame();h.bootstrap();s.register();});}});
  await h.click('预览');assert.equal(s.requests().length,2,'closed preview must receive both commands on the first click');assert.deepEqual(s.sent.map(x=>x.type),['preview.command.set-component-visibility','preview.command.run-snippet']);assert.equal(s.requests()[0].payload.showStarter,false);assert.equal(s.requests()[1].payload.snippet,'changeFigure:http://audit/webvideo-shared/'+('b'.repeat(32))+'/'+lib.id+'/a.png;');assert.equal(h.pending(),0);assert.equal(h.subscriptionCount(),1);record('closed preview: first click waits for registration, then sends exactly visibility + snippet');
  const count=s.requests().length,timerCount=h.timerCount();await h.click('预览');assert.equal(h.timerCount(),timerCount,'ready path must not allocate a wait timer');assert.equal(s.requests().length,count+2);assert.equal(h.pending(),0);record('already ready: immediate send, no polling or wait timer left');h.unmount();s.transport.dispose();
 }
 {
  const s=session();const {h}=await ready('',{previewClient:s.client});const click=h.button('预览').props.onClick;const a=click(),b=click();await h.flush();assert.equal(s.sent.length,0);h.mountFrame();h.bootstrap();s.register();await Promise.all([a,b]);await h.flush();assert.equal(s.sent.length,2);assert.equal(h.pending(),0);record('duplicate clicks while opening produce exactly one command pair');h.unmount();s.transport.dispose();
 }
 {
  const s=session();const {h}=await ready('',{previewClient:s.client});const p=h.button('预览').props.onClick();await h.flush();h.expire();await p;await h.flush();assert.equal(s.sent.length,0);assert.match(h.text(),/预览.*就绪/);assert.ok(!h.text().includes('正在处理'));assert.equal(h.pending(),0);assert.equal(h.subscriptionCount(),1);h.mountFrame();h.bootstrap();s.register();assert.equal(s.sent.length,0);record('timeout reports a readable error, releases busy, and never replays on later ready');h.unmount();s.transport.dispose();
 }
 {
  const s=session();const {h}=await ready('',{previewClient:s.client});h.setState({isShowPreview:true});h.mountFrame();h.bootstrap();s.register();s.disconnect();const p=h.button('预览').props.onClick();await h.flush();assert.equal(s.sent.length,0,'closed transport must invalidate cached readiness');h.expire();await p;await h.flush();assert.match(h.text(),/预览.*(就绪|断开)/);record('disconnected editor transport sends no command and reports a readable error');h.unmount();s.transport.dispose();
 }
 for(const mode of ['project switch','unmount','preview close']){
  const s=session();const {h}=await ready('',{previewClient:s.client});const p=h.button('预览').props.onClick();await h.flush();
  if(mode==='project switch')h.setState({subPage:'Other'});else if(mode==='unmount')h.unmount();else h.setState({isShowPreview:false});
  h.mountFrame();h.bootstrap();s.register();await p;await h.flush();assert.equal(s.sent.length,0);assert.equal(h.pending(),0);record(mode+': canceled operation does not send on a later ready event');h.unmount();s.transport.dispose();
 }
 {
  const s=session();const {h}=await ready('',{previewClient:s.client});const p=h.button('预览').props.onClick();await h.flush();h.mountFrame('Other');s.register();await h.flush();assert.equal(s.sent.length,0,'wrong-project iframe cannot satisfy readiness');h.mountFrame();h.bootstrap();s.register();await p;assert.equal(s.sent.length,2);record('wrong-project iframe ready ignored; matching current frame can complete');h.unmount();s.transport.dispose();
 }
 {
  const s=session();const {h}=await ready('',{previewClient:s.client});h.setState({isShowPreview:true});h.mountFrame();h.bootstrap();s.register();h.setState({isShowPreview:false});const p=h.button('预览').props.onClick();await h.flush();assert.equal(s.sent.length,0,'previously ready closed frame must not be reused');h.mountFrame();h.bootstrap();s.register();await p;assert.equal(s.sent.length,2);record('closing/reopening preview invalidates old frame readiness');h.unmount();s.transport.dispose();
 }
 {
  const d=deferred();const s=session();const {h}=await ready('',{previewClient:s.client,request:e=>e.endsWith('libraries')?{libraries:[lib]}:e.endsWith('list')?{entries:[entry]}:e.endsWith('resolve')?d.promise:{}});const p=h.button('预览').props.onClick();h.unmount();d.resolve({});await p;assert.equal(s.sent.length,0);assert.equal(h.pending(),0);record('unmount during asset resolve never opens or sends later');s.transport.dispose();
 }
 {
  const d=deferred();const s=session();let opened=0;const {h}=await ready('',{previewClient:s.client,showPreview:()=>opened++,request:e=>e.endsWith('libraries')?{libraries:[lib]}:e.endsWith('list')?{entries:[entry]}:e.endsWith('resolve')?d.promise:{}});const p=h.button('预览').props.onClick();h.setState({subPage:'Other'});d.resolve({});await p;assert.equal(s.sent.length,0);assert.equal(opened,0);assert.equal(h.pending(),0);record('project switch during resolve never opens the next project preview');h.unmount();s.transport.dispose();
 }
 {
  const s=session();s.client.setComponentVisibility=()=>false;const {h}=await ready('',{previewClient:s.client});h.setState({isShowPreview:true});h.mountFrame();h.bootstrap();s.register();await h.click('预览');assert.equal(s.sent.length,0);assert.match(h.text(),/连接已断开/);record('visibility send failure is visible and suppresses snippet');h.unmount();s.transport.dispose();
 }
 {
  const s=session();const {h}=await ready('',{previewClient:s.client,showPreview:()=>{throw Error('open failed');}});await h.click('预览');assert.equal(h.pending(),0);assert.equal(s.sent.length,0);assert.match(h.text(),/open failed/);assert.equal(h.subscriptionCount(),1);record('preview open failure clears its timer and waiter');h.unmount();s.transport.dispose();
 }

 for(const mode of ['document reload','ready false']){
  const s=session();const {h}=await ready('',{previewClient:s.client});h.setState({isShowPreview:true});h.mountFrame();h.bootstrap();s.register();
  if(mode==='document reload')h.frame().contentDocument={};else h.ready(false);
  const p=h.button('预览').props.onClick();await h.flush();assert.equal(s.sent.length,0);h.bootstrap();s.register();await p;assert.equal(s.sent.length,2);assert.equal(h.pending(),0);record(mode+': invalidates cached readiness until the current frame is ready again');h.unmount();s.transport.dispose();
 }

 {
  const d=deferred();const s=session();let reopened=0;
  const {h}=await ready('',{previewClient:s.client,showPreview:()=>reopened++,request:e=>e.endsWith('libraries')?{libraries:[lib]}:e.endsWith('list')?{entries:[entry]}:e.endsWith('resolve')?d.promise:{}});
  h.setState({isShowPreview:true});h.mountFrame();h.bootstrap();s.register();
  const subscriptions=h.subscriptionCount(),p=h.button('预览').props.onClick();
  assert.equal(h.subscriptionCount(),subscriptions+1,'operation must observe closes before resolve settles');
  h.setState({isShowPreview:false});d.resolve({});await h.flush();
  const sentBeforeLaterReady=s.sent.length;
  h.mountFrame();h.bootstrap();s.register();await p;await h.flush();
  console.error('CLOSE_DURING_RESOLVE '+JSON.stringify({reopened,sentBeforeLaterReady,sentAfterLaterReady:s.sent.length,pendingTimers:h.pending(),subscriptionsBefore:subscriptions,subscriptionsAfter:h.subscriptionCount()}));
  assert.equal(reopened,0,'closing preview while resolve is pending must cancel the operation, not reopen it');
  assert.equal(s.sent.length,0,'canceled preview must not send on later ready');
  assert.equal(h.subscriptionCount(),subscriptions,'operation subscription must be released after cancel');
  assert.equal(h.pending(),0);assert.ok(!h.text().includes('正在处理'));record('preview close during resolve cancels before opening or sending and releases its subscription');
  h.unmount();s.transport.dispose();
 }

 for(const mode of ['abort-aware resolve','resolve failure']){
  const s=session();let opened=0;
  const {h}=await ready('',{previewClient:s.client,showPreview:()=>opened++,request:(e,data,calls,signal)=>e.endsWith('libraries')?{libraries:[lib]}:e.endsWith('list')?{entries:[entry]}:e.endsWith('resolve')?(mode==='resolve failure'?Promise.reject(Error('resolve failed')):new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('resolve canceled'),{name:'AbortError'})),{once:true}))):{}});
  h.setState({isShowPreview:true});h.mountFrame();h.bootstrap();s.register();
  const subscriptions=h.subscriptionCount(),p=h.button('预览').props.onClick();
  if(mode==='abort-aware resolve')h.setState({isShowPreview:false});
  await p;await h.flush();assert.equal(h.subscriptionCount(),subscriptions);assert.equal(opened,0);assert.equal(s.sent.length,0);assert.equal(h.pending(),0);assert.ok(!h.text().includes('正在处理'));
  if(mode==='resolve failure')assert.match(h.text(),/resolve failed/);else assert.ok(!h.text().includes('resolve canceled'));
  record(mode+': releases operation subscription and busy state without opening or sending');h.unmount();s.transport.dispose();
 }

}
const deadline=setTimeout(()=>{console.error('Preview regression did not settle');for(const t of allTransports)t.dispose();process.exit(1);},10000);
(async()=>{await audit();console.log(JSON.stringify({passed:evidence.length,scope:'production shared component + official client/request-owner/host/transport in memory; no browser/HTTP attack replay',tests:evidence},null,2));})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(deadline);for(const t of allTransports)t.dispose();});

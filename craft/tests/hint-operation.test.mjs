import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {hintPageOperation,runHint} from '../session/hint-operation.mjs';
function fixture(){
 let now=0,id=0,clicks=0,visible=true;const timers=new Map(),observers=[];
 const state={GUI:{},userData:{globalGameVar:{},optionData:{}}};
 const option={text:'提示',jump:'__wvp_hint_a',jumpToScene:false};
 const props={chooseOptions:[option]};const store={getState:()=>state};
 const item={isConnected:true,textContent:'提示',getAttribute:()=>null,getClientRects:()=>[{}],click:()=>{clicks++},'__reactProps$x':{onClick(){}}};
 const outer={children:[item],firstElementChild:item};const main={children:[outer],firstElementChild:outer};
 const container={isConnected:true,firstElementChild:main,_reactRootContainer:{_internalRoot:{current:{memoizedProps:{store},child:{memoizedProps:props}}}}};
 const context=vm.createContext({window:{},location:{origin:'http://localhost:3000',pathname:'/',search:''},document:{getElementById:()=>visible?container:null},getComputedStyle:()=>({}),performance:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:id=>timers.delete(id),MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){this.off=true}}});
 const base={origin:'http://localhost:3000',path:'',search:'',ticket:'a',duration:100,text:'提示',key:'__wvp_hint_a'};
 const invoke=(action='start',extra={})=>vm.runInContext(`(${hintPageOperation.toString()})(${JSON.stringify({...base,action,...extra})})`,context);
 const advance=ms=>{const end=now+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn()}now=end};
 return {invoke,advance,item,outer,main,container,props,option,state,context,store,observers,visible:v=>visible=v,clicks:()=>clicks};
}
test('single verified option clicks once after actual display duration',()=>{const f=fixture();f.invoke();f.advance(99);assert.equal(f.clicks(),0);f.advance(1);assert.equal(f.clicks(),1);assert.equal(f.invoke('status').state,'completed');f.advance(1000);assert.equal(f.clicks(),1)});
test('duration starts at appearance, not invocation',()=>{const f=fixture();f.visible(false);f.invoke();f.advance(200);f.visible(true);f.advance(40);f.advance(99);assert.equal(f.clicks(),0);f.advance(1);assert.equal(f.clicks(),1)});
for(const [label,mutate] of Object.entries({text:f=>f.item.textContent='其他',key:f=>f.option.jump='other',multiple:f=>f.main.children.push({}),handler:f=>f.item.__reactProps$x.onClick=()=>{},choices:f=>f.props.chooseOptions=[{...f.option}],gui:f=>f.state.GUI={},game:f=>f.state.userData.globalGameVar={changed:true},page:f=>f.context.location.search='?other',dom:f=>{f.outer.firstElementChild={...f.item}},mutation:f=>f.observers[0].fn()})){
 test(`changed ${label} cancels without clicking`,()=>{const f=fixture();f.invoke();mutate(f);f.advance(120);assert.equal(f.clicks(),0);if(label!=='page')assert.equal(f.invoke('status').state,'cancelled')});
}
test('wrong reserved target fails closed before capture',()=>{const f=fixture();f.option.jump='ordinary_choice';f.invoke();f.advance(6000);assert.equal(f.invoke('status').state,'failed');assert.equal(f.clicks(),0)});
test('new ticket supersedes old and old cancellation cannot affect new',()=>{const f=fixture();f.invoke();f.advance(30);f.invoke('start',{ticket:'b'});assert.equal(f.invoke('cancel').state,'not-current');f.advance(100);assert.equal(f.clicks(),1);assert.equal(f.invoke('status',{ticket:'b'}).state,'completed')});
test('explicit cancellation prevents delayed click',()=>{const f=fixture();f.invoke();f.invoke('cancel');f.advance(1000);assert.equal(f.clicks(),0)});
test('later tick failures terminate safely',()=>{const f=fixture();f.invoke();f.store.getState=()=>{throw Error('store gone')};f.advance(40);assert.equal(f.invoke('status').state,'failed');assert.equal(f.clicks(),0)});
test('throwing click is failed, never retried',()=>{const f=fixture();f.item.click=()=>{throw Error('click failed')};f.invoke();f.advance(100);assert.equal(f.invoke('status').state,'failed');f.advance(100);assert.equal(f.clicks(),0)});
const request={url:'http://localhost:3000/',ticket:'a',text:'提示',key:'__wvp_hint_a',duration:100};
function transport(frames=[{id:'preview',url:request.url}],contexts=[{id:7,origin:'http://localhost:3000',auxData:{frameId:'preview',isDefault:true}}]){const calls=[];return {calls,contexts:new Map(contexts.map(c=>[c.id,c])),cdp:{async call(method,args){calls.push({method,args});if(method==='Page.getFrameTree')return {frameTree:{frame:frames[0],childFrames:frames.slice(1).map(frame=>({frame}))}};assert.equal(args.contextId,7);assert.equal(args.awaitPromise,undefined);return {result:{value:{ticket:'a',state:'completed',clicked:true}}}}}}}
test('wrapper uses exact default context and short synchronous evaluation',async()=>{const f=transport();assert.equal((await runHint(f.cdp,f.contexts,request)).state,'completed');assert.equal(f.calls.length,2)});
test('ambiguous frame uses routing error',async()=>{const f=transport([{id:'a',url:request.url},{id:'b',url:request.url}]);await assert.rejects(runHint(f.cdp,f.contexts,request),/预览目标必须唯一/)});
test('missing default context uses routing error',async()=>{const f=transport(undefined,[]);await assert.rejects(runHint(f.cdp,f.contexts,request),/当前预览不支持设置桥/)});
for(const update of [{url:'https://example.com/'},{ticket:'bad ticket'},{key:'ordinary'},{duration:99},{duration:60001},{text:'a\nb'}])test(`reject invalid request ${JSON.stringify(update)}`,async()=>{await assert.rejects(runHint({},new Map(),{...request,...update}))});
test('cancellation diagnostics identify changed guards without serializing state values',()=>{const f=fixture();f.state.GUI={showMenuPanel:false};f.invoke();f.state.GUI={showMenuPanel:true};f.advance(40);const result=f.invoke('status');assert.deepEqual(Array.from(result.guardChanges.identities),['gui']);assert.deepEqual(Array.from(result.guardChanges.guiFields),['showMenuPanel']);assert.equal(JSON.stringify(result).includes('showMenuPanel":true'),false)});

test('native equal globalGameVar replacement does not cancel a stable choice',()=>{const f=fixture();f.state.userData.globalGameVar={Game_key:'fixture',a:1,nested:{enabled:true}};f.invoke();f.advance(40);f.state.userData.globalGameVar={nested:{enabled:true},a:1,Game_key:'fixture'};f.advance(60);assert.equal(f.clicks(),1);assert.equal(f.invoke('status').state,'completed')});
test('captured variable values detect in-place nested mutation',()=>{const f=fixture();f.state.userData.globalGameVar={nested:{value:1}};f.invoke();f.state.userData.globalGameVar.nested.value=2;f.advance(100);assert.equal(f.clicks(),0);assert.equal(f.invoke('status').state,'cancelled')});
test('variable deletion and missing versus undefined still cancel',()=>{for(const change of [g=>delete g.key,g=>g.key=undefined]){const f=fixture();f.state.userData.globalGameVar={key:null};f.invoke();change(f.state.userData.globalGameVar);f.advance(100);assert.equal(f.clicks(),0);assert.equal(f.invoke('status').state,'cancelled')}});
test('array and in-place primitive changes cancel despite stable container identity',()=>{for(const mutate of [g=>g.value=2,g=>g.list.push(2),g=>g.list[0]=2,g=>g.newKey=true]){const f=fixture();f.state.userData.globalGameVar={value:1,list:[1]};f.invoke();mutate(f.state.userData.globalGameVar);f.advance(100);assert.equal(f.clicks(),0);assert.equal(f.invoke('status').state,'cancelled')}});
test('cyclic, unsupported and excessive-depth variable state fail closed',()=>{const cyclic={};cyclic.self=cyclic;let deep={};for(let i=0;i<40;i++)deep={child:deep};for(const game of [cyclic,deep,{bad:()=>{}},{bad:NaN}]){const f=fixture();f.state.userData.globalGameVar=game;f.invoke();f.advance(100);assert.equal(f.clicks(),0);assert.equal(f.invoke('status').state,'failed')}});

test('variable encoder bounds strings, keys and arrays and rejects array extra properties',()=>{const extra=[];extra.foo=1;for(const game of [{large:'x'.repeat(262145)},{['x'.repeat(262145)]:1},{list:new Array(10001)},{list:extra}]){const f=fixture();f.state.userData.globalGameVar=game;f.invoke();assert.equal(f.invoke('status').state,'failed');assert.equal(f.clicks(),0)}});

test('deleting an undefined array entry fails closed rather than equating a hole',()=>{const f=fixture();f.state.userData.globalGameVar={list:[undefined]};f.invoke();delete f.state.userData.globalGameVar.list[0];f.advance(100);assert.equal(f.clicks(),0);assert.equal(f.invoke('status').state,'failed')});

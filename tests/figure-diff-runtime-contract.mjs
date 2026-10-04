// Executes the unchanged SHA-pinned 4.6.5 diff dispatcher and URL classifier.
// Its ordinary changeFigure delegate and animation side effects are observed
// collaborators; ordinary identity/motion is tested in cubism2-runtime-465-contract.
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const bundle=fs.readFileSync(process.argv[2],'utf8');
assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'),'356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6');
const between=(a,b)=>{const start=bundle.indexOf(a),end=bundle.indexOf(b,start+a.length);assert.ok(start>=0&&end>start);return bundle.slice(start,end);};
const dispatcher=between('function Swe(e){','function wwe('),classifier=between('function iU(e){','const xg='),extension='const '+between('nU=e=>','function iU(');
const cases=[
 {source:undefined,target:'b.png',args:{clear:true,bounds:'1,2,3,4',enter:'fade'},result:'ordinary'},
 {source:'a.png',target:'',args:{clear:true},result:'ordinary'},
 {source:'a.png',target:'none',args:{exit:'fade'},result:'ordinary'},
 {source:'a.png',target:'b.png',args:{clear:true,left:true,bounds:'9,9,9,9',enter:'ignored'},result:'diff'},
 {source:'a.png',target:'a.png',args:{clear:true},result:'noop'},
 {source:undefined,target:'model.json',args:{clear:true},result:'rejected'},
 {source:'model.json',target:'none',args:{},result:'rejected'},
 {source:'a.png',target:'b.png?%74ype=%73pine',args:{clear:true},result:'rejected'},
 {source:'a.png',target:'b.png?type=texture&type=spine',args:{},result:'diff'},
];
for(const ext of ['svg','bmp','avif'])cases.push({source:'a.'+ext,target:'b.png',args:{},result:'diff'},{source:'b.png',target:'a.'+ext,args:{},result:'diff'});
for(const test of cases){
 const ctx=vm.createContext({URL,document:{baseURI:'http://engine/'}});
 vm.runInContext(`
  const state={freeFigure:[]},trace={ordinary:[],associated:[],marks:[],warns:[]};
  const X={getCalculationStageState:()=>state,setFreeFigureByKey:o=>{state.freeFigure=[o];},setStage:(k,v)=>state[k]=v};
  const Ue=(s,k)=>s.args.find(a=>a.key===k)?.value,C_=s=>['left','right'].find(k=>Ue(s,k)),zd={},Ls='none';
  const K={warn:x=>trace.warns.push(x)},gr=()=>({kind:'noop'}),A$=e=>{trace.ordinary.push(e);return {kind:'ordinary'};},E$=(e,n)=>trace.associated.push(n),wwe=n=>({kind:'diff',target:n});
  const R={figureDiffManager:{mark:(n,data)=>trace.marks.push({target:n,...data})}},bwe=new Set(['id','next','continue','when']);
  ${extension}${classifier}const xwe=e=>iU(e).kind!=='texture';${dispatcher}
  globalThis.state=state;globalThis.trace=trace;globalThis.apply=Swe;
 `,ctx);
 if(test.source)ctx.state.freeFigure.push({key:'actor',name:test.source,basePosition:'right',scale:2});
 const sentence={content:test.target,args:Object.entries({id:'actor',...test.args}).map(([key,value])=>({key,value}))};
 const result=ctx.apply(sentence);
 assert.equal(result.kind,test.result==='rejected'?'noop':test.result,JSON.stringify(test));
 if(test.result==='ordinary'){assert.equal(ctx.trace.ordinary.length,1);assert.equal(ctx.trace.ordinary[0],sentence,'Fallback must forward all original arguments unchanged');}
 else assert.equal(ctx.trace.ordinary.length,0);
 if(test.result==='diff'){assert.equal(ctx.state.freeFigure[0].basePosition,'right');assert.equal(ctx.state.freeFigure[0].scale,2);assert.equal(ctx.state.freeFigure[0].name,test.target);assert.equal(ctx.trace.marks.length,1);}
 if(test.result==='rejected')assert.equal(ctx.trace.associated.length,0,'Model rejection precedes ordinary clear/none fallback');
}
console.log(`PASS ${cases.length} actual WebGAL4.6.5 image-diff dispatch, state retention, first/empty fallback and model/URL rejection cases`);

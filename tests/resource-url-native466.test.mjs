// Unchanged official parser/assetSetter plus WHATWG URL semantics; no SDK/model input.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtime=process.env.WEBGAL466_ROOT||path.join(repo,'.build/upstream466/web');
const entry=path.join(runtime,'assets/index-Dcp3ZA1M.js');
const available=fs.existsSync(entry);
if(process.env.WEBGAL466_ROOT)assert.ok(available,'Explicit WEBGAL466_ROOT must contain the official 4.6.6 release');
const source=available?fs.readFileSync(entry,'utf8'):'';
if(available)assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'d2b34606a380b9575ce1e50ed2251cb5e38b3d6f9b00200b2b0f252a13d209c0','The upstream parser oracle must use unchanged official bytes');
const check=(name,fn)=>test(name,{skip:available?false:'Set WEBGAL466_ROOT to the exact official 4.6.6 release'},fn);
const plain=value=>JSON.parse(JSON.stringify(value));
function slice(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,a);assert.equal(source.indexOf(a,start+a.length),-1,'Unique oracle anchor '+a);return source.slice(start,end);}
function oracle(){
 const context={};context.globalThis=context;vm.createContext(context);
 // Only the asset-category collaborator is substituted; GU/qo are byte-exact.
 vm.runInContext('const kr={vocal:5};'+slice('function GU(','function K_e(')+slice('const qo=',',W_e=')+';globalThis.parse=raw=>GU(raw,qo);',context);
 return raw=>plain(context.parse(raw));
}
check('official 4.6.6 old-style vocal keeps separator whitespace while explicit vocal trims its value',()=>{
 const parse=oracle();
 for(const spaces of [1,2,3]){
  const suffix=' '.repeat(spaces)+'-figureId=hero';
  assert.deepEqual(parse(' -demo/line.wav'+suffix),[{key:'vocal',value:'./game/vocal/demo/line.wav'+' '.repeat(spaces-1)},{key:'figureId',value:'hero'}]);
  assert.deepEqual(parse(' -vocal=demo/line.wav'+suffix),[{key:'vocal',value:'./game/vocal/demo/line.wav'},{key:'figureId',value:'hero'}]);
 }
});
check('official 4.6.6 old-style vocal preserves internal and fullwidth spaces and percent escapes',()=>{
 const parse=oracle();
 for(const name of ['speaker/one line.wav','speaker/one  line.wav','speaker/one\u3000line.wav','speaker/line.wav\u3000','speaker/line%20.wav','speaker/line.wav%20']){
  assert.equal(parse(' -'+name+'  -figureId=hero')[0].value,'./game/vocal/'+name+' ');
 }
});
check('official old-style parsed vocal flows through production timing lookup, workload mouth target and offline audio input',()=>{
 const parse=oracle(),productionRoot=process.env.WEBVIDEO_SOURCE_ROOT||repo;
 const timeline=fs.readFileSync(path.join(productionRoot,'browser/timeline.js'),'utf8');
 const prefix='const normalize=src=>',start=timeline.indexOf(prefix),end=timeline.indexOf(',mediaTimers=',start);
 assert.ok(start>=0&&end>start,'Unique production HTMLMediaElement duration-key normalization');
 assert.equal(timeline.indexOf(prefix,start+prefix.length),-1);
 const context={URL,location:{href:'http://localhost/'}};context.globalThis=context;vm.createContext(context);
 vm.runInContext('globalThis.nativeDurationKey=src=>'+timeline.slice(start+prefix.length,end)+';'+fs.readFileSync(path.join(productionRoot,'browser/audio.js'),'utf8')+'\n'+fs.readFileSync(path.join(productionRoot,'browser/workload.js'),'utf8'),context);
 for(const name of ['speaker/one line.wav','speaker/one  line.wav','speaker/line.wav\u3000','speaker/one%20line.wav','speaker/line.wav%2520'])for(const count of [1,2,3]){
  const args=parse(' -'+name+' '.repeat(count)+'-figureId=hero'),vocal=args.find(a=>a.key==='vocal').value,key=context.nativeDurationKey(vocal);
  const statement={command:0,commandRaw:'',content:'unchanged dialogue',args,startLine:0,endLine:0},script=':unchanged dialogue -'+name+' '.repeat(count)+'-figureId=hero;';
  const plan=context.__buildNativeWorkload({script,parsed:{sentenceList:[statement]},animations:{},media:{[key]:{durationMs:650,hasAudio:true}},root:'C:/fixture',project:'C:/fixture',sceneName:'start.txt',fps:30,timing:{lineTimes:[0],durationSeconds:2,sourceEvents:[],stageExitWindows:[],performWindows:[]}});
  assert.equal(plan.audio[0].path,'C:/fixture'+key);assert.equal(plan.audio[0].endMs,650);assert.equal(plan.audio[0].target,'hero');
  assert.ok(vm.runInContext('audioMixArguments',context)(plan.audio,2,[]).includes('C:/fixture'+key));
  assert.equal(statement.content,'unchanged dialogue');
 }
});

// Model the proposed C#/workload preprocessing, before decoding the pathname.
const physical=raw=>decodeURIComponent(String(raw??'').replace(/[\u0000-\u0020]+$/u,'').replace(/[\t\r\n]/g,'').split(/[?#]/,1)[0]).replaceAll('\\','/');
const browserPhysical=raw=>decodeURIComponent(new URL(raw,'http://localhost/').pathname);
const cases=[
 ['/game/vocal/line.wav','/game/vocal/line.wav'],
 ['/game/vocal/line.wav ','/game/vocal/line.wav'],
 ['/game/vocal/line.wav  ','/game/vocal/line.wav'],
 ['/game/vocal/one line.wav ','/game/vocal/one line.wav'],
 ['/game/vocal/one  line.wav ','/game/vocal/one  line.wav'],
 ['/game/vocal/one\u3000line.wav ','/game/vocal/one\u3000line.wav'],
 ['/game/vocal/line.wav\u3000 ','/game/vocal/line.wav\u3000'],
 ['/game/vocal/one%20line.wav ','/game/vocal/one line.wav'],
 ['/game/vocal/line.wav%20 ','/game/vocal/line.wav '],
 ['/game/vocal/line.wav%2520 ','/game/vocal/line.wav%20'],
 ['/game/vocal/line.wav?download=1 ','/game/vocal/line.wav'],
 ['/game/vocal/line.wav#voice ','/game/vocal/line.wav'],
 ['/game/vocal/line.wav ?download=1','/game/vocal/line.wav '],
 ['/game/vocal/line.wav #voice','/game/vocal/line.wav '],
 ['/game/vocal/one\tline.wav\r\n ','/game/vocal/oneline.wav'],
 ['/game/vocal/line.wav\u0000\u001f ','/game/vocal/line.wav'],
 ['/game/vocal/line.wav%09 ','/game/vocal/line.wav\t'],
 ['/game/vocal/line.wav%3F%23 ','/game/vocal/line.wav?#'],
];
test('URL preprocessing precedes query/hash removal and decoding without folding filename spaces',()=>{
 for(const [raw,expected]of cases){assert.equal(browserPhysical(raw),expected,JSON.stringify(raw));assert.equal(physical(raw),expected,JSON.stringify(raw));}
});
test('decoded trailing space is distinct from separator padding and cannot alias the no-space file',()=>{
 assert.notEqual(browserPhysical('/game/vocal/line.wav%20 '),browserPhysical('/game/vocal/line.wav '));
 assert.notEqual(browserPhysical('/game/vocal/line.wav ?download=1'),browserPhysical('/game/vocal/line.wav?download=1 '));
 assert.notEqual(browserPhysical('/game/vocal/line.wav\u3000 '),browserPhysical('/game/vocal/line.wav '));
});

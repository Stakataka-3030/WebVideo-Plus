import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),base=fs.readFileSync(path.join(root,'baseline/terre-4.6.4.js'),'utf8'),translations=new Map();
for(const match of base.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)":"([^"\\]*(?:\\.[^"\\]*)*)"/g)){try{const key=JSON.parse('"'+match[1]+'"'),value=JSON.parse('"'+match[2]+'"');if(/[\u4e00-\u9fff]/.test(value)&&!translations.has(key))translations.set(key,value);}catch{}}
const sandbox={reactExports:{useMemo:fn=>fn()},i18n:{_:({id})=>translations.get(id)||id}};vm.createContext(sandbox);
for(const [name,end] of [['useEffectEditorConfig','function getValueByPath'],['useEaseTypeOptions','function TerrePanel']]){const start=base.indexOf('const '+name+'='),finish=base.indexOf(end,start);if(start<0||finish<start)throw Error('Native metadata anchor missing: '+name);vm.runInContext(base.slice(start,finish),sandbox);}
const config=vm.runInContext('useEffectEditorConfig()',sandbox),eases=Object.fromEntries(vm.runInContext('useEaseTypeOptions()',sandbox));
config.fieldGroups[2].keys.push('colorRed','colorGreen','colorBlue');config.fieldGroups[4].keys.push('bevelRed','bevelGreen','bevelBlue');
const fields=Object.fromEntries(Object.entries(config.effectConfig).map(([key,value])=>[key,{label:value.label,path:value.path,default:value.slider?.defaultValue??0}]));
const nativeEffects=Object.fromEntries([['snow','u/Wc2v'],['heavySnow','DYpFps'],['rain','Ero88N'],['cherryBlossoms','AFjvIu']].map(([key,id])=>[key,translations.get(id)||key]));
const speakerPositions=Object.fromEntries(Object.entries({center:"hfB0wu",left:"+b1cs9",right:"mL9DmJ",left13:"CoS0hc",right13:"X9IlUv",left14:"HW2q4S",right14:"msP/39"}).map(([key,id])=>[key,translations.get(id)||key]));
// Built-in character ID to display-name map. Intentionally empty until the user supplies it.
const characterNames=Object.fromEntries(JSON.parse(readFactory()).rows.map(row=>[row.id.toLowerCase(),shortCharacterName(row.names)]));
function shortCharacterName(names){const aliases=names.split(';').map(name=>name.trim()),full=aliases[0];return aliases.filter(name=>name.length<full.length&&full.toLowerCase().endsWith(name.toLowerCase())).sort((a,b)=>b.length-a.length)[0]||full.split(/[ \u3000]+/).at(-1);}
function readFactory(){return fs.readFileSync(path.join(root,'character-map.factory.json'),'utf8').replace(/^\uFEFF/,'');}
const filterPresets=JSON.parse(fs.readFileSync(path.join(root,"filter-presets.factory.json"),"utf8").replace(/^\uFEFF/,"")).filters;
const effectPresets=JSON.parse(fs.readFileSync(path.join(root,"preset-effects.factory.json"),"utf8")).effects;
const result={effectPresets,filterPresets,speakerPositions,characterNames,nativeEffects,fields,groups:config.fieldGroups,eases,blink:{blinkInterval:{label:'眨眼间隔',default:86400000},blinkIntervalRandom:{label:'眨眼间隔随机变化',default:1000},openingDuration:{label:'睁眼',default:150},closingDuration:{label:'闭眼',default:100},closedDuration:{label:'保持闭眼',default:50}},focus:{x:{label:'注视点 X',default:0},y:{label:'注视点 Y',default:0},instant:{label:'立即注视',default:false}},positions:{center:'中间',left:'左侧',right:'右侧',left13:'左侧 1/3',right13:'右侧 1/3',left14:'左侧 1/4',right14:'右侧 1/4'}};
fs.writeFileSync(path.join(root,'browser/navigation-metadata.js'),'globalThis.WebVideoNavigationMetadata='+JSON.stringify(result,null,2)+';\n');
console.log('Navigation metadata extracted from native Terre: '+Object.keys(fields).length+' effect fields, '+result.groups.length+' groups.');

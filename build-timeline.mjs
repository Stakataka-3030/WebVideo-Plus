import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const versions=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
await import('./build-navigation-metadata.mjs');
const id='[A-Za-z_$][A-Za-z0-9_$]*';
const graphicalScope={scopeStart:'function GraphicalEditor(',scopeEnd:'jsxRuntimeExports.jsx(EditorSideBar,{})'};
const rowScope={scopeStart:'SentenceRowContent=',scopeEnd:',SentenceRow=reactExports.memo'};
const textScope={scopeStart:'脚本编辑器挂载',scopeEnd:'function JsonResourceDisplay('};
const patches=[
  {...graphicalScope,regex:`function GraphicalEditor\\((?<props>${id})\\)\\{const\\[(?<data>${id}),(?<setData>${id})\\]=`,replace:'function GraphicalEditor(${props}){const wvpLoaded=reactExports.useRef(false);const[${data},${setData}]='},
  {...graphicalScope,regex:`(?<update>${id})\\((?<sentences>${id})\\),eventBus\\.emit\\("editor:update-scene",\\{scene:(?<text>${id})\\}\\)(?=\\};${id}\\.get\\()`,replace:'${update}(${sentences}),wvpLoaded.current=true,eventBus.emit("editor:update-scene",{scene:${text}})'},
  {find:'jsxRuntimeExports.jsx(EditorSideBar,{}),jsxRuntimeExports.jsx(MainArea,{})]',replace:'jsxRuntimeExports.jsx(EditorSideBar,{}),jsxRuntimeExports.jsx(MainArea,{}),jsxRuntimeExports.jsx(WebVideoTimelineHost,{})]'},
  {...textScope,regex:`(?=[\\s\\S]*?reactExports\\.useEffect\\(\\(\\)=>\\(\\)=>(?<flush>${id})\\.flush\\(\\),\\[\\k<flush>\\]\\)[\\s\\S]*?editorLineHolder\\.getScenePosition\\((?<props>${id})\\.targetPath\\))(?<ref>${id})\\.current=(?<editor>${id}),(?<configure>${id})\\(\\k<editor>,(?<monaco>${id})\\),\\k<editor>\\.onDidChangeCursorPosition`,replace:'${ref}.current=${editor},WebVideoPlus.attachMonaco(${editor},${props}.targetPath,()=>${flush}.flush()),${configure}(${editor},${monaco}),${editor}.onDidChangeCursorPosition'},
  {...textScope,regex:`(?<ready>${id})\\.value=!0;const (?<position>${id})=editorLineHolder\\.getScenePosition\\((?<props>${id})\\.targetPath\\);`,replace:'${ready}.value=!0;WebVideoPlus.monacoReady(${props}.targetPath);const ${position}=editorLineHolder.getScenePosition(${props}.targetPath);'},
  {...rowScope,regex:'children:at\\.title\\(\\)',replace:'children:WebVideoSingleLineHint.graphicalTitle(g,at.title())'},
  {...rowScope,regex:'style:\\{padding:"0 6px 0 0"\\},children:st',replace:'style:{padding:"0 6px 0 0"},children:WebVideoSingleLineHint.graphicalLineLabel(g,st)'},
  {...graphicalScope,regex:`(?=[\\s\\S]*?,(?<update>${id})=reactExports\\.useCallback\\((?<newItems>${id})=>\\{${id}\\.current=\\k<newItems>,${id}\\(\\k<newItems>\\)\\},\\[\\]\\))(?=[\\s\\S]*?,(?<factory>${id})=reactExports\\.useCallback\\((?<content>${id})=>\\(\\{id:createId\\(\\),content:\\k<content>,show:!0\\}\\),\\[\\]\\))(?=[\\s\\S]*?const (?<text>${id})=reactExports\\.useMemo\\(\\(\\)=>mergeToString\\()(?=[\\s\\S]*?,(?<rows>${id})=reactExports\\.useMemo\\(\\(\\)=>${id}\\.sentenceList\\.filter\\()(?<prefix>function GraphicalEditor\\([\\s\\S]*?)(?<items>${id})=(?<virtualizer>${id})\\.getVirtualItems\\(\\);reactExports\\.useEffect\\(\\(\\)=>\\{const (?<line>${id})=editorLineHolder\\.getSceneLine\\((?<props>${id})\\.targetPath\\)`,replace:'${prefix}${items}=${virtualizer}.getVirtualItems();reactExports.useEffect(()=>WebVideoPlus.attachGraphical(${props}.targetPath,${text},${rows},${virtualizer},wvpLoaded.current,text=>${update}(splitToArray(text).map(${factory}))),[${props}.targetPath,${text},${rows},${virtualizer},wvpLoaded.current]);reactExports.useEffect(()=>{const ${line}=editorLineHolder.getSceneLine(${props}.targetPath)'},
  {...graphicalScope,regex:`(?<rows>${id})=reactExports\\.useMemo\\(\\(\\)=>(?<parsed>${id})\\.sentenceList\\.filter\\((?<sentence>${id})=>!\\k<sentence>\\.isLineBreakHolder\\),\\[\\k<parsed>\\]\\)`,replace:'${rows}=reactExports.useMemo(()=>WebVideoSingleLineHint.graphicalSentences(${parsed}.sentenceList.filter(${sentence}=>!${sentence}.isLineBreakHolder)),[${parsed}])'},
];
const base=read('baseline/terre-4.6.4.js');
for(const p of patches){
  if(p.find){if(base.split(p.find).length!==2)throw Error('Timeline anchor must be unique: '+p.find);continue;}
  const start=base.indexOf(p.scopeStart),end=start<0?-1:base.indexOf(p.scopeEnd,start+p.scopeStart.length);
  if(start<0||end<0)throw Error('Timeline scoped anchor boundaries missing: '+p.scopeStart);
  const matches=base.slice(start,end).match(new RegExp(p.regex,'g'))||[];
  if(matches.length!==1)throw Error('Timeline scoped anchor expected 1 match, got '+matches.length+': '+p.regex);
}
const gamePatches=[{find:'children:[jsxRuntimeExports.jsx("div",{children:_e}),jsxRuntimeExports.jsx("div",{children:d})]',replace:'children:[jsxRuntimeExports.jsx("div",{children:_e}),jsxRuntimeExports.jsxs("div",{children:[d,jsxRuntimeExports.jsx(WebVideoPresetRibbonButton,{})]})]'},{find:'onChoose:Tt,onOpenChange:Ot=>!Ot&&ot(null)',replace:'onChoose:Tt,insertLine:nt?.insertLine,onOpenChange:Ot=>!Ot&&ot(null)'},{find:'pickSentenceType([commandType.bgm,commandType.video,commandType.playEffect])',replace:'pickSentenceType([commandType.video,commandType.playEffect])'},{find:'pickSentenceType([commandType.setTempAnimation,commandType.setTransition])',replace:'[...pickSentenceType([commandType.setTempAnimation,commandType.setTransition]),jsxRuntimeExports.jsx(WebVideoSingleLineHintTopbarButton,{key:"wvp-single-line-hint"})]'}];
const gameStart=base.indexOf('jsxRuntimeExports.jsxs(TabItem,{title:i18n._({id:"Wh0Wxu"})'),gameEnd=base.indexOf(']})}const backButton=',gameStart);
if(gameStart<0||gameEnd<0)throw Error('Game group boundaries changed');
gamePatches.push({find:base.slice(gameStart,gameEnd),replace:'jsxRuntimeExports.jsx(WebVideoGameTools,{})'});
const addDialogStart=base.indexOf('function AddSentenceDialog(_e){'),addDialogEnd=base.indexOf('function ',addDialogStart+20);
if(addDialogStart<0||addDialogEnd-addDialogStart>8000)throw Error('Add dialog structure changed');
gamePatches.push({find:base.slice(addDialogStart,addDialogEnd),replace:'function AddSentenceDialog(_e){return reactExports.createElement(WebVideoAddSentenceDialog,_e);}' });
for(const patch of gamePatches)if(base.split(patch.find).length!==2)throw Error('Game-tool anchor must be unique: '+patch.find);
const mapStart=base.indexOf('gt(i18n._({id:"YjDE9d"})'),mapEnd=base.indexOf(',gt(',mapStart);if(mapStart<0||mapEnd<0)throw Error('Appreciation menu anchor missing');
const oldAppreciation=base.slice(mapStart,mapEnd),mapPatches=[{find:oldAppreciation,replace:'(_e==="appreciation"?'+oldAppreciation+':gt("角色 ID",jsxRuntimeExports.jsx(WebVideoCharacterMapButton,{})))'},{find:'const gt=(pt,mt,vt=!1)=>_e==="quick"?',replace:'const gt=(pt,mt,vt=!1)=>(_e==="appreciation"&&pt!==i18n._({id:"YjDE9d"}))?null:_e==="quick"?'}];
for(const patch of mapPatches)if(base.split(patch.find).length!==2)throw Error('Character mapping menu anchor not unique');
fs.mkdirSync(path.join(root,'package/product-ui'),{recursive:true});
for(const patch of gamePatches)patch.scope=patch.find.includes('onChoose:Tt')||patch.find.startsWith('children:')||patch.find.startsWith('function AddSentenceDialog(')||patch.replace.includes('WebVideoSingleLineHintTopbarButton')?'presets':'compact';
fs.writeFileSync(path.join(root,'package/product-ui/game-patches.json'),JSON.stringify(gamePatches,null,2));
const menuPatches=[
 {find:'jsxRuntimeExports.jsx(Tab,{value:"help",children:i18n._({id:"tBIZt9"})}),',replace:''},
 {find:'tt==="help"&&jsxRuntimeExports.jsx(HelpTab,{}),',replace:''},
 {find:'jsxRuntimeExports.jsx(GameConfig,{mode:"quick"}),',replace:'jsxRuntimeExports.jsx(GameConfig,{mode:"quick"}),jsxRuntimeExports.jsx(WebVideoPresetConfigEntry,{}),jsxRuntimeExports.jsx(WebVideoAiKeyEntry,{}),jsxRuntimeExports.jsx(WebVideoHelpEntry,{}),'},
 {find:'function nt(gt){it(gt)}const ot=gt=>{nt(gt)};',replace:'reactExports.useEffect(()=>{if(tt==="help")it("config")},[tt]);function nt(gt){it(gt)}const ot=gt=>{nt(gt)};'},
 {find:'text:i18n._({id:"KyQ6e8"})})]})}),jsxRuntimeExports.jsx(Toaster,{toasterId:j})',replace:'text:i18n._({id:"KyQ6e8"})}),jsxRuntimeExports.jsx(WebVideoExportMenuActions,{})]})}),jsxRuntimeExports.jsx(Toaster,{toasterId:j})'}
];
function configEntry(id){const start=base.indexOf('gt(i18n._({id:"'+id+'"})');if(start<0)throw Error('Config entry missing: '+id);let depth=0,quote='',escape=false;for(let i=start+2;i<base.length;i++){const c=base[i];if(escape){escape=false;continue;}if(quote){if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='(')depth++;else if(c===')'&&--depth===0)return base.slice(start,i+1);}throw Error('Config entry unclosed');}
for(const id of ['QFGCRR','GUjz+8','iLuKDS']){const entry=configEntry(id);menuPatches.push({find:entry,replace:'(_e==="quick"?null:'+entry+')'});}
for(const patch of menuPatches)if(base.split(patch.find).length!==2)throw Error('Menu patch anchor must be unique: '+patch.find.slice(0,80));
fs.writeFileSync(path.join(root,'package/product-ui/menu-patches.json'),JSON.stringify(menuPatches,null,2));

fs.writeFileSync(path.join(root,'package/product-ui/character-map-patches.json'),JSON.stringify(mapPatches,null,2));
fs.mkdirSync(path.join(root,'package/timeline'),{recursive:true});
fs.mkdirSync(path.join(root,'package/product-ui'),{recursive:true});
for(const name of ['toolbar.js','toolbar.css','game-tools.js','editor-runtime.js'])fs.copyFileSync(path.join(root,'browser',name),path.join(root,'package/product-ui',name));
fs.appendFileSync(path.join(root,'package/product-ui/editor-runtime.js'),'\n'+read('browser/character-map.js')+'\n'+read('browser/menu-actions.js')+'\n'+read('browser/automatic-backups.js')+'\n'+read('browser/ai-config.js'));
for(const name of ['timeline-core.js','timeline.css'])fs.copyFileSync(path.join(root,'browser',name),path.join(root,'package/timeline',name));
fs.writeFileSync(path.join(root,'package/timeline/timeline-core.js'),read('browser/navigation-metadata.js')+'\n'+read('browser/navigation-model.js')+'\n'+read('browser/filter-library.js')+'\n'+read('browser/preset-library.js')+'\n'+read('browser/timing-tasks.js')+'\n'+read('browser/timeline-core.js'));
fs.writeFileSync(path.join(root,'package/timeline/timeline.css'),read('browser/timeline.css')+'\n'+read('browser/timeline-theme.css'));
// Git may check out browser sources with CRLF on Windows; normalize before line-boundary extraction.
let host=read('browser/timeline-host.js').replace(/\r\n?/g,'\n');
for(const [variable,module] of [['nav','navigator'],['modal','selector']]){
  const prefix=`  const ${variable}=`,line=host.split('\n').find(l=>l.startsWith(prefix));if(!line||!line.endsWith(';'))throw Error('Module view boundary missing');
  fs.writeFileSync(path.join(root,`package/timeline/${module}.js`),line.slice(prefix.length,-1));
  host=host.replace(line,`${prefix}__WEBVIDEO_${module.toUpperCase()}_VIEW__;`);
}
const launcherStart=host.indexOf('function WebVideoSelectionButton(){');if(launcherStart<0)throw Error('Selector launcher boundary missing');
fs.writeFileSync(path.join(root,'package/timeline/selector-launcher.js'),host.slice(launcherStart));
fs.writeFileSync(path.join(root,'package/timeline/timeline-host.js'),read('browser/selection-controls.js')+'\n'+read('browser/navigation-view.js')+'\n'+host.slice(0,launcherStart));
fs.writeFileSync(path.join(root,'package/timeline/patches.json'),JSON.stringify(patches,null,2));
fs.writeFileSync(path.join(root,'package/product.json'),JSON.stringify({name:'WebVideo+',version:versions.productVersion,kernelVersion:versions.kernelVersion,terreVersion:'4.6.4',modules:{timelineNavigator:{dependencies:['timelineCore'],files:['timeline/navigator.js']},timelineSelector:{dependencies:['timelineCore'],files:['timeline/selector.js','timeline/selector-launcher.js']},exporter:{dependencies:['exportKernel','WebView2','FFmpeg']}},supportedOriginalBundleSha256:JSON.parse(read('baseline/local-baseline.json')).baseHash},null,2));
console.log('Timeline assets and exact Terre integration anchors verified.');
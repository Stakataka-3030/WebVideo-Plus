import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8');
function parserFixture(version){
 const bundle=read('baseline/terre-'+version+'.js'),start=bundle.indexOf('var commandType$1;'),end=bundle.indexOf('function TabItem(',start);assert.ok(start>=0&&end>start);
 const context=vm.createContext({});vm.runInContext('const bo=(o,k,v)=>(o[k]=v);'+bundle.slice(start,end)+';globalThis.parse=parseScene;globalThis.types=commandType;',context);
 vm.runInContext(read('browser/timeline-core.js'),context);vm.runInContext(read('browser/export-component.js'),context);
 return {context,derive:source=>context.WebVideoTimelineCore.derive('games/demo/game/scene/start.txt',source,context.parse(source),context.types)};
}
for(const version of ['4.6.4','4.6.5']){
test(version+' real Terre parser preserves independent CutHere comments without adding executable content',()=>{
 const f=parserFixture(version),model=f.derive('A:first;\n ;CutHere \nwait:100;\nB:second;');
 assert.equal(f.context.webVideoCutMarkerCount(model),1);
 assert.equal(model.statements[1].command,'comment');assert.equal(model.statements[1].startLine,2);assert.equal(model.statements[1].endLine,2);
 assert.deepEqual(Array.from(model.statements.filter(row=>row.command!=='comment'),row=>row.command),['say','wait','say']);
});
test(version+' real multiline and inline syntax never promote literal marker text into cuts',()=>{
 const f=parserFixture(version);
 for(const source of ['A:literal\\;CutHere;','A:text;CutHere','A:first\\\n;CutHere\nB:next;',';cuthere\nA:test;','; CutHere\nA:test;',';CutHere trailing\nA:test;'])assert.equal(f.context.webVideoCutMarkerCount(f.derive(source)),0,source);
 assert.equal(f.context.webVideoCutMarkerCount(f.derive(';CutHere\n; note\n;CutHere\nA:test;\n;CutHere')),3);
});
function nodes(node){return !node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flatMap(nodes)];}
test(version+' existing selector cut-point purpose exposes wait/technical statements and returns original IDs',()=>{
 const f=parserFixture(version),model=f.derive('A:first;\n;CutHere\nwait:100;\nB:second;');
 const selection=new f.context.WebVideoTimelineCore.Selection();selection.bind(model);const wait=model.statements.find(row=>row.command==='wait');
 let chosenSnapshot=null;const api={state:()=>({selection}),close:confirm=>{if(confirm)chosenSnapshot=selection.snapshot();}};
 const context={reactExports:{createElement:(type,props,...children)=>({type,props:{...props,children}}),useMemo:fn=>fn()},useWebVideoInlineSelection:()=>({selected:new Set([wait.id]),setSelected(){},list:{},move(){},stop(){},down(){},choose(){}})};
 vm.createContext(context);const host=read('browser/timeline-host.js'),from=host.indexOf('function WebVideoStorySelector('),to=host.indexOf('function WebVideoSelectionButton(',from);vm.runInContext(host.slice(from,to),context);
 const tree=context.WebVideoStorySelector({api,model,mode:'set',dark:false,dialogRef:{},purpose:'cutPoints'});
 const options=nodes(tree).filter(node=>node.props.role==='option');assert.equal(options.length,3,'Every non-comment statement must be selectable');
 assert.ok(nodes(tree).some(node=>node.props['aria-label']==='选择切点语句'));
 nodes(tree).find(node=>node.type==='button'&&node.props.className==='primary').props.onClick();
 assert.deepEqual(Array.from(chosenSnapshot.statements,row=>[row.id,row.startLine,row.endLine]),[[wait.id,3,3]]);
 const normal=context.WebVideoStorySelector({api,model,mode:'set',dark:false,dialogRef:{}});
 assert.equal(nodes(normal).filter(node=>node.props.role==='option').length,2,'Existing generic selector remains unchanged');
});

}

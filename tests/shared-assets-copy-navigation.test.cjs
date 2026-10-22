const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),all=[];const arg=process.argv.indexOf('--upstream');if(arg<0)throw Error('Use --upstream <pinned Terre source>');const upstream=path.resolve(process.argv[arg+1]);
async function check(line){
 const test=path.join(base,'tests/shared-assets-preview.test.cjs'),source=fs.readFileSync(test,'utf8').split('async function audit()')[0];
 const box={require,__dirname:path.join(base,'tests'),process:{argv:['node',test,'--upstream',upstream],env:process.env},console,setTimeout,clearTimeout,setImmediate,AbortController,AbortSignal,URL};vm.createContext(box);vm.runInContext(source+'\nthis.review={ready};',box);
 const {h}=await box.review.ready('',{props:{basePath:[],isProtected:false}});
 const find=(n,p)=>{if(n&&typeof n==='object'){if(p(n))return n;for(const c of n.children||[]){const f=find(c,p);if(f)return f;}}};
 let tree=await h.flush(),local=find(tree,n=>n.type==='LocalAssets');local.props.webVideoPathChanged(['figure','角色 目录']);await h.flush();await h.click('a.png');
 tree=await h.flush();const before=find(tree,n=>n.type==='LocalAssets');await h.click('复制到当前项目');tree=await h.flush();const after=find(tree,n=>n.type==='LocalAssets');
 assert.equal(before.props.key,undefined);assert.equal(after.props.key,undefined);assert.equal(h.cells[0].join('/'),'figure/角色 目录');assert.match(h.text(),/打开副本/);
 const refresh=h.events.filter(e=>e.type==='local-assets-refresh');assert.equal(refresh.length,1);assert.equal(refresh[0].key,'games/Audit/game/figure');
 // A later shared action clears notice; it must not reset the native list instance either.
 await h.click('a.png');tree=await h.flush();assert.equal(find(tree,n=>n.type==='LocalAssets').props.key,undefined);assert.equal(h.cells[0].join('/'),'figure/角色 目录');
 all.push({line,passed:true,preservedPath:h.cells[0].join('/'),copyFollowupPresentAfterCopy:true,nativeRefreshes:refresh.length,nativeRefreshKey:refresh[0].key,noNoticeBasedRemount:true});h.unmount();
}
(async()=>{await check('current');console.log(JSON.stringify(all,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});

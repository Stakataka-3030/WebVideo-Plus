import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The native probe extracts these functions from hash-checked real engines
// after applying production EngineAdapter.Patch, not from a synthetic bundle.
assert.ok(process.argv.length>2,'Pass at least one native probe function fixture');
for (const file of process.argv.slice(2)) {
  const fixture=JSON.parse(fs.readFileSync(file,'utf8'));
  const body=fixture.guarded;
  const store=body.match(/if\(([\w$]+)\.getState\(\)\.GUI/)[1];
  const core=body.match(/\|\|([\w$]+)\.sceneManager/)[1];
  const calls=body.match(/const ([\w$]+)=([\w$]+)\(-1,!1\),([\w$]+)=([\w$]+)\(\1\);([\w$]+)\.dispatch\(([\w$]+)\.setFastSave\(\3\)\),await ([\w$]+)\(\)/);
  assert.ok(calls,'Native quick-save construction/dispatch/persist contract');
  const [, ,makeSave,,clone,dispatchStore,actions,persist]=calls;
  function context({marker=true,title=false,line=1,locked=false,fail=false}={}) {
    const seen=[];
    const ctx={
      [store]:{getState:()=>({GUI:{showTitle:title}}),dispatch:action=>seen.push(['dispatch',action])},
      [core]:{sceneManager:{sceneData:{currentSentenceId:line},lockSceneWrite:locked}},
      [makeSave]:(...args)=>{seen.push(['make',...args]);if(fail)throw Error('save fixture failure');return {backlog:['fixture']};},
      [clone]:value=>{seen.push(['clone']);return value;},
      [actions]:{setFastSave:value=>({value})},
      [persist]:async()=>{seen.push(['persist']);},
      __nativeAdapterInstalled:marker,
    };
    assert.equal(dispatchStore,store);
    vm.createContext(ctx);
    vm.runInContext('globalThis.save='+body,ctx);
    return {ctx,seen};
  }
  const exporting=context();await exporting.ctx.save();assert.deepEqual(exporting.seen,[],'Export skips before copying any state or backlog');
  for (const marker of [false,undefined]) {
    const playing=context({marker:false});playing.ctx.__nativeAdapterInstalled=marker;await playing.ctx.save();
    assert.deepEqual(playing.seen.map(x=>x[0]),['make','clone','dispatch','persist'],'Normal game still builds and persists its quick save');
    assert.deepEqual(playing.seen[0],['make',-1,false],'Native screenshot policy is retained');
  }
  for (const conditions of [{title:true},{line:0},{locked:true}]) {
    const playing=context({marker:false,...conditions});await playing.ctx.save();assert.deepEqual(playing.seen,[],'Native save preconditions remain intact');
  }
  const failure=context({marker:false,fail:true});await assert.rejects(failure.ctx.save(),/save fixture failure/,'Real game errors must remain visible');
  assert.equal(body.replace('if(globalThis.__nativeAdapterInstalled===true)return;',''),fixture.native,'Only the export guard changes the native automatic-save function');
  console.log(`PASS ${fixture.engine.id} ${fixture.engine.version}: early suppression, normal persistence, native preconditions and error propagation`);
}

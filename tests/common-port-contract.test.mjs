import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('offline mute is scoped to clock installation and retains runtime startup',()=>{
 const host=read('src/BrowserHost.cs');
 assert.match(host,/InstallClock\(bool media,bool deterministic,object runtimeStartup=null\)\{View\.CoreWebView2\.IsMuted=true;/);
 assert.match(host,/RuntimeStartup\.Script\(runtimeStartup\)/);
 assert.match(read('browser/timing-tasks.js'),/runtimeStartup/);
});
test('shared ID panel defaults to preserving existing IDs and Craft retains unchecked controls',()=>{
 assert.match(read('browser/id-tools.js'),/\[overwrite,setOverwrite\]=R\.useState\(false\)/);
 assert.match(read('craft/ui/main.js'),/overwrite = check\("覆盖已有 ID"\)/);
});
test('timing response uses saved source hash with canonical snapshot fallback',()=>{
 const source=read('src/QueueService.cs');
 assert.match(source,/static string TimingSourceHash\(object request\)/);
 assert.match(source,/hash!=""\|\|!File\.Exists\(snapshot\)\?hash:Files\.HashText\(VideoWorkflow\.CanonicalSource\(File\.ReadAllText\(snapshot\)\)\)/);
 assert.match(source,/"sourceHash",TimingSourceHash\(timingRequest\)/);
});

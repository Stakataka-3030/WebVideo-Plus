import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('test-only injection has one exact anchor and leaves production error handling intact',()=>{
 const source=read('src/BrowserHost.cs');
 assert.equal(source.split('await View.EnsureCoreWebView2Async(environment);').length-1,1);
 assert.ok(!source.includes('SyntheticNavigationTrace'));
 assert.ok(source.includes('Errors.Add(J.S(o,"message"))'));
 assert.ok(read('src/Planner.cs').includes('if(browser.Errors.Count>0)throw new IOException'));
 assert.ok(!read('build.ps1').includes('SyntheticNavigation'));
 const builder=read('tests/build-navigation-diagnostic.ps1');
 assert.ok(builder.includes(".Replace($anchor,$anchor+'await SyntheticNavigationTrace.Attach(View);')"));
 assert.ok(builder.includes('hookMatches=1'));
 assert.ok(builder.includes('generatedBrowserHostSha256'));
 assert.ok(builder.includes("$support=Join-Path $OutputRoot 'package'"));
});

test('original graphics gate stays on the uninstrumented exporter and observation is additional',()=>{
 const fixture=read('tests/figure-diff-native.ps1');
 assert.ok(fixture.includes("$exe = Join-Path $PackageRoot 'WebGAL.Video.exe'"));
 assert.ok(!fixture.includes('Navigation'));
 const workflow=read('.github/workflows/native-smoke.yml');
 assert.ok(workflow.indexOf('.\\tests\\figure-diff-native.ps1 -RuntimeRoot .build/webgal-4.6.5')<workflow.indexOf('- name: Observe synthetic planning navigation'));
 assert.match(workflow,/- name: Observe synthetic planning navigation[^\n]*\r?\n\s+if: always\(\)/);
 assert.ok(!workflow.includes('continue-on-error'));
 const observation=read('tests/observe-figure-navigation.ps1');
 assert.ok(observation.includes('[ValidateRange(1,10)]'));
 assert.ok(observation.includes("'--analyze','true'"));
 assert.ok(observation.includes('if(-not $valid){throw'));
 assert.ok(observation.includes('passesOriginalGate=$false'));
});

test('navigation artifacts exclude work directories, raw stderr, profiles and model files',()=>{
 const workflow=read('.github/workflows/native-smoke.yml');
 const block=workflow.split('- name: Preserve bounded synthetic navigation observation')[1];
 assert.ok(block);
 const paths=block.split('path: |')[1].trim().split(/\r?\n/).map(s=>s.trim());
 assert.deepEqual(paths,[
  '.build/navigation-observation/build-manifest.json',
  '.build/navigation-observation/result.json',
  '.build/navigation-observation/planning-*.jsonl'
 ]);
 const observer=read('tests/SyntheticNavigationTrace.cs');
 assert.ok(observer.includes('uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.UserInfo.Length!=0'));
 assert.ok(observer.includes('allowed.Contains(uri.AbsolutePath)'));
 assert.ok(observer.includes('MaxRecords=128,MaxRequests=256'));
 assert.ok(!observer.includes('Errors.Clear'));
 assert.ok(!observer.includes('Errors.Remove'));
});

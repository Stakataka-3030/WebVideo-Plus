import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../browser/export-component.js', import.meta.url), 'utf8');
const start = source.indexOf(' const reportJob=');
const policy = start < 0 ? '' : source.slice(start, source.indexOf(' const manual=', start));
const dialog = source.slice(source.indexOf('  h(Dialog,{open:!!notice'), source.lastIndexOf('\n ]});'));
const report = {
 complete:true, canContinue:true, digest:'first', issues:[{kind:'missing',file:'line.wav'}],
 warnings:[{kind:'external-resource',file:'theme.css'}],
};
function render(job, viewed=report) {
 const tree = (type, props) => props.children;
 const context = {
  notice:{jobId:'one',report:viewed}, jobs:job?[{id:'one',scanReport:report,...job}]:[],
  h:tree, j:tree, button:label=>label, busy:false, connection:null,
  issueLocation:()=>'', convertibleIssueRows:()=>[],
 };
 for (const name of ['Dialog','DialogSurface','DialogBody','DialogTitle','DialogContent','DialogActions']) context[name]=name;
 return vm.runInNewContext(policy+'\n'+dialog,context).flat(Infinity);
}
test('scan details keep both findings and only offer continuation for the current paused report', () => {
 for (const state of ['needs_attention','queued','running','completed','failed','canceled','deleting']) {
  const lines=render({state});
  assert.ok(lines.includes('line.wav') && lines.includes('theme.css'), state);
  assert.equal(lines.includes('跳过缺失资源继续'), state==='needs_attention', state);
  if (state==='completed') assert.ok(!lines.some(line=>String(line).includes('尚未进入下一步')));
 }
 for (const job of [null, {state:'needs_attention',requiresNewExport:true}, {state:'needs_attention',scanReport:{...report,digest:'second'}}]) {
  assert.ok(!render(job).includes('跳过缺失资源继续'));
 }
 for (const patch of [{complete:false},{canContinue:false},{digest:''}]) {
  const current={...report,...patch};
  assert.ok(!render({state:'needs_attention',scanReport:current},current).includes('跳过缺失资源继续'));
 }
});

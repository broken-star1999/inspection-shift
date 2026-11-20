import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFindings, readFindings } from '../src/inspection-findings.js';

test('findings keep distinct sources and the first snapshot of a repeated key', () => {
  assert.deepEqual(normalizeFindings([
    { key: ' doc:0:0 ', source: ' 外箱标签 ', text: ' 批号 · G-205 ' },
    { key: 'doc:1:0', source: '送检联', text: '批号 · G-205' },
    { key: 'doc:0:0', source: '外箱标签', text: '不覆盖原观察' },
    { key: 'sample:back', source: '检样背面', text: '耳垫贴着壳沿' },
    { key: 'blank', text: ' ' },
    null,
  ]), [
    { key: 'doc:0:0', source: '外箱标签', text: '批号 · G-205' },
    { key: 'doc:1:0', source: '送检联', text: '批号 · G-205' },
    { key: 'sample:back', source: '检样背面', text: '耳垫贴着壳沿' },
  ]);
});

test('legacy notes stay readable when there are no structured findings', () => {
  const note = '请核对送检材料';
  const legacy = [{ key: 'legacy', source: '', text: note }];
  assert.deepEqual(readFindings({ note }), legacy);
  assert.deepEqual(readFindings({ note, findings: [] }), legacy);
  assert.deepEqual(readFindings({ note, findings: [{ key: 'invalid' }] }), legacy);
  const findings = [{ key: 'sample:gauge', source: '量规', text: '1.80 mm' }];
  assert.deepEqual(readFindings({ note, findings }), findings);
  assert.deepEqual(readFindings({}), []);
});

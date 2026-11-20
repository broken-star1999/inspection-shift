import assert from 'node:assert/strict';
import test from 'node:test';
import { DAYS } from '../src/content.js';
import { intakeComparison, projectComparison } from '../src/document-comparison.js';
import { captureInspectionProgress, freshInteraction, restoreInspectionProgress } from '../src/inspection-progress.js';

const cases = new Map(DAYS.flatMap(({ cases }) => cases.map((item) => [item.id, item])));

test('intake records the written requirement and only the papers in the current delivery', () => {
  const first = cases.get(5);
  assert.deepEqual(intakeComparison(first, 1), {
    requirement: '随货附本批检验报告',
    received: ['外箱标签', '送检联'],
    finding: {
      key: 'compare:5:intake:1',
      source: '送检联 / 窗口收件',
      text: '应收 · 随货附本批检验报告；实收 · 外箱标签、送检联',
    },
  });
  assert.equal(intakeComparison(first, 0), null);
  const olderOrder = structuredClone(first);
  olderOrder.documents[1].fields = olderOrder.documents[1].fields.filter(([label]) => label !== '随货材料');
  assert.equal(intakeComparison(olderOrder, 1), null);
  assert.deepEqual(intakeComparison(cases.get(9), 2)?.received, ['外箱标签', '耳罩检验报告', '送检联']);
  assert.deepEqual(intakeComparison(cases.get(10), 2)?.received, ['外箱标签', '外观抽检报告', '送检联']);
});

test('the G-248 comparison keeps the requirements and report text independent of the verdict', () => {
  const item = cases.get(10);
  const comparison = projectComparison(item, 2, 1);
  assert.deepEqual(comparison, {
    required: '外观、耐冲击',
    reported: '外观 · 符合',
    finding: {
      key: 'compare:10:projects:2:1',
      source: '送检联 / 外观抽检报告 R-079',
      text: '应验 · 外观、耐冲击；报告载明 · 外观 · 符合',
    },
  });
  assert.deepEqual(projectComparison({ ...item, answer: 'fail', reason: '另一个判断' }, 2, 1), comparison);
  assert.equal(projectComparison(item, 1, 2), null);
  assert.equal(projectComparison(item, 2, 0), null);
  assert.equal(projectComparison(item, '2', 1), null);
  assert.equal(projectComparison(cases.get(14), 2, 1), null);
});

test('report body can be empty and same-batch records keep distinct evidence keys', () => {
  const first = structuredClone(cases.get(4));
  first.documents[1].fields = [['报告编号', 'R-064'], ['批号', 'G-204'], ['型号', 'A'], ['签发时间', '周一 13:30'], ['扣合', '']];
  const empty = projectComparison(first, 2, 1);
  assert.equal(empty.reported, '正文未列条目');
  assert.equal(empty.finding.source, '送检联 / 检验报告 R-064');
  const followUp = projectComparison(cases.get(15), 2, 1);
  assert.equal(followUp.reported, '返工项目 · 换镜片；镜片复测 · 符合');
  assert.notEqual(empty.finding.key, followUp.finding.key);
});

test('comparison findings survive a case save and do not carry into a follow-up', () => {
  const item = cases.get(10);
  const finding = projectComparison(item, 2, 1).finding;
  const work = { ...freshInteraction(), findings: [finding] };
  const saved = JSON.parse(JSON.stringify(captureInspectionProgress(item, work)));
  assert.deepEqual(restoreInspectionProgress(saved, item).findings, [finding]);
  assert.deepEqual(restoreInspectionProgress(saved, cases.get(14)).findings, []);
});

test('an active intake slip restores only against the current valid order', () => {
  const item = cases.get(5);
  const context = { panel: 'docs', guided: false };
  const saved = JSON.parse(JSON.stringify(captureInspectionProgress(item, { ...freshInteraction(), doc: 1, deliveryCheck: 1 }, context)));
  assert.equal(restoreInspectionProgress(saved, item, [], context).deliveryCheck, 1);
  assert.equal(restoreInspectionProgress(saved, item, [], { ...context, guided: true }).deliveryCheck, null);
  assert.equal(restoreInspectionProgress(saved, cases.get(9), [], context).deliveryCheck, null);
  assert.equal(restoreInspectionProgress({ ...saved, workspace: { ...saved.workspace, deliveryCheck: 0 } }, item, [], context).deliveryCheck, null);
});

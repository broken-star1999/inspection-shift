import assert from 'node:assert/strict';
import test from 'node:test';
import { DAYS, PRESSURE } from '../src/content.js';
import { cartonFinding, intakeComparison, projectComparison, relabelComparison, thicknessComparison } from '../src/document-comparison.js';
import { createRun, dispatch, getCase, getDay } from '../src/engine.js';
import { captureInspectionProgress, freshInteraction, restoreInspectionProgress } from '../src/inspection-progress.js';

const cases = new Map(DAYS.flatMap(({ cases }) => cases.map((item) => [item.id, item])));

test('records the actual carton face only after turning it, independently of the stamp', () => {
  const item = cases.get(17);
  assert.equal(cartonFinding(item, false), null);
  assert.equal(cartonFinding(cases.get(18), true), null);
  assert.deepEqual(cartonFinding(item, true), {
    key: 'box:17:bottom', source: '外箱底面', text: '箱底没有可辨喷码',
  });
  const mismatch = { ...item, ...item.variants[2] };
  assert.equal(cartonFinding(mismatch, false), null);
  assert.deepEqual(cartonFinding({ ...mismatch, answer: 'pass' }, true), {
    key: 'box:17:bottom', source: '外箱底面 / 送检联', text: '箱底实码 · C-271-03；送检登记 · C-217-03',
  });
});

test('thickness compares the actual gauge value with the two original paper fields', () => {
  const item = cases.get(18);
  const measured = { measured: true };
  assert.equal(thicknessComparison(item, { measured: false }), null);
  assert.equal(thicknessComparison(item), null);
  const result = thicknessComparison(item, measured);
  assert.deepEqual(result, {
    rows: [
      { title: '量规', field: '实测', value: '1.80 mm' },
      { title: '检验报告', field: '厚度', value: '2.10 mm' },
      { title: '送检联', field: '厚度范围', value: '2.00–2.20 mm' },
    ],
    finding: {
      key: 'compare:18:thickness:1:2',
      source: '量规 / 检验报告 / 送检联',
      text: '量规实测 · 1.80 mm；报告厚度 · 2.10 mm；送检范围 · 2.00–2.20 mm',
    },
  });
  assert.deepEqual(thicknessComparison({ ...item, answer: 'pass' }, measured), result);
  const inRange = thicknessComparison({ ...item, sample: { ...item.sample, reading: '2.10 mm' } }, measured);
  assert.equal(inRange.rows[0].value, '2.10 mm');
  assert.deepEqual(inRange.rows.slice(1), result.rows.slice(1));
});

test('thickness requires a reading and distinct, unambiguous paper sources', () => {
  const item = cases.get(18);
  const [label, report, order] = item.documents;
  const measured = { measured: true };
  assert.equal(thicknessComparison({ ...item, sample: { ...item.sample, reading: '' } }, measured), null);
  assert.equal(thicknessComparison({ ...item, documents: [label, report] }, measured), null);
  assert.equal(thicknessComparison({ ...item, documents: [label, report, order, report] }, measured), null);
  const ambiguous = { ...order, fields: [...order.fields, ['厚度范围', '1.50–1.80 mm']] };
  assert.equal(thicknessComparison({ ...item, documents: [label, report, ambiguous] }, measured), null);
});

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

test('relabel comparisons keep the previous and current batch numbers as independent facts', () => {
  const examples = [
    [6, 'G-106', 'G-206', 'G-206'], [11, 'G-111', 'G-216', 'G-211'], [13, 'G-111', 'G-211', 'G-211'],
    [16, 'G-112', 'G-216', 'G-216'], [19, 'G-119', 'G-219', 'G-219'],
  ];
  for (const [id, original, registeredCurrent, label] of examples) {
    const item = cases.get(id);
    const result = relabelComparison(item, 2);
    assert.deepEqual([result.registerIndex, result.reportIndex, result.labelIndex], [2, 1, 0]);
    assert.deepEqual(result.pairs.map(({ side, left, right }) => [side, left.value, right.value]), [
      ['original', original, original], ['current', registeredCurrent, label],
    ]);
    assert.deepEqual(result.pairs.map(({ finding }) => finding.key), [
      `compare:${id}:relabel:2:1:original`, `compare:${id}:relabel:2:0:current`,
    ]);
  }

  const item = cases.get(11);
  const [original, current] = relabelComparison(item, 2).pairs;
  assert.deepEqual([original.left, original.right], [
    { title: '检验报告', field: '批号', value: 'G-111' },
    { title: '换签登记', field: '原箱批号', value: 'G-111' },
  ]);
  assert.deepEqual(current, {
    side: 'current',
    left: { title: '换签登记', field: '现箱批号', value: 'G-216' },
    right: { title: '外箱标签', field: '批号', value: 'G-211' },
    finding: {
      key: 'compare:11:relabel:2:0:current', source: '换签登记 / 外箱标签', text: '现箱批号 · G-216；批号 · G-211',
    },
  });
  assert.deepEqual(relabelComparison({ ...item, answer: 'pass', reason: '别的判断' }, 2).pairs[1], current);
});

test('relabel comparisons require one real label, one report and an unambiguous register', () => {
  const item = cases.get(6);
  const [label, report, register] = item.documents;
  assert.equal(relabelComparison(item, 0), null);
  assert.equal(relabelComparison(item, '2'), null);
  assert.equal(relabelComparison(cases.get(14), 2), null);
  assert.equal(relabelComparison(null, 2), null);
  assert.equal(relabelComparison({ ...item, documents: [label, report, register, report] }, 2), null);
  assert.equal(relabelComparison({ ...item, documents: [label, report, register, label] }, 2), null);
  for (const fields of [
    [...register.fields, ['原箱批号', 'G-999']], register.fields.filter(([key]) => key !== '现箱批号'),
  ]) {
    assert.equal(relabelComparison({ ...item, documents: [label, report, { ...register, fields }] }, 2), null);
  }
  const noReportBatch = { ...report, fields: report.fields.filter(([key]) => key !== '批号') };
  assert.equal(relabelComparison({ ...item, documents: [label, noReportBatch, register] }, 2), null);

  const reordered = relabelComparison({ ...item, documents: [report, register, label] }, 1);
  assert.deepEqual([reordered.registerIndex, reordered.reportIndex, reordered.labelIndex], [1, 0, 2]);
  assert.equal(reordered.pairs[0].finding.key, 'compare:6:relabel:1:0:original');
  assert.equal(reordered.pairs[1].finding.key, 'compare:6:relabel:1:2:current');
});

test('a G-216 relabel finding draws a paper-specific pressure reply without deciding the sample', () => {
  const run = { ...createRun(4), day: 3, phase: 'case' };
  run.index = getDay(run).cases.findIndex(({ id }) => id === 16);
  const current = getCase(run);
  assert.equal(current.pressure, 'favor');
  const { finding } = relabelComparison(current, 2).pairs[1];
  const shown = dispatch(run, { type: 'show-finding', finding });
  assert.equal(getCase(shown).pressureReply, PRESSURE[0].shown.relabel);
  assert.equal(getCase(shown).answer, current.answer);
  assert.equal(shown.records, run.records);
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

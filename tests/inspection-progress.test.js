import test from 'node:test';
import assert from 'node:assert/strict';
import { captureInspectionProgress, freshInteraction, restoreInspectionProgress } from '../src/inspection-progress.js';

const item = { id: 7, documents: [{ type: 'label' }, { type: 'report' }] };

test('restores current inspection work after a JSON round trip', () => {
  const pinned = [5, 7];
  const work = Object.assign(freshInteraction({ pinned, phoneNumber: '0204' }), {
    note: '检样 · 白痕随薄膜掀起。下方的镜片平整。',
    findings: [
      { key: 'doc:0:0', source: '外箱标签', text: '批号 · G-241' },
      { key: 'doc:1:1', source: '随货核验联', text: '报告编号 · R-071' },
    ],
    positions: { 1: { x: 16.71, y: -8 } },
    inspection: { back: true, film: true, clasp: true, tug: true, measured: true, unpacked: true },
    signed: true,
    orderSeen: true,
    benchFindingsOpen: true,
    doc: 1,
    compare: 0,
    previousDoc: 0,
    previousCurrentDoc: 1,
    referenceDoc: 1,
    returnToDocs: true,
    archiveFocus: 'trace',
    archiveQuery: 'R-071',
    archiveEditing: true,
    egg: 'cat',
  });

  const saved = captureInspectionProgress(item, work);
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), item, pinned);
  assert.deepEqual(restored, {
    ...freshInteraction({ pinned, phoneNumber: '0204' }),
    note: work.note,
    findings: work.findings,
    positions: work.positions,
    inspection: work.inspection,
    signed: true,
    orderSeen: true,
    benchFindingsOpen: true,
  });
  saved.pinned.push(9);
  saved.positions[1].x = 0;
  saved.inspection.film = false;
  saved.findings[0].text = '另一个批号';
  assert.deepEqual(work.pinned, pinned);
  assert.equal(work.positions[1].x, 16.71);
  assert.equal(work.inspection.film, true);
  assert.equal(work.findings[0].text, '批号 · G-241');
  assert.equal(restored.findings[0].text, '批号 · G-241');
});

test('retains phone and valid pinned records when changing batches or ending a shift', () => {
  const work = Object.assign(freshInteraction({ pinned: [5, 7], phoneNumber: '107' }), {
    note: '检样 · 卡扣插片读数偏低。',
    findings: [{ key: 'sample:gauge', source: '量规', text: '1.80 mm' }],
    positions: { 0: { x: 22, y: -11 } },
    signed: true,
    orderSeen: true,
    inspection: { unpacked: true },
  });
  const saved = captureInspectionProgress(item, work);

  assert.deepEqual(freshInteraction(work), freshInteraction({ pinned: [5, 7], phoneNumber: '107' }));
  for (const next of [{ id: 8, documents: item.documents }, null]) {
    assert.deepEqual(restoreInspectionProgress(saved, next, [7]), freshInteraction({ pinned: [7], phoneNumber: '107' }));
  }
  assert.deepEqual(captureInspectionProgress(null, work), captureInspectionProgress(null, freshInteraction(work)));
  assert.equal(captureInspectionProgress(null, work).caseId, null);
});

test('loads legacy saves and accepts only usable values from a stored inspection', () => {
  assert.deepEqual(restoreInspectionProgress(undefined, item, [7]), freshInteraction());
  const legacy = restoreInspectionProgress({ caseId: 7, note: '批号 · G-241' }, item, [7]);
  assert.equal(legacy.note, '批号 · G-241');
  assert.deepEqual(legacy.findings, []);
  assert.deepEqual(restoreInspectionProgress({
    caseId: 7,
    note: 145,
    positions: { 0: { x: 123, y: -97 }, 1: { x: '10', y: 8 }, 2: { x: 20, y: 8 } },
    inspection: { film: true, unpacked: 'true', clasp: 1 },
    signed: 'true',
    orderSeen: true,
    pinned: [7, '3', 99, 5, 7],
    phoneNumber: '10A7',
  }, item, [5, 7]), {
    ...freshInteraction({ pinned: [7, 5] }),
    positions: { 0: { x: 90, y: -35 } },
    inspection: { ...freshInteraction().inspection, film: true },
    orderSeen: true,
  });
});

test('restores the current and prior papers separately and falls back to the saved current pair', () => {
  const itemWithPrior = { id: 9, documents: [{ type: 'label' }, { type: 'report' }, { type: 'order' }] };
  const prior = { id: 5, documentCount: 2 };
  const work = Object.assign(freshInteraction(), {
    doc: 2,
    compare: 0,
    previousDoc: 1,
    previousCurrentDoc: 1,
    showFindings: true,
  });
  const progress = captureInspectionProgress(itemWithPrior, work, { panel: 'docs', scrollTop: 17, prior });
  assert.deepEqual(progress.workspace, {
    panel: 'docs', scrollTop: 17, doc: 2, compare: 0,
    priorId: 5, previousDoc: 1, previousCurrentDoc: 1, showFindings: true,
  });
  const saved = JSON.parse(JSON.stringify(progress));
  const restored = restoreInspectionProgress(saved, itemWithPrior, [5, 9], { prior });
  assert.deepEqual(restored, { ...work, workspace: { panel: 'docs', scrollTop: 17 } });

  const invalidPrior = [{ id: 4, documentCount: 2 }, { id: 5, documentCount: 1 }, { id: 5, documentCount: '2' }];
  for (const context of [{}, { prior, guided: true }, ...invalidPrior.map(value => ({ prior: value }))]) {
    const currentOnly = restoreInspectionProgress(saved, itemWithPrior, [5, 9], context);
    assert.deepEqual(currentOnly, { ...restored, previousDoc: null, previousCurrentDoc: null });
  }
});

test('preserves a sample reference and its return to papers while respecting guided inspection', () => {
  const sampleItem = { ...item, sample: { kind: 'clear' } };
  const work = Object.assign(freshInteraction(), {
    doc: 1, compare: 0, returnToDocs: true, referenceDoc: 0,
    inspection: { ...freshInteraction().inspection, measured: true },
  });
  const progress = captureInspectionProgress(sampleItem, work, { panel: 'sample', scrollTop: 27 });
  assert.deepEqual(restoreInspectionProgress(progress, sampleItem, [7], {}), {
    ...work, workspace: { panel: 'sample', scrollTop: 27 },
  });
  const guided = restoreInspectionProgress(progress, sampleItem, [7], { guided: true });
  assert.deepEqual(guided, {
    ...freshInteraction(),
    inspection: work.inspection,
    workspace: { panel: 'sample', scrollTop: 27 },
  });
  const noReference = captureInspectionProgress(sampleItem, { ...work, referenceDoc: null }, { panel: 'sample' });
  const resume = restoreInspectionProgress(noReference, sampleItem, [7], {});
  assert.equal(resume.referenceDoc, null);
  assert.equal(resume.returnToDocs, true);
  assert.equal(resume.compare, 0);
});

test('phone saves only its surface and cannot open during a receipt, visitor or different case', () => {
  const work = Object.assign(freshInteraction({ phoneNumber: '204', pinned: [5, 7] }), {
    doc: 1, compare: 0, referenceDoc: 0, returnToDocs: true, note: '已选依据',
  });
  const progress = captureInspectionProgress(item, work, { panel: 'phone', scrollTop: 53 });
  assert.deepEqual(progress.workspace, { panel: 'phone', scrollTop: 53 });
  const live = restoreInspectionProgress(progress, item, [5, 7], {});
  assert.deepEqual(live, {
    ...freshInteraction({ phoneNumber: '204', pinned: [5, 7] }),
    note: '已选依据', workspace: { panel: 'phone', scrollTop: 53 },
  });
  const { workspace, ...durable } = live;
  assert.deepEqual(restoreInspectionProgress(progress, item, [5, 7]), durable);
  assert.deepEqual(restoreInspectionProgress(progress, { ...item, id: 9 }, [7], {}),
    freshInteraction({ phoneNumber: '204', pinned: [7] }));
  assert.equal(captureInspectionProgress(null, work, { panel: 'phone', scrollTop: 53 }).workspace, undefined);
});

test('rejects unsupported workspaces and invalid document values while preserving case progress', () => {
  const work = { ...freshInteraction(), note: '可恢复' };
  const progress = captureInspectionProgress(item, work);
  for (const workspace of [
    { panel: 'archive' }, { panel: 'phone', linkedTo: 'archive', extra: true, scrollTop: -5 },
    { panel: 'docs', doc: '1' }, { panel: 'docs', doc: 2 }, { panel: 'sample', referenceDoc: 0 },
  ]) {
    const restored = restoreInspectionProgress({ ...progress, workspace }, item, [7], {});
    if (workspace.panel === 'phone') assert.deepEqual(restored, { ...work, workspace: { panel: 'phone', scrollTop: 0 } });
    else assert.deepEqual(restored, work);
  }
  const malformed = restoreInspectionProgress({
    ...progress,
    workspace: { panel: 'docs', doc: 0, compare: 0, scrollTop: Infinity, showFindings: 1, previousDoc: 0, previousCurrentDoc: 1 },
  }, item, [7], { prior: { id: 5, documentCount: 2 } });
  assert.deepEqual(malformed, { ...work, workspace: { panel: 'docs', scrollTop: 0 } });
});

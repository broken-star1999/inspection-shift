import test from 'node:test';
import assert from 'node:assert/strict';
import { captureInspectionProgress, freshInteraction, restoreInspectionProgress, tutorialActionComplete } from '../src/inspection-progress.js';

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

test('keeps early first-batch actions across reload without completing uninspected steps', () => {
  const first = { ...item, id: 1, documents: [...item.documents, { type: 'order' }], sample: { kind: 'clear' } };
  const work = {
    ...freshInteraction(), doc: 1, compare: 2, reportSeen: true, orderSeen: true, signed: true,
    inspection: { ...freshInteraction().inspection, back: true, clasp: true, tug: true },
  };
  const saved = captureInspectionProgress(first, work, { panel: 'docs', guided: true });
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), first, [1], { guided: true });
  assert.equal(restored.doc, 1);
  assert.equal(restored.compare, 2);
  assert.deepEqual(['label', 'report', 'signature', 'sample', 'stamp'].map((key) => tutorialActionComplete(key, restored)),
    [false, true, true, true, false]);
  assert.equal(tutorialActionComplete('signature', { ...restored, signed: false }), false);
  assert.equal(tutorialActionComplete('signature', { ...restored, orderSeen: false }), false);
  assert.equal(tutorialActionComplete('label', { ...restored, labelSeen: true }), true);
  assert.equal(tutorialActionComplete('report', { ...restored, reportSeen: 1 }), false);

  const legacy = restoreInspectionProgress({ caseId: 1, inspection: { clasp: true, tug: true } }, first, [1]);
  assert.equal(tutorialActionComplete('sample', legacy), true);
  assert.equal(tutorialActionComplete('report', legacy), false);
  const signedReport = { ...first, documents: [
    { type: 'label' }, { type: 'report', fields: [['批号', 'G-201'], ['签发', '已签发']] }, { type: 'order' },
  ] };
  const legacySignature = restoreInspectionProgress({ caseId: 1, orderSeen: true, findings: [
    { key: 'doc:1:1', text: '签发 · 已签发' },
  ] }, signedReport, [1]);
  assert.equal(tutorialActionComplete('report', legacySignature), true);
  assert.equal(tutorialActionComplete('signature', legacySignature), true);
  assert.equal(tutorialActionComplete('sample', restoreInspectionProgress(saved, item, [1, 7])), false);
  assert.equal(captureInspectionProgress(item, { ...work, labelSeen: true }).labelSeen, false);
  assert.equal(captureInspectionProgress(item, work).reportSeen, false);
});

test('remembers the second batch was peeled even after putting its film back', () => {
  const second = { ...item, id: 2, sample: { kind: 'film' } };
  const work = { ...freshInteraction(), filmChecked: true };
  const saved = captureInspectionProgress(second, work, { panel: 'sample' });
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), second, [2], {});
  assert.equal(restored.filmChecked, true);
  assert.equal(restored.inspection.film, false);
  assert.equal(restored.workspace.panel, 'sample');

  const legacy = restoreInspectionProgress({ caseId: 2, inspection: { film: true } }, second, [2]);
  assert.equal(legacy.filmChecked, true);
  assert.equal(restoreInspectionProgress({ caseId: 2 }, second, [2]).filmChecked, false);
  assert.equal(restoreInspectionProgress(saved, item, [2, 7]).filmChecked, false);
  assert.equal(captureInspectionProgress(item, { ...work, inspection: { film: true } }).filmChecked, false);
});

test('restores a turned clipboard only for its current inspection and keeps the front comparison', () => {
  const work = { ...freshInteraction(), doc: 1, compare: 0, clipboardBack: true };
  const clipboardCase = { ...item, id: 15 };
  const saved = captureInspectionProgress(clipboardCase, work, { panel: 'docs', scrollTop: 18 });
  assert.equal(saved.workspace.clipboardBack, true);
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), clipboardCase, [], {});
  assert.equal(restored.clipboardBack, true);
  assert.equal(restored.doc, 1);
  assert.equal(restored.compare, 0);
  assert.equal(restored.workspace.scrollTop, 18);

  const repurposed = { ...saved, caseId: item.id };
  assert.equal(restoreInspectionProgress(repurposed, item, [], {}).clipboardBack, false);
  assert.equal(restoreInspectionProgress(saved, clipboardCase, [], { guided: true }).clipboardBack, false);
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

test('restores three spread papers directly or on return from the sample', () => {
  const sampleItem = { ...item, documents: [...item.documents, { type: 'order' }], sample: { kind: 'clip' } };
  const work = {
    ...freshInteraction(),
    doc: 1,
    compare: 0,
    spreadAll: true,
    referenceDoc: 2,
    returnToDocs: true,
  };
  for (const panel of ['docs', 'sample']) {
    const saved = JSON.parse(JSON.stringify(captureInspectionProgress(sampleItem, work, { panel, scrollTop: 19 })));
    const resumed = restoreInspectionProgress(saved, sampleItem, [7], {});
    assert.deepEqual(resumed.workspace, { panel, scrollTop: 19 });
    assert.equal(resumed.spreadAll, true);
    assert.equal(resumed.compare, 0);
    assert.equal(restoreInspectionProgress(saved, sampleItem, [7], { guided: true }).spreadAll, false);
    assert.equal(restoreInspectionProgress(saved, item, [7], {}).spreadAll, false);
    assert.equal(restoreInspectionProgress(saved, { ...sampleItem, id: 8 }, [7], {}).spreadAll, false);
  }
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

test('restores the exact sample and document comparison behind the phone after reload', () => {
  const sampleItem = { ...item, documents: [...item.documents, { type: 'order' }], sample: { kind: 'clip' } };
  const work = {
    ...freshInteraction({ phoneNumber: '880', pinned: [7] }),
    doc: 2, compare: 1, spreadAll: true, referenceDoc: 0, returnToDocs: true,
    inspection: { ...freshInteraction().inspection, measured: true },
  };
  const saved = captureInspectionProgress(sampleItem, work, {
    panel: 'phone', scrollTop: 12, returnTo: { panel: 'sample', scrollTop: 32 },
  });
  const reloaded = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(restoreInspectionProgress(reloaded, sampleItem, [7], {}), {
    ...work, workspace: { panel: 'phone', scrollTop: 12, returnTo: { panel: 'sample', scrollTop: 32 } },
  });
  reloaded.workspace.returnTo.panel = 'phone';
  const invalid = restoreInspectionProgress(reloaded, sampleItem, [7], {});
  assert.deepEqual(invalid.workspace, { panel: 'phone', scrollTop: 12 });
  assert.equal(invalid.spreadAll, false);
  assert.equal(invalid.inspection.measured, true);
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

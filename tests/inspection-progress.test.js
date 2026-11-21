import test from 'node:test';
import assert from 'node:assert/strict';
import { DAYS } from '../src/content.js';
import { captureInspectionProgress, freshInteraction, restoreInspectionProgress, tutorialActionComplete } from '../src/inspection-progress.js';

const item = { id: 7, documents: [{ type: 'label' }, { type: 'report' }] };
const deliveryPin = { id: 5, index: 1 };
const reportPin = { id: 7, index: 1 };
const nightPin = { id: 11, index: 2 };

test('restores current inspection work after a JSON round trip', () => {
  const pinned = [deliveryPin, reportPin];
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
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), item, [5, 7]);
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
  saved.pinned[0].index = 0;
  saved.pinned.push({ id: 9, index: 1 });
  saved.positions[1].x = 0;
  saved.inspection.film = false;
  saved.findings[0].text = '另一个批号';
  assert.deepEqual(work.pinned, pinned);
  assert.deepEqual(restored.pinned, pinned);
  assert.equal(work.positions[1].x, 16.71);
  assert.equal(work.inspection.film, true);
  assert.equal(work.findings[0].text, '批号 · G-241');
  assert.equal(restored.findings[0].text, '批号 · G-241');
});

test('retains phone and valid pinned papers when changing batches or ending a shift', () => {
  const pinned = [deliveryPin, reportPin];
  const work = Object.assign(freshInteraction({ pinned, phoneNumber: '107' }), {
    note: '检样 · 卡扣插片读数偏低。',
    findings: [{ key: 'sample:gauge', source: '量规', text: '1.80 mm' }],
    positions: { 0: { x: 22, y: -11 } },
    signed: true,
    orderSeen: true,
    inspection: { unpacked: true },
  });
  const saved = captureInspectionProgress(item, work);

  assert.deepEqual(freshInteraction(work), freshInteraction({ pinned, phoneNumber: '107' }));
  for (const next of [{ id: 8, documents: item.documents }, null]) {
    assert.deepEqual(restoreInspectionProgress(saved, next, [7]), freshInteraction({ pinned: [reportPin], phoneNumber: '107' }));
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
    ...freshInteraction({ pinned: [deliveryPin, { id: 7, index: null }] }),
    positions: { 0: { x: 90, y: -35 } },
    inspection: { ...freshInteraction().inspection, film: true },
    orderSeen: true,
  });
});

test('upgrades known legacy papers and leaves ambiguous batch folders without evidence', () => {
  const restorePins = (pinned, seen) => restoreInspectionProgress({ pinned }, item, seen).pinned;
  assert.deepEqual(restorePins([5, 10], [5, 10]), [deliveryPin, { id: 10, index: 2 }]);
  assert.deepEqual(restorePins([11, 14], [11, 14]), [nightPin, { id: 14, index: null }]);
  assert.deepEqual(restorePins([7, 14], [7, 14]), [{ id: 7, index: null }, { id: 14, index: null }]);
  assert.deepEqual(restorePins([5, nightPin, 7, 11], [5, 7, 11]), [{ id: 7, index: null }, nightPin]);
  assert.deepEqual(freshInteraction({ pinned: [11, 14] }).pinned, [nightPin, { id: 14, index: null }]);
});

test('keeps the two most recent distinct papers, including both papers of one batch', () => {
  const current = { ...item, id: 14 };
  const newReport = { id: 14, index: 1 };
  const oldSlip = { id: 14, index: 2 };
  const pins = [newReport, reportPin, oldSlip, newReport];
  const work = freshInteraction({ pinned: pins });
  assert.deepEqual(work.pinned, [oldSlip, newReport]);
  const saved = captureInspectionProgress(current, work, { seen: [7, 14] });
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), current, [7, 14]);
  assert.deepEqual(restored.pinned, [oldSlip, newReport]);
});

test('drops unknown or unseen batches and invalid document indexes without inventing a paper', () => {
  const label = { id: 14, index: 0 };
  const folder = { id: 14, index: null };
  const pinned = [label, folder, { id: 7, index: 1 }, { id: '14', index: 1 }, { id: 14 }, { id: 14, index: 3 },
    { id: 14, index: -1 }, { id: 14, index: 1.5 }, { id: 14, index: '1' }, { id: 99, index: 0 }, null];
  const seen = [14, 99];
  assert.deepEqual(restoreInspectionProgress({ pinned }, item, seen).pinned, [label, folder]);
  assert.deepEqual(captureInspectionProgress(item, { pinned }, { seen }).pinned, [label, folder]);
  assert.deepEqual(freshInteraction({ pinned }).pinned, [folder, reportPin]);
});

test('keeps early first-batch actions across reload without completing uninspected steps', () => {
  const first = DAYS[0].cases[0];
  const work = {
    ...freshInteraction(), doc: 1, compare: 2, orderSeen: true, signed: true,
    inspection: { ...freshInteraction().inspection, back: true, clasp: true, tug: true },
  };
  const saved = captureInspectionProgress(first, work, { panel: 'docs', guided: true });
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), first, [1], { guided: true });
  assert.equal(restored.doc, 1);
  assert.equal(restored.compare, 2);
  assert.deepEqual(['label', 'report', 'signature', 'sample', 'stamp'].map((key) => tutorialActionComplete(key, restored, first)),
    [false, false, true, true, false]);
  assert.equal(tutorialActionComplete('signature', { ...restored, signed: false }), false);
  assert.equal(tutorialActionComplete('signature', { ...restored, orderSeen: false }), false);
  assert.equal(tutorialActionComplete('label', { ...restored, labelSeen: true }), true);

  const legacy = restoreInspectionProgress({ caseId: 1, inspection: { clasp: true, tug: true } }, first, [1]);
  assert.equal(tutorialActionComplete('sample', legacy), true);
  const signedReport = { ...first, documents: [
    { type: 'label' }, { type: 'report', fields: [['批号', 'G-201'], ['签发', '已签发']] }, { type: 'order' },
  ] };
  const legacySignature = restoreInspectionProgress({ caseId: 1, orderSeen: true, findings: [
    { key: 'doc:1:1', text: '签发 · 已签发' },
  ] }, signedReport, [1]);
  assert.equal(tutorialActionComplete('report', legacySignature, signedReport), false);
  assert.equal(tutorialActionComplete('signature', legacySignature), true);
  assert.equal(tutorialActionComplete('sample', restoreInspectionProgress(saved, item, [1, 7])), false);
  assert.equal(captureInspectionProgress(item, { ...work, labelSeen: true }).labelSeen, false);
});

test('opening a report alone or noting an unrelated lot field does not complete the first lot comparison', () => {
  const first = DAYS[0].cases[0];
  const report = { key: 'doc:1:0', source: '检验报告', text: '批号 · G-201' };
  const label = { key: 'doc:0:0', source: '外箱标签', text: '批号 · G-201' };
  const order = { key: 'doc:2:0', source: '送检联', text: '批号 · G-201' };
  const saved = captureInspectionProgress(first, { ...freshInteraction(), doc: 1, compare: 0, findings: [report, order] }, { panel: 'docs', guided: true });
  const restored = restoreInspectionProgress(JSON.parse(JSON.stringify(saved)), first, [1], { guided: true });
  assert.equal(tutorialActionComplete('report', restored, first), false);
  assert.equal(tutorialActionComplete('report', { ...restored, findings: [report, label] }, first), true);
  assert.equal(tutorialActionComplete('report', { ...restored, findings: [label, report] }, first), true);
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

test('restores the open relabel comparison directly or on return from the phone', () => {
  const current = DAYS[2].cases.find(({ id }) => id === 11);
  const work = { ...freshInteraction(), doc: 2, relabelCheck: 2, phoneNumber: '107' };
  const documents = { panel: 'docs', scrollTop: 21 };
  const phone = { panel: 'phone', scrollTop: 31, returnTo: documents };
  const comparison = { ...documents, doc: 2, compare: null, relabelCheck: 2, showFindings: false };
  for (const workspace of [documents, phone]) {
    const progress = captureInspectionProgress(current, work, workspace);
    const saved = JSON.parse(JSON.stringify(progress));
    assert.deepEqual(saved.workspace, workspace === phone ? { ...phone, returnTo: comparison } : comparison);
    assert.deepEqual(restoreInspectionProgress(saved, current, [11], {}), { ...work, workspace });
  }
});

test('preserves a relabel comparison only for a valid current document workspace', () => {
  const current = DAYS[2].cases.find(({ id }) => id === 11);
  const work = { ...freshInteraction(), doc: 2, relabelCheck: 2, returnToDocs: true };
  const documents = { panel: 'docs' };
  const saved = captureInspectionProgress(current, work, documents);
  assert.equal(restoreInspectionProgress(saved, current, [11], { guided: true }).relabelCheck, null);
  assert.equal(restoreInspectionProgress(saved, item, [7, 11], {}).relabelCheck, null);
  const duringSample = captureInspectionProgress(current, work, { panel: 'sample' });
  assert.equal(restoreInspectionProgress(duringSample, current, [11], {}).relabelCheck, 2);
  assert.equal(captureInspectionProgress(current, { ...work, returnToDocs: false }, { panel: 'sample' }).workspace.relabelCheck, undefined);
  assert.equal(captureInspectionProgress(current, work, { ...documents, guided: true }).workspace.relabelCheck, undefined);
  for (const relabelCheck of [null, '2', -1, 1, 3]) {
    const progress = captureInspectionProgress(current, { ...work, relabelCheck }, documents);
    assert.equal(progress.workspace.relabelCheck, undefined);
    assert.equal(restoreInspectionProgress({ ...saved, workspace: { ...saved.workspace, relabelCheck } }, current, [11], {}).relabelCheck, null);
  }
  delete saved.workspace.relabelCheck;
  assert.equal(restoreInspectionProgress(saved, current, [11], {}).relabelCheck, null);
});

test('drops a conflicting relabel comparison when a legacy comparison is valid', () => {
  const current = DAYS[3].cases.find(({ id }) => id === 13);
  const work = { ...freshInteraction(), doc: 2, relabelCheck: 2 };
  const prior = { id: 11, documentCount: 3 };
  const oldPair = { priorId: prior.id, previousDoc: 2, previousCurrentDoc: 2 };
  const progress = captureInspectionProgress(current, work, { panel: 'docs' });
  const conflictingPair = captureInspectionProgress(current, { ...work, ...oldPair }, { panel: 'docs', prior });
  assert.equal(conflictingPair.workspace.relabelCheck, undefined);
  const restored = restoreInspectionProgress({ ...progress, workspace: { ...progress.workspace, ...oldPair } }, current, [11, 13], { prior });
  assert.equal(restored.previousDoc, 2);
  assert.equal(restored.relabelCheck, null);

  const order = { type: 'order', fields: [['随货材料', '随货附本批检验报告']] };
  const withOrder = { ...current, documents: [...current.documents, order] };
  const saved = captureInspectionProgress(withOrder, { ...work, deliveryCheck: 3 }, { panel: 'docs' });
  assert.equal(saved.workspace.relabelCheck, undefined);
  const pointCount = restoreInspectionProgress({ ...progress, workspace: { ...progress.workspace, deliveryCheck: 3 } }, withOrder, [13], {});
  assert.equal(pointCount.deliveryCheck, 3);
  assert.equal(pointCount.relabelCheck, null);
  assert.equal(restoreInspectionProgress({ ...progress, workspace: { ...progress.workspace, deliveryCheck: 3 } }, current, [13], {}).relabelCheck, 2);
});

test('preserves a sample reference and its return to papers while respecting guided inspection', () => {
  const sampleItem = { ...item, sample: { kind: 'clear' } };
  const work = Object.assign(freshInteraction(), {
    doc: 1, compare: 0, returnToDocs: true, referenceDoc: 0, lastReadDoc: 0,
    documentsScroll: { scrollTop: 43, scrollLeft: 11 },
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
  assert.deepEqual(resume.documentsScroll, work.documentsScroll);
  assert.equal(captureInspectionProgress(sampleItem, { ...work, returnToDocs: false }, { panel: 'sample' }).workspace.documentsScroll, undefined);
  assert.equal(captureInspectionProgress(sampleItem, { ...work, documentsScroll: { scrollTop: '43', scrollLeft: 11 } }, { panel: 'sample' }).workspace.documentsScroll, undefined);
  const legacy = { ...progress, workspace: { ...progress.workspace } };
  delete legacy.workspace.documentsScroll;
  delete legacy.workspace.lastReadDoc;
  const legacyWork = restoreInspectionProgress(legacy, sampleItem, [7], {});
  assert.equal(legacyWork.documentsScroll, null);
  assert.equal(legacyWork.lastReadDoc, null);
  assert.equal(legacyWork.referenceDoc, 0);
});

test('restores the open measured thickness comparison directly or on return from the phone', () => {
  const current = DAYS[4].cases.find(({ id }) => id === 18);
  const work = freshInteraction();
  work.inspection.measured = true;
  work.thicknessOpen = true;
  work.referenceDoc = 2;
  const sample = { panel: 'sample', scrollTop: 21 };
  const phone = { panel: 'phone', scrollTop: 31, returnTo: sample };
  for (const workspace of [sample, phone]) {
    const saved = JSON.parse(JSON.stringify(captureInspectionProgress(current, work, workspace)));
    const origin = saved.workspace.returnTo ?? saved.workspace;
    assert.equal(origin.thicknessOpen, true);
    assert.deepEqual(restoreInspectionProgress(saved, current, [18], {}), { ...work, workspace });
  }
});

test('keeps the carton face and exact papers beneath it across a reload', () => {
  const item = DAYS[4].cases.find(({ id }) => id === 17);
  const workspace = { panel: 'carton', scrollTop: 16 };
  for (const arrangement of [{ compare: 2 }, { spreadAll: true }]) {
    const work = {
      ...freshInteraction(),
      ...arrangement,
      cartonBottom: true,
      lastReadDoc: 2,
      returnToDocs: true,
      documentsScroll: { scrollTop: 48, scrollLeft: 12 },
    };
    const saved = JSON.parse(JSON.stringify(captureInspectionProgress(item, work, workspace)));
    assert.deepEqual(restoreInspectionProgress(saved, item, [17], {}), { ...work, workspace });
    assert.deepEqual(captureInspectionProgress(item, { ...work, returnToDocs: false }, workspace).workspace, workspace);
    assert.equal(captureInspectionProgress({ ...item, carton: null }, work, workspace).workspace, undefined);
  }
});

test('restores comparison of a recorded reading while the instrument is released', () => {
  const item = DAYS[4].cases.find(({ id }) => id === 18);
  const work = {
    ...freshInteraction(),
    thicknessOpen: true,
    findings: [{ key: 'sample:measure', source: '量规实测', text: '1.80 mm' }],
  };
  const saved = JSON.parse(JSON.stringify(captureInspectionProgress(item, work, { panel: 'sample', scrollTop: 18 })));
  const restored = restoreInspectionProgress(saved, item, [18], {});
  assert.equal(restored.thicknessOpen, true);
  assert.equal(restored.inspection.measured, false);
  assert.deepEqual(restored.findings, work.findings);
  assert.equal(restoreInspectionProgress({ ...saved, findings: [] }, item, [18], {}).thicknessOpen, false);
});

test('keeps a seated gauge sample without opening a thickness comparison before measuring', () => {
  const current = DAYS[4].cases.find(({ id }) => id === 18);
  const other = DAYS[4].cases.find(({ id }) => id === 19);
  const work = freshInteraction();
  work.inspection.gaugeLoaded = true;
  work.thicknessOpen = true;
  work.referenceDoc = 1;
  const sample = { panel: 'sample', scrollTop: 21 };
  const phone = { panel: 'phone', scrollTop: 31, returnTo: sample };
  for (const workspace of [sample, phone]) {
    const saved = JSON.parse(JSON.stringify(captureInspectionProgress(current, work, workspace)));
    const origin = saved.workspace.returnTo ?? saved.workspace;
    assert.equal(saved.inspection.gaugeLoaded, true);
    assert.equal(saved.inspection.measured, false);
    assert.equal(origin.thicknessOpen, undefined);
    assert.deepEqual(restoreInspectionProgress(saved, current, [18], {}), { ...work, thicknessOpen: false, workspace });
    assert.deepEqual(restoreInspectionProgress(saved, other, [18, 19], {}), freshInteraction());
  }
  assert.equal(captureInspectionProgress(other, work, sample).inspection.gaugeLoaded, undefined);
  assert.equal(captureInspectionProgress(current, { ...work, inspection: { gaugeLoaded: 'true' } }, sample).inspection.gaugeLoaded, undefined);
  assert.equal(freshInteraction(work).inspection.gaugeLoaded, undefined);
});

test('restores thickness mode only for a valid measurement in a non-guided sample workspace', () => {
  const current = DAYS[4].cases.find(({ id }) => id === 18);
  const work = freshInteraction();
  work.inspection.measured = true;
  work.thicknessOpen = true;
  const sample = { panel: 'sample' };
  const saved = captureInspectionProgress(current, work, sample);
  assert.equal(captureInspectionProgress(current, work, { panel: 'docs' }).workspace.thicknessOpen, undefined);
  assert.equal(captureInspectionProgress(current, work, { ...sample, guided: true }).workspace.thicknessOpen, undefined);
  assert.equal(captureInspectionProgress(current, { ...work, thicknessOpen: 'true' }, sample).workspace.thicknessOpen, undefined);
  assert.equal(restoreInspectionProgress(saved, current, [18], { guided: true }).thicknessOpen, false);
  assert.equal(restoreInspectionProgress(saved, { ...current, documents: current.documents.slice(0, 2) }, [18], {}).thicknessOpen, false);
  for (const measured of [false, 'true']) {
    const inspection = { ...work.inspection, measured };
    assert.equal(captureInspectionProgress(current, { ...work, inspection }, sample).workspace.thicknessOpen, undefined);
    const phone = { panel: 'phone', returnTo: { ...sample, inspection: { measured: true } } };
    assert.equal(captureInspectionProgress(current, { ...work, inspection }, phone).workspace.returnTo.thicknessOpen, undefined);
    const forged = {
      ...saved, inspection,
      workspace: { panel: 'phone', returnTo: { ...saved.workspace, inspection: { measured: true } } },
    };
    const restored = restoreInspectionProgress(forged, current, [18], {});
    assert.equal(restored.thicknessOpen, false);
    assert.equal(restored.workspace.returnTo.panel, 'sample');
  }
  delete saved.workspace.thicknessOpen;
  assert.equal(restoreInspectionProgress(saved, current, [18], {}).thicknessOpen, false);
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
  const pinned = [deliveryPin, reportPin];
  const work = Object.assign(freshInteraction({ phoneNumber: '204', pinned }), {
    doc: 1, compare: 0, referenceDoc: 0, returnToDocs: true, note: '已选依据',
  });
  const progress = captureInspectionProgress(item, work, { panel: 'phone', scrollTop: 53 });
  assert.deepEqual(progress.workspace, { panel: 'phone', scrollTop: 53 });
  const live = restoreInspectionProgress(progress, item, [5, 7], {});
  assert.deepEqual(live, {
    ...freshInteraction({ phoneNumber: '204', pinned }),
    note: '已选依据', workspace: { panel: 'phone', scrollTop: 53 },
  });
  const { workspace, ...durable } = live;
  assert.deepEqual(restoreInspectionProgress(progress, item, [5, 7]), durable);
  assert.deepEqual(restoreInspectionProgress(progress, { ...item, id: 9 }, [7], {}),
    freshInteraction({ phoneNumber: '204', pinned: [reportPin] }));
  assert.equal(captureInspectionProgress(null, work, { panel: 'phone', scrollTop: 53 }).workspace, undefined);
});

test('restores the exact sample and document comparison behind the phone after reload', () => {
  const sampleItem = { ...item, documents: [...item.documents, { type: 'order' }], sample: { kind: 'clip' } };
  const work = {
    ...freshInteraction({ phoneNumber: '880', pinned: [reportPin] }),
    doc: 2, compare: 1, spreadAll: true, referenceDoc: 0, returnToDocs: true, lastReadDoc: 1,
    documentsScroll: { scrollTop: 81, scrollLeft: 12 },
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

test('a call started from a filed document can return to the same seen archive row after reload', () => {
  const current = { ...item, id: 14 };
  const seen = [11, 14];
  const work = freshInteraction({ phoneNumber: '107', pinned: [nightPin] });
  const origin = { panel: 'archive', archiveFocus: 11, archiveQuery: 'G-211', scrollTop: 128 };
  const saved = captureInspectionProgress(current, work, { panel: 'phone', scrollTop: 17, returnTo: origin, seen });
  const reloaded = JSON.parse(JSON.stringify(saved));
  const valid = restoreInspectionProgress(reloaded, current, seen, {});
  assert.deepEqual(valid.workspace, { panel: 'phone', scrollTop: 17, returnTo: origin });
  assert.deepEqual(valid.pinned, [nightPin]);
  assert.equal(valid.phoneNumber, '107');
  const missing = restoreInspectionProgress(reloaded, current, [14], {});
  assert.deepEqual(missing.workspace, { panel: 'phone', scrollTop: 17 });
  assert.deepEqual(missing.pinned, []);
});

test('restores the handset underside for the active case without changing its archive return or dial', () => {
  const current = { ...item, id: 14 };
  const seen = [11, 14];
  const carried = { phoneNumber: '88', pinned: [nightPin] };
  const work = { ...freshInteraction(carried), phoneBottom: true };
  const workspace = {
    panel: 'phone', scrollTop: 17,
    returnTo: { panel: 'archive', archiveFocus: 11, archiveQuery: 'G-211', scrollTop: 128 },
  };
  const saved = JSON.parse(JSON.stringify(captureInspectionProgress(current, work, { ...workspace, seen })));
  assert.equal(saved.phoneBottom, true);
  assert.deepEqual(restoreInspectionProgress(saved, current, seen, {}), { ...work, workspace });
  assert.deepEqual(restoreInspectionProgress(saved, { ...current, id: 15 }, seen, {}), freshInteraction(carried));
  assert.deepEqual(freshInteraction(work), freshInteraction(carried));
  assert.equal(captureInspectionProgress(null, work, workspace).phoneBottom, undefined);
  for (const value of [false, 'true', undefined]) {
    const sanitized = captureInspectionProgress(current, { ...work, phoneBottom: value }, workspace);
    assert.equal(Object.hasOwn(sanitized, 'phoneBottom'), false);
    const restored = restoreInspectionProgress({ ...saved, phoneBottom: value }, current, seen, {});
    assert.deepEqual(restored, { ...freshInteraction(carried), workspace });
  }
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

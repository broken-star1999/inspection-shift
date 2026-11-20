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

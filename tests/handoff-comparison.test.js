import assert from 'node:assert/strict';
import test from 'node:test';
import { archive, createFollowingRun, dispatch, EVIDENCE, getCase, TRACE_CASE_ID } from '../src/engine.js';
import { handoffComparison } from '../src/handoff-comparison.js';
import { handoffWorkspace, hasHandoffDocument } from '../src/handoff-workspace.js';

function friday(decisions) {
  let run = createFollowingRun(null, 21);
  while (run.phase !== 'handoff') {
    const item = run.phase === 'case' ? getCase(run) : null;
    const action = run.event ? { type: 'ack-visit' }
      : item ? { type: 'stamp', value: decisions[item.id] ?? item.answer }
        : { type: { brief: 'start-day', receipt: 'next', summary: 'advance-day' }[run.phase] };
    const next = dispatch(run, action);
    assert.notEqual(next, run);
    run = next;
  }
  return run;
}

const handoffRows = (run) => archive(run).filter(({ record }) => record);

test('G-204 links the dispatched lot and factory remainder as two independent records', () => {
  const rows = handoffRows(friday({ 4: 'pass', 15: 'fail' }));
  const earlier = rows.find(({ id }) => id === 4);
  const later = rows.find(({ id }) => id === 15);
  const pair = handoffComparison(rows, earlier.id);
  assert.equal(pair.earlier, earlier);
  assert.equal(pair.later, later);
  assert.equal(pair.sameLot, false);
  assert.equal(pair.earlier.record.status, 'shipped');
  assert.equal(pair.later.record.status, 'returned');
  assert.deepEqual(handoffComparison(rows.toReversed(), later.id), pair);

  const unlinked = { ...later, previousReceipt: null };
  assert.equal(handoffComparison([earlier, unlinked], earlier.id), null);
  assert.equal(handoffComparison([earlier, unlinked], later.id), null);
  assert.equal(handoffComparison(rows, 1), null);
  assert.equal(handoffComparison(rows, 'attachments'), null);
});

test('G-205 compares the historical original against the authoritative supplement on either side', () => {
  const run = friday({ 5: 'pass', 9: 'pass' });
  const rows = handoffRows(run);
  const pair = handoffComparison(rows, 5);
  assert.deepEqual(handoffComparison(rows, 9), pair);
  assert.equal(pair.sameLot, true);
  assert.equal(pair.earlier.record.id, 5);
  assert.equal(pair.earlier.latestReceipt.id, 9);
  assert.equal(pair.later.record.id, 9);
  assert.equal(pair.later.record.status, 'shipped');
  assert.equal(handoffComparison(rows.filter(({ latestReceipt }) => !latestReceipt), 9), null);

  const corrected = dispatch(run, { type: 'recheck', id: 9, value: 'review' });
  const revisedRows = handoffRows(JSON.parse(JSON.stringify(corrected)));
  const revised = handoffComparison(revisedRows, 5);
  assert.deepEqual(handoffComparison(revisedRows, 9), revised);
  assert.equal(revised.earlier.latestReceipt.status, 'recallPending');
  assert.equal(revised.later.record.status, 'recallPending');
});

test('G-205 still has two related records before the supplement is adopted', () => {
  const rows = handoffRows(friday({ 5: 'pass', 9: 'review' }));
  const pair = handoffComparison(rows, 5);
  assert.equal(pair.sameLot, true);
  assert.equal(pair.earlier.latestReceipt, null);
  assert.equal(pair.earlier.record.status, 'shipped');
  assert.equal(pair.later.record.status, 'held');
  assert.deepEqual(handoffComparison(rows, 9), pair);
});

test('Friday restores a historical receipt and its selected original document and scroll positions', () => {
  const run = friday({ 5: 'pass', 9: 'pass' });
  const workspace = { id: 5, documentIndex: 1, comparing: false, scrollTop: 146.5, boardScrollTop: 72 };
  assert.deepEqual(handoffWorkspace(run, JSON.parse(JSON.stringify(workspace))), workspace);
  assert.deepEqual(handoffWorkspace(run, { ...workspace, documentIndex: '1', scrollTop: -8, boardScrollTop: Infinity }), {
    ...workspace, documentIndex: null, scrollTop: 0, boardScrollTop: 0,
  });
  assert.equal(handoffWorkspace(run, { id: '5' }), null);
  assert.equal(handoffWorkspace(run, { id: 99 }), null);
  assert.equal(handoffWorkspace(dispatch(run, { type: 'finish' }), workspace), null);
});

test('Friday restores attachments only after collection and checks that papers belong to the selected receipt', () => {
  const run = friday({});
  const waiting = dispatch(run, { type: 'dial', number: '204', caseIds: [7, 14] });
  const filed = dispatch(waiting, { type: 'ack-visit' });
  const attachments = { id: 'attachments', documentIndex: null, comparing: false, scrollTop: 16, boardScrollTop: 8 };
  assert.equal(handoffWorkspace(waiting, attachments), null);
  assert.equal(handoffWorkspace({ ...run, flags: { traceDocument: 'true' } }, attachments), null);
  assert.deepEqual(handoffWorkspace(filed, { ...attachments, documentIndex: 'trace' }), attachments);
  assert.equal(handoffWorkspace(filed, { ...attachments, comparing: true }), null);

  const nightWaiting = dispatch(run, { type: 'dial', number: '107', caseIds: [11] });
  assert.deepEqual(handoffWorkspace(dispatch(nightWaiting, { type: 'ack-visit' }), attachments), attachments);

  const papers = [{ caseId: TRACE_CASE_ID, document: { ...EVIDENCE.trace, kind: 'trace' } }];
  const original = { id: TRACE_CASE_ID, documentIndex: 'trace' };
  const row = handoffRows(filed).find(({ id }) => id === TRACE_CASE_ID);
  assert.equal(hasHandoffDocument(row, 'trace', papers), true);
  assert.equal(hasHandoffDocument(null, 'trace', papers), false);
  assert.equal(handoffWorkspace(filed, original, papers).documentIndex, 'trace');
  assert.equal(handoffWorkspace(filed, original).documentIndex, null);
  assert.equal(handoffWorkspace(filed, { ...original, id: 14 }, papers).documentIndex, null);
});

test('Friday validates a linked comparison even while its recall visitor is at the window', () => {
  const run = friday({ 5: 'pass', 9: 'pass' });
  const requested = dispatch(run, { type: 'recheck', id: 9, value: 'review' });
  const atWindow = dispatch(requested, { type: 'receive-recall', id: 9 });
  assert.equal(atWindow.event.kind, 'recall');
  const workspace = { id: 5, documentIndex: null, comparing: true, scrollTop: 60, boardScrollTop: 27 };
  assert.deepEqual(handoffWorkspace(atWindow, workspace), workspace);
  assert.equal(handoffWorkspace(run, { ...workspace, id: 1 }), null);
});

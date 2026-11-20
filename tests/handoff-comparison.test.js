import assert from 'node:assert/strict';
import test from 'node:test';
import { archive, createFollowingRun, dispatch, getCase } from '../src/engine.js';
import { handoffComparison } from '../src/handoff-comparison.js';

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

import assert from 'node:assert/strict';
import test from 'node:test';
import { completedShiftHistory } from '../src/completed-shifts.js';
import {
  archive, archivedReportSources, createFollowingRun, createRun, dispatch, getCase, getDay, getEnding,
  getPreviousReceipt, getShipmentAcceptance, restoreRun, TUTORIAL, validRunSave,
} from '../src/engine.js';

const phases = { brief: 'start-day', case: 'stamp', receipt: 'next', summary: 'advance-day', handoff: 'finish' };
const compact = { schedule: 3 };

function playUntil(run, stop, decisions = {}) {
  while (!stop(run)) {
    const item = getCase(run);
    const tutorial = item?.id === 1 ? TUTORIAL[run.tutorial] : null;
    let action = { type: phases[run.phase], value: decisions[item?.id] ?? item?.answer };
    if (run.event) action = { type: 'ack-visit' };
    else if (tutorial && tutorial.key !== 'stamp') action = { type: 'tutorial', key: tutorial.key };
    const next = dispatch(run, action);
    assert.notEqual(next, run, `day ${run.day + 1}, case ${run.index + 1}, ${action.type}`);
    run = next;
  }
  return run;
}

function reload(run) {
  const saved = JSON.parse(JSON.stringify(run));
  assert.equal(validRunSave(saved), true);
  return restoreRun(saved);
}

const complete = (run) => playUntil(run, (state) => state.phase === 'ending');
const lastReceiptId = (run) => run.records.at(-1)?.id;

test('a new compact run plays its fifteen fixed visits through Friday handoff', () => {
  const start = createRun(0, compact);
  assert.equal(start.schedule, 3);
  const week = complete(reload(start));
  assert.deepEqual(week.records.map(({ id, day }) => [day, id]), [
    [0, 1], [0, 2], [0, 4], [1, 11], [1, 8], [1, 7], [2, 6], [2, 12], [2, 10],
    [3, 13], [3, 14], [3, 16], [4, 17], [4, 18], [4, 20],
  ]);
  assert.equal(getEnding(week).id, 'routine');
  const checked = getEnding(week).integrityTrail.find(({ batch }) => batch === 'G-248');
  assert.match(checked.initial, /周三首章审查/u);
  assert.match(checked.evidence, /周四 09:10签发 · 现已出库/u);
  assert.equal(checked.early, false);
  assert.equal(archive(week).filter(({ record }) => record).length, 15);
});

test('a returning compact week resumes after the extra Thursday and Friday visits and keeps history', () => {
  const previous = complete(createRun(0, compact));
  let run = createFollowingRun(previous, 81, compact);
  assert.equal(run.schedule, 3);

  run = playUntil(run, (state) => state.phase === 'receipt' && state.day === 3 && state.index === 3);
  assert.deepEqual(getDay(run).cases.map(({ id }) => id), [13, 14, 27, 16]);
  assert.equal(lastReceiptId(reload(run)), 16);

  run = playUntil(reload(run), (state) => state.phase === 'receipt' && state.day === 4 && state.index === 4);
  assert.deepEqual(getDay(run).cases.map(({ id }) => id), [17, 18, 29, 30, 20]);
  assert.equal(lastReceiptId(reload(run)), 20);
  assert.equal(validRunSave({ ...run, index: 5 }), false);
  assert.equal(validRunSave({ ...run, schedule: 2 }), false);

  const ending = reload({ ...complete(reload(run)), weekId: 'compact-return' });
  const stored = JSON.parse(JSON.stringify([{ id: ending.weekId, run: ending }]));
  const history = completedShiftHistory(stored);
  const savedWeek = history.get(ending.weekId);
  assert.ok(savedWeek);
  assert.equal(getEnding(savedWeek).id, getEnding(ending).id);
  assert.deepEqual(archive(savedWeek).filter(({ record }) => record?.day === 4).map(({ id }) => id), [17, 18, 29, 30, 20]);
  assert.equal(savedWeek.records.length, 18);
});

test('the Wednesday G-248 shipment keeps its original receipt when Thursday accepts the supplement', () => {
  let run = createRun(0, compact);
  run = playUntil(run, (state) => state.day === 2 && state.phase === 'summary', { 10: 'pass' });
  const original = run.records.find(({ id }) => id === 10);
  assert.equal(original.day, 2);
  assert.equal(original.status, 'shipped');

  run = playUntil(reload(run), (state) => state.phase === 'receipt' && lastReceiptId(state) === 14);
  const supplement = run.records.at(-1);
  assert.equal(supplement.day, 3);
  assert.equal(supplement.decision, 'pass');
  assert.equal(supplement.status, 'shipped');
  assert.equal(supplement.priorShipmentId, original.id);
  const firstReceipt = archive(run, 'G-248').find(({ id }) => id === original.id);
  assert.equal(firstReceipt.latestReceipt.id, supplement.id);
  assert.equal(firstReceipt.record.status, 'shipped');
  const finished = complete(run);
  const ending = getEnding(finished);
  assert.ok(!ending.issues.some(({ id }) => id === original.id || id === supplement.id));
  const premature = ending.integrityTrail.find(({ batch }) => batch === 'G-248');
  assert.equal(premature.early, true);
  assert.match(premature.initial, /周三首章通过 · 周三已出库/u);
  assert.match(premature.evidence, /周四 09:10签发/u);
  const acceptance = getShipmentAcceptance(finished);
  assert.equal(acceptance.originalShipment.shippedDay, 2);
  assert.equal(acceptance.record.day, 3);
});

test('G-211 links Tuesday’s held receipt to Thursday’s recheck and files each report on the receipt’s actual day', () => {
  const start = createRun(0, compact);
  const following = playUntil(start, (state) => state.phase === 'case' && getCase(state)?.id === 13, { 11: 'review' });
  const previous = getPreviousReceipt(following);
  assert.equal(previous.sameLot, true);
  assert.equal(previous.record.id, 11);
  assert.equal(previous.record.day, 1);
  assert.equal(previous.record.status, 'held');
  const sources = archivedReportSources(following, 'R-081');
  assert.deepEqual(sources.filter(({ id }) => id === 11 || id === 13).map(({ id, day }) => [id, day]), [[11, 1], [13, 3]]);

  const finished = complete(following);
  const original = archive(finished, 'G-211').find(({ id }) => id === 11);
  assert.equal(original.latestReceipt?.id, 13);
  assert.equal(original.latestReceipt?.day, 3);
});

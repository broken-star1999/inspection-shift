import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPACT_SCHEDULE, TRACE_CASE_ID, canFileTraceOriginal, createRun, dispatch, getCase, getDay, getEnding,
  getIncomingCall, restoreRun,
} from '../src/engine.js';

const actions = { brief: 'start-day', case: 'stamp', receipt: 'next', summary: 'advance-day' };
const start = () => createRun(0, { schedule: COMPACT_SCHEDULE });

function playUntil(run, stop) {
  while (!stop(run)) {
    const action = run.event ? { type: 'ack-visit' } : { type: actions[run.phase], value: getCase(run)?.answer };
    const next = dispatch(run, action);
    assert.notEqual(next, run, `day ${run.day + 1}, case ${run.index + 1}, ${action.type}`);
    run = next;
  }
  return run;
}

test('the compact week never rings or accepts phone actions, and uses paperwork without extensions', () => {
  const tuesday = playUntil(start(), (run) => run.day === 1 && run.phase === 'summary');
  for (const action of [
    { type: 'dial', number: '107', caseIds: [11] },
    { type: 'dial', number: '204', caseIds: [7, 14] },
    { type: 'dial', number: '880' },
    { type: 'hang-up' },
    { type: 'answer-call' },
    { type: 'explore', key: 'phone-back' },
  ]) assert.equal(dispatch(tuesday, action), tuesday);
  assert.equal(getIncomingCall(tuesday), null);

  const day = (index) => getDay({ ...tuesday, day: index });
  assert.doesNotMatch(day(1).intro, /电话|拨号|内线/u);
  const boxes = [day(1).cases.find(({ id }) => id === 11), day(2).cases.find(({ id }) => id === 10)];
  for (const { documents } of boxes) assert.doesNotMatch(JSON.stringify(documents), /内线|电话/u);
});

test('a compact legacy save retains its filed letters and prior calls without resuming an active line', () => {
  const phone = { number: '107', kind: 'night', line: '周一夜班留底' };
  const saved = start();
  const resumed = restoreRun({
    ...saved, phone, phoneLog: [phone], incomingCalls: ['lab-close', 'ringback'], ringbackArmed: true,
    flags: { ...saved.flags, nightDocument: true },
  });
  assert.equal(resumed.phone, null);
  assert.equal(getIncomingCall(resumed), null);
  assert.deepEqual(resumed.incomingCalls, []);
  assert.equal(resumed.ringbackArmed, false);
  assert.deepEqual(resumed.phoneLog, [phone]);
  assert.equal(resumed.flags.nightDocument, true);
});

test('the authentic R-071 pair directly files the lab original and only attachment changes Friday disposition', () => {
  const tuesday = playUntil(start(), (run) => run.day === 1 && run.phase === 'summary');
  const file = { type: 'file-trace-original' };
  assert.equal(canFileTraceOriginal(tuesday), false);
  assert.equal(dispatch(tuesday, { ...file, caseIds: [7, 14] }), tuesday);

  const handoff = playUntil(tuesday, (run) => run.phase === 'handoff');
  assert.equal(canFileTraceOriginal(handoff), true);
  const filed = dispatch(handoff, file);
  assert.deepEqual(filed, { ...handoff, flags: { ...handoff.flags, traceDocument: true } });
  assert.equal(canFileTraceOriginal(filed), false);
  assert.equal(dispatch(filed, file), filed);

  const passed = dispatch(filed, { type: 'finish' });
  assert.equal(getEnding(passed).id, 'routine');
  assert.equal(passed.records.find(({ id }) => id === TRACE_CASE_ID).status, 'shipped');

  const attached = dispatch(filed, { type: 'attach', key: 'trace' });
  const reviewed = dispatch(attached, { type: 'finish' });
  const ending = getEnding(reviewed);
  assert.equal(ending.id, 'trace');
  assert.equal(ending.traceReceipt.status, 'recallPending');
  assert.equal(ending.traceReceipt.amendments.length, 1);
});

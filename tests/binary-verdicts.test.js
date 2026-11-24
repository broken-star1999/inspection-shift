import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPACT_SCHEDULE, TUTORIAL, archivedReportSources, canFileTraceOriginal, canRecheckReceipt, createFollowingRun, createRun,
  dispatch, getCase, getDay, getEnding, getIntegrityTrail, getPreviousReceipt, getShipmentAcceptance,
  getShipmentException, getTutorialStep, restoreRun,
} from '../src/engine.js';

const options = { schedule: COMPACT_SCHEDULE, binaryVerdicts: true };
const actions = { brief: 'start-day', case: 'stamp', receipt: 'next', summary: 'advance-day', handoff: 'finish' };
const act = (run, type, details) => dispatch(run, { type, ...details });

function playUntil(run, stop, decisions = {}) {
  while (!stop(run)) {
    const item = getCase(run);
    if (run.binaryVerdicts && run.phase === 'case' && item?.id === 1 && run.sampleSet !== 4) {
      for (const { key } of TUTORIAL.slice(run.tutorial, -1)) run = act(run, 'tutorial', { key });
    }
    const verdict = run.binaryVerdicts && item?.answer === 'review' ? 'fail' : item?.answer;
    const next = run.event ? act(run, 'ack-visit') : act(run, actions[run.phase], { value: decisions[item?.id] ?? verdict });
    assert.notEqual(next, run, `day ${run.day + 1}, case ${run.index + 1}, ${run.phase}`);
    run = next;
  }
  return run;
}

const onCase = (id) => (run) => run.phase === 'case' && getCase(run)?.id === id;
const finish = (run) => playUntil(run, (state) => state.phase === 'ending');

test('the first binary batch requires coaching before either verdict and saves completion with the receipt', () => {
  let run = act(createRun(0, options), 'start-day');
  assert.ok(onCase(1)(run));
  assert.equal(act(run, 'tutorial', { key: 'sample' }), run);
  for (const key of ['label', 'report', 'signature', 'sample']) {
    assert.equal(getTutorialStep(run).key, key);
    assert.equal(act(run, 'stamp', { value: 'pass' }), run);
    assert.equal(act(run, 'stamp', { value: 'fail' }), run);
    run = restoreRun(JSON.parse(JSON.stringify(act(run, 'tutorial', { key }))));
  }
  assert.equal(getTutorialStep(run).key, 'stamp');
  for (const value of ['pass', 'fail']) {
    const receipt = act(run, 'stamp', { value });
    assert.equal(receipt.phase, 'receipt');
    assert.equal(receipt.tutorial, TUTORIAL.length);
    assert.equal(receipt.records[0].decision, value);
    assert.equal(restoreRun(receipt), receipt);
  }
});

test('restored first-batch progress is usable and a subsequent week skips coaching', () => {
  const first = act(createRun(0, options), 'start-day');
  for (const tutorial of [undefined, -1, TUTORIAL.length, '4']) {
    const restored = restoreRun({ ...first, tutorial });
    assert.equal(getTutorialStep(restored).key, 'label');
    assert.equal(act(restored, 'tutorial', { key: 'label' }).tutorial, 1);
  }
  const old = restoreRun({ ...first, tutorial: 3 });
  assert.equal(getTutorialStep(old).key, 'sample');
  assert.equal(act(old, 'tutorial', { key: 'sample' }).tutorial, 4);

  const replay = act(createFollowingRun(null, 0, options), 'start-day');
  assert.equal(act(replay, 'stamp', { value: 'pass' }).phase, 'receipt');
});

test('binary rejects a third stamp and keeps the actual held and returned dispositions', () => {
  const clean = createRun(0, options);
  const crack = playUntil(clean, onCase(4));
  assert.equal(act(crack, 'stamp', { value: 'review' }), crack);
  const returned = act(crack, 'stamp', { value: 'fail' });
  assert.equal(returned.records.at(-1).status, 'returned');

  const paperwork = playUntil(returned, onCase(11));
  const held = act(paperwork, 'stamp', { value: 'fail' });
  assert.equal(held.records.at(-1).decision, 'review');
  assert.equal(held.records.at(-1).status, 'held');
  assert.equal(canRecheckReceipt(held, 11), false);
  assert.equal(act(held, 'recheck-receipt', { id: 11, value: 'pass' }), held);

  const followup = playUntil(held, onCase(13));
  assert.equal(getPreviousReceipt(followup).record.status, 'held');
  const second = act(followup, 'stamp', { value: 'pass' });
  assert.equal(second.records.at(-1).status, 'shipping');
  const closed = finish(second);
  assert.match(getIntegrityTrail(closed).find(({ batch }) => batch === 'G-211').initial, /周二首章不通过/u);
  assert.equal(Object.hasOwn(getEnding(closed).counts, 'review'), false);
  assert.equal(getEnding(closed).counts.fail, closed.records.filter(({ decision }) => decision !== 'pass').length);
  assert.equal(createFollowingRun(closed, 5, options).binaryVerdicts, true);
});

test('normal and exceptional receiving papers file on Friday and giving the final receipt ends the week', () => {
  for (const decisions of [{}, { 4: 'pass' }]) {
    const start = createRun(0, options);
    const closing = playUntil(start, onCase(20), decisions);
    assert.equal(closing.event, null);
    assert.ok(closing.seen.includes(20));
    const section = decisions[4] ? getShipmentException(closing) : getShipmentAcceptance(closing);
    assert.equal(section.caseId, decisions[4] ? 4 : 14);
    assert.equal(section.day, 4);

    const lastReceipt = act(closing, 'stamp', { value: 'pass' });
    assert.equal(lastReceipt.phase, 'receipt');
    const closed = act(lastReceipt, 'next');
    assert.equal(closed.phase, 'ending');
    assert.equal(closed.records.at(-1).status, 'shipped');
    assert.equal(getEnding(closed).id, decisions[4] ? 'issue' : 'routine');
    assert.equal(act(closed, 'next'), closed);
  }
});

test('binary replacements keep the ordinary report dates while closing the lab routes', () => {
  const start = createRun(0, options);
  const paperwork = playUntil(start, onCase(14));
  assert.equal(archivedReportSources(paperwork, 'R-071').length, 0);
  assert.equal(archivedReportSources(paperwork, 'R-073').at(0).id, 7);
  assert.equal(getCase(paperwork).documents.length, 2);
  assert.deepEqual(getCase(paperwork).documents[1].fields.find(([label]) => label === '签发时间'), ['签发时间', '周四 09:10']);
  assert.doesNotMatch(getDay(paperwork).outro, /改章|实验室原件/u);
  assert.equal(canFileTraceOriginal(paperwork), false);
  assert.equal(act(paperwork, 'file-trace-original'), paperwork);
  assert.equal(act(paperwork, 'dial', { number: '204' }), paperwork);

  const rework = playUntil(start, (state) => state.day === 1 && state.phase === 'case', { 2: 'fail' });
  assert.equal(rework.event, null);
  assert.equal(rework.flags['rework:2Document'], true);
});

test('switching a saved live shift to binary files a waiting authentic receipt once and preserves old archival papers', () => {
  const legacy = createRun(0, { schedule: COMPACT_SCHEDULE });
  const waiting = playUntil(legacy, (state) => state.event?.kind === 'acceptance');
  const migration = restoreRun({ ...waiting, binaryVerdicts: true });
  assert.equal(migration.event, null);
  assert.equal(getCase(migration).id, 20);
  assert.deepEqual(migration.acceptanceReceipt, { caseId: waiting.event.caseId, day: waiting.day });
  assert.deepEqual(archivedReportSources(migration, 'R-071').map(({ id }) => id), [7, 14]);
  assert.equal(restoreRun(migration), migration);

  const handoff = playUntil(waiting, (state) => state.phase === 'handoff');
  const originalFiled = act(handoff, 'file-trace-original');
  const attached = act(originalFiled, 'attach', { key: 'trace' });
  const resumed = restoreRun({ ...attached, pending: ['night'], binaryVerdicts: true });
  assert.equal(resumed.phase, 'handoff');
  assert.deepEqual(resumed.acceptanceReceipt, migration.acceptanceReceipt);
  assert.deepEqual(resumed.pending, []);
  assert.equal(resumed.flags.traceDocument, true);
  assert.equal(act(resumed, 'attach', { key: 'trace', value: false }), resumed);
  assert.equal(act(resumed, 'recheck', { id: 7, value: 'fail' }), resumed);
  assert.equal(getEnding(act(resumed, 'finish')).id, 'routine');
});

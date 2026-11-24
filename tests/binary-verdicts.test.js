import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPACT_SCHEDULE, archivedReportSources, canFileTraceOriginal, canRecheckReceipt, createFollowingRun, createRun,
  dispatch, getCase, getDay, getEnding, getIntegrityTrail, getPreviousReceipt, getShipmentAcceptance,
  getShipmentException, getTutorialStep, restoreRun,
} from '../src/engine.js';

const options = { schedule: COMPACT_SCHEDULE, binaryVerdicts: true };
const actions = { brief: 'start-day', case: 'stamp', receipt: 'next', summary: 'advance-day', handoff: 'finish' };
const act = (run, type, details) => dispatch(run, { type, ...details });

function playUntil(run, stop, decisions = {}) {
  while (!stop(run)) {
    const item = getCase(run);
    if (run.binaryVerdicts && run.phase === 'case') {
      for (let step = getTutorialStep(run); step && step.key !== 'stamp'; step = getTutorialStep(run)) {
        const guided = act(run, 'tutorial', { key: step.key });
        assert.notEqual(guided, run, step.key);
        run = guided;
      }
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

test('the first binary batch walks each real field and both sample checks before either verdict', () => {
  let run = act(createRun(0, options), 'start-day');
  assert.ok(onCase(1)(run));
  const sequence = [
    'label', 'label-batch', 'report-batch', 'order-batch', 'required-paper', 'signature', 'required-projects',
    'reported-appearance', 'reported-clasp', 'pick-sample', 'lens', 'sample',
  ];
  for (const key of sequence) {
    const step = getTutorialStep(run);
    assert.equal(step.key, key);
    if (step.paper) {
      const document = getCase(run).documents.find(({ type }) => type === step.paper);
      assert.ok(document?.fields.some(([field]) => field === step.field), key);
      assert.equal(act(run, 'tutorial', { key: 'pick-sample' }), run);
    }
    assert.equal(act(run, 'tutorial', { key: 'stamp' }), run);
    assert.equal(act(run, 'stamp', { value: 'pass' }), run);
    assert.equal(act(run, 'stamp', { value: 'fail' }), run);
    run = restoreRun(JSON.parse(JSON.stringify(act(run, 'tutorial', { key }))));
  }
  assert.equal(getTutorialStep(run).key, 'stamp');
  for (const value of ['pass', 'fail']) {
    const receipt = act(run, 'stamp', { value });
    assert.equal(receipt.phase, 'receipt');
    assert.equal(receipt.tutorial, 'done');
    assert.equal(receipt.records[0].decision, value);
    assert.equal(restoreRun(receipt), receipt);
  }
});

test('restored first-batch progress is usable and a subsequent week skips coaching', () => {
  const first = act(createRun(0, options), 'start-day');
  for (const tutorial of [undefined, -1, 5, '4', 'done']) {
    const restored = restoreRun({ ...first, tutorial });
    assert.equal(getTutorialStep(restored).key, 'label');
    assert.equal(act(restored, 'tutorial', { key: 'label' }).tutorial, 'label-batch');
  }
  for (const [tutorial, key] of [[0, 'label'], [1, 'label-batch'], [2, 'label-batch'], [3, 'pick-sample'], [4, 'stamp']]) {
    assert.equal(getTutorialStep(restoreRun({ ...first, tutorial })).key, key);
  }
  const current = { ...first, tutorial: 'reported-appearance' };
  assert.equal(restoreRun(current), current);
  assert.equal(act(current, 'tutorial', { key: 'reported-appearance' }).tutorial, 'reported-clasp');

  const replay = act(createFollowingRun(null, 0, options), 'start-day');
  assert.equal(act(replay, 'stamp', { value: 'pass' }).phase, 'receipt');
});

test('the second batch starts at the papers and requires film, lens, and clasp checks before a verdict', () => {
  let run = playUntil(createRun(0, options), onCase(2));
  assert.equal(run.tutorial, 'label');
  assert.equal(restoreRun({ ...run, tutorial: 'done' }).tutorial, 'label');
  assert.equal(restoreRun({ ...run, tutorial: 5 }).tutorial, 'label');
  const sequence = [
    'label', 'label-batch', 'report-batch', 'order-batch', 'required-paper', 'signature', 'required-projects',
    'reported-appearance', 'reported-clasp', 'pick-sample', 'film', 'lens', 'sample',
  ];
  for (const key of sequence) {
    const step = getTutorialStep(run);
    assert.equal(step.key, key);
    if (step.paper) {
      const document = getCase(run).documents.find(({ type }) => type === step.paper);
      assert.ok(document?.fields.some(([field]) => field === step.field), key);
      assert.equal(act(run, 'tutorial', { key: 'film' }), run);
    }
    assert.equal(act(run, 'stamp', { value: 'pass' }), run);
    assert.equal(act(run, 'stamp', { value: 'fail' }), run);
    run = restoreRun(JSON.parse(JSON.stringify(act(run, 'tutorial', { key }))));
  }
  assert.equal(getTutorialStep(run).key, 'stamp');
  assert.equal(act(run, 'stamp', { value: 'fail' }).records.at(-1).decision, 'fail');
  assert.equal(act(run, 'stamp', { value: 'pass' }).records.at(-1).decision, 'pass');
});

test('new four-batch weeks close each day after exactly four receipts', () => {
  const first = createRun(0, { ...options, batchesPerDay: 4 });
  const closed = finish(first);
  assert.deepEqual([0, 1, 2, 3, 4].map((day) => closed.records.filter((receipt) => receipt.day === day).length), [4, 4, 4, 4, 4]);
  assert.deepEqual(closed.records.slice(0, 2).map(({ id }) => id), [1, 2]);
  assert.equal(closed.records.at(-1).id, 20);
  assert.equal(restoreRun(JSON.parse(JSON.stringify(closed))).batchesPerDay, 4);
});

test('the ending features the actual receipt and dates for accepted, early, stopped, and delayed cargo', () => {
  const week = () => createRun(0, { ...options, batchesPerDay: 4 });
  const featured = (decisions) => {
    const ending = getEnding(playUntil(week(), (state) => state.phase === 'ending', decisions));
    assert.equal(ending.comment, ending.featuredCase.aftermath.comment);
    assert.ok(ending.comment && ending.featuredCase.aftermath.line);
    return ending.featuredCase;
  };

  const accepted = featured({});
  assert.equal(accepted.batch, 'G-248');
  assert.equal(accepted.title, '等材料齐了，货才到站');
  assert.equal(accepted.outcome, 'accepted');
  assert.match(accepted.aftermath.line, /下一箱我照常送过来/u);
  assert.deepEqual(accepted.steps.map(({ detail }) => detail), ['不通过', '周四 09:10', '收货方已签收']);

  const early = featured({ 10: 'pass' });
  assert.equal(early.batch, 'G-248');
  assert.equal(early.title, '车先走了，报告后到');
  assert.equal(early.outcome, 'early');
  assert.match(early.aftermath.comment, /签发晚于出库/u);
  assert.deepEqual(early.steps.slice(0, 2).map(({ detail }) => detail), ['通过', '周四 09:10']);
  assert.match(early.steps.at(-1).detail, /出库|暂缓入库/u);

  const stopped = featured({ 4: 'pass' });
  assert.equal(stopped.batch, 'G-204');
  assert.equal(stopped.outcome, 'stopped');
  assert.match(stopped.aftermath.line, /工位停了一整班/u);
  assert.match(stopped.steps.at(-1).detail, /收货方暂缓入库/u);
  assert.match(stopped.note, /裂纹/u);

  const delayed = featured({ 1: 'fail' });
  assert.equal(delayed.batch, 'G-201');
  assert.equal(delayed.title, '有一批合格品还在等');
  assert.equal(delayed.outcome, 'delayed');
  assert.match(delayed.steps.at(-1).detail, /退回/u);
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

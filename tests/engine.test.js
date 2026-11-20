import assert from 'node:assert/strict';
import test from 'node:test';
import { archive, createFollowingRun, createRun, dispatch, getCase, getEnding, getIncomingCall, getPreviousReceipt, restoreRun, TUTORIAL } from '../src/engine.js';

function act(state, type, details) {
  return dispatch(state, { type, ...details });
}

function takeRecallReceipt(state, id) {
  const delivered = act(state, 'receive-recall', { id });
  assert.equal(delivered.event?.caseId, id);
  return act(delivered, 'ack-visit');
}

function untilHandoff(seed, { decisions = {}, inspect = (state) => state, initialState = createRun(seed) } = {}) {
  let state = initialState;
  while (state.phase !== 'handoff') {
    if (state.phase !== 'case' && state.event) state = act(state, 'ack-visit');
    else if (state.phase === 'brief') state = act(state, 'start-day');
    else if (state.phase === 'summary') state = act(state, 'advance-day');
    else if (state.phase === 'case') {
      const item = getCase(state);
      if (item.id === 1) {
        for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
      }
      state = inspect(state, item);
      while (state.event) state = act(state, 'ack-visit');
      state = act(state, 'stamp', { value: decisions[item.id] ?? item.answer });
    } else state = act(state, 'next');
  }
  return state;
}

function tuesdayClosingReceipt() {
  let receipt;
  untilHandoff(21, { inspect: (state, item) => {
    if (state.day === 1 && state.index === 3) receipt = act(state, 'stamp', { value: item.answer });
    return state;
  } });
  return receipt;
}

test('first stamp stays at the desk until all four guided checks are done', () => {
  const initial = createRun(4);
  let state = act(initial, 'start-day');
  assert.equal(initial.records.length, 0);
  assert.equal(getCase(state).id, 1);
  assert.equal(act(state, 'stamp', { value: 'pass' }), state);
  assert.equal(act(state, 'tutorial', { key: 'sample' }), state);
  for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
  state = act(state, 'stamp', { value: 'pass' });
  assert.equal(state.phase, 'receipt');
  assert.equal(state.records[0].decision, 'pass');
  assert.equal(Object.hasOwn(state.records[0], 'findings'), false);
  assert.equal(act(state, 'stamp', { value: 'pass' }), state);
  assert.equal(getCase(act(state, 'next')).id, 2);
});

test('an experienced week can begin without a previous snapshot and stamp the first case immediately', () => {
  const seed = 'experienced replay';
  const original = createRun(seed);
  const experienced = createFollowingRun(null, seed);
  assert.deepEqual(experienced, { ...original, tutorial: TUTORIAL.length });
  const first = act(experienced, 'start-day');
  assert.equal(getCase(first).id, 1);
  const stamped = act(first, 'stamp', { value: 'pass' });
  assert.equal(stamped.phase, 'receipt');
  assert.equal(stamped.records[0].id, 1);
});

test('an experienced replay changes an otherwise identical specimen pair and keeps the new seed', () => {
  const seed = 21;
  const specimenVariants = (state) => archive(state).filter(({ id }) => id === 8 || id === 12).map(({ variant }) => variant);
  const previous = act(untilHandoff(seed), 'finish');
  const replay = createFollowingRun(previous, seed);
  assert.equal(replay.seed, seed);
  assert.deepEqual(replay.flags, createRun(seed).flags);
  assert.ok([8, 12].includes(replay.variantOverride.caseId));
  const played = untilHandoff(seed, { initialState: JSON.parse(JSON.stringify(replay)) });
  const priorVersions = specimenVariants(previous);
  const newVersions = specimenVariants(played);
  assert.equal(newVersions.filter((variant, index) => variant !== priorVersions[index]).length, 1);
  const next = createFollowingRun(act(played, 'finish'), seed);
  assert.equal(next.variantOverride, undefined);
  assert.deepEqual(specimenVariants(untilHandoff(seed, { initialState: next })), priorVersions);
});

test('a receipt preserves selected findings alongside the legacy note after reload', () => {
  let state = act(createRun(4), 'start-day');
  for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
  const findings = [
    { key: 'doc:0:0', source: '外箱标签', text: '批号 · G-201' },
    { key: 'doc:1:0', source: '检验报告', text: '批号 · G-201' },
  ];
  state = act(state, 'stamp', { value: 'pass', note: '初查材料齐全', findings });
  const receipt = state.records[0];
  findings[0].text = '替换原内容';
  assert.equal(receipt.findings[0].text, '批号 · G-201');
  state = act(JSON.parse(JSON.stringify(state)), 'next');
  assert.deepEqual(archive(state).find(({ id }) => id === 1).record, receipt);
  assert.equal(receipt.note, '初查材料齐全');
  state = act(state, 'stamp', { value: 'review', findings: [] });
  assert.equal(Object.hasOwn(state.records[1], 'findings'), false);
  assert.equal(state.records[1].note, '请核对送检材料');
});

test('same seed remains playable after JSON restore and contains one of each pressure event', () => {
  const weeks = [];
  for (let seed = 0; seed < 24; seed++) {
    const events = [];
    const week = untilHandoff(seed, { inspect: (state, item) => {
      const restored = JSON.parse(JSON.stringify(state));
      assert.deepEqual(getCase(restored), item);
      if (item.pressure) events.push([item.pressure, item.id]);
      return restored;
    } });
    assert.equal(week.records.length, 20);
    assert.deepEqual(events.map(([type]) => type), ['favor', 'warning'].sort((a, b) => {
      const slots = { favor: week.flags.offerCase, warning: week.flags.warningCase };
      return slots[a] - slots[b];
    }));
    const ending = getEnding(act(week, 'finish'));
    assert.equal(ending.id, 'routine');
    assert.deepEqual(ending.delayed, { count: 0, batches: [] });
    weeks.push(week);
  }
  for (const id of [8, 12]) {
    const answers = new Set(weeks.map((week) => week.records.find((record) => record.id === id).answer));
    assert.deepEqual(answers, new Set(['pass', 'fail']));
  }
  const allowedOrders = [
    ['1,2,3,4'],
    ['5,6,7,8', '5,8,7,6'],
    ['9,10,11,12', '12,10,11,9'],
    ['13,15,14,16', '13,16,14,15'],
    ['17,18,19,20', '17,19,18,20'],
  ];
  for (const [day, allowed] of allowedOrders.entries()) {
    const orders = weeks.map((week) => week.records.filter((record) => record.day === day).map(({ id }) => id).join(','));
    assert.deepEqual(new Set(orders), new Set(allowed));
  }
});

test('a saved week without the schedule marker retains its original arrival order', () => {
  const state = createRun(9);
  delete state.schedule;
  const week = untilHandoff(9, { initialState: state });
  assert.deepEqual(week.records.map(({ id }) => id), Array.from({ length: 20 }, (_, index) => index + 1));
});

test('a version-one arrival schedule keeps its Friday cases across a midweek reload', () => {
  const seed = 21;
  const week = untilHandoff(seed, { initialState: { ...createRun(seed), schedule: 1 }, inspect: (state) => {
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(getCase(restored).id, getCase(state).id);
    return restored;
  } });
  assert.deepEqual(week.records.map(({ id }) => id), [1,2,3,4,5,8,7,6,12,10,11,9,13,16,14,15,17,18,19,20]);
  const current = untilHandoff(seed);
  assert.deepEqual(current.records.slice(0, -4), week.records.slice(0, -4));
  assert.deepEqual(current.records.slice(-4).map(({ id }) => id), [17,19,18,20]);
});

test('trace needs both archived records, the lab visit and submission at handoff', () => {
  let state = untilHandoff('trace', { inspect: (state, item) => {
    if (item.id === 7) {
      const called = act(state, 'dial', { number: '204', caseIds: [7, 14] });
      assert.equal(called.phone.kind, 'hint');
      assert.deepEqual(called.pending, []);
      return called;
    }
    if (item.id === 14) {
      assert.deepEqual(archive(state, '071').map(({ id }) => id), [7, 14]);
      const hint = act(state, 'dial', { number: '204', caseIds: [14] });
      assert.equal(hint.phone.kind, 'hint');
      const called = act(hint, 'dial', { number: '204', caseIds: [7, 14] });
      assert.equal(called.phone.kind, 'trace');
      assert.equal(called.flags.traceDocument, false);
      assert.deepEqual(called.pending, ['trace']);
      return called;
    }
    if (state.records.at(-1)?.id === 14) {
      assert.equal(state.event.npc, 'chen');
      assert.equal(state.flags.traceDocument, false);
      assert.equal(act(state, 'stamp', { value: item.answer }), state);
    }
    return state;
  } });
  assert.equal(getEnding(state).id, 'routine');
  state = act(state, 'attach', { key: 'trace' });
  assert.equal(getEnding(state).id, 'trace');
  const findings = [{ key: 'trace:source', source: 'R-071 实验室原件', text: '样品来源 · 试样 S-019' }];
  const corrected = act(state, 'recheck', { id: 7, value: 'review', findings });
  assert.match(getEnding(corrected).traceDisposition, /等待收货方确认/);
  const tracedCorrection = getEnding(act(corrected, 'finish'));
  assert.equal(tracedCorrection.id, 'trace');
  assert.equal(tracedCorrection.traceReceipt.status, 'recalled');
  assert.deepEqual(tracedCorrection.traceReceipt.amendments.at(-1).findings, findings);
  const confirmedTrace = getEnding(act(takeRecallReceipt(corrected, 7), 'finish'));
  assert.deepEqual(confirmedTrace.traceReceipt.recallReceipt, { day: 4, amendmentIndex: 0 });
  assert.deepEqual(confirmedTrace.confirmedRecalls, []);
  state = act(state, 'finish');
  assert.equal(state.phase, 'ending');
  assert.equal(state.records.find(({ id }) => id === 7).status, 'recalled');
  const ending = getEnding(state);
  assert.match(ending.traceDisposition, /确认召回/);
  assert.equal(ending.traceReceipt, state.records.find(({ id }) => id === 7));
  assert.deepEqual(ending.delayedReceipts, []);
});

test('report filed during handoff can still lead to an on-site hold', () => {
  let state = untilHandoff(4, { decisions: { 7: 'review' } });
  state = act(state, 'dial', { number: '204', caseIds: [7, 14] });
  assert.equal(state.event.npc, 'chen');
  state = act(state, 'ack-visit');
  state = act(state, 'attach', { key: 'trace' });
  state = act(state, 'finish');
  assert.equal(getEnding(state).id, 'trace');
  assert.match(getEnding(state).traceDisposition, /已封存/);
  assert.deepEqual(getEnding(state).delayed, { count: 0, batches: [] });
});

test('two late calls survive reload and grant one document per receipt', () => {
  let state = untilHandoff(9);
  state = act(state, 'dial', { number: '204', caseIds: [7, 14] });
  state = act(state, 'dial', { number: '107', caseIds: [11] });
  state = act(state, 'dial', { number: '204', caseIds: [7, 14] });
  state = act(state, 'dial', { number: '107', caseIds: [11] });
  assert.deepEqual(state.pending, []);
  assert.deepEqual(state.events.map(({ key }) => key), ['trace', 'night']);
  assert.equal(state.event.key, 'trace');
  assert.equal(state.flags.traceDocument, false);
  assert.equal(state.flags.nightDocument, false);
  assert.equal(act(state, 'attach', { key: 'trace' }), state);
  assert.equal(act(state, 'finish'), state);

  state = act(JSON.parse(JSON.stringify(state)), 'ack-visit');
  assert.equal(state.flags.traceDocument, true);
  assert.equal(state.flags.nightDocument, false);
  assert.equal(state.event.key, 'night');
  assert.equal(act(state, 'attach', { key: 'night' }), state);
  assert.equal(act(state, 'finish'), state);
  state = act(state, 'attach', { key: 'trace' });
  assert.equal(state.flags.traceAttached, true);

  state = act(JSON.parse(JSON.stringify(state)), 'ack-visit');
  assert.equal(state.flags.nightDocument, true);
  assert.equal(state.event, null);
  assert.deepEqual(state.events, []);
  assert.equal(act(state, 'ack-visit'), state);
  state = act(state, 'attach', { key: 'night' });
  assert.equal(state.flags.nightAttached, true);
  assert.equal(getEnding(act(state, 'finish')).id, 'trace');
});

test('a v1 save with previously granted evidence can still acknowledge the listed visit', () => {
  let state = act(untilHandoff(9), 'dial', { number: '107', caseIds: [11] });
  const legacy = { ...state, flags: { ...state.flags, nightDocument: true } };
  state = act(JSON.parse(JSON.stringify(legacy)), 'ack-visit');
  assert.equal(state.flags.nightDocument, true);
  assert.equal(state.event, null);
  assert.deepEqual(state.events, []);
});

test('the next arrival enters the archive after both visitors hand over their papers', () => {
  let checked = false;
  untilHandoff(21, { inspect: (state, item) => {
    if (item.id === 14) {
      state = act(state, 'dial', { number: '204', caseIds: [14, 7] });
      return act(state, 'dial', { number: '107', caseIds: [11] });
    }
    if (state.records.at(-1)?.id !== 14) return state;

    assert.deepEqual(state.events.map(({ key }) => key), ['trace', 'night']);
    assert.equal(state.seen.includes(item.id), false);
    const legacy = { ...state, seen: [...state.seen, item.id] };
    for (const saved of [state, legacy]) {
      let waiting = JSON.parse(JSON.stringify(saved));
      assert.equal(archive(waiting).some(({ id }) => id === item.id), false);
      assert.equal(archive(waiting, 'R-071').find(({ id }) => id === 14).record.id, 14);
      assert.equal(act(waiting, 'stamp', { value: item.answer }), waiting);
      waiting = act(waiting, 'ack-visit');
      assert.equal(waiting.flags.traceDocument, true);
      assert.equal(waiting.flags.nightDocument, false);
      assert.equal(waiting.event.key, 'night');
      assert.equal(archive(waiting).some(({ id }) => id === item.id), false);
      waiting = act(JSON.parse(JSON.stringify(waiting)), 'ack-visit');
      assert.equal(waiting.flags.nightDocument, true);
      assert.equal(waiting.event, null);
      assert.equal(archive(waiting).find(({ id }) => id === item.id).record, null);
      assert.equal(waiting.seen.filter((id) => id === item.id).length, 1);
    }
    checked = true;
    return state;
  } });
  assert.equal(checked, true);
});

test('sending every batch to review reports the release-ready batches that remain held', () => {
  const decisions = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, 'review']));
  const ending = getEnding(act(untilHandoff(21, { decisions }), 'finish'));
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.delayed, { count: 12, batches: ['G-201', 'G-202', 'G-203'] });
  assert.equal(ending.delayedReceipts.length, 12);
  assert.deepEqual(ending.delayedReceipts.slice(0, 3).map(({ id }) => id), [1, 2, 3]);
});

test('a corrected decision removes the released batch from the handoff delay', () => {
  let state = untilHandoff(9, { decisions: { 1: 'review', 2: 'fail' } });
  assert.deepEqual(getEnding(state).delayed, { count: 2, batches: ['G-201', 'G-202'] });
  state = act(state, 'recheck', { id: 1, value: 'pass' });
  assert.deepEqual(getEnding(act(state, 'finish')).delayed, { count: 1, batches: ['G-202'] });
});

test('an unconfirmed recall leaves bad freight unresolved and reports sound freight separately', () => {
  const week = untilHandoff(21, { decisions: { 4: 'pass' } });
  const requested = act(act(week, 'recheck', { id: 4, value: 'review' }), 'recheck', { id: 1, value: 'fail' });
  const ending = getEnding(act(requested, 'finish'));
  assert.equal(ending.id, 'issue');
  assert.deepEqual(ending.issues.map(({ id }) => id), [4]);
  assert.deepEqual(ending.pendingRecalls.map(({ id }) => id), [1, 4]);
  assert.deepEqual(ending.confirmedRecalls, []);
  assert.deepEqual(ending.delayedReceipts, []);
  assert.match(ending.detail, /G-204 · 召回待确认/);
  assert.equal(act(requested, 'receive-recall', { id: 15 }), requested);
  assert.equal(act(requested, 'ack-visit'), requested);

  const atWindow = act(requested, 'receive-recall', { id: 4 });
  assert.equal(atWindow.event.key, 'recall:4');
  assert.equal(atWindow.event.kind, 'recall');
  assert.match(atWindow.event.line, /G-204/);
  assert.equal(atWindow.records, requested.records);
  assert.equal(act(atWindow, 'receive-recall', { id: 1 }), atWindow);
  assert.equal(act(atWindow, 'finish'), atWindow);
  const received = act(JSON.parse(JSON.stringify(atWindow)), 'ack-visit');
  assert.deepEqual(received.flags, requested.flags);
  assert.deepEqual(received.events, []);
  assert.equal(act(received, 'ack-visit'), received);
  const closed = getEnding(act(received, 'finish'));
  assert.equal(closed.id, 'routine');
  assert.deepEqual(closed.pendingRecalls.map(({ id }) => id), [1]);
  assert.deepEqual(closed.confirmedRecalls.map(({ id, recallReceipt }) => [id, recallReceipt]),
    [[4, { day: 4, amendmentIndex: 0 }]]);
  assert.equal(closed.confirmedRecalls[0].amendments[0].status, 'recallPending');
  assert.equal(received.records.find(({ id }) => id === 15).status, 'returned');
});

test('canceling an offsite recall keeps shipping history and invalidates the previous pickup', () => {
  const week = untilHandoff(21, { decisions: { 4: 'pass' } });
  const requested = act(week, 'recheck', { id: 4, value: 'review' });
  const waiting = act(requested, 'receive-recall', { id: 4 });
  const canceled = act(waiting, 'recheck', { id: 4, value: 'pass' });
  assert.equal(canceled.records.find(({ id }) => id === 4).status, 'shipped');
  assert.deepEqual(getEnding(canceled).pendingRecalls, []);
  assert.deepEqual(getEnding(canceled).issues.map(({ id }) => id), [4]);

  const reopened = act(canceled, 'recheck', { id: 4, value: 'fail' });
  const stale = act(reopened, 'ack-visit');
  const row = stale.records.find(({ id }) => id === 4);
  assert.equal(stale.event, null);
  assert.equal(row.status, 'recallPending');
  assert.equal(row.recallReceipt, undefined);
  const taken = takeRecallReceipt(stale, 4);
  assert.deepEqual(taken.records.find(({ id }) => id === 4).recallReceipt, { day: 4, amendmentIndex: 2 });
});

test('accepting a signed supplement supersedes an outstanding request on its historical lot', () => {
  const week = untilHandoff(21, { decisions: { 5: 'pass', 9: 'review' } });
  const requested = act(week, 'recheck', { id: 5, value: 'review' });
  const waiting = act(requested, 'receive-recall', { id: 5 });
  const accepted = act(waiting, 'recheck', { id: 9, value: 'pass' });
  const historical = archive(accepted, 'G-205').find(({ id }) => id === 5);
  assert.equal(historical.latestReceipt.status, 'shipped');
  assert.deepEqual(getEnding(accepted).pendingRecalls, []);
  const taken = act(accepted, 'ack-visit');
  assert.equal(taken.event, null);
  assert.equal(taken.records.find(({ id }) => id === 5).recallReceipt, undefined);
  assert.equal(act(taken, 'receive-recall', { id: 5 }), taken);
  assert.equal(getEnding(act(taken, 'finish')).id, 'routine');
});

test('old recalled shipments stay confirmed without a newly invented confirmation receipt', () => {
  const week = untilHandoff(21, { decisions: { 4: 'pass' } });
  const legacy = JSON.parse(JSON.stringify(act(week, 'recheck', { id: 4, value: 'review' })));
  const record = legacy.records.find(({ id }) => id === 4);
  record.status = 'recalled';
  record.amendments[0].status = 'recalled';
  assert.equal(act(legacy, 'receive-recall', { id: 4 }), legacy);
  const ending = getEnding(act(legacy, 'finish'));
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.pendingRecalls, []);
  assert.deepEqual(ending.confirmedRecalls, []);
});

test('each Friday amendment preserves its own findings alongside the original and legacy entries', () => {
  let firstCase = act(createRun(21), 'start-day');
  for (const { key } of TUTORIAL.slice(0, -1)) firstCase = act(firstCase, 'tutorial', { key });
  const firstFindings = [{ key: 'doc:0:0', source: '外箱标签', text: '批号 · G-201' }];
  const initialState = act(firstCase, 'stamp', { value: 'pass', findings: firstFindings, note: '初查已签发' });
  const week = untilHandoff(21, { initialState });
  const legacy = takeRecallReceipt(act(week, 'recheck', { id: 1, value: 'review', findings: [{ key: '', text: '忽略空键' }] }), 1);
  assert.deepEqual(legacy.records[0].amendments, [
    { from: 'pass', to: 'review', status: 'recallPending', previousStatus: 'shipped', day: 4 },
  ]);

  const firstAmendment = [{ key: ' doc:1:1 ', source: ' 检验报告 ', text: ' 报告编号 · R-061 ' }];
  const revised = act(JSON.parse(JSON.stringify(legacy)), 'recheck', {
    id: 1, value: 'fail', findings: [...firstAmendment, { key: 'doc:1:1', text: '忽略重复条目' }],
  });
  firstAmendment[0].text = '草稿后来改动';
  const secondAmendment = [{ key: 'doc:2:1', source: '送检联', text: '检验项目 · 外观、扣合' }];
  assert.equal(act(revised, 'recheck', { id: 1, value: 'fail', findings: secondAmendment }), revised);
  const released = act(revised, 'recheck', { id: 1, value: 'pass', findings: secondAmendment });
  secondAmendment.pop();
  const restored = JSON.parse(JSON.stringify(released));
  const { record } = archive(restored, 'G-201').find(({ id }) => id === 1);
  assert.deepEqual(record.findings, firstFindings);
  assert.equal(record.note, '初查已签发');
  assert.equal(record.original, 'pass');
  assert.equal(record.status, 'shipping');
  assert.deepEqual(record.amendments, [
    ...legacy.records[0].amendments,
    { from: 'review', to: 'fail', previousStatus: 'recalled', status: 'recalled', day: 4,
      findings: [{ key: 'doc:1:1', source: '检验报告', text: '报告编号 · R-061' }] },
    { from: 'fail', to: 'pass', previousStatus: 'recalled', status: 'shipping', day: 4,
      findings: [{ key: 'doc:2:1', source: '送检联', text: '检验项目 · 外观、扣合' }] },
  ]);
  assert.deepEqual(week.records[0].amendments, []);
  assert.deepEqual(week.records[0].findings, firstFindings);
});

test('recalling an accepted supplement reports the current receipt until the lot is released again', () => {
  const week = untilHandoff(21);
  const recalled = takeRecallReceipt(act(week, 'recheck', { id: 9, value: 'review' }), 9);
  const finished = act(recalled, 'finish');
  const ending = getEnding(finished);
  const active = finished.records.find(({ id }) => id === 9);
  assert.equal(active.status, 'recalled');
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.delayed, { count: 1, batches: ['G-205'] });
  assert.deepEqual(ending.delayedReceipts, [active]);
  assert.equal(ending.traceReceipt, null);

  const released = act(recalled, 'recheck', { id: 9, value: 'pass' });
  const releasedEnding = getEnding(act(released, 'finish'));
  assert.deepEqual(releasedEnding.delayed, { count: 0, batches: [] });
  assert.deepEqual(releasedEnding.delayedReceipts, []);
});

test('a second non-pass amendment keeps an accepted supplement in recall with a Friday history', () => {
  const week = untilHandoff(21, { decisions: { 20: 'review' } });
  const requested = act(week, 'recheck', { id: 9, value: 'review' });
  const amended = act(JSON.parse(JSON.stringify(requested)), 'recheck', { id: 9, value: 'fail' });
  const revised = takeRecallReceipt(amended, 9);
  const original = archive(revised, 'G-205').find(({ id }) => id === 5);
  const supplement = original.latestReceipt;
  assert.equal(original.record.status, 'held');
  assert.equal(supplement.id, 9);
  assert.equal(supplement.day, 2);
  assert.equal(supplement.decision, 'fail');
  assert.equal(supplement.status, 'recalled');
  assert.deepEqual(supplement.recallReceipt, { day: 4, amendmentIndex: 0 });
  assert.deepEqual(supplement.amendments, [
    { from: 'pass', to: 'review', previousStatus: 'shipped', status: 'recallPending', day: 4 },
    { from: 'review', to: 'fail', previousStatus: 'recallPending', status: 'recallPending', day: 4 },
  ]);
  assert.deepEqual(getEnding(act(revised, 'finish')).delayedReceipts, [supplement, revised.records.at(-1)]);

  const released = act(revised, 'recheck', { id: 9, value: 'pass' });
  assert.equal(archive(released, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipping');
  const returned = act(released, 'recheck', { id: 20, value: 'fail' });
  assert.equal(returned.records.at(-1).status, 'returned');
  const finished = act(returned, 'finish');
  assert.equal(archive(finished, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipped');
});

test('newly signed proof clears a premature release, while G-204 is tracked separately', () => {
  let state = untilHandoff(9, { decisions: { 4: 'pass', 5: 'pass', 10: 'pass', 11: 'pass' } });
  for (const [id, verifiedBy] of [[5, 9], [10, 14], [11, 13]]) {
    assert.equal(state.records.find((record) => record.id === id).verifiedBy, verifiedBy);
  }
  assert.equal(getEnding(state).id, 'issue');
  assert.deepEqual(getEnding(state).issues.map(({ id }) => id), [4]);
  state = act(state, 'recheck', { id: 4, value: 'review' });
  state = takeRecallReceipt(state, 4);
  const revised = state.records.find(({ id }) => id === 4);
  assert.equal(revised.original, 'pass');
  assert.equal(revised.status, 'recalled');
  assert.equal(revised.amendments[0].previousStatus, 'shipped');
  const corrected = getEnding(act(state, 'finish'));
  assert.equal(corrected.id, 'routine');
  assert.deepEqual(corrected.delayedReceipts, []);
});

test('a signed same-lot supplement preserves the prior shipment in its immediate receipt', () => {
  const previousIds = new Map([[9, 5], [13, 11], [14, 10]]);
  for (const scenario of [
    { decisions: { 4: 'pass', 5: 'pass', 10: 'pass', 11: 'pass' }, expected: 'shipped' },
    { decisions: { 4: 'pass', 11: 'fail' }, expected: 'shipping' },
  ]) {
    const checked = new Set();
    untilHandoff(21, { decisions: scenario.decisions, inspect: (state, item) => {
      if (item.id === 15) {
        const remainder = act(state, 'stamp', { value: 'pass' });
        const old = archive(remainder, 'G-204').find(({ id }) => id === 4);
        assert.equal(old.record.status, 'shipped');
        assert.equal(old.latestReceipt, null);
        assert.equal(remainder.records.at(-1).status, 'shipping');
      }
      const previousId = previousIds.get(item.id);
      if (!previousId) return state;
      const stamped = act(state, 'stamp', { value: item.answer });
      const saved = JSON.parse(JSON.stringify(stamped));
      const regularReceipt = saved.records.at(-1);
      const history = archive(saved, item.batch).find(({ id }) => id === previousId);
      assert.equal(regularReceipt.id, item.id);
      assert.equal(regularReceipt.status, scenario.expected);
      assert.equal(history.latestReceipt, regularReceipt);
      assert.equal(history.record.status, state.records.find(({ id }) => id === previousId).status);
      assert.equal(restoreRun(saved), saved);
      checked.add(item.id);
      return state;
    } });
    assert.deepEqual(checked, new Set(previousIds.keys()));
  }
});

test('a first acceptance at handoff keeps the offsite lot shipped, and a later release can requeue', () => {
  const week = untilHandoff(21, { decisions: { 5: 'pass', 9: 'review' } });
  assert.deepEqual(getEnding(week).issues.map(({ id }) => id), [5]);
  const findings = [{ key: 'doc:1:1', source: '耳罩检验报告', text: '报告编号 · R-065' }];
  const accepted = act(week, 'recheck', { id: 9, value: 'pass', findings });
  const original = archive(accepted, 'G-205').find(({ id }) => id === 5);
  assert.equal(original.latestReceipt.status, 'shipped');
  assert.equal(original.latestReceipt.amendments.at(-1).status, 'shipped');
  assert.deepEqual(original.latestReceipt.amendments.at(-1).findings, findings);
  assert.deepEqual(getEnding(accepted).issues, []);

  const recalled = takeRecallReceipt(act(accepted, 'recheck', { id: 9, value: 'review' }), 9);
  const requeued = act(JSON.parse(JSON.stringify(recalled)), 'recheck', { id: 9, value: 'pass' });
  assert.equal(archive(requeued, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipping');
  assert.equal(restoreRun(requeued), requeued);
  const shipped = act(requeued, 'finish');
  assert.equal(archive(shipped, 'G-205').find(({ id }) => id === 5).latestReceipt.status, 'shipped');
});

test('restoring an active legacy save corrects only a supplement queued for a shipment already offsite', () => {
  let checked = false;
  untilHandoff(21, { decisions: { 11: 'pass' }, inspect: (state, item) => {
    if (item.id !== 13) return state;
    const receipt = act(state, 'stamp', { value: 'pass' });
    const legacy = {
      ...receipt,
      records: receipt.records.map((record) => record.id === 13 ? { ...record, status: 'shipping' } : record),
    };
    for (const active of [legacy, act(legacy, 'next')]) {
      const saved = JSON.parse(JSON.stringify(active));
      const loaded = restoreRun(saved);
      const original = archive(loaded, 'G-211').find(({ id }) => id === 11);
      assert.equal(original.record, saved.records.find(({ id }) => id === 11));
      assert.equal(original.latestReceipt.status, 'shipped');
      assert.equal(saved.records.find(({ id }) => id === 13).status, 'shipping');
      assert.equal(loaded.phase, active.phase);
      assert.equal(restoreRun(loaded), loaded);
    }
    const historical = { ...legacy, phase: 'summary' };
    assert.equal(restoreRun(historical), historical);
    checked = true;
    return state;
  } });
  assert.equal(checked, true);
});

test('an accepted same-lot receipt owns the disposition and preserves the first receipt', () => {
  let state = untilHandoff(21, { decisions: { 5: 'pass' } });
  const original = archive(state, 'G-205').find(({ id }) => id === 5);
  assert.equal(original.record.original, 'pass');
  assert.equal(original.record.status, 'shipped');
  assert.equal(original.latestReceipt.id, 9);
  assert.equal(original.latestReceipt.status, 'shipped');
  assert.equal(act(state, 'recheck', { id: 5, value: 'review' }), state);

  state = takeRecallReceipt(act(state, 'recheck', { id: 9, value: 'review' }), 9);
  const restored = JSON.parse(JSON.stringify(state));
  const historical = archive(restored, 'G-205').find(({ id }) => id === 5);
  assert.deepEqual(historical.record, original.record);
  assert.equal(historical.latestReceipt.status, 'recalled');
  assert.equal(historical.latestReceipt.decision, 'review');
  assert.deepEqual(historical.latestReceipt.amendments.map(({ from, to }) => [from, to]), [['pass', 'review']]);
  assert.equal(getEnding(act(restored, 'finish')).id, 'routine');
});

test('a follow-up that was never accepted leaves a prematurely shipped lot actionable', () => {
  let state = untilHandoff(21, { decisions: { 5: 'pass', 9: 'review' } });
  state = { ...state, records: state.records.map((record) => record.id === 5 ? { ...record, verifiedBy: 9 } : record) };
  assert.equal(archive(state, 'G-205').find(({ id }) => id === 5).latestReceipt, null);
  assert.deepEqual(getEnding(state).issues.map(({ id }) => id), [5]);
  const corrected = takeRecallReceipt(act(state, 'recheck', { id: 5, value: 'review' }), 5);
  assert.equal(corrected.records.find(({ id }) => id === 5).status, 'recalled');
  assert.equal(getEnding(act(corrected, 'finish')).id, 'routine');
});

test('a new sample from the factory remainder cannot replace the receipt for shipped G-204', () => {
  let state = untilHandoff(21, { decisions: { 4: 'pass' } });
  state = { ...state, records: state.records.map((record) => record.id === 4 ? { ...record, verifiedBy: 15 } : record) };
  assert.equal(archive(state, 'G-204').find(({ id }) => id === 4).latestReceipt, null);
  assert.deepEqual(getEnding(state).issues.map(({ id }) => id), [4]);
  const corrected = takeRecallReceipt(act(state, 'recheck', { id: 4, value: 'review' }), 4);
  assert.equal(corrected.records.find(({ id }) => id === 4).status, 'recalled');
  assert.equal(corrected.records.find(({ id }) => id === 15).status, 'returned');
});

test('a returning delivery finds the exact previous stamp and status after a save reload', () => {
  const expected = new Map([
    [9, { id: 5, decision: 'review', status: 'held', sameLot: true }],
    [13, { id: 11, decision: 'review', status: 'held', sameLot: true }],
    [14, { id: 10, decision: 'fail', status: 'returned', sameLot: true }],
    [15, { id: 4, decision: 'pass', status: 'shipped', sameLot: false }],
  ]);
  const checked = new Set();
  untilHandoff(21, { decisions: { 4: 'pass', 10: 'fail' }, inspect: (state, item) => {
    const restored = JSON.parse(JSON.stringify(state));
    const previous = getPreviousReceipt(restored);
    assert.deepEqual(archive(restored).find(({ id }) => id === item.id).previousReceipt, previous);
    const target = expected.get(item.id);
    if (!target) {
      assert.equal(previous, null);
    } else {
      const { id, decision, status } = previous.record;
      assert.equal(previous.record, restored.records.find((row) => row.id === target.id));
      assert.deepEqual({ id, decision, status, sameLot: previous.sameLot }, target);
      checked.add(item.id);
    }
    return state;
  } });
  assert.deepEqual(checked, new Set(expected.keys()));
});

test('the night receipt adds context without replacing the previous decision in Tang’s dialogue', () => {
  for (const previous of ['pass', 'fail', 'review']) {
    untilHandoff(21, { decisions: { 11: previous }, inspect: (state, item) => {
      if (item.id === 11) return act(state, 'dial', { number: '107', caseIds: [11] });
      if (item.id === 13) {
        assert.ok(state.flags.nightDocument);
        assert.equal(item.line, `${item.followUp.lines[previous]} ${item.nightResponse}`);
        const beforeReceipt = { ...state, flags: { ...state.flags, nightDocument: false } };
        assert.equal(getCase(beforeReceipt).line, item.followUp.lines[previous]);
      }
      return state;
    } });
  }
});

test('night receipt and self-call stay independent of the three endings', () => {
  let state = untilHandoff(6, { inspect: (state, item) => {
    if (item.id === 11) return act(state, 'dial', { number: '107', caseIds: [11] });
    if (state.records.at(-1)?.id === 11) {
      assert.equal(state.flags.nightDocument, false);
      assert.equal(state.event.npc, 'sun');
    }
    if (item.id === 13) assert.match(item.line, /孙姐/);
    return state;
  } });
  state = act(state, 'attach', { key: 'night' });
  state = act(state, 'dial', { number: '880' });
  assert.equal(state.phone.kind, 'ringback-test');
  assert.equal(state.flags.ringback, false);
  assert.equal(getIncomingCall(state), null);
  state = act(state, 'hang-up');
  assert.equal(getIncomingCall(state), 'ringback');
  assert.equal(getEnding(act(state, 'finish')).id, 'routine');
  state = act(state, 'answer-call');
  assert.equal(state.phone.incomingKey, 'ringback');
  assert.equal(state.flags.ringback, true);
  assert.equal(state.flags.nightAttached, true);
  assert.equal(getEnding(act(state, 'finish')).id, 'routine');
});

test('Tuesday close rings once and can be answered or left without changing the shift', () => {
  const receipt = tuesdayClosingReceipt();
  assert.equal(getIncomingCall(receipt), null);
  const summary = act(receipt, 'next');
  assert.equal(summary.phase, 'summary');
  assert.equal(getIncomingCall(summary), 'lab-close');
  assert.equal(summary.phone, null);
  assert.deepEqual(summary.phoneLog, []);
  assert.deepEqual(summary.pending, []);
  assert.deepEqual(summary.events, []);
  assert.equal(act(summary, 'next'), summary);

  const missed = act(JSON.parse(JSON.stringify(summary)), 'advance-day');
  assert.equal(missed.day, 2);
  assert.equal(missed.phase, 'brief');
  assert.equal(getIncomingCall(missed), null);
  assert.deepEqual(missed.phoneLog, []);

  const answered = act(JSON.parse(JSON.stringify(summary)), 'answer-call');
  assert.equal(getIncomingCall(answered), null);
  assert.equal(answered.phone, answered.phoneLog.at(-1));
  assert.equal(answered.phone.kind, 'incoming');
  assert.equal(answered.phone.incomingKey, 'lab-close');
  assert.equal(answered.phone.day, 1);
  assert.equal(answered.phone.number, '204');
  assert.equal(answered.phone.npc, 'chen');
  assert.match(answered.phone.line, /明早一起送/);
  assert.doesNotMatch(answered.phone.line, /R-071|G-241|G-248/);
  assert.deepEqual(answered.records, summary.records);
  assert.deepEqual(answered.flags, summary.flags);
  assert.deepEqual(answered.pending, []);
  assert.equal(act(answered, 'answer-call'), answered);
  assert.equal(act(answered, 'advance-day').day, 2);
});

test('the 880 recording waits for hang-up and pickup, and answered calls survive later outgoing calls', () => {
  let state = act(tuesdayClosingReceipt(), 'next');
  state = act(state, 'dial', { number: '880' });
  assert.equal(state.phone.kind, 'ringback-test');
  assert.equal(state.phone.npc, null);
  assert.equal(state.phone.lines.length, 1);
  assert.match(state.phone.line, /短音/);
  assert.doesNotMatch(state.phone.line, /听见响就合格/);
  assert.equal(state.flags.ringback, false);
  assert.equal(getIncomingCall(state), 'lab-close');
  assert.equal(state.ringbackArmed, true);
  state = act(JSON.parse(JSON.stringify(state)), 'hang-up');
  assert.deepEqual(state.incomingCalls, ['lab-close', 'ringback']);
  assert.equal(state.ringbackArmed, false);

  state = act(act(state, 'dial', { number: '880' }), 'hang-up');
  assert.deepEqual(state.incomingCalls, ['lab-close', 'ringback']);
  assert.equal(act(state, 'hang-up'), state);
  state = act(state, 'answer-call');
  assert.equal(state.phone.incomingKey, 'lab-close');
  assert.equal(getIncomingCall(state), 'ringback');
  assert.equal(state.flags.ringback, false);
  state = act(JSON.parse(JSON.stringify(state)), 'answer-call');
  assert.equal(state.phone.incomingKey, 'ringback');
  assert.equal(state.phone.npc, 'zhou');
  assert.match(state.phone.line, /听见响就合格/);
  assert.equal(state.flags.ringback, true);
  assert.equal(getIncomingCall(state), null);
  assert.deepEqual(state.pending, []);

  const earlierRecording = state.phone;
  state = act(act(act(state, 'dial', { number: '880' }), 'hang-up'), 'answer-call');
  assert.notEqual(state.phone, earlierRecording);
  assert.equal(state.phoneLog.includes(earlierRecording), false);
  for (let index = 0; index < 25; index++) state = act(state, 'dial', { number: '204' });
  assert.equal(state.phoneLog.length, 20);
  assert.equal(state.phoneLog.at(-1), state.phone);
  assert.deepEqual(state.phoneLog.filter(({ kind }) => kind === 'incoming').map(({ incomingKey }) => incomingKey),
    ['lab-close', 'ringback']);
});

test('a save from before ringing calls has no active line and can still request a new ringback', () => {
  const legacy = untilHandoff(21);
  delete legacy.incomingCalls;
  delete legacy.ringbackArmed;
  assert.equal(getIncomingCall(legacy), null);
  assert.equal(act(legacy, 'hang-up'), legacy);
  assert.equal(act(legacy, 'answer-call'), legacy);
  const callback = act(act(legacy, 'dial', { number: '880' }), 'hang-up');
  assert.equal(getIncomingCall(callback), 'ringback');
  const finished = act(callback, 'finish');
  assert.equal(finished.phase, 'ending');
  assert.equal(getIncomingCall(finished), null);
  assert.deepEqual(finished.incomingCalls, []);
});

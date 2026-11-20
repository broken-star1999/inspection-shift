import assert from 'node:assert/strict';
import test from 'node:test';
import { archive, createRun, dispatch, getCase, getEnding, getPreviousReceipt, TUTORIAL } from '../src/engine.js';

function act(state, type, details) {
  return dispatch(state, { type, ...details });
}

function untilHandoff(seed, { decisions = {}, inspect = (state) => state } = {}) {
  let state = createRun(seed);
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
    ['17,18,19,20'],
  ];
  for (const [day, allowed] of allowedOrders.entries()) {
    const orders = weeks.map((week) => week.records.filter((record) => record.day === day).map(({ id }) => id).join(','));
    assert.deepEqual(new Set(orders), new Set(allowed));
  }
});

test('a saved week without the schedule marker retains its original arrival order', () => {
  let state = createRun(9);
  delete state.schedule;
  state = act(state, 'start-day');
  for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
  while (state.records.length < 17) {
    if (state.phase === 'case') state = act(state, 'stamp', { value: getCase(state).answer });
    else if (state.phase === 'receipt') state = act(state, 'next');
    else if (state.phase === 'brief') state = act(state, 'start-day');
    else state = act(state, 'advance-day');
  }
  assert.deepEqual(state.records.map(({ id }) => id), Array.from({ length: 17 }, (_, index) => index + 1));
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

test('recalling an accepted supplement reports the current receipt until the lot is released again', () => {
  const week = untilHandoff(21);
  const recalled = act(week, 'recheck', { id: 9, value: 'review' });
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
  const recalled = act(week, 'recheck', { id: 9, value: 'review' });
  const revised = act(JSON.parse(JSON.stringify(recalled)), 'recheck', { id: 9, value: 'fail' });
  const original = archive(revised, 'G-205').find(({ id }) => id === 5);
  const supplement = original.latestReceipt;
  assert.equal(original.record.status, 'held');
  assert.equal(supplement.id, 9);
  assert.equal(supplement.day, 2);
  assert.equal(supplement.decision, 'fail');
  assert.equal(supplement.status, 'recalled');
  assert.deepEqual(supplement.amendments, [
    { from: 'pass', to: 'review', previousStatus: 'shipped', status: 'recalled', day: 4 },
    { from: 'review', to: 'fail', previousStatus: 'recalled', status: 'recalled', day: 4 },
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
  const revised = state.records.find(({ id }) => id === 4);
  assert.equal(revised.original, 'pass');
  assert.equal(revised.status, 'recalled');
  assert.equal(revised.amendments[0].previousStatus, 'shipped');
  const corrected = getEnding(act(state, 'finish'));
  assert.equal(corrected.id, 'routine');
  assert.deepEqual(corrected.delayedReceipts, []);
});

test('an accepted same-lot receipt owns the disposition and preserves the first receipt', () => {
  let state = untilHandoff(21, { decisions: { 5: 'pass' } });
  const original = archive(state, 'G-205').find(({ id }) => id === 5);
  assert.equal(original.record.original, 'pass');
  assert.equal(original.record.status, 'shipped');
  assert.equal(original.latestReceipt.id, 9);
  assert.equal(original.latestReceipt.status, 'shipped');
  assert.equal(act(state, 'recheck', { id: 5, value: 'review' }), state);

  state = act(state, 'recheck', { id: 9, value: 'review' });
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
  const corrected = act(state, 'recheck', { id: 5, value: 'review' });
  assert.equal(corrected.records.find(({ id }) => id === 5).status, 'recalled');
  assert.equal(getEnding(act(corrected, 'finish')).id, 'routine');
});

test('a new sample from the factory remainder cannot replace the receipt for shipped G-204', () => {
  let state = untilHandoff(21, { decisions: { 4: 'pass' } });
  state = { ...state, records: state.records.map((record) => record.id === 4 ? { ...record, verifiedBy: 15 } : record) };
  assert.equal(archive(state, 'G-204').find(({ id }) => id === 4).latestReceipt, null);
  assert.deepEqual(getEnding(state).issues.map(({ id }) => id), [4]);
  const corrected = act(state, 'recheck', { id: 4, value: 'review' });
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
  assert.equal(state.phone.kind, 'ringback');
  assert.equal(state.flags.nightAttached, true);
  assert.equal(getEnding(act(state, 'finish')).id, 'routine');
});

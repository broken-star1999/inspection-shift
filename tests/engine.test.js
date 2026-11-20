import assert from 'node:assert/strict';
import test from 'node:test';
import { archive, createRun, dispatch, getCase, getEnding, TUTORIAL } from '../src/engine.js';

function act(state, type, details) {
  return dispatch(state, { type, ...details });
}

function untilHandoff(seed, { decisions = {}, inspect = (state) => state } = {}) {
  let state = createRun(seed);
  while (state.phase !== 'handoff') {
    if (state.phase === 'brief') state = act(state, 'start-day');
    else if (state.phase === 'summary') state = act(state, 'advance-day');
    else if (state.phase === 'case') {
      const item = getCase(state);
      if (item.id === 1) {
        for (const { key } of TUTORIAL.slice(0, -1)) state = act(state, 'tutorial', { key });
      }
      state = inspect(state, item);
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
  assert.equal(act(state, 'stamp', { value: 'pass' }), state);
  assert.equal(getCase(act(state, 'next')).id, 2);
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
      assert.equal(state.flags.traceDocument, true);
    }
    return state;
  } });
  assert.equal(getEnding(state).id, 'routine');
  state = act(state, 'attach', { key: 'trace' });
  assert.equal(getEnding(state).id, 'trace');
  state = act(state, 'finish');
  assert.equal(state.phase, 'ending');
  assert.equal(state.records.find(({ id }) => id === 7).status, 'recalled');
  assert.match(getEnding(state).traceDisposition, /确认召回/);
});

test('report filed during handoff can still lead to an on-site hold', () => {
  let state = untilHandoff(4, { decisions: { 7: 'review' } });
  state = act(state, 'dial', { number: '204', caseIds: [7, 14] });
  assert.equal(state.event.npc, 'chen');
  state = act(state, 'attach', { key: 'trace' });
  state = act(state, 'finish');
  assert.equal(getEnding(state).id, 'trace');
  assert.match(getEnding(state).traceDisposition, /已封存/);
  assert.deepEqual(getEnding(state).delayed, { count: 0, batches: [] });
});

test('sending every batch to review reports the release-ready batches that remain held', () => {
  const decisions = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, 'review']));
  const ending = getEnding(act(untilHandoff(21, { decisions }), 'finish'));
  assert.equal(ending.id, 'routine');
  assert.deepEqual(ending.delayed, { count: 12, batches: ['G-201', 'G-202', 'G-203'] });
});

test('a corrected decision removes the released batch from the handoff delay', () => {
  let state = untilHandoff(9, { decisions: { 1: 'review', 2: 'fail' } });
  assert.deepEqual(getEnding(state).delayed, { count: 2, batches: ['G-201', 'G-202'] });
  state = act(state, 'recheck', { id: 1, value: 'pass' });
  assert.deepEqual(getEnding(act(state, 'finish')).delayed, { count: 1, batches: ['G-202'] });
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
  assert.equal(getEnding(act(state, 'finish')).id, 'routine');
});

test('night receipt and self-call stay independent of the three endings', () => {
  let state = untilHandoff(6, { inspect: (state, item) => {
    if (item.id === 11) return act(state, 'dial', { number: '107', caseIds: [11] });
    if (state.records.at(-1)?.id === 11) {
      assert.equal(state.flags.nightDocument, true);
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

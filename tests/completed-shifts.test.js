import assert from 'node:assert/strict';
import test from 'node:test';
import { collectedEndingIds, completedShiftHistory, createWeekId } from '../src/completed-shifts.js';
import { createFollowingRun, dispatch, getCase, getEnding } from '../src/engine.js';

function finishedWeek(seed, decisions = {}, firstNote = '') {
  let run = createFollowingRun(null, seed);
  const types = { brief: 'start-day', case: 'stamp', receipt: 'next', summary: 'advance-day', handoff: 'finish' };
  while (run.phase !== 'ending') {
    const item = getCase(run);
    const action = run.events?.length ? { type: 'ack-visit' } : {
      type: types[run.phase], value: decisions[item?.id] ?? item?.answer, note: item?.id === 1 ? firstNote : '',
    };
    const next = dispatch(run, action);
    assert.notEqual(next, run);
    run = next;
  }
  return run;
}

function serialized(history) {
  return JSON.parse(JSON.stringify(Array.from(history, ([id, run]) => ({ id, run }))));
}

test('different new weeks keep separate IDs and receipts, even with the same seed and ending', () => {
  const originalRandom = Math.random;
  let firstId;
  let secondId;
  try {
    Math.random = () => .5;
    firstId = createWeekId();
    secondId = createWeekId();
  } finally {
    Math.random = originalRandom;
  }
  assert.notEqual(firstId, secondId);
  const identical = finishedWeek(0);
  const first = { ...identical, weekId: firstId, completedAt: 100 };
  const second = { ...identical, weekId: secondId, completedAt: 200 };
  const initial = completedShiftHistory(null, { finished: first });
  const both = completedShiftHistory(serialized(initial), { memory: initial, finished: second });
  assert.deepEqual([...both.keys()], [secondId, firstId]);
  assert.deepEqual(both.get(firstId), first);
  assert.deepEqual(both.get(secondId), second);
  assert.deepEqual(collectedEndingIds([], both), ['routine']);

  const reloaded = completedShiftHistory(serialized(both), { finished: { ...first, inspectionProgress: { caseId: 20 } } });
  assert.deepEqual(reloaded, both);
});

test('legacy ending keys migrate in place and a matching active ending does not become a second week', () => {
  const first = finishedWeek(2, {}, '门口收到原件');
  const second = finishedWeek(2, {}, '原件夹在箱签后面');
  const problem = finishedWeek(2, { 4: 'pass' });
  const reorder = (value) => Object.fromEntries(Object.entries(value).reverse());
  const activeCopy = { ...reorder(first), flags: reorder(first.flags), arrivalAction: 'next',
    handoffPair: { id: 4 }, correctionDraft: { id: 6 }, inspectionProgress: { caseId: 20 },
    reportWorkspace: { panel: 'archive' }, completedAt: Number.NaN };
  const stored = [
    { id: 'routine', run: first }, { id: 'routine', run: second }, { id: 'issue', run: problem },
    { id: 'routine', run: createFollowingRun(null, 2) }, { id: 'routine', run: { ...first, records: [null] } }, null,
  ];
  const migrated = completedShiftHistory(stored, { finished: activeCopy });
  assert.equal(migrated.size, 3);
  assert.ok([...migrated].every(([id, run]) => id.startsWith('legacy-') && run.weekId === id && !Object.hasOwn(run, 'completedAt')));
  assert.deepEqual([...migrated.values()].map((run) => run.records[0].note), ['门口收到原件', '原件夹在箱签后面', '']);
  assert.deepEqual([...migrated.values()].map((run) => getEnding(run).id), ['routine', 'routine', 'issue']);
  assert.deepEqual(collectedEndingIds(['trace', 'trace', 'unknown'], migrated), ['trace', 'routine', 'issue']);
  assert.deepEqual(completedShiftHistory(serialized(migrated), { finished: activeCopy }), migrated);
});

test('merges a newer disk entry with older in-memory weeks and keeps the reported dates', () => {
  const legacy = finishedWeek(3);
  const memoryOnly = { ...finishedWeek(4), weekId: 'memory-week', completedAt: 500 };
  const diskOnly = { ...finishedWeek(5), weekId: 'disk-week', completedAt: 900 };
  const alreadyStored = { ...finishedWeek(6), weekId: 'both-week', completedAt: 100 };
  const current = { ...finishedWeek(7), weekId: 'finished-week', completedAt: 700 };
  const memory = completedShiftHistory([{ id: 'routine', run: legacy }], { finished: memoryOnly });
  memory.set('both-week', { ...alreadyStored, completedAt: 10 });
  const disk = [{ id: 'routine', run: legacy }, { id: 'both-week', run: alreadyStored }, { id: 'disk-week', run: diskOnly }];
  const history = completedShiftHistory(disk, { memory, finished: current });
  assert.deepEqual([...history.keys()].slice(0, 4), ['disk-week', 'finished-week', 'memory-week', 'both-week']);
  assert.deepEqual([...history.values()].map(({ completedAt }) => completedAt), [900, 700, 500, 100, undefined]);
  assert.deepEqual(history.get('both-week'), alreadyStored);
  assert.deepEqual(completedShiftHistory(serialized(history), { memory, finished: current }), history);
});

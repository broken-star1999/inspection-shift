import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPACT_FIXED_CASE_IDS, getCompactCaseIds } from '../src/shift-schedule.js';

test('the compact week keeps each fixed sequence and inserts only that day’s extras before the last case', () => {
  const fixed = [[1, 2, 4], [11, 8, 7], [6, 12, 10], [13, 14, 16], [17, 18, 20]];
  assert.deepEqual(COMPACT_FIXED_CASE_IDS, fixed);
  for (const [dayIndex, [first, second, last]] of fixed.entries()) {
    for (let seed = 0; seed < 100; seed += 1) {
      const ids = getCompactCaseIds(seed, dayIndex);
      assert.deepEqual(ids.slice(0, 2), [first, second]);
      assert.equal(ids.at(-1), last);
      const extras = ids.slice(2, -1);
      assert.ok(extras.length <= 2);
      assert.equal(new Set(extras).size, extras.length);
      assert.ok(extras.every((id) => id === 21 + dayIndex * 2 || id === 22 + dayIndex * 2));
    }
  }
});

test('the same numeric seed restores the same schedule and invalid day indexes have no cases', () => {
  const seeds = [0, 21, 0xffff_ffff];
  for (const seed of seeds) {
    const week = COMPACT_FIXED_CASE_IDS.map((_, dayIndex) => getCompactCaseIds(seed, dayIndex));
    const restoredSeed = JSON.parse(JSON.stringify({ seed })).seed;
    assert.deepEqual(COMPACT_FIXED_CASE_IDS.map((_, dayIndex) => getCompactCaseIds(restoredSeed, dayIndex)), week);
  }
  for (const dayIndex of [-1, 5, 1.5, '0', undefined]) {
    assert.deepEqual(getCompactCaseIds(21, dayIndex), []);
  }
});

test('each day distributes seeded schedules around 75% no extras, 20% one and 5% two', () => {
  const iterations = 10_000;
  for (const [dayIndex] of COMPACT_FIXED_CASE_IDS.entries()) {
    const counts = [0, 0, 0];
    const singleCases = new Set();
    for (let seed = 0; seed < iterations; seed += 1) {
      const ids = getCompactCaseIds(seed, dayIndex);
      counts[ids.length - 3] += 1;
      if (ids.length === 4) singleCases.add(ids[2]);
    }
    for (const [count, expected] of [0.75, 0.2, 0.05].entries()) {
      assert.ok(Math.abs(counts[count] / iterations - expected) < 0.015, `day ${dayIndex}, ${count} extras`);
    }
    assert.equal(singleCases.size, 2);
  }
});

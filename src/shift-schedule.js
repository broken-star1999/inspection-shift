export const COMPACT_FIXED_CASE_IDS = Object.freeze([
  Object.freeze([1, 2, 4]),
  Object.freeze([11, 8, 7]),
  Object.freeze([6, 12, 10]),
  Object.freeze([13, 14, 16]),
  Object.freeze([17, 18, 20]),
]);

const extraCaseIds = [[21, 22], [23, 24], [25, 26], [27, 28], [29, 30]];

function extraCaseRoll(seed, dayIndex) {
  const salt = 200 + dayIndex;
  let hash = ((seed >>> 0) + Math.imul(salt, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % 100;
}

export function getCompactCaseIds(seed, dayIndex, batchesPerDay) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= COMPACT_FIXED_CASE_IDS.length) return [];

  const [first, second, last] = COMPACT_FIXED_CASE_IDS[dayIndex];
  const extras = extraCaseIds[dayIndex];
  const roll = extraCaseRoll(seed, dayIndex);
  if (batchesPerDay === 4) return [first, second, extras[roll % extras.length], last];
  if (roll < 75) return [first, second, last];
  if (roll < 95) return [first, second, extras[roll % 2], last];
  return [first, second, ...extras, last];
}

import { getEnding } from './engine.js';

const endingIds = ['routine', 'trace', 'issue'];
let localWeekSequence = 0;

export function createWeekId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  localWeekSequence += 1;
  const clockOrigin = globalThis.performance?.timeOrigin ?? Date.now();
  return `local-${clockOrigin}-${localWeekSequence}-${Math.random().toString(36).slice(2)}`;
}

function isWeekId(id) {
  return typeof id === 'string' && id.length > 0 && !endingIds.includes(id);
}

function isCompletedRun(run) {
  return run?.version === 1 && run.phase === 'ending' && Number.isInteger(run.day) && run.day >= 0 && run.day < 5 &&
    Number.isInteger(run.index) && run.index >= 0 && run.index < 4 && run.flags &&
    Array.isArray(run.records) && run.records.every((record) => record && typeof record === 'object') &&
    Array.isArray(run.seen) && Array.isArray(run.pending) && Array.isArray(run.phoneLog);
}

function snapshotRun(run) {
  const { inspectionProgress, arrivalAction, correctionDraft, handoffWorkspace, handoffPair, reportWorkspace, completedAt, ...snapshot } = run;
  return Number.isFinite(completedAt) ? { ...snapshot, completedAt } : snapshot;
}

function legacyWeekId(snapshot) {
  // Old saves share their ending key. Identify matching saved runs by their JSON data.
  const serialized = JSON.stringify(snapshot, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
    : value);
  let hash = 0xcbf29ce484222325n;
  for (const character of serialized) hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0))) * 0x100000001b3n);
  return `legacy-${hash.toString(36)}`;
}

function historyEntry(run, storedId) {
  if (!isCompletedRun(run)) return null;
  const { weekId, ...snapshot } = snapshotRun(run);
  const id = isWeekId(weekId) ? weekId : isWeekId(storedId) ? storedId : legacyWeekId(snapshot);
  return [id, { ...snapshot, weekId: id }];
}

export function completedShiftHistory(stored, { memory, finished } = {}) {
  const history = new Map();
  function add(run, id) {
    const entry = historyEntry(run, id);
    if (entry && !history.has(entry[0])) history.set(...entry);
  }
  if (Array.isArray(stored)) {
    for (const entry of stored) add(entry?.run, entry?.id);
  }
  if (memory instanceof Map) {
    for (const [id, run] of memory) add(run, id);
  }
  const entries = [...history];
  const newest = historyEntry(finished);
  if (newest && !history.has(newest[0])) entries.unshift(newest);
  entries.sort(([, first], [, second]) => {
    const firstDated = Number.isFinite(first.completedAt);
    const secondDated = Number.isFinite(second.completedAt);
    return firstDated && secondDated ? second.completedAt - first.completedAt : Number(secondDated) - Number(firstDated);
  });
  return new Map(entries);
}

export function collectedEndingIds(collection, history) {
  const existing = Array.isArray(collection) ? collection.filter((id) => endingIds.includes(id)) : [];
  return [...new Set([...existing, ...Array.from(history.values(), (run) => getEnding(run).id)])];
}

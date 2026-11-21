import { DAYS, G202_RECHECK, HANDOFF, INCOMING_CALLS, PHONE, PRESSURE, RECEIPT_HANDLING, SHIPMENT_ACCEPTANCE, TUTORIAL as tutorialContent, documentExtension } from './content.js';
import { normalizeFindings } from './inspection-findings.js';

const DECISIONS = ['pass', 'fail', 'review'];
const CASES = DAYS.flatMap((day) => day.cases);
const CASE_BY_ID = new Map(CASES.map((item) => [item.id, item]));
const ARRIVAL_ORDERS = {
  1: [[5, 6, 7, 8], [5, 8, 7, 6]],
  2: [[9, 10, 11, 12], [12, 10, 11, 9]],
  3: [[13, 15, 14, 16], [13, 16, 14, 15]],
  4: [[17, 18, 19, 20], [17, 19, 18, 20]],
};
const REPLAY_VARIANT_CASES = [3, 8, 12, 16, 18].map((id) => CASE_BY_ID.get(id));
const REWORK_KEY = 'rework:2';
const TUTORIAL_KEYS = ['label', 'report', 'signature', 'sample', 'stamp'];
export const TUTORIAL = tutorialContent.map((step, index) => ({ ...step, key: TUTORIAL_KEYS[index] }));

export const EVIDENCE = {
  trace: PHONE['204'].evidence,
  night: PHONE['107'].evidence,
};

export const TRACE_CASE_ID = 7;
export const TRACE_FINDING = {
  key: 'trace:source',
  source: EVIDENCE.trace.title,
  text: EVIDENCE.trace.fields.filter(([label]) => label === '样品来源' || label === '检验范围')
    .map(([label, value]) => `${label} · ${value}`).join('；'),
};

function makeSeed(seed) {
  if (seed === undefined) return Math.floor(Math.random() * 0x100000000);
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  let hash = 2166136261;
  for (const character of String(seed)) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return hash >>> 0;
}

function seededChoice(seed, salt, size) {
  let hash = (seed + Math.imul(salt, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % size;
}

export function createRun(seed) {
  const runSeed = makeSeed(seed);
  return {
    version: 1,
    schedule: 2,
    sampleSet: 3,
    phase: 'brief',
    day: 0,
    index: 0,
    tutorial: 0,
    seed: runSeed,
    records: [],
    seen: [],
    pending: [],
    phone: null,
    phoneLog: [],
    incomingCalls: [],
    ringbackArmed: false,
    shownFinding: null,
    event: null,
    events: [],
    flags: {
      offerCase: PRESSURE[0].slots[seededChoice(runSeed, 50, PRESSURE[0].slots.length)],
      warningCase: PRESSURE[1].slots[seededChoice(runSeed, 60, PRESSURE[1].slots.length)],
      rollingPencil: Boolean(seededChoice(runSeed, 80, 2)),
      traceDocument: false,
      traceAttached: false,
      nightDocument: false,
      nightAttached: false,
      source241: false,
      source248: false,
      source211: false,
      cat: false,
      umbrella: false,
      pencil: false,
      phoneBack: false,
      ringback: false,
    },
  };
}

export function createFollowingRun(previousRun, seed) {
  const run = { ...createRun(seed), sampleSet: 4, tutorial: TUTORIAL.length };
  if (!previousRun || REPLAY_VARIANT_CASES.some((item) => variantIndex(previousRun, item) !== variantIndex(run, item))) {
    return run;
  }
  const item = REPLAY_VARIANT_CASES[seededChoice(run.seed, 130, REPLAY_VARIANT_CASES.length)];
  const index = (variantIndex(run, item) + 1) % item.variants.length;
  return { ...run, variantOverride: { caseId: item.id, index } };
}

export function restoreRun(state) {
  let records = state.records.map((record) => withPriorShipment(state.records, record));
  if (records.every((record, index) => record === state.records[index])) records = state.records;
  if (state.phase === 'case' || state.phase === 'receipt') {
    for (const previous of state.records) {
      if (previous.status !== 'shipped' || !(previous.day < state.day)) continue;
      const supplement = findVerifiedReceipt(state.records, previous);
      if (!supplement || supplement.day !== state.day || supplement.status !== 'shipping' ||
          supplement.original !== 'pass' || supplement.decision !== 'pass' || supplement.amendments?.length) continue;
      // Older saves could queue a permit for goods already at the receiving side.
      records = updateRecord(records, supplement.id, { status: 'shipped' });
    }
  }
  return records === state.records ? state : { ...state, records };
}

export function getDay(state) {
  const day = DAYS[state.day];
  const options = ARRIVAL_ORDERS[state.day];
  const permitsShuffle = state.schedule === 2 || (state.schedule === 1 && state.day < 4);
  if (!options || !permitsShuffle) return day ?? null;
  const order = options[seededChoice(state.seed, 120 + state.day, options.length)];
  return { ...day, cases: order.map((id) => CASE_BY_ID.get(id)) };
}

function variantIndex(state, item) {
  if (item.id === 3 && state.sampleSet !== 4) return 0;
  if (item.id === 16 && ![2, 3, 4].includes(state.sampleSet)) return 0;
  if (item.id === 18 && ![3, 4].includes(state.sampleSet)) return 0;
  const override = state.variantOverride;
  if (override?.caseId === item.id && Number.isInteger(override.index) && override.index >= 0 && override.index < item.variants.length) {
    return override.index;
  }
  return seededChoice(state.seed, item.id, item.variants.length);
}

function getVariant(state, item) {
  if (!item.variants?.length) return item;
  const index = variantIndex(state, item);
  const variant = item.variants[index];
  return { ...item, ...variant, sample: { ...item.sample, ...variant.sample }, variant: index };
}

function getRecord(state, id) {
  return state.records.find((record) => record.id === id);
}

export function getReworkFollowup(state) {
  if (!state) return null;
  const receipt = getRecord(state, 2);
  const decision = receipt?.original ?? receipt?.amendments?.[0]?.from ?? receipt?.decision;
  if (decision !== 'fail' && decision !== 'review') return null;
  return { ...G202_RECHECK[decision], key: REWORK_KEY, caseId: receipt.id };
}

function getDialogue(state, item) {
  const previous = getPreviousReceipt(state, item)?.record.decision;
  const line = item.followUp?.lines[previous] ?? item.line;
  const requestCaseId = item.followUp?.caseId;
  const request = PHONE['204'].requests?.[requestCaseId];
  if (request?.followupId === item.id && labRequest(state, requestCaseId)) return `${line} ${request.delivery}`;
  if (item.nightResponse && state.flags.nightDocument) return `${line} ${item.nightResponse}`;
  if (item.id === 12 && state.flags.pencil) return `${line} 你看，我给笔尾绑了截木头，这下它滚不了了。`;
  return line;
}

function pressureFindingKind(key) {
  const comparison = /^compare:\d+:(intake|projects|relabel):/.exec(key)?.[1];
  return comparison ?? (key.startsWith('sample:') ? 'sample' : 'paper');
}

export function getCase(state) {
  if (!['case', 'receipt'].includes(state.phase)) return null;
  const base = getDay(state)?.cases[state.index];
  if (!base) return null;
  const item = getVariant(state, base);
  const pressure = item.id === state.flags.offerCase ? 'favor' : item.id === state.flags.warningCase ? 'warning' : null;
  const script = pressure ? PRESSURE[pressure === 'favor' ? 0 : 1] : null;
  const saved = state.shownFinding;
  const shownFinding = script && saved?.caseId === item.id && typeof saved.key === 'string' && typeof saved.text === 'string' ? saved : null;
  const pressureReply = shownFinding ? script.shown?.[pressureFindingKind(shownFinding.key)] ?? null : null;
  return { ...item, line: getDialogue(state, item), pressure, pressureLine: script?.line ?? null, shownFinding, pressureReply };
}

export function getPreviousReceipt(state, item = getCase(state)) {
  const followUp = item?.followUp;
  if (!followUp) return null;
  const record = getRecord(state, followUp.caseId);
  return record ? { record, sameLot: followUp.sameLot === true } : null;
}

export function archive(state, query = '') {
  const key = String(query).toLowerCase().trim().replace(/^r(\d{3})$/, 'r-$1');
  const waitingForArrival = state.phase === 'case' && activeVisits(state).length
    ? getDay(state)?.cases[state.index]?.id : null;
  return state.seen.map((id) => {
    const item = getVariant(state, CASE_BY_ID.get(id));
    const record = withPriorShipment(state.records, getRecord(state, id) ?? null);
    const latestReceipt = record ? withPriorShipment(state.records, findVerifiedReceipt(state.records, record)) : null;
    return { ...item, record, latestReceipt, previousReceipt: getPreviousReceipt(state, item) };
  }).filter((item) => {
    if (item.id === waitingForArrival && !item.record) return false;
    if (!key) return true;
    const fields = item.documents.flatMap(({ title, fields, note }) => [title, fields.flat().join(' '), note]);
    return [item.batch, item.title, ...fields].some((text) => text && String(text).toLowerCase().includes(key));
  });
}

export function archivedReportSources(state, query) {
  const suffix = /^(?:r-?)?(\d{3})$/i.exec(String(query ?? '').trim())?.[1];
  if (!state || !suffix) return [];
  const reportNumber = `R-${suffix}`;
  return archive(state).flatMap(({ id, batch, documents }) => {
    const day = DAYS.findIndex(({ cases }) => cases.some((item) => item.id === id));
    return documents.flatMap((document, index) => document.fields.some(([label, value]) =>
      (label === '报告编号' || label === '原报告编号') && value === reportNumber)
      ? [{ id, batch, day, document, index, number: reportNumber }] : []);
  });
}

function setFlags(state, next) {
  return { ...state, flags: { ...state.flags, ...next } };
}

const VISITS = {
  trace: {
    npc: PHONE['204'].npc,
    title: '实验室原件',
    line: PHONE['204'].delivery,
    key: 'trace',
  },
  night: {
    npc: PHONE['107'].npc,
    title: '夜班留底',
    line: PHONE['107'].delivery,
    key: 'night',
  },
};

function activeVisits(state) {
  return state.events ?? (state.event ? [state.event] : []);
}

function isVisitQueued(state, key) {
  return state.pending.includes(key) || activeVisits(state).some((visit) => visit.key === key);
}

function visitForKey(state, key) {
  if (key !== REWORK_KEY) return VISITS[key];
  if (state.phase !== 'brief' || state.day !== 1) return null;
  const followup = getReworkFollowup(state);
  if (!followup) return null;
  const { caseId, npc, title, line } = followup;
  return { kind: 'rework', key, caseId, npc, title, line };
}

function deliverVisits(state) {
  if (!state.pending.length) return state;
  const events = [...activeVisits(state)];
  for (const key of state.pending) {
    const visit = visitForKey(state, key);
    if (visit && !state.flags[`${key}Document`] && !events.some((event) => event.key === key)) {
      events.push(visit);
    }
  }
  return { ...state, event: events[0] ?? null, events, pending: [] };
}

function queueVisit(state, key) {
  if (state.flags[`${key}Document`] || isVisitQueued(state, key)) return state;
  const queued = { ...state, pending: [...state.pending, key] };
  return state.phase === 'handoff' ? deliverVisits(queued) : queued;
}

function acknowledgeVisit(state) {
  const [visit, ...events] = activeVisits(state);
  if (!visit) return state;
  const afterVisit = { ...state, event: events[0] ?? null, events };
  if (visit.kind === 'recall') return acknowledgeRecall(afterVisit, visit);
  const acceptance = visit.kind === 'acceptance' ? getShipmentAcceptance(state, visit) : null;
  const accepted = visit.kind === 'acceptance'
    ? (acceptance ? { ...afterVisit, acceptanceReceipt: { caseId: acceptance.caseId, day: acceptance.day } } : afterVisit)
    : setFlags(afterVisit, { [`${visit.key}Document`]: true });
  return !events.length && accepted.phase === 'case' ? startCase(accepted, accepted.index) : accepted;
}

function startCase(state, index) {
  const id = getDay(state)?.cases[index]?.id;
  if (!id) return state;
  const arrived = { ...state, phase: 'case', index };
  if (activeVisits(arrived).length || arrived.seen.includes(id)) return arrived;
  if (id === 20 && !arrived.acceptanceReceipt) {
    const record = chooseShipmentAcceptance(arrived);
    if (record) {
      const { key, caseId, title, line } = shipmentAcceptance(arrived.day, record);
      const visit = { kind: 'acceptance', key, caseId, npc: 'zhou', title, line };
      return { ...arrived, event: visit, events: [visit] };
    }
  }
  return { ...arrived, seen: [...arrived.seen, id] };
}

function startDay(state) {
  const opening = state.day === 1 && getReworkFollowup(state) ? queueVisit(state, REWORK_KEY) : state;
  return startCase(deliverVisits(opening), 0);
}

function ship(records) {
  return records.map((record) => record.status === 'shipping' && !findVerifiedReceipt(records, record)
    ? { ...record, status: 'shipped' } : record);
}

function updateRecord(records, id, changes) {
  return records.map((record) => record.id === id ? { ...record, ...changes } : record);
}

function sameLotFollowup(previous, next) {
  const followUp = next && CASE_BY_ID.get(next.id)?.followUp;
  return followUp?.sameLot === true && followUp.caseId === previous?.id && previous?.batch === next.batch;
}

function previousSameLot(records, record) {
  const id = CASE_BY_ID.get(record.id)?.followUp?.caseId;
  const previous = records.find((receipt) => receipt.id === id);
  return sameLotFollowup(previous, record) ? previous : null;
}

function withPriorShipment(records, record) {
  if (!record || Number.isInteger(record.priorShipmentId)) return record;
  const previous = previousSameLot(records, record);
  // The original pass went out at the previous close, before any Friday corrections.
  return previous?.original === 'pass' && previous.day < record.day ? { ...record, priorShipmentId: previous.id } : record;
}

function hasAcceptedProof(record) {
  return record.answer === 'pass' && (record.decision === 'pass' || record.original === 'pass' ||
    record.amendments?.some(({ to }) => to === 'pass') === true);
}

export function isSupplementOnly(record) {
  return Number.isInteger(record?.priorShipmentId) && (record.status === 'held' || record.status === 'returned') && !hasAcceptedProof(record);
}

export function receiptDisposition(record) {
  if (isSupplementOnly(record)) return record.status === 'held' ? 'supplementHeld' : 'supplementReturned';
  return record.status;
}

function findVerifiedReceipt(records, previous) {
  if (!previous.verifiedBy) return null;
  const next = records.find(({ id }) => id === previous.verifiedBy);
  // A later recall changes where the lot is, while the accepted test evidence is still on file.
  return sameLotFollowup(previous, next) && hasAcceptedProof(next) ? next : null;
}

function isAcceptedShipment(records, record, day) {
  return record && record.id !== 7 && record.id !== 20 && record.day < day &&
    record.status === 'shipped' && record.decision === 'pass' && record.answer === 'pass' &&
    !findVerifiedReceipt(records, record);
}

function chooseShipmentAcceptance(state) {
  const eligible = (record) => isAcceptedShipment(state.records, record, state.day);
  const g248 = getRecord(state, 14);
  if (eligible(g248)) return g248;
  return state.records.slice().reverse().find(eligible) ?? null;
}

function shipmentAcceptance(day, record) {
  return {
    key: `acceptance:${record.id}`, caseId: record.id, record, day,
    title: `${record.batch} ${SHIPMENT_ACCEPTANCE.title}`, line: SHIPMENT_ACCEPTANCE.delivery(record.batch),
  };
}

export function getShipmentAcceptance(state, visit) {
  if (!state) return null;
  const closingDay = DAYS.length - 1;
  if (visit) {
    if (visit.kind !== 'acceptance' || state.phase !== 'case' || state.day !== closingDay ||
        getDay(state)?.cases[state.index]?.id !== 20 || state.seen.includes(20) || state.acceptanceReceipt) return null;
    const active = activeVisits(state)[0];
    if (active?.kind !== 'acceptance' || active.key !== visit.key || active.caseId !== visit.caseId) return null;
    const record = chooseShipmentAcceptance(state);
    if (!record || visit.caseId !== record.id || visit.key !== `acceptance:${record.id}`) return null;
    return shipmentAcceptance(state.day, record);
  }
  const filed = state.acceptanceReceipt;
  if (!filed || filed.day !== closingDay) return null;
  const record = getRecord(state, filed.caseId);
  return record && record.id !== 7 && record.day < filed.day && record.answer === 'pass'
    ? shipmentAcceptance(filed.day, record) : null;
}

function confirmFollowup(records, record) {
  if (record.decision !== 'pass' || record.answer !== 'pass') return records;
  const previous = previousSameLot(records, record);
  return previous ? updateRecord(records, previous.id, { verifiedBy: record.id }) : records;
}

function isOffsite(status) {
  return status === 'shipped' || status === 'recallPending';
}

function disposition(records, item, decision) {
  if (decision !== 'pass') return decision === 'fail' ? 'returned' : 'held';
  if (item.answer === 'pass' && !hasAcceptedProof(item) && isOffsite(previousSameLot(records, item)?.status)) {
    return 'shipped';
  }
  return 'shipping';
}

export function receiptFeedback(state) {
  if (state?.phase !== 'receipt') return null;
  const record = withPriorShipment(state.records, state.records.at(-1));
  if (!record) return null;
  const kind = receiptDisposition(record);
  let line = RECEIPT_HANDLING[record.npc]?.[kind] ?? RECEIPT_HANDLING.default[kind] ?? '';
  if (record.id === state.flags.warningCase && record.decision === 'review') line = '行，我先让他们挪进黄线里。';
  const umbrella = record.id === 17 && state.flags.umbrella ? '你也看见了？老周这两天看见我就催我晾伞。' : null;
  return [line, umbrella, CASE_BY_ID.get(record.id)?.receiptAside].filter(Boolean).join(' ');
}

function showFinding(state, value) {
  const item = getCase(state);
  if (!item?.pressure) return state;
  const [finding] = normalizeFindings([value]);
  if (!finding) return state;
  const previous = item.shownFinding;
  if (previous?.key === finding.key && previous.source === finding.source && previous.text === finding.text) return state;
  return { ...state, shownFinding: { ...finding, caseId: item.id } };
}

function stamp(state, action) {
  const item = getCase(state);
  const { value } = action;
  if (!item || !DECISIONS.includes(value) || (item.id === 1 && state.tutorial < TUTORIAL.length - 1)) return state;
  const findings = normalizeFindings(action.findings);
  const previous = previousSameLot(state.records, item);
  const record = {
    id: item.id,
    batch: item.batch,
    day: state.day,
    npc: item.npc,
    title: item.title,
    decision: value,
    original: value,
    answer: item.answer,
    reason: item.reason,
    note: String(action.note ?? action.reason ?? '').trim().slice(0, 100),
    ...(findings.length ? { findings } : {}),
    ...(item.shownFinding ? { shownFinding: { ...item.shownFinding } } : {}),
    ...(isOffsite(previous?.status) ? { priorShipmentId: previous.id } : {}),
    status: disposition(state.records, item, value),
    amendments: [],
  };
  return { ...state, phase: 'receipt', records: confirmFollowup([...state.records, record], record) };
}

function amendedDisposition(records, record, decision) {
  if (decision !== 'pass' && record.status === 'shipped') return 'recallPending';
  if (record.status === 'recallPending') return decision === 'pass' ? 'shipped' : 'recallPending';
  if (decision !== 'pass' && record.status === 'recalled') return 'recalled';
  return disposition(records, record, decision);
}

function recheck(state, action) {
  if (!DECISIONS.includes(action.value)) return state;
  const record = withPriorShipment(state.records, getRecord(state, Number(action.id)));
  if (!record || action.value === record.decision || findVerifiedReceipt(state.records, record)) return state;
  const status = amendedDisposition(state.records, record, action.value);
  const findings = normalizeFindings(action.findings);
  const amendment = {
    from: record.decision, to: action.value, status, previousStatus: record.status, day: state.day,
    ...(findings.length ? { findings } : {}),
  };
  const revised = {
    ...record,
    decision: action.value,
    status,
    amendments: [...record.amendments, amendment],
  };
  return { ...state, records: confirmFollowup(updateRecord(state.records, record.id, revised), revised) };
}

function pendingRecall(state, id) {
  const record = state.phase === 'handoff' ? getRecord(state, Number(id)) : null;
  return record?.status === 'recallPending' && !findVerifiedReceipt(state.records, record) ? record : null;
}

function recallRequestIndex(record) {
  for (let index = record.amendments.length - 1; index >= 0; index--) {
    const { previousStatus, status } = record.amendments[index];
    if (previousStatus === 'shipped' && status === 'recallPending') return index;
  }
  return -1;
}

function receiveRecall(state, action) {
  if (activeVisits(state).length) return state;
  const record = pendingRecall(state, action.id);
  if (!record) return state;
  const amendmentIndex = recallRequestIndex(record);
  if (amendmentIndex < 0) return state;
  const visit = {
    kind: 'recall', key: `recall:${record.id}`, caseId: record.id, amendmentIndex,
    npc: 'luo', title: '收货方回执', line: `收货那边回单了。${record.batch} 的签收联在这儿，你对一下批号。`,
  };
  return { ...state, event: visit, events: [visit] };
}

function acknowledgeRecall(state, visit) {
  const record = pendingRecall(state, visit.caseId);
  if (!record || visit.key !== `recall:${record.id}`) return state;
  const amendmentIndex = recallRequestIndex(record);
  if (amendmentIndex < 0 || amendmentIndex !== visit.amendmentIndex) return state;
  const recallReceipt = { day: state.day, amendmentIndex };
  return { ...state, records: updateRecord(state.records, record.id, { status: 'recalled', recallReceipt }) };
}

function isIncomingKey(key) {
  return typeof key === 'string' && Object.hasOwn(INCOMING_CALLS, key);
}

function labRequest(state, caseId) {
  return state.phoneLog.find((call) => call?.kind === 'lab-request' && call.caseId === caseId);
}

function retainedCallKey(call) {
  if (call?.kind === 'incoming' && isIncomingKey(call.incomingKey)) return `incoming:${call.incomingKey}`;
  if (call?.kind === 'lab-request' && Number.isInteger(call.caseId) && PHONE['204'].requests?.[call.caseId]) return `lab-request:${call.caseId}`;
  return null;
}

function phoneLogWithCall(phoneLog, phone) {
  const log = [...phoneLog, phone];
  const permanent = new Map();
  const ordinary = [];
  for (const call of log) {
    const key = retainedCallKey(call);
    if (key) permanent.set(key, call);
    else ordinary.push(call);
  }
  const retained = new Set([...ordinary.slice(-(20 - permanent.size)), ...permanent.values()]);
  return log.filter((call) => retained.has(call));
}

function callResult(state, number, npc, lines, kind = 'call', details = {}) {
  const phone = { number, npc, lines, line: lines.join('\n'), kind, ...details };
  return { ...state, phone, phoneLog: phoneLogWithCall(state.phoneLog, phone) };
}

function incomingQueue(state) {
  return Array.isArray(state?.incomingCalls) ? state.incomingCalls : [];
}

export function getIncomingCall(state) {
  if (state?.phase === 'ending') return null;
  return incomingQueue(state).find(isIncomingKey) ?? null;
}

function queueIncomingCall(state, key) {
  const pending = incomingQueue(state);
  return pending.includes(key) ? state : { ...state, incomingCalls: [...pending, key] };
}

function hangUp(state) {
  return state.ringbackArmed === true
    ? queueIncomingCall({ ...state, ringbackArmed: false }, 'ringback') : state;
}

function answerCall(state) {
  const key = getIncomingCall(state);
  if (!key) return state;
  const { number, npc, lines } = INCOMING_CALLS[key];
  let answered = { ...state, incomingCalls: incomingQueue(state).filter((call) => call !== key) };
  if (key === 'ringback') answered = setFlags(answered, { ringback: true });
  return callResult(answered, number, npc, [...lines], 'incoming', { incomingKey: key, day: state.day });
}

function selectedSourceFlags(state) {
  const ids = new Set();
  if (state.flags.source241) ids.add(7);
  if (state.flags.source248) ids.add(14);
  if (state.flags.source211) ids.add(11);
  return ids;
}

function explicitRecordIds(action) {
  return Array.isArray(action.caseIds) ? action.caseIds.map(Number) : [];
}

function selectedRecords(state, action) {
  const ids = selectedSourceFlags(state);
  for (const id of explicitRecordIds(action)) {
    if (state.seen.includes(id)) ids.add(id);
  }
  const current = getCase(state)?.id;
  if (current === 14 && (action.report || action.context)) ids.add(14);
  return ids;
}

function selectedPapers(state, action) {
  if (!Array.isArray(action.papers) || !action.papers.length) return [];
  const visible = new Map(archive(state).map(({ id, documents }) => [id, documents]));
  return action.papers.flatMap((paper) => {
    if (!Number.isInteger(paper?.id) || !Number.isInteger(paper.index) || paper.index < 0) return [];
    const document = visible.get(paper.id)?.[paper.index];
    return document ? [{ id: paper.id, document }] : [];
  });
}

function citesReport(document, field, number) {
  return document.fields.some(([label, value]) => label === field && value === number);
}

function labSelection(state, action, script) {
  if (!Object.hasOwn(action, 'papers')) return { ids: selectedRecords(state, action), explicit: explicitRecordIds(action) };
  const ids = selectedSourceFlags(state);
  const explicit = [];
  for (const { id, document } of selectedPapers(state, action)) {
    const oldSlip = (id === 7 && document.type === 'report' && citesReport(document, '报告编号', 'R-071')) ||
      (id === 14 && document.type === 'archive' && citesReport(document, '原报告编号', 'R-071'));
    if (oldSlip) {
      ids.add(id);
      explicit.push(id);
    } else if (id === 14 && document.type === 'report' && citesReport(document, '报告编号', 'R-084')) {
      explicit.push('retest');
    } else if (script.requests?.[id] && document.type === 'order') {
      explicit.push(id);
    }
  }
  return { ids, explicit };
}

function dialLab(state, action, number) {
  const script = PHONE[number];
  const { ids, explicit } = labSelection(state, action, script);
  const oldCase = ids.has(14) ? 14 : ids.has(7) ? 7 : null;
  const bothOldPapers = ids.has(7) && ids.has(14);
  if (!bothOldPapers) {
    const retest = explicit.lastIndexOf('retest');
    const latestPriorPaper = Math.max(explicit.lastIndexOf(oldCase), retest);
    const request = selectedLabRequest(state, script, explicit.slice(latestPriorPaper + 1));
    if (request) return dialLabRequest(state, number, script.npc, request);
    if (retest >= 0) return callResult(state, number, script.npc, [script.retestHint], 'hint');
  }
  if (!oldCase) return callResult(state, number, script.npc, [script.greeting]);
  if (state.flags.traceDocument) return callResult(state, number, script.npc, [script.received]);
  if (isVisitQueued(state, 'trace')) return callResult(state, number, script.npc, ['原件已经留出来了。我们在窗口交接一下。']);
  if (bothOldPapers) {
    const called = callResult(state, number, script.npc, [script.inquiry, script.found], 'trace');
    return queueVisit(called, 'trace');
  }
  return callResult(state, number, script.npc, [oldCase === 14 ? script.archiveHint : script.relatedHint], 'hint');
}

function selectedLabRequest(state, script, explicit) {
  if (!explicit.some((id) => script.requests?.[id])) return null;
  const visible = new Map(archive(state).map((item) => [item.id, item]));
  const caseId = explicit.findLast((id) => script.requests?.[id] && visible.get(id)?.documents.some(({ type }) => type === 'order'));
  if (!caseId) return null;
  const request = script.requests[caseId];
  return { caseId, request, arrived: visible.has(request.followupId) };
}

function dialLabRequest(state, number, npc, { caseId, request, arrived }) {
  const registration = labRequest(state, caseId);
  if (arrived || registration) {
    return callResult(state, number, npc, [arrived ? request.arrived : request.repeat], 'call', registration ? { caseId } : {});
  }
  return callResult(state, number, npc, [request.requested], 'lab-request', { caseId, day: state.day });
}

function dialNight(state, action, number) {
  const script = PHONE[number];
  if (state.flags.nightDocument) return callResult(state, number, script.npc, [script.received]);
  let delivery = '下次交接，我到窗口递给你。';
  if (activeVisits(state)[0]?.key === 'night') delivery = '回执已经递到窗口了。';
  else if (state.phase === 'case') delivery = '你先把手上这批办完。我到窗口递给你。';
  else if (state.phase === 'handoff') delivery = '我这就到窗口。';
  if (isVisitQueued(state, 'night')) return callResult(state, number, script.npc, ['退回联已经找出来了。', delivery]);
  const hasNightRegister = Object.hasOwn(action, 'papers')
    ? state.flags.source211 || selectedPapers(state, action).some(({ id, document }) => id === 11 &&
      document.type === 'archive' && document.fields.some((field) => documentExtension(field) === '107'))
    : selectedRecords(state, action).has(11);
  if (!hasNightRegister) {
    return callResult(state, number, script.npc, [script.greeting]);
  }
  const called = callResult(state, number, script.npc, [script.found, delivery], 'night');
  return queueVisit(called, 'night');
}

function dial(state, action) {
  const number = String(action.number ?? action.value ?? '').trim();
  if (!/^\d{1,5}$/.test(number)) return state;
  if (number === '204') return dialLab(state, action, number);
  if (number === '107') return dialNight(state, action, number);
  if (number === '880') {
    const script = PHONE[number];
    return callResult({ ...state, ringbackArmed: true }, number, null, [script.greeting], 'ringback-test');
  }
  return callResult(state, number, null, ['嘟……这条内线目前无人接听。'], 'unavailable');
}

function explore(state, key) {
  const item = getCase(state);
  if (key === 'r071-241' && state.seen.includes(7)) return setFlags(state, { source241: true });
  if (key === 'r071-248' && state.seen.includes(14)) return setFlags(state, { source248: true });
  if (key === 'g211' && state.seen.includes(11)) return setFlags(state, { source211: true });
  if (key === 'clear-selection') return setFlags(state, { source241: false, source248: false, source211: false });
  if (key === 'cat' && (item?.id === 3 || item?.id === 15 || state.seen.includes(3))) return setFlags(state, { cat: true });
  if (key === 'umbrella' && state.seen.includes(16)) return setFlags(state, { umbrella: true });
  if (key === 'pencil' && item?.id === 8 && state.flags.rollingPencil) return setFlags(state, { pencil: true });
  if (key === 'phone-back') return setFlags(state, { phoneBack: true });
  return state;
}

function attach(state, action) {
  if (action.key === 'trace' && state.flags.traceDocument && state.seen.includes(TRACE_CASE_ID)) {
    return setFlags(state, { traceAttached: action.value !== false });
  }
  if (action.key === 'night' && state.flags.nightDocument) {
    return setFlags(state, { nightAttached: action.value !== false });
  }
  return state;
}

function nextCase(state) {
  const next = deliverVisits(state.shownFinding ? { ...state, shownFinding: null } : state);
  if (state.index + 1 < getDay(state).cases.length) return startCase(next, state.index + 1);
  if (state.day === DAYS.length - 1) return { ...next, phase: 'handoff' };
  const summary = { ...next, phase: 'summary', records: ship(next.records) };
  return state.day === 1 ? queueIncomingCall(summary, 'lab-close') : summary;
}

function finish(state) {
  const record = state.flags.traceAttached ? getRecord(state, TRACE_CASE_ID) : null;
  const reviewed = record?.status === 'shipped' || record?.status === 'shipping'
    ? recheck(state, { id: TRACE_CASE_ID, value: 'review', findings: [TRACE_FINDING] })
    : state;
  return { ...reviewed, phase: 'ending', records: ship(reviewed.records), event: null, events: [], incomingCalls: [], ringbackArmed: false };
}

export function dispatch(state, action) {
  if (!action?.type || state.phase === 'ending') return state;
  const waitingForVisit = activeVisits(state).length > 0;
  switch (action.type) {
    case 'start-day':
      return state.phase === 'brief' && !waitingForVisit ? startDay(state) : state;
    case 'tutorial': {
      const step = TUTORIAL[state.tutorial];
      const key = action.key ?? action.step ?? action.value;
      if (state.phase !== 'case' || getCase(state)?.id !== 1 || !step || step.key === 'stamp') return state;
      return key === step.key ? { ...state, tutorial: state.tutorial + 1 } : state;
    }
    case 'stamp':
      return state.phase === 'case' && !waitingForVisit ? stamp(state, action) : state;
    case 'show-finding':
      return state.phase === 'case' && !waitingForVisit ? showFinding(state, action.finding) : state;
    case 'next':
      return state.phase === 'receipt' && !waitingForVisit ? nextCase(state) : state;
    case 'advance-day':
      return state.phase === 'summary' && !waitingForVisit
        ? { ...state, phase: 'brief', day: state.day + 1, index: 0, incomingCalls: incomingQueue(state).filter((key) => key !== 'lab-close') }
        : state;
    case 'ack-visit':
      return acknowledgeVisit(state);
    case 'dial':
      return dial(state, action);
    case 'hang-up':
      return hangUp(state);
    case 'answer-call':
      return answerCall(state);
    case 'explore':
      return explore(state, action.key);
    case 'recheck':
      return state.phase === 'handoff' ? recheck(state, action) : state;
    case 'receive-recall':
      return receiveRecall(state, action);
    case 'attach':
      return state.phase === 'handoff' ? attach(state, action) : state;
    case 'finish':
      return state.phase === 'handoff' && !waitingForVisit ? finish(state) : state;
    default:
      return state;
  }
}

export function getEnding(state) {
  const issues = [];
  const pendingRecalls = [];
  const confirmedRecalls = [];
  const heldReceipts = [];
  const traceReceipt = state.flags.traceAttached ? getRecord(state, TRACE_CASE_ID) ?? null : null;
  const acceptance = getShipmentAcceptance(state);
  const acceptedReceipt = isAcceptedShipment(state.records, acceptance?.record, acceptance?.day) ? acceptance.record : null;
  const traceDisposition = {
    shipping: 'G-241 正在装货台排车，尚未出库。',
    shipped: 'G-241 已出库，尚未登记召回。',
    recallPending: 'G-241 已发出召回请求，等待收货方确认。',
    recalled: 'G-241 已确认召回，安排抽检。',
    held: 'G-241 已留厂隔离，安排补检。',
    returned: 'G-241 已退回，退件记录随本次交接留存。',
  };
  const counts = { pass: 0, fail: 0, review: 0 };
  const delayedByBatch = new Map();
  for (const record of state.records) {
    const receipt = withPriorShipment(state.records, record);
    const { id, batch, decision, answer, status } = receipt;
    counts[decision] += 1;
    const latestReceipt = findVerifiedReceipt(state.records, receipt);
    if (latestReceipt) continue;
    if (receiptDisposition(receipt) === 'held') heldReceipts.push(receipt);
    if ((decision === 'pass' || status === 'recallPending') && answer !== 'pass') issues.push(receipt);
    if (status === 'recallPending') pendingRecalls.push(receipt);
    if (status === 'recalled' && receipt.recallReceipt && id !== traceReceipt?.id) confirmedRecalls.push(receipt);
    const stillWithheld = status === 'held' || status === 'returned' || status === 'recalled';
    const justifiedTraceHold = id === traceReceipt?.id;
    const original = isSupplementOnly(receipt) ? getRecord(state, receipt.priorShipmentId) : null;
    if (answer === 'pass' && stillWithheld && !justifiedTraceHold && !isOffsite(original?.status)) delayedByBatch.set(batch, receipt);
  }
  const delayed = { count: delayedByBatch.size, batches: [...delayedByBatch.keys()].slice(0, 3) };
  const delayedReceipts = [...delayedByBatch.values()];
  const traceDetail = !state.flags.traceAttached ? '' : (traceDisposition[traceReceipt?.status] ?? 'G-241 已登记追加复检，去向待核。');
  const shared = { issues, pendingRecalls, confirmedRecalls, heldReceipts, acceptedReceipt, traceReceipt, traceDisposition: traceDetail, counts, delayed, delayedReceipts };
  if (issues.length) {
    const detail = issues.map(({ batch, reason, answer, status }) => {
      const action = status === 'recallPending' ? '召回待确认' : answer === 'review' ? '暂缓入库' : '收货方复核';
      return `${batch} · ${action} · ${reason}`;
    }).join('\n');
    return { id: 'issue', ...HANDOFF.escaped, detail, ...shared };
  }
  if (state.flags.traceAttached) {
    return { id: 'trace', ...HANDOFF.investigation, detail: traceDetail, ...shared };
  }
  const heldBatches = [...new Set(heldReceipts.map(({ batch }) => batch))];
  const firstBatches = heldBatches.slice(0, 2).join('、');
  let detail = '本周出货回执已归档。';
  if (heldBatches.length === 1) detail = `${firstBatches} 留在黄线内，由下一班继续查。`;
  if (heldBatches.length > 1) detail = `黄线内有 ${firstBatches}${heldBatches.length > 2 ? ' 等' : ''}，共 ${heldBatches.length} 个待查批号，由下一班接手。`;
  return { id: 'routine', ...HANDOFF.normal, detail, ...shared };
}

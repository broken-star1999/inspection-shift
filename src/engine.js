import { DAYS, HANDOFF, PHONE, PRESSURE, TUTORIAL as tutorialContent } from './content.js';
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
const REPLAY_VARIANT_CASES = [8, 12].map((id) => CASE_BY_ID.get(id));
const TUTORIAL_KEYS = ['label', 'report', 'signature', 'sample', 'stamp'];
export const TUTORIAL = tutorialContent.map((step, index) => ({ ...step, key: TUTORIAL_KEYS[index] }));

export const EVIDENCE = {
  trace: PHONE['204'].evidence,
  night: PHONE['107'].evidence,
};

const STANDARD_RESPONSE = {
  pass: '我照这张去装货台。',
  fail: '我拿这张回返工区。',
  review: '我先放在黄线里。',
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
  const run = { ...createRun(seed), tutorial: TUTORIAL.length };
  if (!previousRun || REPLAY_VARIANT_CASES.some((item) => variantIndex(previousRun, item) !== variantIndex(run, item))) {
    return run;
  }
  const item = REPLAY_VARIANT_CASES[seededChoice(run.seed, 130, REPLAY_VARIANT_CASES.length)];
  const index = (variantIndex(run, item) + 1) % item.variants.length;
  return { ...run, variantOverride: { caseId: item.id, index } };
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

function getDialogue(state, item) {
  const previous = getPreviousReceipt(state, item)?.record.decision;
  const line = item.followUp?.lines[previous] ?? item.line;
  if (item.nightResponse && state.flags.nightDocument) return `${line} ${item.nightResponse}`;
  if (item.id === 12 && state.flags.pencil) return `${line} 你看，我给笔尾绑了截木头，这下它滚不了了。`;
  return line;
}

export function getCase(state) {
  if (!['case', 'receipt'].includes(state.phase)) return null;
  const base = getDay(state)?.cases[state.index];
  if (!base) return null;
  const item = getVariant(state, base);
  const pressure = item.id === state.flags.offerCase ? 'favor' : item.id === state.flags.warningCase ? 'warning' : null;
  const pressureLine = pressure ? PRESSURE[pressure === 'favor' ? 0 : 1].line : null;
  return { ...item, line: getDialogue(state, item), pressure, pressureLine };
}

export function getPreviousReceipt(state, item = getCase(state)) {
  const followUp = item?.followUp;
  if (!followUp) return null;
  const record = getRecord(state, followUp.caseId);
  return record ? { record, sameLot: followUp.sameLot === true } : null;
}

export function archive(state, query = '') {
  const key = String(query).toLowerCase().trim();
  const waitingForArrival = state.phase === 'case' && activeVisits(state).length
    ? getDay(state)?.cases[state.index]?.id : null;
  return state.seen.map((id) => {
    const item = getVariant(state, CASE_BY_ID.get(id));
    const record = getRecord(state, id) ?? null;
    const latestReceipt = record ? findVerifiedReceipt(state.records, record) : null;
    return { ...item, record, latestReceipt, previousReceipt: getPreviousReceipt(state, item) };
  }).filter((item) => {
    if (item.id === waitingForArrival && !item.record) return false;
    if (!key) return true;
    const fields = item.documents.flatMap(({ title, fields, note }) => [title, fields.flat().join(' '), note]);
    return [item.batch, item.title, ...fields].some((text) => text && String(text).toLowerCase().includes(key));
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

function deliverVisits(state) {
  if (!state.pending.length) return state;
  const events = [...activeVisits(state)];
  for (const key of state.pending) {
    if (VISITS[key] && !state.flags[`${key}Document`] && !events.some((visit) => visit.key === key)) {
      events.push(VISITS[key]);
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
  const accepted = setFlags({ ...state, event: events[0] ?? null, events }, { [`${visit.key}Document`]: true });
  return !events.length && accepted.phase === 'case' ? startCase(accepted, accepted.index) : accepted;
}

function startCase(state, index) {
  const id = getDay(state)?.cases[index]?.id;
  if (!id) return state;
  const arrived = { ...state, phase: 'case', index };
  return activeVisits(arrived).length || arrived.seen.includes(id)
    ? arrived : { ...arrived, seen: [...arrived.seen, id] };
}

function ship(records) {
  return records.map((record) => record.status === 'shipping' ? { ...record, status: 'shipped' } : record);
}

function updateRecord(records, id, changes) {
  return records.map((record) => record.id === id ? { ...record, ...changes } : record);
}

function sameLotFollowup(previous, next) {
  const followUp = next && CASE_BY_ID.get(next.id)?.followUp;
  return followUp?.sameLot === true && followUp.caseId === previous?.id && previous?.batch === next.batch;
}

function findVerifiedReceipt(records, previous) {
  if (!previous.verifiedBy) return null;
  const next = records.find(({ id }) => id === previous.verifiedBy);
  if (!sameLotFollowup(previous, next) || next.answer !== 'pass') return null;
  // A later recall changes where the lot is, while the accepted test evidence is still on file.
  const accepted = next.decision === 'pass' || next.original === 'pass' || next.amendments?.some(({ to }) => to === 'pass');
  return accepted ? next : null;
}

function confirmFollowup(records, record) {
  if (record.decision !== 'pass' || record.answer !== 'pass') return records;
  const previousId = CASE_BY_ID.get(record.id)?.followUp?.caseId;
  const previous = records.find(({ id }) => id === previousId);
  if (!sameLotFollowup(previous, record)) return records;
  return updateRecord(records, previous.id, { verifiedBy: record.id });
}

function disposition(decision) {
  return decision === 'pass' ? 'shipping' : decision === 'fail' ? 'returned' : 'held';
}

function stamp(state, action) {
  const item = getCase(state);
  const { value } = action;
  if (!item || !DECISIONS.includes(value) || (item.id === 1 && state.tutorial < TUTORIAL.length - 1)) return state;
  let response = value === item.answer ? item.response : STANDARD_RESPONSE[value];
  if (item.pressure === 'warning' && value === 'review') response = '行，我先让他们挪进黄线里。';
  if (item.id === 17 && state.flags.umbrella) response += ' 你也看见了？老周这两天看见我就催我晾伞。';
  const findings = normalizeFindings(action.findings);
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
    note: String(action.note ?? action.reason ?? '').trim().slice(0, 100) || (value === 'review' ? '请核对送检材料' : ''),
    ...(findings.length ? { findings } : {}),
    response,
    status: disposition(value),
    amendments: [],
  };
  return { ...state, phase: 'receipt', records: confirmFollowup([...state.records, record], record) };
}

function recheck(state, action) {
  if (!DECISIONS.includes(action.value)) return state;
  const record = getRecord(state, Number(action.id));
  if (!record || action.value === record.decision || findVerifiedReceipt(state.records, record)) return state;
  const requiresRecall = record.status === 'shipped' || record.status === 'recalled';
  const status = requiresRecall && action.value !== 'pass' ? 'recalled' : disposition(action.value);
  const { decision: previous, status: priorStatus } = record;
  const revised = {
    ...record,
    decision: action.value,
    status,
    amendments: [...record.amendments, { from: previous, to: action.value, status, previousStatus: priorStatus, day: state.day }],
  };
  return { ...state, records: confirmFollowup(updateRecord(state.records, record.id, revised), revised) };
}

function callResult(state, number, npc, lines, kind = 'call') {
  const phone = { number, npc, lines, line: lines.join('\n'), kind };
  return { ...state, phone, phoneLog: [...state.phoneLog.slice(-19), phone] };
}

function selectedRecords(state, action) {
  const explicit = Array.isArray(action.caseIds) ? action.caseIds : [];
  const ids = new Set(explicit.map(Number).filter((id) => state.seen.includes(id)));
  if (state.flags.source241) ids.add(7);
  if (state.flags.source248) ids.add(14);
  if (state.flags.source211) ids.add(11);
  const current = getCase(state)?.id;
  if (current === 14 && (action.report || action.context)) ids.add(14);
  if (current === 11 || current === 13) ids.add(11);
  return ids;
}

function dialLab(state, action, number) {
  const script = PHONE[number];
  if (state.flags.traceDocument) {
    return callResult(state, number, script.npc, [script.received]);
  }
  if (isVisitQueued(state, 'trace')) return callResult(state, number, 'chen', ['原件已经留出来了。我们在窗口交接一下。']);
  const ids = selectedRecords(state, action);
  if (ids.has(7) && ids.has(14)) {
    const called = callResult(state, number, script.npc, [script.inquiry, script.found], 'trace');
    return queueVisit(called, 'trace');
  }
  if (ids.has(14)) {
    return callResult(state, number, script.npc, [script.archiveHint], 'hint');
  }
  if (ids.has(7)) {
    return callResult(state, number, script.npc, [script.relatedHint], 'hint');
  }
  return callResult(state, number, script.npc, [script.greeting]);
}

function dialNight(state, action, number) {
  const script = PHONE[number];
  if (state.flags.nightDocument) return callResult(state, number, script.npc, [script.received]);
  if (isVisitQueued(state, 'night')) return callResult(state, number, 'sun', ['退回联已经找出来了。到窗口我给你。']);
  if (!selectedRecords(state, action).has(11)) {
    return callResult(state, number, script.npc, [script.greeting]);
  }
  const called = callResult(state, number, script.npc, [script.found], 'night');
  return queueVisit(called, 'night');
}

function dial(state, action) {
  const number = String(action.number ?? action.value ?? '').trim();
  if (!/^\d{1,5}$/.test(number)) return state;
  if (number === '204') return dialLab(state, action, number);
  if (number === '107') return dialNight(state, action, number);
  if (number === '880') {
    const script = PHONE[number];
    return callResult(setFlags(state, { ringback: true }), number, script.npc, [script.greeting, script.found], 'ringback');
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
  if (action.key === 'trace' && state.flags.traceDocument && state.seen.includes(7)) {
    return setFlags(state, { traceAttached: action.value !== false });
  }
  if (action.key === 'night' && state.flags.nightDocument) {
    return setFlags(state, { nightAttached: action.value !== false });
  }
  return state;
}

function nextCase(state) {
  const next = deliverVisits(state);
  if (state.index + 1 < getDay(state).cases.length) return startCase(next, state.index + 1);
  if (state.day === DAYS.length - 1) return { ...next, phase: 'handoff' };
  return { ...next, phase: 'summary', records: ship(next.records) };
}

function finish(state) {
  const record = getRecord(state, 7);
  let records = ship(state.records);
  if (state.flags.traceAttached && record) {
    const status = record.status === 'shipped' || record.status === 'recalled' ? 'recalled' : 'held';
    records = updateRecord(records, 7, { status, traceDisposition: status });
  }
  return { ...state, phase: 'ending', records, event: null, events: [] };
}

export function dispatch(state, action) {
  if (!action?.type || state.phase === 'ending') return state;
  const waitingForVisit = activeVisits(state).length > 0;
  switch (action.type) {
    case 'start-day':
      return state.phase === 'brief' && !waitingForVisit ? startCase(deliverVisits(state), 0) : state;
    case 'tutorial': {
      const step = TUTORIAL[state.tutorial];
      const key = action.key ?? action.step ?? action.value;
      if (state.phase !== 'case' || getCase(state)?.id !== 1 || !step || step.key === 'stamp') return state;
      return key === step.key ? { ...state, tutorial: state.tutorial + 1 } : state;
    }
    case 'stamp':
      return state.phase === 'case' && !waitingForVisit ? stamp(state, action) : state;
    case 'next':
      return state.phase === 'receipt' && !waitingForVisit ? nextCase(state) : state;
    case 'advance-day':
      return state.phase === 'summary' && !waitingForVisit ? { ...state, phase: 'brief', day: state.day + 1, index: 0 } : state;
    case 'ack-visit':
      return acknowledgeVisit(state);
    case 'dial':
      return dial(state, action);
    case 'explore':
      return explore(state, action.key);
    case 'recheck':
      return state.phase === 'handoff' ? recheck(state, action) : state;
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
  const traceReceipt = state.flags.traceAttached ? getRecord(state, 7) ?? null : null;
  const recall = traceReceipt?.status === 'shipped' || traceReceipt?.status === 'recalled';
  const traceDisposition = !state.flags.traceAttached ? '' : recall ? 'G-241 已确认召回，安排抽检。' : 'G-241 已封存，安排补检。';
  const counts = { pass: 0, fail: 0, review: 0 };
  const delayedByBatch = new Map();
  for (const receipt of state.records) {
    const { id, batch, decision, answer, status } = receipt;
    counts[decision] += 1;
    const latestReceipt = findVerifiedReceipt(state.records, receipt);
    if (decision === 'pass' && answer !== 'pass' && !latestReceipt) issues.push(receipt);
    const stillWithheld = status === 'held' || status === 'returned' || status === 'recalled';
    const justifiedTraceHold = id === traceReceipt?.id;
    if (answer === 'pass' && stillWithheld && !latestReceipt && !justifiedTraceHold) delayedByBatch.set(batch, receipt);
  }
  const delayed = { count: delayedByBatch.size, batches: [...delayedByBatch.keys()].slice(0, 3) };
  const delayedReceipts = [...delayedByBatch.values()];
  const shared = { issues, traceReceipt, traceDisposition, counts, delayed, delayedReceipts };
  if (issues.length) {
    const detail = issues.map(({ batch, reason, answer }) => `${batch} · ${answer === 'review' ? '暂缓入库' : '收货方复核'} · ${reason}`).join('\n');
    return { id: 'issue', ...HANDOFF.escaped, detail, ...shared };
  }
  if (state.flags.traceAttached) {
    return { id: 'trace', ...HANDOFF.investigation, detail: traceDisposition, ...shared };
  }
  return { id: 'routine', ...HANDOFF.normal, detail: '本周来件已经核对。留在黄线内的待审查批次由下一班接手。', ...shared };
}

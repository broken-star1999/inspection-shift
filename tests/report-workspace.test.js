import assert from 'node:assert/strict';
import test from 'node:test';
import { createRun, dispatch, getDay } from '../src/engine.js';
import { reportWorkspace, TRACE_INQUIRY_KEY } from '../src/report-workspace.js';

function atReportLookup() {
  const run = { ...createRun(21), phase: 'case', day: 3, seen: [7, 14] };
  return { ...run, index: getDay(run).cases.findIndex(({ id }) => id === 14) };
}

const docs = { panel: 'docs', opener: { act: 'report-search', key: 'R-071' }, scrollTop: 34, scrollLeft: 5 };
const indexed = {
  caseId: 14, panel: 'archive', reportIndex: 'R-071',
  archivePaper: { id: 14, index: 2, scrollTop: 141, scrollLeft: 17 },
  archiveFocus: 14, archiveQuery: 'R-071', archiveReturn: docs, phoneReturn: null,
  scrollTop: 46, scrollLeft: 9,
};

function afterTraceInquiry(run) {
  return dispatch(run, { type: 'dial', number: '204', papers: [{ id: 7, index: 1 }, { id: 14, index: 2 }] });
}

test('keeps the exact archived paper and its index viewport and docs return through JSON', () => {
  const run = atReportLookup();
  assert.deepEqual(reportWorkspace(run, JSON.parse(JSON.stringify(indexed))), indexed);
  const indexOnly = { ...indexed, archivePaper: null };
  assert.deepEqual(reportWorkspace(run, indexOnly), indexOnly);
  assert.equal(reportWorkspace(run, { ...indexOnly, reportIndex: ' r071 ' }).reportIndex, 'R-071');
});

test('phone restores to the index or its open paper and only preserves a leaf below it', () => {
  const run = atReportLookup();
  const origin = {
    panel: 'archive', reportIndex: 'R-071', archiveFocus: 14, archiveQuery: 'R-071',
    archiveReturn: docs, opener: { act: 'phone' },
    archivePaper: { id: 7, index: 1, scrollTop: 91, scrollLeft: 2 }, scrollTop: 22, scrollLeft: 7,
  };
  const phone = { ...indexed, panel: 'phone', archivePaper: null, archiveReturn: null, phoneReturn: origin, scrollTop: 57 };
  assert.deepEqual(reportWorkspace(run, JSON.parse(JSON.stringify(phone))), phone);

  const { archivePaper: _paper, ...index } = origin;
  const fromIndex = { ...phone, phoneReturn: index };
  assert.deepEqual(reportWorkspace(run, fromIndex), fromIndex);
  const nestedCorrupt = { ...origin, archiveReturn: { panel: 'phone', phoneReturn: origin }, archivePaper: { id: 14, index: 1 } };
  const sanitized = reportWorkspace(run, { ...phone, phoneReturn: nestedCorrupt });
  assert.equal(sanitized.phoneReturn.archiveReturn, null);
  assert.equal(sanitized.phoneReturn.archivePaper, undefined);
});

test('an exact phone-pinned page can restore without a report index', () => {
  const phonePaper = {
    ...indexed, reportIndex: null, archiveFocus: 7, archiveQuery: '',
    archivePaper: { id: 7, index: 1, scrollTop: 0, scrollLeft: 0 },
    archiveReturn: { panel: 'phone', opener: { act: 'phone-paper', i: '7', doc: '1' }, scrollTop: 105, scrollLeft: 0 },
    phoneReturn: { panel: 'sample', opener: { act: 'phone' }, scrollTop: 25, scrollLeft: 4 },
  };
  const run = atReportLookup();
  assert.deepEqual(reportWorkspace(run, phonePaper), phonePaper);
  assert.equal(reportWorkspace(run, { ...phonePaper, archiveReturn: docs }), null);
  assert.equal(reportWorkspace(run, { ...phonePaper, archivePaper: { id: 99, index: 1 } }), null);
  assert.equal(reportWorkspace(run, { ...phonePaper, archivePaper: { id: 7, index: null } }), null);
});

test('invalid exact selection falls back to a valid index while unsafe offsets and opener data are pruned', () => {
  const run = atReportLookup();
  const unsafe = {
    ...indexed, archiveFocus: 99, archiveQuery: 'x'.repeat(70), scrollTop: Infinity, scrollLeft: -4,
    archivePaper: { id: 14, index: 1 },
    archiveReturn: { panel: 'docs', opener: { act: 'report-search', doc: 2, i: Infinity, field: {}, ignored: true }, scrollTop: '8', scrollLeft: 9 },
  };
  assert.deepEqual(reportWorkspace(run, unsafe), {
    ...indexed, archiveFocus: null, archiveQuery: 'x'.repeat(60), archivePaper: null, scrollTop: 0, scrollLeft: 0,
    archiveReturn: { panel: 'docs', opener: { act: 'report-search', doc: '2' }, scrollTop: 0, scrollLeft: 9 },
  });
  assert.equal(reportWorkspace(run, { ...indexed, reportIndex: 'R-881' }), null);
  assert.equal(reportWorkspace({ ...run, seen: [6] }, indexed), null);
});

test('ignores generic legacy surfaces, stale cases and visits that are still at the window', () => {
  const run = atReportLookup();
  assert.equal(reportWorkspace(run), null);
  assert.equal(reportWorkspace(run, { ...indexed, caseId: 13 }), null);
  assert.equal(reportWorkspace(run, { ...indexed, caseId: '14' }), null);
  assert.equal(reportWorkspace(run, { ...indexed, caseId: undefined }), null);
  assert.equal(reportWorkspace(run, { ...indexed, panel: 'docs' }), null);
  assert.equal(reportWorkspace(run, { ...indexed, panel: 'phone', reportIndex: null, phoneReturn: docs }), null);
  assert.equal(reportWorkspace({ ...run, phase: 'receipt' }, indexed), null);
  assert.equal(reportWorkspace({ ...run, events: [{ key: 'night' }] }, indexed), null);
  assert.equal(reportWorkspace({ ...run, events: undefined, event: { key: 'night' } }, indexed), null);
});

test('keeps the logged R-071 inquiry open or behind its indexed paper through JSON', () => {
  const run = afterTraceInquiry(atReportLookup());
  const fromPhone = { panel: 'phone', opener: { act: 'archive-trace-inquiry' }, scrollTop: 62, scrollLeft: 3 };
  const registration = {
    ...indexed, reportIndex: null, archivePaper: null, archiveFocus: TRACE_INQUIRY_KEY, archiveQuery: '', archiveReturn: fromPhone,
  };
  const fromRegistration = { ...indexed, archiveFocus: TRACE_INQUIRY_KEY, archiveReturn: fromPhone };
  for (const view of [registration, fromRegistration]) {
    assert.deepEqual(reportWorkspace(run, JSON.parse(JSON.stringify(view))), view);
  }
});

test('phone saves the matching inquiry as its archive origin and preserves the older docs return', () => {
  const run = afterTraceInquiry(atReportLookup());
  const origin = {
    panel: 'archive', reportIndex: null, archiveFocus: TRACE_INQUIRY_KEY, archiveQuery: '',
    archiveReturn: docs, opener: { act: 'phone' }, scrollTop: 28, scrollLeft: 11,
  };
  const phone = {
    ...indexed, panel: 'phone', reportIndex: null, archivePaper: null, archiveFocus: null,
    archiveQuery: '', archiveReturn: null, phoneReturn: origin, scrollTop: 21,
  };
  assert.deepEqual(reportWorkspace(run, JSON.parse(JSON.stringify(phone))), phone);

  const fromPaper = { ...phone, phoneReturn: { ...origin, reportIndex: 'R-071', archivePaper: indexed.archivePaper } };
  assert.deepEqual(reportWorkspace(run, fromPaper), fromPaper);
});

test('rejects a saved inquiry selection without its actual matching call', () => {
  const run = atReportLookup();
  const registration = { ...indexed, reportIndex: null, archivePaper: null, archiveFocus: TRACE_INQUIRY_KEY };
  assert.equal(reportWorkspace(run, registration), null);
  assert.equal(reportWorkspace({ ...run, flags: { ...run.flags, traceDocument: true } }, registration), null);
  const called = afterTraceInquiry(run);
  const falsePair = [{ ...called.phoneLog[0], papers: [{ id: 7, index: 1 }, { id: 14, index: 1 }] }];
  assert.equal(reportWorkspace({ ...called, phoneLog: falsePair }, registration), null);

  const parentCall = { panel: 'archive', archiveFocus: TRACE_INQUIRY_KEY };
  const phone = { ...registration, panel: 'phone', phoneReturn: parentCall };
  assert.equal(reportWorkspace(run, phone), null);
  const normalIndex = reportWorkspace(run, { ...indexed, archiveFocus: TRACE_INQUIRY_KEY });
  assert.deepEqual(normalIndex, { ...indexed, archiveFocus: null });
  const normalPhone = reportWorkspace(run, { ...phone, phoneReturn: { ...parentCall, reportIndex: 'R-071' } });
  assert.equal(normalPhone.phoneReturn.archiveFocus, null);
  assert.equal(normalPhone.phoneReturn.reportIndex, 'R-071');
});

import { archive, archivedReportSources, getCase, getTraceInquiry, nightRegisterForReceipt } from './engine.js';

export const TRACE_INQUIRY_KEY = 'call:trace:R-071';

const openerKeys = ['act', 'i', 'key', 'doc', 'field', 'fixture'];
const offset = (value) => Number.isFinite(value) ? Math.max(0, value) : 0;
const scroll = (value) => ({ scrollTop: offset(value?.scrollTop), scrollLeft: offset(value?.scrollLeft) });
const query = (value) => typeof value === 'string' ? value.slice(0, 60) : '';

function opener(value) {
  if (typeof value?.act !== 'string' || !value.act.trim() || value.act.length > 128) return null;
  const data = {};
  for (const key of openerKeys) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.length <= 128) data[key] = entry;
    else if (Number.isFinite(entry)) data[key] = String(entry);
  }
  return data;
}

function parent(value, panels) {
  if (!panels.includes(value?.panel)) return null;
  return { panel: value.panel, opener: opener(value.opener), ...scroll(value) };
}

function indexEntry(run, value) {
  const sources = typeof value === 'string' ? archivedReportSources(run, value) : [];
  return sources.length ? { number: sources[0].number, sources } : null;
}

function exactPaper(value, filed, report, { fromPhone = false, retained } = {}) {
  const { id, index } = value ?? {};
  if (!Number.isInteger(id) || !Number.isInteger(index) || !filed.get(id)?.documents[index]) return null;
  const matches = (paper) => paper?.id === id && paper.index === index;
  if (report ? !report.sources.some(matches) : !fromPhone && !matches(retained)) return null;
  return { id, index, ...scroll(value) };
}

function selectedArchiveFocus(focus, filed, hasTraceInquiry, supportingKeys) {
  return filed.has(focus) || (focus === TRACE_INQUIRY_KEY && hasTraceInquiry) || supportingKeys?.has(focus) ? focus : null;
}

function phoneOrigin(run, value, filed, hasTraceInquiry, betweenBatches, supportingKeys, retained) {
  if (value?.panel !== 'archive') return betweenBatches ? null : parent(value, ['docs', 'sample']);
  const report = indexEntry(run, value.reportIndex);
  const archiveFocus = selectedArchiveFocus(value.archiveFocus, filed, hasTraceInquiry, supportingKeys);
  if (!report && archiveFocus === null) return null;
  const archivePaper = exactPaper(value.archivePaper, filed, report, { retained });
  return {
    panel: 'archive', opener: opener(value.opener), ...scroll(value),
    reportIndex: report?.number ?? null,
    archiveFocus,
    archiveQuery: query(value.archiveQuery),
    archiveReturn: betweenBatches ? null : parent(value.archiveReturn, ['docs', 'sample']),
    ...(archivePaper ? { archivePaper } : {}),
  };
}

export function reportWorkspace(run, value, { betweenBatches = false, supportingKeys } = {}) {
  if (run?.phase !== (betweenBatches ? 'receipt' : 'case') || (run.events?.length ?? Boolean(run.event)) ||
      !['archive', 'phone'].includes(value?.panel) || !Number.isInteger(value.caseId) || getCase(run)?.id !== value.caseId) return null;

  const filed = new Map(archive(run).map((item) => [item.id, item]));
  const hasTraceInquiry = (value.archiveFocus === TRACE_INQUIRY_KEY || value.phoneReturn?.archiveFocus === TRACE_INQUIRY_KEY) &&
    Boolean(getTraceInquiry(run));
  const archiveFocus = selectedArchiveFocus(value.archiveFocus, filed, hasTraceInquiry, supportingKeys);
  const report = indexEntry(run, value.reportIndex);
  const archiveReturn = parent(value.archiveReturn, betweenBatches ? ['phone'] : ['docs', 'sample', 'phone']);
  const retained = betweenBatches ? nightRegisterForReceipt(run) : null;
  const archivePaper = exactPaper(value.archivePaper, filed, report, { fromPhone: archiveReturn?.panel === 'phone', retained });
  const phoneReturn = phoneOrigin(run, value.phoneReturn, filed, hasTraceInquiry, betweenBatches, supportingKeys, retained);
  const indexedView = value.panel === 'archive'
    ? report || archivePaper || archiveFocus === TRACE_INQUIRY_KEY
    : phoneReturn?.reportIndex || phoneReturn?.archiveFocus === TRACE_INQUIRY_KEY;
  if (!betweenBatches && !indexedView) return null;

  return {
    caseId: value.caseId, panel: value.panel,
    reportIndex: report?.number ?? null,
    archivePaper,
    archiveFocus,
    archiveQuery: query(value.archiveQuery),
    archiveReturn,
    phoneReturn,
    ...scroll(value),
  };
}

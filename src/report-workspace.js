import { archive, archivedReportSources, getCase } from './engine.js';

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

function exactPaper(value, filed, report, fromPhone = false) {
  const { id, index } = value ?? {};
  if (!Number.isInteger(id) || !Number.isInteger(index) || !filed.get(id)?.documents[index]) return null;
  if (report ? !report.sources.some((source) => source.id === id && source.index === index) : !fromPhone) return null;
  return { id, index, ...scroll(value) };
}

function phoneOrigin(run, value, filed) {
  if (value?.panel !== 'archive') return parent(value, ['docs', 'sample']);
  const report = indexEntry(run, value.reportIndex);
  const archiveFocus = filed.has(value.archiveFocus) ? value.archiveFocus : null;
  if (!report && archiveFocus === null) return null;
  const archivePaper = exactPaper(value.archivePaper, filed, report);
  return {
    panel: 'archive', opener: opener(value.opener), ...scroll(value),
    reportIndex: report?.number ?? null,
    archiveFocus,
    archiveQuery: query(value.archiveQuery),
    archiveReturn: parent(value.archiveReturn, ['docs', 'sample']),
    ...(archivePaper ? { archivePaper } : {}),
  };
}

export function reportWorkspace(run, value) {
  if (run?.phase !== 'case' || (run.events?.length ?? Boolean(run.event)) ||
      !['archive', 'phone'].includes(value?.panel) || !Number.isInteger(value.caseId) || getCase(run)?.id !== value.caseId) return null;

  const filed = new Map(archive(run).map((item) => [item.id, item]));
  const report = indexEntry(run, value.reportIndex);
  const archiveReturn = parent(value.archiveReturn, ['docs', 'sample', 'phone']);
  const archivePaper = exactPaper(value.archivePaper, filed, report, archiveReturn?.panel === 'phone');
  const phoneReturn = phoneOrigin(run, value.phoneReturn, filed);
  const newView = value.panel === 'archive' ? report || archivePaper : phoneReturn?.reportIndex;
  if (!newView) return null;

  return {
    caseId: value.caseId, panel: value.panel,
    reportIndex: report?.number ?? null,
    archivePaper,
    archiveFocus: filed.has(value.archiveFocus) ? value.archiveFocus : null,
    archiveQuery: query(value.archiveQuery),
    archiveReturn,
    phoneReturn,
    ...scroll(value),
  };
}

import { archive } from './engine.js';
import { handoffComparison } from './handoff-comparison.js';

const savedOffset = (value) => Number.isFinite(value) ? Math.max(0, value) : 0;

export function hasHandoffDocument(row, index, batchPapers = []) {
  if (!row) return false;
  if (typeof index === 'string') {
    return batchPapers.some(({ caseId, document }) => caseId === row.id && document.kind === index);
  }
  return Number.isInteger(index) && Boolean(row.documents[index]);
}

export function handoffWorkspace(run, value, batchPapers = []) {
  const id = value?.id;
  if (run?.phase !== 'handoff' || (id !== 'attachments' && !Number.isInteger(id))) return null;

  const comparing = value.comparing === true;
  let documentIndex = null;
  if (id === 'attachments') {
    const collected = run.flags?.traceDocument === true || run.flags?.nightDocument === true;
    if (comparing || !collected) return null;
  } else {
    const rows = archive(run).filter(({ record }) => record);
    const row = rows.find((entry) => entry.id === id);
    if (!row || (comparing && !handoffComparison(rows, id))) return null;
    if (hasHandoffDocument(row, value.documentIndex, batchPapers)) documentIndex = value.documentIndex;
  }

  return {
    id,
    documentIndex,
    comparing,
    scrollTop: savedOffset(value.scrollTop),
    boardScrollTop: savedOffset(value.boardScrollTop),
  };
}

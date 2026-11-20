function follows(later, earlier) {
  const previous = later.previousReceipt;
  return later.id !== earlier.id && previous?.record?.id === earlier.record.id && typeof previous.sameLot === 'boolean';
}

export function handoffComparison(rows, focus) {
  if (!Array.isArray(rows) || !Number.isInteger(focus)) return null;
  const filed = rows.filter((row) => row?.record);
  const selected = filed.find((row) => row.id === focus);
  if (!selected) return null;

  const earlier = filed.find((row) => follows(selected, row));
  if (earlier) return { earlier, later: selected, sameLot: selected.previousReceipt.sameLot };

  const followups = filed.filter((row) => follows(row, selected));
  const later = followups.find((row) => row.record.id === selected.latestReceipt?.id) ?? followups[0];
  return later ? { earlier: selected, later, sameLot: later.previousReceipt.sameLot } : null;
}

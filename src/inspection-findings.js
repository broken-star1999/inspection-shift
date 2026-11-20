const trimmedString = (value) => typeof value === 'string' ? value.trim() : '';

export function normalizeFindings(list) {
  if (!Array.isArray(list)) return [];
  const keys = new Set();
  const findings = [];
  for (const entry of list) {
    const key = trimmedString(entry?.key);
    const source = trimmedString(entry?.source);
    const text = trimmedString(entry?.text);
    if (!key || !text || keys.has(key)) continue;
    keys.add(key);
    findings.push({ key, source, text });
  }
  return findings;
}

export function readFindings(source) {
  const findings = normalizeFindings(source?.findings);
  if (findings.length) return findings;
  const text = trimmedString(source?.note);
  return text ? [{ key: 'legacy', source: '', text }] : [];
}

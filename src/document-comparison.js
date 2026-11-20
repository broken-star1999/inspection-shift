const reportMetadata = new Set(['批号', '原批号', '品名', '型号', '报告编号', '原报告编号', '报告日期', '签发', '签发人', '签发时间', '签发日期']);

const cleanText = (value) => typeof value === 'string' ? value.trim() : '';

function documentAt(item, index, type) {
  if (!Number.isInteger(item?.id) || item.id < 1 || !Number.isInteger(index) || index < 0 || !Array.isArray(item.documents)) return null;
  const document = item.documents[index];
  return document?.type === type ? document : null;
}

function rowsOf(document) {
  return Array.isArray(document?.fields) ? document.fields.filter(Array.isArray) : [];
}

function fieldText(document, labels) {
  return rowsOf(document).filter(([label]) => labels.includes(label)).map(([, value]) => cleanText(value)).filter(Boolean).join('；');
}

export function intakeComparison(item, orderIndex) {
  const order = documentAt(item, orderIndex, 'order');
  const requirement = fieldText(order, ['随货材料', '随货要求']);
  if (!requirement) return null;
  const received = item.documents.map((document) => cleanText(document?.title)).filter(Boolean);
  if (!received.length) return null;
  return {
    requirement,
    received,
    finding: {
      key: `compare:${item.id}:intake:${orderIndex}`,
      source: `${cleanText(order.title) || '送检联'} / 窗口收件`,
      text: `应收 · ${requirement}；实收 · ${received.join('、')}`,
    },
  };
}

export function projectComparison(item, orderIndex, reportIndex) {
  const order = documentAt(item, orderIndex, 'order');
  const report = documentAt(item, reportIndex, 'report');
  const required = fieldText(order, ['检验项目', '必查项目']);
  if (!required || !report) return null;
  const contents = rowsOf(report).flatMap(([label, value]) => {
    const field = cleanText(label);
    const text = cleanText(value);
    return field && text && !reportMetadata.has(field) ? [`${field} · ${text}`] : [];
  });
  const reported = contents.join('；') || '正文未列条目';
  const reportSource = [cleanText(report.title) || '检验报告', fieldText(report, ['报告编号'])].filter(Boolean).join(' ');
  return {
    required,
    reported,
    finding: {
      key: `compare:${item.id}:projects:${orderIndex}:${reportIndex}`,
      source: `${cleanText(order.title) || '送检联'} / ${reportSource}`,
      text: `应验 · ${required}；报告载明 · ${reported}`,
    },
  };
}

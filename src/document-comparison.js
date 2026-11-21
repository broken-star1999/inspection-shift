import { sampleAppearance, sampleFinding } from './samples.js';

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

export function cartonFinding(item, bottom) {
  if (!item?.carton || bottom !== true) return null;
  const order = item.documents.find(({ type }) => type === 'order');
  const expected = fieldText(order, ['箱底喷码']);
  const observed = item.carton.code || '无可辨喷码';
  return {
    key: `box:${item.id}:bottom`,
    source: expected ? '外箱底面 / 送检联' : '外箱底面',
    text: expected ? `箱底实码 · ${observed}；送检登记 · ${expected}` : item.carton.code ? `箱底实码 · ${observed}` : '箱底没有可辨喷码',
  };
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

function uniqueDocumentIndex(documents, type) {
  const matches = (document) => document?.type === type;
  const first = documents.findIndex(matches);
  return first === documents.findLastIndex(matches) ? first : -1;
}

function numberedField(document, field) {
  const matches = rowsOf(document).filter(([label]) => label === field);
  const title = cleanText(document?.title);
  const value = matches.length === 1 ? cleanText(matches[0][1]) : '';
  return title && value ? { title, field, value } : null;
}

export function modelComparison(item, inspection) {
  if (inspection?.back !== true || !Number.isInteger(item?.id) || item.id < 1 || !Array.isArray(item.documents)) return null;
  const sample = item.sample;
  const observed = cleanText(sample?.model);
  if (!observed || ((sample.kind === 'yellow' || sample.unwrapped) && inspection.unpacked !== true)) return null;
  const orderIndex = uniqueDocumentIndex(item.documents, 'order');
  const required = numberedField(item.documents[orderIndex], '指定型号');
  if (!required) return null;
  const title = sampleAppearance(sample).name;
  return {
    rows: [{ title, field: '内框刻字', value: observed }, required],
    finding: {
      key: `compare:${item.id}:model:${orderIndex}`,
      source: `${title} · 内框 / ${required.title}`,
      text: `内框刻字 · 型号 ${observed}；送检指定型号 · ${required.value}`,
    },
  };
}

export function thicknessComparison(item, inspection, findings = []) {
  if (!Number.isInteger(item?.id) || item.id < 1 || !Array.isArray(item.documents)) return null;
  const reading = cleanText(item.sample?.reading);
  const reportIndex = uniqueDocumentIndex(item.documents, 'report');
  const orderIndex = uniqueDocumentIndex(item.documents, 'order');
  const reportDocument = item.documents[reportIndex];
  const report = numberedField(reportDocument, '厚度');
  const range = numberedField(item.documents[orderIndex], '厚度范围');
  if (!reading || !report || !range) return null;
  const reportNumber = numberedField(reportDocument, '报告编号')?.value;
  const reportSource = [report.title, reportNumber].filter(Boolean).join(' ');
  const finding = {
    key: `compare:${item.id}:thickness:${reportIndex}:${orderIndex}`,
    source: `量规 / ${reportSource} / ${range.title}`,
    text: `量规实测 · ${reading}；报告厚度 · ${report.value}；送检范围 · ${range.value}`,
  };
  if (inspection?.measured !== true) {
    const measurement = sampleFinding(item.sample, { measured: true });
    const oldComparison = { ...finding, source: `量规 / ${report.title} / ${range.title}` };
    const recorded = [measurement, finding, oldComparison].some(({ key, source, text }) =>
      findings.some((entry) => entry?.key === key && entry.source === source && entry.text === text));
    if (!recorded) return null;
  }
  return {
    rows: [{ title: '量规', field: '实测', value: reading }, { ...report, title: reportSource }, range],
    finding,
  };
}

function relabelPair(id, registerIndex, paperIndex, side, left, right) {
  return {
    side,
    paperIndex,
    registerField: side === 'original' ? right : left,
    left,
    right,
    finding: {
      key: `compare:${id}:relabel:${registerIndex}:${paperIndex}:${side}`,
      source: `${left.title} / ${right.title}`,
      text: `${left.field} · ${left.value}；${right.field} · ${right.value}`,
    },
  };
}

export function relabelComparison(item, registerIndex) {
  const register = documentAt(item, registerIndex, 'archive');
  if (!register) return null;
  const reportIndex = uniqueDocumentIndex(item.documents, 'report');
  const labelIndex = uniqueDocumentIndex(item.documents, 'label');
  const original = numberedField(register, '原箱批号');
  const current = numberedField(register, '现箱批号');
  const reportBatch = numberedField(item.documents[reportIndex], '批号');
  const labelBatch = numberedField(item.documents[labelIndex], '批号');
  if (!original || !current || !reportBatch || !labelBatch) return null;
  return {
    registerIndex,
    reportIndex,
    labelIndex,
    pairs: [
      relabelPair(item.id, registerIndex, reportIndex, 'original', reportBatch, original),
      relabelPair(item.id, registerIndex, labelIndex, 'current', current, labelBatch),
    ],
  };
}

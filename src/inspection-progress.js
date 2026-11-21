import { normalizeFindings } from './inspection-findings.js';
import { intakeComparison, relabelComparison, thicknessComparison } from './document-comparison.js';
import { DAYS, EASTER_EGGS, documentExtension } from './content.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const phoneCases = new Map(DAYS.flatMap(({ cases }) => cases.map((item) => [item.id, item])));

function legacyPinIndex(item) {
  const { id, documents } = item;
  let index = -1;
  if (id === 5 || id === 10) index = documents.findIndex(({ type }) => type === 'order');
  if (id === 11) index = documents.findIndex(({ fields }) => fields.some((field) => documentExtension(field) === '107'));
  return documentIndex(index, documents.length);
}

function carryProgress(carry, seen = null) {
  const seenIds = seen === null ? null : new Set(Array.isArray(seen) ? seen : []);
  const pins = Array.isArray(carry?.pinned) ? carry.pinned : [];
  const pinnedByPaper = new Map();
  for (const pin of pins) {
    const legacy = Number.isInteger(pin);
    const id = legacy ? pin : pin?.id;
    const item = phoneCases.get(id);
    if (!item || (seenIds && !seenIds.has(id))) continue;
    const index = legacy ? legacyPinIndex(item) : pin.index;
    if (index !== null && documentIndex(index, item.documents.length) === null) continue;
    const key = `${id}:${index}`;
    pinnedByPaper.delete(key);
    pinnedByPaper.set(key, { id, index });
  }
  const pinned = [...pinnedByPaper.values()].slice(-2);
  const phoneNumber = typeof carry?.phoneNumber === 'string' && /^\d{0,5}$/.test(carry.phoneNumber) ? carry.phoneNumber : '';
  return { pinned, phoneNumber };
}

function caseProgress(item, progress) {
  const positions = {};
  const documentCount = Array.isArray(item?.documents) ? item.documents.length : 0;
  for (let index = 0; index < documentCount; index++) {
    const offset = progress?.positions?.[index];
    if (Number.isFinite(offset?.x) && Number.isFinite(offset?.y)) {
      positions[index] = { x: clamp(offset.x, -90, 90), y: clamp(offset.y, -35, 40) };
    }
  }
  const inspection = progress?.inspection;
  return {
    note: typeof progress?.note === 'string' ? progress.note.slice(0, 100) : '',
    findings: normalizeFindings(progress?.findings),
    positions,
    inspection: {
      back: inspection?.back === true,
      film: inspection?.film === true,
      clasp: inspection?.clasp === true,
      tug: inspection?.tug === true,
      measured: inspection?.measured === true,
      unpacked: inspection?.unpacked === true,
      ...(item?.sample?.reading && inspection?.gaugeLoaded === true ? { gaugeLoaded: true } : {}),
    },
    labelSeen: item?.id === 1 && progress?.labelSeen === true,
    signed: progress?.signed === true,
    orderSeen: progress?.orderSeen === true,
    filmChecked: item?.id === 2 && (progress?.filmChecked === true || inspection?.film === true),
    benchFindingsOpen: progress?.benchFindingsOpen === true,
    ...(item?.carton && progress?.cartonBottom === true ? { cartonBottom: true } : {}),
    ...(item && progress?.phoneBottom === true ? { phoneBottom: true } : {}),
  };
}

export function tutorialActionComplete(key, interaction, item) {
  switch (key) {
    case 'label': return interaction?.labelSeen === true;
    case 'report': return ['label', 'report'].every((type) => {
      const index = item?.documents?.findIndex((doc) => doc.type === type);
      const field = item?.documents?.[index]?.fields?.findIndex(([name]) => name === '批号');
      return field >= 0 && interaction?.findings?.some(({ key }) => key === `doc:${index}:${field}`);
    });
    case 'signature': return interaction?.signed === true && interaction?.orderSeen === true;
    case 'sample': return interaction?.inspection?.tug === true;
    default: return false;
  }
}

function documentIndex(value, count) {
  return Number.isInteger(value) && Number.isInteger(count) && value >= 0 && value < count ? value : null;
}

function hasRecordedSignature(item, findings) {
  const report = item.documents?.findIndex(({ type }) => type === 'report') ?? -1;
  const fields = item.documents?.[report]?.fields;
  const signature = fields?.findIndex(([label]) => label === '签发') ?? -1;
  if (signature < 0) return false;
  const value = fields[signature].join(' · ');
  return findings.some(({ key, text }) => key === `doc:${report}:${signature}` && text === value);
}

function workspaceProgress(item, work, inspection, context = {}) {
  const { prior, guided } = context;
  const panel = work?.panel;
  if (!['docs', 'sample', 'phone', 'carton'].includes(panel)) return null;
  const scrollTop = Number.isFinite(work.scrollTop) ? Math.max(0, work.scrollTop) : 0;
  const workspace = { panel, scrollTop };
  if (panel === 'carton') return item.carton ? workspace : null;
  if (panel === 'phone') {
    const source = work.returnTo;
    if (['docs', 'sample'].includes(source?.panel)) {
      const origin = workspaceProgress(item, source, inspection, context);
      if (origin) workspace.returnTo = origin;
    } else if (source?.panel === 'archive' && Number.isInteger(source.archiveFocus) && context.seen?.includes(source.archiveFocus)) {
      workspace.returnTo = {
        panel: 'archive', archiveFocus: source.archiveFocus,
        archiveQuery: typeof source.archiveQuery === 'string' ? source.archiveQuery : '',
        scrollTop: Number.isFinite(source.scrollTop) ? Math.max(0, source.scrollTop) : 0,
        ...(typeof source.reportIndex === 'string' && /^R-\d{3}$/.test(source.reportIndex) ? { reportIndex: source.reportIndex } : {}),
      };
    }
    return workspace;
  }
  if (panel === 'sample' && !item.sample) return null;

  const count = Array.isArray(item.documents) ? item.documents.length : 0;
  const doc = documentIndex(work.doc, count);
  if (panel === 'docs' && doc === null) return null;
  const returnToDocs = panel === 'sample' && !guided && doc !== null && work.returnToDocs === true;
  workspace.showFindings = work.showFindings === true;

  if (panel === 'docs' || returnToDocs) {
    const compare = documentIndex(work.compare, count);
    workspace.doc = doc;
    workspace.compare = compare === doc ? null : compare;
    if (!guided && intakeComparison(item, work.deliveryCheck)) workspace.deliveryCheck = work.deliveryCheck;
    if (panel === 'docs' && !guided && EASTER_EGGS.cat.slots.includes(item.id) && work.clipboardBack === true) {
      workspace.clipboardBack = true;
    }
    if (!guided && count === 3 && work.spreadAll === true) workspace.spreadAll = true;

    const previousDoc = documentIndex(work.previousDoc, prior?.documentCount);
    const previousCurrentDoc = documentIndex(work.previousCurrentDoc, count);
    if (!guided && Number.isInteger(prior?.id) && prior.id > 0 && work.priorId === prior.id &&
        previousDoc !== null && previousCurrentDoc !== null) {
      Object.assign(workspace, { priorId: prior.id, previousDoc, previousCurrentDoc });
    }
    if (panel === 'docs' && !guided && workspace.deliveryCheck === undefined && workspace.previousDoc === undefined &&
        relabelComparison(item, work.relabelCheck)) {
      workspace.relabelCheck = work.relabelCheck;
    }
  }

  if (panel === 'sample') {
    workspace.referenceDoc = guided ? null : documentIndex(work.referenceDoc, count);
    workspace.returnToDocs = returnToDocs;
    if (!guided && work.thicknessOpen === true && thicknessComparison(item, inspection)) {
      workspace.thicknessOpen = true;
    }
  }
  return workspace;
}

export function freshInteraction(carry = {}) {
  return {
    ...caseProgress(null, null),
    doc: 0,
    compare: null,
    deliveryCheck: null,
    relabelCheck: null,
    clipboardBack: false,
    spreadAll: false,
    previousDoc: null,
    previousCurrentDoc: null,
    referenceDoc: null,
    returnToDocs: false,
    thicknessOpen: false,
    archiveFocus: null,
    archiveQuery: '',
    showFindings: false,
    ...carryProgress(carry),
    egg: null,
  };
}

export function captureInspectionProgress(item, interaction, context = {}) {
  const caseId = Number.isInteger(item?.id) && item.id > 0 ? item.id : null;
  const progress = {
    caseId,
    ...caseProgress(item, caseId === null ? null : interaction),
    ...carryProgress(interaction, context?.seen),
  };
  if (caseId !== null && context?.panel) {
    const workspace = workspaceProgress(item, {
      ...interaction,
      panel: context.panel,
      scrollTop: context.scrollTop,
      priorId: context.prior?.id,
      returnTo: context.returnTo && { ...interaction, ...context.returnTo, priorId: context.prior?.id },
    }, progress.inspection, context);
    if (workspace) progress.workspace = workspace;
  }
  return progress;
}

export function restoreInspectionProgress(progress, item, seen = [], context) {
  const interaction = { ...freshInteraction(), ...carryProgress(progress, seen ?? []) };
  const caseId = progress?.caseId;
  if (!Number.isInteger(caseId) || caseId < 1 || item?.id !== caseId) return interaction;
  const restored = { ...interaction, ...caseProgress(item, progress) };
  if (item.id === 1 && !restored.signed && hasRecordedSignature(item, restored.findings)) {
    restored.signed = true;
  }
  const workspace = context ? workspaceProgress(item, progress.workspace, restored.inspection, { ...context, seen }) : null;
  if (!workspace) return restored;
  const { panel, scrollTop, priorId: _priorId, returnTo, ...fields } = workspace;
  if (!returnTo) return { ...restored, ...fields, workspace: { panel, scrollTop } };
  const { panel: origin, scrollTop: originScroll, priorId: _originPrior, ...originFields } = returnTo;
  if (origin === 'archive') return { ...restored, ...fields, workspace: { panel, scrollTop, returnTo } };
  return { ...restored, ...originFields, ...fields, workspace: { panel, scrollTop, returnTo: { panel: origin, scrollTop: originScroll } } };
}
